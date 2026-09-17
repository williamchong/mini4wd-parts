/**
 * Sends Google Analytics a `page_view` for each in-app navigation, and keeps
 * gtag's idea of "the current page" up to date for every other event.
 *
 * The registry entry in `nuxt.config.ts` runs `gtag('config', id)` once the tag
 * loads, and that call carries the landing page's `page_view` by itself. Nuxt
 * then never reloads the document, so every route after it is invisible to GA
 * unless something reports it — this.
 *
 * The `gtag('set', …)` is not decoration. `config` resolves `page_location`
 * once and every later event inherits that value, so without it every event
 * `useAnalytics` sends would be reported against whatever page the session
 * started on, however far the reader has since navigated.
 *
 * PostHog needs no equivalent: `capturePageview: 'history_change'` has
 * posthog-js watch the History API from inside the SDK.
 *
 * Call it once, from a place that outlives every route (`app/app.vue`).
 */
export function useAnalyticsPageViews() {
  const { proxy } = useScriptGoogleAnalytics()

  /** The previous page, which is also the flag for "the landing render is done". */
  let previousLocation: string | undefined

  useScriptEventPage(({ title, path }) => {
    // `useScriptEventPage` reports `route.fullPath`, hash and all, and on this
    // site the hash is a whole build (`useBuildLink`) or a category's chassis
    // filter. Left in, `/` would become one report row per shared build.
    const pageLocation = new URL(path, location.origin)
    pageLocation.hash = ''

    const referrer = previousLocation
    previousLocation = pageLocation.href

    proxy.gtag('set', { page_location: pageLocation.href, page_title: title })

    // The first callback is the landing render, which `gtag('config', …)` has
    // already counted. It cannot be missed by registering late: this composable
    // runs in `app.vue`'s setup, which always precedes NuxtPage's first Suspense
    // resolve — and the route it reports is not necessarily the URL the reader
    // opened, because Nuxt defers a prerendered page's hash until after
    // hydration (see the same trap in `useBuildLink`).
    if (!referrer) return

    proxy.gtag('event', 'page_view', {
      page_title: title,
      page_location: pageLocation.href,
      // A client navigation leaves no document referrer, so GA4's SPA guidance
      // is to name the previous page explicitly.
      page_referrer: referrer
    })
  })
}
