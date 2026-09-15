<script setup lang="ts">
// The builder moved to the home page. There is no server to answer with a 301,
// so the prerendered page is a redirect document that sends old links there.
const localePath = useLocalePath()
await navigateTo(localePath('/'), { redirectCode: 301 })
</script>

<template>
  <div />
</template>
