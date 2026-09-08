<script setup lang="ts">
/**
 * The builder. This page is the only owner of catalog data: it loads the
 * collections once and hands resolved values down as props, which keeps every
 * child component synchronous and the whole route prerenderable.
 *
 * All the logic lives in shared/catalog/build.ts as pure functions, so the
 * model is tested without a browser and this file stays about presentation.
 */
import {
  BUILD_CLASSES, partsForSlot, resolveBuild, swappableSlotTypes
} from '#shared/catalog/build'
import type { PickableKit, ResolvedSlot } from '#shared/catalog/build'
import type { ChassisId } from '#shared/catalog/schema'

definePageMeta({ layout: 'content' })

const { t } = useI18n()
const { resolve, isFallback } = useCatalogName()
const { term } = useTerm()
const { build, buildClass, start, reset, swap, revert } = useBuild()

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
        'chassisCompat', 'classLegality', 'specs', 'priceJpy', 'priceHkd')
      .all(),
    queryCollection('kits')
      .select('id', 'stem', 'names', 'chassis', 'status', 'gearRatio',
        'priceJpy', 'priceHkd', 'releaseDate', 'officialImage',
        'loadoutSource', 'loadoutSourceTitle', 'stockLoadout')
      .all()
  ])
  // Normalise before comparing anything to anything: @nuxt/content overwrites
  // each record's own `id` with its source path, and `fromContent` is what puts
  // the Tamiya item number back. Building the chassis id set from the raw docs
  // gives a set of file paths, against which every kit's `ma`/`vs`/`ar` fails —
  // silently, as an empty picker rather than an error.
  const known = chassis.map(fromContent)
  const chassisIds = new Set(known.map(c => c.id))
  return {
    chassis: known,
    // Tools, cases, stickers and setting gauges reach no picker: `partsForSlot`
    // requires `isCarPart`, and a part slotted `none` fills nothing. Dropping
    // them at prerender rather than shipping and re-filtering in the browser
    // takes 56 of 382 records out of the payload.
    parts: parts.map(fromContent)
      .filter(part => part.isCarPart && part.slots.some(slot => slot !== 'none')),
    // A kit naming a chassis we do not ship cannot seed a build: `start` would
    // succeed, `chassis` would compute to undefined, and the reader would be
    // bounced back to the picker by a click that looked like it did nothing.
    // No kit is in that state today; this keeps it that way rather than
    // trusting it to stay true through a descoped chassis.
    kits: kits.map(fromContent).filter(kit => chassisIds.has(kit.chassis))
  }
})

const partsById = computed(() =>
  new Map((catalog.value?.parts ?? []).map(part => [part.id, part])))

const chassis = computed(() =>
  catalog.value?.chassis.find(c => c.id === build.value?.chassis))

const kitsById = computed(() =>
  new Map((catalog.value?.kits ?? []).map(kit => [kit.id, kit])))

/**
 * Undefined for a bare-chassis build, and also for a build naming a kit we no
 * longer ship — a link made against an older catalog, say. Both degrade to the
 * chassis default, which is the shape the 13 kits with no wiki loadout already
 * render correctly. Everything downstream reads this rather than `build.kit`,
 * so a missing kit cannot become a header with no name behind it.
 */
const kit = computed(() =>
  build.value?.kit ? kitsById.value.get(build.value.kit) : undefined)

const slots = computed<ResolvedSlot[]>(() =>
  chassis.value && build.value ? resolveBuild(chassis.value, kit.value, build.value) : [])

/**
 * Which door the start screen is showing. Not persisted, unlike the wording
 * toggle or the later 3D/list preference: this is a one-off entry choice, not a
 * standing preference about a surface the reader keeps coming back to.
 */
const door = ref<'kit' | 'chassis'>('kit')

const swappable = computed(() =>
  chassis.value
    ? swappableSlotTypes(catalog.value?.parts ?? [], chassis.value)
    : new Set<never>())

// The slot being filled is held by id, not as a copy of the row: the row it
// names already lives in `slots`, and a snapshot would go stale the moment
// anything else changed the build.
const openSlotId = ref<string | null>(null)

