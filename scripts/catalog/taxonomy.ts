import { readYamlFile } from './io.ts'
import { PART_CATEGORIES } from '../../shared/catalog/schema.ts'
import type { PartCategory as Category, PartSpecs, Slot } from '../../shared/catalog/schema.ts'
import type { JpItem } from './sources/tamiya-jp.ts'

interface CategoryRule {
  category: Category
  carPart?: boolean
  match?: string[]
  regex?: string
  addOn?: string
}

const RULES = readYamlFile<CategoryRule[]>('data/taxonomy/categories.yml')

const ADD_ON = new Map<Category, RegExp>()

for (const rule of RULES) {
  if (!PART_CATEGORIES.includes(rule.category)) {
    throw new Error(`Unknown category "${rule.category}" in categories.yml`)
  }
  if (rule.addOn) {
    if (ADD_ON.has(rule.category)) {
      throw new Error(`Two addOn patterns for "${rule.category}" in categories.yml`)
    }
    ADD_ON.set(rule.category, new RegExp(rule.addOn))
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

type Named = { nameJa: string, nameEn?: string }

/** Both names, normalised: what every rule's `match`, `regex` and `addOn` is tested against. */
const haystackOf = (item: Named) => `${normalise(item.nameJa)} ${normalise(item.nameEn ?? '')}`

export function deriveCategory(item: Named): CategoryResult {
  const haystack = haystackOf(item)
  for (const rule of RULES) {
    const hit = rule.match?.some(keyword => haystack.includes(normalise(keyword)))
      || (rule.regex ? new RegExp(rule.regex).test(haystack) : false)
    if (hit) {
      return { category: rule.category, isCarPart: rule.carPart ?? true, matched: true }
    }
  }
  return { category: 'other', isCarPart: true, matched: false }
}

/**
 * Whether a part goes *with* the thing its slot is named for rather than being
 * it: a roller O-ring, a spare pinion, a slide damper spring. Asked of the
 * part's final category, so an override that moves a part is asked the new
 * category's question.
 */
export function deriveAddOn(category: Category, item: Named): boolean {
  return ADD_ON.get(category)?.test(haystackOf(item)) ?? false
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
  'gear-cover': ['gear-cover'],
  'shaft': ['shaft'],
  'propeller-shaft': ['propeller-shaft'],
  'wheel': ['wheel-front', 'wheel-rear'],
  'tire': ['tire-front', 'tire-rear'],
  'wheel-tire-set': ['wheel-front', 'wheel-rear', 'tire-front', 'tire-rear'],
  'motor': ['motor'],
  'motor-mount': ['chassis-unit'],
  'terminal': ['terminal'],
  'switch': ['switch'],
  'battery': ['none'],
  'battery-holder': ['none'],
  'spacer': ['fastener'],
  'screw': ['fastener'],
  'body-catch': ['fastener'],
  'body': ['body'],
  'chassis-set': ['chassis-unit'],
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

  // Printed on only three names. 超速 (Super Speed) is the one family whose
  // name is its ratio: 3.5:1 on every chassis it was made for, which is how
  // the wiki groups all seven. ハイスピード is not — 4:1 on MS, 4.2:1 as a
  // counter gear — so those take an override instead.
  if (category === 'gear') {
    specs.gearRatio = /(\d+(?:\.\d+)?\s*:\s*1)/.exec(name)?.[1]?.replace(/\s/g, '')
      ?? (/超速ギヤ/.test(name) ? '3.5:1' : undefined)
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

  // No wheel or tire spec is read from the name here. The millimetres Tamiya
  // prints on one — "LOW-PROFILE TIRES (26mm) & CARBON WHEELS" — are the
  // *tire's* outer diameter, so reading them as `wheelDiameterMm` recorded a
  // ⌀26 rim for a ⌀21 one and the pane banded a ⌀32 tire around it. The size
  // now comes from the shape the name resolves to (scripts/catalog/wheels.ts),
  // which knows which of the two numbers it is holding.

  const pieces = /(\d+)\s*(?:個|本|枚)入/.exec(name) ?? /(\d+)\s*(?:個|本|枚)入/.exec(spec)
  if (pieces) specs.pieces = Number(pieces[1])

  return compact(specs)
}
