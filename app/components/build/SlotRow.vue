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

const { label: resolveLabel } = useCatalogName()
const { term } = useTerm()

// Regional wording applies to slot names too, so 摩打 / 馬達 follows the
// toggle rather than being frozen into the message file.
const label = computed(() => term(props.slot.type, `build.slot.${props.slot.id}`))

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
  const names = (entry.partId ? props.partsById.get(entry.partId)?.names : undefined)
    ?? entry.label
  const hit = names && resolveLabel(names)
  return {
    text: hit?.value ?? (entry.label ? label.value : entry.partId ?? ''),
    fallback: hit?.fallback ?? false
  }
}))

/**
 * Where the slot's contents came from, which `resolveBuild` already knows per
 * entry and sets uniformly across a slot. Three states rather than the binary
 * stock/swapped badge this replaced: "standard for this chassis" is our own
 * inference from the chassis default, "from your kit" is sourced from the box,
 * and conflating the two hid exactly the distinction a beginner needs to check
 * against the parts in front of them (docs/PLAN.md §4.8).
 */
const origin = computed(() =>
  props.slot.swapped ? 'user' : props.slot.entries[0]?.origin)
</script>

<template>
  <li class="slot-row" :class="{ swapped: slot.swapped }">
    <div class="slot-label">
      {{ label }}
      <span v-if="slot.required" class="required" :title="$t('build.required')">*</span>
    </div>

    <div class="slot-entries">
      <p v-if="!slot.entries.length" class="slot-empty">{{ $t('build.empty') }}</p>
      <p
        v-for="(row, i) in rows"
        :key="i"
        class="slot-entry"
        :class="{ fallback: row.fallback }"
      >
        {{ row.text }}
      </p>
      <!-- An empty slot is neither stock nor swapped, so it is labelled by the
           entry text alone rather than by a badge that contradicts it. -->
      <span v-if="origin" class="slot-origin" :class="origin">
        {{ $t(`build.origin.${origin}`) }}
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
