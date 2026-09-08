import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { stringify } from 'yaml'
import { ROOT } from './fetch.ts'
import { readJsonFile, readYamlFile, readYamlFileIfPresent } from './io.ts'
import { partSchema, chassisSchema, CHASSIS_IDS, CODE_TO_CHASSIS } from '../../shared/catalog/schema.ts'
import type { ChassisId, PartOverride } from '../../shared/catalog/schema.ts'
import { compact, deriveCategory, deriveLegality, deriveSlots, deriveSpecs, isPlainObject } from './taxonomy.ts'
import { GENRE_SERIES, type JpItem } from './sources/tamiya-jp.ts'
import type { HkItem } from './sources/tamiya-hk.ts'

/**
 * Stage 2 of the catalog pipeline: raw snapshots + hand-authored overrides ->
 * validated YAML in content/.
 *
 * Everything under content/parts and content/chassis is machine-written and is
 * deleted and rebuilt on every run. Human decisions live in data/overrides and
 * data/chassis so that a monthly re-scrape can never overwrite them.
 */

/** Limited/special items older than this are out of the v1 catalog. */
const RECENT_FROM = '2023-01'

const jpItems = readJsonFile<JpItem[]>('data/raw/tamiya-jp-items.json')
const compat = readJsonFile<Record<string, string[]>>('data/raw/tamiya-compat.json')
const hkItems = readJsonFile<HkItem[]>('data/raw/tamiya-hk.json')
const overrides = readYamlFileIfPresent<Record<string, PartOverride>>('data/overrides/parts.yml', {})
const slotProfiles = readYamlFile<{ profiles: Record<string, unknown[]> }>('data/taxonomy/slots.yml').profiles

const hkById = new Map(hkItems.map(item => [item.id, item]))

/** Item numbers Tamiya lists on each chassis' compatibility page. */
const compatByItem = new Map<string, string[]>()
for (const [chassisId, ids] of Object.entries(compat)) {
  for (const id of ids) {
    const list = compatByItem.get(id) ?? []
    list.push(chassisId)
    compatByItem.set(id, list)
  }
}

/**
 * v1 selection (docs/PLAN.md §3.1): the complete regular Grade-Up Parts and AO
 * ranges, plus limited/special/station parts recent enough to still be findable
 * in shops. Everything else stays in data/raw for a later pass.
 */
function selects(item: JpItem): boolean {
  const series = GENRE_SERIES[item.genre]
  if (!series) return false
  if (series === 'gup' || series === 'ao') return true
  return (item.releaseDate ?? '') >= RECENT_FROM
}

function deepMerge<T extends Record<string, unknown>>(base: T, patch: Record<string, unknown>): T {
  const result: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(patch)) {
    result[key] = isPlainObject(value) && isPlainObject(result[key])
      ? deepMerge(result[key] as Record<string, unknown>, value)
      : value
  }
  return result as T
}

