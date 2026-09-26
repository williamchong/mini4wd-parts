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
import type { Mount } from '../scene/fittings.ts'

/** One socket on a chassis, as its profile declares it. */
export type ChassisSlot = Chassis['slots'][number]

/**
 * Whether this record has a thumbnail, in place of the path to it: the path is
 * derivable from the item number, and 631 copies of a 25-byte string is 1.8 KB
 * gzipped in every visitor's payload (shared/catalog/thumbnails.ts).
 */
type HasThumbnail = { hasThumbnail?: boolean }

/**
 * The catalog fields the builder actually reads, and no more.
 *
 * Narrower than the full records on purpose: the builder is prerendered, so every
 * field these types name is a field shipped to every visitor in the route's
 * payload. Asking for the whole of `Part` puts each item's raw Japanese spec
 * text and each chassis' 400-entry `compatibleParts` list in front of a reader
 * who only wanted to change a motor.
 */
export type BuildablePart = Pick<Part,
  'id' | 'names' | 'category' | 'slots' | 'isCarPart' | 'isAddOn' | 'contents' | 'chassisCompat'
  | 'classLegality' | 'specs' | 'colours' | 'body' | 'stayEnd'> & HasThumbnail

export type BuildableChassis = Pick<Chassis, 'id' | 'slots' | 'defaultLoadout' | 'motorShaft' | 'rearRollersPerSide'>

export type BuildableKit = Pick<Kit, 'stockLoadout'>

/**
 * What the kit picker reads. A superset of `BuildableKit` rather than a
 * replacement: `resolveBuild` needs exactly one field, and asking it for
 * thirteen would let the resolver quietly start depending on a price.
 *
 * Every field named here ships to every visitor of the prerendered builder
 * route, and the real cost is **+52.7 KB gzipped** — the route goes 35.7 to
 * 88.4 — not the ~25 KB these records gzip to as a plain JSON array. The
 * payload interns each distinct string once and refers to it by index, so the
 * repeated label text is nearly free and the *shape* is what costs: 1,783
 * loadout entries, each an object holding a label object inside an array, all
 * of them unique integer references gzip cannot collapse. Do not re-estimate
 * this by gzipping the equivalent JSON; that under-counts by 2× (§6 M1b).
 *
 * `stockLoadout` is most of it and is not optional: the kit is chosen after
 * hydration and there is no server to ask, so it is all 305 loadouts or none,
 * and "none" makes the kit door produce a build indistinguishable from the
 * bare-chassis one.
 *
 * Deliberately absent: `series`, `seriesNumber` (180 of 305, and its only
 * human-readable partner `seriesLabel` is Japanese-only free text), `specsRaw`,
 * `officialUrl`, `hkStoreUrl`, `nameSources`, `releaseDateRaw`,
 * `officialImage` — the full-size photo on Tamiya's CDN, which nothing renders
 * now that we serve our own downscale — and `thumbnail`, whose path the client
 * derives from the item number (see shared/catalog/thumbnails.ts) — the prices —
 * nobody recognises their box by price — and `releaseDate`, which orders the
 * picker at prerender and is then stripped, because nothing renders it.
 */
export type PickableKit = Pick<Kit,
  'id' | 'names' | 'chassis' | 'status' | 'gearRatio'
  | 'loadoutSource' | 'loadoutSourceTitle' | 'stockLoadout' | 'colours' | 'body' | 'bodyFinish'> & HasThumbnail

/**
 * The rulesets a build can be checked against (docs/PLAN.md §2.1).
 *
 * Taken from `classLegality`'s own keys rather than restated, so renaming a
 * class in the schema is a compile error here instead of a selector option that
 * silently stops matching anything.
 */
export type BuildClass = Exclude<keyof Part['classLegality'], 'source' | 'notes'>

/** Every class, in the order a beginner meets them: the open class first. */
export const BUILD_CLASSES: readonly BuildClass[] = ['open', 'stockBmax', 'junior']

