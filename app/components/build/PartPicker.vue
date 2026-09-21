<script setup lang="ts">
/**
 * Choosing what goes in a slot. Candidates arrive already filtered by slot
 * type and chassis compatibility; the only filtering done here is the reader's
 * own search, because everything else is a property of the catalog rather than
 * of the query they typed.
 */
import { matchesQuery } from '#shared/catalog/names'
import type { BuildClass, SlotCandidate } from '#shared/catalog/build'
import type { Slot } from '#shared/catalog/schema'

const props = defineProps<{
  candidates: SlotCandidate[]
  slotType: Slot
  slotLabel: string
  buildClass: BuildClass
}>()

const emit = defineEmits<{ select: [string]; close: [] }>()

const localePath = useLocalePath()
const query = ref('')

// The rule this used to spell out inline now lives in `matchesQuery`, because
// the kit picker needs exactly the same one and two copies would drift.
const matches = computed(() =>
  props.candidates.filter(({ part }) => matchesQuery(query.value, part.id, part.names)))

// `partsForSlot` ranks add-ons as one block at the foot, so a single divider
// before the first of them heads all of them.
const firstAddOn = computed(() => matches.value.findIndex(({ part }) => part.isAddOn))
</script>

<template>
  <div class="picker-backdrop" @click.self="emit('close')">
    <div class="picker" role="dialog" aria-modal="true">
      <header class="picker-head">
        <h2>{{ $t('build.pickPart', { slot: slotLabel }) }}</h2>
        <UButton variant="link" color="neutral" size="xs" @click="emit('close')">{{ $t('build.close') }}</UButton>
      </header>

      <input
        v-model="query"
        type="search"
        class="picker-search"
        :placeholder="$t('build.searchParts')"
      >

      <p class="picker-count">{{ $t('build.candidates', { count: matches.length }) }}</p>

      <ul class="picker-list">
        <template v-for="(candidate, i) in matches" :key="candidate.part.id">
          <!-- Presentation, not a row: a screen reader's list count and item
               navigation should reach parts only, and the heading below it. -->
          <li v-if="i === firstAddOn" class="picker-divider" role="presentation">
            <h3>{{ $t('build.addOns') }}</h3>
          </li>
          <li>
            <button type="button" @click="emit('select', candidate.part.id)">
              <PartCard
                :part="candidate.part"
                :slot-type="slotType"
                :verdict="{ legality: candidate.legality, buildClass }"
              />
            </button>
            <!-- Beside the button, never inside it: an anchor nested in a button
                 is invalid, and the two do different things — one fills the slot,
                 one leaves the builder to read about the part. -->
            <UButton
              variant="link"
              color="neutral"
              size="xs"
              class="picker-details"
              :to="localePath(`/parts/${candidate.part.id}`)"
            >
              {{ $t('build.details') }}
            </UButton>
          </li>
        </template>
      </ul>
    </div>
  </div>
</template>
