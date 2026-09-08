const SITE_TITLE = '迷你四驅新手入門資訊站 Mini 4WD Beginner\'s Guide'
const GA_MEASUREMENT_ID = 'G-GJ34BG7E3W'

export default defineNuxtConfig({
  compatibilityDate: '2026-09-08',
  devtools: { enabled: true },
  modules: ['@nuxt/content'],

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
  // server at runtime. The landing page links nowhere, so the content routes
  // are seeded explicitly and the crawler picks up anything they link to.
  nitro: {
    prerender: {
      crawlLinks: true,
      routes: ['/', '/about', '/guides', '/parts']
    }
  },

  app: {
    head: {
      htmlAttrs: { lang: 'zh-TW' },
      title: SITE_TITLE,
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        {
          name: 'description',
          content: '迷你四驅新手入門資訊站，提供完整的迷你四驅相關資訊與新手指南 Mini 4WD beginner\'s guide information site'
        },
        { property: 'og:title', content: SITE_TITLE },
        { property: 'og:description', content: '迷你四驅新手入門資訊站，提供完整的迷你四驅相關資訊與新手指南' },
        { property: 'og:image', content: 'https://mini4wd.parts/images/4wd.png' },
        { property: 'og:url', content: 'https://mini4wd.parts/' },
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
