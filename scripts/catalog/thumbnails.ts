import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './fetch.ts'
import { thumbnailPath } from '../../shared/catalog/thumbnails.ts'
import type { ThumbCollection } from '../../shared/catalog/thumbnails.ts'

/**
 * The build-time half of the thumbnail layout: where the files are on disk.
 * The public path they answer to is in shared/catalog/thumbnails.ts, because
 * the app derives it too.
 *
 * Three stages have to agree about this: `thumbs.ts` writes the files,
 * `generate.ts` records the path on each record, and `verify.ts` fails the
 * build when the two have drifted.
 */

export const THUMB_DIR = join(ROOT, 'public/thumbs')

export const thumbnailDir = (collection: ThumbCollection) => join(THUMB_DIR, collection)

/** The same file the app asks for by `thumbnailPath`, as a path on disk. */
export const thumbnailFile = (collection: ThumbCollection, id: string) =>
  join(ROOT, 'public', thumbnailPath(collection, id))

/**
 * The item numbers that actually have a thumbnail, read from the directory
 * rather than from a manifest: the files are the only thing that can say. An
 * item whose photo Tamiya never published, or whose fetch failed, is simply
 * absent here and falls back to its slot icon in the UI.
 */
export function thumbnailIds(collection: ThumbCollection): Set<string> {
  let files: string[] = []
  try {
    files = readdirSync(thumbnailDir(collection))
  }
  catch {
    // Nothing generated yet — the first run of catalog:thumbs creates it.
  }
  return new Set(files.filter(name => name.endsWith('.webp')).map(name => name.slice(0, -'.webp'.length)))
}
