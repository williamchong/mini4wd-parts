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
import type { ResolvedSlot } from '#shared/catalog/build'
import type { ChassisId } from '#shared/catalog/schema'

definePageMeta({ layout: 'content' })

const { t } = useI18n()
const { resolve } = useCatalogName()
const { term } = useTerm()
const { build, buildClass, start, reset, swap, revert } = useBuild()

/**
 * Only the columns the builder reads, because this route is prerendered and
 * every column selected here is shipped to every visitor. Asking for whole
 * records triples the payload with raw Japanese spec text and each chassis'
 * 400-entry `compatibleParts` list, neither of which the builder looks at.
 *
 * Kits are not loaded at all yet: the kit entry point is the next chunk, and
 * 305 more records buy nothing until it exists.
 */
const { data: catalog } = await useAsyncData('build-catalog', async () => {
  const [chassis, parts] = await Promise.all([
    queryCollection('chassis')
      .select('id', 'stem', 'names', 'slots', 'defaultLoadout',
        'motorShaft', 'motorPosition', 'releaseYear', 'notes')
      .all(),
    queryCollection('parts')
      .select('id', 'stem', 'names', 'category', 'slots', 'isCarPart',
        'chassisCompat', 'classLegality', 'specs', 'priceJpy', 'priceHkd')
      .all()
  ])
  return {
    chassis: chassis.map(fromContent),
    // Tools, cases, stickers and setting gauges reach no picker: `partsForSlot`
    // requires `isCarPart`, and a part slotted `none` fills nothing. Dropping
    // them at prerender rather than shipping and re-filtering in the browser
    // takes 56 of 382 records out of the payload.
    parts: parts.map(fromContent)
      .filter(part => part.isCarPart && part.slots.some(slot => slot !== 'none'))
  }
})

const partsById = computed(() =>
  new Map((catalog.value?.parts ?? []).map(part => [part.id, part])))

const chassis = computed(() =>
  catalog.value?.chassis.find(c => c.id === build.value?.chassis))

const slots = computed<ResolvedSlot[]>(() =>
  chassis.value && build.value ? resolveBuild(chassis.value, undefined, build.value) : [])

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
    <BuildChassisPicker
      v-if="!build || !chassis"
      :chassis="catalog?.chassis ?? []"
      @select="(id: ChassisId) => start(id)"
    />

    <template v-else>
      <header class="build-head">
        <h1>{{ resolve(chassis.names).value }}</h1>
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
