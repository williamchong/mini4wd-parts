import * as cheerio from 'cheerio'
import { fetchJson, progress } from '../fetch.ts'

const API = 'https://tamiya.hk/wp-json/wc/store/v1/products'
const PER_PAGE = 100

export interface StoreProduct {
  sku: string
  name: string
  permalink: string
  short_description: string
  prices?: { price?: string, currency_minor_unit?: number }
}

export interface HkItem {
  /** Tamiya item number extracted from the "TA 15549" SKU. */
  id: string
  nameEn: string
  /** Traditional Chinese (HK) name, from short_description. */
  nameZhHk?: string
  priceHkd?: number
  url: string
}

/**
 * WooCommerce descriptions carry shortcodes and arbitrary HTML entities, so let
 * cheerio decode them rather than hand-picking the few we have seen.
 */
const stripHtml = (html: string) =>
  cheerio.load(html).text().replace(/\s+/g, ' ').trim()

/**
 * Mini 4WD item-number spaces (CLAUDE.md, "Domain Notes"): 15xxx regular GUP,
 * 18xxx/19xxx kits, 92xxx/94xxx/95xxx limited and special. The HK store also
 * sells RC and scale models, whose 24xxx/35xxx/58xxx numbers we skip so the
 * committed snapshot stays about Mini 4WD.
 */
const MINI_4WD_ITEM = /^(?:15|18|19|92|94|95)\d{3}$/

/** Pure mapper for one Store API product; null when the SKU is not an item no. */
export function mapStoreProduct(product: StoreProduct): HkItem | null {
  const id = /^TA\s*(\d{4,5})$/.exec(product.sku?.trim() ?? '')?.[1]
  if (!id || !MINI_4WD_ITEM.test(id)) return null

  // "田宮 15549 HG 碳纖維 …" — drop the brand + item number prefix.
  const description = stripHtml(product.short_description ?? '')
  const zhHk = description.replace(new RegExp(`^田宮\\s*${id}\\s*`), '').trim()
  const minorUnit = product.prices?.currency_minor_unit ?? 2
  const price = product.prices?.price

  return {
    id,
    nameEn: stripHtml(product.name).replace(/^Tamiya\s+\d{4,5}\s*/, ''),
    nameZhHk: zhHk && /[\u4e00-\u9fff]/.test(zhHk) ? zhHk : undefined,
    priceHkd: price ? Number(price) / 10 ** minorUnit : undefined,
    url: product.permalink
  }
}

/**
 * The HK distributor's WooCommerce Store API. Its `short_description` carries a
 * Traditional Chinese product name per SKU (「田宮 15549 HG 碳纖維 闊身後置支架…」),
 * which is the only per-item TC name source that exists anywhere — worth the
 * 73 requests it takes to dump the whole store.
 */
export async function scrapeHkStore(noCache = false): Promise<HkItem[]> {
  const items: HkItem[] = []
  const seen = new Set<string>()

  for (let page = 1; ; page++) {
    const batch = await fetchJson<StoreProduct[]>(
      `${API}?per_page=${PER_PAGE}&page=${page}`,
      { noCache }
    )
    if (!batch.length) break

    for (const product of batch) {
      const item = mapStoreProduct(product)
      if (!item || seen.has(item.id)) continue
      seen.add(item.id)
      items.push(item)
    }

    progress('tamiya.hk', items.length, items.length)
    if (batch.length < PER_PAGE) break
  }

  return items
}
