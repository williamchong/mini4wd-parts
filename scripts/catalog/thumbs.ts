import { mkdir, rm, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import sharp from 'sharp'
import { fetchBytes, progress } from './fetch.ts'
import { listYamlIds, readJsonFile } from './io.ts'
import { thumbnailDir, thumbnailFile, thumbnailIds } from './thumbnails.ts'
import type { ThumbCollection } from '../../shared/catalog/thumbnails.ts'
import type { ChassisId } from '../../shared/catalog/schema.ts'
import type { JpItem } from './sources/tamiya-jp.ts'

/**
 * Stage 1b of the catalog pipeline: Tamiya's product photos, downscaled to
 * thumbnails we serve ourselves (docs/PLAN.md §6 M1b).
 *
 * We do not hotlink: a hotlinked image spends Tamiya's bandwidth on every page
 * view and puts our domain in their logs daily, which is a standing invitation
 * to be blocked. One fetch per item, stored small, costs them once.
 *
 * What keeps this defensible is the size. These are 160x120 thumbnails beside
 * a link to Tamiya's own product page, credited on the page that shows them —
 * not copies of the photographs. Everything lands in one generated directory so
 * that honouring a takedown is deleting a folder: the pickers already fall back
 * to the slot icon when a thumbnail is missing.
 *
 * Run order is `catalog:generate` -> `catalog:thumbs` -> `catalog:generate`:
 * the catalog says which items exist, this fetches their photos, and the second
 * pass writes the `thumbnail` path onto the records. In steady state only new
 * items need the third step.
 */

const WIDTH = 160
const HEIGHT = 120
/** Visually indistinguishable from q90 at this size, and about half the bytes. */
const QUALITY = 72

const { values } = parseArgs({
  options: {
    only: { type: 'string' },
    force: { type: 'boolean', default: false },
    'no-cache': { type: 'boolean', default: false },
    limit: { type: 'string' }
  }
})

const only = values.only?.split(',')
const wants = (kind: string) => !only || only.includes(kind)
const limit = values.limit ? Number(values.limit) : undefined

/**
 * The thumbnail Tamiya's own list pages use, falling back to the full-size
 * photo from the detail page. Either way it is downscaled here, so the fallback
 * costs bandwidth rather than quality — and about one item in twenty has no
 * `_s.jpg` at all.
 */
function itemSources(file: string): Map<string, string> {
  const items = readJsonFile<JpItem[]>(file)
  const sources = new Map<string, string>()
  for (const item of items) {
    const url = item.thumbnailUrl ?? item.imageUrl
    if (url) sources.set(item.id, url)
  }
  return sources
}

interface Kind {
  name: ThumbCollection
  ids: string[]
  sources: Map<string, string>
}

async function fetchKind({ name, ids, sources }: Kind) {
  await mkdir(thumbnailDir(name), { recursive: true })
  // One listing per collection rather than a stat per item: the second run of a
  // 695-item catalog is otherwise 695 filesystem round-trips to learn nothing.
  const have = thumbnailIds(name)

  const targets = limit ? ids.slice(0, limit) : ids
  const missing: string[] = []
  const failed: string[] = []
  let written = 0
  let bytes = 0
  let done = 0

  for (const id of targets) {
    progress(name, ++done, targets.length)

    const url = sources.get(id)
    if (!url) {
      missing.push(id)
      continue
    }
    if (!values.force && have.has(id)) continue

    try {
      const source = await fetchBytes(url, { noCache: values['no-cache'] })
      // `contain` rather than `cover`: a part photo that is not 4:3 must not be
      // cropped, because the edge of a plate is often the whole point of it.
      // Tamiya shoots on white, so the padding is invisible.
      const thumb = await sharp(source)
        .resize(WIDTH, HEIGHT, { fit: 'contain', background: '#ffffff' })
        .webp({ quality: QUALITY })
        .toBuffer()
      await writeFile(thumbnailFile(name, id), thumb)
      written++
      bytes += thumb.byteLength
    }
    catch (error) {
      // A 404 is a fact about Tamiya's CDN, not a reason to stop: the row falls
      // back to its slot icon and the next run will try again.
      failed.push(`${id} (${(error as Error).message})`)
    }
  }

  console.log('')
  console.log(`  ${name}: ${written} written`
    + (written ? `, ${(bytes / written / 1024).toFixed(1)} KB average` : ''))
  if (missing.length) console.log(`  no source photo: ${missing.length} (${missing.slice(0, 5).join(', ')}…)`)
  if (failed.length) console.log(`  failed: ${failed.length} (${failed.slice(0, 3).join('; ')})`)
}

/**
 * Thumbnails for items that have left the catalog. Removed rather than left
 * behind: an image nothing references is one we cannot justify hosting.
 */
async function prune(kinds: Kind[]) {
  let removed = 0
  for (const { name, ids } of kinds) {
    const keep = new Set(ids)
    for (const id of thumbnailIds(name)) {
      if (keep.has(id)) continue
      await rm(thumbnailFile(name, id))
      removed++
    }
  }
  if (removed) console.log(`  pruned ${removed} thumbnail(s) no longer in the catalog`)
}

const chassisImages = readJsonFile<Partial<Record<ChassisId, string>>>(
  'data/raw/tamiya-chassis-images.json')

// The catalog says which items exist; `listYamlIds` reads their item numbers
// off the filenames without parsing 695 records to learn what they are called.
const kinds: Kind[] = [
  { name: 'parts', ids: listYamlIds('content/parts'), sources: itemSources('data/raw/tamiya-jp-items.json') },
  { name: 'kits', ids: listYamlIds('content/kits'), sources: itemSources('data/raw/tamiya-jp-kits.json') },
  { name: 'chassis', ids: listYamlIds('content/chassis'), sources: new Map(Object.entries(chassisImages)) }
]

console.log(`Thumbnails -> public/thumbs (${WIDTH}x${HEIGHT} webp)`)
for (const kind of kinds) {
  if (wants(kind.name)) await fetchKind(kind)
}

// Pruning a kind we did not just walk would delete thumbnails for items that
// are still in the catalog, so a partial run skips it.
if (!only && !limit) await prune(kinds)
