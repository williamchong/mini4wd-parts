import * as cheerio from 'cheerio'
import { fetchText } from '../fetch.ts'
import { itemAnchors, parsePagerTotal, walkPages, type Page } from './tamiya-page.ts'

const BASE = 'https://www.tamiya.com/japan/products'

/**
 * Tamiya's Mini 4WD product tree (genre_item codes, see docs/research/
 * data-sources.md §1) mapped to our own series names. We scrape every parts
 * branch wide and let generate.ts pick the v1 selection, so re-scoping the
 * catalog costs no requests. `3020` (batteries) is fetched but has no series of
 * its own — it stays in the raw snapshot and out of the v1 catalog.
 */
export const GENRE_SERIES = {
  '303010': 'gup',
  '303030': 'ao',
  '303020': 'special',
  '303025': 'limited',
  '3050': 'station',
  '3020': undefined
} as const

/**
 * The kit branch (`3010`) of the same tree, mapped to our kit series. Kept
 * apart from GENRE_SERIES rather than merged into it because the two produce
 * different records: these codes never yield a part.
 *
 * Wild (301020), Dangun (301089) and Train (301090) are deliberately absent —
 * they are out of the v1 catalog (docs/PLAN.md §3.1).
 */
export const KIT_GENRE_SERIES = {
  '301010': 'standard',
  '301030': 'racer',
  '301031': 'racer-special',
  '301040': 'fully-cowled',
  '301050': 'aero',
  '301051': 'laser',
  '301070': 'rev',
  '301080': 'pro',
  '301081': 'super',
  '301082': 'mighty',
  '301083': 'real',
  '301084': 'beginners',
  '301085': 'special',
  '301086': 'limited'
} as const

export type PartGenreCode = keyof typeof GENRE_SERIES
export type KitGenreCode = keyof typeof KIT_GENRE_SERIES
export type GenreCode = PartGenreCode | KitGenreCode

/**
 * Carrying the genre as a type parameter is what stops a kit reaching the part
 * builder: `data/raw/tamiya-jp-kits.json` reads back as `JpItem<KitGenreCode>`,
 * which `GENRE_SERIES[item.genre]` will not accept.
 */
export interface ListEntry<G extends GenreCode = GenreCode> {
  id: string
  genre: G
  seriesLabel: string
  listName: string
}

export interface JpItem<G extends GenreCode = GenreCode> extends ListEntry<G> {
  nameJa: string
  nameEn?: string
  gupNumber?: number
  priceJpy?: number
  priceJpyExTax?: number
  releaseDateRaw?: string
  releaseDate?: string
  chassisCodes: string[]
  compatRaw?: string
  specsRaw?: string
  imageUrl?: string
  officialUrl: string
  infoAsOf?: string
  scrapedAt: string
}

const text = (value: string | undefined) =>
  (value ?? '').replace(/　/g, ' ').replace(/\s+/g, ' ').trim()

/** Pure parser for a product list page, so tests need no network. */
export function parseListPage<G extends GenreCode>(html: string, genre: G): Page<ListEntry<G>> {
  const $ = cheerio.load(html)
  const entries: ListEntry<G>[] = []

  itemAnchors($).each((_, element) => {
    const anchor = $(element)
    entries.push({
      id: anchor.attr('data-article')!,
      genre,
      seriesLabel: text(anchor.find('.txt_ span').first().text()),
      listName: text(anchor.find('.txt_ h3').text()).replace(/^ITEM \d+\s*/, '')
    })
  })

  return { total: parsePagerTotal($, `genre ${genre}`), items: entries }
}

/** Collect every item id in a genre, following `absolutepage` pagination. */
export const scrapeGenreList = <G extends GenreCode>(genre: G, noCache = false) =>
  walkPages<ListEntry<G>>({
    label: `genre ${genre}`,
    url: page => `${BASE}/list.html?field_sort=d&cmdarticlesearch=1&genre_item=${genre}&absolutepage=${page}`,
    parse: html => parseListPage(html, genre),
    idOf: entry => entry.id,
    noCache
  })

/** Pull the 【 xxx 】 segment out of a Tamiya description block. */
function bracketSection($: cheerio.CheerioAPI, heading: string): string | undefined {
  let found: string | undefined
  $('.wysiwyg_area_ b').each((_, element) => {
    const label = text($(element).text())
    if (!label.includes(heading) || found) return
    // The value is the sibling text up to the next <br>.
    const parts: string[] = []
    let node = element.nextSibling
    while (node) {
      if (node.type === 'tag' && (node.name === 'br' || node.name === 'b')) break
      parts.push($(node).text())
      node = node.nextSibling
    }
    found = text(parts.join(''))
  })
  return found || undefined
}

