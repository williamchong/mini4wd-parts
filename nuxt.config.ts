const SITE_URL = 'https://mini4wd.parts'
const GA_MEASUREMENT_ID = 'G-GJ34BG7E3W'

export default defineNuxtConfig({
  compatibilityDate: '2026-09-08',
  devtools: { enabled: true },
  modules: ['@nuxt/content', '@nuxtjs/i18n'],

  // The site is one set of Traditional Chinese pages at the root plus English
  // under /en/. zh-Hant rather than zh-TW because every Traditional Chinese
  // name in the catalog comes from tamiya.hk: labelling the root zh-TW would
  // serve Hong Kong wording under a Taiwan flag. Hong Kong and Taiwan differ by
  // a glossary, not by pages, so the two are a reader-level wording toggle
  // (see app/composables/useWording.ts) and both are advertised via hreflang
  // in app/app.vue.
  i18n: {
    strategy: 'prefix_except_default',
    defaultLocale: 'zh-Hant',
    locales: [
      { code: 'zh-Hant', language: 'zh-Hant', name: '繁體中文', file: 'zh-Hant.json' },
      { code: 'en', language: 'en', name: 'English', file: 'en.json' }
    ],
    // GitHub Pages serves static files and cannot redirect, so detection would
    // only swap the page client-side after the correct one had already painted.
    detectBrowserLanguage: false,
    baseUrl: SITE_URL
  },

  // model-viewer is a CDN web component, not a Vue component. Without this Vue
  // refuses to render the tag during SSR, which forces <client-only> and costs
  // a 0.1 layout shift when the real element replaces the empty placeholder.
  vue: {
    compilerOptions: {
      isCustomElement: tag => tag === 'model-viewer'
    }
  },

  experimental: {
    // Nothing here depends on route rules, and it saves a request per page.
    appManifest: false
  },

  // GitHub Pages configuration: every route must be prerendered, there is no
  // server at runtime. Both locale trees are seeded explicitly — the crawler
  // would only reach /en/ through the locale switcher, and a switcher that
  // stops rendering for any reason would silently drop the English site from
  // the build rather than fail it.
  nitro: {
    prerender: {
      crawlLinks: true,
      routes: [
        '/', '/about', '/guides', '/parts',
        '/en', '/en/about', '/en/guides', '/en/parts'
      ]
    }
  },

  // The title, description and og:title/og:description are per-locale, so they
  // live in app/app.vue where the active locale is known. `lang` and the
  // canonical are @nuxtjs/i18n's to set; a static value here would fight it.
  app: {
    head: {
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { property: 'og:image', content: `${SITE_URL}/images/4wd.png` },
        { property: 'og:type', content: 'website' }
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon.png' }
      ],
      script: [
        {
          src: `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`,
          async: true
        },
        {
          children: `
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${GA_MEASUREMENT_ID}');
          `
        }
      ]
    }
  },

  content: {
    build: {
      markdown: {
        highlight: {
          theme: 'github-light'
        }
      }
    }
  },

  css: ['~/assets/css/main.css']
})
