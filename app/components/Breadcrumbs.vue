<script setup lang="ts">
/**
 * The trail from the home page down to this one — and the only *upward* link
 * on the site (docs/PLAN.md §4.6). The internal graph otherwise points down
 * from the builder into parts and sideways between variants and neighbours, so
 * without this every catalog page hangs off one payload-heavy home page.
 *
 * The hierarchy is declared here, not read off the path: a part lives at
 * `/parts/15512`, one segment deep, whatever category it belongs to. That is
 * what `BreadcrumbList` is for, and it is what lets the detail URLs stay where
 * they were shared from — GitHub Pages cannot issue a 301 (§4.6).
 */
const props = defineProps<{
  /** Nearest the root first, this page last. The last entry needs no `to`. */
  trail: { to?: string, label: string }[]
}>()

const { t } = useI18n()
const localePath = useLocalePath()
const siteUrl = useRuntimeConfig().public.siteUrl

/** Home is on every trail, so it is prepended once rather than by each caller. */
const items = computed(() => [{ to: '/', label: t('nav.home') }, ...props.trail])

useHead(() => ({
  script: [{
    // Keyed because a page may carry a second ld+json block of its own — the
    // part page's `Product` — and two scripts that differ only in their body
    // are exactly what a deduping head manager is entitled to collapse.
    key: 'breadcrumbs',
    type: 'application/ld+json',
    innerHTML: JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      // `item` is omitted on the last entry: it is the page being read, and
      // Google treats a self-link there as optional.
      'itemListElement': items.value.map((item, index) => ({
        '@type': 'ListItem',
        'position': index + 1,
        'name': item.label,
        ...(item.to ? { item: `${siteUrl}${localePath(item.to)}` } : {})
      }))
    })
  }]
}))
</script>

<template>
  <nav class="breadcrumbs" :aria-label="$t('breadcrumb.label')">
    <ol>
      <li v-for="item in items" :key="item.label">
        <NuxtLink v-if="item.to" :to="localePath(item.to)">{{ item.label }}</NuxtLink>
        <span v-else aria-current="page">{{ item.label }}</span>
      </li>
    </ol>
  </nav>
</template>
