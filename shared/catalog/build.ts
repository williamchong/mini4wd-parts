/**
 * Build resolution: turning a chassis, an optional kit and the user's swaps
 * into the slot-by-slot view that the builder UI reads — and that the rule
 * engine, the cost totals and the later 3D socket graph will read too.
 *
 * A build is stored as a *delta*, never as a resolved loadout. That is the same
 * choice the catalog already makes one layer down, where a kit's `stockLoadout`
 * is the delta over its chassis' `defaultLoadout` (see schema.ts): re-authoring
 * a chassis default must not require rewriting everything built on top of it.
 * It also makes "stock vs swapped" a property of the data rather than a flag
 * the UI has to maintain, and leaves the URL encoding with almost nothing to
 * serialise.
 *
 * Slot **ids** and slot **types** are not interchangeable and this file is
 * where the two meet. Loadouts and swaps are keyed by id (`gear-set`, `axle`);
 * `part.slots` lists types (`gear`, `shaft`). Two of the 22 slots differ.
 */
import type {
  Chassis, ChassisId, Kit, LabelNames, LoadoutEntry, Part, PartLegality, Slot
} from './schema.ts'

/**
 * The catalog fields the builder actually reads, and no more.
 *
 * Narrower than the full records on purpose: `/build` is prerendered, so every
 * field these types name is a field shipped to every visitor in the route's
 * payload. Asking for the whole of `Part` puts each item's raw Japanese spec
 * text and each chassis' 400-entry `compatibleParts` list in front of a reader
 * who only wanted to change a motor.
 */
export type BuildablePart = Pick<Part,
  'id' | 'names' | 'category' | 'slots' | 'isCarPart' | 'chassisCompat'
  | 'classLegality' | 'specs' | 'priceJpy' | 'priceHkd'>

export type BuildableChassis = Pick<Chassis, 'id' | 'slots' | 'defaultLoadout' | 'motorShaft'>

export type BuildableKit = Pick<Kit, 'stockLoadout'>

/**
 * What the kit picker reads. A superset of `BuildableKit` rather than a
 * replacement: `resolveBuild` needs exactly one field, and asking it for
 * thirteen would let the resolver quietly start depending on a price.
 *
 * Every field named here ships to every visitor of the prerendered /build
 * route. Measured over the 305 committed kits: 291 KB raw, 24.6 KB gzipped, of
 * which `stockLoadout` alone is 179 KB / 7.4 KB. That one is the feature — the
 * kit is chosen after hydration and there is no server to ask, so it is all 305
 * loadouts or none, and "none" makes the kit door produce a build
 * indistinguishable from the bare-chassis one.
 *
 * Deliberately absent: `series`, `seriesNumber` (180 of 305, and its only
 * human-readable partner `seriesLabel` is Japanese-only free text), `specsRaw`,
 * `officialUrl`, `hkStoreUrl`, `nameSources`, `releaseDateRaw`.
 */
export type PickableKit = Pick<Kit,
  'id' | 'names' | 'chassis' | 'status' | 'gearRatio' | 'priceJpy' | 'priceHkd'
  | 'releaseDate' | 'officialImage' | 'loadoutSource' | 'loadoutSourceTitle'
  | 'stockLoadout'>

/**
 * The rulesets a build can be checked against (docs/PLAN.md §2.1).
 *
 * Taken from `classLegality`'s own keys rather than restated, so renaming a
 * class in the schema is a compile error here instead of a selector option that
 * silently stops matching anything.
 */
export type BuildClass = Exclude<keyof Part['classLegality'], 'source' | 'notes'>

export const BUILD_CLASSES = ['open', 'stockBmax', 'junior'] as const satisfies readonly BuildClass[]

export type BuildState = {
  chassis: ChassisId
  /** Item number of the kit this build started from, if it started from one. */
  kit?: string
  /**
   * Slot id -> the parts the user put there, replacing whatever was stock.
   * An empty array is meaningful and distinct from an absent key: it is a slot
   * the user deliberately emptied, which is a legal thing to do to an optional
   * slot (running without a brake) and an error on a required one.
   */
  swaps: Record<string, string[]>
}

export function newBuild(chassis: ChassisId, kit?: string): BuildState {
  return { chassis, kit, swaps: {} }
}

/** Where a slot's current contents came from. */
export type EntryOrigin = 'chassis' | 'kit' | 'user'

/**
 * One thing sitting in a slot. `partId` is absent for most stock entries: what
 * comes in the box is largely moulded plastic Tamiya never sold separately, so
 * a bare `label` is the normal case rather than a gap (see `loadoutEntry`).
 */
export type ResolvedEntry = {
  partId?: string
  label?: LabelNames
  origin: EntryOrigin
}

export type ResolvedSlot = {
  id: string
  type: Slot
  maxCount: number
  mirror: boolean
  required: boolean
  entries: ResolvedEntry[]
  /** True once the user has touched this slot, emptying it included. */
  swapped: boolean
}

