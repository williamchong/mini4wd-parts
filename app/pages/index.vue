<script setup lang="ts">
/**
 * The builder, and the home page. It is one stable screen — the 3D pane above
 * the build list — whether or not a kit has been chosen; choosing one is a row
 * in that list, not a separate start screen.
 *
 * This page is the only owner of catalog data: it loads the collections once
 * and hands resolved values down as props, which keeps every child component
 * synchronous and the whole route prerenderable.
 *
 * All the logic lives in shared/catalog/build.ts as pure functions, so the
 * model is tested without a browser and this file stays about presentation.
 */
import {
  addedTo, canAddTo, counterpartParts, gearRatioOf, goesOnCar, isBuildClass, orderParts, partsForSlot, removedFrom, replacedIn,
  resolveBuild, rollersPerSideIn, setContentsFor, slotIdsFor, stacks, swappableSlotTypes
} from '#shared/catalog/build'
import { byChassisOrder } from '#shared/catalog/chassis'
import { STARTER_PACKS, orderKits } from '#shared/catalog/kits'
import { checkBuild, classDecides } from '#shared/catalog/rules'
import { flagThumbnail, thumbnailSrc } from '#shared/catalog/thumbnails'
import type { BuildablePart, ResolvedSlot, SlotEdit } from '#shared/catalog/build'
import type { Finding } from '#shared/catalog/rules'
import type { ChassisId, PartCategory, Slot } from '#shared/catalog/schema'
import type { AnalyticsEvents } from '~/composables/useAnalytics'

