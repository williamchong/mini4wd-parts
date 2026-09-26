/**
 * Product names -> the rows of shared/scene/fittings.ts a part draws as
 * (docs/PLAN.md §5.6, "The rest of the parts").
 *
 * Tamiya names a roller, a plate or a damper by the job it does and the
 * feature it is sold on — "HG 19mm ALUMINUM BALL-RACE ROLLERS (RINGLESS)",
 * "FRP REAR MULTI ROLLER SETTING STAY" — and those words are exactly what
 * tells one row from another, so each category is an ordered list of
 * patterns, first match wins, the way data/taxonomy/categories.yml files a
 * part in the first place. The more specific pattern comes first: a rubber
 * ring *for* double aluminium rollers is a ring, not a double roller.
 *
 * Patterns are tested against the English name and the Japanese one together,
 * NFKC-normalised: a few English names are missing or wrong (95682 is a
 * chassis set whose English name is a gear cover's), and a Japanese word is
 * the better witness there. Colour, hardness and the J-CUP year are not
 * shape, and nothing here reads them; `colours.ts` reads the colour from the
 * same name.
 */
import { normalise } from './taxonomy.ts'
import type { PartCategory } from '../../shared/catalog/schema.ts'

type Rule = readonly [pattern: RegExp, id: string | ((match: RegExpExecArray) => string)]

const ROLLER: Rule[] = [
  [/o-ring|rubber rings? for/i, 'o-ring'],
  [/\bpipe\b/i, 'pipe'],
  [/spacer/i, 'spacer'],
  [/roller mount/i, 'mount'],
  [/stabili[sz]ing pole/i, 'pole-roller'],
  [/skid/i, 'skid-roller'],
  [/down-?thrust/i, 'down-thrust'],
  [/double aluminum rollers? w\/rubber/i, 'aluminium-double-rubber'],
  [/double rollers? w\/rubber/i, 'plastic-double-rubber'],
  [/double aluminum/i, 'aluminium-double'],
  // 13-13 and 19-19 are two tiers of one size; 13-12 steps down.
  [/double rollers?.*?(\d+)-(\d+)mm/i, match => match[1] === match[2] ? 'plastic-double-even' : 'plastic-double'],
  [/tapered/i, 'ball-race-tapered'],
  [/bowl/i, 'ball-race-bowl'],
  [/3-spoke/i, 'ball-race-3-spoke'],
  [/aero-spoke/i, 'ball-race-aero'],
  [/6 spokes/i, 'ball-race-6-spoke'],
  [/5[ -]spokes?\)? w\/plastic ring/i, 'ball-race-5-spoke-ring'],
  [/5[ -]spoke/i, 'ball-race-5-spoke'],
  [/plastic rings?/i, 'aluminium-ring'],
  // "13mm PLASTIC ROLLERS (BLUE) BALL BEARING TYPE" is a plastic roller on a bearing, not a bearing.
  [/plastic rollers?.*bearing type/i, 'plastic-bearing'],
  [/ball-race/i, 'ball-race'],
  [/ball bearings?/i, 'bearing'],
  // A low-friction set, and the rollers sold inside a brake or sliding-damper set.
  [/roller/i, 'plastic']
]

