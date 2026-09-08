<template>
  <ContentRenderer v-if="page" :value="page" />
</template>

<script setup>
definePageMeta({ layout: 'content' })

const route = useRoute()
const { t, locale } = useI18n()

// Each locale is its own collection, and each collection's documents carry the
// locale's route prefix, so the route path is the lookup key in both.
const collection = computed(() => locale.value === 'en' ? 'contentEn' : 'contentZhHant')

// GitHub Pages redirects /about to /about/, so a direct visit lands on a path
// with a trailing slash that no document has. Without this the page renders
// from the prerendered HTML and then empties itself on hydration.
const contentPath = computed(() => route.path.replace(/\/+$/, '') || '/')

// The catch-all component instance is reused between sibling content routes,
// so the fetcher has to be re-run on path changes rather than only on setup —
// and the key has to be a getter, or every route would share the first path's
// cache entry.
const { data: page } = await useAsyncData(
  () => `content-${contentPath.value}`,
  () => queryCollection(collection.value).path(contentPath.value).first(),
  { watch: [contentPath] }
)

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: t('error.notFound'), fatal: true })
}
</script>