export const isBuildClass = (value: unknown): value is BuildClass =>
  BUILD_CLASSES.includes(value as BuildClass)

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
  /** Which wheel, tire or damper shape the 3D pane draws for a stock entry (§5.6). */
  shape?: string
  /** Where a stock entry's weight went, for the ones sold bare (§4.2). */
  mount?: Mount
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
  entries.map(entry => ({ partId: entry.partId, label: entry.label, shape: entry.shape, mount: entry.mount, origin }))

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
 * Slot id -> the slot itself, across however many chassis are handed in.
 *
 * Loadouts and set contents are keyed by slot **id** while a part declares slot
 * **types**, so resolving one to the other always needs a chassis profile — and
 * the callers holding one are spread across the verifier and the part page.
 * One chassis gives that chassis' profile; all eight give the union, which is
 * what a page with no chassis in hand needs. The two profiles agree wherever
 * they share an id (data/taxonomy/slots.yml), so the union loses nothing.
 *
 * Insertion order is the first chassis' own slot order, which is the order the
 * build list reads, so a caller iterating this gets rows in that order.
 */
export function slotsById<S extends Pick<ChassisSlot, 'id' | 'type'>>(
  chassis: { slots: S[] }[]
): Map<string, S> {
  return new Map(chassis.flatMap(entry => entry.slots).map(slot => [slot.id, slot]))
}

/** One row a parts set fills, and the item numbers it puts there. */
export type SetRow = { slotId: string; partIds: string[] }

/**
 * A parts set as this chassis can take it: every row the box fills, in the
 * chassis' own order, so a notice about it reads top to bottom like the list.
 *
 * A set goes on the car whole or not at all. A First Try set is a front plate,
 * a rear plate, two pairs of rollers and its dampers, and dropping one of those
 * into a single slot — which is what the ordinary "which slot?" question would
 * do with it — leaves the reader with a fifth of what they bought and no sign
 * of the rest (docs/PLAN.md §4.9).
 *
 * Empty for a part that is not a set, and for a set on a chassis whose profile
 * has none of its rows, which `catalog:verify` makes impossible for a chassis
 * the set is actually sold for.
 */
export function setContentsFor(part: BuildablePart, chassis: BuildableChassis): SetRow[] {
  const contents = part.contents
  if (!contents) return []
  return chassis.slots.flatMap((slot) => {
    const partIds = contents[slot.id]
    // `maxCount` is the slot's word, not the set's: a link is cut to it too
    // (reconcileBuild), and the two have to agree about what a row can hold.
    return partIds?.length ? [{ slotId: slot.id, partIds: partIds.slice(0, slot.maxCount) }] : []
  })
}

/**
 * The same rows for a reader with no chassis in hand — the set's own page,
 * which can name a slot *type* and has no build to resolve ids against.
 *
 * Here rather than in the page for the reason this file's header gives: slot
 * ids and slot types meet in one place, and a page that built its own map
 * would be the third copy of that resolution and the one no test can reach.
 */
export function setContentRows(
  part: Pick<BuildablePart, 'contents'>,
  chassis: { slots: Pick<ChassisSlot, 'id' | 'type'>[] }[]
): { type: Slot; partIds: string[] }[] {
  const contents = part.contents
  if (!contents) return []
  return [...slotsById(chassis)].flatMap(([slotId, slot]) => {
    const partIds = contents[slotId]
    return partIds?.length ? [{ type: slot.type, partIds }] : []
  })
}

/**
 * Whether a slot holds several different parts at once — the dampers, brakes,
 * plates on a bumper, fasteners and chassis units a real car stacks — rather
 * than one part the reader swaps for another. A mirrored slot's count is one
 * part per side, so a pair of rollers is not a stack however many it holds.
 */
export const stacks = (slot: Pick<ResolvedSlot, 'maxCount' | 'mirror'>): boolean =>
  slot.maxCount > 1 && !slot.mirror

/**
 * Whether a part can go on beside what a slot holds: a stack with something in
 * it and room for one more. An empty slot has nothing to go beside, so filling
 * it is an ordinary swap.
 */
export const canAddTo = (slot: Pick<ResolvedSlot, 'maxCount' | 'mirror' | 'entries'>): boolean =>
  stacks(slot) && slot.entries.length > 0 && slot.entries.length < slot.maxCount

