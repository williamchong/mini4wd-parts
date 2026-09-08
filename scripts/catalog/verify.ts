import type { TypeOf, ZodTypeAny } from 'zod'
import { readYamlDir } from './io.ts'
import { partSchema, chassisSchema, kitSchema } from '../../shared/catalog/schema.ts'
import type { Chassis, Loadout, Slot } from '../../shared/catalog/schema.ts'

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

const chassisById = new Map(chassis.map(entry => [entry.id, entry]))

for (const entry of chassis) {
  const missing = entry.compatibleParts.filter(id => !partSlots.has(id))
  if (missing.length) {
    errors.push(`chassis/${entry.id}: ${missing.length} compatibleParts not in the catalog (${missing.slice(0, 3).join(', ')}…)`)
  }
  checkLoadout(`chassis/${entry.id} defaultLoadout`, entry.defaultLoadout, entry)
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
}

if (errors.length) {
  console.error(`Catalog invalid — ${errors.length} problem(s):`)
  for (const error of errors) console.error(`  ${error}`)
  process.exit(1)
}

console.log(`Catalog OK: ${parts.length} parts, ${chassis.length} chassis, ${kits.length} kits`)
