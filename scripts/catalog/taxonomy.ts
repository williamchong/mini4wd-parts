import { readYamlFile } from './io.ts'
import { PART_CATEGORIES } from '../../shared/catalog/schema.ts'
import type { PartCategory as Category, PartSpecs, Slot } from '../../shared/catalog/schema.ts'
import type { JpItem } from './sources/tamiya-jp.ts'

interface CategoryRule {
  category: Category
  carPart?: boolean
  match?: string[]
  regex?: string
}

const RULES = readYamlFile<CategoryRule[]>('data/taxonomy/categories.yml')

for (const rule of RULES) {
  if (!PART_CATEGORIES.includes(rule.category)) {
    throw new Error(`Unknown category "${rule.category}" in categories.yml`)
  }
}

/**
 * NFKC folds Tamiya's mixed-width text — ㎜→mm, ＆→&, １３→13 — so one keyword
 * matches every spelling. The verbatim name is what we store; this is only for
 * matching and spec extraction.
 */
export const normalise = (value: string) => value.normalize('NFKC')

/** Drop undefined values and empty objects so generated YAML has no dead keys. */
export function compact<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value).filter(([, entry]) => entry !== undefined
      && !(isPlainObject(entry) && Object.keys(entry).length === 0))
  ) as T
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export interface CategoryResult {
  category: Category
  isCarPart: boolean
  matched: boolean
}

export function deriveCategory(item: { nameJa: string, nameEn?: string }): CategoryResult {
  const haystack = `${normalise(item.nameJa)} ${normalise(item.nameEn ?? '')}`
  for (const rule of RULES) {
    const hit = rule.match?.some(keyword => haystack.includes(normalise(keyword)))
      || (rule.regex ? new RegExp(rule.regex).test(haystack) : false)
    if (hit) {
      return { category: rule.category, isCarPart: rule.carPart ?? true, matched: true }
    }
  }
  return { category: 'other', isCarPart: true, matched: false }
}

/** Which builder sockets a category can fill (docs/PLAN.md §4.2). */
const SLOTS_BY_CATEGORY: Record<Category, Slot[]> = {
  'roller': ['roller-front', 'roller-rear', 'roller-side'],
  'plate': ['front-stay', 'rear-stay', 'side-stay'],
  'bumper': ['front-stay', 'rear-stay'],
  'brake': ['brake'],
  'mass-damper': ['damper'],
  'slide-damper': ['damper', 'front-stay', 'rear-stay'],
  'stabilizer': ['damper'],
  'bearing': ['bearing'],
  'gear': ['gear', 'counter-gear'],
  'gear-cover': ['none'],
  'shaft': ['shaft'],
  'wheel': ['wheel-front', 'wheel-rear'],
  'tire': ['tire-front', 'tire-rear'],
  'wheel-tire-set': ['wheel-front', 'wheel-rear', 'tire-front', 'tire-rear'],
  'motor': ['motor'],
  'motor-mount': ['none'],
  'terminal': ['terminal'],
  'switch': ['switch'],
  'battery': ['none'],
  'battery-holder': ['none'],
  'spacer': ['fastener'],
  'screw': ['fastener'],
  'body-catch': ['fastener'],
  'body': ['body'],
  'chassis-set': ['none'],
  'sticker': ['none'],
  'setting-tool': ['none'],
  'tool': ['none'],
  'bundle': ['none'],
  'accessory': ['none'],
  'other': ['none']
}

export const deriveSlots = (category: Category): Slot[] => SLOTS_BY_CATEGORY[category]

type Legality = 'legal' | 'illegal' | 'unknown'

/**
 * Neither Tamiya Stock Class nor B-MAX GP publishes an approved item list —
 * both are rule-based (docs/PLAN.md §3.1), so legality is derived from what
 * kind of part it is. Motors are the exception: Ultra-Dash and Plasma-Dash are
 * banned in Open and only Tune-series motors are legal in Junior, so every
 * motor carries an explicit entry in data/overrides/parts.yml.
 */
