import { readdirSync } from 'node:fs'
import { join } from 'node:path'
import { ROOT } from './fetch.ts'
import { thumbnailDirName, thumbnailPath } from '../../shared/catalog/thumbnails.ts'
import type { ThumbCollection, ThumbVariant } from '../../shared/catalog/thumbnails.ts'
import { ogCardDirName, ogCardPath, type OgCollection } from '../../shared/catalog/og.ts'
import type { NameLocale } from '../../shared/catalog/names.ts'

/**
 * The build-time half of the generated image layout: where the files are on disk.
 * The public path they answer to is in shared/catalog/thumbnails.ts, because
 * the app derives it too.
 *
 * Three stages have to agree about this: `thumbs.ts` writes the files,
 * `generate.ts` records the path on each record, and `verify.ts` fails the
 * build when the two have drifted.
 */

/** The same file the app asks for by `thumbnailPath`, as a path on disk. */
export const thumbnailFile = (collection: ThumbCollection, id: string, variant: ThumbVariant = 'row') =>
  join(ROOT, 'public', thumbnailPath(collection, id, variant))

/** Named by the same helper the public path uses, so a directory can never
 *  disagree with the files the app asks for inside it. */
export const thumbnailDir = (collection: ThumbCollection, variant: ThumbVariant = 'row') =>
  join(ROOT, 'public/thumbs', thumbnailDirName(collection, variant))

/**
 * The item numbers that actually have a thumbnail, read from the directory
 * rather than from a manifest: the files are the only thing that can say. An
 * item whose photo Tamiya never published, or whose fetch failed, is simply
 * absent here and falls back to its slot icon in the UI.
 */
export function thumbnailIds(collection: ThumbCollection, variant: ThumbVariant = 'row'): Set<string> {
  let files: string[] = []
  try {
    files = readdirSync(thumbnailDir(collection, variant))
  }
  catch {
    // Nothing generated yet — the first run of catalog:thumbs creates it.
  }
  return new Set(files.filter(name => name.endsWith('.webp')).map(name => name.slice(0, -'.webp'.length)))
}

/**
 * The same file `ogCardPath` names, as a path on disk. Here rather than in the
 * generator because `og.ts` is a script that runs on import: `verify.ts` needs
 * to find the cards without writing them.
 */
export const ogCardFile = (collection: OgCollection, locale: NameLocale, id: string) =>
  join(ROOT, 'public', ogCardPath(collection, locale, id))

/** Named by the same helper the public path uses, for the reason `thumbnailDir`
 *  gives: a directory that cannot disagree with the files asked for inside it. */
export const ogCardDir = (collection: OgCollection, locale: NameLocale) =>
  join(ROOT, 'public', ogCardDirName(collection, locale))
