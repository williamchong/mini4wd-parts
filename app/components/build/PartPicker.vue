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
  /** The choice goes beside what the slot holds rather than replacing it. */
  adding?: boolean
  buildClass: BuildClass
}>()

const emit = defineEmits<{ select: [string]; close: [] }>()

// The parent unmounts this on `close`, so the dialog restores focus itself.
useReturnFocus()

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
  <!--
    The parent mounts this component only while a slot is open, so the dialog
    is open for its whole life and closing it is closing the parent's state —
    `update:open` is the one way out, and it covers Escape, the backdrop and
    the X alike. What this replaced was a plain div with `role="dialog"` and a
    click handler: no focus trap, no scroll lock, and nothing to send focus
    back to the row that opened it.
  -->
  <UModal
    open
    :title="$t(adding ? 'build.pickPartAdd' : 'build.pickPart', { slot: slotLabel })"
    :ui="{ content: 'max-w-2xl max-h-[85vh]', body: 'overflow-y-auto' }"
    @update:open="value => { if (!value) emit('close') }"
  >
    <template #body>
      <UInput
        v-model="query"
        type="search"
        icon="i-lucide-search"
        :placeholder="$t('build.searchParts')"
        class="picker-search"
      />

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
    </template>
  </UModal>
</template>
