<script setup lang="ts">
/**
 * Choosing what goes in a slot. Candidates arrive already filtered by slot
 * type and chassis compatibility; the only filtering done here is the reader's
 * own search, because everything else is a property of the catalog rather than
 * of the query they typed.
 */
import { matchesQuery } from '#shared/catalog/names'
import type { SlotCandidate } from '#shared/catalog/build'
import type { Slot } from '#shared/catalog/schema'

const props = defineProps<{
  candidates: SlotCandidate[]
  slotType: Slot
  slotLabel: string
}>()

const emit = defineEmits<{ select: [string]; close: [] }>()

const query = ref('')

// The rule this used to spell out inline now lives in `matchesQuery`, because
// the kit picker needs exactly the same one and two copies would drift.
const matches = computed(() =>
  props.candidates.filter(({ part }) => matchesQuery(query.value, part.id, part.names)))
</script>

<template>
  <div class="picker-backdrop" @click.self="emit('close')">
    <div class="picker" role="dialog" aria-modal="true">
      <header class="picker-head">
        <h2>{{ $t('build.pickPart', { slot: slotLabel }) }}</h2>
        <button type="button" class="link" @click="emit('close')">{{ $t('build.close') }}</button>
      </header>

      <input
        v-model="query"
        type="search"
        class="picker-search"
        :placeholder="$t('build.searchParts')"
      >

      <p class="picker-count">{{ $t('build.candidates', { count: matches.length }) }}</p>

      <ul class="picker-list">
        <li v-for="candidate in matches" :key="candidate.part.id">
          <button type="button" @click="emit('select', candidate.part.id)">
            <PartCard
              :part="candidate.part"
              :slot-type="slotType"
              :legality="candidate.legality"
            />
          </button>
        </li>
      </ul>
    </div>
  </div>
</template>