const openSlot = computed<ResolvedSlot | null>(() =>
  slots.value.find(slot => slot.id === openSlotId.value) ?? null)

const candidates = computed(() =>
  openSlot.value && chassis.value
    ? partsForSlot(catalog.value?.parts ?? [], openSlot.value.type, chassis.value, buildClass.value)
    : [])

const openSlotLabel = computed(() =>
  openSlot.value ? term(openSlot.value.type, `build.slot.${openSlot.value.id}`) : '')

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
    <!-- Two doors into the same object (docs/PLAN.md §4.7), with the kit open
         by default because most beginners arrive holding a box. -->
    <div v-if="!build || !chassis" class="build-start">
      <div class="door-toggle" role="tablist">
        <button
          type="button"
          role="tab"
          :aria-selected="door === 'kit'"
          :class="{ active: door === 'kit' }"
          @click="door = 'kit'"
        >
          {{ $t('build.door.kit') }}
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="door === 'chassis'"
          :class="{ active: door === 'chassis' }"
          @click="door = 'chassis'"
        >
          {{ $t('build.door.chassis') }}
        </button>
      </div>

      <!-- The whole record, not an id: `start` then reads the chassis and the
           kit off one object in one expression, so a build whose chassis and
           kit disagree is unrepresentable through the UI. A URL can still
           express one, which is why §6 M1b puts that check in the codec. -->
      <BuildKitPicker
        v-if="door === 'kit'"
        :kits="catalog?.kits ?? []"
        :chassis="catalog?.chassis ?? []"
        @select="(k: PickableKit) => start(k.chassis, k.id)"
      />
      <BuildChassisPicker
        v-else
        :chassis="catalog?.chassis ?? []"
        @select="(id: ChassisId) => start(id)"
      />
    </div>

    <template v-else>
      <header class="build-head">
        <!-- Once a kit is chosen it is the build's identity, but the chassis
             stays on screen: the slot profile and every "standard for this
             chassis" row come from it, and a beginner who picked a box by its
             art needs to learn which chassis is inside. -->
        <div class="build-title">
          <h1 :class="{ fallback: kit && isFallback(kit.names) }">
            {{ kit ? resolve(kit.names).value : resolve(chassis.names).value }}
          </h1>
          <p v-if="kit" class="build-subtitle">
            <span>{{ resolve(chassis.names).value }}</span>
            <span v-if="kit.gearRatio">{{ kit.gearRatio }}</span>
            <span v-if="kit.status === 'limited'" class="kit-status">
              {{ $t('build.kitStatus.limited') }}
            </span>
          </p>
        </div>
        <div class="build-controls">
          <label>
            {{ $t('build.class') }}
            <select v-model="buildClass">
              <option v-for="c in BUILD_CLASSES" :key="c" :value="c">{{ $t(`build.classes.${c}`) }}</option>
            </select>
          </label>
          <button type="button" class="link" @click="reset()">{{ $t('build.startOver') }}</button>
        </div>
      </header>

      <!-- A runner's default loadout is entirely moulded plastic with no item
           numbers, so a fresh build is complete, stock, and worth nothing on a
           shopping list. Saying so beats an unexplained wall of "stock". -->
      <p class="build-note">{{ $t('build.stockNote') }}</p>

      <!-- Sits with the slot list it credits rather than in a page footer, so
           the attribution travels with the content it covers. -->
      <BuildKitCredit v-if="kit" :kit="kit" />

      <ul class="slot-list">
        <BuildSlotRow
          v-for="slot in slots"
          :key="slot.id"
          :slot="slot"
          :parts-by-id="partsById"
          :swappable="swappable.has(slot.type)"
          @open="openSlotId = slot.id"
          @revert="revert(slot.id)"
        />
      </ul>
    </template>

    <BuildPartPicker
      v-if="openSlot"
      :candidates="candidates"
      :slot-type="openSlot.type"
      :slot-label="openSlotLabel"
      @select="choose"
      @close="openSlotId = null"
    />
  </div>
</template>
