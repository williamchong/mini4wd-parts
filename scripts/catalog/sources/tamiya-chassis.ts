import * as cheerio from 'cheerio'
import { fetchText } from '../fetch.ts'
import { absoluteUrl } from './tamiya-page.ts'
import { chassisIdFor, type ChassisId } from '../../../shared/catalog/schema.ts'

const PAGE = 'https://www.tamiya.com/english/cms/mini4wd_chassis_select.html'

/**
 * Chassis photos, which no other source gives us: the item catalog has none,
 * because a chassis is not something Tamiya sells on its own.
 *
 * The page is one `<li>` per chassis, each holding the photo and the two
 * "CARS"/"PARTS" links that name the chassis in Tamiya's own code. The code is
 * what we key on. The caption beside it would work too, but it is prose in one
 * language ("MA Chassis", "Super-II Chassis") and the code is the same
 * identifier every other source in this pipeline already speaks.
 */
export function parseChassisImages(html: string): Partial<Record<ChassisId, string>> {
  const $ = cheerio.load(html)
  const images: Partial<Record<ChassisId, string>> = {}

  $('li').each((_, element) => {
    const item = $(element)
    const src = absoluteUrl(item.find('img[src*="/item/ch/"]').first().attr('src'))
    if (!src) return

    // `?genre_item=e_mini4wd_chassis_ms,e_machine_kit` — the English tree
    // prefixes its codes with `e_` and may append a second genre.
    const href = item.find('a[href*="mini4wd_chassis_"]').first().attr('href') ?? ''
    const code = /mini4wd_chassis_([\w-]+)/.exec(href)?.[1]
    const id = code && chassisIdFor(code)
    // The page covers every chassis Tamiya has ever made; the ones outside the
    // v1 set are simply not ours to carry.
    if (!id || images[id]) return

    images[id] = src
  })

  return images
}

export const scrapeChassisImages = async (noCache = false) =>
  parseChassisImages(await fetchText(PAGE, { noCache }))
