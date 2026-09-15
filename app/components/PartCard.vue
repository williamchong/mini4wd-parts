<script setup lang="ts">
/**
 * One catalog part, as it appears in a picker row. Deliberately generic rather
 * than picker-specific: the parts browse page renders the same card.
 *
 * No price and no class verdict: nobody picks a part by its list price, and the
 * MVP builds against no race class (docs/PLAN.md §6 M1b).
 */
import type { BuildablePart } from '#shared/catalog/build'
import type { Slot } from '#shared/catalog/schema'

const props = defineProps<{
  part: BuildablePart
  /** Which slot the part is being considered for, so the specs suit it. */
  slotType?: Slot
}>()

const { resolve, isFallback } = useCatalogName()

const name = computed(() => resolve(props.part.names).value)
const fallback = computed(() => isFallback(props.part.names))
const specs = computed(() => specRowsFor(props.part, props.slotType))
</script>

<template>
  <div class="part-card">
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
