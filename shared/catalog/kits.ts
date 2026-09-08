/**
 * Kit helpers for the builder's kit entry point.
 *
 * Two jobs that both have to be right and neither of which belongs in a Vue
 * component: linking back to the Fandom article a kit's loadout was imported
 * from, and deciding what order 305 boxes appear in.
 */
import type { Kit } from './schema.ts'

export const FANDOM_WIKI = 'https://mini-4wd.fandom.com'

/**
 * The wiki article a kit's `loadoutSourceTitle` names.
 *
 * This link is a licence obligation, not a convenience: the loadout is imported
 * from a CC-BY-SA wiki, so the page that renders it has to name the work and
 * give its URI (see CLAUDE.md, docs/PLAN.md §4.7).
 *
 * **`encodeURI`, not `encodeURIComponent`.** MediaWiki titles go
 * space-to-underscore and are then percent-encoded, but most punctuation is
 * legal in the path and encoding it produces a *different page* — a dead
 * attribution link. The committed titles cover four cases that prove it:
 * a trailing dot (`Vanquish Jr.`, 55 kits), a slash that is a real path
 * separator (`Toyota Gazoo Racing WRT/Yaris WRC`, where `%2F` is not the same
 * article), parentheses (`Super Avante Jr. (TD4)`) and an apostrophe
 * (`Mini 4WD New Year's Edition - Year of the Dragon 2024`).
 *
 * `?` and `#` are re-encoded by hand because `encodeURI` leaves them alone and
 * either one would truncate the path. No committed title contains one — that is
 * a property of today's data, not a guarantee about the wiki.
 */
export function fandomArticleUrl(title: string): string {
  const path = encodeURI(title.replace(/ /g, '_'))
    .replace(/\?/g, '%3F')
    .replace(/#/g, '%23')
  return `${FANDOM_WIKI}/wiki/${path}`
}

/**
 * Newest box first, which is what someone holding a kit they just bought wants,
 * and roughly the order a shop shelf is stocked in.
 *
 * The 35 kits with no `releaseDate` sort last rather than first: an absent date
 * must read as neither year zero nor today, and there is nothing to say about
 * where they belong except that they are not the newest.
 *
 * `status` is deliberately **not** a sort key. Ranking `current` above
 * `limited` would bury the 124 limited kits under the 181 current ones, which
 * is the same mistake as filtering them out one notch quieter — docs/PLAN.md
 * §6 M1b corrected exactly that instinct, because a limited kit is one someone
 * owns, not one they cannot have.
 *
 * Ties break on `id` so a generate run produces a stable order.
 *
 * Runs once at prerender, not per keystroke, which is also what lets
 * `releaseDate` stay out of the payload — see `PickableKit`.
 */
export function orderKits<T extends Pick<Kit, 'id' | 'releaseDate'>>(kits: T[]): T[] {
  return [...kits].sort((a, b) => {
    if (a.releaseDate !== b.releaseDate) {
      if (!a.releaseDate) return 1
      if (!b.releaseDate) return -1
      return b.releaseDate.localeCompare(a.releaseDate)
    }
    return a.id.localeCompare(b.id)
  })
}
