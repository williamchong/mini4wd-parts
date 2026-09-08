import * as cheerio from 'cheerio'
import { fetchText, progress } from '../fetch.ts'

/**
 * Shared shape of Tamiya's two paginated views: the product lists
 * (`list.html`, 20 per page) and the per-chassis compatibility catalogs
 * (`product_info_ex.html`, 40 per page). Same markup, same `absolutepage`
 * walk, different rows — so the walk lives here and each source only says how
 * to read a row.
 */

/** Item count from the pager. Absent when the result fits on one page. */
export function parsePagerTotal($: cheerio.CheerioAPI, context: string): number | undefined {
  const label = $('.navipage_num_').first().text()
  const parsed = /全([\d,]+)件/.exec(label)
  if (parsed) return Number(parsed[1]!.replace(/,/g, ''))
  // A page with no pager block at all is normal; a pager we cannot read is not.
  if (label.trim()) throw new Error(`Unreadable item count on ${context}`)
  return undefined
}

export const itemAnchors = ($: cheerio.CheerioAPI) => $('.item_list_ li a[data-article]')

export interface Page<T> {
  total?: number
  items: T[]
}

/** Walk `absolutepage=1..n`, de-duplicating rows, until the pager is satisfied. */
export async function walkPages<T>(options: {
  label: string
  url: (page: number) => string
  parse: (html: string) => Page<T>
  idOf: (item: T) => string
  noCache?: boolean
}): Promise<T[]> {
  const collected: T[] = []
  const seen = new Set<string>()
  let page = 1
  let total = Infinity

  while (collected.length < total) {
    const parsed = options.parse(await fetchText(options.url(page), { noCache: options.noCache }))
    if (page === 1 && parsed.total !== undefined) total = parsed.total

    const before = collected.length
    for (const item of parsed.items) {
      const id = options.idOf(item)
      if (seen.has(id)) continue
      seen.add(id)
      collected.push(item)
    }

    if (collected.length === before) break // defensive: an empty page ends the walk
    if (total === Infinity) total = collected.length // single page, no pager
    progress(options.label, collected.length, total)
    page++
  }

  if (collected.length !== total) {
    console.warn(`\n  ! ${options.label}: expected ${total} items, got ${collected.length}`)
  }
  return collected
}
