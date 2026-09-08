import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fandomArticleUrl, orderKits } from './kits.ts'

/**
 * Every title asserted on here is a `loadoutSourceTitle` that exists in the
 * committed catalog, not an invented edge case. There are 183 distinct titles
 * across the 292 kits with a wiki loadout, and these are the four shapes that
 * break a naive encoder.
 */
test('a wiki title becomes an article path, spaces first', () => {
  assert.equal(
    fandomArticleUrl('Super Avante'),
    'https://mini-4wd.fandom.com/wiki/Super_Avante'
  )
})

test('a trailing dot survives — 55 kits are "… Jr."', () => {
  assert.equal(
    fandomArticleUrl('Vanquish Jr.'),
    'https://mini-4wd.fandom.com/wiki/Vanquish_Jr.'
  )
})

/**
 * The case that rules out encodeURIComponent. `%2F` is a different article, so
 * encoding this slash would produce a link that resolves to nothing while
 * looking perfectly well-formed — a broken attribution rather than a broken
 * page.
 */
test('a slash stays a path separator rather than becoming %2F', () => {
  assert.equal(
    fandomArticleUrl('Toyota Gazoo Racing WRT/Yaris WRC'),
    'https://mini-4wd.fandom.com/wiki/Toyota_Gazoo_Racing_WRT/Yaris_WRC'
  )
})

test('parentheses and apostrophes are left alone', () => {
  assert.equal(
    fandomArticleUrl('Super Avante Jr. (TD4)'),
    'https://mini-4wd.fandom.com/wiki/Super_Avante_Jr._(TD4)'
  )
  assert.equal(
    fandomArticleUrl("Mini 4WD New Year's Edition - Year of the Dragon 2024"),
    "https://mini-4wd.fandom.com/wiki/Mini_4WD_New_Year's_Edition_-_Year_of_the_Dragon_2024"
  )
})

/**
 * No committed title carries either character, so this pins the guard rather
 * than the data: encodeURI leaves both alone and either would silently truncate
 * the article path.
 */
test('a query or fragment character cannot truncate the path', () => {
  assert.equal(fandomArticleUrl('What?'), 'https://mini-4wd.fandom.com/wiki/What%3F')
  assert.equal(fandomArticleUrl('No #1'), 'https://mini-4wd.fandom.com/wiki/No_%231')
})

const kit = (id: string, releaseDate?: string) => ({ id, releaseDate })

test('kits are ordered newest first', () => {
  const ordered = orderKits([
    kit('18001', '2015-06-20'), kit('18002', '2024-01-13'), kit('18003', '2019-11-02')
  ])
  assert.deepEqual(ordered.map(k => k.id), ['18002', '18003', '18001'])
})

/**
 * 35 of the 305 committed kits have no release date. Sorting them first would
 * put the least-known boxes at the top of the picker; treating the absence as
 * year zero is the same bug wearing the other sign.
 */
test('a kit with no release date sorts last, not first', () => {
  const ordered = orderKits([kit('18001'), kit('18002', '2024-01-13'), kit('18003')])
  assert.deepEqual(ordered.map(k => k.id), ['18002', '18001', '18003'])
})

test('same-day releases fall back to the item number, so the order is stable', () => {
  const ordered = orderKits([
    kit('18913', '2024-01-13'), kit('18014', '2024-01-13'), kit('95416', '2024-01-13')
  ])
  assert.deepEqual(ordered.map(k => k.id), ['18014', '18913', '95416'])
})

test('ordering does not mutate the array it was given', () => {
  const kits = [kit('18001', '2015-06-20'), kit('18002', '2024-01-13')]
  orderKits(kits)
  assert.deepEqual(kits.map(k => k.id), ['18001', '18002'])
})
