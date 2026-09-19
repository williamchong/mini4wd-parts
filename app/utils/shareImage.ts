import { THUMB_SIZES } from '#shared/catalog/thumbnails'

/**
 * The share tags for a part or chassis page, from its detail thumbnail. The
 * site default in nuxt.config.ts is a 1200×630 render on a large card, and
 * each tag here replaces one of its tags by `property` or `name`, so the
 * thumbnail restates its own size and asks for the small card, or it would be
 * announced at 1200×630 and stretched to fill a large one. Only the detail
 * copy is shared: a row thumbnail is under the 200 px Facebook needs, so a
 * record without a detail copy keeps the site's render instead.
 */
export function thumbnailShareMeta(detailUrl: string) {
  const { width, height } = THUMB_SIZES.detail
  return [
    { property: 'og:image', content: detailUrl },
    { property: 'og:image:width', content: String(width) },
    { property: 'og:image:height', content: String(height) },
    { name: 'twitter:card', content: 'summary' }
  ]
}