/**
 * A stacking slot after one edit, as the swap that holds it: the item numbers
 * it keeps, and how many stock entries it had to leave behind.
 *
 * A swap holds item numbers and nothing else (docs/PLAN.md §4.9), so a stock
 * entry that is only a label — moulded plastic Tamiya never sold — cannot come
 * along once the reader touches the slot. It is counted rather than silently
 * lost, so the builder can say so. A kit's `mount` and `shape` stay behind for
 * the same reason; a part carries its own row, and the pane draws that.
 */
export type SlotEdit = { partIds: string[]; dropped: number }

function edited(slot: ResolvedSlot, at: number | undefined, added: string[] = []): SlotEdit {
  const partIds: string[] = []
  let dropped = 0
  slot.entries.forEach((entry, i) => {
    if (i === at) partIds.push(...added)
    else if (entry.partId) partIds.push(entry.partId)
    else dropped++
  })
  if (at === undefined) partIds.push(...added)
  return { partIds: partIds.slice(0, slot.maxCount), dropped }
}

/** One more part in a stacking slot, after what is already there. */
export const addedTo = (slot: ResolvedSlot, partId: string): SlotEdit => edited(slot, undefined, [partId])

/** One entry of a stacking slot swapped for another part, the rest kept. */
export const replacedIn = (slot: ResolvedSlot, index: number, partId: string): SlotEdit =>
  edited(slot, index, [partId])

/** One entry taken out of a stacking slot, the rest kept. */
export const removedFrom = (slot: ResolvedSlot, index: number): SlotEdit => edited(slot, index)

/**
 * A set's rows when the reader opened one stacking slot to add to it, or
 * tapped one of its entries to replace: that row keeps what it holds and
 * takes the set's pieces beside (or in place of) the one entry, the way a
 * single part would through `addedTo` and `replacedIn`; every other row is
 * still the set's word, because a First Try set replacing the kit's rollers
 * is what a First Try set is. `dropped` counts the label-only stock pieces
 * the opened row could not keep, for the same notice `fitEdit` shows.
 *
 * Without this a side mass damper set added to a damper row wiped the two
 * dampers already stacked there, and said nothing.
 */
export function setRowsInto(
  rows: SetRow[],
  slot: ResolvedSlot,
  at: 'add' | number
): { rows: SetRow[]; dropped: number } {
  let dropped = 0
  const merged = rows.map((row) => {
    if (row.slotId !== slot.id) return row
    const edit = edited(slot, at === 'add' ? undefined : at, row.partIds)
    dropped = edit.dropped
    return { slotId: row.slotId, partIds: edit.partIds }
  })
  return { rows: merged, dropped }
}

const COUNTERPART: Partial<Record<Slot, Slot>> = {
  'wheel-front': 'wheel-rear',
  'wheel-rear': 'wheel-front',
  'tire-front': 'tire-rear',
  'tire-rear': 'tire-front'
}

/**
 * The parts the other end's wheels or tires hold, when copying them into this
 * slot would change it. Front and rear are usually the same part, so the list
 * offers the copy. Undefined unless every entry over there is a catalog part
 * that also fits here — a swap is a list of parts, and moulded stock plastic
 * with only a label is not one.
 */
export function counterpartParts(
  slot: ResolvedSlot,
  slots: ResolvedSlot[],
  partsById: ReadonlyMap<string, Pick<Part, 'slots'>>
): { from: ResolvedSlot; partIds: string[] } | undefined {
  const other = COUNTERPART[slot.type]
  if (!other) return undefined
  const from = slots.find(s => s.type === other)
  if (!from?.entries.length) return undefined
  const partIds: string[] = []
  for (const entry of from.entries) {
    if (!entry.partId || !partsById.get(entry.partId)?.slots.includes(slot.type)) return undefined
    partIds.push(entry.partId)
  }
  const same = partIds.length === slot.entries.length
    && partIds.every((id, i) => id === slot.entries[i]!.partId)
  return same ? undefined : { from, partIds }
}

const COMPANION: Partial<Record<Slot, Slot>> = {
  'wheel-front': 'tire-front',
  'tire-front': 'wheel-front',
  'wheel-rear': 'tire-rear',
  'tire-rear': 'wheel-rear'
}

