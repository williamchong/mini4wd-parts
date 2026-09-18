<script setup lang="ts">
/**
 * The chassis as linked cards: a picture, a name and the one line that tells
 * them apart — where the motor sits, what it is geared at, when it arrived.
 *
 * Shared by `/chassis` and the home page, which reach the same eight records
 * by different roads: the index queries them, and the builder already holds
 * them in its payload with the thumbnail reduced to a flag, so each caller
 * hands over a resolved `thumbnail` path rather than a record.
 */
import type { Chassis } from '#shared/catalog/schema'

defineProps<{
  chassis: (Pick<Chassis, 'id' | 'names' | 'motorPosition' | 'releaseYear' | 'kitGearRatio'> & {
    thumbnail?: string
    /** How many kits are built on it, where the caller has the kits to count. */
    kitCount?: number
  })[]
}>()

const localePath = useLocalePath()
const { resolve } = useCatalogName()
</script>

<template>
  <ul class="part-link-list">
    <li v-for="entry in chassis" :key="entry.id">
      <NuxtLink :to="localePath(`/chassis/${entry.id}`)">
        <CatalogThumb :src="entry.thumbnail" icon="chassis" />
        <span class="part-link-name">{{ resolve(entry.names).value }}</span>
        <span class="part-id">
          {{ $t(`build.motorPosition.${entry.motorPosition}`) }}
          <template v-if="entry.kitGearRatio"> · {{ entry.kitGearRatio }}</template>
          · {{ entry.releaseYear }}
          <template v-if="entry.kitCount"> · <span class="chassis-kit-count">{{ $t('chassis.kitsCount', { count: entry.kitCount }) }}</span></template>
        </span>
      </NuxtLink>
    </li>
  </ul>
</template>
