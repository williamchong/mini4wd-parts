import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkBuild, isLargeTire, LARGE_TIRE_MM } from './rules.ts'
import type { BuildCheck } from './rules.ts'
import type { ResolvedSlot } from './build.ts'
import type { Part, PartLegality } from './schema.ts'
import { TIRES } from '../scene/wheels.ts'

type CheckPart = Pick<Part, 'chassisCompat' | 'classLegality' | 'specs' | 'smallArches'>

const part = (over: {
  include?: Part['chassisCompat']['include']
  junior?: PartLegality
  open?: PartLegality
  shaft?: 'single' | 'double'
  tireMm?: number
  smallArches?: true
} = {}): CheckPart => ({
  chassisCompat: { include: over.include ?? [], other: [], source: 'scraped' },
  classLegality: {
    open: over.open ?? 'legal',
    stockBmax: over.open ?? 'legal',
    junior: over.junior ?? 'legal',
    source: 'override'
  },
  specs: { ...(over.shaft && { motorShaft: over.shaft }), ...(over.tireMm && { tireDiameterMm: over.tireMm }) },
  ...(over.smallArches && { smallArches: true })
})

const slot = (id: string, type: ResolvedSlot['type'], partIds: string[] | 'label', required = true): ResolvedSlot => ({
  id,
  type,
  maxCount: 2,
  mirror: false,
  required,
  entries: partIds === 'label'
    ? [{ label: { en: 'Kit standard' }, origin: 'chassis' }]
    : partIds.map(partId => ({ partId, origin: 'user' as const })),
  swapped: partIds !== 'label'
})

/** A row still holding what the box put there, named by the wiki's phrase. */
const boxed = (id: string, type: ResolvedSlot['type'], en: string): ResolvedSlot => ({
  ...slot(id, type, []),
  entries: [{ label: { en }, origin: 'kit' }]
})

const partsById = new Map<string, CheckPart>([
  ['15375', part({ shaft: 'double', include: ['ma', 'ms'], junior: 'illegal' })], // Hyper-Dash PRO
  ['15477', part({ shaft: 'single', include: ['vz', 'ar'], junior: 'illegal' })], // Hyper-Dash 3
  ['15489', part({ shaft: 'double', include: ['ma', 'ms'] })], // Atomic-Tuned 2 PRO
  ['15186', part({ shaft: 'single', open: 'illegal', junior: 'illegal' })], // Plasma-Dash
  ['15392', part({ include: ['vz'] })],
  ['15340', part({ open: 'unknown', junior: 'unknown' })],
  ['15365', part({ tireMm: 31 })], // Large Dia. Hard Slick Tires
  ['15429', part({ tireMm: 26 })], // a small low-profile set
  ['15447', part({ smallArches: true })], // Tridagger XX clear body
  ['15496', part()] // Avante Jr. clear body, which runs between its wheels
])

const check = (slots: ResolvedSlot[], over: Partial<BuildCheck> = {}) => checkBuild({
  slots,
  chassis: { id: 'ma', motorShaft: 'double' },
  partsById,
  buildClass: 'open',
  ...over
})

const stock = [slot('body', 'body', 'label'), slot('gear-set', 'gear', 'label')]

test('a stock build with labels only has nothing to say', () => {
  assert.deepEqual(check(stock), [])
})

test('a Dash motor is fine in Open and Stock Class and an error in Junior', () => {
  const slots = [...stock, slot('motor', 'motor', ['15375'])]
  assert.deepEqual(check(slots), [])
  assert.deepEqual(check(slots, { buildClass: 'stockBmax' }), [])
  assert.deepEqual(check(slots, { buildClass: 'junior' }), [
    { rule: 'class-illegal', severity: 'error', slotId: 'motor', partId: '15375' }
  ])
  assert.deepEqual(check([...stock, slot('motor', 'motor', ['15489'])], { buildClass: 'junior' }), [])
})

test('a single-shaft motor on a PRO chassis is one shaft error, not a chassis error as well', () => {
  assert.deepEqual(check([...stock, slot('motor', 'motor', ['15477'])]), [
    { rule: 'motor-shaft', severity: 'error', slotId: 'motor', partId: '15477' }
  ])
})