/**
 * The second row a wheel-and-tire set fills: the tire row beside the wheel
 * row it was chosen for, or the other way round. One box is both, and a
 * builder that put it on the rims alone left the tire row reading "stock
 * tires" on a car that no longer had them, then offered the same box again
 * in the tire picker. Empty unless every part is such a set and this end
 * has the companion slot, so a plain wheel or tire touches one row as before.
 */
export function companionRows(
  partIds: string[],
  slot: Pick<ResolvedSlot, 'type'>,
  slots: Pick<ResolvedSlot, 'id' | 'type'>[],
  partsById: ReadonlyMap<string, Pick<Part, 'category'>>
): SetRow[] {
  const other = COMPANION[slot.type]
  if (!other || !partIds.length) return []
  if (!partIds.every(id => partsById.get(id)?.category === 'wheel-tire-set')) return []
  const companion = slots.find(s => s.type === other)
  return companion ? [{ slotId: companion.id, partIds }] : []
}

/**
 * The car's final gear ratio, or undefined where the catalog cannot say.
 *
 * Untouched, it is the kit's own — the same fact its stock `gear-set` label
 * spells out — and a bare chassis has none, because "Kit standard gears" names
 * no ratio. Once either gear slot is swapped, only the swapped parts count: a
 * gear set or a counter gear set decides the ratio on its own (15434 is a
 * counter gear and its spur, 3.7:1 whatever else is in the car), and two that
 * disagree, a spare pinion, a setting set that holds several ratios, or an
 * emptied slot all leave it unknown. The kit's ratio is no fallback once its
 * gears are out of the car: a 3.5:1 kit on a 4:1 gear set is a 4:1 car.
 */
export function gearRatioOf(
  slots: ResolvedSlot[],
  partsById: ReadonlyMap<string, Pick<Part, 'specs'>>,
  kit: Pick<Kit, 'gearRatio'> | undefined
): string | undefined {
  const swapped = slots.filter(slot => slot.swapped && (slot.type === 'gear' || slot.type === 'counter-gear'))
  if (!swapped.length) return kit?.gearRatio
  const ratios = new Set(swapped.map(slot => slot.entries.length === 1 && slot.entries[0]!.partId
    ? partsById.get(slot.entries[0]!.partId)?.specs.gearRatio
    : undefined))
  return ratios.size === 1 ? [...ratios][0] : undefined
}

/** The stay whose plate places each end's rollers (shared/scene/sockets.ts). */
const ROLLER_STAY: Partial<Record<Slot, Slot>> = { 'roller-front': 'front-stay', 'roller-rear': 'rear-stay' }

/**
 * The roller slots holding more than one roller each side, and how many. The
 * slot names one part, but a double-roller stay carries an upper and a lower
 * pair, and the pane draws all four; without the count the list would say
 * two. An empty roller slot has none to count.
 *
 * The plate in that end's stay slot says the count where it is the one placing
 * the rollers. Where it is not — no plate, or one that bolts on over the
 * bumper — they stay on the chassis' own posts, and the rear posts of the AR
 * and the MA hold a pair: a roller over the stay and one under it, the "six
 * rollers" those two ship with. Both counts are written by `catalog:generate`
 * from shared/scene, which this cannot import (§5.6).
 *
 * A stay slot can stack plates, and the first one with roller holes is the one
 * placing the rollers, as the pane draws it (`fitOf` in Scene.client.vue); a
 * brake stay or a plate over the bumper beside it does not change the count.
 */
export function rollersPerSideIn(
  slots: ResolvedSlot[],
  partsById: ReadonlyMap<string, Pick<Part, 'specs'>>,
  chassis?: Pick<Chassis, 'rearRollersPerSide'>
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const slot of slots) {
    const stayType = ROLLER_STAY[slot.type]
    if (!stayType || !slot.entries.length) continue
    const onPlate = slots.find(s => s.type === stayType)?.entries
      .map(entry => entry.partId ? partsById.get(entry.partId)?.specs.rollersPerSide : undefined)
      .find(count => count !== undefined)
    const onPosts = slot.type === 'roller-rear' ? chassis?.rearRollersPerSide : undefined
    const perSide = onPlate ?? onPosts
    if (perSide && perSide > 1) counts.set(slot.id, perSide)
  }
  return counts
}

