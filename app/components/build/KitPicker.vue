<script setup lang="ts">
/**
 * The kit door: which box is on the reader's desk.
 *
 * Rendered inside BasePicker's dialog, beside ChassisPicker.
 *
 * Rows are led by a picture because recognising your box among 305 is a visual
 * task, and two thirds of these kits have no Traditional Chinese name for a
 * reader to match against. The picture is our own thumbnail of Tamiya's photo,
 * served from public/thumbs and never hotlinked (docs/PLAN.md §6 M1b).
 */
import { matchesQuery } from '#shared/catalog/names'
import { thumbnailSrc } from '#shared/catalog/thumbnails'
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
 * How many rows are in the DOM. It used to be a bandwidth decision: the rows
 * hotlinked Tamiya's full-size photos, ~94 KB each for something displayed
 * 80 px wide, so a cold open pulled megabytes before the reader had typed. The
 * photos are now our own ~4 KB thumbnails (docs/PLAN.md §6 M1b) and that
 * argument is gone, but the cap stays: search and the chassis chips are the
 * real navigation, and nobody finds their box by scrolling past 305 rows.
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
  thumb: thumbnailSrc('kits', kit),
  chassisName: chassisNames.value.get(kit.chassis) ?? kit.chassis
})))
</script>

<template>
  <section class="kit-picker">
    <h2>{{ $t('build.pickKit') }}</h2>

    <UInput
      v-model="query"
      type="search"
      icon="i-lucide-search"
      class="picker-search"
      :placeholder="$t('build.searchKits')"
    />

    <!-- Filters, so they stay buttons carrying `aria-pressed` rather than
         becoming tabs: picking one narrows the list below, it does not swap
         the panel. The count keeps its tabular figures so the row of chips
         does not jitter as the numbers change. -->
    <ul class="chassis-chips">
      <li>
        <UButton
          size="xs"
          v-bind="emphasis(chassisFilter === null)"
          :aria-pressed="chassisFilter === null"
          @click="chassisFilter = null"
        >
          {{ $t('build.chassisAll') }}
          <span class="chip-count">{{ kits.length }}</span>
        </UButton>
      </li>
      <li v-for="chip in chips" :key="chip.id">
        <UButton
          size="xs"
          v-bind="emphasis(chassisFilter === chip.id)"
          :aria-pressed="chassisFilter === chip.id"
          @click="chassisFilter = chip.id"
        >
          {{ chip.label }}
          <span class="chip-count">{{ chip.count }}</span>
        </UButton>
      </li>
    </ul>

    <p class="picker-count">{{ $t('build.kitCandidates', { count: matches.length }) }}</p>

    <ul class="kit-list">
      <li v-for="row in visible" :key="row.kit.id">
        <button type="button" @click="emit('select', row.kit)">
          <CatalogThumb class="kit-thumb" :src="row.thumb" icon="body" />

          <span class="kit-body">
            <span class="kit-name" :class="{ fallback: row.fallback }">{{ row.name }}</span>

            <span class="kit-facts">
              <span class="kit-id">{{ row.kit.id }}</span>
              <span>{{ row.chassisName }}</span>
              <span v-if="row.kit.gearRatio">{{ row.kit.gearRatio }}</span>
              <!-- `current` is the default and badging it would bury the one
                   that matters. -->
              <UBadge v-if="row.kit.status === 'limited'" color="warning" variant="subtle" size="sm">
                {{ $t('build.kitStatus.limited') }}
              </UBadge>
            </span>
          </span>
        </button>
      </li>
    </ul>

    <UButton
      v-if="matches.length > shown"
      block
      color="neutral"
      variant="outline"
      class="mt-3"
      @click="shown += PAGE"
    >
      {{ $t('build.showMore', { count: matches.length - shown }) }}
    </UButton>

    <!-- The gear ratio on 295 of these rows is wiki-derived. Bare facts are not
         copyrightable and 305 per-row credits would be absurd, so the picker
         carries one line and the chosen kit carries the article link. -->
    <p class="kit-source-note">{{ $t('build.kitSource.note') }}</p>
  </section>
</template>
