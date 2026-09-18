import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import sharp from 'sharp'
import type { OverlayOptions } from 'sharp'
import type { BufferGeometry } from 'three'
import { fetchBytes, ROOT } from './fetch.ts'
import { readYamlDir } from './io.ts'
import { bodyForKit, loadBodies, printedSize, silhouetteOf } from './bodies.ts'
import { DEFAULT_TIRE, DEFAULT_WHEEL, entryShapeId, TIRES, WHEELS } from '../../shared/scene/wheels.ts'
import type { Bodies } from './bodies.ts'
import { CHASSIS_IDS } from '../../shared/catalog/chassis.ts'
import type { ChassisId } from '../../shared/catalog/chassis.ts'
import type { Kit } from '../../shared/catalog/schema.ts'
import { DEFAULT_SILHOUETTE } from '../../shared/scene/bodies.ts'
import { bodyGeometry } from '../../shared/scene/generators/body.ts'
import { chassisPieces } from '../../shared/scene/generators/chassis.ts'
import * as generators from '../../shared/scene/generators/parts.ts'
import { BODY_Y, socketsFor } from '../../shared/scene/sockets.ts'

/**
 * The body authoring loop's eyes (docs/PLAN.md §5.6, phase 2): every body drawn
 * on its reference kit's chassis beside that kit's box art, as one PNG per
 * body, and a contact sheet per chassis for the owner to scan. Nothing here is
 * committed or shipped — it all lands under .cache/bodies/.
 *
 *   node scripts/catalog/body-sheet.ts                 every body, and the sheets
 *   node scripts/catalog/body-sheet.ts --only=avante-mk3,blast-arrow
 *   node scripts/catalog/body-sheet.ts --todo          the cars still on the wedge, in authoring order
 *   node scripts/catalog/body-sheet.ts --art=18635,19446   fetch box art to read before authoring
 *
 * The box art is fetched once through the scraper's throttled, disk-cached
 * fetch and never leaves .cache (§3.3). The render is a flat-shaded painter's
 * projection written as SVG and rasterised by sharp: no browser, so a body
 * renders in well under a second and an authoring agent can read the PNG.
 */

const { values } = parseArgs({
  options: {
    only: { type: 'string' },
    todo: { type: 'boolean', default: false },
    art: { type: 'string' }
  }
})

const OUT = join(ROOT, '.cache/bodies')
const PANEL = { w: 600, h: 450 }

const kits = readYamlDir<Kit>('content/kits').map(({ data }) => data)
const kitsById = new Map(kits.map(kit => [kit.id, kit]))
const bodies = loadBodies()
if (bodies.errors.length) {
  for (const error of bodies.errors) console.error(error)
  process.exit(1)
}

/** The box art as a local file, fetched once. */
async function artFile(kitId: string): Promise<string | undefined> {
  const kit = kitsById.get(kitId)
  if (!kit?.officialImage) return undefined
  const file = join(OUT, 'art', `${kitId}.jpg`)
  await mkdir(join(OUT, 'art'), { recursive: true })
  const bytes = await fetchBytes(kit.officialImage)
  await writeFile(file, bytes)
  return file
}

// --- Rendering --------------------------------------------------------------

type Vec = [number, number, number]
type Tri = { points: [Vec, Vec, Vec]; colour: number }