function buildPart(item: JpItem) {
  const override = overrides[item.id] ?? {}
  const hk = hkById.get(item.id)
  const { category, isCarPart, matched } = deriveCategory(item)

  // Two independent compatibility signals: the chassis tags on the item's own
  // page, and the per-chassis "対応パーツ" catalogs. Union them — the tags are
  // sometimes missing on older items, the catalogs sometimes lag new ones.
  const fromTags = item.chassisCodes
    .map(code => CODE_TO_CHASSIS[code.toLowerCase()])
    .filter((id): id is ChassisId => Boolean(id))
  const fromCatalogs = (compatByItem.get(item.id) ?? []) as ChassisId[]
  const include = [...new Set([...fromTags, ...fromCatalogs])]
    .sort((a, b) => CHASSIS_IDS.indexOf(a) - CHASSIS_IDS.indexOf(b))
  const other = item.chassisCodes
    .filter(code => !CODE_TO_CHASSIS[code.toLowerCase()])
    .sort()

  const names = compact({
    ja: item.nameJa,
    en: item.nameEn ?? hk?.nameEn,
    'zh-HK': hk?.nameZhHk
  })

  const record = {
    id: item.id,
    names,
    nameSources: compact({
      ja: 'tamiya.com',
      en: item.nameEn ? 'tamiya.com' : hk?.nameEn ? 'tamiya.hk' : undefined,
      'zh-HK': hk?.nameZhHk ? 'tamiya.hk' : undefined
    }),
    series: GENRE_SERIES[item.genre]!,
    gupNumber: item.gupNumber,
    seriesLabel: item.seriesLabel || undefined,
    category,
    categorySource: 'derived',
    isCarPart,
    slots: deriveSlots(category),
    chassisCompat: { include, other, source: 'scraped' },
    classLegality: { ...deriveLegality(category, isCarPart), source: 'derived' },
    specs: deriveSpecs(item, category),
    priceJpy: item.priceJpy,
    priceJpyExTax: item.priceJpyExTax,
    priceHkd: hk?.priceHkd,
    releaseDate: item.releaseDate,
    releaseDateRaw: item.releaseDateRaw,
    status: item.genre === '303010' || item.genre === '303030' ? 'current' : 'limited',
    officialUrl: item.officialUrl,
    officialImage: item.imageUrl,
    hkStoreUrl: hk?.url,
    specsRaw: item.specsRaw,
    scrapedAt: item.scrapedAt
  }

  const merged = deepMerge(compact(record), override)
  // Any field the override touched is no longer derived — say so in the data.
  if (override.category) merged.categorySource = 'override'
  if (override.classLegality) {
    merged.classLegality = { ...merged.classLegality, source: 'override' }
  }
  if (override.category && !override.slots) merged.slots = deriveSlots(merged.category)

  return { record: merged, matched }
}

async function writeCollection(dir: string, files: Map<string, unknown>) {
  const target = join(ROOT, 'content', dir)
  await mkdir(target, { recursive: true })

  const stale = (await readdir(target)).filter(name => name.endsWith('.yml') && !files.has(name))
  await Promise.all(stale.map(name => rm(join(target, name))))
  await Promise.all([...files].map(([name, data]) =>
    writeFile(join(target, name), stringify(data, { lineWidth: 0 }), 'utf8')))
}

const selected = jpItems.filter(selects)
const partFiles = new Map<string, unknown>()
const unmatched: string[] = []
const failures: string[] = []

for (const item of selected) {
  const { record, matched } = buildPart(item)
  if (!matched && !overrides[item.id]?.category) unmatched.push(`${item.id} ${item.nameJa}`)

  const result = partSchema.safeParse(record)
  if (!result.success) {
    failures.push(`${item.id}: ${result.error.issues.map(i => `${i.path.join('.')} ${i.message}`).join('; ')}`)
    continue
  }
  partFiles.set(`${item.id}.yml`, result.data)
}

const selectedIds = new Set(selected.map(item => item.id))
const chassisFiles = new Map<string, unknown>()
for (const id of CHASSIS_IDS) {
  const base = readYamlFile<Record<string, unknown> & { slotProfile: string }>(`data/chassis/${id}.yml`)
  const { slotProfile, ...rest } = base
  const record = {
    ...rest,
    slots: slotProfiles[slotProfile],
    compatibleParts: (compat[id] ?? []).filter(itemId => selectedIds.has(itemId)).sort()
  }
  const result = chassisSchema.safeParse(record)
  if (!result.success) {
    failures.push(`chassis ${id}: ${result.error.issues.map(i => `${i.path.join('.')} ${i.message}`).join('; ')}`)
    continue
  }
  chassisFiles.set(`${id}.yml`, result.data)
}

if (failures.length) {
  console.error('Schema validation failed — nothing written:')
  for (const failure of failures) console.error(`  ${failure}`)
  process.exit(1)
}

await writeCollection('parts', partFiles)
await writeCollection('chassis', chassisFiles)

console.log(`${jpItems.length} scraped -> ${partFiles.size} parts, ${chassisFiles.size} chassis written`)
if (unmatched.length) {
  console.log(`\n${unmatched.length} items fell through the category rules (see catalog:report):`)
  for (const line of unmatched.slice(0, 15)) console.log(`  ${line}`)
}
