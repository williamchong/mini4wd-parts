<script setup lang="ts">
/**
 * One slot of the build. What is in it comes from `resolveBuild`, so this
 * component never has to know whether the contents came from the chassis, the
 * kit or the user — only whether the user changed it, which is what Revert
 * undoes.
 */
import { thumbnailSrc } from '#shared/catalog/thumbnails'
import type { BuildablePart, ResolvedSlot } from '#shared/catalog/build'

const props = defineProps<{
  slot: ResolvedSlot
  partsById: Map<string, BuildablePart>
  /** False while there is no build to change yet. */
  swappable: boolean
  /** The front/rear counterpart this row can copy, when copying would change it. */
  copyFrom?: ResolvedSlot
}>()

const emit = defineEmits<{ open: []; revert: []; copy: [] }>()

const { label: resolveLabel } = useCatalogName()
const { slotLabel } = useTerm()

// Regional wording applies to slot names too, so 摩打 / 馬達 follows the
// toggle rather than being frozen into the message file.
const label = computed(() => slotLabel(props.slot))

const copyLabel = computed(() =>
  props.copyFrom ? slotLabel(props.copyFrom) : '')

/**
 * What to print for each entry, and whether to mark it.
 *
 * One pass rather than a text function and a fallback function: both need the
 * same `partsById` lookup and the same locale walk, and split across two
 * template calls the row would do each twice while the two could drift apart.
 *
 * A label can resolve to nothing — a wiki phrase we have not translated carries
 * only `en`, which an English reader gets and a Chinese one does not. The slot
 * name is the honest stand-in there: the slot really is filled, we just cannot
 * say with what in this language. A part always resolves, because `ja` is
 * required on a catalog record.
 */
const rows = computed(() => props.slot.entries.map((entry) => {
  const part = entry.partId ? props.partsById.get(entry.partId) : undefined
  const names = part?.names ?? entry.label
  const hit = names && resolveLabel(names)
  return {
    text: hit?.value ?? (entry.label ? label.value : entry.partId ?? ''),
    fallback: hit?.fallback ?? false,
    // Only a catalog part has a photo. Everything else in a stock build is
    // molded into the kit, so the slot's own glyph is all there can be.
    thumbnail: thumbnailSrc('parts', part)
  }
}))
</script>

<template>
  <li class="slot-row" :class="{ swapped: slot.swapped }">
    <div class="slot-label">{{ label }}</div>

    <div class="slot-entries">
      <p v-if="!slot.entries.length" class="slot-empty">
        <CatalogThumb class="entry-thumb" :icon="slot.type" />
        <span>{{ $t('build.empty') }}</span>
      </p>
      <p
        v-for="(row, i) in rows"
        :key="i"
        class="slot-entry"
        :class="{ fallback: row.fallback }"
      >
        <CatalogThumb class="entry-thumb" :src="row.thumbnail" :icon="slot.type" />
        <span>{{ row.text }}</span>
      </p>
    </div>

    <div v-if="swappable" class="slot-actions">
      <button type="button" @click="emit('open')">
        {{ $t('build.swap') }}
      </button>
      <button v-if="copyFrom" type="button" class="link" @click="emit('copy')">
        {{ $t('build.copyFrom', { slot: copyLabel }) }}
      </button>
      <button v-if="slot.swapped" type="button" class="link" @click="emit('revert')">
        {{ $t('build.revert') }}
      </button>
    </div>
  </li>
</template>
