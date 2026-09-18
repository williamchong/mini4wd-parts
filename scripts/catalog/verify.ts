import { existsSync } from 'node:fs'
import type { TypeOf, ZodTypeAny } from 'zod'
import { readYamlDir } from './io.ts'
import { thumbnailFile } from './thumbnails.ts'
import { thumbnailPath, type ThumbCollection, type ThumbVariant } from '../../shared/catalog/thumbnails.ts'
import { partSchema, chassisSchema, kitSchema } from '../../shared/catalog/schema.ts'
import type { Chassis, Loadout, Slot } from '../../shared/catalog/schema.ts'
import { newBuild, partsForSlot, resolveBuild } from '../../shared/catalog/build.ts'
import { checkBuild } from '../../shared/catalog/rules.ts'
import { bodyForKit, bodyProblems, loadBodies, silhouetteOf } from './bodies.ts'
import { entryShapeId, TIRES, WHEELS } from '../../shared/scene/wheels.ts'
import { printedTireMm } from './wheels.ts'
import { FITTING_CATEGORIES } from './fittings.ts'
import { FITTING_TABLES } from '../../shared/scene/fittings.ts'
import { readJsonFile } from './io.ts'
import { ROOT } from './fetch.ts'
import { join } from 'node:path'

/**
 * Validates the committed catalog on its own, without Nuxt. `nuxt generate`
 * applies the same schemas via content.config.ts, but this fails in a second
 * and points at the offending file.
 */

const errors: string[] = []

// Parameterised by the schema rather than its output type: `.default()` makes a
// collection's input and output types differ, which a plain ZodType<T> rejects.
function load<S extends ZodTypeAny>(dir: string, schema: S): TypeOf<S>[] {
  const records: TypeOf<S>[] = []
  for (const { name, data } of readYamlDir<unknown>(`content/${dir}`)) {
    const result = schema.safeParse(data)
    if (!result.success) {
      for (const issue of result.error.issues) {
        errors.push(`${dir}/${name}: ${issue.path.join('.')} ${issue.message}`)
      }
      continue
    }
    records.push(result.data)
  }
  return records
}

const parts = load('parts', partSchema)
const chassis = load('chassis', chassisSchema)
const kits = load('kits', kitSchema)

const partSlots = new Map<string, Slot[]>()
for (const part of parts) {
  if (partSlots.has(part.id)) errors.push(`duplicate part id ${part.id}`)
  partSlots.set(part.id, part.slots)
}

/**
 * A loadout names slots by the chassis' slot *id* (`axle`, `gear-set`), while a
 * part declares the slot *types* it fits (`shaft`, `gear`). Resolving one to
 * the other through the chassis profile is the whole point of this check —
 * comparing the two directly would let almost anything through.
 */
const WHEEL_SLOTS: ReadonlySet<Slot> = new Set(['wheel-front', 'wheel-rear'])
const TIRE_SLOTS: ReadonlySet<Slot> = new Set(['tire-front', 'tire-rear'])

function checkLoadout(label: string, entries: Loadout, host: Chassis) {
  const typeOf = new Map(host.slots.map(slot => [slot.id, slot.type]))

  for (const [slotId, filled] of Object.entries(entries)) {
    const type = typeOf.get(slotId)
    if (!type) {
      errors.push(`${label}: "${slotId}" is not a slot on the ${host.id} chassis`)
      continue
    }
    for (const entry of filled) {
      // What the pane will draw for a wheel or tire nobody sells: the entry's
      // own shape on a chassis default, else the kit's phrase slugged. A
      // phrase with no row would silently fall back to the default wheel on
      // every kit that ships it, which is exactly what nobody would notice.
      const table = WHEEL_SLOTS.has(type) ? WHEELS : TIRE_SLOTS.has(type) ? TIRES : undefined
      if (table && !entry.partId) {
        const shape = entryShapeId(entry)
        if (!shape) errors.push(`${label}: ${slotId} names no shape for the 3D pane`)
        else if (!Object.hasOwn(table, shape)) errors.push(`${label}: ${slotId} draws "${shape}", which shared/scene/wheels.ts does not define`)
      }
      if (!entry.partId) continue
      const slots = partSlots.get(entry.partId)
      if (!slots) {
        errors.push(`${label}: ${slotId} names part ${entry.partId}, which is not in the catalog`)
      }
      else if (!slots.includes(type)) {
        errors.push(`${label}: part ${entry.partId} in ${slotId} does not fit a ${type} slot`)
      }
    }
  }
}

