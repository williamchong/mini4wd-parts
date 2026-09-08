<template>
  <ContentRenderer v-if="page" :value="page" />
</template>

<script setup>
definePageMeta({ layout: 'content' })

const route = useRoute()

// The catch-all component instance is reused between sibling content routes,
// so the fetcher has to be re-run on path changes rather than only on setup.
const { data: page } = await useAsyncData(
  `content-${route.path}`,
  () => queryCollection('content').path(route.path).first(),
  { watch: [() => route.path] }
)

if (!page.value) {
  throw createError({ statusCode: 404, statusMessage: '找不到頁面 Page not found', fatal: true })
}
</script>
