<script setup lang="ts">
/**
 * One catalog part, as it appears in a picker row. Deliberately generic rather
 * than picker-specific: the parts browse page renders the same card.
 *
 * No price: nobody picks a part by its list price. A class verdict only when
 * the picker passes one and it is not simply "legal" — a beginner learns more
 * from a Dash motor marked not allowed in Junior than from one that silently
 * is not offered (docs/PLAN.md §6 M1b).
 */
import { thumbnailSrc } from '#shared/catalog/thumbnails'
import type { BuildablePart, BuildClass } from '#shared/catalog/build'
import type { PartLegality, Slot } from '#shared/catalog/schema'
import type { IconName } from '~/utils/icons'

const props = defineProps<{
  part: BuildablePart
  /** Which slot the part is being considered for, so the specs suit it. */
  slotType?: Slot
  /** The part's standing in the class the build is checked against. */
  verdict?: { legality: PartLegality; buildClass: BuildClass }
}>()

const { resolve, isFallback } = useCatalogName()
const { slotTypeLabel } = useTerm()
const { t } = useI18n()

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

/**
 * The rows a parts set fills, because it is about to fill all of them at once
 * (docs/PLAN.md §4.9). Nothing else on the card would say so: a First Try set
 * sits in the roller list looking like one more pair of rollers, and the card
 * that sold it that way would surprise the reader with four other rows.
 */
const setFills = computed(() => props.part.contents
  ? t('build.setFills', {
      slots: props.part.slots.map(slotTypeLabel).join(t('build.listSeparator'))
    })
  : undefined)
</script>

<template>
  <div class="part-card">
    <CatalogThumb :src="thumb" :icon="icon" />

    <div class="part-head">
      <span class="part-name" :class="{ fallback }">{{ name }}</span>
      <span class="part-id">{{ part.id }}</span>
    </div>

    <p v-if="setFills" class="part-set">{{ setFills }}</p>

    <p v-if="verdict && verdict.legality !== 'legal'" class="part-legality" :class="`legality-${verdict.legality}`">
      {{ $t(`build.rules.badge.${verdict.legality}`, { class: $t(`part.class.${verdict.buildClass}`) }) }}
    </p>

    <dl v-if="specs.length" class="part-specs">
      <template v-for="spec in specs" :key="spec.key">
        <dt>{{ $t(`spec.${spec.key}`) }}</dt>
        <dd>{{ spec.valueKey ? $t(spec.valueKey) : spec.value }}</dd>
      </template>
    </dl>
  </div>
</template>
