import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { parseDetail, parseListPage } from './sources/tamiya-jp.ts'
import { parseCompatPage } from './sources/tamiya-compat.ts'
import { mapStoreProduct } from './sources/tamiya-hk.ts'
import { deriveCategory, deriveSpecs } from './taxonomy.ts'

const fixture = (name: string) =>
  readFileSync(join(import.meta.dirname, '__fixtures__', name), 'utf8')

test('list page yields the pager total and every item', () => {
  const { total, items } = parseListPage(fixture('list-page.html'), '303010')
  assert.equal(total, 244)
  assert.equal(items.length, 2)
  assert.equal(items[0]!.id, '15549')
  assert.equal(items[0]!.seriesLabel, 'ミニ四駆グレードアップパーツ')
  // The "ITEM 15549" prefix belongs to the id, not the name.
  assert.equal(items[0]!.listName, 'HG カーボンリヤワイドプレート (2㎜) (スライドダンパー対応)')
})

test('detail page yields names, price, date, chassis tags and spec text', () => {
  const entry = { id: '15549', genre: '303010' as const, seriesLabel: '', listName: '' }
  const item = parseDetail(fixture('detail-page.html'), entry)

  assert.equal(item.nameJa, 'HG カーボンリヤワイドプレート (2㎜) (スライドダンパー対応)')
  assert.equal(item.nameEn, 'HG CARBON WIDE REAR PLATE (2mm) (SLIDING DAMPERS)')
  assert.equal(item.gupNumber, 549)
  assert.equal(item.priceJpy, 1078)
  assert.equal(item.priceJpyExTax, 980)
  assert.equal(item.releaseDate, '2026-02-21')
  assert.deepEqual(item.chassisCodes, ['super2', 'ma', 'super1'])
  assert.match(item.specsRaw!, /^2mm厚カーボン製/)
  assert.match(item.compatRaw!, /スーパーII/)
  assert.equal(item.imageUrl, 'https://cdn.example/15549_1.jpg')
  assert.equal(item.infoAsOf, '2026-01-06')
  // Tamiya's marketing description is deliberately not captured.
  assert.equal('description' in item, false)
})

test('detail page without a release line leaves the date empty', () => {
  const html = fixture('detail-page.html').replace('2026年2月21日(土)ごろ発売', '')
  const item = parseDetail(html, { id: '15549', genre: '303010', seriesLabel: '', listName: '' })
  assert.equal(item.releaseDate, undefined)
})

test('compatibility page yields the pager total and item ids', () => {
  const { total, items } = parseCompatPage(fixture('compat-page.html'))
  assert.equal(total, 428)
  assert.deepEqual(items, ['15549', '95718'])
})

test('a list page with no pager reports no total', () => {
  const html = fixture('list-page.html').replace(/<span class="navipage_num_">[^<]*<\/span>/, '')
  const { total, items } = parseListPage(html, '303010')
  assert.equal(total, undefined)
  assert.equal(items.length, 2)
})

test('HK store product yields the item number, TC name and HKD price', () => {
  const item = mapStoreProduct({
    sku: 'TA 15549',
    name: 'Tamiya 15549 HG Carbon Wide Rear Plate (2mm)',
    permalink: 'https://tamiya.hk/product/tamiya-15549/',
    short_description: '<p>田宮 15549 HG 碳纖維 闊身後置支架&nbsp;(2mm) (滑動阻尼裝置用)</p>',
    prices: { price: '13400', currency_minor_unit: 2 }
  })!

  assert.equal(item.id, '15549')
  assert.equal(item.nameEn, 'HG Carbon Wide Rear Plate (2mm)')
  assert.equal(item.nameZhHk, 'HG 碳纖維 闊身後置支架 (2mm) (滑動阻尼裝置用)')
  assert.equal(item.priceHkd, 134)
})

test('HK store rows that are not products are skipped', () => {
  assert.equal(mapStoreProduct({ sku: 'TA Spare Part 2', name: 'x', permalink: '', short_description: '' }), null)
  assert.equal(mapStoreProduct({ sku: '2026pmqs1-28', name: 'x', permalink: '', short_description: '' }), null)
})

test('a plate that mentions slide dampers is still a plate', () => {
  const result = deriveCategory({ nameJa: 'HG カーボンリヤワイドプレート (2㎜) (スライドダンパー対応)' })
  assert.equal(result.category, 'plate')
  assert.equal(result.isCarPart, true)
})

test('a slide damper with no plate in its name is a slide damper', () => {
  assert.equal(deriveCategory({ nameJa: 'ワイドリヤスライドダンパー' }).category, 'slide-damper')
})

test('wheel and tire sets are one category even when the words are separated', () => {
  assert.equal(
    deriveCategory({ nameJa: '大径ナローライトウェイトホイール&ハードバレルタイヤ' }).category,
    'wheel-tire-set'
  )
})

test('tools and gauges are not car parts', () => {
  const result = deriveCategory({ nameJa: 'ミニ四駆セッティングボード' })
  assert.equal(result.category, 'setting-tool')
  assert.equal(result.isCarPart, false)
})

test('specs come out of names and the spec block', () => {
  const base = { id: '0', genre: '303010' as const, seriesLabel: '', listName: '', scrapedAt: '', officialUrl: '', chassisCodes: [] }

  assert.equal(
    deriveSpecs({ ...base, nameJa: '13-12mm オールアルミベアリングローラー' }, 'roller').rollerDiameterMm,
    13
  )
  assert.equal(
    deriveSpecs({ ...base, nameJa: 'HG カーボンリヤワイドプレート (2㎜)' }, 'plate').plateThicknessMm,
    2
  )
  const motor = deriveSpecs({
    ...base,
    nameJa: 'トルクチューン2モーターPRO',
    specsRaw: '適正電圧：2.4～3.0V 推奨負荷トルク：1.7～2.1mN･m 回転数：12200～14400r/min'
  }, 'motor')
  assert.equal(motor.motorShaft, 'double')
  assert.equal(motor.motorRpmMin, 12200)
  assert.equal(motor.motorRpmMax, 14400)
})
