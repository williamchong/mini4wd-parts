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
  counterpartParts, gearRatioOf, isBuildClass, partsForSlot, resolveBuild, rollersPerSideIn, slotIdsFor,
  swappableSlotTypes
} from '#shared/catalog/build'
import { orderKits } from '#shared/catalog/kits'
import { checkBuild } from '#shared/catalog/rules'
import { flagThumbnail, thumbnailSrc } from '#shared/catalog/thumbnails'
import type { ResolvedSlot } from '#shared/catalog/build'
import type { Finding } from '#shared/catalog/rules'
import type { ChassisId, Slot } from '#shared/catalog/schema'
import type { AnalyticsEvents } from '~/composables/useAnalytics'

definePageMeta({ layout: 'content' })

const { t, locale } = useI18n()
const localePath = useLocalePath()
const siteUrl = useRuntimeConfig().public.siteUrl
const { resolve, isFallback } = useCatalogName()
const { term, slotLabel } = useTerm()
const { build, buildClass, pending, start, swap, revert } = useBuild()
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
      .select('id', 'stem', 'names', 'slots', 'defaultLoadout',
        'motorShaft', 'motorPosition', 'releaseYear', 'notes', 'thumbnail')
      .all(),
    queryCollection('parts')
      .select('id', 'stem', 'names', 'category', 'slots', 'isCarPart', 'isAddOn',
        'chassisCompat', 'classLegality', 'specs', 'colours', 'body', 'wheel', 'tire', 'finish', 'fitting',
        'priceJpy', 'thumbnail')
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
    // Tools, cases, stickers and setting gauges reach no picker: `partsForSlot`
    // requires `isCarPart`, and a part slotted `none` fills nothing. Dropping
    // them at prerender rather than shipping and re-filtering in the browser
    // takes 56 of 382 records out of the payload.
    parts: parts.map(fromContent('parts'))
      .filter(part => part.isCarPart && part.slots.some(slot => slot !== 'none'))
      .map(flagThumbnail),
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

const rollersPerSide = computed(() => rollersPerSideIn(slots.value, partsById.value))

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

function chooseBase(chassisId: ChassisId, kitId?: string) {
  // Before `start`, and only when the bench was empty: this button is also the
  // base row's Swap, and a reader changing their mind about a kit is not a new
  // build. Counting those would inflate the very ratio the 3D chunk's fate is
  // measured against (docs/PLAN.md §5.5).
  const first = !hasBuild.value

  start(chassisId, kitId)
  if (first) track('build_start', { chassis: chassisId, kit: kitId, entry: kitId ? 'kit' : 'chassis' })
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
  if (ids.length > 1) {
    pendingSlotIds.value = ids
    return
  }
  place(ids[0]!)
}

function place(slotId: string) {
  const id = pending.value
  if (!id) return
  swap(slotId, [id])
  trackSwap(slotId, id, 'part_page')
  const slot = slots.value.find(s => s.id === slotId)
  notice.value = t('build.added', {
    part: pendingName.value,
    slot: slot ? slotLabel(slot) : slotId
  })
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

function openFromRow(slotId: string) {
  pickerSource.value = 'row'
  openSlotId.value = slotId
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
watch(() => shownChassis.value?.id, () => { sceneMountedAt = performance.now() })

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
const showPoster = computed(() => shownChassis.value?.id === PLACEHOLDER_CHASSIS && !hasBuild.value && !sceneReady.value)

/**
 * A tap on the car opens the same picker as the row's Swap button, with the
 * same guard: a slot no catalog part can fill has nothing to pick from. On the
 * placeholder car there is nothing to swap yet, so a tap asks for the kit.
 */
function pick(slotId: string) {
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
 * A selection puts one of the part in the slot. How many packets a mirrored or
 * multi-count slot actually needs is a question for the totals, which land with
 * the rule engine — guessing it here would put four bearing packets in a build
 * that needs one.
 */
function choose(partId: string) {
  if (openSlotId.value) {
    swap(openSlotId.value, [partId])
    trackSwap(openSlotId.value, partId, pickerSource.value)
  }
  openSlotId.value = null
}

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

function findingText(finding: Finding) {
  const part = finding.partId ? partsById.value.get(finding.partId) : undefined
  const slot = finding.slotId ? slots.value.find(s => s.id === finding.slotId) : undefined
  return t(`build.rules.message.${finding.rule}`, {
    part: part ? resolve(part.names).value : finding.partId ?? '',
    slot: slot ? slotLabel(slot) : '',
    chassis: chassis.value ? resolve(chassis.value.names).value : '',
    shaft: chassis.value ? t(`build.rules.shaft.${chassis.value.motorShaft}`) : '',
    motor: term('motor'),
    class: t(`part.class.${buildClass.value}`)
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

const title = computed(() => `${t('build.title')} — ${t('site.title')}`)

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
        <button v-if="canShare" type="button" class="primary" @click="shareLink(buildName)">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" />
            <path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4" />
          </svg>
          {{ $t('build.share.send') }}
        </button>
        <button type="button" :class="canShare ? 'secondary' : 'primary'" aria-live="polite" @click="copyLink">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path v-if="copied" d="m5 12.5 4.5 4.5L19 7.5" />
            <template v-else>
              <path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" />
              <path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
            </template>
          </svg>
          {{ copied ? $t('build.share.copied') : $t('build.share.copy') }}
        </button>
      </div>
    </div>

    <BuildFindings
      v-model:build-class="buildClass"
      :findings="findings"
      :has-build="hasBuild"
      @go="goToSlot"
    />

    <p v-if="notice" class="build-notice" aria-live="polite">
      <span>{{ notice }}</span>
      <button type="button" class="link" @click="notice = ''">{{ $t('build.dismiss') }}</button>
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
                <span v-if="kit?.status === 'limited'" class="kit-status">
                  {{ $t('build.kitStatus.limited') }}
                </span>
              </p>
            </template>
            <p v-else class="slot-empty">{{ $t('build.noBase') }}</p>
          </div>
        </div>
        <div class="slot-actions">
          <button type="button" :class="{ primary: !hasBuild }" @click="baseOpen = true">
            {{ hasBuild ? $t('build.swap') : $t('build.pickBase') }}
          </button>
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
    <ImageCredit />

    <LazyBuildBasePicker
      v-if="baseOpen"
      :kits="catalog?.kits ?? []"
      :chassis="catalog?.chassis ?? []"
      @select="chooseBase"
      @close="closeBase"
    />

    <LazyBuildSlotPicker
      v-if="pendingSlots.length"
      :slots="pendingSlots"
      :part-name="pendingName"
      @select="place"
      @close="cancelPending"
    />

    <LazyBuildPartPicker
      v-if="openSlot"
      :candidates="candidates"
      :slot-type="openSlot.type"
      :slot-label="openSlotLabel"
      :build-class="buildClass"
      @select="choose"
      @close="openSlotId = null"
    />
  </div>
</template>
