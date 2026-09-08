<script setup lang="ts">
/**
 * One slot of the build. What is in it comes from `resolveBuild`, so this
 * component never has to know whether the contents came from the chassis, the
 * kit or the user — only how to label the difference.
 */
import type { BuildablePart, ResolvedSlot } from '#shared/catalog/build'

const props = defineProps<{
  slot: ResolvedSlot
  partsById: Map<string, BuildablePart>
  /** False when no part in the catalog can go here — the `switch` slot. */
  swappable: boolean
}>()

const emit = defineEmits<{ open: []; revert: [] }>()

const { resolve } = useCatalogName()
const { term } = useTerm()

// Regional wording applies to slot names too, so 摩打 / 馬達 follows the
// toggle rather than being frozen into the message file.
const label = computed(() => term(props.slot.type, `build.slot.${props.slot.id}`))

/** What to print for an entry: a catalog part's name, or the free-text label
 *  that stands in for moulded plastic Tamiya never sold separately. */
function entryText(entry: ResolvedSlot['entries'][number]) {
  const part = entry.partId ? props.partsById.get(entry.partId) : undefined
  if (part) return resolve(part.names).value
  return entry.label ?? entry.partId ?? ''
}
</script>

<template>
  <li class="slot-row" :class="{ swapped: slot.swapped }">
    <div class="slot-label">
      {{ label }}
      <span v-if="slot.required" class="required" :title="$t('build.required')">*</span>
    </div>

    <div class="slot-entries">
      <p v-if="!slot.entries.length" class="slot-empty">{{ $t('build.empty') }}</p>
      <p v-for="(entry, i) in slot.entries" :key="i" class="slot-entry">
        {{ entryText(entry) }}
      </p>
      <!-- An empty slot is neither stock nor swapped, so it is labelled by the
           entry text alone rather than by a badge that contradicts it. -->
      <span v-if="slot.swapped || slot.entries.length" class="slot-origin">
        {{ $t(slot.swapped ? 'build.swapped' : 'build.stock') }}
      </span>
    </div>

    <div class="slot-actions">
      <button v-if="swappable" type="button" @click="emit('open')">
        {{ $t('build.swap') }}
      </button>
      <button v-if="slot.swapped" type="button" class="link" @click="emit('revert')">
        {{ $t('build.revert') }}
      </button>
    </div>
  </li>
</template>