/**
 * A `thumbnail` must name a file that is actually there. The field is written
 * from the directory listing (scripts/catalog/generate.ts), so a mismatch means
 * the two have drifted — a thumbnail deleted by hand, say, or a record edited
 * in content/ where nothing may be hand-edited. A broken picture would
 * otherwise only show up in a browser.
 */
function checkThumbnail(
  collection: ThumbCollection,
  id: string,
  thumbnail?: string,
  variant: ThumbVariant = 'row'
) {
  if (!thumbnail) return
  const expected = thumbnailPath(collection, id, variant)
  if (thumbnail !== expected) {
    errors.push(`${collection}/${id}: thumbnail is "${thumbnail}", expected "${expected}"`)
  }
  else if (!existsSync(thumbnailFile(collection, id, variant))) {
    errors.push(`${collection}/${id}: thumbnail ${thumbnail} does not exist — run npm run catalog:thumbs`)
  }
}

for (const part of parts) {
  checkThumbnail('parts', part.id, part.thumbnail)
  checkThumbnail('parts', part.id, part.detailThumbnail, 'detail')
}

/**
 * A stock build, bare chassis or kit, must raise no rule-engine error in Open:
 * a red finding on a car nobody has touched blames the reader for our data. A
 * loadout override naming a part Tamiya does not list for that chassis is the
 * usual way in, and failing here keeps it off the site (docs/PLAN.md §6 M1b).
 */
const partsById = new Map(parts.map(part => [part.id, part]))

function checkStock(label: string, host: Chassis, kit?: (typeof kits)[number]) {
  const slots = resolveBuild(host, kit, newBuild(host.id, kit?.id))
  for (const finding of checkBuild({ slots, chassis: host, partsById, buildClass: 'open' })) {
    if (finding.severity !== 'error') continue
    errors.push(`${label}: stock build fails ${finding.rule} on ${finding.slotId}${finding.partId ? ` (part ${finding.partId})` : ''}`)
  }
}

/**
 * An `addOn` pattern in data/taxonomy/categories.yml that is too broad would
 * push a whole picker below the fold of its own divider. Every slot that offers
 * anything must offer at least one part that is not an add-on.
 */
function checkAddOns(host: Chassis) {
  for (const slot of host.slots) {
    const candidates = partsForSlot(parts, slot.type, host, 'open')
    if (candidates.length && candidates.every(({ part }) => part.isAddOn)) {
      errors.push(`chassis/${host.id}: every part for ${slot.id} is an add-on — check the addOn pattern in data/taxonomy/categories.yml`)
    }
  }
}

const chassisById = new Map(chassis.map(entry => [entry.id, entry]))

for (const entry of chassis) {
  const missing = entry.compatibleParts.filter(id => !partSlots.has(id))
  if (missing.length) {
    errors.push(`chassis/${entry.id}: ${missing.length} compatibleParts not in the catalog (${missing.slice(0, 3).join(', ')}…)`)
  }
  checkLoadout(`chassis/${entry.id} defaultLoadout`, entry.defaultLoadout, entry)
  checkThumbnail('chassis', entry.id, entry.thumbnail)
  checkThumbnail('chassis', entry.id, entry.detailThumbnail, 'detail')
  checkStock(`chassis/${entry.id}`, entry)
  checkAddOns(entry)
}

const kitIds = new Set<string>()
for (const kit of kits) {
  if (kitIds.has(kit.id)) errors.push(`duplicate kit id ${kit.id}`)
  kitIds.add(kit.id)

  const host = chassisById.get(kit.chassis)
  if (!host) {
    errors.push(`kits/${kit.id}: chassis ${kit.chassis} has no record`)
    continue
  }
  checkLoadout(`kits/${kit.id} stockLoadout`, kit.stockLoadout, host)
  checkThumbnail('kits', kit.id, kit.thumbnail)
  checkStock(`kits/${kit.id}`, host, kit)
}

/**
 * Bodies (docs/PLAN.md §5.6): every id a kit or part names is authored, every
 * kit and part a body lists exists, every article it matches reaches a kit,
 * content/bodies is what data/bodies generates, and each shell is outward,
 * inside the regulation envelope and in line with its kits' printed size.
 */