export function deriveLegality(category: Category, isCarPart: boolean): {
  open: Legality
  stockBmax: Legality
  junior: Legality
  notes?: string
} {
  if (!isCarPart) {
    return {
      open: 'unknown',
      stockBmax: 'unknown',
      junior: 'unknown',
      notes: '非車體零件，不適用比賽規則'
    }
  }
  if (category === 'motor') {
    return { open: 'unknown', stockBmax: 'unknown', junior: 'unknown', notes: '需個別確認馬達規則' }
  }
  return { open: 'legal', stockBmax: 'legal', junior: 'legal' }
}

const number = (value: string | undefined) => (value === undefined ? undefined : Number(value))

/** Ordered pattern tables, in the same first-match-wins spirit as the category rules. */
const firstMatch = <T>(table: [RegExp, T][], value: string): T | undefined =>
  table.find(([pattern]) => pattern.test(value))?.[1]

const ROLLER_TYPES: [RegExp, NonNullable<PartSpecs['rollerType']>][] = [
  [/ベアリング/, 'bearing'],
  [/アルミ/, 'aluminium'],
  [/プラ|POM|ゴムリング/, 'plastic']
]

const PLATE_MATERIALS: [RegExp, NonNullable<PartSpecs['plateMaterial']>][] = [
  [/カーボン/, 'carbon'],
  [/FRP/i, 'frp'],
  [/アルミ/, 'aluminium']
]

/** Pull the numbers Tamiya prints in names and 【基本スペック】 into typed specs. */
export function deriveSpecs(item: JpItem, category: Category): Partial<PartSpecs> {
  const name = normalise(item.nameJa)
  const spec = normalise(item.specsRaw ?? '')
  const specs: Partial<PartSpecs> = {}

  if (category === 'roller') {
    // "13-12mm オールアルミベアリングローラー" is a stepped roller: only the
    // second number carries the "mm", so read the whole "13-12mm" group and
    // record the largest diameter, which is the one that touches the wall.
    const diameters = [...name.matchAll(/(\d{1,2}(?:\.\d)?(?:\s*-\s*\d{1,2}(?:\.\d)?)*)\s*mm/g)]
      .flatMap(match => match[1]!.split('-').map(part => Number(part.trim())))
    if (diameters.length) specs.rollerDiameterMm = Math.max(...diameters)
    specs.rollerType = firstMatch(ROLLER_TYPES, name)
  }

  if (category === 'plate' || category === 'bumper') {
    specs.plateThicknessMm = number(/\((\d(?:\.\d)?)\s*mm\)/.exec(name)?.[1])
    specs.plateMaterial = firstMatch(PLATE_MATERIALS, name)
  }

  if (category === 'gear') {
    specs.gearRatio = /(\d+(?:\.\d+)?\s*:\s*1)/.exec(name)?.[1]?.replace(/\s/g, '')
  }

  if (category === 'motor') {
    specs.motorShaft = /両軸|PRO/i.test(`${name} ${normalise(item.compatRaw ?? '')}`)
      ? 'double'
      : 'single'
    const rpm = /回転数[：:]\s*(\d+)\s*[~〜～-]\s*(\d+)/.exec(spec)
    if (rpm) {
      specs.motorRpmMin = Number(rpm[1])
      specs.motorRpmMax = Number(rpm[2])
    }
    const torque = /トルク[：:]\s*([\d.]+)\s*[~〜～-]\s*([\d.]+)/.exec(spec)
    if (torque) {
      specs.motorTorqueMin = Number(torque[1])
      specs.motorTorqueMax = Number(torque[2])
    }
  }

  if (category === 'wheel' || category === 'wheel-tire-set' || category === 'tire') {
    specs.wheelDiameterMm = number(/(\d{2}(?:\.\d)?)\s*mm/.exec(name)?.[1])
  }

  const pieces = /(\d+)\s*(?:個|本|枚)入/.exec(name) ?? /(\d+)\s*(?:個|本|枚)入/.exec(spec)
  if (pieces) specs.pieces = Number(pieces[1])

  return compact(specs)
}
