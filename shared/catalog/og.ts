import type { NameLocale } from './names.ts'

/**
 * Where a share card lives, and how big it is.
 *
 * A card is not a thumbnail. `public/thumbs/` holds Tamiya's photo downscaled
 * to a size that keeps the copy defensible (docs/PLAN.md §7); a card is our own
 * 1200x630 layout — background, type and the site's name — with that same
 * downscaled photo placed in it at its native size. Nothing here enlarges a
 * Tamiya photograph, which is the rule the thumbnails are built around.
 *
 * Per locale, because the card is mostly words: a Chinese card under an English
 * page would be the one part of that page the reader cannot read.
 *
 * The path is derived from the id rather than stored on the record, for the
 * reason `thumbnails.ts` gives: every chassis has a card, so a stored string
 * would say nothing a derivation cannot, on every payload that carries a
 * chassis. `catalog:verify` is what holds the files and this helper together.
 */

export type OgCollection = 'chassis'

export const OG_CARD_SIZE = { width: 1200, height: 630 } as const

/** JPEG, not WebP: Facebook and LinkedIn still refuse WebP as an `og:image`,
 *  which is why `public/images/og.jpg` is a JPEG while every thumbnail is not. */
export const ogCardDirName = (collection: OgCollection, locale: NameLocale) =>
  `/og/${collection}/${locale}`

export const ogCardPath = (collection: OgCollection, locale: NameLocale, id: string) =>
  `${ogCardDirName(collection, locale)}/${id}.jpg`
