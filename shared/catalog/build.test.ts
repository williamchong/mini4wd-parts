import assert from 'node:assert/strict'
import { test } from 'node:test'
import { partSchema } from './schema.ts'
import {
  BUILD_CLASSES, counterpartParts, gearRatioOf, isChassisCompatible, newBuild, partsForSlot, resolveBuild,
  rollersPerSideIn, slotIdsFor, swappableSlotTypes
} from './build.ts'
import type { BuildState } from './build.ts'
import type { Chassis, Kit, Part } from './schema.ts'

const part = (over: Partial<Part> & Pick<Part, 'id'>): Part => ({
  names: { ja: `部品${over.id}` },
  series: 'gup',
  category: 'other',
  categorySource: 'derived',
  slots: [],
  isCarPart: true,
  chassisCompat: { include: [], other: [], source: 'scraped' },
  classLegality: { open: 'legal', stockBmax: 'legal', junior: 'legal', source: 'derived' },
  specs: {},
  status: 'current',
  officialUrl: `https://example.test/${over.id}`,
  scrapedAt: '2026-09-08',
  ...over
})

/**
 * Two slots whose id and type differ on purpose — `gear-set`/`gear` and
 * `axle`/`shaft` are the two real cases in the committed chassis, and they are
 * what every id-vs-type mistake shows up on.
 */
const chassis: Chassis = {
  id: 'ma',
  names: { ja: 'MAシャーシ' },
  tamiyaCode: 'ma',
  family: 'pro',
  motorPosition: 'mid',
  motorShaft: 'double',
  releaseYear: 2013,
  status: 'current',
  slots: [
    { id: 'motor', type: 'motor', maxCount: 1, mirror: false, required: true },
    { id: 'gear-set', type: 'gear', maxCount: 1, mirror: false, required: true },
    { id: 'axle', type: 'shaft', maxCount: 2, mirror: true, required: true },
    { id: 'brake', type: 'brake', maxCount: 1, mirror: false, required: false },
    { id: 'switch', type: 'switch', maxCount: 1, mirror: false, required: true }
  ],
  defaultLoadout: {
    motor: [{ label: { 'zh-HK': '套件標準雙軸摩打', en: 'Kit standard double-shaft motor' }, source: 'chassis' }],
    'gear-set': [{ label: { 'zh-HK': '套件標準齒輪組' }, source: 'chassis' }],
    switch: [{ label: { 'zh-HK': '套件標準電源開關' }, source: 'chassis' }]
  },
  compatibleParts: []
}

const kit: Kit = {
  id: '18700',
  names: { ja: 'テストキット' },
  series: 'pro',
  chassis: 'ma',
  stockLoadout: { motor: [{ label: { en: 'Torque-Tuned 2' }, source: 'fandom' }] },
  loadoutSource: 'fandom',
  status: 'current',
  officialUrl: 'https://example.test/18700',
  scrapedAt: '2026-09-08'
}

const slotById = (slots: ReturnType<typeof resolveBuild>, id: string) => {
  const slot = slots.find(s => s.id === id)
  assert.ok(slot, `no slot ${id}`)
  return slot
}

test('a bare chassis build starts stock, fully assembled and owning no parts', () => {
  const slots = resolveBuild(chassis, undefined, newBuild('ma'))

  assert.equal(slots.length, chassis.slots.length)
  assert.equal(slotById(slots, 'motor').entries[0]?.label?.['zh-HK'], '套件標準雙軸摩打')
  assert.equal(slotById(slots, 'motor').entries[0]?.origin, 'chassis')
  // Nothing in a runner's default loadout is a Grade-Up Part, so a fresh build
  // has a shopping list of nothing at all.
  assert.equal(slots.every(slot => slot.entries.every(e => e.partId === undefined)), true)
  assert.equal(slots.some(slot => slot.swapped), false)
})

test('a slot the chassis does not fill resolves empty rather than missing', () => {
  const slots = resolveBuild(chassis, undefined, newBuild('ma'))
  assert.deepEqual(slotById(slots, 'brake').entries, [])
  assert.equal(slotById(slots, 'brake').required, false)
})

test('a kit replaces the chassis entry for the slots it names, and only those', () => {
  const slots = resolveBuild(chassis, kit, newBuild('ma', '18700'))

  assert.equal(slotById(slots, 'motor').entries[0]?.label?.en, 'Torque-Tuned 2')
  assert.equal(slotById(slots, 'motor').entries[0]?.origin, 'kit')
  // The kit says nothing about gears, so the runner's default still stands.
  assert.equal(slotById(slots, 'gear-set').entries[0]?.origin, 'chassis')
})

