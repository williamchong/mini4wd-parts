import { readdirSync, readFileSync } from 'node:fs'

const SITE_URL = 'https://mini4wd.parts'
const GA_MEASUREMENT_ID = 'G-GJ34BG7E3W'

const PARTS_DIR = new URL('content/parts/', import.meta.url)

const ymlNames = (dir: URL) => readdirSync(dir).filter(name => name.endsWith('.yml'))

const partFiles = ymlNames(PARTS_DIR)

/**
 * Every catalog page, read from the generated catalog rather than crawled.
 *
 * `crawlLinks` now reaches all of them — the browse indexes link down to every
 * category and every part (docs/PLAN.md §6 M1b) — but enumerating keeps the
 * property that made this list worth writing: a page cannot go missing because
 * a link stopped rendering. The filenames are the ids, so parts and chassis
 * need no YAML parsed.
 */
const partRoutes = partFiles.map(name => `/parts/${name.slice(0, -'.yml'.length)}`)

const chassisRoutes = ymlNames(new URL('content/chassis', import.meta.url))
  .map(name => `/chassis/${name.slice(0, -'.yml'.length)}`)

/**
 * Category pages, from the categories that actually have members — **not** from
 * `PART_CATEGORIES`, three of whose 32 values (`switch`, `battery`,
 * `battery-holder`) match no part today and would each prerender an empty page.
 * A regex rather than a YAML parse: the field is one line of 382 small files.
 */
const categoryRoutes = [...new Set(partFiles.map(name =>
  /^category: (.+)$/m.exec(readFileSync(new URL(name, PARTS_DIR), 'utf8'))?.[1]))]
  .filter(category => category !== undefined)
  .sort()
  .map(category => `/parts/category/${category}`)

const catalogRoutes = [...partRoutes, ...categoryRoutes, ...chassisRoutes]

export default defineNuxtConfig({
  compatibilityDate: '2026-09-08',
  devtools: { enabled: true },
  modules: ['@nuxt/content', '@nuxtjs/i18n', '@nuxtjs/sitemap'],

  // The sitemap module's own notion of the site's origin. Same value as
  // `runtimeConfig.public.siteUrl`, which the pages use for absolute og:image
  // and JSON-LD URLs; this one is read at build time by the module.
  site: { url: SITE_URL },

  // Every route is prerendered, so the module has the complete list without
  // crawling anything (docs/PLAN.md §6 M1b). One file rather than a per-locale
  // index: ~1,600 URLs is far under the 50,000 limit, and a sitemap index
  // pointing at a single sitemap is a redirect with extra steps.
  sitemap: {
    sitemaps: false,
    /**
     * **Off deliberately, and not for the bytes.** Left on, the module scans
     * all 1,709 prerendered pages and lifts every `<img>` into the XML — 8,592
     * `image:image` entries, 1.1 MB of the 1.4 MB file. Those images are our
     * downscales of Tamiya's product photos, and submitting them is an explicit
     * invitation to index them in Google Images, where they appear *detached*
     * from the credit line and the link to Tamiya's own product page. Being
     * small, credited and beside that link is the entire defence the copies
     * rest on (CLAUDE.md, §3.3); a sitemap that strips them out of that context
     * gives it away. The file is 319 KB raw / 11 KB gzipped without them.
     */
    discoverImages: false,
    // `/build` is a redirect document standing in for a 301 we cannot send,
    // and a sitemap is a list of pages to index, not of forwarding addresses.
    exclude: ['/build', '/*/build']
  },

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

  runtimeConfig: {
    public: {
      // The head needs absolute URLs — og:image and the JSON-LD `url` — and
      // there is no request to derive an origin from in a prerendered page.
      siteUrl: SITE_URL
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
        '/', '/about', '/guides', '/parts', '/chassis', '/build',
        '/en', '/en/about', '/en/guides', '/en/parts', '/en/chassis', '/en/build',
        ...catalogRoutes,
        ...catalogRoutes.map(route => `/en${route}`)
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
          innerHTML: `
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
