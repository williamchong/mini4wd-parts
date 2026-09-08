<script setup lang="ts">
/**
 * One catalog part, as it appears in a picker row. Deliberately generic rather
 * than picker-specific: the parts browse page renders the same card.
 */
import type { BuildablePart } from '#shared/catalog/build'
import type { PartLegality, Slot } from '#shared/catalog/schema'

const props = defineProps<{
  part: BuildablePart
  /** Which slot the part is being considered for, so the specs suit it. */
  slotType?: Slot
  /** Against the class being built. Omitted where no class is in play. */
  legality?: PartLegality
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

    <div class="part-meta">
      <span v-if="part.priceJpy" class="price">¥{{ part.priceJpy.toLocaleString() }}</span>
      <span v-if="part.priceHkd" class="price">HK${{ part.priceHkd }}</span>
      <!-- Only a verdict worth acting on is shown; "legal" is the default and
           badging it would bury the two that matter. -->
      <span v-if="legality && legality !== 'legal'" class="legality" :class="legality">
        {{ $t(`build.legality.${legality}`) }}
      </span>
    </div>

    <dl v-if="specs.length" class="part-specs">
      <template v-for="spec in specs" :key="spec.key">
        <dt>{{ $t(`spec.${spec.key}`) }}</dt>
        <dd>{{ spec.valueKey ? $t(spec.valueKey) : spec.value }}</dd>
      </template>
    </dl>
  </div>
</template>