test('a swap wins over both, and carries the slot id not the slot type', () => {
  const state: BuildState = { chassis: 'ma', kit: '18700', swaps: { 'gear-set': ['15515'] } }
  const slots = resolveBuild(chassis, kit, state)

  const gears = slotById(slots, 'gear-set')
  assert.equal(gears.entries.length, 1)
  assert.equal(gears.entries[0]?.partId, '15515')
  assert.equal(gears.entries[0]?.origin, 'user')
  assert.equal(gears.swapped, true)
  assert.equal(slotById(slots, 'motor').swapped, false)
})

test('an emptied slot is a swap, not an untouched one', () => {
  const emptied = resolveBuild(chassis, undefined, { chassis: 'ma', swaps: { motor: [] } })
  assert.deepEqual(slotById(emptied, 'motor').entries, [])
  assert.equal(slotById(emptied, 'motor').swapped, true)

  const untouched = resolveBuild(chassis, undefined, newBuild('ma'))
  assert.equal(slotById(untouched, 'motor').swapped, false)
})

test('a mirrored slot holds as many parts as the user put in it', () => {
  const slots = resolveBuild(chassis, undefined, { chassis: 'ma', swaps: { axle: ['15514', '15514'] } })
  assert.equal(slotById(slots, 'axle').entries.length, 2)
  assert.equal(slotById(slots, 'axle').maxCount, 2)
})

test('a loadout key naming a slot the chassis lacks is dropped', () => {
  const strayKit: Kit = { ...kit, stockLoadout: { 'roller-front': [{ label: { en: 'x' }, source: 'fandom' }] } }
  const slots = resolveBuild(chassis, strayKit, newBuild('ma', '18700'))
  assert.equal(slots.some(slot => slot.id === 'roller-front'), false)
})

test('an empty compatibility list means universal, not unknown', () => {
  const washer = part({ id: '10307', chassisCompat: { include: [], other: [], source: 'scraped' } })
  assert.equal(isChassisCompatible(washer, 'ma'), true)
  assert.equal(isChassisCompatible(washer, 'vs'), true)

  const arOnly = part({ id: '15512', chassisCompat: { include: ['ar'], other: [], source: 'scraped' } })
  assert.equal(isChassisCompatible(arOnly, 'ar'), true)
  assert.equal(isChassisCompatible(arOnly, 'ma'), false)
})

test('a part maps to slot ids through its slot types', () => {
  const gears = part({ id: '15515', slots: ['gear', 'counter-gear'] })
  assert.deepEqual(slotIdsFor(gears, chassis), ['gear-set'])

  const axle = part({ id: '15514', slots: ['shaft'] })
  assert.deepEqual(slotIdsFor(axle, chassis), ['axle'])
})

test('the picker offers illegal parts rather than hiding them, ranked last', () => {
  const parts = [
    part({ id: '15486', slots: ['motor'], priceJpy: 660,
      classLegality: { open: 'legal', stockBmax: 'illegal', junior: 'legal', source: 'derived' } }),
    part({ id: '15484', slots: ['motor'], priceJpy: 550 }),
    part({ id: '15487', slots: ['motor'] }),
    part({ id: '15200', slots: ['roller-front'], priceJpy: 100 }),
    part({ id: '69942', slots: ['motor'], priceJpy: 1, isCarPart: false })
  ]

  const stock = partsForSlot(parts, 'motor', chassis, 'stockBmax')
  // Cheapest legal first, then the priceless one, then the Open-only motor.
  assert.deepEqual(stock.map(c => c.part.id), ['15484', '15487', '15486'])
  assert.equal(stock.at(-1)?.legality, 'illegal')

  // Same parts under Open: the ranking is by price alone.
  assert.deepEqual(partsForSlot(parts, 'motor', chassis, 'open').map(c => c.part.id),
    ['15484', '15486', '15487'])
})

test('add-ons follow the parts they go with, however cheap', () => {
  const parts = [
    part({ id: '94792', slots: ['roller-front'], isAddOn: true, priceJpy: 110 }),
    part({ id: '15437', slots: ['roller-front'], priceJpy: 770 }),
    part({ id: '15381', slots: ['roller-front'], priceJpy: 220 }),
    part({ id: '15180', slots: ['roller-front'], isAddOn: true, priceJpy: 550 })
  ]
  assert.deepEqual(partsForSlot(parts, 'roller-front', chassis, 'open').map(c => c.part.id),
    ['15381', '15437', '94792', '15180'])

  // The add-ons stay one block at the foot, below even an illegal part, so the
  // picker's divider has a single place to go.
  parts[1] = { ...parts[1]!, classLegality: { ...parts[1]!.classLegality, junior: 'illegal' } }
  parts[0] = { ...parts[0]!, classLegality: { ...parts[0]!.classLegality, junior: 'illegal' } }
  assert.deepEqual(partsForSlot(parts, 'roller-front', chassis, 'junior').map(c => c.part.id),
    ['15381', '15437', '15180', '94792'])
})

