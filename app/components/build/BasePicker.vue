<script setup lang="ts">
/**
 * What the car is built on: a kit, or a bare chassis (docs/PLAN.md §4.7). A
 * dialog opened from the top row of the build list, so the list and the 3D
 * pane stay on screen whether or not anything has been chosen yet.
 *
 * Choosing again starts a fresh build: swaps are a delta over one kit's stock
 * loadout and do not carry over to another's.
 */
import type { PickableKit } from '#shared/catalog/build'
import type { Chassis, ChassisId } from '#shared/catalog/schema'

type ChassisCard = Pick<Chassis,
  'id' | 'names' | 'motorShaft' | 'motorPosition' | 'releaseYear' | 'notes'>

defineProps<{
  kits: PickableKit[]
  chassis: ChassisCard[]
}>()

const emit = defineEmits<{ select: [chassis: ChassisId, kit?: string]; close: [] }>()

// The parent unmounts this on `close`, so the dialog restores focus itself.
useReturnFocus()

/** Kit first, because most beginners arrive holding a box. */
const door = ref<'kit' | 'chassis'>('kit')
</script>

<template>
  <UModal
    open
    :title="$t('build.pickBase')"
    :ui="{ content: 'max-w-5xl max-h-[85vh]', body: 'overflow-y-auto' }"
    @update:open="value => { if (!value) emit('close') }"
  >
    <!-- The two doors are the header: which one is open is the first thing
         asked, and putting them beside the title would make it a subtitle of
         a question it is really the answer to. -->
    <template #header>
      <!-- Deliberately not role="tablist"/"tab": that pattern promises
           roving-tabindex and arrow-key selection, which these plain buttons
           do not implement. Two toggle buttons is what this actually is, so
           `aria-pressed` says so — the same treatment the chassis chips use. -->
      <div class="picker-header door-toggle">
        <button
          type="button"
          :aria-pressed="door === 'kit'"
          :class="{ active: door === 'kit' }"
          @click="door = 'kit'"
        >
          {{ $t('build.door.kit') }}
        </button>
        <button
          type="button"
          :aria-pressed="door === 'chassis'"
          :class="{ active: door === 'chassis' }"
          @click="door = 'chassis'"
        >
          {{ $t('build.door.chassis') }}
        </button>
      </div>
      </template>

      <template #body>
      <!-- The whole record, not an id: the chassis and the kit are read off
           one object, so a build whose chassis and kit disagree is
           unrepresentable through the UI. -->
      <BuildKitPicker
        v-if="door === 'kit'"
        :kits="kits"
        :chassis="chassis"
        @select="(k: PickableKit) => emit('select', k.chassis, k.id)"
      />
      <BuildChassisPicker
        v-else
        :chassis="chassis"
        @select="(id: ChassisId) => emit('select', id)"
      />
      </template>
  </UModal>
</template>
