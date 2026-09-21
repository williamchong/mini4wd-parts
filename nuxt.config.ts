import { readdirSync, readFileSync } from 'node:fs'

const SITE_URL = 'https://mini4wd.parts'
const GA_MEASUREMENT_ID = 'G-GJ34BG7E3W'
// PostHog's *project* API key, public by design: it can only write events
// into this project. Prerendered output has no server to read an env var at
// runtime anyway, so it sits beside the GA id rather than in `.env`.
const POSTHOG_API_KEY = 'phc_tAY3onBYUoZPu78wMTfTYpTLGNivkjrKLJyDd9aDcsnR'

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
const partRoutes = partFiles.map(name => `/parts/${name.slice(0, -'.yml'.length)}/`)

const chassisRoutes = ymlNames(new URL('content/chassis', import.meta.url))
  .map(name => `/chassis/${name.slice(0, -'.yml'.length)}/`)

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
  .map(category => `/parts/category/${category}/`)

const catalogRoutes = [...partRoutes, ...categoryRoutes, ...chassisRoutes]

/**
 * The icons that have to survive into the client bundle: the ones a template
 * names, plus the dialog's close button, which is Nuxt UI's by way of its
 * default icon map and renders only once a dialog is open — so no prerendered
 * page contains it and no grep of `app/` finds it.
 *
 * The breadcrumb separator is deliberately absent: `Breadcrumbs.vue` fills
 * UBreadcrumb's `#separator` slot, and the component's `<UIcon>` is the
 * fallback *inside* that slot, so it never renders.
 */
const CLIENT_ICONS = [
  'lucide:share-2',
  'lucide:link',
  'lucide:check',
  'lucide:search',
  'lucide:x'
]