test('the picker drops parts that are not for this chassis, and non-car parts', () => {
  const parts = [
    part({ id: '15512', slots: ['front-stay'], chassisCompat: { include: ['ar'], other: [], source: 'scraped' } }),
    part({ id: '15513', slots: ['front-stay'] }),
    part({ id: '74023', slots: ['front-stay'], isCarPart: false })
  ]
  assert.deepEqual(partsForSlot(parts, 'front-stay', chassis, 'open').map(c => c.part.id), ['15513'])
})

test('a slot no part declares offers no swap', () => {
  const parts = [part({ id: '15484', slots: ['motor'] })]
  const types = swappableSlotTypes(parts, chassis)

  assert.equal(types.has('motor'), true)
  // No part in the catalog fills the switch slot; it stays stock forever.
  assert.equal(types.has('switch'), false)
})

test('a slot type is swappable even when only a universal part fills it', () => {
  const parts = [part({ id: '10307', slots: ['fastener'], chassisCompat: { include: [], other: [], source: 'scraped' } })]
  assert.equal(swappableSlotTypes(parts, { ...chassis, id: 'vz' }).has('fastener'), true)
})

test('"none" is not a slot anything can be swapped into', () => {
  const parts = [part({ id: '15525', slots: ['none'] })]
  assert.equal(swappableSlotTypes(parts, chassis).size, 0)
})

test('a single-shaft motor is not offered for a double-shaft chassis', () => {
  const parts = [
    part({ id: '94380', slots: ['motor'], priceJpy: 165, specs: { motorShaft: 'single' } }),
    part({ id: '15487', slots: ['motor'], priceJpy: 462, specs: { motorShaft: 'double' } }),
    // Tamiya does not print a shaft type for every motor; an unrecorded one is
    // offered rather than hidden.
    part({ id: '15400', slots: ['motor'], priceJpy: 400 })
  ]

  assert.deepEqual(partsForSlot(parts, 'motor', chassis, 'open').map(c => c.part.id),
    ['15400', '15487'])

  const singleShaft = { ...chassis, motorShaft: 'single' as const }
  assert.deepEqual(partsForSlot(parts, 'motor', singleShaft, 'open').map(c => c.part.id),
    ['94380', '15400'])
})

test('shaft type only filters the motor slot', () => {
  // A propeller shaft carries no motorShaft spec; nothing else should either.
  const parts = [part({ id: '15515', slots: ['gear'], specs: { motorShaft: 'single' } })]
  assert.equal(partsForSlot(parts, 'gear', chassis, 'open').length, 1)
})

test('a slot is swappable only where something actually fits', () => {
  const parts = [part({ id: '94380', slots: ['motor'], specs: { motorShaft: 'single' } })]
  // The only motor in this catalog cannot go in a double-shaft chassis.
  assert.equal(swappableSlotTypes(parts, chassis).has('motor'), false)
  assert.equal(swappableSlotTypes(parts, { ...chassis, motorShaft: 'single' }).has('motor'), true)
})

test('a wheel or tire row can copy the other end only when that changes it', () => {
  const wheel = (id: string, entries: { partId?: string }[], swapped = false) => ({
    id, type: id as 'wheel-front', maxCount: 2, mirror: true, required: true,
    entries: entries.map(e => ({ ...e, origin: 'user' as const })), swapped
  })
  const parts = new Map([
    ['15001', { slots: ['wheel-front', 'wheel-rear'] as Part['slots'] }],
    ['15002', { slots: ['wheel-rear'] as Part['slots'] }]
  ])
  const front = wheel('wheel-front', [{ partId: '15001' }])
  const rear = wheel('wheel-rear', [{}])
  assert.deepEqual(counterpartParts(rear, [front, rear], parts)?.partIds, ['15001'])
  // Stock plastic has no item number to copy.
  assert.equal(counterpartParts(front, [front, rear], parts), undefined)
  // Already the same part.
  const rearSame = wheel('wheel-rear', [{ partId: '15001' }])
  assert.equal(counterpartParts(rearSame, [front, rearSame], parts), undefined)
  // A rear-only part does not go on the front.
  const rearOnly = wheel('wheel-rear', [{ partId: '15002' }])
  assert.equal(counterpartParts(front, [front, rearOnly], parts), undefined)
  // Only wheels and tires have a counterpart.
  assert.equal(counterpartParts(wheel('motor', []), [front], parts), undefined)
})

