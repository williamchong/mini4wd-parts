<template>
  <div>
    <Breadcrumbs :trail="trail" />
    <ContentRenderer v-if="page" :value="page" />
  </div>
</template>

<script setup>
definePageMeta({ layout: 'content' })

const route = useRoute()
const { t, te, locale } = useI18n()

// Each locale is its own collection, and each collection's documents carry the
// locale's route prefix, so the route path is the lookup key in both.
const collection = computed(() => locale.value === 'en' ? 'contentEn' : 'contentZhHant')

// GitHub Pages redirects /about to /about/, so a direct visit lands on a path
// with a trailing slash that no document has. Without this the page renders
// from the prerendered HTML and then empties itself on hydration.
const contentPath = computed(() => route.path.replace(/\/+$/, '') || '/')

// The catch-all component instance is reused between sibling content routes, so
// the key has to be a getter: as a literal every route would share the first
// path's cache entry, and it is the key changing that re-runs the fetch.
const { data: page } = await useAsyncData(
  () => `content-${contentPath.value}`,
  () => queryCollection(collection.value).path(contentPath.value).first()
)

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: t('error.notFound'), fatal: true })
}

// A prose page's trail is the one place the hierarchy *is* the path, so it is
// read off it rather than declared. The locale prefix is not a level — it is
// the same page in another language — and `localePath` puts it back.
const segments = computed(() =>
  contentPath.value.split('/').filter(part => part && part !== locale.value))

// `nav.<segment>` where the navigation already names the section, the page's
// own title for the leaf, and the raw segment for anything in between that we
// have no name for.
const trail = computed(() => segments.value.map((segment, index) => {
  const last = index === segments.value.length - 1
  const key = `nav.${segment}`
  return {
    to: last ? undefined : `/${segments.value.slice(0, index + 1).join('/')}`,
    label: last ? page.value?.title ?? segment : te(key) ? t(key) : segment
  }
}))
</script>
