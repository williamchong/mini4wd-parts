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
  <!--
    No `UApp` anywhere on this site, deliberately, and the absence is load
    bearing. It is Nuxt UI's provider root, and the usual advice is to wrap
    everything in it — which here would put its provider tree on all 1,713
    prerendered routes at 40.7 KB gz a page.
    `UModal` is declarative: it renders its own Reka dialog root and wants no
    provider. Verified 2026-09-22 with it gone — all three pickers still open,
    trap focus, lock the body, close on Escape and hand focus back to the
    button that opened them, with nothing on the console.
    `UApp` is what a toast, `useOverlay` or a tooltip would need. Nothing here
    uses one; the first thing that does brings it back, on its own route.
    It is also what would carry a locale to Nuxt UI's own strings, so the
    close button on the builder's three dialogs is labelled "Close" rather
    than 關閉. `:close` takes `ButtonProps` and not arbitrary attributes, so
    the fix is a `#close` slot at those three call sites, or `UApp` back with
    a `:locale` — neither worth 10.5 KB gz for one `aria-label` today.
  -->
  <!-- A bar across the top while a navigation waits on its page chunk or
       payload; it stays hidden under 200 ms. A chunk that fails outright is
       Nuxt's to handle: it reloads straight into the page being opened.
       A fixed light step, because it runs across the header, which is pinned
       dark in both modes. -->
  <NuxtLoadingIndicator color="var(--color-chassis-300)" error-color="var(--ui-error)" />
  <BootNotice />
  <NuxtLayout>
    <NuxtPage />
  </NuxtLayout>
</template>
