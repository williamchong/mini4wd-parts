import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { test } from 'node:test'
import { parse } from 'yaml'
import { NAME_LOCALES } from './names.ts'

/**
 * A guide names catalog records by id in plain text — `:kit-links`,
 * `:part-links`, `:chassis-links` — and the content components render whatever
 * the catalog returns for those ids, silently dropping any it cannot find. So a
 * typo, or a kit that leaves the catalog, is an empty row rather than an error.
 * This is where it becomes one.
 */
const root = new URL('../../', import.meta.url)
const COLLECTION_FOR = { kit: 'kits', part: 'parts', chassis: 'chassis' } as const

const guides = NAME_LOCALES.flatMap(locale =>
  readdirSync(new URL(`content/${locale}/guides/`, root))
    .filter(file => file.endsWith('.md') && file !== 'index.md')
    .map(file => ({ locale, file, text: readFileSync(new URL(`content/${locale}/guides/${file}`, root), 'utf8') }))
)

const rows = (text: string) =>
  [...text.matchAll(/:(kit|part|chassis)-links\{ids="([^"]*)"\}/g)]
    .map(([, kind, ids]) => ({
      kind: kind as keyof typeof COLLECTION_FOR,
      ids: ids!.split(/\s+/).filter(Boolean)
    }))

test('every id a guide names is a record in the catalog', () => {
  for (const { locale, file, text } of guides) {
    for (const row of rows(text)) {
      for (const id of row.ids) {
        assert.ok(
          existsSync(new URL(`content/${COLLECTION_FOR[row.kind]}/${id}.yml`, root)),
          `${locale}/${file}: no ${row.kind} ${id}`
        )
      }
    }
  }
})

test('both locales of a guide name the same records in the same order', () => {
  const files = (locale: string) => guides.filter(guide => guide.locale === locale).map(guide => guide.file).sort()
  for (const locale of NAME_LOCALES) assert.deepEqual(files(locale), files(NAME_LOCALES[0]!), `guides in ${locale}`)

  const byFile = new Map<string, string[]>()
  for (const { file, text } of guides) {
    const shape = rows(text).map(row => `${row.kind}:${row.ids.join(' ')}`)
    const other = byFile.get(file)
    if (other) assert.deepEqual(shape, other, `${file} differs between locales`)
    else byFile.set(file, shape)
  }
})

/**
 * The chassis guide's sections are one chassis each, and the kits a section
 * lists have to be built on that chassis, or a reader opens the builder on
 * the wrong one. The section is the nearest `###` heading above the row, and
 * the chassis is its first word, matched against the catalog's own English
 * names because an id and a name differ on one of the eight ("super-2",
 * "Super-II").
 */
test('the chassis guide lists each kit under the chassis it is built on', () => {
  const idByName = new Map(readdirSync(new URL('content/chassis/', root)).map((file) => {
    const chassis = parse(readFileSync(new URL(`content/chassis/${file}`, root), 'utf8')) as { id: string, names: { en: string } }
    return [chassis.names.en.split(' ')[0]!.toLowerCase(), chassis.id]
  }))
  for (const { locale, text } of guides.filter(guide => guide.file === 'chassis.md')) {
    for (const match of text.matchAll(/:kit-links\{ids="([^"]*)"\}/g)) {
      const above = text.slice(0, match.index)
      const heading = above.match(/^### ([^\s:：]+)/gm)?.pop()?.replace(/^### /, '')
      assert.ok(heading, `${locale}: a kit row above the first section`)
      const chassis = idByName.get(heading.toLowerCase())
      assert.ok(chassis, `${locale}: no chassis named ${heading}`)
      for (const id of match[1]!.split(/\s+/).filter(Boolean)) {
        const kit = parse(readFileSync(new URL(`content/kits/${id}.yml`, root), 'utf8')) as { chassis: string }
        assert.equal(kit.chassis, chassis, `${locale}: ${id} listed under ${heading}`)
      }
    }
  }
})
