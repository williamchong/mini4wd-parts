import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parse } from 'yaml'
import { CHASSIS_IDS } from './schema.ts'
import { SHARE_CHASSIS, SHARE_SLOTS, encodeBuild, parseBuild, reconcileBuild, wasTrimmed } from './share.ts'
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

/** Every slot id the chassis profiles use, across all of them. */
const taxonomySlotIds = () => new Set(Object.values(
  parse(readFileSync(new URL('../../data/taxonomy/slots.yml', import.meta.url), 'utf8'))
    .profiles as Record<string, Array<{ id: string }>>
).flat().map(slot => slot.id))

test('the tables cover every chassis and every slot the catalog has', () => {
  assert.deepEqual([...SHARE_CHASSIS].sort(), [...CHASSIS_IDS].sort())
  for (const id of taxonomySlotIds()) {
    assert.ok(SHARE_SLOTS.includes(id), `slot ${id} is missing from SHARE_SLOTS`)
  }
})

/**
 * SHARE_SLOTS as it stood on 2026-09-22, when the first links were in the
 * wild. Formatted like the list in share.ts so the two diff against each other
 * by eye. Ids and their positions only: a slot's `type` and `maxCount` are
 * catalog facts, and `reconcileBuild` trims a link against them by design.
 */
const PINNED_SLOTS = [
  'body', 'motor', 'gear-set', 'counter-gear', 'propeller-shaft', 'terminal', 'switch',
  'axle', 'bearing', 'wheel-front', 'wheel-rear', 'tire-front', 'tire-rear', 'front-stay',
  'rear-stay', 'side-stay', 'roller-front', 'roller-rear', 'roller-side', 'brake', 'damper',
  'fastener', 'gear-cover', 'chassis-unit'
]

/**
 * The coverage test is containment only, which a rename passes. This pins the
 * positions: appending stays free, and renaming, reordering or removing one of
 * these fails here rather than re-pointing every link already shared.
 *
 * A slot that must be renamed keeps its entry and its index — the entry is a
 * wire format, not the taxonomy — and `reconcileBuild` maps the old id on.
 */
test('the order of SHARE_SLOTS is pinned, so a rename fails here rather than in shared links', () => {
  assert.deepEqual(SHARE_SLOTS.slice(0, PINNED_SLOTS.length), PINNED_SLOTS)
  // Editing both lists in step would satisfy the comparison above, since one
  // commit owns them both. The count is a third thing such an edit has to get
  // past, and a legitimate append never moves it.
  assert.equal(PINNED_SLOTS.length, 24)
})

/**
 * The other half of a rename, and the quiet one: leave the positions alone and
 * append the new id. The pin above holds and the coverage test is satisfied,
 * while every link already shared names a slot no chassis has any more. So a
 * pinned id must still be a slot, not merely still be in the list.
 */
test('a pinned slot is still in the taxonomy, so renaming one by appending fails too', () => {
  const taxonomy = taxonomySlotIds()
  for (const id of PINNED_SLOTS) {
    assert.ok(taxonomy.has(id),
      `slot ${id} was renamed or retired, but links still name it: map it in reconcileBuild`)
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

test('a link is trimmed when reconciling lost its kit, its chassis, a slot or a part, and not otherwise', () => {
  const trimmed = (state: BuildState) => {
    const shared = parseBuild(link(state))!
    return wasTrimmed(shared, reconcileBuild(shared, catalog)!)
  }
  assert.equal(trimmed({ chassis: 'ma', kit: '18099', swaps: { motor: ['15477'], brake: [] } }), false)
  assert.equal(trimmed({ chassis: 'ma', kit: '99999', swaps: {} }), true)
  assert.equal(trimmed({ chassis: 'ma', kit: '18111', swaps: {} }), true)
  assert.equal(trimmed({ chassis: 'ma', swaps: { 'propeller-shaft': ['15477'] } }), true)
  assert.equal(trimmed({ chassis: 'ma', swaps: { 'roller-front': ['15392', '10000'] } }), true)
  assert.equal(trimmed({ chassis: 'ma', swaps: { motor: ['10000'] } }), true)
})
