<script setup lang="ts">
/**
 * Links to other parts — the variant family, or the neighbours in a category.
 *
 * Not `PartCard`, which is a *choice*: its whole body belongs to the picker's
 * select button, and an anchor cannot live inside one. These rows are the
 * opposite, a link and nothing else, and they carry no specs because the reason
 * to follow one is the picture and the name.
 */
import type { Names } from '#shared/catalog/names'
import type { IconName } from '~/utils/icons'

defineProps<{
  parts: { id: string, names: Names, thumbnail?: string }[]
  /** The page's own glyph: a family shares a slot, so it shares the fallback. */
  icon: IconName
}>()

const localePath = useLocalePath()
const { resolve, isFallback } = useCatalogName()
</script>

<template>
  <ul class="part-link-list">
    <li v-for="entry in parts" :key="entry.id">
      <NuxtLink :to="localePath(`/parts/${entry.id}`)">
        <CatalogThumb :src="entry.thumbnail" :icon="icon" />
        <span class="part-link-name" :class="{ fallback: isFallback(entry.names) }">
          {{ resolve(entry.names).value }}
        </span>
        <span class="part-id">{{ entry.id }}</span>
      </NuxtLink>
    </li>
  </ul>
</template>