/**
 * Whether a part is not chassis-specific — washers, spacers, AO spares — which
 * Tamiya says by listing no chassis at all: both lists empty (33 parts).
 *
 * An empty `include` alone is not that. It is also what a part gets when every
 * chassis Tamiya lists is outside our eight — the 72mm shafts and one-way
 * wheels for Super X, the EZ tire sets, the Super FM chassis sets (20 parts) —
 * and offering a Super X shaft on a VZ, which takes 60mm, is the one wrong
 * answer. Their `other` list is what tells the two apart.
 */
export const fitsAnyChassis = (compat: Pick<Part['chassisCompat'], 'include' | 'other'>): boolean =>
  !compat.include.length && !compat.other.length

/**
 * An empty `include` list never means "unknown" (schema.ts), so reading it
 * literally would drop every universal part from every picker.
 */
export function isChassisCompatible(
  part: Pick<Part, 'chassisCompat'>,
  chassisId: ChassisId
): boolean {
  return fitsAnyChassis(part.chassisCompat) || part.chassisCompat.include.includes(chassisId)
}

/**
 * Whether a part goes on a car at all. A tool, a case, a sticker or a setting
 * gauge does not, and neither does a part whose only slot is `none`. The
 * builder drops the rest from its catalog on this, and a page only offers to
 * add a part that passes it, so a button can never lead to a part the builder
 * has never heard of.
 */
export const goesOnCar = (part: Pick<Part, 'isCarPart' | 'slots'>): boolean =>
  part.isCarPart && part.slots.some(slot => slot !== 'none')

/**
 * The slot ids on this chassis a part can occupy — its type matches the socket
 * *and* it physically goes on this chassis (`fits`, below).
 *
 * The part page's add-to-build button is what needs this in the UI
 * (docs/PLAN.md §6 M1b): it knows a part and nothing about a chassis, so the
 * question "which slot?" can only be answered once the reader is back on a
 * build. Slot **ids**, because that is what a swap is keyed by, and the
 * chassis' own order, because front before rear before side is how the build
 * list already reads — not "emptiest first", which would send a beginner's
 * first pair of rollers to the side stay.
 *
 * Empty means the part goes nowhere on this car, and the three reasons are
 * deliberately not distinguished: a chassis Tamiya does not list it for, a
 * single-shaft motor on a PRO chassis, and a propeller shaft on a chassis that
 * has none all leave the reader with the same one thing to do.
 */
export function slotIdsFor(part: BuildablePart, chassis: BuildableChassis): string[] {
  return chassis.slots
    .filter(slot => part.slots.includes(slot.type) && fits(part, slot.type, chassis))
    .map(slot => slot.id)
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
  return isChassisCompatible(part, chassis.id) && isShaftCompatible(part, slotType, chassis)
}

/**
 * The motor-shaft half of `fits`, exported for the rule engine, which has to
 * tell the reader which of the two a part from a link failed.
 */
export function isShaftCompatible(
  part: Pick<Part, 'specs'>,
  slotType: Slot,
  chassis: Pick<BuildableChassis, 'motorShaft'>
): boolean {
  return slotType !== 'motor'
    || part.specs.motorShaft === undefined
    || part.specs.motorShaft === chassis.motorShaft
}

export type SlotCandidate = {
  part: BuildablePart
  legality: PartLegality
}

