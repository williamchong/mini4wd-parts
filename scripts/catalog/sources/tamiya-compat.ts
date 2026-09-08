import * as cheerio from 'cheerio'
import { itemAnchors, parsePagerTotal, walkPages, type Page } from './tamiya-page.ts'

const BASE = 'https://www.tamiya.com/japan/products/product_info_ex.html'

/** Pure parser for one compatibility page. */
export function parseCompatPage(html: string): Page<string> {
  const $ = cheerio.load(html)
  const ids: string[] = []
  itemAnchors($).each((_, element) => {
    ids.push($(element).attr('data-article')!)
  })
  return { total: parsePagerTotal($, 'compatibility page'), items: ids }
}

/**
 * Tamiya's "ミニ四駆シャーシ別 対応パーツ検索" pages — the machine-readable
 * version of the GUP matching list, which is otherwise only a GIF.
 * These page at 40 items, unlike the 20 of the main product list.
 */
export const scrapeChassisCompat = (code: string, noCache = false) => walkPages<string>({
  label: `chassis ${code}`,
  url: page => `${BASE}?genre_item=mini4wd_chassis_${code}&absolutepage=${page}`,
  parse: parseCompatPage,
  idOf: id => id,
  noCache
})