/**
 * "2026年2月21日(土)ごろ発売" -> 2026-02-21; "2025年10月発売" -> 2025-10.
 * Tamiya also prints re-release history for kits; we take the first date.
 */
function parseReleaseDate(raw: string): string | undefined {
  const full = /(\d{4})年(\d{1,2})月(\d{1,2})日/.exec(raw)
  if (full) {
    return `${full[1]}-${full[2]!.padStart(2, '0')}-${full[3]!.padStart(2, '0')}`
  }
  const month = /(\d{4})年(\d{1,2})月/.exec(raw)
  return month ? `${month[1]}-${month[2]!.padStart(2, '0')}` : undefined
}

export const detailUrl = (id: string) => `${BASE}/${id}/index.html`

/** Pure parser for a product detail page. */
export function parseDetail<G extends GenreCode>(html: string, entry: ListEntry<G>): JpItem<G> {
  const officialUrl = detailUrl(entry.id)
  const $ = cheerio.load(html)
  const block = $('.item_title_block_').first()

  // Both product lines print a number in this slot, and they mean different
  // things: "GP.549" on a part is the Grade-Up Part number, "No.64" on a kit is
  // its place in its own kit line. Only the part builder may read it as a GUP
  // number — buildKit stores it as `seriesNumber`.
  const titleMeta = text(block.find('.title1_ p').text())
  const gupNumber = /No\.(\d+)/.exec(titleMeta)?.[1]

  const heading = block.find('h1').first()
  const nameJa = text(heading.text())
  const nameEn = text(heading.nextAll('span').first().text())

  // The release paragraph also hosts a csv-info placeholder span; drop it.
  const releaseNode = block.find('.title2_ > p').first().clone()
  releaseNode.find('span, script').remove()
  const releaseDateRaw = text(releaseNode.text())

  const priceRaw = text(block.find('.title2_ div p').last().text())
  const priceJpy = /([\d,]+)円/.exec(priceRaw)?.[1]
  const priceJpyExTax = /本体価格([\d,]+)円/.exec(priceRaw)?.[1]

  const chassisCodes: string[] = []
  $('a[href*="genre_item=mini4wd_chassis_"]').each((_, element) => {
    const code = /mini4wd_chassis_([\w-]+)/.exec($(element).attr('href') ?? '')?.[1]
    if (code && !chassisCodes.includes(code)) chassisCodes.push(code)
  })

  const imageUrl = $('.tmpblock_ .img_ a.popup-image').first().attr('href')
    ?? $('.tmpblock_ .img_ img').first().attr('src')

  const infoAsOf = /情報は(\d{4})年(\d{2})月(\d{2})日時点/.exec($.html())
  const number = (value: string | undefined) =>
    value ? Number(value.replace(/,/g, '')) : undefined

  return {
    ...entry,
    nameJa,
    nameEn: nameEn || undefined,
    gupNumber: gupNumber ? Number(gupNumber) : undefined,
    priceJpy: number(priceJpy),
    priceJpyExTax: number(priceJpyExTax),
    releaseDateRaw: releaseDateRaw || undefined,
    releaseDate: releaseDateRaw ? parseReleaseDate(releaseDateRaw) : undefined,
    chassisCodes,
    // Facts only: we deliberately do not store Tamiya's description prose.
    compatRaw: bracketSection($, '使用可能シャーシ') ?? bracketSection($, '使用可能マシン'),
    specsRaw: bracketSection($, '基本スペック'),
    imageUrl: imageUrl ? (imageUrl.startsWith('//') ? `https:${imageUrl}` : imageUrl) : undefined,
    officialUrl,
    infoAsOf: infoAsOf ? `${infoAsOf[1]}-${infoAsOf[2]}-${infoAsOf[3]}` : undefined,
    scrapedAt: new Date().toISOString().slice(0, 10)
  }
}

export async function scrapeDetail<G extends GenreCode>(
  entry: ListEntry<G>,
  noCache = false
): Promise<JpItem<G>> {
  return parseDetail(await fetchText(detailUrl(entry.id), { noCache }), entry)
}
