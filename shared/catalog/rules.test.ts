import assert from 'node:assert/strict'
import { test } from 'node:test'
import { checkBuild } from './rules.ts'
import type { BuildCheck } from './rules.ts'
import type { ResolvedSlot } from './build.ts'
import type { Part, PartLegality } from './schema.ts'

type CheckPart = Pick<Part, 'chassisCompat' | 'classLegality' | 'specs'>

const part = (over: {
  include?: Part['chassisCompat']['include']
  junior?: PartLegality
  open?: PartLegality
  shaft?: 'single' | 'double'
} = {}): CheckPart => ({
  chassisCompat: { include: over.include ?? [], other: [], source: 'scraped' },
  classLegality: {
    open: over.open ?? 'legal',
    stockBmax: over.open ?? 'legal',
    junior: over.junior ?? 'legal',
    source: 'override'
  },
  specs: over.shaft ? { motorShaft: over.shaft } : {}
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

const partsById = new Map<string, CheckPart>([
  ['15375', part({ shaft: 'double', include: ['ma', 'ms'], junior: 'illegal' })], // Hyper-Dash PRO
  ['15477', part({ shaft: 'single', include: ['vz', 'ar'], junior: 'illegal' })], // Hyper-Dash 3
  ['15489', part({ shaft: 'double', include: ['ma', 'ms'] })], // Atomic-Tuned 2 PRO
  ['15186', part({ shaft: 'single', open: 'illegal', junior: 'illegal' })], // Plasma-Dash
  ['15392', part({ include: ['vz'] })],
  ['15340', part({ open: 'unknown', junior: 'unknown' })]
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
