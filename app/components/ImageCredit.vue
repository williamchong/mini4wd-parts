<script setup lang="ts">
/**
 * The credit under every surface that shows our Tamiya thumbnails. Part of what
 * keeps those copies defensible is sitting beside a link to Tamiya itself
 * (CLAUDE.md, docs/PLAN.md §3.3), so the name in the sentence is that link.
 *
 * English readers get Tamiya's English site; Traditional Chinese readers get the
 * Japanese one, which is the catalog every part page already links into —
 * Tamiya publishes no Chinese site of its own.
 */
const { locale } = useI18n()
const tamiyaUrl = computed(() => locale.value === 'en'
  ? 'https://www.tamiya.com/english/'
  : 'https://www.tamiya.com/japan/')
</script>

<template>
  <i18n-t keypath="build.imageCredit" tag="p" class="image-credit" scope="global">
    <template #tamiya>
      <a :href="tamiyaUrl" target="_blank" rel="noopener">{{ $t('build.imageCreditTamiya') }}</a>
    </template>
  </i18n-t>
</template>
