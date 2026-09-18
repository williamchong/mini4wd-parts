<script setup lang="ts">
/**
 * Part categories as linked cards: a glyph, the name and a count. `/parts`
 * lists all of them and the home page the few a first upgrade reaches for, so
 * the caller decides which and in what order, and labels them.
 */
import type { PartCategory } from '#shared/catalog/schema'
import type { IconName } from '~/utils/icons'

defineProps<{
  categories: { category: PartCategory, label: string, count: number, icon: IconName }[]
}>()

const localePath = useLocalePath()
</script>

<template>
  <ul class="category-grid">
    <li v-for="entry in categories" :key="entry.category">
      <NuxtLink :to="localePath(`/parts/category/${entry.category}`)">
        <SlotIcon :name="entry.icon" />
        <span class="category-name">{{ entry.label }}</span>
        <span class="chip-count category-count">
          {{ $t('browse.parts.count', { count: entry.count }) }}
        </span>
      </NuxtLink>
    </li>
  </ul>
</template>
