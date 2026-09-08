<script setup lang="ts">
/**
 * The bare-chassis entry point. The kit entry point is the other one and lands
 * next; both produce the same `BuildState`, differing only in whether a kit's
 * `stockLoadout` overlays the chassis default.
 */
import type { Chassis, ChassisId } from '#shared/catalog/schema'

/** Only what a card shows — the page selects these columns and no others. */
type ChassisCard = Pick<Chassis,
  'id' | 'names' | 'motorShaft' | 'motorPosition' | 'releaseYear' | 'notes'>

defineProps<{ chassis: ChassisCard[] }>()
const emit = defineEmits<{ select: [ChassisId] }>()

const { resolve } = useCatalogName()
const { locale } = useI18n()
</script>

<template>
  <div class="chassis-picker">
    <h2>{{ $t('build.pickChassis') }}</h2>
    <ul class="chassis-list">
      <li v-for="c in chassis" :key="c.id">
        <button type="button" @click="emit('select', c.id)">
          <span class="chassis-name">{{ resolve(c.names).value }}</span>
          <span class="chassis-facts">
            {{ $t(`spec.shaft.${c.motorShaft}`) }} ·
            {{ $t(`build.motorPosition.${c.motorPosition}`) }} ·
            {{ c.releaseYear }}
          </span>
          <!-- `notes` is one hand-authored Traditional Chinese string per
               chassis with no locale variants, so an English reader would get a
               paragraph of Chinese. Hidden until the field is localised rather
               than shown in the wrong language. -->
          <span v-if="c.notes && locale !== 'en'" class="chassis-notes">{{ c.notes }}</span>
        </button>
      </li>
    </ul>
  </div>
</template>