export default defineNuxtConfig({
  compatibilityDate: '2026-09-08',
  devtools: { enabled: true },
  modules: [
    '@nuxt/content',
    '@nuxtjs/i18n',
    '@nuxtjs/sitemap',
    '@nuxt/scripts',
    '@nuxt/ui',

    /**
     * Prune the client icon bundle down to what the site renders.
     *
     * @nuxt/ui adds **every value of its default `ui.icons` map** — all 45,
     * the names for its calendar, its command palette, its auth form — through
     * this same hook, unconditionally (`node_modules/@nuxt/ui/dist/module.mjs`,
     * `nuxt.hook('icon:clientBundleIcons', …)`). Neither `clientBundle.scan`
     * nor `clientBundle.icons` touches that: listing ours *adds* to the set and
     * nothing takes UI's away, so a build with an explicit five-icon list still
     * reported `45 icons with 11.02KB`. Only a hook registered after the module
     * can remove them, which is what this inline module is for and why it is
     * last in this array rather than a `hooks:` entry (those run too early).
     */
    (_options, nuxt) => {
      nuxt.hook('icon:clientBundleIcons', (icons: Set<string>) => {
        for (const name of icons) if (!CLIENT_ICONS.includes(name)) icons.delete(name)
      })
    }
  ],

  // The sitemap module's own notion of the site's origin. Same value as
  // `runtimeConfig.public.siteUrl`, which the pages use for absolute og:image
  // and JSON-LD URLs; this one is read at build time by the module.
  site: { url: SITE_URL, trailingSlash: true },

  // **Every URL ends in a slash**, because that is the one GitHub Pages serves.
  // A route prerenders to `<route>/index.html`, and Pages answers `/about` with
  // a 301 to `http://…/about/`, which a second 301 sends back to https. With
  // the slash left off, every canonical, hreflang, og:url, breadcrumb and
  // sitemap URL on the site named that redirect chain rather than a page.
  // Writing `about.html` instead would keep the bare URLs, but it would 404 the
  // slash URLs the redirect has been handing out and search engines have been
  // indexing. The three settings answer to three modules — this one for the
  // sitemap, `i18n.trailingSlash` for the canonical and alternates, and the
  // `nuxtLink` default for every internal link the crawler follows — and
  // they have to agree.

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
    exclude: ['/build/', '/*/build/']
  },

  // The site is one set of Traditional Chinese pages at the root plus English
  // under /en/. zh-Hant rather than zh-TW because every Traditional Chinese
  // name in the catalog comes from tamiya.hk: labelling the root zh-TW would
  // serve Hong Kong wording under a Taiwan flag. Hong Kong and Taiwan differ by
  // a glossary, not by pages, so one page set serves both and Hong Kong wording
  // is what it is written in (app/composables/useWording.ts); both regions are
  // pointed at it by hreflang in app/app.vue.
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
    baseUrl: SITE_URL,
    trailingSlash: true
  },

  runtimeConfig: {
    public: {
      // The head needs absolute URLs — og:image and the JSON-LD `url` — and
      // there is no request to derive an origin from in a prerendered page.
      siteUrl: SITE_URL
    }
  },

  experimental: {
    defaults: { nuxtLink: { trailingSlash: 'append' } },
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
        '/', '/about/', '/guides/', '/guides/starter/', '/parts/', '/chassis/', '/build/',
        '/en/', '/en/about/', '/en/guides/', '/en/guides/starter/', '/en/parts/', '/en/chassis/', '/en/build/',
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
        // The builder's own render, an Avante Mk.III Azure with the shell
        // lifted, captured from the pane at 1200×630. A part or chassis page
        // replaces all four with its detail thumbnail (app/utils/shareImage.ts).
        { property: 'og:image', content: `${SITE_URL}/images/og.jpg` },
        { property: 'og:image:width', content: '1200' },
        { property: 'og:image:height', content: '630' },
        { property: 'og:type', content: 'website' },
        { name: 'twitter:card', content: 'summary_large_image' }
      ],
      link: [
        { rel: 'icon', type: 'image/png', href: '/favicon.png' }
      ]
    }
  },

  /**
   * Both tags go through @nuxt/scripts rather than a hand-written `<script>` in
   * `app.head`, so they load *after* hydration (`trigger: 'onNuxtReady'`)
   * instead of blocking the first render, and so calling them from a component
   * is typed — `useScriptGoogleAnalytics().proxy.gtag(...)` and
   * `useScriptPostHog().proxy.posthog.capture(...)` queue their calls until the
   * tag has actually loaded, which is what the builder's funnel events need
   * (docs/PLAN.md §4.1; they go through `app/composables/useAnalytics.ts`).
   *
   * A registry entry with no `trigger` only prepares the composable and never
   * loads the script, so both carry one.
   *
   * **`proxy: false` on both, because GitHub Pages cannot answer a proxy
   * route.** The module's first-party mode would send every beacon to
   * `/_scripts/p/**` and anonymize it in a Nitro handler; `nuxt generate`
   * output has no Nitro. The module detects static output and turns proxying
   * off by itself, but it is written down here so the day this moves to
   * Cloudflare Workers (docs/PLAN.md §4, M2) turning it on is a decision rather
   * than a silent change of where reader IPs go.
   */
  scripts: {
    registry: {
      googleAnalytics: {
        id: GA_MEASUREMENT_ID,
        trigger: 'onNuxtReady',
        proxy: false,
        // Bundling *does* work on Pages — it is a build-time download written
        // into `.output/public/_scripts/assets/<hash>.js`, a static file like
        // any other. It is off because of what the file is, not where it is
        // served from: a copy of Google's script, which we have no licence to
        // redistribute, frozen at build time on a tag Google expects to update
        // itself (owner, 2026-09-18). So gtag.js keeps coming from
        // googletagmanager.com, exactly as the inline snippet fetched it.
        bundle: false
      },
      posthog: {
        apiKey: POSTHOG_API_KEY,
        trigger: 'onNuxtReady',
        proxy: false,
        // PostHog Cloud US, the region the project key was issued for. With the
        // proxy off this is what `api_host` ends up as, verified in the built
        // output rather than assumed — the module injects its own `apiHost`
        // when first-party mode is live.
        region: 'us',
        // Nuxt never reloads the document, so the page-load default would
        // record one pageview per session. `history_change` watches the History
        // API and compares `pathname` only, which is what this site needs: the
        // build and the category page's chassis filter both live in the
        // `#hash` (§4.6, and `useBuildLink` writes it with `replaceState`), and
        // neither of those is a new page.
        capturePageview: 'history_change',
        /**
         * **Off**, which also ends `$rageclick` and the PostHog toolbar's click
         * stats — everything that reads `$autocapture`. Heatmaps are *not* in
         * that list, contrary to the usual summary: they ride on `$$heatmap`,
         * a separate capture that keeps firing (verified 2026-09-18).
         *
         * The trade is deliberate. What autocapture can name here is
         * `button.link` and `a[href^="/parts/"]`, because the actions worth
         * counting are `@click` handlers on generic buttons: it cannot tell a
         * roller swap from a tire swap, which slot was tapped, or which rule
         * fired. The ten events in `app/composables/useAnalytics.ts` carry
         * `slot`, `part`, `rule` and `chassis` and answer the questions
         * docs/PLAN.md §4.1 actually asks — and on a builder this click-heavy,
         * `$autocapture` would otherwise be the whole event bill.
         */
        autocapture: false,
        // Passed straight to `posthog.init()`. Each of these three otherwise
        // pulls another script from PostHog's CDN on every page:
        config: {
          /**
           * **The build must not reach PostHog's own URL property.** `track()`
           * controls what the ten custom events carry, but `$pageview`,
           * `$pageleave` and `$$heatmap` are built by the SDK and stamp
           * `$current_url` from `location.href` — which `useBuildLink` has
           * rewritten to hold a whole build. Left on, the highest-volume events
           * split `/` into one row per shared build, which is no report at all.
           * posthog-js only defaults this on for `defaults >= '2026-06-25'`,
           * and the module passes no `defaults`.
           */
          disable_capture_url_hashes: true,
          // Dead clicks cannot say *what* was clicked once autocapture is off,
          // which is the only thing that would make the report actionable.
          // Note this flag alone does not stop the script downloading: the
          // heatmap collector builds its own dead-click detector that ignores
          // it, so `capture_heatmaps` governs that too.
          capture_dead_clicks: false,
          // Core Web Vitals for a prerendered site are better read from Search
          // Console, and here they would mostly measure the 3D pane, which
          // reports its own timing through `scene_ready`.
          capture_performance: false,
          // Nothing asks beginners anything yet. This is the one of the three
          // worth turning back on, once there is a question worth interrupting
          // someone mid-build for.
          disable_surveys: true
        }
      }
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

  css: ['~/assets/css/main.css'],

  /**
   * Nuxt UI's own dependencies, held to what a prerendered site can serve.
   *
   * `fonts` is the module's documented switch for @nuxt/fonts, which it would
   * otherwise register on our behalf. Off because the stack is the system one
   * (`--font-sans` in main.css) — there is nothing to download, and the module
   * would go looking at build time.
   *
   * `colorMode` is left on, which is to say dark mode is on and follows the
   * system. It was held off until main.css stopped naming colours and started
   * naming roles; with that done the page follows by itself. Two things do not
   * and are pinned instead: the header, which is dark chrome in both modes
   * rather than a surface, and the plate under a product photo, because every
   * Tamiya photo is shot on white and needs a light ground whatever the page
   * is doing.
   */
  ui: {
    fonts: false,

    /**
     * The four colour aliases this site actually names, down from the seven
     * Nuxt UI generates by default. `secondary` and `info` are used nowhere —
     * `emphasis` and `severityColor` reach for primary, warning and error, and
     * main.css reaches for the success scale on the findings box and a swapped
     * row — and every unused alias is another four variants in every component
     * theme and another 230-odd selectors in the stylesheet.
     *
     * `neutral` is not in this list because it is not one of these aliases; it
     * is set separately in app.config.ts and always generated.
     */
    theme: {
      colors: ['primary', 'success', 'warning', 'error']
    }
  },

  /**
   * `provider: 'none'` is what keeps the Iconify API out of the build and out
   * of the page: with it unset, a name @nuxt/icon cannot resolve locally is
   * fetched at runtime, which would put back a third-party request per page of
   * exactly the kind the site dropped with model-viewer (docs/PLAN.md §5.5).
   * The names all resolve from @iconify-json/lucide, installed as a dependency.
   *
   * The server bundle is left at its default (`local`, which it reports on
   * `nuxt prepare`) rather than turned off, because every route here is
   * prerendered: the icon has to be in the HTML the build writes, not painted
   * in afterwards. The client bundle covers the ones that only appear after
   * hydration — the dialog's close button, and the tick the copy button swaps
   * in.
   *
   * Listed rather than scanned, and pruned as well as listed — see the inline
   * module in `modules` above for why listing alone does nothing.
   */
  icon: {
    provider: 'none',
    // `provider: 'none'` alone leaves `fallbackToApi` on, and the prerendered
    // home page then modulepreloads 41 KB of Iconify's API client for names
    // that are all bundled locally. Measured 2026-09-22 by grepping the built
    // chunk out of .output/public; off, the chunk does not ship.
    fallbackToApi: false,
    clientBundle: {
      scan: false,
      icons: CLIENT_ICONS
    }
  }
})
