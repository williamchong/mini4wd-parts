import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parse } from 'yaml'
import { CHASSIS_IDS } from '../catalog/chassis.ts'
import { layoutFor, socketsFor } from './sockets.ts'

/**
 * The slots every chassis has (data/taxonomy/slots.yml: `standard` adds only
 * counter-gear and propeller-shaft over `pro`, neither of which draws), because
 * a socket naming a slot the chassis lacks would sit there forever empty and
 * un-openable: the scene looks the slot up by id and silently skips a miss.
 */
const SLOTS = new Map<string, { mirror: boolean }>([
  ['body', { mirror: false }], ['motor', { mirror: false }], ['gear-set', { mirror: false }],
  ['terminal', { mirror: false }], ['switch', { mirror: false }], ['axle', { mirror: true }],
  ['bearing', { mirror: true }], ['wheel-front', { mirror: true }], ['wheel-rear', { mirror: true }],
  ['tire-front', { mirror: true }], ['tire-rear', { mirror: true }], ['front-stay', { mirror: false }],
  ['rear-stay', { mirror: false }], ['side-stay', { mirror: true }], ['roller-front', { mirror: true }],
  ['roller-rear', { mirror: true }], ['roller-side', { mirror: true }], ['brake', { mirror: false }],
  ['damper', { mirror: false }], ['fastener', { mirror: false }]
])

test('every socket names a slot the chassis has, and socket names are unique', () => {
  for (const id of CHASSIS_IDS) {
    const sockets = socketsFor(id)
    for (const socket of sockets) assert.ok(SLOTS.has(socket.slotId), `${id} ${socket.slotId}`)
    assert.equal(new Set(sockets.map(s => s.name)).size, sockets.length, id)
  }
})

test('every chassis shows the same fourteen slots, so the tap measurements carry over', () => {
  const ma = new Set(socketsFor('ma').map(s => s.name))
  for (const id of CHASSIS_IDS) assert.deepEqual(new Set(socketsFor(id).map(s => s.name)), ma, id)
})

test('a mirrored slot gets a -l and a -r socket at mirrored x', () => {
  for (const id of CHASSIS_IDS) {
    const sockets = socketsFor(id)
    for (const [slotId, { mirror }] of SLOTS) {
      const own = sockets.filter(s => s.slotId === slotId)
      if (!own.length || !mirror) continue
      const left = own.find(s => s.name === `${slotId}-l`)
      const right = own.find(s => s.name === `${slotId}-r`)
      assert.ok(left && right, `${id} ${slotId}`)
      assert.equal(left.position[0], -right.position[0])
      assert.deepEqual(left.position.slice(1), right.position.slice(1))
    }
  }
})

test('every tire socket sits on a wheel socket named by swapping the word', () => {
  // The scene sizes a tire from the wheel in `slot.id.replace('tire', 'wheel')`.
  for (const id of CHASSIS_IDS) {
    const sockets = socketsFor(id)
    for (const tire of sockets.filter(s => s.kind === 'tire')) {
      const wheel = sockets.find(s => s.name === tire.name.replace('tire', 'wheel'))
      assert.ok(wheel && wheel.kind === 'wheel', `${id} ${tire.name}`)
      assert.deepEqual(wheel.position, tire.position)
    }
  }
})

test('wheels sit at the record\'s wheelbase and tread, rollers outside the tires, all inside the envelope', () => {
  for (const id of CHASSIS_IDS) {
    const l = layoutFor(id)
    const at = (name: string) => socketsFor(id).find(s => s.name === name)!.position
    assert.equal(at('wheel-front-r')[2] - at('wheel-rear-r')[2], l.wheelbaseMm, `${id} wheelbase`)
    assert.equal(at('wheel-front-r')[0] * 2, l.treadFrontMm, `${id} front tread`)
    assert.equal(at('wheel-rear-r')[0] * 2, l.treadRearMm, `${id} rear tread`)
    // A ⌀13 roller's edge must clear the regulation's 105 mm width, and stay
    // on the bumper it stands on (the longest bar reaches 88; the 165 mm
    // length rule is measured with rollers, and every chassis here is drawn a
    // few millimetres long rather than measured).
    for (const socket of socketsFor(id).filter(s => s.kind === 'roller')) {
      assert.ok(Math.abs(socket.position[0]) + 6.5 <= 52.5, `${id} ${socket.name} width`)
      assert.ok(Math.abs(socket.position[2]) + 6.5 <= 88, `${id} ${socket.name} length`)
    }
    // Side rollers outboard of the wider tire (a ⌀24 wheel's tire is 9.5 mm wide).
    assert.ok(l.rollers.side - 6.5 >= Math.max(l.treadFrontMm, l.treadRearMm) / 2 + 4.75, `${id} side roller clear of the tires`)
  }
})

/**
 * The layout restates four catalog facts — wheelbase, the two treads, and
 * which way the motor lies — so the 3D chunk carries no catalog record. This
 * is what keeps the copy honest: a correction to data/chassis/*.yml that the
 * layout does not follow fails here.
 */
test('every layout agrees with the chassis record it restates', () => {
  for (const id of CHASSIS_IDS) {
    const record = parse(readFileSync(new URL(`../../content/chassis/${id}.yml`, import.meta.url), 'utf8'))
    const l = layoutFor(id)
    assert.equal(l.wheelbaseMm, record.wheelbaseMm, `${id} wheelbase`)
    assert.equal(l.treadFrontMm, record.treadFrontMm, `${id} front tread`)
    assert.equal(l.treadRearMm, record.treadRearMm, `${id} rear tread`)
    // A double-shaft PRO motor lies along the car; the single-shaft FA-130 across it.
    assert.equal(l.motor.across, record.motorShaft === 'single', `${id} motor orientation`)
    const z = l.motor.position[2]
    assert.equal(Math.sign(z), { front: 1, mid: 0, rear: -1 }[record.motorPosition as string], `${id} motor position`)
    const socket = socketsFor(id).find(s => s.kind === 'motor')!
    assert.equal(socket.rotateY, l.motor.across ? Math.PI / 2 : undefined, `${id} motor socket turned`)
  }
})

test('MA\'s sockets are where the posters and tap measurements were taken', () => {
  const at = (name: string) => socketsFor('ma').find(s => s.name === name)!.position
  assert.deepEqual(at('roller-front-r'), [37, 12, 78])
  assert.deepEqual(at('roller-side-r'), [42, 12, 0])
  assert.deepEqual(at('front-stay'), [0, 8, 72])
  assert.deepEqual(at('brake-1'), [0, 4, -68])
  assert.deepEqual(at('damper-1'), [0, 18, 62])
  assert.deepEqual(at('side-stay-r'), [38, 8, 0])
  assert.deepEqual(at('motor'), [0, 18, 0])
  assert.deepEqual(at('body'), [0, 32, 0])
})
