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

/** Kit first, because most beginners arrive holding a box. */
const door = ref<'kit' | 'chassis'>('kit')
</script>

<template>
  <div class="picker-backdrop" @click.self="emit('close')">
    <div class="picker picker-wide" role="dialog" aria-modal="true">
      <header class="picker-head">
        <!-- Deliberately not role="tablist"/"tab": that pattern promises
             roving-tabindex and arrow-key selection, which these plain buttons
             do not implement. Two toggle buttons is what this actually is, so
             `aria-pressed` says so — the same treatment the chassis chips use. -->
        <div class="door-toggle">
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
        <UButton variant="link" color="neutral" size="xs" @click="emit('close')">{{ $t('build.close') }}</UButton>
      </header>

      <div class="picker-body">
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
      </div>
    </div>
  </div>
</template>
