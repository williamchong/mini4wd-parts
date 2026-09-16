<script setup lang="ts">
/**
 * Which slot a part added from its own page should go in.
 *
 * Only opens when there is a real choice: a roller fits the front, rear and
 * side stays, a wheel-and-tire set fits four slots, and guessing between them
 * would put a beginner's first pair of rollers somewhere they did not ask for.
 * One candidate is applied without asking (`placePending` in pages/index.vue).
 */
import type { ResolvedSlot } from '#shared/catalog/build'

defineProps<{
  /** The candidate slots, in the chassis' own order. */
  slots: ResolvedSlot[]
  partName: string
}>()

const emit = defineEmits<{ select: [string]; close: [] }>()

const { slotLabel } = useTerm()
</script>

<template>
  <div class="picker-backdrop" @click.self="emit('close')">
    <div class="picker slot-picker" role="dialog" aria-modal="true">
      <header class="picker-head">
        <h2>{{ $t('build.pickSlot', { part: partName }) }}</h2>
        <button type="button" class="link" @click="emit('close')">{{ $t('build.close') }}</button>
      </header>

      <ul class="picker-list">
        <li v-for="slot in slots" :key="slot.id">
          <button type="button" @click="emit('select', slot.id)">
            <span class="slot-label">{{ slotLabel(slot) }}</span>
            <!-- Whether the slot is free, so replacing what the kit put there
                 is a decision rather than a surprise. -->
            <span class="slot-empty">
              {{ slot.entries.length ? $t('build.replaces') : $t('build.empty') }}
            </span>
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
