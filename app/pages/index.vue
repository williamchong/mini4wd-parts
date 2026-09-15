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
  counterpartParts, partsForSlot, resolveBuild, swappableSlotTypes
} from '#shared/catalog/build'
import { orderKits } from '#shared/catalog/kits'
import { SCENE_CHASSIS } from '#shared/scene/chassis'
import type { ResolvedSlot } from '#shared/catalog/build'
import type { ChassisId, Slot } from '#shared/catalog/schema'

definePageMeta({ layout: 'content' })

const { t } = useI18n()
const { resolve, isFallback } = useCatalogName()
const { slotLabel } = useTerm()
const { build, buildClass, start, swap, revert } = useBuild()

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
        'motorShaft', 'motorPosition', 'releaseYear', 'notes')
      .all(),
    queryCollection('parts')
      .select('id', 'stem', 'names', 'category', 'slots', 'isCarPart',
        'chassisCompat', 'classLegality', 'specs', 'priceJpy')
      .all(),
    // `releaseDate` is selected but deliberately not shipped: it orders the
    // picker and nothing renders it, so it is dropped again below.
    queryCollection('kits')
      .select('id', 'stem', 'names', 'chassis', 'status', 'gearRatio',
        'releaseDate', 'officialImage',
        'loadoutSource', 'loadoutSourceTitle', 'stockLoadout')
      .all()
  ])
  // Normalise before comparing anything to anything: @nuxt/content overwrites
  // each record's own `id` with its source path, and `fromContent` is what puts
  // the Tamiya item number back. Building the chassis id set from the raw docs
  // gives a set of file paths, against which every kit's `ma`/`vs`/`ar` fails —
  // silently, as an empty picker rather than an error.
  const known = chassis.map(fromContent('chassis'))
  const chassisIds = new Set(known.map(c => c.id))
  return {
    chassis: known,
    // Tools, cases, stickers and setting gauges reach no picker: `partsForSlot`
    // requires `isCarPart`, and a part slotted `none` fills nothing. Dropping
    // them at prerender rather than shipping and re-filtering in the browser
    // takes 56 of 382 records out of the payload.
    parts: parts.map(fromContent('parts'))
      .filter(part => part.isCarPart && part.slots.some(slot => slot !== 'none')),
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
      .map(({ releaseDate: _releaseDate, ...kit }) => kit)
  }
})

const partsById = computed(() =>
  new Map((catalog.value?.parts ?? []).map(part => [part.id, part])))