const sub = (a: Vec, b: Vec): Vec => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const dot = (a: Vec, b: Vec) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
const cross = (a: Vec, b: Vec): Vec => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: Vec): Vec => {
  const l = Math.hypot(...a) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

function trianglesOf(geometry: BufferGeometry, colour: number, [ox, oy, oz]: Vec, turn = 0): Tri[] {
  const array = geometry.getAttribute('position').array
  const out: Tri[] = []
  const c = Math.cos(turn)
  const s = Math.sin(turn)
  const place = (i: number): Vec => {
    const x = array[i]!
    const z = array[i + 2]!
    return [x * c + z * s + ox, array[i + 1]! + oy, -x * s + z * c + oz]
  }
  for (let i = 0; i < array.length; i += 9) out.push({ points: [place(i), place(i + 3), place(i + 6)], colour })
  return out
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`
const colourOf = (value: string | undefined, fallback: number) => value ? Number.parseInt(value.slice(1), 16) : fallback

/**
 * What a kit's stock loadout draws in one of its wheel or tire slots. Through
 * `entryShapeId`, because a kit's entry carries the wiki phrase and not a
 * shape — reading `.shape` alone found nothing on any kit and drew every car
 * on the default wheel.
 */
const shapeOf = (kit: Kit | undefined, slot: string) => entryShapeId(kit?.stockLoadout[slot]?.[0])

/** The car as the pane draws a stock kit: chassis, wheels, tires, rollers and the shell. */
function carTriangles(chassis: ChassisId, geometry: BufferGeometry, kit: Kit | undefined): Tri[] {
  const tris: Tri[] = []
  for (const piece of chassisPieces(chassis)) tris.push(...trianglesOf(piece.geometry, piece.colour, [0, 0, 0]))
  // The kit's own wheels and tires, so the sheet shows the car the pane draws
  // rather than a stand-in: a large-diameter kit sits taller than a small one.
  const wheelShape = WHEELS[shapeOf(kit, 'wheel-front') ?? DEFAULT_WHEEL] ?? WHEELS[DEFAULT_WHEEL]!
  const tireShape = TIRES[shapeOf(kit, 'tire-front') ?? DEFAULT_TIRE] ?? TIRES[DEFAULT_TIRE]!
  const wheel = generators.wheel(wheelShape)
  const tire = generators.tire(tireShape, wheelShape)
  const roller = generators.roller(13)
  for (const socket of socketsFor(chassis)) {
    const at = socket.position as Vec
    if (socket.kind === 'wheel') tris.push(...trianglesOf(wheel, colourOf(kit?.colours?.wheel, 0x3a3d42), at))
    if (socket.kind === 'tire') tris.push(...trianglesOf(tire, colourOf(kit?.colours?.tire, 0x1d1f22), at))
    if (socket.kind === 'roller') tris.push(...trianglesOf(roller, colourOf(kit?.colours?.roller, 0xc9ced6), at))
    if (socket.kind === 'body') tris.push(...trianglesOf(geometry, colourOf(kit?.colours?.body, 0xd8dbe0), at))
  }
  return tris
}

type View = { eye: Vec; target: Vec; ortho?: number; up?: Vec }

/** Painter's algorithm over flat-shaded, back-face-culled triangles, fitted to the panel. */
function svgOf(tris: Tri[], view: View, label: string, guides = false): string {
  const up = view.up ?? [0, 1, 0]
  const forward = norm(sub(view.target, view.eye))
  const right = norm(cross(forward, up))
  const upward = cross(right, forward)
  const light = norm([0.4, 1, 0.7])
  const project = (p: Vec): [number, number, number] => {
    const d = sub(p, view.eye)
    const depth = dot(d, forward)
    const scale = view.ortho ? 1 : 600 / depth
    return [dot(d, right) * scale, -dot(d, upward) * scale, depth]
  }
  const drawn = []
  for (const tri of tris) {
    const [a, b, c] = tri.points
    const normal = norm(cross(sub(b, a), sub(c, a)))
    const centre: Vec = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3]
    const toward = view.ortho ? forward : norm(sub(centre, view.eye))
    if (dot(normal, toward) >= 0) continue
    const shade = 0.45 + 0.55 * Math.max(0, dot(normal, light))
    const colour = [16, 8, 0].map(shift => Math.min(255, Math.round(((tri.colour >> shift) & 0xff) * shade)))
    const projected = [a, b, c].map(project)
    drawn.push({ projected, depth: Math.max(...projected.map(p => p[2])), fill: hex((colour[0]! << 16) | (colour[1]! << 8) | colour[2]!) })
  }
  const xs = drawn.flatMap(d => d.projected.map(p => p[0]))
  const ys = drawn.flatMap(d => d.projected.map(p => p[1]))
  const scale = view.ortho ?? Math.min((PANEL.w - 40) / (Math.max(...xs) - Math.min(...xs)), (PANEL.h - 60) / (Math.max(...ys) - Math.min(...ys)))
  const cx = view.ortho ? 0 : (Math.max(...xs) + Math.min(...xs)) / 2
  const cy = view.ortho ? 0 : (Math.max(...ys) + Math.min(...ys)) / 2
  const sx = (x: number) => PANEL.w / 2 + (x - cx) * scale
  const sy = (y: number) => PANEL.h / 2 + 10 + (y - cy) * scale
  drawn.sort((p, q) => q.depth - p.depth)
  const polygons = drawn.map(d =>
    `<polygon points="${d.projected.map(p => `${sx(p[0]).toFixed(1)},${sy(p[1]).toFixed(1)}`).join(' ')}" fill="${d.fill}" stroke="${d.fill}" stroke-width="0.4"/>`)
  const grid = guides
    ? [-80, -40, 0, 40, 80].map(v => `<line x1="${sx(v)}" y1="30" x2="${sx(v)}" y2="${PANEL.h}" stroke="#c8ccd2" stroke-dasharray="4 4"/>`).join('')
    : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${PANEL.w}" height="${PANEL.h}">`
    + `<rect width="100%" height="100%" fill="#f4f5f7"/>${grid}${polygons.join('')}`
    + `<text x="12" y="22" font-family="sans-serif" font-size="15" fill="#333">${label}</text></svg>`
}

async function renderBody(id: string, silhouette: Parameters<typeof bodyGeometry>[0], referenceKit: string) {
  const kit = kitsById.get(referenceKit)
  const chassis = kit?.chassis ?? 'ma'
  const geometry = bodyGeometry(silhouette)
  const tris = carTriangles(chassis, geometry, kit)
  geometry.computeBoundingBox()
  const box = geometry.boundingBox!
  const printed = printedSize(kit)
  const size = `body ${(box.max.z - box.min.z).toFixed(0)}×${(box.max.x - box.min.x).toFixed(0)} mm, roof ${(box.max.y + BODY_Y).toFixed(0)}`
    + (printed.height ? ` (Tamiya prints ${printed.height})` : '')
    + ` · kit ${printed.length ?? '?'} long, ${printed.width ?? '?'} wide · ${triangleCount(geometry)} tris`

  // Box art is shot from the front left, nose toward the lower left, from a little above.
  const quarter = svgOf(tris, { eye: [150, 80, 190], target: [0, 14, 0] }, `${id} (${chassis})`)
  const side = svgOf(tris, { eye: [300, 20, 0], target: [0, 20, 0], ortho: 2.6 }, size, true)
  const top = svgOf(tris, { eye: [0, 300, 0], target: [0, 0, 0], ortho: 2.3, up: [-1, 0, 0] }, 'top, nose left; guides at the axles (±40) and ±80')

  const panels: OverlayOptions[] = [
    { input: Buffer.from(quarter), left: PANEL.w, top: 0 },
    { input: Buffer.from(side), left: 0, top: PANEL.h },
    { input: Buffer.from(top), left: PANEL.w, top: PANEL.h }
  ]
  const art = await artFile(referenceKit).catch(() => undefined)
  if (art) panels.push({ input: await sharp(art).resize(PANEL.w, PANEL.h, { fit: 'contain', background: '#ffffff' }).toBuffer(), left: 0, top: 0 })
  const file = join(OUT, 'render', `${id}.png`)
  await mkdir(join(OUT, 'render'), { recursive: true })
  await sharp({ create: { width: PANEL.w * 2, height: PANEL.h * 2, channels: 3, background: '#ffffff' } })
    .composite(panels).png().toFile(file)
  return file
}

const triangleCount = (geometry: BufferGeometry) => geometry.getAttribute('position').count / 3

// --- Work lists -------------------------------------------------------------

/** Cars with no body yet, grouped as the pipeline would match them, in the plan's authoring order. */
function todo(bodies: Bodies) {
  const groups = new Map<string, Kit[]>()
  for (const kit of kits) {
    if (bodyForKit(bodies, kit)) continue
    const key = kit.loadoutSourceTitle ?? `(untitled) ${kit.id}`
    groups.set(key, [...groups.get(key) ?? [], kit])
  }
  const order: ChassisId[] = ['ma', 'super-2', 'vs', 'ms', 'ar', 'fm-a', 'vz', 'me']
  return [...groups].map(([title, members]) => ({ title, kits: members, chassis: members[0]!.chassis }))
    .sort((a, b) => order.indexOf(a.chassis) - order.indexOf(b.chassis)
      || b.kits.length - a.kits.length
      || Number(b.kits.some(k => k.status === 'current')) - Number(a.kits.some(k => k.status === 'current'))
      || a.title.localeCompare(b.title))
}

if (values.art) {
  for (const id of values.art.split(',')) console.log(`${id}: ${await artFile(id) ?? 'no official image'}`)
  process.exit(0)
}

if (values.todo) {
  for (const { title, kits: members, chassis } of todo(bodies)) {
    const sizes = members.map(printedSize).find(s => s.length)
    const chassisSet = [...new Set(members.map(k => k.chassis))].join('+')
    console.log(`${chassis.padEnd(8)} ${title} [${chassisSet}] ${members.map(k => `${k.id}${k.status === 'limited' ? '*' : ''}`).join(' ')}`
      + (sizes ? ` · ${sizes.length}×${sizes.width}×${sizes.height}` : ''))
  }
  process.exit(0)
}

const only = values.only?.split(',')
const rendered: { id: string; name: string; chassis: ChassisId; kits: string[] }[] = []
for (const [id, body] of bodies.byId) {
  if (only && !only.includes(id)) continue
  await renderBody(id, silhouetteOf(body), body.reference)
  const members = kits.filter(kit => bodyForKit(bodies, kit) === id).map(kit => kit.id)
  rendered.push({ id, name: body.name, chassis: kitsById.get(body.reference)?.chassis ?? 'ma', kits: members })
  console.log(`  ${id}: .cache/bodies/render/${id}.png (${members.length} kits)`)
}
if (only?.includes('default')) await renderBody('default', DEFAULT_SILHOUETTE, only.find(o => /^\d+$/.test(o)) ?? '18635')

if (!only) {
  const wedges = kits.filter(kit => !bodyForKit(bodies, kit))
  for (const chassis of CHASSIS_IDS) {
    const rows = rendered.filter(r => r.chassis === chassis)
    const left = wedges.filter(kit => kit.chassis === chassis).length
    const html = `<!doctype html><meta charset="utf-8"><title>Bodies: ${chassis}</title>`
      + `<style>body{font:14px sans-serif;margin:16px}figure{margin:0 0 24px}img{width:100%;max-width:1200px}</style>`
      + `<h1>${chassis}: ${rows.length} bodies, ${left} kits still on the wedge</h1>`
      + rows.map(r => `<figure><img src="render/${r.id}.png" loading="lazy"><figcaption><b>${r.name}</b> (${r.id}) · kits ${r.kits.join(' ')}</figcaption></figure>`).join('')
    await writeFile(join(OUT, `sheet-${chassis}.html`), html, 'utf8')
  }
  console.log(`\n${rendered.length} bodies; ${wedges.length} kits still on the wedge; sheets in .cache/bodies/sheet-<chassis>.html`)
}
