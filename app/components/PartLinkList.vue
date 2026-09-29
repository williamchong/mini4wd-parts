<script setup lang="ts" generic="Entry extends { id: string, names: Names, thumbnail?: string }">
/**
 * Links to catalog records — the variant family, the neighbours in a category,
 * or the kits built on a chassis.
 *
 * Not `PartCard`, which is a *choice*: its whole body belongs to the picker's
 * select button, and an anchor cannot live inside one. These rows are the
 * opposite, a link and nothing else, and they carry no specs because the reason
 * to follow one is the picture and the name.
 */
import type { RouteLocationRaw } from 'vue-router'
import type { Names } from '#shared/catalog/names'
import type { IconName } from '~/utils/icons'

const props = withDefaults(defineProps<{
  parts: Entry[]
  /** The page's own glyph: a family shares a slot, so it shares the fallback. */
  icon: IconName
  /**
   * Where a row goes, for the callers whose rows are not parts: a chassis page
   * and a guide list kits, which have pages at `/kits/<id>` (docs/PLAN.md
   * §4.7). Given the caller's own row rather than just its id, so a caller
   * can route on any field of it.
   */
  to?: (entry: Entry) => RouteLocationRaw
}>(), { to: undefined })

const localePath = useLocalePath()
const { resolve, isFallback } = useCatalogName()

const linkTo = (entry: Entry) =>
  props.to?.(entry) ?? localePath(`/parts/${entry.id}`)
</script>

<template>
  <ul class="part-link-list">
    <li v-for="entry in parts" :key="entry.id">
      <NuxtLink :to="linkTo(entry)">
        <CatalogThumb :src="entry.thumbnail" :icon="icon" />
        <span class="part-link-name" :class="{ fallback: isFallback(entry.names) }">
          {{ resolve(entry.names).value }}
        </span>
        <span class="part-id">{{ entry.id }}</span>
      </NuxtLink>
      <!-- Beside the link, never inside it: a button cannot live in an anchor. -->
      <slot name="action" :entry="entry" />
    </li>
  </ul>
</template>
