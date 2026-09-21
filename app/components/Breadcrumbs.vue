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

/**
 * Home is on every trail, so it is prepended once rather than by each caller.
 *
 * Its own key rather than the nav bar's: `/` is the builder and the bar calls
 * it that, but the first crumb of a trail — and the first `ListItem` of the
 * `BreadcrumbList` Google reads — names the root of the site, not the tool
 * standing on it.
 */
const items = computed(() => [{ to: '/', label: t('breadcrumb.home') }, ...props.trail])

/** The trail as the component wants it: localised links, the last one bare. */
const crumbs = computed(() => items.value.map(item => ({
  label: item.label,
  ...(item.to ? { to: localePath(item.to) } : {})
})))

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
  <!--
    `UBreadcrumb` draws the trail and marks the last crumb `aria-current`; the
    `BreadcrumbList` above is still ours, because the hierarchy it declares is
    the thing this component exists for and no markup can carry it.

    A crumb with no `to` is the page being read — the component renders it as
    text rather than a link, which is the same rule the hand-written list had.
  -->
  <UBreadcrumb
    :items="crumbs"
    :aria-label="$t('breadcrumb.label')"
    class="breadcrumbs"
  >
    <!--
      The separator as a character, not the default icon — which is also what
      the hand-written trail used before this component replaced it.

      It does *not* save the Iconify runtime, though that was the hope:
      `UBreadcrumb` imports `UIcon` statically, so the runtime loads on these
      routes whether or not an icon renders (measured 2026-09-22 — the built
      HTML for /parts, /chassis/ma and a part page is byte-identical either
      way). What it saves is the icon out of the client bundle and a DOM node
      per crumb.
    -->
    <template #separator>
      <span aria-hidden="true">›</span>
    </template>
  </UBreadcrumb>
</template>
