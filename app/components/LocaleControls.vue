<script setup lang="ts">
const { locale, locales } = useI18n()
const switchLocalePath = useSwitchLocalePath()
const { wording, setWording } = useWording()
</script>

<template>
  <div class="locale-controls">
    <!--
      Real links, not a select: this is the only thing that points at the other
      locale, so the prerender crawler follows it. The routes are seeded in
      nuxt.config.ts as well, but a link that exists in the HTML is what makes
      the English tree reachable to a reader and a search engine.
    -->
    <NuxtLink
      v-for="l in locales.filter(l => l.code !== locale)"
      :key="l.code"
      :to="switchLocalePath(l.code)"
    >{{ l.name }}</NuxtLink>

    <!-- Hong Kong and Taiwan are wordings of the same pages, so this is a
         preference rather than a link. -->
    <span v-if="locale === 'zh-Hant'" class="wording">
      <span class="wording-label">{{ $t('wording.label') }}</span>
      <button
        v-for="variant in (['hk', 'tw'] as const)"
        :key="variant"
        type="button"
        :aria-pressed="wording === variant"
        @click="setWording(variant)"
      >{{ $t(`wording.${variant}`) }}</button>
    </span>
  </div>
</template>
