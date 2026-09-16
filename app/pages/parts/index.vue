<script setup lang="ts">
/**
 * The top of the parts hierarchy: 29 categories, each a card with a count.
 *
 * Deliberately **not** a 382-row list. Search over everything already exists in
 * the builder's part picker, and a second one here would ship the whole catalog
 * to a reader who is still deciding what kind of thing they want. The rows live
 * one level down, where a category page carries only its own
 * (docs/PLAN.md §6 M1b).
 *
 * `category` is a single-valued enum on every part, so these pages partition
 * the catalog: no part is listed twice, and there is no near-duplicate index.
 */
import type { PartCategory } from '#shared/catalog/schema'

definePageMeta({ layout: 'content' })

const { t } = useI18n()
const { term } = useTerm()
const localePath = useLocalePath()

const { data } = await useAsyncData('parts-categories', async () => {
  const docs = await queryCollection('parts').select('category', 'slots').all()

  const byCategory = new Map<PartCategory, typeof docs>()
  for (const doc of docs) {
    const group = byCategory.get(doc.category) ?? []
    group.push(doc)
    byCategory.set(doc.category, group)
  }

  return {
    total: docs.length,
    // Aggregated before the return, so the 382 rows above never reach the
    // payload — only these 29 do.
    categories: [...byCategory].map(([category, group]) => ({
      category,
      count: group.length,
      icon: commonestSlot(group)
    }))
  }
})

/**
 * Biggest first. A beginner opening this page is far likelier to want rollers
 * (49) than a motor mount (1), and any curated order would be a fourth list to
 * maintain beside the enum, the taxonomy rules and the locale files.
 */
const categories = computed(() =>
  [...(data.value?.categories ?? [])]
    .map(entry => ({ ...entry, label: term(entry.category, `part.category.${entry.category}`) }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)))

const counts = computed(() => ({
  count: data.value?.total ?? 0,
  categories: categories.value.length
}))

const title = computed(() => `${t('browse.parts.title')} — ${t('site.title')}`)
const description = computed(() => t('browse.parts.description', counts.value))

useHead(() => ({
  title: title.value,
  meta: [
    { name: 'description', content: description.value },
    { property: 'og:title', content: title.value },
    { property: 'og:description', content: description.value }
  ]
}))
</script>

<template>
  <div>
    <Breadcrumbs :trail="[{ label: $t('nav.parts') }]" />

    <h1>{{ $t('browse.parts.title') }}</h1>
    <i18n-t keypath="browse.parts.intro" tag="p" class="browse-intro" scope="global">
      <template #count>{{ counts.count }}</template>
      <template #categories>{{ counts.categories }}</template>
      <template #builder>
        <NuxtLink :to="localePath('/')">{{ $t('browse.parts.builderLink') }}</NuxtLink>
      </template>
    </i18n-t>

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
  </div>
</template>
