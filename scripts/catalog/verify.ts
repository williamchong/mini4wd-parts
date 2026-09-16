import { existsSync } from 'node:fs'
import type { TypeOf, ZodTypeAny } from 'zod'
import { readYamlDir } from './io.ts'
import { thumbnailFile } from './thumbnails.ts'
import { thumbnailPath, type ThumbCollection, type ThumbVariant } from '../../shared/catalog/thumbnails.ts'
import { partSchema, chassisSchema, kitSchema } from '../../shared/catalog/schema.ts'
import type { Chassis, Loadout, Slot } from '../../shared/catalog/schema.ts'
import { newBuild, resolveBuild } from '../../shared/catalog/build.ts'
import { checkBuild } from '../../shared/catalog/rules.ts'

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
function checkLoadout(label: string, entries: Loadout, host: Chassis) {
  const typeOf = new Map(host.slots.map(slot => [slot.id, slot.type]))

  for (const [slotId, filled] of Object.entries(entries)) {
    const type = typeOf.get(slotId)
    if (!type) {
      errors.push(`${label}: "${slotId}" is not a slot on the ${host.id} chassis`)
      continue
    }
    for (const entry of filled) {
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

if (errors.length) {
  console.error(`Catalog invalid — ${errors.length} problem(s):`)
  for (const error of errors) console.error(`  ${error}`)
  process.exit(1)
}

console.log(`Catalog OK: ${parts.length} parts, ${chassis.length} chassis, ${kits.length} kits`)
