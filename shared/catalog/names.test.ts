import assert from 'node:assert/strict'
import { test } from 'node:test'
import { matchesQuery, resolveLabel, resolveName } from './names.ts'

const raikiri = {
  ja: 'ドッグレーサー（ブルー/ライキリ）',
  en: 'DOG RACER (BLUE/RAIKIRI)',
  'zh-HK': 'Beginner’s Mini4WD 雷切 (藍色) & 狗狗車手 (MA底盤)'
}

test('an empty query matches everything, so an unfiltered picker shows the lot', () => {
  assert.equal(matchesQuery('', '17901', raikiri), true)
  assert.equal(matchesQuery('   ', '17901', raikiri), true)
})

test('the item number matches, because that is what is printed on the box', () => {
  assert.equal(matchesQuery('17901', '17901', raikiri), true)
  assert.equal(matchesQuery('179', '17901', raikiri), true)
  assert.equal(matchesQuery('18656', '17901', raikiri), false)
})

/**
 * The rule the whole function exists for. Two thirds of kits have no
 * Traditional Chinese name, so a reader on the Chinese page set is looking at a
 * romanised English string — but a reader who *does* see the Chinese name must
 * still be able to find it by the English one, and vice versa.
 */
test('a locale that is not the one being displayed still matches', () => {
  assert.equal(matchesQuery('raikiri', '17901', raikiri), true)
  assert.equal(matchesQuery('ライキリ', '17901', raikiri), true)
  assert.equal(matchesQuery('雷切', '17901', raikiri), true)
})

test('matching is case-insensitive and trims what the reader typed', () => {
  assert.equal(matchesQuery('  DOG Racer  ', '17901', raikiri), true)
})

test('a record missing most locales matches on the ones it has', () => {
  const sparse = { ja: 'テストキット' }
  assert.equal(matchesQuery('テスト', '18700', sparse), true)
  assert.equal(matchesQuery('test', '18700', sparse), false)
})

/**
 * `resolveName` and `resolveLabel` had no tests at all. These pin the two
 * properties everything else assumes: the chain always terminates for a
 * validated record, and it never terminates for a partial one.
 */
test('a name always resolves, because the schema requires ja', () => {
  assert.deepEqual(resolveName({ ja: 'MAシャーシ' }, 'zh-Hant'), {
    value: 'MAシャーシ', from: 'ja'
  })
  assert.deepEqual(resolveName(raikiri, 'zh-Hant'), {
    value: raikiri['zh-HK'], from: 'zh-HK'
  })
})

/**
 * The English chain deliberately skips Chinese entirely: a Latin-script reader
 * gets nothing from a Chinese name, but the Japanese one is at least the string
 * printed on the box.
 */
test('an English reader falls through Chinese to Japanese', () => {
  assert.deepEqual(resolveName({ ja: 'ライキリ', 'zh-HK': '雷切' }, 'en'), {
    value: 'ライキリ', from: 'ja'
  })
})

test('a label with no locale in the chain resolves to nothing rather than a placeholder', () => {
  assert.equal(resolveLabel({}, 'zh-Hant'), undefined)
  assert.equal(resolveLabel({ 'zh-HK': '小徑低框光頭胎' }, 'en'), undefined)
})
