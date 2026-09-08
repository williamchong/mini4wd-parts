import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { stringify } from 'yaml'
import { ROOT } from './fetch.ts'
import { readJsonFile, readYamlFile, readYamlFileIfPresent } from './io.ts'
import { partSchema, chassisSchema, kitSchema, CHASSIS_IDS, chassisIdFor } from '../../shared/catalog/schema.ts'
import type { ChassisId, KitOverride, LabelNames, Loadout, PartOverride } from '../../shared/catalog/schema.ts'
import { compact, deriveCategory, deriveLegality, deriveSlots, deriveSpecs, isPlainObject, normalise } from './taxonomy.ts'
import { labelFor, neutralLabel } from './labels.ts'
import { GENRE_SERIES, KIT_GENRE_SERIES, type JpItem, type KitGenreCode, type PartGenreCode } from './sources/tamiya-jp.ts'
import type { HkItem } from './sources/tamiya-hk.ts'
import type { FandomKitVariant } from './sources/fandom.ts'

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

const jpItems = readJsonFile<JpItem<PartGenreCode>[]>('data/raw/tamiya-jp-items.json')
const jpKits = readJsonFile<JpItem<KitGenreCode>[]>('data/raw/tamiya-jp-kits.json')
const compat = readJsonFile<Record<string, string[]>>('data/raw/tamiya-compat.json')
const hkItems = readJsonFile<HkItem[]>('data/raw/tamiya-hk.json')
const fandomKits = readJsonFile<FandomKitVariant[]>('data/raw/fandom-kits.json')
const overrides = readYamlFileIfPresent<Record<string, PartOverride>>('data/overrides/parts.yml', {})
const kitOverrides = readYamlFileIfPresent<Record<string, KitOverride>>('data/overrides/kits.yml', {})
const slotProfiles = readYamlFile<{ profiles: Record<string, unknown[]> }>('data/taxonomy/slots.yml').profiles

const hkById = new Map(hkItems.map(item => [item.id, item]))

/**
 * Item number -> the wiki row describing that box. One row can cover several
 * item numbers (a re-release under a new number shares its spec table), so the
 * map is many-to-one and the first row to claim a number keeps it.
 */
