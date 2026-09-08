import { readYamlDir, readYamlFileIfPresent } from './io.ts'
import { list, section } from './print.ts'
import type { Part, PartOverride } from '../../shared/catalog/schema.ts'

/**
 * Coverage and QA report. This is what drives the manual pass: every line it
 * prints is either a rule to add in data/taxonomy or an entry to add in
 * data/overrides/parts.yml.
 */

const parts = readYamlDir<Part>('content/parts').map(file => file.data)
const overrides = readYamlFileIfPresent<Record<string, PartOverride>>('data/overrides/parts.yml', {})

const tally = (key: (part: Part) => string) => {
  const counts = new Map<string, number>()
  for (const part of parts) counts.set(key(part), (counts.get(key(part)) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1])
}

console.log(`${parts.length} parts in content/parts`)

section('By series')
for (const [series, count] of tally(part => part.series)) console.log(`  ${series.padEnd(10)} ${count}`)

section('By category')
for (const [category, count] of tally(part => part.category)) console.log(`  ${category.padEnd(16)} ${count}`)

section('Gaps to fix')
const label = (part: Part) => `${part.id} ${part.names.ja}`

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
  parts.filter(part => !part.names['zh-HK'] && !part.names['zh-TW']).map(label), 4)

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
const percent = (n: number) => `${Math.round((n / parts.length) * 100)}%`
console.log(`  Traditional Chinese names  ${percent(parts.filter(p => p.names['zh-HK'] || p.names['zh-TW']).length)}`)
console.log(`  HKD prices                 ${percent(parts.filter(p => p.priceHkd !== undefined).length)}`)
console.log(`  Chassis compatibility      ${percent(parts.filter(p => p.chassisCompat.include.length > 0).length)}`)
console.log(`  Categorised                ${percent(parts.filter(p => p.category !== 'other').length)}`)