const bodies = loadBodies()
errors.push(...bodies.errors)
for (const kit of kits) {
  if (kit.body !== bodyForKit(bodies, kit)) errors.push(`kits/${kit.id}: body is ${kit.body ?? 'unset'}, data/bodies says ${bodyForKit(bodies, kit) ?? 'none'} — run npm run catalog:generate`)
}
for (const part of parts) {
  if (part.body !== bodies.byPart.get(part.id)) errors.push(`parts/${part.id}: body is ${part.body ?? 'unset'}, data/bodies says ${bodies.byPart.get(part.id) ?? 'none'} — run npm run catalog:generate`)
}
const kitsById = new Map(kits.map(kit => [kit.id, kit]))
const titles = new Set(kits.map(kit => kit.loadoutSourceTitle))
for (const [id, body] of bodies.byId) {
  const label = `bodies/${id}`
  if (!kitsById.has(body.reference)) errors.push(`${label}: reference kit ${body.reference} is not in the catalog`)
  for (const kit of body.kits) if (!kitsById.has(kit)) errors.push(`${label}: kit ${kit} is not in the catalog`)
  for (const part of body.parts) if (!partsById.get(part)?.category.startsWith('body')) errors.push(`${label}: part ${part} is not a body in the catalog`)
  for (const title of body.titles) if (!titles.has(title)) errors.push(`${label}: no kit's loadout comes from the article "${title}"`)
  if (!existsSync(join(ROOT, `content/bodies/${id}.json`)) || JSON.stringify(readJsonFile(`content/bodies/${id}.json`)) !== JSON.stringify(silhouetteOf(body))) {
    errors.push(`${label}: content/bodies/${id}.json is stale — run npm run catalog:generate`)
  }
  const drawnBy = kits.filter(kit => kit.body === id)
  for (const problem of bodyProblems(silhouetteOf(body), drawnBy)) errors.push(`${label}: ${problem}`)
}

/**
 * Wheels and tires (docs/PLAN.md §5.6): every shape a part names is defined,
 * and every tire it draws is inside the 22-35 mm the regulations allow — the
 * one rule §4.3 lists as unchecked for want of data, now that the shape a name
 * resolves to is where `tireDiameterMm` comes from.
 */
for (const part of parts) {
  const label = `parts/${part.id}`
  if (part.wheel && !Object.hasOwn(WHEELS, part.wheel)) errors.push(`${label}: wheel "${part.wheel}" is not in shared/scene/wheels.ts`)
  if (part.tire && !Object.hasOwn(TIRES, part.tire)) errors.push(`${label}: tire "${part.tire}" is not in shared/scene/wheels.ts`)
  const diameter = part.specs.tireDiameterMm
  // A wheel records the tire it fits rather than one it draws.
  const tire = part.tire ?? `tire for ${part.wheel}`
  if (diameter !== undefined && (diameter < 22 || diameter > 35)) {
    errors.push(`${label}: ${tire} is ⌀${diameter}, outside the 22-35 mm regulation envelope`)
  }
  // Only on a part that draws a wheel or a tire: plenty of other names print
  // millimetres, and they are roller and stay sizes rather than a tire's. On a
  // wheel they are the tire it fits, which is what its diameter records.
  const printed = part.tire || part.wheel ? printedTireMm(part.names.en ?? part.names.ja) : undefined
  if (printed !== undefined && diameter !== printed) {
    errors.push(`${label}: Tamiya's name says ⌀${printed}, the ${tire} shape says ⌀${diameter ?? 'nothing'}`)
  }
}

/**
 * Rollers, plates, dampers, brakes and the hidden fittings (docs/PLAN.md §5.6,
 * "The rest of the parts"): every `fitting` a part names is a row the pane can
 * draw, and every part a chassis can be fitted with names one, so a name the
 * reader in scripts/catalog/fittings.ts no longer understands fails here
 * rather than quietly drawing its socket's default.
 */
for (const part of parts) {
  const label = `parts/${part.id}`
  const tables = part.slots.map(slot => FITTING_TABLES[slot]).filter(Boolean)
  if (part.fitting && !tables.some(table => Object.hasOwn(table!, part.fitting!))) {
    errors.push(`${label}: fitting "${part.fitting}" is not a row of the shared/scene/fittings.ts table any of its slots (${part.slots.join(', ')}) draws from`)
  }
  const offered = part.chassisCompat.include.length > 0 && !part.slots.includes('none')
  if (!part.fitting && offered && FITTING_CATEGORIES.has(part.category) && part.category !== 'other') {
    errors.push(`${label}: a ${part.category} with no fitting row — teach scripts/catalog/fittings.ts its name`)
  }
}

if (errors.length) {
  console.error(`Catalog invalid — ${errors.length} problem(s):`)
  for (const error of errors) console.error(`  ${error}`)
  process.exit(1)
}

console.log(`Catalog OK: ${parts.length} parts, ${chassis.length} chassis, ${kits.length} kits, `
  + `${bodies.byId.size} bodies drawn by ${kits.filter(kit => kit.body).length} kits`)
