<script setup lang="ts">
/**
 * This exists for the head. @nuxtjs/i18n only manages `lang`, hreflang and
 * canonical when `experimental.strictSeo` is on, and with it off `useLocaleHead`
 * has to be called somewhere that wraps every route. layouts/content.vue is not
 * that place — a page is free to opt out of it.
 */
const { t, locale } = useI18n()
const i18nHead = useLocaleHead()

const zhHref = computed(() =>
  i18nHead.value.link?.find(link => 'hreflang' in link && link.hreflang === 'zh-Hant')?.href
)

useHead(() => ({
  htmlAttrs: i18nHead.value.htmlAttrs,
  title: t('site.title'),

  link: [
    ...(i18nHead.value.link ?? []),
    // A locale carries exactly one hreflang, and Hong Kong and Taiwan readers
    // share one prerendered page set, so both regions are pointed at the
    // zh-Hant URL by hand. zh-TW stays even though only Hong Kong wording is
    // offered: the page is readable in Taiwan, and the alternative is being
    // absent from Taiwan results rather than being present in the wrong words.
    // unhead keys alternates by hreflang, so these cannot collide with the
    // module's own.
    ...(zhHref.value
      ? [
          { rel: 'alternate' as const, hreflang: 'zh-HK', href: zhHref.value },
          { rel: 'alternate' as const, hreflang: 'zh-TW', href: zhHref.value }
        ]
      : [])
  ],

  meta: [
    ...(i18nHead.value.meta ?? []),
    { name: 'description', content: t('site.description') },
    { property: 'og:title', content: t('site.title') },
    { property: 'og:description', content: t('site.description') },
    // The module derives og:locale from the language tag, giving `zh_Hant`,
    // which is not one of the values Open Graph consumers know.
    ...(locale.value === 'zh-Hant'
      ? [{ property: 'og:locale', content: 'zh_HK' }]
      : [])
  ]
}))
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
