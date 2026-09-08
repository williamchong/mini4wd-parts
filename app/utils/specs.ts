/**
 * The specs worth showing for a part, given the slot it is being considered
 * for. A roller's diameter matters when filling a roller slot and tells a
 * beginner nothing anywhere else, so the picker asks for one slot's list rather
 * than printing all fourteen spec fields on every card.
 *
 * `key` names an i18n key under `spec.`. A row whose value is one of the
 * schema's enums carries `valueKey` instead of `value`, because "carbon" and
 * "aluminium" have to be translated while "19mm" does not.
 */
import type { Part, PartSpecs, Slot } from '#shared/catalog/schema'

export type SpecRow = { key: string, value?: string, valueKey?: string }

const mm = (key: string, value: number | undefined) =>
  value === undefined ? undefined : { key, value: `${value}mm` }

const enumRow = (key: string, group: string, value: string | undefined) =>
  value === undefined ? undefined : { key, valueKey: `spec.${group}.${value}` }

/** A min–max pair printed as a range, or as one number when only one is known. */
const range = (key: string, min: number | undefined, max: number | undefined) => {
  if (min === undefined && max === undefined) return undefined
  if (min === undefined || max === undefined) return { key, value: String(min ?? max) }
  return { key, value: min === max ? String(min) : `${min}–${max}` }
}

const roller = (specs: PartSpecs) => [
  mm('rollerDiameter', specs.rollerDiameterMm),
  enumRow('rollerType', 'roller', specs.rollerType)
]

const plate = (specs: PartSpecs) => [
  mm('plateThickness', specs.plateThicknessMm),
  enumRow('plateMaterial', 'material', specs.plateMaterial)
]

const tire = (specs: PartSpecs) => [
  mm('tireDiameter', specs.tireDiameterMm),
  specs.tireHardness === undefined ? undefined : { key: 'tireHardness', value: specs.tireHardness }
]

const wheel = (specs: PartSpecs) => [mm('wheelDiameter', specs.wheelDiameterMm)]

const gear = (specs: PartSpecs) => [
  specs.gearRatio === undefined ? undefined : { key: 'gearRatio', value: specs.gearRatio }
]

/** Spec fields that matter per slot type, most telling first. */
const BY_SLOT: Partial<Record<Slot, (specs: PartSpecs) => (SpecRow | undefined)[]>> = {
  motor: specs => [
    enumRow('motorShaft', 'shaft', specs.motorShaft),
    range('motorRpm', specs.motorRpmMin, specs.motorRpmMax),
    range('motorTorque', specs.motorTorqueMin, specs.motorTorqueMax)
  ],
  'gear': gear,
  'counter-gear': gear,
  'roller-front': roller,
  'roller-rear': roller,
  'roller-side': roller,
  'front-stay': plate,
  'rear-stay': plate,
  'side-stay': plate,
  'wheel-front': wheel,
  'wheel-rear': wheel,
  'tire-front': tire,
  'tire-rear': tire
}

/**
 * Rows for a part in a given slot, plus the two worth knowing whatever the
 * slot: what it weighs and how many come in the packet. A spec the catalog does
 * not have is omitted rather than printed as a dash.
 */
export function specRowsFor(part: Pick<Part, 'specs'>, slotType?: Slot): SpecRow[] {
  const specs = part.specs
  const rows = [
    ...(slotType ? BY_SLOT[slotType]?.(specs) ?? [] : []),
    specs.weightG === undefined ? undefined : { key: 'weight', value: `${specs.weightG}g` },
    specs.pieces === undefined ? undefined : { key: 'pieces', value: String(specs.pieces) }
  ]
  return rows.filter((row): row is SpecRow => row !== undefined)
}