definePageMeta({ layout: 'content' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const siteUrl = useRuntimeConfig().public.siteUrl
const { resolve, isFallback } = useCatalogName()
const { term, slotLabel } = useTerm()
const { build, buildClass, pending, start, swap, swapMany, revert } = useBuild()
const { track } = useAnalytics()

/**
 * Only the columns the builder reads, because this route is prerendered and
 * every column selected here is shipped to every visitor. Asking for whole
 * records triples the payload with raw Japanese spec text and each chassis'
 * 400-entry `compatibleParts` list, neither of which the builder looks at.
 *
 * The 305 kits are the expensive half — 291 KB raw, 24.6 KB gzipped, of which
 * `stockLoadout` alone is 179 KB / 7.4 KB. It is not optional: the kit is
 * chosen after hydration and there is no server to ask, so it is all 305
 * loadouts or none, and none makes the kit door produce a build
 * indistinguishable from the bare-chassis one. `PickableKit` names the columns.
 */
const { data: catalog } = await useAsyncData('build-catalog', async () => {
  const [chassis, parts, kits] = await Promise.all([
    queryCollection('chassis')
      .select('id', 'stem', 'names', 'slots', 'defaultLoadout', 'rearRollersPerSide',
        'motorShaft', 'motorPosition', 'releaseYear', 'notes', 'thumbnail')
      .all(),
    // `status`, `releaseDate` and `priceJpy` are selected but deliberately not
    // shipped, as `releaseDate` is for the kits below: between them they order
    // every picker, and nothing in the builder renders any of the three.
    queryCollection('parts')
      .select('id', 'stem', 'names', 'category', 'slots', 'isCarPart', 'isAddOn', 'contents',
        'chassisCompat', 'classLegality', 'specs', 'colours', 'body', 'wheel', 'tire', 'finish', 'fitting',
        'status', 'releaseDate', 'priceJpy', 'thumbnail')
      .all(),
    // `releaseDate` is selected but deliberately not shipped: it orders the
    // picker and nothing renders it, so it is dropped again below.
    queryCollection('kits')
      .select('id', 'stem', 'names', 'chassis', 'status', 'gearRatio',
        'releaseDate', 'thumbnail',
        'loadoutSource', 'loadoutSourceTitle', 'stockLoadout', 'colours', 'body', 'bodyFinish')
      .all()
  ])
  // Normalise before comparing anything to anything: @nuxt/content overwrites
  // each record's own `id` with its source path, and `fromContent` is what puts
  // the Tamiya item number back. Building the chassis id set from the raw docs
  // gives a set of file paths, against which every kit's `ma`/`vs`/`ar` fails —
  // silently, as an empty picker rather than an error.
  //
  // `flagThumbnail` is the other normalisation, applied to all three
  // collections below: it swaps each record's stored thumbnail path for the one
  // bit of it the client cannot derive, worth 1.8 KB gzipped across the parts
  // and kits (shared/catalog/thumbnails.ts).
  const known = chassis.map(fromContent('chassis')).map(flagThumbnail)
  const chassisIds = new Set(known.map(c => c.id))
  return {
    chassis: known,
    // Tools, cases, stickers and setting gauges reach no picker (`goesOnCar`).
    // Dropping them at prerender rather than shipping and re-filtering in the browser
    // takes 39 of 382 records out of the payload.
    //
    // The 343 left are then ordered — regular range before limited, newest
    // first within each — and stripped of the three fields that ordered them,
    // on the same reasoning as the kits below: `partsForSlot` re-ranks on
    // legality and add-on alone, both of which it already ships. Shipping the
    // three instead would cost 2.8 KB gzipped, and since `priceJpy` used to
    // ship as the picker's only sort key, the route came out 1,043 bytes
    // lighter than before this order existed. Grouping by status and date is
    // not itself what saves them — it scatters records that id order kept
    // adjacent, and gzip does slightly worse on the result. Moving the keys
    // out of the payload refunds more than the new order costs.
    parts: orderParts(parts.map(fromContent('parts'))
      .filter(goesOnCar))
      .map(({ status: _status, releaseDate: _releaseDate, priceJpy: _priceJpy, ...part }) =>
        flagThumbnail(part)),
    // Ordered here rather than in the picker, and then stripped of the field
    // that ordered it. Sorting once at prerender beats re-sorting on every
    // keystroke, and it lets `releaseDate` — which nothing renders — stay out
    // of the payload, worth 1.5 KB gzipped across 305 records.
    //
    // The filter is not paranoia: a kit naming a chassis we do not ship would
    // let `start` succeed while `chassis` computed to undefined, bouncing the
    // reader back to the picker by a click that looked like it did nothing. No
    // kit is in that state today; this keeps it that way through a descoped
    // chassis rather than trusting it.
    kits: orderKits(kits.map(fromContent('kits')).filter(kit => chassisIds.has(kit.chassis)))
      .map(({ releaseDate: _releaseDate, ...kit }) => flagThumbnail(kit))
  }
})

const partsById = computed(() =>
  new Map((catalog.value?.parts ?? []).map(part => [part.id, part])))

/**
 * The categories a first upgrade reaches for, in the order a beginner meets
 * them, for the section under the builder that tells a reader — and a crawler —
 * what the site is (docs/PLAN.md §6 M1b). Its own query rather than a tally
 * over `catalog.parts`, which is filtered to what a picker can offer: it was
 * the five `bundle` sets that made the difference until they gained slots of
 * their own (§4.9), and it is every future category with none. Five rows reach
 * the payload, not the parts behind them.
 */
const HOME_CATEGORIES = ['roller', 'motor', 'gear', 'wheel-tire-set', 'bundle'] as const satisfies readonly PartCategory[]

const { data: homeCategoryCounts } = await useAsyncData('home-categories', async () => {
  const docs = await queryCollection('parts')
    .where('category', 'IN', [...HOME_CATEGORIES])
    .select('category', 'slots')
    .all()
  return HOME_CATEGORIES.map((category) => {
    const group = docs.filter(doc => doc.category === category)
    return { category, count: group.length, icon: commonestSlot(group) }
  })
})

const homeCategories = computed(() => (homeCategoryCounts.value ?? [])
  .map(entry => ({ ...entry, label: term(entry.category, `part.category.${entry.category}`) })))

// Everything a chassis card shows is already in the builder's payload; the
// kit count is the one number that tells a beginner which chassis is common.
const homeChassis = computed(() => {
  const kitCounts = new Map<string, number>()
  for (const entry of catalog.value?.kits ?? []) {
    kitCounts.set(entry.chassis, (kitCounts.get(entry.chassis) ?? 0) + 1)
  }
  return [...(catalog.value?.chassis ?? [])].sort(byChassisOrder).map(entry => ({
    ...entry,
    thumbnail: thumbnailSrc('chassis', entry),
    kitCount: kitCounts.get(entry.id)
  }))
})

const FAQ = ['classes', 'motors', 'limits'] as const

const { canShare, copied, copyLink, linkTrimmed, shareLink } = useBuildLink(() => catalog.value && {
  chassis: catalog.value.chassis,
  kits: catalog.value.kits,
  partsById: partsById.value
})

const chassis = computed(() =>
  catalog.value?.chassis.find(c => c.id === build.value?.chassis))

/**
 * Undefined for a bare-chassis build, and also for a build naming a kit we no
 * longer ship — a link made against an older catalog, say. Both degrade to the
 * chassis default, which is the shape the 13 kits with no wiki loadout already
 * render correctly. Everything downstream reads this rather than `build.kit`,
 * so a missing kit cannot become a header with no name behind it.
 */
const kit = computed(() =>
  catalog.value?.kits.find(k => k.id === build.value?.kit))

/** What the car is called once it leaves the page: the kit, else the chassis. */
const buildName = computed(() => {
  if (kit.value) return resolve(kit.value.names).value
  return chassis.value ? resolve(chassis.value.names).value : ''
})

/**
 * The chassis, even when the build came from a kit. Box art is the one picture
 * the reader already knows — it is what they picked off the shelf — so spending
 * this row on it says nothing new, while the chassis photo answers the question
 * the row exists to answer: which chassis is inside that box. The art is not
 * lost; `stockThumbFor` moves it to the body slot, which is the part of the car
 * it actually shows.
 *
 * Nothing before a base is chosen: the placeholder car above is MA, but this
 * row says no base is picked yet, and a photo would contradict it. The kit
 * fallback is for a chassis whose photo is missing, which none is today.
 */
const baseThumb = computed(() =>
  thumbnailSrc('chassis', chassis.value) ?? thumbnailSrc('kits', kit.value))

/**
 * A picture for a slot still holding what came in the box, where the box shows
 * it. Only the body qualifies: a kit's body entry is the moulded shell, which
 * has no product photo because Tamiya never sold it separately, and the box art
 * is a photograph of exactly that shell on exactly that car. The rest of a
 * stock loadout — gears, terminals, the propeller shaft — is inside the car in
 * the picture, not on it.
 */
const stockThumbFor = (slot: ResolvedSlot) =>
  slot.type === 'body' ? thumbnailSrc('kits', kit.value) : undefined

/** A build naming a chassis we do not ship is no build at all. */
const hasBuild = computed(() => !!chassis.value)

/**
 * Before anything is chosen the pane and the list still show a car: MA's slot
 * profile with every slot empty. MA because it is the chassis the 3D pane can
 * draw, so the placeholder car and the placeholder list describe the same thing.
 */
const PLACEHOLDER_CHASSIS: ChassisId = 'ma'

const shownChassis = computed(() =>
  chassis.value ?? catalog.value?.chassis.find(c => c.id === PLACEHOLDER_CHASSIS))

const slots = computed<ResolvedSlot[]>(() => {
  if (chassis.value && build.value) return resolveBuild(chassis.value, kit.value, build.value)
  return (shownChassis.value?.slots ?? []).map(slot => ({ ...slot, entries: [], swapped: false }))
})

/** The kit's until a gear slot is swapped, then the swapped gears' own, if known. */
const gearRatio = computed(() =>
  hasBuild.value ? gearRatioOf(slots.value, partsById.value, kit.value) : undefined)

const rollersPerSide = computed(() => rollersPerSideIn(slots.value, partsById.value, shownChassis.value))

const swappable = computed(() =>
  shownChassis.value
    ? swappableSlotTypes(catalog.value?.parts ?? [], shownChassis.value)
    : new Set<never>())

/**
 * A slot no catalog part can fill — the switch — is left out of the list: a
 * row the reader can do nothing with is noise in a build list. The scene has
 * no socket for those slots either.
 */
const listedSlots = computed(() => slots.value.filter(slot => swappable.value.has(slot.type)))

/**
 * Slots a beginner rarely changes, folded under one summary at the end of the
 * list. The summary names them, so a reader looking for gold terminals still
 * sees where they are without opening it. The pane draws some of them — gold
 * terminals, a coloured gear cover, the axles — but gives none a hit volume,
 * so a tap on the car never needs a row in here.
 */
const MORE_SLOT_TYPES = new Set<Slot>(['terminal', 'shaft', 'fastener', 'gear-cover', 'chassis-unit'])

const mainSlots = computed(() => listedSlots.value.filter(slot => !MORE_SLOT_TYPES.has(slot.type)))
const moreSlots = computed(() => listedSlots.value.filter(slot => MORE_SLOT_TYPES.has(slot.type)))

/**
 * Open is the reader's to toggle, with one exception: a change is never hidden,
 * so the group opens whenever something inside it is swapped. It is not closed
 * again on revert — that would fold the section away under the button just used.
 */
const moreOpen = ref(false)
watch(() => moreSlots.value.some(slot => slot.swapped), (swapped) => {
  if (swapped) moreOpen.value = true
}, { immediate: true })

const moreSummary = computed(() => t('build.moreSlots', {
  slots: moreSlots.value.map(slotLabel).join(t('build.listSeparator'))
}))

function onMoreToggle(event: Event) {
  moreOpen.value = (event.target as HTMLDetailsElement).open
}

const baseOpen = ref(false)

/**
 * The Starter Packs the empty base row offers as one-tap starts, in the guide's
 * order (`STARTER_PACKS`). Read out of the kits already in the payload, so they
 * cost nothing to ship; a pack missing from the catalog just drops out.
 */
const starterKits = computed(() => STARTER_PACKS.flatMap(id =>
  catalog.value?.kits.find(entry => entry.id === id) ?? []))

function chooseBase(chassisId: ChassisId, kitId?: string, entry?: 'starter') {
  // Before `start`, and only when the bench was empty: this button is also the
  // base row's Swap, and a reader changing their mind about a kit is not a new
  // build. Counting those would inflate the very ratio the 3D chunk's fate is
  // measured against (docs/PLAN.md §5.5).
  const first = !hasBuild.value

  start(chassisId, kitId)
  if (first) track('build_start', { chassis: chassisId, kit: kitId, entry: entry ?? (kitId ? 'kit' : 'chassis') })
  linkTrimmed.value = false
  baseOpen.value = false
  // A reader who arrived from a part page with nothing on the bench had to
  // answer this question first; now their part can land.
  placePending()
}

/**
 * Closing the base picker without choosing one abandons an add-to-build
 * handoff. Without this the item number would sit in state until the *next*
 * base was chosen — pages and minutes later — and drop a part on the car that
 * the reader had moved on from, announced by a notice they did not ask for.
 */
function closeBase() {
  baseOpen.value = false
  cancelPending()
}

/**
 * The part a reader asked for on its own page, put on the car (`pending` in
 * useBuild.ts). This screen is where that can be answered at all: the part page
 * knows an item number, and which slot it goes in is a question about a
 * chassis, a slot profile and the whole catalog, all of which live here.
 *
 * Three outcomes, and the reader is told about each: it goes somewhere, it
 * could go to several places and they choose, or it fits nothing on this car.
 */
const notice = ref('')
const pendingName = ref('')

/**
 * Held as ids and resolved against `slots`, for the same reason `openSlotId`
 * below is: the rows these name already live in `slots`, and a snapshot of them
 * would go stale the moment anything else changed the build.
 */
const pendingSlotIds = ref<string[]>([])

const pendingSlots = computed(() =>
  slots.value.filter(slot => pendingSlotIds.value.includes(slot.id)))

function placePending() {
  const id = pending.value
  if (!id) return
  const part = partsById.value.get(id)
  // An item number this catalog does not ship as a buildable part — a link made
  // against an older one — is dropped rather than carried around.
  if (!part) {
    pending.value = null
    return
  }
  pendingName.value = resolve(part.names).value

  if (!chassis.value) {
    baseOpen.value = true
    return
  }

  const ids = slotIdsFor(part, chassis.value)
  if (!ids.length) {
    notice.value = t('build.cannotAdd', { part: pendingName.value })
    // A part page offered a button that led nowhere on this chassis. Worth
    // knowing about: the fix is on the part page, not here.
    track('part_no_slot', { part: id, chassis: chassis.value.id })
    pending.value = null
    return
  }
  // A set fills several rows and there is no choice between them to offer, so
  // it never reaches the slot picker below.
  if (part.contents) {
    placeSet(part, 'part_page')
    cancelPending()
    return
  }
  if (ids.length > 1) {
    pendingSlotIds.value = ids
    return
  }
  place(ids[0]!)
}

/**
 * A parts set on the car: every row the box fills, in one change
 * (`setContentsFor`).
 *
 * The notice names those rows. This is the one action in the builder that
 * touches more than the row the reader was looking at, and a set that quietly
 * replaced the kit's rollers on its way past would read as a bug rather than as
 * what a First Try set is.
 */
function placeSet(part: BuildablePart, source: AnalyticsEvents['part_set_added']['source']) {
  if (!chassis.value) return
  const rows = setContentsFor(part, chassis.value)
  if (!rows.length) return

  swapMany(rows)
  track('part_set_added', { chassis: chassis.value.id, part: part.id, slots: rows.length, source })
  notice.value = t('build.addedSet', {
    part: resolve(part.names).value,
    slots: rows
      .flatMap(row => slots.value.find(slot => slot.id === row.slotId) ?? [])
      .map(slotLabel)
      .join(t('build.listSeparator'))
  })
  goToSlot(rows[0]!.slotId)
}

function place(slotId: string) {
  const id = pending.value
  if (!id) return
  const slot = slots.value.find(s => s.id === slotId)
  // A damper from its own page goes on beside the ones already fitted, the
  // way it would on the car; a motor replaces the motor.
  if (slot && canAddTo(slot)) {
    fitEdit(slot, addedTo(slot, id), id)
    trackAdd(slotId, id, 'part_page')
  }
  else {
    swap(slotId, [id])
    trackSwap(slotId, id, 'part_page')
    notice.value = t('build.added', {
      part: pendingName.value,
      slot: slot ? slotLabel(slot) : slotId
    })
  }
  cancelPending()
  // The row is often below the 3D pane, so the change would otherwise happen
  // off screen.
  scrollToSlot(slotId)
}

/** After the DOM has caught up with whatever just changed, not before. */
function scrollToSlot(slotId: string) {
  nextTick(() => document.getElementById(`slot-${slotId}`)
    ?.scrollIntoView({ behavior: 'smooth', block: 'center' }))
}

function cancelPending() {
  pending.value = null
  pendingSlotIds.value = []
}

onMounted(placePending)

/** Slot id -> what its front/rear counterpart would copy into it. */
const copies = computed(() => new Map(hasBuild.value
  ? listedSlots.value.map(slot => [slot.id, counterpartParts(slot, slots.value, partsById.value)])
  : []))

function copy(slotId: string) {
  const parts = copies.value.get(slotId)?.partIds
  if (!parts) return
  swap(slotId, parts)
  // The counterpart can hold more than one part; the first is what names the
  // swap, so `part` stays one bounded id rather than a composite.
  if (parts[0]) trackSwap(slotId, parts[0], 'copy')
}

/** Every swap is counted the same way; only `source` differs. */
function trackSwap(slotId: string, partId: string, source: AnalyticsEvents['part_swap']['source']) {
  if (chassis.value) track('part_swap', { chassis: chassis.value.id, slot: slotId, part: partId, source })
}

/**
 * Which door the open picker came through, so a swap can say whether the 3D
 * pane was the selection surface or the list was (docs/PLAN.md §5.4). It is
 * read once, when the part is chosen, so it only has to survive that long.
 */
const pickerSource = ref<'row' | 'scene'>('row')

/**
 * What the open picker's choice does to a stacking slot (`stacks`): `add` puts
 * it beside what is there, a number replaces that one entry — a tapped damper
 * on the car — and undefined replaces the whole slot, as on every other row.
 */
const pickerAt = ref<'add' | number>()

function openFromRow(slotId: string, at?: 'add') {
  pickerSource.value = 'row'
  pickerAt.value = at
  openSlotId.value = slotId
}

/**
 * One edit to a stacking slot, on the car and in words. The notice is the
 * point: stock pieces with no item number cannot ride along in a swap, and
 * one that vanished from the list without a word would read as a bug.
 * `added` is the part put on beside the rest, which the notice names.
 */
function fitEdit(slot: ResolvedSlot, edit: SlotEdit, added?: string) {
  swap(slot.id, edit.partIds)
  const part = added ? partsById.value.get(added) : undefined
  // The lost stock pieces outrank the confirmation: the new part is on the
  // row in plain sight, the missing ones are not.
  if (edit.dropped) notice.value = t('build.droppedStock', { slot: slotLabel(slot) })
  else if (part) notice.value = t('build.addedTo', { part: resolve(part.names).value, slot: slotLabel(slot) })
}

function trackAdd(slotId: string, partId: string, source: AnalyticsEvents['part_add']['source']) {
  if (chassis.value) track('part_add', { chassis: chassis.value.id, slot: slotId, part: partId, source })
}

function removeEntry(slot: ResolvedSlot, index: number) {
  const partId = slot.entries[index]?.partId
  fitEdit(slot, removedFrom(slot, index))
  if (chassis.value) track('part_remove', { chassis: chassis.value.id, slot: slot.id, part: partId })
}

function revertSlot(slotId: string) {
  revert(slotId)
  if (chassis.value) track('part_revert', { chassis: chassis.value.id, slot: slotId })
}

// The slot being filled is held by id, not as a copy of the row: the row it
// names already lives in `slots`, and a snapshot would go stale the moment
// anything else changed the build.
const openSlotId = ref<string | null>(null)

const openSlot = computed<ResolvedSlot | null>(() =>
  slots.value.find(slot => slot.id === openSlotId.value) ?? null)

/**
 * The pane mounts only after hydration. Hydrated in place, Nuxt's `.client.vue`
 * wrapper runs the scene's `onMounted` while its server placeholder is still
 * in the DOM, so there is no canvas yet and the scene silently never starts.
 */
const hydrated = ref(false)
let sceneMountedAt = 0
onMounted(() => {
  hydrated.value = true
  sceneMountedAt = performance.now()
})

// The pane is keyed by chassis, so choosing a different one destroys and
// rebuilds it and it emits `ready` again. Without this the second car would
// report how long the reader had been on the page, not how long it took to
// draw — and `pre` flush puts this before the remount.
// It also starts on a blank canvas, so whatever stands in for it comes back.
watch(() => shownChassis.value?.id, () => {
  sceneMountedAt = performance.now()
  sceneReady.value = false
})

/**
 * The poster is a screenshot of the empty MA scene at the home view, one per
 * frame aspect, so the pane is not blank for the ~2.5 s the three chunk takes
 * on a slow-4G phone (measured 2026-09-16). It is server-rendered and swapped
 * out when the scene's first frame lands, which draws the same picture. Only
 * the empty car matches it, so a build — kept in state across client-side
 * navigation — mounts with no poster. Retake it when the camera, colours or
 * MA sockets change.
 */
const sceneReady = ref(false)

/**
 * How long the reader looked at the poster before the car appeared. The 3D
 * chunk is the page's largest single cost, so this is the other half of the
 * evidence for keeping it (docs/PLAN.md §5.5).
 */
function onSceneReady() {
  sceneReady.value = true
  if (shownChassis.value) {
    track('scene_ready', { chassis: shownChassis.value.id, ms: Math.round(performance.now() - sceneMountedAt) })
  }
}
function onScenePower() {
  if (shownChassis.value) track('scene_power', { chassis: shownChassis.value.id })
}
/**
 * The motor plays unasked now, so this counts the readers who reach over and
 * silence it — which is the evidence for whether playing it was welcome.
 */
function onSceneMute(muted: boolean) {
  if (shownChassis.value) track('scene_mute', { chassis: shownChassis.value.id, muted })
}
const showPoster = computed(() => shownChassis.value?.id === PLACEHOLDER_CHASSIS && !hasBuild.value && !sceneReady.value)
/**
 * The poster is a still of the very car the pane will draw, so on its own it
 * reads as a finished picture that ignores every tap. This says the real one
 * is on its way. Server-rendered like the poster, and shown over a shared
 * build's empty frame too, which waits on the same chunk with no picture.
 */
const showSceneLoading = computed(() => !!shownChassis.value && !sceneReady.value)

/**
 * A tap on the car opens the same picker as the row's Swap button, with the
 * same guard: a slot no catalog part can fill has nothing to pick from. On the
 * placeholder car there is nothing to swap yet, so a tap asks for the kit.
 */
function pick(slotId: string, entry?: number) {
  // Counted before the guard: a tap on the placeholder car is still someone
  // trying to use the pane as the selection surface, and it is the reader most
  // worth knowing about — they have not started a build yet.
  if (shownChassis.value) {
    track('scene_tap', { chassis: shownChassis.value.id, slot: slotId, has_build: hasBuild.value })
  }
  if (!hasBuild.value) {
    baseOpen.value = true
    return
  }
  const slot = slots.value.find(s => s.id === slotId)
  if (slot && swappable.value.has(slot.type)) {
    pickerSource.value = 'scene'
    // A tap on one damper changes that one; the rest of the slot stays.
    pickerAt.value = stacks(slot) ? entry : undefined
    openSlotId.value = slotId
  }
}

const candidates = computed(() =>
  openSlot.value && chassis.value
    ? partsForSlot(catalog.value?.parts ?? [], openSlot.value.type, chassis.value, buildClass.value)
    : [])

const openSlotLabel = computed(() =>
  openSlot.value ? slotLabel(openSlot.value) : '')

/**
 * A selection puts one of the part in the slot: in place of what was there,
 * beside the rest of a stacking slot opened to add, or in place of the one
 * damper tapped on the car (`pickerAt`). How many packets a mirrored or
 * multi-count slot actually needs is a question for the totals, which land
 * with the rule engine — guessing it here would put four bearing packets in a
 * build that needs one.
 */
function choose(partId: string) {
  const part = partsById.value.get(partId)
  // A set is offered in every picker its contents can fill, and fits whole from
  // any of them: picking a First Try set in the roller list and getting only
  // its rollers would leave the plates it came with nowhere.
  const slot = openSlot.value
  const at = pickerAt.value
  if (part?.contents) {
    placeSet(part, pickerSource.value)
  }
  else if (slot && at === 'add') {
    fitEdit(slot, addedTo(slot, partId), partId)
    trackAdd(slot.id, partId, pickerSource.value)
  }
  else if (slot && typeof at === 'number') {
    fitEdit(slot, replacedIn(slot, at, partId))
    trackSwap(slot.id, partId, pickerSource.value)
  }
  else if (slot) {
    swap(slot.id, [partId])
    trackSwap(slot.id, partId, pickerSource.value)
  }
  closePicker()
}

function closePicker() {
  openSlotId.value = null
  // Every way in sets it again, but a stale `add` or entry index must not be
  // what the next way in finds if one ever forgets.
  pickerAt.value = undefined
}

// The three dialogs load on first open. `lazyPicker` is what shows the tap was
// heard while a chunk is in flight, and says so when it never arrives.
const BasePicker = lazyPicker(() => import('~/components/build/BasePicker.vue'), closeBase)
const SlotPicker = lazyPicker(() => import('~/components/build/SlotPicker.vue'), cancelPending)
const PartPicker = lazyPicker(() => import('~/components/build/PartPicker.vue'), closePicker)

/**
 * The rule engine's findings, each with its words resolved once here — the page
 * is what holds the names, slots and chassis a message interpolates — and shown
 * twice: in the summary under the title and on the row it is about.
 */
const findings = computed(() => {
  if (!chassis.value || !build.value) return []
  return checkBuild({
    slots: slots.value,
    chassis: chassis.value,
    partsById: partsById.value,
    buildClass: buildClass.value,
    linkTrimmed: linkTrimmed.value
  }).map(finding => ({ ...finding, text: findingText(finding) }))
})

/**
 * The class toggle shows only while it can change a finding. Without it, a
 * finding about a part banned or unchecked in every class names no class: the
 * reader never picked one, and the answer would be the same whichever they did.
 */
const buildClassDecides = computed(() => classDecides(slots.value, partsById.value))
const classLabel = computed(() =>
  buildClassDecides.value ? t(`part.class.${buildClass.value}`) : t('build.rules.anyClass'))

function findingText(finding: Finding) {
  const part = finding.partId ? partsById.value.get(finding.partId) : undefined
  const slot = finding.slotId ? slots.value.find(s => s.id === finding.slotId) : undefined
  return t(`build.rules.message.${finding.rule}`, {
    part: part ? resolve(part.names).value : finding.partId ?? '',
    slot: slot ? slotLabel(slot) : '',
    chassis: chassis.value ? resolve(chassis.value.names).value : '',
    shaft: chassis.value ? t(`build.rules.shaft.${chassis.value.motorShaft}`) : '',
    motor: term('motor'),
    class: classLabel.value
  })
}

// Not Map.groupBy: it is too new for the phones this page is built for.
const findingsBySlot = computed(() => {
  const bySlot = new Map<string, typeof findings.value>()
  for (const finding of findings.value) {
    if (!finding.slotId) continue
    const list = bySlot.get(finding.slotId)
    if (list) list.push(finding)
    else bySlot.set(finding.slotId, [finding])
  }
  return bySlot
})

/**
 * Rule-warning frequency (docs/PLAN.md §4.1), counted once per build rather
 * than once per recompute.
 *
 * `findings` recomputes on every swap, revert and class change, so reporting it
 * straight would measure how much a reader fiddled, not which rules bite. The
 * set makes each distinct finding cost one event for the life of a build, which
 * turns the metric into "share of builds where rule X fired" — the only shape
 * a decision can be made on.
 *
 * Keyed by slot as well as rule, so flipping the class from Open to Junior and
 * turning a motor illegal still registers: that is a different fact about a
 * different part, not a repeat.
 */
/**
 * What has already been reported, and which build it belongs to.
 *
 * In `useState`, not a local, for the same reason `countedHash` is: this page
 * unmounts whenever the reader follows a part link and mounts again when they
 * come back, which the add-to-builder funnel makes a routine move. Component
 * scope would forget on every round trip and re-report every standing finding.
 * A record rather than a `Set` so it survives the payload as plain JSON.
 */
const reportedRules = useState<Record<string, true>>('reported-rules', () => ({}))
const reportedFor = useState<string | undefined>('reported-rules-build', () => undefined)

/**
 * The comparison lives *inside* the findings watcher rather than in a watcher
 * of its own. Both would be `pre` jobs on the same component, so Vue runs them
 * in the order reactivity reaches them, not the order they are written — and on
 * the `null` to a kit transition, which is how nearly every session starts,
 * `findings` is reached first. Clearing from a second watcher therefore wiped
 * the record immediately *after* its events fired, and every build's opening
 * findings went out twice.
 */
watch(findings, (list) => {
  const current = build.value ? `${build.value.chassis}:${build.value.kit ?? ''}` : undefined
  // `swap` and `revert` replace `build.value` wholesale, so only a new chassis
  // or kit is a new build.
  if (current !== reportedFor.value) {
    reportedFor.value = current
    reportedRules.value = {}
  }

  for (const finding of list) {
    const key = `${finding.rule}:${finding.slotId ?? ''}`
    if (reportedRules.value[key]) continue
    reportedRules.value[key] = true
    track('rule_triggered', {
      rule: finding.rule,
      severity: finding.severity,
      slot: finding.slotId,
      build_class: buildClass.value
    })
  }
})

/** From a finding to its row, opening the folded group first when it is in there. */
function goToSlot(slotId: string) {
  if (moreSlots.value.some(slot => slot.id === slotId)) moreOpen.value = true
  scrollToSlot(slotId)
}

/**
 * The class is the reader's, not the build's: it names the event they race, so
 * it stays out of the share link and is remembered per browser instead. Storage
 * can be absent or throw (private windows, blocked site data), and the page
 * works the same without it.
 */
const CLASS_KEY = 'build-class'

/** Restoring last visit's class is not the reader choosing one; see below. */
let restoringClass = false

onMounted(() => {
  try {
    const saved = localStorage.getItem(CLASS_KEY)
    // The equality test is load-bearing. Assigning the value it already holds
    // — `open`, the default, is also the commonest thing to have saved — does
    // not fire the watcher, so the flag would stay armed for the life of the
    // page and swallow the reader's next real change instead of this one.
    if (isBuildClass(saved) && saved !== buildClass.value) {
      restoringClass = true
      buildClass.value = saved
    }
  }
  catch {}
})

watch(buildClass, (value) => {
  // The watcher cannot tell a tap on the class toggle from this page reading
  // the same value back out of storage, and counting the second would report a
  // class change for every returning reader on every page load.
  if (restoringClass) restoringClass = false
  else track('build_class_set', { build_class: value })

  try {
    localStorage.setItem(CLASS_KEY, value)
  }
  catch {}
})

// Leads with what a reader comes to do rather than with the list's own name,
// which stays the <h1> beside its share buttons.
const title = computed(() => `${t('build.pageTitle')} — ${t('site.title')}`)

// The root of the site, so it also carries `WebSite`: that is where Google
// takes the site name it prints above a result, for every page under it.
useHead(() => ({
  title: title.value,
  meta: [
    { name: 'description', content: t('build.description') },
    { property: 'og:title', content: title.value },
    { property: 'og:description', content: t('build.description') }
  ],
  script: [{
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      'name': t('site.title'),
      // A CreativeWork property, so it belongs here and not on a part's Product.
      'inLanguage': locale.value,
      'url': `${siteUrl}${localePath('/')}`
    })
  }]
}))
</script>

