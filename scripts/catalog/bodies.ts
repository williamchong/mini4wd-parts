import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { ROOT } from './fetch.ts'
import { readYamlDir } from './io.ts'
import { bodySchema } from '../../shared/catalog/schema.ts'
import type { BodySource, Kit } from '../../shared/catalog/schema.ts'
import { bodyGeometry } from '../../shared/scene/generators/body.ts'
import type { Silhouette } from '../../shared/scene/generators/body.ts'
import { BODY_Y } from '../../shared/scene/sockets.ts'

/**
 * The authored body shells, data/bodies/<id>.yml (docs/PLAN.md §5.6), and the
 * two lookups that attach them: a kit by the wiki article its loadout came
 * from, or by item number where a body lists it — which wins, so a kit whose
 * article covers two different shells can be pointed at the right one.
 */
export type Bodies = {
  byId: Map<string, BodySource>
  byTitle: Map<string, string>
  byKit: Map<string, string>
  byPart: Map<string, string>
  errors: string[]
}

export function loadBodies(): Bodies {
  const bodies: Bodies = { byId: new Map(), byTitle: new Map(), byKit: new Map(), byPart: new Map(), errors: [] }
  const claim = (map: Map<string, string>, key: string, id: string, what: string) => {
    const other = map.get(key)
    if (other && other !== id) bodies.errors.push(`bodies/${id}: ${what} ${key} is already ${other}'s`)
    map.set(key, id)
  }
  for (const { name, data } of readYamlDir<unknown>('data/bodies')) {
    const id = name.slice(0, -'.yml'.length)
    const result = bodySchema.safeParse(data)
    if (!result.success) {
      for (const issue of result.error.issues) bodies.errors.push(`bodies/${name}: ${issue.path.join('.')} ${issue.message}`)
      continue
    }
    bodies.byId.set(id, result.data)
    for (const title of result.data.titles) claim(bodies.byTitle, title, id, 'title')
    for (const kit of result.data.kits) claim(bodies.byKit, kit, id, 'kit')
    for (const part of result.data.parts) claim(bodies.byPart, part, id, 'part')
  }
  return bodies
}

/** The body a kit draws: listed by item number, else matched by its article. */
export const bodyForKit = (bodies: Bodies, kit: { id: string; loadoutSourceTitle?: string }) =>
  bodies.byKit.get(kit.id) ?? (kit.loadoutSourceTitle ? bodies.byTitle.get(kit.loadoutSourceTitle) : undefined)

/** Just the shape, as the scene loads it: everything that says which kits draw it stays behind. */
export function silhouetteOf({ name: _name, reference: _reference, titles: _titles, kits: _kits, parts: _parts, ...shape }: BodySource) {
  return shape
}

/** content/bodies/<id>.json, one per body, stale files removed. */
export async function writeBodies(bodies: Bodies) {
  const target = join(ROOT, 'content/bodies')
  await mkdir(target, { recursive: true })
  const names = new Set([...bodies.byId.keys()].map(id => `${id}.json`))
  const stale = (await readdir(target)).filter(name => name.endsWith('.json') && !names.has(name))
  await Promise.all(stale.map(name => rm(join(target, name))))
  await Promise.all([...bodies.byId].map(([id, body]) =>
    writeFile(join(target, `${id}.json`), `${JSON.stringify(silhouetteOf(body))}\n`, 'utf8')))
}

/** 全長, 全幅 and 全高 as Tamiya prints them in a kit's specs, where it does (272 of 305 kits). */
export function printedSize(kit: Pick<Kit, 'specsRaw'> | undefined) {
  const text = kit?.specsRaw ?? ''
  const read = (label: string) => Number(new RegExp(`${label}\\s*([\\d.]+)\\s*mm`).exec(text)?.[1]) || undefined
  return { length: read('全長'), width: read('全幅'), height: read('全高') }
}

/**
 * How far a shell's roof may sit from the height Tamiya prints. The printed
 * figure is the whole car on its stock tires, antenna and wing included, so
 * this is a bound for a typo, not a measurement.
 */
export const ROOF_TOLERANCE_MM = 10

/** The shell as it sits on the car: extents in the chassis' frame, and whether it winds outward. */
export function measure(silhouette: Silhouette) {
  const geometry = bodyGeometry(silhouette)
  const p = geometry.getAttribute('position').array
  let volume = 0
  for (let i = 0; i < p.length; i += 9) {
    const [ax, ay, az, bx, by, bz, cx, cy, cz] = [p[i]!, p[i + 1]!, p[i + 2]!, p[i + 3]!, p[i + 4]!, p[i + 5]!, p[i + 6]!, p[i + 7]!, p[i + 8]!]
    volume += (ax * (by * cz - bz * cy) - ay * (bx * cz - bz * cx) + az * (bx * cy - by * cx)) / 6
  }
  geometry.computeBoundingBox()
  const box = geometry.boundingBox!
  geometry.dispose()
  return {
    volume,
    length: box.max.z - box.min.z,
    halfLength: Math.max(-box.min.z, box.max.z),
    halfWidth: Math.max(-box.min.x, box.max.x),
    roof: box.max.y + BODY_Y,
    triangles: p.length / 9
  }
}

/**
 * What is wrong with a shell, if anything: inside out, outside the regulation
 * envelope (105 wide, 165 long, 70 high, docs/PLAN.md §2), or out of line
 * with the size Tamiya prints for a kit that draws it.
 */
export function bodyProblems(silhouette: Silhouette, kits: readonly Pick<Kit, 'id' | 'specsRaw'>[]): string[] {
  const m = measure(silhouette)
  const problems: string[] = []
  if (m.volume <= 0) problems.push('winds inward')
  if (m.halfWidth > 52.5) problems.push(`is ${(m.halfWidth * 2).toFixed(0)} mm wide, over the 105 mm envelope`)
  if (m.halfLength > 82.5) problems.push(`reaches ${m.halfLength.toFixed(0)} mm from centre, over the 165 mm envelope`)
  if (m.roof > 70) problems.push(`roof at ${m.roof.toFixed(0)} mm, over the 70 mm envelope`)
  for (const kit of kits) {
    const printed = printedSize(kit)
    if (printed.length && m.length > printed.length) problems.push(`is ${m.length.toFixed(0)} mm long, longer than kit ${kit.id}'s printed ${printed.length}`)
    if (printed.width && m.halfWidth * 2 > printed.width) problems.push(`is ${(m.halfWidth * 2).toFixed(0)} mm wide, wider than kit ${kit.id}'s printed ${printed.width}`)
    if (printed.height && Math.abs(m.roof - printed.height) > ROOF_TOLERANCE_MM) {
      problems.push(`roof at ${m.roof.toFixed(0)} mm, more than ${ROOF_TOLERANCE_MM} from kit ${kit.id}'s printed ${printed.height}`)
    }
  }
  return problems
}
