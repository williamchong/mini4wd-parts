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
import { orderKits } from '#shared/catalog/kits'
import { matchesQuery } from '#shared/catalog/names'
import type { PickableKit } from '#shared/catalog/build'
import type { Chassis, ChassisId } from '#shared/catalog/schema'

/** Only what a chip and a row caption show. */
type ChassisCard = Pick<Chassis, 'id' | 'names'>

const props = defineProps<{
  kits: PickableKit[]
  chassis: ChassisCard[]
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

const matches = computed(() => orderKits(props.kits.filter(kit =>
  (!chassisFilter.value || kit.chassis === chassisFilter.value)
  && matchesQuery(query.value, kit.id, kit.names))))

/**
 * Photos are hotlinked from Tamiya's CDN, which we do not control, so a row has
 * to survive one going away — docs/PLAN.md §6 M1b: a hotlink we do not control
 * must not be able to break a picker. A failed image drops to the text row that
 * was always underneath it.
 */
const brokenImages = ref(new Set<string>())
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
          :class="{ active: chassisFilter === chip.id }"
          @click="chassisFilter = chip.id"
        >
          {{ chip.label }}
          <span class="chip-count">{{ chip.count }}</span>
        </button>
      </li>
    </ul>

    <p class="picker-count">{{ $t('build.kitCandidates', { count: matches.length }) }}</p>

    <ul class="kit-list">
      <li v-for="kit in matches" :key="kit.id">
        <button type="button" @click="emit('select', kit)">
          <!-- Explicit width and height so lazy-loading has a box to reason
               about and the grid does not reflow as photos land. -->
          <img
            v-if="kit.officialImage && !brokenImages.has(kit.id)"
            class="kit-thumb"
            :src="kit.officialImage"
            alt=""
            loading="lazy"
            decoding="async"
            width="160"
            height="120"
            @error="brokenImages.add(kit.id)"
          >

          <span class="kit-body">
            <span class="kit-name" :class="{ fallback: isFallback(kit.names) }">
              {{ resolve(kit.names).value }}
            </span>

            <span class="kit-facts">
              <span class="kit-id">{{ kit.id }}</span>
              <span>{{ chassisNames.get(kit.chassis) ?? kit.chassis }}</span>
              <span v-if="kit.gearRatio">{{ kit.gearRatio }}</span>
            </span>

            <span class="kit-meta">
              <span v-if="kit.priceJpy" class="price">¥{{ kit.priceJpy.toLocaleString() }}</span>
              <span v-if="kit.priceHkd" class="price">HK${{ kit.priceHkd }}</span>
              <!-- `current` is the default and badging it would bury the one
                   that matters, the same rule PartCard applies to legality. -->
              <span v-if="kit.status === 'limited'" class="kit-status">
                {{ $t('build.kitStatus.limited') }}
              </span>
            </span>
          </span>
        </button>
      </li>
    </ul>

    <!-- The gear ratio on 295 of these rows is wiki-derived. Bare facts are not
         copyrightable and 305 per-row credits would be absurd, so the picker
         carries one line and the chosen kit carries the article link. -->
    <p class="kit-source-note">{{ $t('build.kitSource.note') }}</p>
  </section>
</template>
