<script setup lang="ts">
/**
 * The kit door: which box is on the reader's desk.
 *
 * Inline rather than a modal, unlike PartPicker — that one is for swapping a
 * slot inside an existing build, this is the entry screen itself, the same job
 * ChassisPicker does.
 *
 * Rows are led by Tamiya's own product photo because recognising your box among
 * 305 is a visual task, and two thirds of these kits have no Traditional
 * Chinese name for a reader to match against (docs/PLAN.md §6 M1b).
 */
import { matchesQuery } from '#shared/catalog/names'
import type { PickableKit } from '#shared/catalog/build'
import type { Chassis, ChassisId } from '#shared/catalog/schema'

/** Only what a chip and a row caption show — not the full ChassisPicker card. */
type ChassisChip = Pick<Chassis, 'id' | 'names'>

const props = defineProps<{
  /** Already ordered at prerender; this component never re-sorts. */
  kits: PickableKit[]
  chassis: ChassisChip[]
}>()

const emit = defineEmits<{ select: [PickableKit] }>()

const { resolve, isFallback } = useCatalogName()

const query = ref('')
const chassisFilter = ref<ChassisId | null>(null)

const chassisNames = computed(() =>
  new Map(props.chassis.map(c => [c.id, resolve(c.names).value])))

/**
 * Chip counts come from the whole corpus rather than from the current search,
 * so they read as "how many kits exist on this chassis" and do not flicker to
 * zero while someone is typing.
 */
const chips = computed(() => {
  const counts = new Map<ChassisId, number>()
  for (const kit of props.kits) counts.set(kit.chassis, (counts.get(kit.chassis) ?? 0) + 1)
  return props.chassis
    .filter(c => counts.has(c.id))
    .map(c => ({ id: c.id, label: chassisNames.value.get(c.id) ?? c.id, count: counts.get(c.id)! }))
    .sort((a, b) => b.count - a.count)
})

const matches = computed(() => props.kits.filter(kit =>
  (!chassisFilter.value || kit.chassis === chassisFilter.value)
  && matchesQuery(query.value, kit.id, kit.names)))

/**
 * How many rows are in the DOM, and it is a bandwidth decision rather than a
 * rendering one.
 *
 * Every row carries a photo hotlinked from Tamiya's CDN at its original size —
 * measured at ~94 KB average for something displayed 80 px wide. `loading`
 * `="lazy"` does not save us: the browser still fetches everything within about
 * 1250 px of the viewport, so a full 305-row list pulls megabytes before the
 * reader has typed anything, and ~34 MB if they scroll it all. Capping the list
 * is the only lever available until the catalog carries a thumbnail URL
 * (docs/PLAN.md §6 M1b) — search and the chassis chips are the real navigation
 * anyway, and nobody finds their box by scrolling past 305 photos.
 */
const PAGE = 24
const shown = ref(PAGE)

// A new search is a new list, so it starts from the top again.
watch([query, chassisFilter], () => { shown.value = PAGE })

const visible = computed(() => matches.value.slice(0, shown.value).map(kit => ({
  kit,
  // Resolved once per row: `isFallback` walks the same name chain `resolve`
  // does, so asking the template for both would walk it three times.
  name: resolve(kit.names).value,
  fallback: isFallback(kit.names),
  chassisName: chassisNames.value.get(kit.chassis) ?? kit.chassis
})))

/**
 * Photos are hotlinked from a CDN we do not control, so a row has to survive
 * one going away — docs/PLAN.md §6 M1b: a hotlink we do not control must not be
 * able to break a picker. A failed image drops to the text row underneath it.
 */
const brokenImages = ref(new Set<string>())
const list = useTemplateRef<HTMLElement>('list')

/**
 * The route is prerendered, so the browser starts fetching these images while
 * parsing the HTML — long before Vue hydrates and attaches `@error`. An image
 * that already failed by then fired its event into the void and would sit as a
 * broken icon forever, which is exactly the failure the handler exists to
 * prevent. Sweeping once on mount catches those.
 */
onMounted(() => {
  for (const img of list.value?.querySelectorAll<HTMLImageElement>('img[data-kit]') ?? []) {
    if (img.complete && img.naturalWidth === 0 && img.dataset.kit) {
      brokenImages.value.add(img.dataset.kit)
    }
  }
})
</script>

<template>
  <section class="kit-picker">
    <h2>{{ $t('build.pickKit') }}</h2>

    <input
      v-model="query"
      type="search"
      class="picker-search"
      :placeholder="$t('build.searchKits')"
    >

    <ul class="chassis-chips">
      <li>
        <button
          type="button"
          :aria-pressed="chassisFilter === null"
          :class="{ active: chassisFilter === null }"
          @click="chassisFilter = null"
        >
          {{ $t('build.chassisAll') }}
          <span class="chip-count">{{ kits.length }}</span>
        </button>
      </li>
      <li v-for="chip in chips" :key="chip.id">
        <button
          type="button"
          :aria-pressed="chassisFilter === chip.id"
          :class="{ active: chassisFilter === chip.id }"
          @click="chassisFilter = chip.id"
        >
          {{ chip.label }}
          <span class="chip-count">{{ chip.count }}</span>
        </button>
      </li>
    </ul>

    <p class="picker-count">{{ $t('build.kitCandidates', { count: matches.length }) }}</p>

    <ul ref="list" class="kit-list">
      <li v-for="row in visible" :key="row.kit.id">
        <button type="button" @click="emit('select', row.kit)">
          <!-- Explicit width and height so lazy-loading has a box to reason
               about and the grid does not reflow as photos land. -->
          <img
            v-if="row.kit.officialImage && !brokenImages.has(row.kit.id)"
            class="kit-thumb"
            :src="row.kit.officialImage"
            :data-kit="row.kit.id"
            alt=""
            loading="lazy"
            decoding="async"
            width="160"
            height="120"
            @error="brokenImages.add(row.kit.id)"
          >

          <span class="kit-body">
            <span class="kit-name" :class="{ fallback: row.fallback }">{{ row.name }}</span>

            <span class="kit-facts">
              <span class="kit-id">{{ row.kit.id }}</span>
              <span>{{ row.chassisName }}</span>
              <span v-if="row.kit.gearRatio">{{ row.kit.gearRatio }}</span>
            </span>

            <span class="kit-meta">
              <span v-if="row.kit.priceJpy" class="price">¥{{ row.kit.priceJpy.toLocaleString() }}</span>
              <span v-if="row.kit.priceHkd" class="price">HK${{ row.kit.priceHkd }}</span>
              <!-- `current` is the default and badging it would bury the one
                   that matters, the same rule PartCard applies to legality. -->
              <span v-if="row.kit.status === 'limited'" class="kit-status">
                {{ $t('build.kitStatus.limited') }}
              </span>
            </span>
          </span>
        </button>
      </li>
    </ul>

    <button
      v-if="matches.length > shown"
      type="button"
      class="show-more"
      @click="shown += PAGE"
    >
      {{ $t('build.showMore', { count: matches.length - shown }) }}
    </button>

    <!-- The gear ratio on 295 of these rows is wiki-derived. Bare facts are not
         copyrightable and 305 per-row credits would be absurd, so the picker
         carries one line and the chosen kit carries the article link. -->
    <p class="kit-source-note">{{ $t('build.kitSource.note') }}</p>
  </section>
</template>