const fromLoadout = (entries: LoadoutEntry[], origin: EntryOrigin): ResolvedEntry[] =>
  entries.map(entry => ({ partId: entry.partId, label: entry.label, origin }))

/**
 * The chassis' slot list is authoritative: a loadout key naming a slot the
 * chassis does not have is dropped rather than rendered. Catching that belongs
 * to `catalog:verify`, not to the builder.
 */
export function resolveBuild(
  chassis: BuildableChassis,
  kit: BuildableKit | undefined,
  state: BuildState
): ResolvedSlot[] {
  return chassis.slots.map((slot): ResolvedSlot => {
    const base = {
      id: slot.id,
      type: slot.type,
      maxCount: slot.maxCount,
      mirror: slot.mirror,
      required: slot.required
    }

    const swap = state.swaps[slot.id]
    if (swap !== undefined) {
      return {
        ...base,
        entries: swap.map(partId => ({ partId, origin: 'user' as const })),
        swapped: true
      }
    }

    // A kit's entry for a slot replaces the chassis' entry for that slot; it is
    // a delta per slot, not a merge of entries within one.
    const fromKit = kit?.stockLoadout[slot.id]
    if (fromKit?.length) {
      return { ...base, entries: fromLoadout(fromKit, 'kit'), swapped: false }
    }

    const fromChassis = chassis.defaultLoadout[slot.id]
    if (fromChassis?.length) {
      return { ...base, entries: fromLoadout(fromChassis, 'chassis'), swapped: false }
    }

    return { ...base, entries: [], swapped: false }
  })
}

/**
 * An EMPTY `include` list means the part is not chassis-specific — washers,
 * spacers, AO spares — and the schema is explicit that it never means
 * "unknown". 53 parts are in that state, so reading the list literally would
 * drop every one of them from every picker.
 */
export function isChassisCompatible(
  part: Pick<Part, 'chassisCompat'>,
  chassisId: ChassisId
): boolean {
  return part.chassisCompat.include.length === 0
    || part.chassisCompat.include.includes(chassisId)
}

/** The slot ids on this chassis whose type a part is allowed to occupy. */
export function slotIdsFor(
  part: Pick<Part, 'slots'>,
  chassis: Pick<Chassis, 'slots'>
): string[] {
  return chassis.slots.filter(slot => part.slots.includes(slot.type)).map(slot => slot.id)
}

/**
 * Whether a part physically goes in this slot on this chassis.
 *
 * Two unrelated constraints. Tamiya's own compatibility list is one. The other
 * is motor shaft count: the PRO chassis (MA, MS, ME) drive both axles from a
 * double-shaft motor, and a single-shaft motor does not fit them at all. That
 * is a question of whether the part goes in the box, not a rule the racer could
 * choose to break, so it filters the picker rather than waiting for the rule
 * engine to warn about it. A motor whose shaft the catalog does not record is
 * offered rather than hidden — we do not claim a fit we have not checked.
 */
function fits(part: BuildablePart, slotType: Slot, chassis: BuildableChassis): boolean {
  if (!isChassisCompatible(part, chassis.id)) return false
  if (slotType === 'motor' && part.specs.motorShaft !== undefined) {
    return part.specs.motorShaft === chassis.motorShaft
  }
  return true
}

export type SlotCandidate = {
  part: BuildablePart
  legality: PartLegality
}

/**
 * What the user may put in a slot. Class legality is returned rather than
 * filtered on: a beginner learns more from a Sprint Dash marked "Open only"
 * than from one that silently does not appear. Ordering is a sensible default
 * — usable first, then cheapest — and the picker is free to re-sort.
 */
export function partsForSlot(
  parts: BuildablePart[],
  slotType: Slot,
  chassis: BuildableChassis,
  buildClass: BuildClass
): SlotCandidate[] {
  const candidates = parts
    .filter(part => part.isCarPart
      && part.slots.includes(slotType)
      && fits(part, slotType, chassis))
    .map(part => ({ part, legality: part.classLegality[buildClass] }))

  const rank = { legal: 0, unknown: 1, illegal: 2 }
  return candidates.sort((a, b) =>
    rank[a.legality] - rank[b.legality]
    // Tamiya prices every current item, but discontinued ones can lack a price;
    // those sort last rather than as if they were free.
    || (a.part.priceJpy ?? Infinity) - (b.part.priceJpy ?? Infinity)
    || a.part.id.localeCompare(b.part.id))
}

/**
 * Slot types with at least one part that could go there, class aside. Some
 * slots have none — no part in the catalog declares the `switch` slot — and a
 * slot like that is correct data, not a gap: it shows its stock label and
 * offers no swap.
 */
export function swappableSlotTypes(
  parts: BuildablePart[],
  chassis: BuildableChassis
): Set<Slot> {
  const types = new Set<Slot>()
  for (const part of parts) {
    if (!part.isCarPart) continue
    for (const slot of part.slots) {
      if (slot !== 'none' && fits(part, slot, chassis)) types.add(slot)
    }
  }
  return types
}