test('a part Tamiya does not list for this chassis is a chassis error', () => {
  assert.deepEqual(check([...stock, slot('roller-front', 'roller-front', ['15392'])]), [
    { rule: 'chassis-incompatible', severity: 'error', slotId: 'roller-front', partId: '15392' }
  ])
})

test('an empty body is a warning and any other empty required slot an error', () => {
  const slots = [
    slot('body', 'body', []),
    slot('motor', 'motor', []),
    slot('brake', 'brake', [], false)
  ]
  assert.deepEqual(check(slots), [
    { rule: 'required-empty', severity: 'error', slotId: 'motor' },
    { rule: 'required-empty', severity: 'warning', slotId: 'body' }
  ])
})

test('findings sort by severity, then by list order, and a doubled part is reported once', () => {
  const slots = [
    slot('body', 'body', []),
    slot('damper', 'damper', ['15340', '15340'], false),
    slot('motor', 'motor', ['15186']),
    slot('roller-front', 'roller-front', ['15392'])
  ]
  assert.deepEqual(check(slots, { linkTrimmed: true }), [
    // Plasma-Dash is single-shaft as well as illegal: two different problems.
    { rule: 'motor-shaft', severity: 'error', slotId: 'motor', partId: '15186' },
    { rule: 'class-illegal',severity: 'error', slotId: 'motor', partId: '15186' },
    { rule: 'chassis-incompatible', severity: 'error', slotId: 'roller-front', partId: '15392' },
    { rule: 'required-empty', severity: 'warning', slotId: 'body' },
    { rule: 'link-trimmed', severity: 'note' },
    { rule: 'class-unknown', severity: 'note', slotId: 'damper', partId: '15340' }
  ])
})

test('an item number the catalog does not ship is skipped, not a crash', () => {
  assert.deepEqual(check([...stock, slot('motor', 'motor', ['99999'])]), [])
})

test('a body boxed on small tires notes large ones once, on the body row', () => {
  const kit = { smallArches: true } as const
  const body = boxed('body', 'body', 'Raikiri')
  const small = [boxed('tire-front', 'tire-front', 'Small Low-Profile Slick'), boxed('tire-rear', 'tire-rear', 'Small Low-Profile Slick')]
  const note = [{ rule: 'body-tire-size', severity: 'note', slotId: 'body' }]

  assert.deepEqual(check([body, ...small], { kit }), [])
  assert.deepEqual(check([body, slot('tire-front', 'tire-front', ['15429']), small[1]!], { kit }), [])
  assert.deepEqual(check([body, slot('tire-front', 'tire-front', ['15365']), small[1]!], { kit }), note)
  assert.deepEqual(check([body, slot('tire-front', 'tire-front', ['15365']), slot('tire-rear', 'tire-rear', ['15365'])], { kit }), note)
  // The same tires under a body that runs between its wheels, or on no kit at all.
  assert.deepEqual(check([body, slot('tire-front', 'tire-front', ['15365'])], { kit: {} }), [])
  assert.deepEqual(check([body, slot('tire-front', 'tire-front', ['15365'])]), [])
})

test('a body part carries the note onto a car whose stock tires are large', () => {
  const large = boxed('tire-front', 'tire-front', 'Large Avante-Type Slick')
  const shaped: ResolvedSlot = { ...slot('tire-rear', 'tire-rear', []), entries: [{ shape: 'large-arched', origin: 'chassis' }] }
  const note = [{ rule: 'body-tire-size', severity: 'note', slotId: 'body' }]

  assert.deepEqual(check([slot('body', 'body', ['15447']), large]), note)
  assert.deepEqual(check([slot('body', 'body', ['15447']), shaped]), note)
  assert.deepEqual(check([slot('body', 'body', ['15447']), boxed('tire-front', 'tire-front', 'Small X Narrow-Type')]), [])
  // The kit's own body left the car with the swap, and its flag with it.
  assert.deepEqual(check([slot('body', 'body', ['15496']), large], { kit: { smallArches: true } }), [])
})

test('a stock tire names its size class in its first word, as the shape table has it in millimetres', () => {
  for (const [shape, row] of Object.entries(TIRES)) {
    assert.equal(isLargeTire({ shape }, partsById), row.diameterMm >= LARGE_TIRE_MM, shape)
  }
})
