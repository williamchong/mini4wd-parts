<script setup lang="ts">
const { locale, locales } = useI18n()
const switchLocalePath = useSwitchLocalePath()
const { wording, setWording } = useWording()

const otherLocales = computed(() => locales.value.filter(l => l.code !== locale.value))

/**
 * Without the hash `switchLocalePath` copies from the router's route. A hash
 * never means the same thing in the other locale: a heading anchor is a slug
 * of translated text, and the builder writes its link with `replaceState`,
 * which the router never sees, so the copied hash is the build as it was when
 * the page was opened, and switching would undo every change since
 * (app/composables/useBuildLink.ts puts the current build back).
 */
const localeHref = (code: Parameters<typeof switchLocalePath>[0]) => switchLocalePath(code).split('#')[0]
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
      v-for="l in otherLocales"
      :key="l.code"
      :to="localeHref(l.code)"
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