/**
 * The catalog's own order: the regular range newest first, then the limited
 * range newest first. What someone following Tamiya's releases wants, and
 * roughly what a shop puts on its shelf against its new-arrivals table.
 *
 * **`status` outranks the date, and this is where the part picker parts company
 * with the kit picker.** docs/PLAN.md §6 M1b settled on 2026-09-09 that the kit
 * picker shows limited kits unranked beside current ones, because a limited kit
 * is one someone *owns* and has to be able to find. A part picker answers the
 * other question — what to buy next — and there date order alone read badly:
 * the MA motor picker led with eight J-CUP and anniversary liveries of three
 * motors, four years of them, and put all six standard PRO motors below them —
 * five of the six dateless, a staple Tamiya has always sold carrying no release
 * date at all. The Torque-Tuned 2 PRO alone is four packings of one ¥462 motor.
 * The 84 limited parts are still all offered, still searchable and still first
 * within their own block; only the 254 regular ones now open the list.
 *
 * Not-current is one rank rather than three: every picker-eligible part today
 * is `current` or `limited`, and inventing an order for `discontinued` and
 * `unknown` would be policy no row exercises. They rank with limited.
 *
 * The 133 picker-eligible parts with no `releaseDate` sort last within their
 * block — the same rule `orderKits` applies to the 31 dateless kits (kits.ts).
 * Tamiya's dated pages only reach back to 2009, so an absent date means an
 * older staple rather than an unreleased item, but there is still nothing to
 * say about where one belongs except that it is not the newest. Price ranks
 * that block, which is the order the whole picker used to have, and `id` ranks
 * what price leaves tied.
 *
 * Some dates are a month (`2026-11`) because that is all Tamiya gives. Compared
 * as strings those land at the foot of their own month, which is where reading
 * them as the 1st would have put them anyway, so nothing has to parse a date.
 * Dates also run ahead of today, and an item announced for next January heading
 * its picker is correct — it is the newest thing Tamiya has.
 *
 * Runs once at prerender rather than on every picker open, which is also what
 * lets all three sort keys stay out of the payload: `partsForSlot` re-ranks on
 * legality and add-on alone, so no status, date or price has to reach the
 * browser to produce this order (see `BuildablePart`).
 */
export function orderParts<T extends Pick<Part, 'id' | 'status' | 'releaseDate' | 'priceJpy'>>(
  parts: T[]
): T[] {
  return [...parts].sort((a, b) => {
    const range = Number(a.status !== 'current') - Number(b.status !== 'current')
    if (range) return range
    if (a.releaseDate !== b.releaseDate) {
      if (!a.releaseDate) return 1
      if (!b.releaseDate) return -1
      return b.releaseDate.localeCompare(a.releaseDate)
    }
    // Tamiya prices every current item, but discontinued ones can lack a price;
    // those sort last rather than as if they were free.
    return (a.priceJpy ?? Infinity) - (b.priceJpy ?? Infinity)
      || a.id.localeCompare(b.id)
  })
}

/**
 * What the user may put in a slot. Class legality is returned rather than
 * filtered on: a beginner learns more from a Sprint Dash marked "Open only"
 * than from one that silently does not appear.
 *
 * Three ranks: the thing the slot is named for before its add-ons, then — in
 * a stay slot — the plates made for this end before the ones that name no
 * end before the ones made for the other (`stayEnd`; every plate declares all
 * three stay slots, so without it the front picker opened on rear brake
 * stays), then usable before illegal. Within a rank the caller's order survives, because
 * Array.prototype.sort is stable, so a caller that wants an order hands one in:
 * the builder hands the newest-first catalog `orderParts` made at prerender,
 * which is what the reader scrolls, and the picker is still free to re-sort.
 * `catalog:verify` hands the YAML in filename order and is right not to care —
 * it only asks whether every candidate for a slot is an add-on.
 *
 * Add-ons rank below every part rather than being filtered out, because they
 * do fill the slot and a link may carry one. Ranked on price alone, the three
 * cheapest rows of the roller picker were two O-ring packs and a pipe. They
 * rank below even an illegal part so that they form one block at the foot of
 * the list, which the picker heads with a divider.
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
  const end = STAY_END_OF_SLOT[slotType]
  const endRank = (part: BuildablePart) =>
    !end || !part.stayEnd ? 1 : part.stayEnd === end ? 0 : 2
  return candidates.sort((a, b) =>
    Number(a.part.isAddOn ?? false) - Number(b.part.isAddOn ?? false)
    || endRank(a.part) - endRank(b.part)
    || rank[a.legality] - rank[b.legality])
}

const STAY_END_OF_SLOT: Partial<Record<Slot, NonNullable<Part['stayEnd']>>> = {
  'front-stay': 'front',
  'rear-stay': 'rear',
  'side-stay': 'side'
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
