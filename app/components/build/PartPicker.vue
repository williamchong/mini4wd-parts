<script setup lang="ts">
/**
 * Choosing what goes in a slot. Candidates arrive already filtered by slot
 * type and chassis compatibility; the only filtering done here is the reader's
 * own search, because everything else is a property of the catalog rather than
 * of the query they typed.
 */
import type { SlotCandidate } from '#shared/catalog/build'
import type { Slot } from '#shared/catalog/schema'

const props = defineProps<{
  candidates: SlotCandidate[]
  slotType: Slot
  slotLabel: string
}>()

const emit = defineEmits<{ select: [string]; close: [] }>()

const query = ref('')

/**
 * Matches the item number as well as the name: a rack of Grade-Up Parts is
 * labelled by number, and "15549" is often what the reader is holding.
 *
 * Every name is searched, not just the one being displayed. A reader who knows
 * a part as "Hyper-Dash" should find it while reading the Chinese page, and the
 * displayed name is one of these values anyway.
 */
const matches = computed(() => {
  const needle = query.value.trim().toLowerCase()
  if (!needle) return props.candidates
  return props.candidates.filter(({ part }) =>
    part.id.includes(needle)
    || Object.values(part.names).some(name => name?.toLowerCase().includes(needle)))
})
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
