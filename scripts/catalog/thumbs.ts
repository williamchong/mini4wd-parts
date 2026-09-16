import { mkdir, rm, writeFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import sharp from 'sharp'
import { fetchBytes, progress } from './fetch.ts'
import { listYamlIds, readJsonFile } from './io.ts'
import { thumbnailDir, thumbnailFile, thumbnailIds } from './thumbnails.ts'
import { THUMB_SIZES } from '../../shared/catalog/thumbnails.ts'
import type { ThumbCollection, ThumbVariant } from '../../shared/catalog/thumbnails.ts'
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

/**
 * Tamiya's list-page photo — the source both sizes start from — is 400x300 or
 * 600x450, so the detail copy is a second downscale of a file the row pass
 * already cached rather than a second fetch of the full-size original.
 */

/** Visually indistinguishable from q90 at these sizes, and about half the bytes. */
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
  variant: ThumbVariant
  ids: string[]
  sources: Map<string, string>
}

/** What `--only` matches and what the run prints. */
const kindLabel = ({ name, variant }: Kind) =>
  variant === 'detail' ? `${name}-detail` : name

async function fetchKind(kind: Kind) {
  const { name, variant, ids, sources } = kind
  const { width, height } = THUMB_SIZES[variant]
  await mkdir(thumbnailDir(name, variant), { recursive: true })
  // One listing per collection rather than a stat per item: the second run of a
  // 695-item catalog is otherwise 695 filesystem round-trips to learn nothing.
  const have = thumbnailIds(name, variant)

  const targets = limit ? ids.slice(0, limit) : ids
  const missing: string[] = []
  const failed: string[] = []
  const small: string[] = []
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
      const image = sharp(source)
      // A photo narrower than the detail box would be enlarged, and an enlarged
      // 160 reads worse than the 160 itself — so no file is written and the
      // part page falls back to the row size, which `detailThumbnail` being
      // optional is what allows.
      if (variant === 'detail' && ((await image.metadata()).width ?? 0) < width) {
        small.push(id)
        continue
      }
      // `contain` rather than `cover`: a part photo that is not 4:3 must not be
      // cropped, because the edge of a plate is often the whole point of it.
      // Tamiya shoots on white, so the padding is invisible.
      const thumb = await image
        .resize(width, height, { fit: 'contain', background: '#ffffff' })
        .webp({ quality: QUALITY })
        .toBuffer()
      await writeFile(thumbnailFile(name, id, variant), thumb)
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
  console.log(`  ${kindLabel(kind)}: ${written} written`
    + (written ? `, ${(bytes / written / 1024).toFixed(1)} KB average` : ''))
  if (small.length) console.log(`  source too small for ${width}px: ${small.length} (${small.slice(0, 5).join(', ')}…)`)
  if (missing.length) console.log(`  no source photo: ${missing.length} (${missing.slice(0, 5).join(', ')}…)`)
  if (failed.length) console.log(`  failed: ${failed.length} (${failed.slice(0, 3).join('; ')})`)
}

/**
 * Thumbnails for items that have left the catalog. Removed rather than left
 * behind: an image nothing references is one we cannot justify hosting.
 */
async function prune(kinds: Kind[]) {
  let removed = 0
  for (const { name, variant, ids } of kinds) {
    const keep = new Set(ids)
    for (const id of thumbnailIds(name, variant)) {
      if (keep.has(id)) continue
      await rm(thumbnailFile(name, id, variant))
      removed++
    }
  }
  if (removed) console.log(`  pruned ${removed} thumbnail(s) no longer in the catalog`)
}

const chassisImages = readJsonFile<Partial<Record<ChassisId, string>>>(
  'data/raw/tamiya-chassis-images.json')

// The catalog says which items exist; `listYamlIds` reads their item numbers
// off the filenames without parsing 695 records to learn what they are called.
const partIds = listYamlIds('content/parts')
const partSources = itemSources('data/raw/tamiya-jp-items.json')

const kinds: Kind[] = [
  { name: 'parts', variant: 'row', ids: partIds, sources: partSources },
  { name: 'kits', variant: 'row', ids: listYamlIds('content/kits'), sources: itemSources('data/raw/tamiya-jp-kits.json') },
  { name: 'chassis', variant: 'row', ids: listYamlIds('content/chassis'), sources: new Map(Object.entries(chassisImages)) },
  // Parts only: they are the only records with a page of their own, and a
  // picker row has no use for twice the pixels (docs/PLAN.md §6 M1b).
  { name: 'parts', variant: 'detail', ids: partIds, sources: partSources }
]

console.log('Thumbnails -> public/thumbs'
  + ` (${THUMB_SIZES.row.width}x${THUMB_SIZES.row.height} webp,`
  + ` parts also ${THUMB_SIZES.detail.width}x${THUMB_SIZES.detail.height})`)
for (const kind of kinds) {
  if (wants(kindLabel(kind))) await fetchKind(kind)
}

// Pruning a kind we did not just walk would delete thumbnails for items that
// are still in the catalog, so a partial run skips it.
if (!only && !limit) await prune(kinds)