<template>
  <div class="build">
    <!-- 3D first, the list beneath it (§5.4), and both always on screen. The
         frame reserves the pane's space before the three chunk arrives, so the
         list does not jump when the canvas appears. Keyed by chassis so a
         different socket table gets a fresh scene rather than a patched one. -->
    <div class="scene-frame">
      <picture v-if="showPoster" class="scene-poster">
        <source media="(min-width: 640px)" srcset="/images/scene-poster-16x9.webp">
        <img src="/images/scene-poster-4x3.webp" alt="" width="712" height="534">
      </picture>
      <p v-if="showSceneLoading" class="scene-loading" role="status">
        {{ $t('build.scene.loading') }}
      </p>
      <LazyBuildScene
        v-if="shownChassis && hydrated"
        :key="shownChassis.id"
        :chassis="shownChassis.id"
        :kit-body="kit?.body ?? null"
        :kit-colours="kit?.colours ?? null"
        :kit-body-finish="kit?.bodyFinish ?? null"
        :slots="slots"
        :parts="partsById"
        :open-slot-id="openSlotId"
        @select="pick"
        @ready="onSceneReady"
        @power="onScenePower"
        @mute="onSceneMute"
      />
    </div>
    <p class="scene-hint">
      {{ hasBuild ? $t('build.scene.hint') : $t('build.scene.hintEmpty') }}
    </p>

    <!-- The link is the build's only save and its only way to reach anyone
         else, so it gets real buttons beside the title rather than a text
         link. The share sheet leads where the browser has one; copying stays
         for desktop and for pasting into a forum. -->
    <div class="build-list-header">
      <h1 class="build-list-title">{{ $t('build.title') }}</h1>
      <div v-if="hasBuild" class="build-share-actions">
        <UButton
          v-if="canShare"
          icon="i-lucide-share-2"
          @click="shareLink(buildName)"
        >
          {{ $t('build.share.send') }}
        </UButton>
        <!-- Copy is the primary action only where there is no share sheet to
             be secondary to. The tick is the whole feedback: `aria-live`
             carries the same change to a reader who cannot see it. -->
        <UButton
          :icon="copied ? 'i-lucide-check' : 'i-lucide-link'"
          v-bind="emphasis(!canShare)"
          aria-live="polite"
          @click="copyLink"
        >
          {{ copied ? $t('build.share.copied') : $t('build.share.copy') }}
        </UButton>
      </div>
    </div>

    <BuildFindings
      v-model:build-class="buildClass"
      :findings="findings"
      :has-build="hasBuild"
      :class-decides="buildClassDecides"
      :class-label="classLabel"
      @go="goToSlot"
    />

    <p v-if="notice" class="build-notice" aria-live="polite">
      <span>{{ notice }}</span>
      <UButton variant="link" color="neutral" size="xs" @click="notice = ''">{{ $t('build.dismiss') }}</UButton>
    </p>

    <ul class="slot-list">
      <!-- What the car is built on. Once a kit is chosen it is the build's
           identity, but the chassis stays on screen: the slot profile comes
           from it, and a beginner who picked a box by its art needs to learn
           which chassis is inside. -->
      <li class="slot-row base-row">
        <div class="slot-label">{{ $t('build.base') }}</div>
        <div class="slot-entries base-entry">
          <!-- The chassis, kit or no kit: the first line names the box and the
               second names the chassis, and this is the one of the two a
               beginner has never seen. -->
          <CatalogThumb class="base-thumb" :src="baseThumb" icon="chassis" />
          <div class="base-text">
            <template v-if="hasBuild && chassis">
              <p class="slot-entry" :class="{ fallback: kit && isFallback(kit.names) }">
                {{ kit ? resolve(kit.names).value : resolve(chassis.names).value }}
              </p>
              <p class="build-subtitle">
                <span>{{ kit ? resolve(chassis.names).value : $t('build.bareChassis') }}</span>
                <span v-if="gearRatio">{{ gearRatio }}</span>
                <UBadge v-if="kit?.status === 'limited'" color="warning" variant="subtle" size="sm">
                  {{ $t('build.kitStatus.limited') }}
                </UBadge>
              </p>
            </template>
            <p v-else class="slot-empty">{{ $t('build.noBase') }}</p>
          </div>
        </div>
        <div class="slot-actions">
          <!-- Solid while the bench is empty, because then it is the only
               thing on the page to do; an outline once there is a car, where
               it is one row's action among many. -->
          <UButton
            size="xs"
            v-bind="emphasis(!hasBuild)"
            @click="baseOpen = true"
          >
            {{ hasBuild ? $t('build.swap') : $t('build.pickBase') }}
          </UButton>
        </div>
        <!-- The boxes the starter guide recommends, one tap from a car, for a
             reader who has none yet. Only while the bench is empty: once a
             base is chosen this row is the car's, and Swap is the way out. -->
        <div v-if="!hasBuild && starterKits.length" class="starter-picks">
          <p class="starter-heading">
            {{ $t('build.starter.heading') }}
            <NuxtLink :to="localePath('/guides/starter')">{{ $t('build.starter.guide') }}</NuxtLink>
          </p>
          <ul>
            <li v-for="entry in starterKits" :key="entry.id">
              <button type="button" @click="chooseBase(entry.chassis, entry.id, 'starter')">
                <CatalogThumb :src="thumbnailSrc('kits', entry)" icon="body" />
                <span class="starter-name">{{ $t(`build.starter.spec.${entry.id}`) }}</span>
                <span class="part-id">{{ entry.id }}</span>
              </button>
            </li>
          </ul>
        </div>
      </li>

      <BuildSlotRow
        v-for="slot in mainSlots"
        :key="slot.id"
        :slot="slot"
        :parts-by-id="partsById"
        :swappable="hasBuild"
        :stock-thumb="stockThumbFor(slot)"
        :copy-from="copies.get(slot.id)?.from"
        :findings="findingsBySlot.get(slot.id)"
        :rollers-per-side="rollersPerSide.get(slot.id)"
        @open="openFromRow(slot.id)"
        @add="openFromRow(slot.id, 'add')"
        @remove="index => removeEntry(slot, index)"
        @revert="revertSlot(slot.id)"
        @copy="copy(slot.id)"
      />
    </ul>

    <details v-if="moreSlots.length" class="more-slots" :open="moreOpen" @toggle="onMoreToggle">
      <summary>
        {{ moreSummary }}
      </summary>
      <ul class="slot-list">
        <BuildSlotRow
          v-for="slot in moreSlots"
          :key="slot.id"
          :slot="slot"
          :parts-by-id="partsById"
          :swappable="hasBuild"
          :stock-thumb="stockThumbFor(slot)"
          :copy-from="copies.get(slot.id)?.from"
          :findings="findingsBySlot.get(slot.id)"
          :rollers-per-side="rollersPerSide.get(slot.id)"
          @open="openFromRow(slot.id)"
          @add="openFromRow(slot.id, 'add')"
          @remove="index => removeEntry(slot, index)"
          @revert="revertSlot(slot.id)"
          @copy="copy(slot.id)"
        />
      </ul>
    </details>

    <!-- Sits with the slot list it credits rather than in a page footer, so
         the attribution travels with the content it covers. -->
    <BuildKitCredit v-if="kit" :kit="kit" />

    <!-- The pictures are ours to serve but not ours to own: thumbnails we
         generated from Tamiya's product photos (docs/PLAN.md §6 M1b). Credited
         on the page that shows them, list and pickers alike, rather than only
         on a site-wide attribution page. -->
    <!-- What the site is, for a reader who scrolls past the builder and for a
         crawler, which only ever sees the empty one: the build lives in the
         hash. Below the builder so the first screen stays the builder, and
         open rather than collapsed (docs/PLAN.md §6 M1b). Above the credit,
         which covers the chassis pictures here too. -->
    <section class="home-about">
      <h2>{{ $t('home.title') }}</h2>
      <p>{{ $t('home.intro') }}</p>
      <h3>{{ $t('home.steps.title') }}</h3>
      <ol class="home-steps">
        <li>{{ $t('home.steps.pick') }}</li>
        <li>{{ $t('home.steps.swap') }}</li>
        <li>{{ $t('home.steps.check') }}</li>
      </ol>

      <h2>{{ $t('home.chassis.title') }}</h2>
      <p>{{ $t('home.chassis.intro') }}</p>
      <ChassisLinkList :chassis="homeChassis" />

      <h2>{{ $t('home.parts.title') }}</h2>
      <p>{{ $t('home.parts.intro') }}</p>
      <CategoryLinkGrid :categories="homeCategories" />
      <p>
        <NuxtLink :to="localePath('/parts')">{{ $t('home.parts.all') }}</NuxtLink>
      </p>

      <h2>{{ $t('home.faq.title') }}</h2>
      <template v-for="key in FAQ" :key="key">
        <h3>{{ $t(`home.faq.${key}.q`) }}</h3>
        <p>{{ $t(`home.faq.${key}.a`) }}</p>
      </template>
    </section>

    <ImageCredit />

    <BasePicker
      v-if="baseOpen"
      :kits="catalog?.kits ?? []"
      :chassis="catalog?.chassis ?? []"
      @select="chooseBase"
      @close="closeBase"
    />

    <SlotPicker
      v-if="pendingSlots.length"
      :slots="pendingSlots"
      :part-name="pendingName"
      @select="place"
      @close="cancelPending"
    />

    <PartPicker
      v-if="openSlot"
      :candidates="candidates"
      :slot-type="openSlot.type"
      :slot-label="openSlotLabel"
      :adding="pickerAt === 'add'"
      :build-class="buildClass"
      @select="choose"
      @close="closePicker"
    />
  </div>
</template>