const loadoutById = new Map<string, FandomKitVariant>()
for (const variant of fandomKits) {
  for (const id of variant.ids) if (!loadoutById.has(id)) loadoutById.set(id, variant)
}

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
function selects(item: JpItem<PartGenreCode>): boolean {
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

function buildPart(item: JpItem<PartGenreCode>) {
  const override = overrides[item.id] ?? {}
  const hk = hkById.get(item.id)
  const { category, isCarPart, matched } = deriveCategory(item)

  // Two independent compatibility signals: the chassis tags on the item's own
  // page, and the per-chassis "対応パーツ" catalogs. Union them — the tags are
  // sometimes missing on older items, the catalogs sometimes lag new ones.
  const fromTags = item.chassisCodes
    .map(chassisIdFor)
    .filter((id): id is ChassisId => Boolean(id))
  const fromCatalogs = (compatByItem.get(item.id) ?? []) as ChassisId[]
  const include = [...new Set([...fromTags, ...fromCatalogs])]
    .sort((a, b) => CHASSIS_IDS.indexOf(a) - CHASSIS_IDS.indexOf(b))
  const other = item.chassisCodes
    .filter(code => !chassisIdFor(code))
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

/**
 * How a kit names its own chassis, most specific pattern first so that
 * "スーパーII" is not read as an unknown before it is read as super-2.
 */
const CHASSIS_IN_NAME: [ChassisId, RegExp][] = [
  ['super-2', /スーパーII\s*シャーシ/],
  ['fm-a', /FM-A\s*シャーシ/],
  ['ma', /MA\s*シャーシ/],
  ['ms', /MS\s*シャーシ/],
  ['me', /ME\s*シャーシ/],
  ['ar', /AR\s*シャーシ/],
  ['vz', /VZ\s*シャーシ/],
  ['vs', /VS\s*シャーシ/]
]

/**
 * The chassis a kit is actually built on.
 *
 * The chassis tags on a kit page are a *compatibility* list, not a statement
 * about what is in the box: ロボレース デボット2.0 (MAシャーシ) is tagged ms, ar
 * and ma, and taking the first would file an MA kit under MS — a wrong slot
 * profile and a wrong `defaultLoadout`, which nothing downstream could catch
 * because MS is a real chassis.
 *
 * So the name wins where it names a chassis, the tags are trusted only when
 * they leave one in-scope answer, and anything still ambiguous is left for
 * `data/overrides/kits.yml` rather than guessed at.
 */
function kitChassis(item: JpItem<KitGenreCode>): ChassisId | 'ambiguous' | undefined {
  const override = kitOverrides[item.id]?.chassis
  if (override) return override

  const name = normalise(item.nameJa)
  const named = CHASSIS_IN_NAME.find(([, pattern]) => pattern.test(name))?.[0]
  if (named) return named

  const tagged = [...new Set(item.chassisCodes.map(chassisIdFor).filter(Boolean))] as ChassisId[]
  if (tagged.length === 1) return tagged[0]
  return tagged.length ? 'ambiguous' : undefined
}

function buildKit(item: JpItem<KitGenreCode>, chassis: ChassisId) {
  const override = kitOverrides[item.id] ?? {}
  const hk = hkById.get(item.id)
  const wiki = loadoutById.get(item.id)

  const names = compact({
    ja: item.nameJa,
    en: item.nameEn ?? hk?.nameEn,
    'zh-HK': hk?.nameZhHk
  })

  const stockLoadout: Loadout = {}
  const fill = (slot: string, label: LabelNames | undefined, source: 'tamiya' | 'fandom') => {
    if (label) stockLoadout[slot] = [{ label, source }]
  }

  // The body is the one slot a bare runner cannot fill, so it always comes from
  // the kit — and the box's name *is* the kit's name, so the label is the record
  // the locale columns above already built rather than a second copy of `nameJa`
  // that only Japanese readers could read.
  fill('body', names, 'tamiya')

  if (wiki) {
    // One value covers both axles: the wiki records what the kit ships, not a
    // per-corner fitment. Resolved once for that reason as much as for the cost
    // — two calls would be two objects for what the wiki states as one value.
    const wheel = labelFor(wiki.wheel)
    const tire = labelFor(wiki.tire)
    fill('wheel-front', wheel, 'fandom')
    fill('wheel-rear', wheel, 'fandom')
    fill('tire-front', tire, 'fandom')
    fill('tire-rear', tire, 'fandom')
    // "Standard" is the normal motor the chassis default already supplies, and
    // it is nine values in ten, so only a real upgrade is a delta worth storing.
    // The family check is not redundant with that: the wiki's motor field is
    // hand-edited and sometimes holds a value from the row above it ("Med.
    // Elastomer" is a tire material), and a builder showing that as your motor
    // is worse than showing the chassis default.
    if (wiki.motor && !/^standard$/i.test(wiki.motor) && /tuned|dash|motor/i.test(wiki.motor)) {
      fill('motor', labelFor(wiki.motor), 'fandom')
    }
  }

  // Tamiya prints a gear ratio on only about one kit page in thirty, but where
  // it does it is canonical and outranks the wiki's. It also covers the newest
  // kits, which is where the wiki is thinnest.
  //
  // The gap before the number is not always whitespace — Tamiya writes "ギヤ比=",
  // "ギヤ比は" and even "ギヤ比は超速タイプの" — so allow a short run of anything
  // that is not a digit or the ● that starts the next spec bullet.
  const tamiyaGear = /ギヤ比[^●\d]{0,12}?([\d.]+\s*:\s*[\d.]+)/
    .exec(normalise(item.specsRaw ?? ''))?.[1]?.replace(/\s/g, '')
  const gearRatio = tamiyaGear ?? wiki?.gearRatio
  // A ratio reads the same in every language, so it is stored in every locale
  // rather than under `ja` alone. Both fallback chains do end at `ja`, so one
  // copy would resolve everywhere — but it would resolve *as a fallback*, and
  // the builder italicises those to mark a string it could not translate.
  fill('gear-set', gearRatio ? neutralLabel(gearRatio) : undefined, tamiyaGear ? 'tamiya' : 'fandom')

  const record = {
    id: item.id,
    names,
    nameSources: compact({
      ja: 'tamiya.com',
      en: item.nameEn ? 'tamiya.com' : hk?.nameEn ? 'tamiya.hk' : undefined,
      'zh-HK': hk?.nameZhHk ? 'tamiya.hk' : undefined
    }),
    series: KIT_GENRE_SERIES[item.genre],
    // Not gupNumber: on a kit page this slot holds the kit line's own number.
    seriesNumber: item.gupNumber,
    seriesLabel: item.seriesLabel || undefined,
    chassis,
    gearRatio,
    stockLoadout,
    loadoutSource: wiki ? 'fandom' : 'chassis',
    loadoutSourceTitle: wiki?.title,
    priceJpy: item.priceJpy,
    priceJpyExTax: item.priceJpyExTax,
    priceHkd: hk?.priceHkd,
    releaseDate: item.releaseDate,
    releaseDateRaw: item.releaseDateRaw,
    status: item.genre === '301085' || item.genre === '301086' ? 'limited' : 'current',
    officialUrl: item.officialUrl,
    officialImage: item.imageUrl,
    hkStoreUrl: hk?.url,
    specsRaw: item.specsRaw,
    scrapedAt: item.scrapedAt
  }

  return deepMerge(compact(record), override)
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

const kitFiles = new Map<string, unknown>()
const offScopeChassis: string[] = []
// Distinct from the above: a kit Tamiya tagged with no chassis at all is a
// scrape problem to look at, not a legacy kit we chose to leave out.
const untaggedKits: string[] = []
// And distinct again: several in-scope tags and a name that does not say which.
const ambiguousKits: string[] = []

for (const item of jpKits) {
  const chassis = kitChassis(item)
  if (chassis === 'ambiguous') {
    ambiguousKits.push(`${item.id} ${item.nameJa}`)
    continue
  }
  if (!chassis) {
    (item.chassisCodes.length ? offScopeChassis : untaggedKits).push(`${item.id} ${item.nameJa}`)
    continue
  }

  const result = kitSchema.safeParse(buildKit(item, chassis))
  if (!result.success) {
    failures.push(`kit ${item.id}: ${result.error.issues.map(i => `${i.path.join('.')} ${i.message}`).join('; ')}`)
    continue
  }
  kitFiles.set(`${item.id}.yml`, result.data)
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
await writeCollection('kits', kitFiles)

console.log(`${jpItems.length} parts scraped -> ${partFiles.size} parts, ${chassisFiles.size} chassis written`)
console.log(`${jpKits.length} kits scraped -> ${kitFiles.size} kits written `
  + `(${offScopeChassis.length} on chassis outside the v1 set)`)
if (untaggedKits.length) {
  console.log(`\n${untaggedKits.length} kits carry no chassis tag at all:`)
  for (const line of untaggedKits.slice(0, 15)) console.log(`  ${line}`)
}
if (ambiguousKits.length) {
  console.log(`\n${ambiguousKits.length} kits tag several in-scope chassis and name none `
    + '— set `chassis` in data/overrides/kits.yml:')
  for (const line of ambiguousKits) console.log(`  ${line}`)
}
if (unmatched.length) {
  console.log(`\n${unmatched.length} items fell through the category rules (see catalog:report):`)
  for (const line of unmatched.slice(0, 15)) console.log(`  ${line}`)
}
