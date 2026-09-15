import assert from 'node:assert/strict'
import { test } from 'node:test'
import { CHASSIS_IDS } from '../catalog/schema.ts'
import { SCENE_CHASSIS } from './chassis.ts'
import { socketsFor } from './sockets.ts'

/**
 * The slot profile MA actually has (data/taxonomy/slots.yml, `pro`), because a
 * socket naming a slot the chassis lacks would sit there forever empty and
 * un-openable: the scene looks the slot up by id and silently skips a miss.
 */
const MA_SLOTS = new Map<string, { mirror: boolean }>([
  ['body', { mirror: false }], ['motor', { mirror: false }], ['gear-set', { mirror: false }],
  ['terminal', { mirror: false }], ['switch', { mirror: false }], ['axle', { mirror: true }],
  ['bearing', { mirror: true }], ['wheel-front', { mirror: true }], ['wheel-rear', { mirror: true }],
  ['tire-front', { mirror: true }], ['tire-rear', { mirror: true }], ['front-stay', { mirror: false }],
  ['rear-stay', { mirror: false }], ['side-stay', { mirror: true }], ['roller-front', { mirror: true }],
  ['roller-rear', { mirror: true }], ['roller-side', { mirror: true }], ['brake', { mirror: false }],
  ['damper', { mirror: false }], ['fastener', { mirror: false }]
])

test('every MA socket names a slot MA has, and socket names are unique', () => {
  const sockets = socketsFor('ma')
  assert.ok(sockets)
  for (const socket of sockets) assert.ok(MA_SLOTS.has(socket.slotId), socket.slotId)
  assert.equal(new Set(sockets.map(s => s.name)).size, sockets.length)
})

test('a mirrored slot gets a -l and a -r socket at mirrored x', () => {
  const sockets = socketsFor('ma')!
  for (const [slotId, { mirror }] of MA_SLOTS) {
    const own = sockets.filter(s => s.slotId === slotId)
    if (!own.length || !mirror) continue
    const left = own.find(s => s.name === `${slotId}-l`)
    const right = own.find(s => s.name === `${slotId}-r`)
    assert.ok(left && right, slotId)
    assert.equal(left.position[0], -right.position[0])
    assert.deepEqual(left.position.slice(1), right.position.slice(1))
  }
})

test('every tire socket sits on a wheel socket named by swapping the word', () => {
  // The scene sizes a tire from the wheel in `slot.id.replace('tire', 'wheel')`.
  const sockets = socketsFor('ma')!
  for (const tire of sockets.filter(s => s.kind === 'tire')) {
    const wheel = sockets.find(s => s.name === tire.name.replace('tire', 'wheel'))
    assert.ok(wheel && wheel.kind === 'wheel', tire.name)
    assert.deepEqual(wheel.position, tire.position)
  }
})

test('the chassis the page reserves a pane for are exactly those with a table', () => {
  for (const id of CHASSIS_IDS) {
    assert.equal(SCENE_CHASSIS.has(id), socketsFor(id) !== undefined, id)
  }
})
