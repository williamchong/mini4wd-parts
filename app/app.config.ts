/**
 * Nuxt UI's runtime theme. Only the colour aliases: everything else the
 * components need is either a Tailwind theme value (`@theme` in main.css) or a
 * prop at the call site.
 */
export default defineAppConfig({
  ui: {
    // `chassis` is the site's own blue-grey, defined in main.css. Neutral is
    // Tailwind's pure grey, which is what #333/#555/#444 already were.
    colors: {
      primary: 'chassis',
      neutral: 'neutral'
    }
  }
})
