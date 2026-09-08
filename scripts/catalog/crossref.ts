import { readJsonFile, readYamlDir } from './io.ts'
import { list, section } from './print.ts'
import type { FandomPart } from './sources/fandom.ts'
import type { Part } from '../../shared/catalog/schema.ts'

/**
 * Stage 4 of the catalog pipeline: audit our derived taxonomy against an
 * independent one.
 *
 * Our categories come from ordered substring rules over Japanese product names
 * (data/taxonomy/categories.yml), which is fast and transparent but has one
 * structural failure mode — a short keyword swallowing a longer word, silently
 * and with no way for the coverage report to notice. The Fandom wiki's
 * hand-written `Parts type` is a second opinion keyed by the same Tamiya item
 * numbers, so disagreements point straight at the rules that misfired. It found
 * シール eating シールド and シールタイプ, and our conflation of propeller shafts
 * with axles.
 *
 * Nothing here writes to content/. The wiki is CC-BY-SA and we take no text
 * from it — only the disagreement signal.
 */

const parts = readYamlDir<Part>('content/parts').map(file => file.data)
const wiki = readJsonFile<FandomPart[]>('data/raw/fandom-parts.json')

/**
 * The wiki writes the same type several ways — "Roller"/"Rollers",
 * "Wheels/Tires". Fold the obvious variants so the matrix shows real
 * disagreements rather than spelling.
 */
const normaliseType = (value: string) => value
  .toLowerCase()
  .split('/')
  .map(token => token.trim().replace(/s$/, ''))
  .filter(Boolean)
  .join('/')

/** Item number -> the first wiki article that lists it. Re-issues repeat ids. */
const byItem = new Map<string, { article: FandomPart, type: string }>()
for (const article of wiki) {
  if (!article.partsType) continue
  const type = normaliseType(article.partsType)
  for (const item of article.items) {
    if (!byItem.has(item.id)) byItem.set(item.id, { article, type })
  }
}

interface Joined {
  part: Part
  article: FandomPart
  type: string
}

const joined: Joined[] = parts
  .flatMap(part => {
    const match = byItem.get(part.id)
    return match ? [{ part, ...match }] : []
  })
  .sort((a, b) => a.part.id.localeCompare(b.part.id))

section('Join coverage')
console.log(`  Our committed parts             ${String(parts.length).padStart(4)}`)
console.log(`  Item numbers on the wiki        ${String(byItem.size).padStart(4)}  (from ${wiki.length} articles)`)
console.log(`  Joinable                        ${String(joined.length).padStart(4)}  `
  + `= ${Math.round((joined.length / parts.length) * 100)}% of our catalog`)
console.log(`  Wiki-only (outside our v1 cut)  ${String(byItem.size - joined.length).padStart(4)}`)
console.log(`  Ours with no wiki article       ${String(parts.length - joined.length).padStart(4)}`)

/** our category -> wiki type -> the items that pair them. */
const pairs = new Map<string, Map<string, Joined[]>>()
for (const entry of joined) {
  let forCategory = pairs.get(entry.part.category)
  if (!forCategory) pairs.set(entry.part.category, forCategory = new Map())
  const bucket = forCategory.get(entry.type)
  if (bucket) bucket.push(entry)
  else forCategory.set(entry.type, [entry])
}

/**
 * Ranked once, biggest category first, each category's readings sorted so
 * `rows[0]` is the majority. Both the matrix and the classification below read
 * this, so they cannot disagree about which reading is the majority.
 */
const ranked = [...pairs]
  .map(([category, types]) => {
    const rows = [...types].sort((a, b) => b[1].length - a[1].length)
    return { category, rows, size: rows.reduce((sum, [, items]) => sum + items.length, 0) }
  })
  .sort((a, b) => b.size - a.size)

section(`Our category x wiki "Parts type" (${joined.length} joined)`)
for (const { category, rows, size } of ranked) {
  const flag = rows.length > 1 ? `   <- ${rows.length} wiki types` : ''
  console.log(`\n  ${category.padEnd(17)} ${String(size).padStart(3)}${flag}`)
  for (const [type, items] of rows) console.log(`      ${String(items.length).padStart(3)}  ${type}`)
}

/**
 * The majority pairing is our working mapping for a category; everything else
 * is a minority reading. Most of those are the wiki simply being more or less
 * specific than us — "bearing" against our majority "ball bearing", or
 * "bumper/rear stay" against "stay". Those are worth showing but are not
 * defects, so they are split out: only the genuine disagreements turn into a
 * rule change in data/taxonomy/categories.yml or an entry in
 * data/overrides/parts.yml.
 */
const overlaps = (a: string, b: string) => a.includes(b) || b.includes(a)
const sameThing = (majority: string, type: string) =>
  type.split('/').some(token => overlaps(majority, token))
  || majority.split('/').some(token => overlaps(type, token))

interface Finding { category: string, type: string, items: Joined[] }
const disagreements: Finding[] = []
const granularity: Finding[] = []

for (const { category, rows } of ranked) {
  const majority = rows[0]![0]
  for (const [type, items] of rows.slice(1)) {
    ;(sameThing(majority, type) ? granularity : disagreements).push({ category, type, items })
  }
}

const formatRow = ({ part, article }: Joined) =>
  `${part.id}  ${part.names.ja.slice(0, 46).padEnd(46)}  -> [[${article.title}]]`
  + (part.categorySource === 'override' ? ' [override]' : '')

const report = (findings: Finding[]) => {
  if (!findings.length) return console.log('  None.')
  for (const { category, type, items } of findings) {
    list(`\n  ours=${category}  wiki=${type}`, items.map(formatRow), 6)
  }
}

const count = (findings: Finding[]) => findings.reduce((sum, f) => sum + f.items.length, 0)

section('Disagreements (review each — a rule or an override)')
report(disagreements)

section('Granularity only (the wiki is more or less specific than us)')
report(granularity)

section('Summary')
console.log(`  ${joined.length} joined`)
console.log(`  ${count(disagreements)} disagreement(s), ${count(granularity)} granularity difference(s)`)
