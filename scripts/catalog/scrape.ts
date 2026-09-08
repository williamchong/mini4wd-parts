import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { ROOT, progress } from './fetch.ts'
import { GENRE_SERIES, scrapeGenreList, scrapeDetail, type GenreCode, type JpItem } from './sources/tamiya-jp.ts'
import { scrapeChassisCompat } from './sources/tamiya-compat.ts'
import { CHASSIS_CODES } from '../../shared/catalog/schema.ts'
import { scrapeHkStore } from './sources/tamiya-hk.ts'
import { scrapeFandomParts } from './sources/fandom.ts'

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

if (wants('jp')) {
  console.log('Tamiya JP catalog')
  const entries = []
  for (const genre of Object.keys(GENRE_SERIES) as GenreCode[]) {
    entries.push(...await scrapeGenreList(genre, noCache))
    console.log('')
  }

  const targets = limit ? entries.slice(0, limit) : entries
  const items: JpItem[] = []
  for (const entry of targets) {
    items.push(await scrapeDetail(entry, noCache))
    progress('details', items.length, targets.length)
  }
  console.log('')
  items.sort((a, b) => a.id.localeCompare(b.id))
  await writeRaw('tamiya-jp-items', items)
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

// Not a catalog source: this feeds catalog:crossref, which audits our derived
// categories against the wiki's hand-written ones. Nothing here reaches content/.
if (wants('fandom')) {
  console.log('Mini 4WD Fandom wiki (taxonomy cross-reference)')
  const articles = await scrapeFandomParts(noCache)
  console.log(`  ${articles.length} articles, `
    + `${new Set(articles.flatMap(a => a.items.map(i => i.id))).size} item numbers`)
  await writeRaw('fandom-parts', articles)
}