const PLATE: Rule[] = [
  [/bumperless|バンパーレス/i, 'bumperless'],
  [/under guard/i, 'under-guard'],
  [/steering/i, 'steering'],
  [/wide front sliding damper/i, 'wide-slide-damper-front'],
  [/wide rear sliding damper/i, 'wide-slide-damper-rear'],
  [/spring set/i, 'springs'],
  [/ex side stay|サイドステー/i, 'side-extension'],
  [/brake stay/i, 'brake-stay'],
  [/3 attachment points/i, 'rear-double-roller-3pt'],
  [/double roller stay/i, 'rear-double-roller'],
  [/rear multi roller/i, 'multi-roller-rear'],
  [/multi roller/i, 'multi-roller-front'],
  [/wide front plate \(for ar/i, 'wide-front-ar'],
  [/wide front plate \(for vz/i, 'wide-front-vz'],
  [/fully cowled/i, 'wide-front-cowled'],
  // 15357's English says side extension mount; its Japanese says what it is, a PRO wide plate set.
  [/wide front|wide roller stay|ワイドプレートセット/i, 'wide-front'],
  [/wide rear plate \(for ar/i, 'wide-rear-ar'],
  [/wide rear/i, 'wide-rear'],
  [/rear (?:roller )?stay/i, 'rear-roller-stay'],
  [/bumper plate/i, 'bumper-plate'],
  [/13\/19mm rollers?/i, 'reinforcing-roller'],
  [/short|mount plate|support plate|angle adjuster/i, 'reinforcing-short'],
  [/plate/i, 'reinforcing']
]

const DAMPER: Rule[] = [
  [/balance weight/i, 'balance-weight'],
  [/side mass damper/i, 'side-mass-damper'],
  [/ball connectors?/i, 'ball-block'],
  [/adjustable/i, 'adjustable'],
  [/slimline/i, 'slimline'],
  [/block \((\d)x\dx(\d+)mm/i, match => `block-${match[1]}-${match[2]}`],
  [/heavy/i, 'mass-damper-heavy'],
  [/ball cap/i, 'ball-cap'],
  [/tube/i, 'hi-mount-tube'],
  [/17mm/i, 'stabilizer-head-17'],
  [/head/i, 'stabilizer-head'],
  [/pole/i, 'stabilizer-pole'],
  [/spring/i, 'springs'],
  [/wide front/i, 'wide-slide-damper-front'],
  [/wide rear/i, 'wide-slide-damper-rear'],
  [/mass damper/i, 'mass-damper']
]

const BRAKE: Rule[] = [
  [/sponge set/i, 'sponge'],
  [/multi-brake/i, 'multi-brake'],
  [/rubber brake/i, 'rubber-brake'],
  [/brake/i, 'brake-set']
]

const AXLE: Rule[] = [
  [/hex/i, 'hex'],
  [/hollow/i, 'hollow'],
  [/reinforced/i, 'reinforced'],
  [/shaft/i, 'round']
]

const BEARING: Rule[] = [
  [/eyelet/i, 'eyelet'],
  [/plastic bearing/i, 'bushing'],
  [/metal bearing|steel bearing/i, 'metal'],
  [/\b[56]20\b/, 'ball-small'],
  [/bearing/i, 'ball']
]

const CHASSIS_SET: Rule[] = [
  // A Super FM set is for a chassis outside v1 (docs/PLAN.md §2.2): no row, and data/overrides/parts.yml gives it no slot.
  [/super fm|スーパーFM/i, ''],
  [/センターシャーシ|center chassis/i, 'ms-centre'],
  [/シャーシセット/i, 'ms-set'],
  [/ユニット|units/i, 'ms-ends']
]

const RULES: Partial<Record<PartCategory, readonly Rule[]>> = {
  'roller': ROLLER,
  'plate': PLATE,
  'bumper': PLATE,
  'slide-damper': [...DAMPER.filter(([, id]) => id === 'springs'), ...PLATE],
  'mass-damper': DAMPER,
  'stabilizer': DAMPER,
  'brake': BRAKE,
  'shaft': AXLE,
  'bearing': BEARING,
  'propeller-shaft': [[/hollow/i, 'propeller-hollow'], [/./, 'propeller']],
  'gear-cover': [[/./, 'gear-cover']],
  'chassis-set': CHASSIS_SET,
  'motor-mount': [[/./, 'motor-support']],
  'other': [[/cooling shield|クーリングシールド/i, 'cooling-shield']]
}

/** The categories a fitting row is read for: every one that draws in a socket this module fills. */
export const FITTING_CATEGORIES: ReadonlySet<PartCategory> = new Set(Object.keys(RULES) as PartCategory[])

export type StayEnd = 'front' | 'rear' | 'side'

/**
 * Which end of the car a plate is made for, read off its PLATE row. Every plate
 * declares all three stay slots, because Tamiya's holes let a rear stay hang
 * off a front bumper, so the slots cannot say; the row can, and the builder
 * ranks a front plate first in the front picker on it (`partsForSlot`). The
 * reinforcing and bumper rows name no end and are ranked in the middle.
 */
const STAY_ENDS: Readonly<Record<string, StayEnd>> = {
  'wide-front': 'front',
  'wide-front-ar': 'front',
  'wide-front-vz': 'front',
  'wide-front-cowled': 'front',
  'multi-roller-front': 'front',
  'wide-slide-damper-front': 'front',
  'under-guard': 'front',
  'steering': 'front',
  'wide-rear': 'rear',
  'wide-rear-ar': 'rear',
  'rear-roller-stay': 'rear',
  'rear-double-roller': 'rear',
  'rear-double-roller-3pt': 'rear',
  'multi-roller-rear': 'rear',
  'brake-stay': 'rear',
  'wide-slide-damper-rear': 'rear',
  'side-extension': 'side'
}

export const stayEndOf = (fitting: string | undefined): StayEnd | undefined =>
  fitting === undefined ? undefined : STAY_ENDS[fitting]

/**
 * The row a part draws as, from its category and its names, or nothing for a
 * part no row fits — a Super FM chassis set, the rubber tubing filed under
 * `other` — which then draws its socket's default.
 */
export function fittingFor(category: PartCategory, names: { ja: string; en?: string }): string | undefined {
  const rules = RULES[category]
  if (!rules) return undefined
  const name = normalise(`${names.en ?? ''} ${names.ja}`)
  for (const [pattern, id] of rules) {
    const match = pattern.exec(name)
    if (match) return (typeof id === 'string' ? id : id(match)) || undefined
  }
  return undefined
}
