/**
 * Where a product thumbnail lives. Shared because the pipeline writes the files
 * and the app requests them, and a disagreement between the two is a picture
 * that silently falls back to a drawn icon.
 *
 * The path is derived from the item number rather than stored per record. It is
 * worth the indirection: the string is 25 bytes on every one of the 631 parts
 * and kits in the prerendered payload, and it says nothing a boolean cannot —
 * ~1.8 KB gzipped on every page, for every visitor, against the 1.5 KB the
 * builder already strips `releaseDate` to save. `content/*.yml` still stores the
 * real path, because `catalog:verify` checks that the file it names exists.
 */

export type ThumbCollection = 'parts' | 'kits' | 'chassis'

/**
 * Two sizes of the same photo. `row` (160x120) is what a list, a picker or a
 * build row shows. `detail` (320x240) is what a part page leads with, where a
 * row thumbnail is a postage stamp and upscaling one looks worse than showing
 * it small. Only parts have a detail copy, because parts are the only records
 * with a page of their own (docs/PLAN.md §6 M1b).
 */
export type ThumbVariant = 'row' | 'detail'

/**
 * Detail copies live in their own directory beside the rows rather than under a
 * suffixed filename, so listing either set stays a plain `readdir` — the
 * pipeline learns which items have a picture by reading the directory — and
 * `public/thumbs` is still one `rm -r`.
 */
/**
 * The pixel size of each variant. `catalog:thumbs` resizes to these and
 * `CatalogThumb` reserves them as the image's intrinsic size, so the two halves
 * cannot drift into a reserved box that is not the shape of the file in it.
 */
export const THUMB_SIZES: Record<ThumbVariant, { width: number, height: number }> = {
  row: { width: 160, height: 120 },
  detail: { width: 320, height: 240 }
}

/** The directory a variant lives in, which is the only part of the path it changes. */
export const thumbnailDirName = (collection: ThumbCollection, variant: ThumbVariant = 'row') =>
  variant === 'detail' ? `${collection}-detail` : collection

export const thumbnailPath = (
  collection: ThumbCollection,
  id: string,
  variant: ThumbVariant = 'row'
) => `/thumbs/${thumbnailDirName(collection, variant)}/${id}.webp`

/** The thumbnail for a catalog record, or nothing when it has none. */
export const thumbnailSrc = (
  collection: ThumbCollection,
  item?: { id: string, hasThumbnail?: boolean }
) => item?.hasThumbnail ? thumbnailPath(collection, item.id) : undefined

/**
 * A catalog record as the client wants it: the stored path replaced by the one
 * bit of it the client cannot derive.
 */
export const flagThumbnail = <T extends { thumbnail?: string }>(
  { thumbnail, ...record }: T
) => ({ ...record, hasThumbnail: !!thumbnail })