const { copied, copyLink } = useBuildLink(() => catalog.value && {
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
 * sees where they are without opening it. None has a socket in the 3D pane, so
 * a tap on the car never needs a row in here.
 */
const MORE_SLOT_TYPES = new Set<Slot>(['terminal', 'shaft', 'fastener'])

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
  start(chassisId, kitId)
  baseOpen.value = false
}

/** Slot id -> what its front/rear counterpart would copy into it. */
const copies = computed(() => new Map(hasBuild.value
  ? listedSlots.value.map(slot => [slot.id, counterpartParts(slot, slots.value, partsById.value)])
  : []))

function copy(slotId: string) {
  const parts = copies.value.get(slotId)?.partIds
  if (parts) swap(slotId, parts)
}

// The slot being filled is held by id, not as a copy of the row: the row it
// names already lives in `slots`, and a snapshot would go stale the moment
// anything else changed the build.
const openSlotId = ref<string | null>(null)

const openSlot = computed<ResolvedSlot | null>(() =>
  slots.value.find(slot => slot.id === openSlotId.value) ?? null)

/**
 * Whether the 3D pane can draw this chassis at all (docs/PLAN.md §5.5). Only
 * MA has a socket table today; the other seven show a placeholder in the pane
 * and build from the list. Read from its own module rather than from the
 * socket table — see shared/scene/chassis.ts for the 10.7 KB that sharing the
 * table cost.
 */
const hasScene = computed(() => !!shownChassis.value && SCENE_CHASSIS.has(shownChassis.value.id))

/**
 * The pane mounts only after hydration. Hydrated in place, Nuxt's `.client.vue`
 * wrapper runs the scene's `onMounted` while its server placeholder is still
 * in the DOM, so there is no canvas yet and the scene silently never starts.
 */
const hydrated = ref(false)
onMounted(() => { hydrated.value = true })

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
const showPoster = computed(() => shownChassis.value?.id === PLACEHOLDER_CHASSIS && !hasBuild.value && !sceneReady.value)

/**
 * A tap on the car opens the same picker as the row's Swap button, with the
 * same guard: a slot no catalog part can fill has nothing to pick from. On the
 * placeholder car there is nothing to swap yet, so a tap asks for the kit.
 */
function pick(slotId: string) {
  if (!hasBuild.value) {
    baseOpen.value = true
    return
  }
  const slot = slots.value.find(s => s.id === slotId)
  if (slot && swappable.value.has(slot.type)) openSlotId.value = slotId
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
  if (openSlotId.value) swap(openSlotId.value, [partId])
  openSlotId.value = null
}

useHead(() => ({ title: `${t('build.title')} — ${t('site.title')}` }))
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
        v-if="hasScene && shownChassis && hydrated"
        :key="shownChassis.id"
        :chassis="shownChassis.id"
        :slots="slots"
        :parts="partsById"
        :open-slot-id="openSlotId"
        @select="pick"
        @ready="sceneReady = true"
      />
      <p v-else-if="!hasScene" class="scene-placeholder">{{ $t('build.scene.unavailable') }}</p>
    </div>
    <p v-if="hasScene" class="scene-hint">
      {{ hasBuild ? $t('build.scene.hint') : $t('build.scene.hintEmpty') }}
    </p>

    <div class="build-list-header">
      <h1 class="build-list-title">{{ $t('build.title') }}</h1>
      <button v-if="hasBuild" type="button" class="link" aria-live="polite" @click="copyLink">
        {{ copied ? $t('build.linkCopied') : $t('build.copyLink') }}
      </button>
    </div>

    <ul class="slot-list">
      <!-- What the car is built on. Once a kit is chosen it is the build's
           identity, but the chassis stays on screen: the slot profile comes
           from it, and a beginner who picked a box by its art needs to learn
           which chassis is inside. -->
      <li class="slot-row base-row">
        <div class="slot-label">{{ $t('build.base') }}</div>
        <div class="slot-entries">
          <template v-if="hasBuild && chassis">
            <p class="slot-entry" :class="{ fallback: kit && isFallback(kit.names) }">
              {{ kit ? resolve(kit.names).value : resolve(chassis.names).value }}
            </p>
            <p class="build-subtitle">
              <span>{{ kit ? resolve(chassis.names).value : $t('build.bareChassis') }}</span>
              <span v-if="kit?.gearRatio">{{ kit.gearRatio }}</span>
              <span v-if="kit?.status === 'limited'" class="kit-status">
                {{ $t('build.kitStatus.limited') }}
              </span>
            </p>
          </template>
          <p v-else class="slot-empty">{{ $t('build.noBase') }}</p>
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
        :copy-from="copies.get(slot.id)?.from"
        @open="openSlotId = slot.id"
        @revert="revert(slot.id)"
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
          :copy-from="copies.get(slot.id)?.from"
          @open="openSlotId = slot.id"
          @revert="revert(slot.id)"
          @copy="copy(slot.id)"
        />
      </ul>
    </details>

    <!-- Sits with the slot list it credits rather than in a page footer, so
         the attribution travels with the content it covers. -->
    <BuildKitCredit v-if="kit" :kit="kit" />

    <LazyBuildBasePicker
      v-if="baseOpen"
      :kits="catalog?.kits ?? []"
      :chassis="catalog?.chassis ?? []"
      @select="chooseBase"
      @close="baseOpen = false"
    />

    <LazyBuildPartPicker
      v-if="openSlot"
      :candidates="candidates"
      :slot-type="openSlot.type"
      :slot-label="openSlotLabel"
      @select="choose"
      @close="openSlotId = null"
    />
  </div>
</template>
