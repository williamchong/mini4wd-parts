import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parse } from 'yaml'
import { CHASSIS_IDS } from './schema.ts'
import { SHARE_CHASSIS, SHARE_SLOTS, encodeBuild, parseBuild, reconcileBuild } from './share.ts'
import type { ShareCatalog } from './share.ts'
import type { BuildState } from './build.ts'

/**
 * Two chassis so a kit can disagree with the link about which one it is on,
 * and a `gear-set`/`gear` slot so an id-vs-type mix-up has somewhere to show.
 */
const catalog: ShareCatalog = {
  chassis: [
    {
      id: 'ma',
      slots: [
        { id: 'motor', type: 'motor', maxCount: 1, mirror: false, required: true },
        { id: 'gear-set', type: 'gear', maxCount: 1, mirror: false, required: true },
        { id: 'roller-front', type: 'roller-front', maxCount: 2, mirror: true, required: true },
        { id: 'brake', type: 'brake', maxCount: 2, mirror: false, required: false }
      ]
    },
    {
      id: 'vz',
      slots: [
        { id: 'motor', type: 'motor', maxCount: 1, mirror: false, required: true },
        { id: 'propeller-shaft', type: 'propeller-shaft', maxCount: 1, mirror: false, required: true }
      ]
    }
  ],
  kits: [
    { id: '18099', chassis: 'ma' },
    { id: '18111', chassis: 'vz' }
  ],
  partsById: new Map([
    ['15477', { slots: ['motor'] }],
    ['15392', { slots: ['roller-front', 'roller-rear'] }],
    ['15393', { slots: ['roller-front'] }],
    ['15394', { slots: ['roller-front'] }],
    ['15520', { slots: ['gear'] }]
  ])
}

const link = (state: BuildState) => `#${encodeBuild(state)}`

const reopen = (hash: string) => {
  const parsed = parseBuild(hash)
  assert.ok(parsed, `${hash} did not parse`)
  return reconcileBuild(parsed, catalog)
}

test('a build survives the round trip, emptied slots and multi-part swaps included', () => {
  const state: BuildState = {
    chassis: 'ma',
    kit: '18099',
    swaps: { motor: ['15477'], 'roller-front': ['15392', '15393'], brake: [] }
  }
  assert.deepEqual(reopen(link(state)), state)
})

test('the byte layout is pinned, so reordering a table fails here rather than in shared links', () => {
  // Chassis `vs` is index 7, kit 18099, slot `brake` is 19 with part 15520,
  // slot `fastener` is 21 and emptied.
  const hash = link({ chassis: 'vs', kit: '18099', swaps: { brake: ['15520'], fastener: [] } })
  assert.equal(hash, '#AQcARrMTAQA8oBUA')
  assert.deepEqual(parseBuild(hash), {
    chassis: 'vs', kit: '18099', swaps: { brake: ['15520'], fastener: [] }
  })
})

test('a kit with five swaps stays short enough to paste anywhere', () => {
  const hash = link({
    chassis: 'ma',
    kit: '18099',
    swaps: Object.fromEntries(['motor', 'gear-set', 'roller-front', 'roller-rear', 'brake']
      .map(slot => [slot, ['15392']]))
  })
  assert.equal(hash.length, 41)
})

test('the tables cover every chassis and every slot the catalog has', () => {
  assert.deepEqual([...SHARE_CHASSIS].sort(), [...CHASSIS_IDS].sort())
  const profiles = parse(readFileSync(new URL('../../data/taxonomy/slots.yml', import.meta.url), 'utf8'))
    .profiles as Record<string, Array<{ id: string }>>
  for (const slot of Object.values(profiles).flat()) {
    assert.ok(SHARE_SLOTS.includes(slot.id), `slot ${slot.id} is missing from SHARE_SLOTS`)
  }
})

test('a chassis missing from the table encodes as no link, not a throw', () => {
  assert.equal(encodeBuild({ chassis: 'tz-x' as BuildState['chassis'], swaps: {} }), '')
})

test('anything that is not a build is undefined, never a throw', () => {
  for (const hash of [
    '', '#', '#top', '#a b', '#%E0%A4%A', '#====',
    // Wrong version, unknown chassis, too short for a kit, a swap cut mid-part.
    '#AgAAAAA', '#AQkAAAA', '#AQAAAA', '#AQAAAAABAQA8'
  ]) {
    assert.equal(parseBuild(hash), undefined, hash)
  }
})

test('a slot index this page does not know is skipped, not fatal', () => {
  // Slot 200 with one part, then `motor` (1) with 15477.
  const bytes = [1, 0, 0, 0, 0, 200, 1, 0, 0x3c, 0x40, 1, 1, 0, 0x3c, 0x55]
  const hash = btoa(String.fromCharCode(...bytes)).replaceAll('=', '')
  assert.deepEqual(parseBuild(hash)?.swaps, { motor: ['15445'] })
})

test("the kit's own chassis wins, and swaps made for the other chassis are cleared", () => {
  const hash = link({ chassis: 'ma', kit: '18111', swaps: { motor: ['15477'], 'gear-set': ['15520'] } })
  assert.deepEqual(reopen(hash), { chassis: 'vz', kit: '18111', swaps: {} })
})

test('an unknown kit opens as the bare chassis and keeps its swaps', () => {
  const hash = link({ chassis: 'ma', kit: '99999', swaps: { motor: ['15477'] } })
  assert.deepEqual(reopen(hash), { chassis: 'ma', kit: undefined, swaps: { motor: ['15477'] } })
})

test('a link naming a chassis this catalog does not ship opens nothing', () => {
  const hash = link({ chassis: 'me', swaps: {} })
  assert.equal(reopen(hash), undefined)
})

test('parts are checked against the slot type, not the slot id, and cut to maxCount', () => {
  // `gear-set` holds `gear` parts; `15520` is not a motor, `10000` is not in
  // the catalog, and three rollers do not fit a two-roller slot.
  const hash = link({
    chassis: 'ma',
    swaps: {
      'gear-set': ['15520'],
      motor: ['15520', '10000', '15477'],
      'roller-front': ['15392', '15393', '15394']
    }
  })
  assert.deepEqual(reopen(hash)?.swaps, {
    'gear-set': ['15520'],
    motor: ['15477'],
    'roller-front': ['15392', '15393']
  })
})

test('a slot not on the chassis is dropped, and a slot whose every part was dropped falls back to stock', () => {
  const hash = link({
    chassis: 'ma',
    swaps: { 'propeller-shaft': ['15477'], motor: ['10000'], brake: [] }
  })
  // `brake` was emptied in the link and stays emptied; `motor` named a part
  // and lost it, which is not the same thing as the sender emptying it.
  assert.deepEqual(reopen(hash)?.swaps, { brake: [] })
})
