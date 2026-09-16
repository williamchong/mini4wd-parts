<script setup lang="ts">
/**
 * One catalog part, as it appears in a picker row. Deliberately generic rather
 * than picker-specific: the parts browse page renders the same card.
 *
 * No price and no class verdict: nobody picks a part by its list price, and the
 * MVP builds against no race class (docs/PLAN.md §6 M1b).
 */
import { thumbnailSrc } from '#shared/catalog/thumbnails'
import type { BuildablePart } from '#shared/catalog/build'
import type { Slot } from '#shared/catalog/schema'
import type { IconName } from '~/utils/icons'

const props = defineProps<{
  part: BuildablePart
  /** Which slot the part is being considered for, so the specs suit it. */
  slotType?: Slot
}>()

const { resolve, isFallback } = useCatalogName()

const name = computed(() => resolve(props.part.names).value)
const fallback = computed(() => isFallback(props.part.names))
const specs = computed(() => specRowsFor(props.part, props.slotType))

/**
 * Which glyph stands in when a part has no photo. The slot being filled beats
 * the part's own first slot: a wheel-and-tire set fills either, and in a tire
 * picker it should draw a tire.
 */
const icon = computed<IconName>(() => props.slotType ?? props.part.slots[0] ?? 'none')

const thumb = computed(() => thumbnailSrc('parts', props.part))
</script>

<template>
  <div class="part-card">
    <CatalogThumb :src="thumb" :icon="icon" />

    <div class="part-head">
      <span class="part-name" :class="{ fallback }">{{ name }}</span>
      <span class="part-id">{{ part.id }}</span>
    </div>

    <dl v-if="specs.length" class="part-specs">
      <template v-for="spec in specs" :key="spec.key">
        <dt>{{ $t(`spec.${spec.key}`) }}</dt>
        <dd>{{ spec.valueKey ? $t(spec.valueKey) : spec.value }}</dd>
      </template>
    </dl>
  </div>
</template>
