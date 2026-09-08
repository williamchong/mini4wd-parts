<script setup lang="ts">
/**
 * A Traditional Chinese term whose Hong Kong and Taiwan wording differ, for use
 * inside Markdown as `:term{name="motor"}`. Prose is written per locale but not
 * per region, so this is the only way a guide can honour the wording toggle.
 *
 * Components under app/components/content/ are registered globally by
 * @nuxt/content with no prefix, which is what makes the `:term` shorthand work.
 */
defineProps<{ name: string }>()
</script>

<template>
  <span>{{ $t(`terms.${name}`) }}</span>
</template>
