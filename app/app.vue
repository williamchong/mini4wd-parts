<script setup lang="ts">
/**
 * This exists for the head, and for the one other thing that needs a place
 * outliving every route. @nuxtjs/i18n only manages `lang`, hreflang and
 * canonical when `experimental.strictSeo` is on, and with it off `useLocaleHead`
 * has to be called somewhere that wraps every route. layouts/content.vue is not
 * that place — a page is free to opt out of it.
 */
const { t, locale, locales } = useI18n()

// GA only learns about routes after the first one if something tells it, and
// it is also what keeps gtag's idea of the current page current.
useAnalyticsPageViews()

/**
 * Open Graph wants `language_TERRITORY`; the page reads in Hong Kong wording.
 * Keyed by the configured locale codes, so a locale added without an entry is a
 * type error — unhead drops a meta whose content is undefined without a word.
 */
const OG_LOCALES: Record<typeof locale.value, string> = { 'zh-Hant': 'zh_HK', 'en': 'en_US' }
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
    ...(i18nHead.value.meta ?? []).filter(meta =>
      meta.property !== 'og:locale' && meta.property !== 'og:locale:alternate'),
    { name: 'description', content: t('site.description') },
    { property: 'og:title', content: t('site.title') },
    { property: 'og:description', content: t('site.description') },
    { property: 'og:site_name', content: t('site.title') },
    // The module derives og:locale from the language tag, giving `zh_Hant` and
    // a bare `en`, neither of which is a value Open Graph consumers know — on
    // the current locale or as the other page's alternate.
    { property: 'og:locale', content: OG_LOCALES[locale.value] },
    ...locales.value
      .filter(entry => entry.code !== locale.value)
      .map(entry => ({ property: 'og:locale:alternate', content: OG_LOCALES[entry.code] }))
  ]
}))
</script>

<template>
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
