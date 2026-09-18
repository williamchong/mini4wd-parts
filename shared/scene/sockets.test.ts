import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { parse } from 'yaml'
import { CHASSIS_IDS } from '../catalog/chassis.ts'
import { layoutFor, socketsFor } from './sockets.ts'
import { DAMPERS, HALF_WIDTH_MM, LARGEST_ROLLER_MM, PLATES, UPPER_ROLLER_MM } from './fittings.ts'

/**
 * The slots every chassis has (data/taxonomy/slots.yml: `standard` adds only
 * counter-gear and propeller-shaft over `pro`, and only counter-gear draws), because
 * a socket naming a slot the chassis lacks would sit there forever empty and
 * un-openable: the scene looks the slot up by id and silently skips a miss.
 */
const SLOTS = new Map<string, { mirror: boolean }>([
  ['body', { mirror: false }], ['motor', { mirror: false }], ['gear-set', { mirror: false }], ['counter-gear', { mirror: false }],
  ['terminal', { mirror: false }], ['switch', { mirror: false }], ['axle', { mirror: true }],
  ['bearing', { mirror: true }], ['wheel-front', { mirror: true }], ['wheel-rear', { mirror: true }],
  ['tire-front', { mirror: true }], ['tire-rear', { mirror: true }], ['front-stay', { mirror: false }],
  ['rear-stay', { mirror: false }], ['side-stay', { mirror: true }], ['roller-front', { mirror: true }],
  ['roller-rear', { mirror: true }], ['roller-side', { mirror: true }], ['brake', { mirror: false }],
  ['damper', { mirror: false }], ['fastener', { mirror: false }], ['gear-cover', { mirror: false }],
  ['chassis-unit', { mirror: false }], ['propeller-shaft', { mirror: false }]
])

test('every socket names a slot the chassis has, and socket names are unique', () => {
  for (const id of CHASSIS_IDS) {
    const sockets = socketsFor(id)
    for (const socket of sockets) assert.ok(SLOTS.has(socket.slotId), `${id} ${socket.slotId}`)
    assert.equal(new Set(sockets.map(s => s.name)).size, sockets.length, id)
  }
})

test('every chassis shows the same slots, plus the counter gear and propeller shaft where the motor lies across, so the tap measurements carry over', () => {
  const ma = new Set(socketsFor('ma').map(s => s.name))
  for (const id of CHASSIS_IDS) {
    const expected = layoutFor(id).motor.across ? new Set([...ma, 'counter-gear', 'propeller-shaft']) : ma
    assert.deepEqual(new Set(socketsFor(id).map(s => s.name)), expected, id)
  }
})

test('a mirrored slot gets -l and -r sockets at mirrored x', () => {
  for (const id of CHASSIS_IDS) {
    const sockets = socketsFor(id)
    for (const [slotId, { mirror }] of SLOTS) {
      const own = sockets.filter(s => s.slotId === slotId)
      // An axle is one shaft across the car at each end, not a left and a right.
      if (!own.length || !mirror || slotId === 'axle') continue
      assert.ok(own.some(s => s.name === `${slotId}-l`), `${id} ${slotId}`)
      for (const left of own.filter(s => /-l(-\d+)?$/.test(s.name))) {
        const right = own.find(s => s.name === left.name.replace(/-l(-\d+)?$/, '-r$1'))
        assert.ok(right, `${id} ${left.name}`)
        assert.equal(left.position[0], -right.position[0])
        assert.deepEqual(left.position.slice(1), right.position.slice(1))
      }
    }
  }
})

test('a plate with roller holes carries its end\'s rollers; one without leaves them on the posts', () => {
  for (const id of CHASSIS_IDS) {
    const l = layoutFor(id)
    const rollers = (fit?: Parameters<typeof socketsFor>[1]) => socketsFor(id, fit).filter(s => s.slotId === 'roller-front')
    // Bolted over the bumper: the posts, exactly where no plate puts them.
    assert.deepEqual(rollers({ plates: { 'front-stay': PLATES['reinforcing']! } }), rollers())
    const wide = rollers({ plates: { 'front-stay': PLATES['wide-front']! } })
    const [x, z] = PLATES['wide-front']!.holes![0]!
    assert.deepEqual(wide.map(s => s.position), [[-x, 12, l.stayZ + z], [x, 12, l.stayZ + z]], `${id} wide`)
    // A double-roller stay: an upper and a lower pair, all opening the rear roller picker.
    const double = socketsFor(id, { plates: { 'rear-stay': PLATES['rear-double-roller']! } }).filter(s => s.slotId === 'roller-rear')
    assert.deepEqual(double.map(s => s.name), ['roller-rear-l', 'roller-rear-r', 'roller-rear-l-2', 'roller-rear-r-2'], id)
    assert.equal(double[2]!.position[1] - double[0]!.position[1], UPPER_ROLLER_MM, `${id} upper tier`)
    assert.ok(double.every(s => s.position[2] < 0), `${id}: rear rollers at the rear`)
  }
})

// The side posts are the chassis' own and no plate moves them; the test above holds them to a 13 mm roller.
test('with every plate on every chassis, a 19 mm front or rear roller stays inside 105 mm', () => {
  for (const id of CHASSIS_IDS) {
    for (const [plateId, plate] of Object.entries(PLATES)) {
      if (plate.side) continue
      const fitted = socketsFor(id, { plates: { 'front-stay': plate, 'rear-stay': plate } })
      for (const socket of fitted.filter(s => s.slotId === 'roller-front' || s.slotId === 'roller-rear')) {
        assert.ok(Math.abs(socket.position[0]) + LARGEST_ROLLER_MM / 2 <= HALF_WIDTH_MM, `${id} ${plateId} ${socket.name} at x ${socket.position[0]}`)
      }
    }
  }
})

test('each damper-slot part has a socket at its own mount, the rear first', () => {
  const ma = (mounts: Parameters<typeof socketsFor>[1]) => socketsFor('ma', mounts).filter(s => s.slotId === 'damper')
  const one = ma({ dampers: [DAMPERS['mass-damper']!.mount] })
  assert.deepEqual(one.map(s => [s.name, s.entry, Math.sign(s.position[2])]), [['damper-1', 0, -1]])
  // A mass damper at each end, then a stabiliser pair at the rear corners and side weights either side.
  const four = ma({ dampers: ['end', 'end', 'corner', 'side'] })
  assert.deepEqual(four.map(s => s.name), ['damper-1', 'damper-2', 'damper-3-l', 'damper-3-r', 'damper-4-l', 'damper-4-r'])
  assert.deepEqual(four.map(s => s.entry), [0, 1, 2, 2, 3, 3])
  assert.ok(four[0]!.position[2] < 0 && four[1]!.position[2] > 0, 'ends: rear, then front')
  const [left, right] = [four[2]!, four[3]!]
  assert.equal(left.position[0], -right.position[0])
  assert.ok(right.position[0] > 20 && right.position[2] < -60, 'a corner pair stands at the rear rollers')
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