test('the gear ratio is the kit\'s until a gear slot is swapped, then only the swapped parts\'', () => {
  const gearSlots = [
    ...chassis.slots,
    { id: 'counter-gear', type: 'counter-gear' as const, maxCount: 1, mirror: false, required: false }
  ]
  const single = { ...chassis, slots: gearSlots }
  const parts = new Map([
    ['15355', part({ id: '15355', slots: ['gear', 'counter-gear'], specs: { gearRatio: '4:1' } })],
    ['15434', part({ id: '15434', slots: ['gear', 'counter-gear'], specs: { gearRatio: '3.7:1' } })],
    ['15456', part({ id: '15456', slots: ['gear', 'counter-gear'] })]
  ])
  const ratio = (swaps: BuildState['swaps'], from: Pick<Kit, 'gearRatio' | 'stockLoadout'> | undefined = kit) =>
    gearRatioOf(resolveBuild(single, from, { chassis: 'ma', kit: from && '18700', swaps }), parts, from)
  const stock = { ...kit, gearRatio: '3.5:1' }

  assert.equal(ratio({}, stock), '3.5:1')
  // A bare chassis' "Kit standard gears" names no ratio.
  assert.equal(ratio({}, undefined), undefined)
  assert.equal(ratio({ 'gear-set': ['15355'] }, stock), '4:1')
  // A counter gear set decides it on its own.
  assert.equal(ratio({ 'counter-gear': ['15434'] }, stock), '3.7:1')
  assert.equal(ratio({ 'gear-set': ['15434'], 'counter-gear': ['15434'] }, stock), '3.7:1')
  // Two that disagree, a set with no single ratio, and an emptied slot are unknown.
  assert.equal(ratio({ 'gear-set': ['15355'], 'counter-gear': ['15434'] }, stock), undefined)
  assert.equal(ratio({ 'gear-set': ['15456'] }, stock), undefined)
  assert.equal(ratio({ 'gear-set': [] }, stock), undefined)
  // Swapping something else leaves the kit's ratio standing.
  assert.equal(ratio({ motor: ['15355'] }, stock), '3.5:1')
})

test('a roller slot counts the rollers its end\'s stay carries each side, where that is more than one', () => {
  const rollerSlots = [
    ...chassis.slots,
    { id: 'front-stay', type: 'front-stay' as const, maxCount: 1, mirror: false, required: false },
    { id: 'rear-stay', type: 'rear-stay' as const, maxCount: 1, mirror: false, required: false },
    { id: 'roller-front', type: 'roller-front' as const, maxCount: 2, mirror: true, required: true },
    { id: 'roller-rear', type: 'roller-rear' as const, maxCount: 2, mirror: true, required: true }
  ]
  const rollerChassis = {
    ...chassis,
    slots: rollerSlots,
    defaultLoadout: {
      ...chassis.defaultLoadout,
      'roller-front': [{ label: { en: 'Kit standard plastic rollers' }, source: 'chassis' as const }],
      'roller-rear': [{ label: { en: 'Kit standard plastic rollers' }, source: 'chassis' as const }]
    }
  }
  const parts = new Map([
    ['15412', part({ id: '15412', slots: ['front-stay', 'rear-stay'], specs: { rollersPerSide: 2 } })],
    ['15498', part({ id: '15498', slots: ['front-stay', 'rear-stay'] })]
  ])
  const counts = (swaps: BuildState['swaps']) =>
    Object.fromEntries(rollersPerSideIn(resolveBuild(rollerChassis, undefined, { chassis: 'ma', swaps }), parts))

  assert.deepEqual(counts({}), {})
  // Only the end the double-roller stay is on, and a stock roller counts as much as a swapped one.
  assert.deepEqual(counts({ 'rear-stay': ['15412'] }), { 'roller-rear': 2 })
  assert.deepEqual(counts({ 'front-stay': ['15412'], 'rear-stay': ['15498'] }), { 'roller-front': 2 })
  // No rollers in the slot, none to count.
  assert.deepEqual(counts({ 'rear-stay': ['15412'], 'roller-rear': [] }), {})
})

test('a part maps to every slot id it fits, in the chassis\' order', () => {
  const brake = part({ id: '15512', slots: ['brake', 'motor'] })
  // `motor` comes first on the chassis, so the answer is not the part's order.
  assert.deepEqual(slotIdsFor(brake, chassis), ['motor', 'brake'])
})

test('a part that does not go on this chassis maps to no slot at all', () => {
  const single = part({ id: '15486', slots: ['motor'], specs: { motorShaft: 'single' } })
  assert.deepEqual(slotIdsFor(single, chassis), [])
  const foreign = part({
    id: '15487',
    slots: ['brake'],
    chassisCompat: { include: ['vz'], other: [], source: 'scraped' }
  })
  assert.deepEqual(slotIdsFor(foreign, chassis), [])
  assert.deepEqual(slotIdsFor(part({ id: '15488', slots: ['damper'] }), chassis), [])
})

test('BUILD_CLASSES names every class the schema records a verdict for', () => {
  const keys = Object.keys(partSchema.shape.classLegality.shape).filter(key => key !== 'source' && key !== 'notes')
  assert.deepEqual([...BUILD_CLASSES].sort(), keys.sort())
})
