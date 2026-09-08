import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { ROOT, progress } from './fetch.ts'
import {
  GENRE_SERIES, KIT_GENRE_SERIES, scrapeGenreList, scrapeDetail,
  type GenreCode, type JpItem, type ListEntry, type KitGenreCode, type PartGenreCode
} from './sources/tamiya-jp.ts'
import { scrapeChassisCompat } from './sources/tamiya-compat.ts'
import { CHASSIS_CODES } from '../../shared/catalog/schema.ts'
import { scrapeHkStore } from './sources/tamiya-hk.ts'
import { scrapeFandomKits, scrapeFandomParts } from './sources/fandom.ts'

/**
 * Stage 1 of the catalog pipeline: fetch everything, decide nothing.
 *
 * The raw snapshots under data/raw/ are committed so that generate.ts runs
 * offline and so a monthly refresh shows up as a reviewable diff. They cover
 * every item in the Mini 4WD parts branches, not just the v1 selection —
 * widening the catalog later must not require another 900 requests.
 */

const RAW_DIR = join(ROOT, 'data/raw')

const { values } = parseArgs({
  options: {
    only: { type: 'string' },
    'no-cache': { type: 'boolean', default: false },
    limit: { type: 'string' }
  }
})

const noCache = values['no-cache']!
const limit = values.limit ? Number(values.limit) : undefined
const only = values.only?.split(',')
const wants = (stage: string) => !only || only.includes(stage)

/** Stable key order + sorted arrays keep the committed diffs meaningful. */
async function writeRaw(name: string, data: unknown) {
  await mkdir(RAW_DIR, { recursive: true })
  await writeFile(join(RAW_DIR, `${name}.json`), `${JSON.stringify(data, null, 2)}\n`, 'utf8')
  console.log(`  -> data/raw/${name}.json`)
}

/** List every genre in a branch, then fetch each item's detail page. */
async function scrapeGenres<G extends GenreCode>(genres: readonly G[]): Promise<JpItem<G>[]> {
  const entries: ListEntry<G>[] = []
  for (const genre of genres) {
    entries.push(...await scrapeGenreList(genre, noCache))
    console.log('')
  }

  const targets = limit ? entries.slice(0, limit) : entries
  const items: JpItem<G>[] = []
  for (const entry of targets) {
    items.push(await scrapeDetail(entry, noCache))
    progress('details', items.length, targets.length)
  }
  console.log('')
  return items.sort((a, b) => a.id.localeCompare(b.id))
}

if (wants('jp')) {
  console.log('Tamiya JP catalog')
  await writeRaw('tamiya-jp-items', await scrapeGenres(Object.keys(GENRE_SERIES) as PartGenreCode[]))
}

// Kits land in their own snapshot: they build a different record, and keeping
// them out of the parts file means a kit re-scrape leaves the parts diff alone.
if (wants('kits')) {
  console.log('Tamiya JP kits')
  await writeRaw('tamiya-jp-kits', await scrapeGenres(Object.keys(KIT_GENRE_SERIES) as KitGenreCode[]))
}

if (wants('compat')) {
  console.log('Tamiya per-chassis compatibility')
  const compat: Record<string, string[]> = {}
  for (const [chassisId, code] of Object.entries(CHASSIS_CODES)) {
    compat[chassisId] = (await scrapeChassisCompat(code, noCache)).sort()
    console.log('')
  }
  await writeRaw('tamiya-compat', compat)
}

if (wants('hk')) {
  console.log('tamiya.hk store')
  const items = await scrapeHkStore(noCache)
  items.sort((a, b) => a.id.localeCompare(b.id))
  console.log('')
  await writeRaw('tamiya-hk', items)
}

// The wiki plays two different roles. For parts it is a QA source only, feeding
// catalog:crossref; nothing from fandom-parts.json reaches content/. For kits it
// is the only structured source of what is in the box, so fandom-kits.json does
// reach content/ — under CC-BY-SA, which is why each variant carries its article
// title for attribution (docs/PLAN.md §4.7).
if (wants('fandom')) {
  console.log('Mini 4WD Fandom wiki (part taxonomy cross-reference)')
  const articles = await scrapeFandomParts(noCache)
  console.log(`  ${articles.length} articles, `
    + `${new Set(articles.flatMap(a => a.items.map(i => i.id))).size} item numbers`)
  await writeRaw('fandom-parts', articles)

  console.log('Mini 4WD Fandom wiki (kit loadouts)')
  const variants = await scrapeFandomKits(noCache)
  console.log(`  ${variants.length} variants, `
    + `${new Set(variants.flatMap(variant => variant.ids)).size} item numbers`)
  await writeRaw('fandom-kits', variants)
}
