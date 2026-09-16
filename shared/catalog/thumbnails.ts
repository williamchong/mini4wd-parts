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

export const thumbnailPath = (collection: ThumbCollection, id: string) =>
  `/thumbs/${collection}/${id}.webp`

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
