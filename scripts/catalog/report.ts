import { readYamlDir, readYamlFileIfPresent } from './io.ts'
import { list, section } from './print.ts'
import type { Kit, Part, PartOverride } from '../../shared/catalog/schema.ts'
import { hasTraditionalChineseName } from '../../shared/catalog/names.ts'

/**
 * Coverage and QA report. This is what drives the manual pass: every line it
 * prints is either a rule to add in data/taxonomy or an entry to add in
 * data/overrides/parts.yml.
 */

const parts = readYamlDir<Part>('content/parts').map(file => file.data)
const kits = readYamlDir<Kit>('content/kits').map(file => file.data)
const overrides = readYamlFileIfPresent<Record<string, PartOverride>>('data/overrides/parts.yml', {})

function tally<T>(items: T[], key: (item: T) => string) {
  const counts = new Map<string, number>()
  for (const item of items) {
    const value = key(item)
    counts.set(value, (counts.get(value) ?? 0) + 1)
  }
  return [...counts].sort((a, b) => b[1] - a[1])
}

/** Parts and kits are both keyed by item number and both carry a JP name. */
const label = (record: Part | Kit) => `${record.id} ${record.names.ja}`
// A collection can legitimately be empty — a fresh clone, or a --only=jp
// scrape — and "NaN%" reads as a bug in the report rather than an empty input.
const percent = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : '—')

console.log(`${parts.length} parts in content/parts`)

section('By series')
for (const [series, count] of tally(parts, part => part.series)) console.log(`  ${series.padEnd(10)} ${count}`)

section('By category')
for (const [category, count] of tally(parts, part => part.category)) console.log(`  ${category.padEnd(16)} ${count}`)

section('Gaps to fix')

// "other" is a legitimate outcome for odds and ends, but only once a human has
// confirmed it in data/overrides/parts.yml.
list('  Uncategorised and unreviewed',
  parts.filter(part => part.category === 'other' && !overrides[part.id]?.category).map(label))

// An empty compatibility list means "not chassis-specific" (washers, spacers,
// AO spares), not "unknown" — the builder treats these as universal.
list('  Car parts with no chassis compatibility (treated as universal)',
  parts.filter(part => part.isCarPart && part.chassisCompat.include.length === 0).map(label), 4)

list('  Motors without a legality override',
  parts.filter(part => part.category === 'motor' && part.classLegality.source !== 'override').map(label))

list('  No Traditional Chinese name',
  parts.filter(part => !hasTraditionalChineseName(part.names)).map(label), 4)

list('  No English name', parts.filter(part => !part.names.en).map(label))
list('  No price', parts.filter(part => part.priceJpy === undefined).map(label))
// Tamiya prints no release line on long-standing items, so this is a coverage
// figure rather than a defect.
list('  No release date (Tamiya omits it on older items)',
  parts.filter(part => !part.releaseDate).map(label), 4)

const ids = new Set(parts.map(part => part.id))
list('  Override entries matching no selected item',
  Object.keys(overrides).filter(id => !ids.has(id)))

section('Coverage')
const partPercent = (n: number) => percent(n, parts.length)
console.log(`  Traditional Chinese names  ${partPercent(parts.filter(p => hasTraditionalChineseName(p.names)).length)}`)
console.log(`  HKD prices                 ${partPercent(parts.filter(p => p.priceHkd !== undefined).length)}`)
console.log(`  Chassis compatibility      ${partPercent(parts.filter(p => p.chassisCompat.include.length > 0).length)}`)
console.log(`  Categorised                ${partPercent(parts.filter(p => p.category !== 'other').length)}`)

section('Kits')
console.log(`${kits.length} kits in content/kits`)

console.log('')
for (const [chassis, count] of tally(kits, kit => kit.chassis)) console.log(`  ${chassis.padEnd(10)} ${count}`)
console.log('')

// Not a defect: a kit with no wiki row still opens in the builder, seeded from
// its chassis' runner. What it loses is the handful of slots a kit changes.
list('  No per-kit loadout (falls back to the chassis default)',
  kits.filter(kit => kit.loadoutSource === 'chassis').map(label), 4)
list('  No gear ratio', kits.filter(kit => !kit.gearRatio).map(label), 4)
list('  No Traditional Chinese name',
  kits.filter(kit => !hasTraditionalChineseName(kit.names)).map(label), 4)
list('  No price', kits.filter(kit => kit.priceJpy === undefined).map(label), 4)

// Every imported loadout entry that is still a bare label is a part we have not
// identified. Most of them never will be — moulded wheels and tires are not
// sold separately — so this is a shortlist to triage in data/overrides/kits.yml
// rather than a count of things that are wrong.
//
// The gear set is excluded: its label is a ratio, which is already a field of
// its own, and no catalog part is the moulded gears a kit ships.
const unresolved = new Map<string, number>()
for (const kit of kits) {
  for (const [slot, filled] of Object.entries(kit.stockLoadout)) {
    if (slot === 'gear-set') continue
    for (const entry of filled) {
      if (entry.partId || !entry.label || entry.source !== 'fandom') continue
      unresolved.set(entry.label, (unresolved.get(entry.label) ?? 0) + 1)
    }
  }
}
list('  Imported loadout labels with no catalog part',
  [...unresolved].sort((a, b) => b[1] - a[1])
    .map(([text, count]) => `${String(count).padStart(3)}×  ${text}`))

const kitPercent = (n: number) => percent(n, kits.length)
console.log(`\n  Per-kit loadout            ${kitPercent(kits.filter(k => k.loadoutSource === 'fandom').length)}`)
console.log(`  Gear ratio                 ${kitPercent(kits.filter(k => k.gearRatio).length)}`)
console.log(`  HKD prices                 ${kitPercent(kits.filter(k => k.priceHkd !== undefined).length)}`)
console.log(`  Traditional Chinese names  ${kitPercent(kits.filter(k => hasTraditionalChineseName(k.names)).length)}`)
