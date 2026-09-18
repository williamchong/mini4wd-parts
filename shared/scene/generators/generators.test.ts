import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Box3, Vector3 } from 'three'
import type { BufferAttribute, BufferGeometry } from 'three'
import { CHASSIS_IDS } from '../../catalog/chassis.ts'
import { DEFAULT_SILHOUETTE } from '../bodies.ts'
import { AXLE_Z, bodyGeometry, FLOOR_MM } from './body.ts'
import { BLACK, chassisPieces, STEEL } from './chassis.ts'
import { layoutFor, socketsFor } from '../sockets.ts'
import { DEFAULT_TIRE, DEFAULT_WHEEL, TIRES, WHEELS } from '../wheels.ts'
import { AXLES, BEARINGS, BRAKES, CHASSIS_UNITS, DAMPERS, PLATES, PROPELLERS, ROLLERS } from '../fittings.ts'
import { plate, Triangles } from './mesh.ts'
import { counterGear, GEAR_GROUPS, gearSet, motor, MOTOR_GROUPS, motorPaints, tire, wheel } from './parts.ts'
import * as fittings from './fittings.ts'
import type { MotorGroup, Paint, Rotor } from './parts.ts'

const size = (geometry: BufferGeometry) => {
  geometry.computeBoundingBox()
  return geometry.boundingBox!.getSize(new Vector3())
}

/** Each draw group of a grouped geometry as a geometry of its own, to test one piece at a time. */
function piecesOf(geometry: BufferGeometry): BufferGeometry[] {
  const position = geometry.getAttribute('position')
  const p = new Vector3()
  return geometry.groups.map(group => {
    const piece = new Triangles()
    const points: [number, number, number][] = []
    for (let i = group.start; i < group.start + group.count; i++) points.push(p.fromBufferAttribute(position, i).toArray())
    for (let i = 0; i < points.length; i += 3) piece.tri(points[i]!, points[i + 1]!, points[i + 2]!)
    return piece.geometry()
  })
}

const near = (actual: number, expected: number, message: string) =>
  assert.ok(Math.abs(actual - expected) < 0.01, `${message}: ${actual} ≠ ${expected}`)

/**
 * The signed volume of a closed, non-indexed mesh by the divergence theorem:
 * positive when every face winds outward, which is what lighting and
 * back-face culling need, and negative or near zero when some are inside out.
 */
function signedVolume(geometry: BufferGeometry): number {
  const p = geometry.getAttribute('position')
  const a = new Vector3(); const b = new Vector3(); const c = new Vector3()
  let volume = 0
  for (let i = 0; i < p.count; i += 3) {
    a.fromBufferAttribute(p, i); b.fromBufferAttribute(p, i + 1); c.fromBufferAttribute(p, i + 2)
    volume += a.dot(b.clone().cross(c)) / 6
  }
  return volume
}

test('a box, a prism and a plate wind outward', () => {
  const t = new Triangles()
  t.box(-1, -2, -3, 1, 2, 3)
  near(signedVolume(t.geometry()), 2 * 4 * 6, 'box volume')
  near(signedVolume(plate([[0, 0], [0, 2], [3, 2], [3, 0]], 0, 1)), 6, 'plate volume')
})

test('every roller row is its diameter across, a ring standing proud of it, and winds outward', () => {
  for (const [id, shape] of Object.entries(ROLLERS)) {
    for (const mm of [9, 13, 19]) {
      const geometry = fittings.roller(shape, mm)
      const s = size(geometry)
      near(s.x, s.z, `${id} ⌀${mm} is round`)
      assert.ok(s.x >= mm - 0.01 && s.x <= mm + 2 * (shape.ringMm ?? 0) + 0.01, `${id} ⌀${mm} is ${s.x} across`)
      assert.ok(signedVolume(geometry) > 0, `${id} ⌀${mm} outward`)
      assert.equal(geometry.groups.length > 0, true, id)
    }
  }
  // A double roller is two tiers: the lower smaller by the row's step.
  const double = fittings.roller(ROLLERS['aluminium-double']!, 13)
  double.computeBoundingBox()
  const p = double.getAttribute('position')
  let lowest = 0
  for (let i = 0; i < p.count; i++) if (p.getY(i) < -1) lowest = Math.max(lowest, Math.hypot(p.getX(i), p.getZ(i)))
  near(lowest, 6, 'the lower tier of a 13-12 is ⌀12')
})

test('a wheel is its shape\'s diameter tall and its width wide, and spins about x', () => {
  for (const [id, shape] of Object.entries(WHEELS)) {
    const s = size(wheel(shape))
    near(s.y, shape.diameterMm, `${id} y`); near(s.z, shape.diameterMm, `${id} z`)
    // Plus the axle stub, which stands 1 mm proud of each face.
    near(s.x, shape.widthMm + 2, `${id} width`)
  }
})

test('a tire is its own diameter, whatever wheel it is seated on', () => {
  const shape = TIRES[DEFAULT_TIRE]!
  // Every rim a ⌀26 tire is actually sold to fit; a larger one is the
  // mismatched pair the next test covers.
  for (const rim of ['small', 'small-low-profile-dish-type'] as const) {
    const s = size(tire(shape, WHEELS[rim]!))
    near(s.y, shape.diameterMm, `on ${rim}`); near(s.z, shape.diameterMm, `on ${rim}`)
  }
  // Its own width, since every rim is authored narrower than its tire.
  near(size(tire(shape, WHEELS[DEFAULT_WHEEL]!)).x, shape.widthMm, 'width')
})

test('every tire clears the wheel it seats on, even a mismatched pair', () => {
  for (const [id, shape] of Object.entries(TIRES)) {
    // A ⌀26.5 low-profile rim under a ⌀24 tire is representable and wrong; the
    // shape has to stay a ring rather than turn itself inside out.
    for (const rim of ['small', 'large-low-profile-6-spoke'] as const) {
      const wheel = WHEELS[rim]!
      const geometry = tire(shape, wheel)
      assert.ok(signedVolume(geometry) > 0, `${id} on ${rim} winds outward`)
      assert.ok(size(geometry).y >= wheel.diameterMm, `${id} on ${rim} is no smaller than its wheel`)
      assert.ok(size(geometry).x > wheel.widthMm, `${id} covers the ${rim} rim's width`)
    }
  }
})

test('every plate row lies on top of its socket, either end, winds outward and stays inside 105 mm', () => {
  for (const [id, shape] of Object.entries(PLATES)) {
    for (const t of [1.5, 3]) {
      for (const end of [1, -1] as const) {
        const geometry = fittings.plate(shape, t, end)
        assert.ok(signedVolume(geometry) > 0, `${id} ${t} mm outward at ${end}`)
        geometry.computeBoundingBox()
        const box = geometry.boundingBox!
        // Only a deck authored below — a brake tab, an under guard — reaches under the bumper.
        if (!shape.layers?.some(deck => deck.y < 1)) near(box.min.y, 1, `${id} on the bumper`)
        assert.ok(box.min.x >= -52.5 && box.max.x <= 52.5, `${id} within 105 mm`)
        // A plate faces the end it is on: its widest point, where the rollers go, is out past the socket.
        if (!shape.side) {
          const p = geometry.getAttribute('position')
          let widest = 0
          for (let i = 0; i < p.count; i++) if (Math.abs(p.getX(i)) > Math.abs(p.getX(widest))) widest = i
          assert.ok(p.getZ(widest) * end > 0, `${id} faces out at ${end}`)
        }
      }
    }
  }
  near(size(fittings.plate(PLATES['default']!, 2, 1)).y, 2, 'thickness')
})

test('every other fitting row winds outward', () => {
  const rows: [string, BufferGeometry][] = [
    ...Object.entries(DAMPERS).map(([id, shape]) => [`damper ${id}`, fittings.damper(shape)] as [string, BufferGeometry]),
    ...Object.entries(BRAKES).map(([id, shape]) => [`brake ${id}`, fittings.brake(shape)] as [string, BufferGeometry]),
    ...Object.entries(AXLES).map(([id, shape]) => [`axle ${id}`, fittings.axle(shape, 60)] as [string, BufferGeometry]),
    ...Object.entries(BEARINGS).map(([id, shape]) => [`bearing ${id}`, fittings.bearing(shape)] as [string, BufferGeometry]),
    ...Object.entries(PROPELLERS).map(([id, shape]) => [`propeller ${id}`, fittings.propellerShaft(shape, 64)] as [string, BufferGeometry]),
    ...Object.entries(CHASSIS_UNITS).filter(([, shape]) => shape.piece).map(([id, shape]) => [`unit ${id}`, fittings.chassisUnit(shape)] as [string, BufferGeometry])
  ]
  for (const [name, geometry] of rows) assert.ok(signedVolume(geometry) > 0, name)
  // An axle spans what it is told, turning about x.
  near(size(fittings.axle(AXLES['round']!, 59.5)).x, 59.5, 'axle span')
})

test('every revolved part winds outward', () => {
  for (const [name, geometry] of [['wheel', wheel(WHEELS[DEFAULT_WHEEL]!)], ['tire', tire(TIRES[DEFAULT_TIRE]!, WHEELS[DEFAULT_WHEEL]!)], ['motor', motor()], ['single-shaft motor', motor(1)]] as const) {
    assert.ok(signedVolume(geometry) > 0, name)
  }
})

test('a motor is a flat-sided can, one draw group per piece, each winding outward', () => {
  for (const shafts of [1, 2] as const) {
    const geometry = motor(shafts)
    const s = size(geometry)
    // A 20.1 mm can, and the vents standing a little proud of its sides.
    assert.ok(s.x > 20.1 && s.x < 21, `width ${s.x}`)
    // The flats are 15.1 mm apart; the clip and the terminal tabs stand above the top one.
    assert.ok(s.y > 15 && s.y < 20, `height ${s.y}`)
    geometry.computeBoundingBox()
    // The bottom flat, with the crimp lip standing 0.15 mm proud of it.
    assert.ok(Math.abs(geometry.boundingBox!.min.y + 7.6) < 0.15, `bottom flat ${geometry.boundingBox!.min.y}`)
    assert.equal(geometry.groups.length, MOTOR_GROUPS.length, `${shafts}: groups`)
    const position = geometry.getAttribute('position')
    let covered = 0
    const pieces = piecesOf(geometry)
    for (const [index, group] of geometry.groups.entries()) {
      assert.equal(group.start, covered, 'groups are contiguous')
      covered += group.count
      assert.ok(group.count > 0, `${MOTOR_GROUPS[group.materialIndex!]} has triangles`)
      assert.ok(signedVolume(pieces[index]!) > 0, `${shafts}: ${MOTOR_GROUPS[group.materialIndex!]} outward`)
    }
    assert.equal(covered, position.count, 'every triangle is in a group')
  }
  // The PRO shaft leaves both ends; the FA-130's only the front.
  const single = motor(1); single.computeBoundingBox()
  const double = motor(2); double.computeBoundingBox()
  assert.ok(double.boundingBox!.min.z < single.boundingBox!.min.z - 5, 'a second shaft out of the end bell')
  near(double.boundingBox!.max.z, single.boundingBox!.max.z, 'the same front shaft')
})

test('a motor is painted by its end bell and sticker, and a bare can hides its sticker', () => {
  const stickered = motorPaints({ cap: 0xec7a24, sticker: 0x2fa8d8 })
  const at = (paints: Paint[], group: MotorGroup) => paints[MOTOR_GROUPS.indexOf(group)]!
  assert.equal(stickered.length, MOTOR_GROUPS.length)
  assert.equal(at(stickered, 'cap').colour, 0xec7a24)
  assert.equal(at(stickered, 'sticker').colour, 0x2fa8d8)
  assert.notEqual(at(stickered, 'print').colour, at(stickered, 'sticker').colour)
  // Dark print on a light sticker, light print on a dark one.
  assert.ok(at(motorPaints({ cap: 0, sticker: 0xf0f0ee }), 'print').colour < 0x404040)
  assert.ok(at(motorPaints({ cap: 0, sticker: 0x232427 }), 'print').colour > 0xc0c0c0)
  const bare = motorPaints({ cap: 0xeef0f2 })
  assert.equal(at(bare, 'sticker').colour, at(bare, 'can').colour)
  assert.equal(at(bare, 'print').colour, at(bare, 'can').colour)
  assert.equal(at(motorPaints({ cap: 0, sticker: 0, can: 0xc9b47a }), 'can').colour, 0xc9b47a)
})

test('the fixed-size parts have plausible extents', () => {
  const m = size(motor())
  assert.ok(m.z > m.x && m.z > m.y, 'a motor lies along the car')
  assert.ok(size(fittings.brake(BRAKES['brake-set']!)).x > size(fittings.brake(BRAKES['brake-set']!)).y, 'a brake is flat')
  assert.ok(size(fittings.damper(DAMPERS['stabilizer-pole']!)).y > size(fittings.damper(DAMPERS['stabilizer-pole']!)).x, 'a pole stands up')
  // An end-mounted mass damper is a pair across the car; a side one is one block.
  assert.ok(size(fittings.damper(DAMPERS['mass-damper']!)).x > 30, 'a pair across the end')
  near(size(fittings.damper(DAMPERS['side-mass-damper']!)).x, DAMPERS['side-mass-damper']!.w, 'one at a side')
})

test('a body loft spans its hull, floor FLOOR_MM below the socket, every face outward', () => {
  const geometry = bodyGeometry(DEFAULT_SILHOUETTE)
  geometry.computeBoundingBox()
  const box = geometry.boundingBox!
  near(box.min.z, -64, 'tail'); near(box.max.z, 64, 'nose')
  near(box.min.y, -FLOOR_MM, 'floor'); near(box.max.y, 25 - FLOOR_MM, 'roof')
  near(box.max.x, 37, 'widest')
  assert.ok(signedVolume(geometry) > 0, 'hull outward')
})

test('pods and a wing add to the volume, so they wind outward too', () => {
  const hull = signedVolume(bodyGeometry(DEFAULT_SILHOUETTE))
  const pods = [{ x: 29, stations: [[20, 6, 10, 2], [60, 6, 10, 2]] as const }]
  const withPods = signedVolume(bodyGeometry({ ...DEFAULT_SILHOUETTE, pods }))
  // Two pods of a 6-cornered section, 40 long: well over the hull alone.
  assert.ok(withPods > hull + 2 * 40 * 8 * 6, `pods add volume: ${withPods - hull}`)
  const wing = { z: -60, halfWidth: 40, height: 34, chord: 12, pylons: 14 }
  const winged = bodyGeometry({ ...DEFAULT_SILHOUETTE, wing })
  assert.ok(signedVolume(winged) > hull, 'wing adds volume')
  winged.computeBoundingBox()
  near(winged.boundingBox!.max.y, 35.5 - FLOOR_MM, 'wing top'); near(winged.boundingBox!.max.x, 40, 'wing span')
})

test('an arch lifts the flank over its axle and nowhere else, and takes volume away', () => {
  const hull = [[-60, 36, 6, 30, 20], [60, 36, 6, 30, 20]] as const
  const plain = bodyGeometry({ hull })
  const arched = bodyGeometry({ hull, arches: [15, 0] })
  assert.ok(signedVolume(arched) > 0, 'still outward')
  assert.ok(signedVolume(arched) < signedVolume(plain), 'the arch is cut out')
  // The lowest point on the outer flank at the front axle is the arch's crown.
  const p = arched.getAttribute('position')
  let crown = Infinity
  let rearFlank = Infinity
  for (let i = 0; i < p.count; i++) {
    if (Math.abs(p.getX(i)) < 35) continue
    if (Math.abs(p.getZ(i) - AXLE_Z) < 0.01) crown = Math.min(crown, p.getY(i) + FLOOR_MM)
    if (Math.abs(p.getZ(i) + AXLE_Z) < 1) rearFlank = Math.min(rearFlank, p.getY(i) + FLOOR_MM)
  }
  near(crown, 13, 'crown: radius less the axle below the floor')
  assert.equal(rearFlank, Infinity, 'no section added at the rear axle, which has no arch')
})
test('every chassis winds outward, stays inside the regulation envelope and under the triangle budget', () => {
  for (const id of CHASSIS_IDS) {
    const pieces = chassisPieces(id)
    assert.ok(pieces.length >= 3, id)
    let triangles = 0
    for (const piece of pieces) {
      assert.ok(signedVolume(piece.geometry) > 0, `${id} piece outward`)
      triangles += piece.geometry.getAttribute('position').count / 3
      piece.geometry.computeBoundingBox()
      const box = piece.geometry.boundingBox!
      assert.ok(box.min.x >= -52.5 && box.max.x <= 52.5, `${id} within 105 mm`)
      assert.ok(box.min.z >= -95 && box.max.z <= 95, `${id} within the length a bumper reaches`)
      assert.ok(box.min.y >= 0, `${id} on the ground`)
    }
    // §5.6: 1–2k triangles is the budget; past that nothing shows under a shell.
    assert.ok(triangles <= 2000, `${id}: ${triangles} triangles`)
  }
})

test('a chassis whose motor lies across the car has a propeller shaft socket; a PRO chassis does not', () => {
  for (const id of CHASSIS_IDS) {
    const socket = socketsFor(id).find(s => s.kind === 'propeller-shaft')
    assert.equal(!!socket, layoutFor(id).motor.across, id)
    // Between the crown gears, which stand 8 mm inside each axle.
    if (socket) assert.equal(socket.span, layoutFor(id).wheelbaseMm - 16, id)
    assert.ok(!chassisPieces(id).some(p => p.colour === STEEL), `${id}: the shaft is the socket's now, not the chassis'`)
  }
})

test('each end\'s bumper is a piece of its own, carrying that end\'s roller posts, so a bumperless unit can take it away', () => {
  for (const id of CHASSIS_IDS) {
    const pieces = chassisPieces(id)
    for (const end of [1, -1] as const) {
      const bumper = pieces.filter(piece => piece.end === end)
      assert.equal(bumper.length, 1, `${id} ${end}`)
      assert.equal(bumper[0]!.role, id === 'ms' ? 'ends' : 'frame', `${id} ${end}: moulded with the ${id === 'ms' ? 'unit' : 'frame'}`)
      const box = bumper[0]!.geometry.boundingBox ?? (bumper[0]!.geometry.computeBoundingBox(), bumper[0]!.geometry.boundingBox!)
      assert.ok(end > 0 ? box.min.z > 50 : box.max.z < -50, `${id} ${end}: out at its end`)
      assert.ok(box.max.y > 12.9, `${id} ${end}: posts included`)
    }
  }
})

test('every roller socket has a post under it', () => {
  const p = new Vector3()
  for (const id of CHASSIS_IDS) {
    // The front and rear posts stand on the bumpers, which are an MS chassis' nose and tail units.
    const moulded = chassisPieces(id).filter(piece => piece.role === 'frame' || piece.role === 'ends')
      .map(piece => piece.geometry.getAttribute('position'))
    for (const socket of socketsFor(id).filter(s => s.kind === 'roller')) {
      const [x, , z] = socket.position
      let found = false
      for (const position of moulded) {
        for (let i = 0; i < position.count && !found; i++) {
          p.fromBufferAttribute(position, i)
          found = Math.abs(p.x - x) < 2.5 && Math.abs(p.z - z) < 2.5 && p.y > 12.9
        }
      }
      assert.ok(found, `${id} ${socket.name} has no post`)
    }
  }
})

test('a chassis is drawn in the mouldings a kit colours, black until one does', () => {
  for (const id of CHASSIS_IDS) {
    const pieces = chassisPieces(id)
    const roles = pieces.map(piece => piece.role)
    const keys = pieces.map(piece => `${piece.role}:${piece.end ?? 0}`)
    assert.equal(new Set(keys).size, keys.length, `${id}: one piece per role, and per end for a bumper`)
    assert.ok(roles.includes('frame') && roles.includes('aParts'), id)
    // Only MS is three units; every other frame carries its own bumpers.
    assert.equal(roles.includes('ends'), id === 'ms', id)
    for (const piece of pieces.filter(piece => ['frame', 'ends', 'aParts', 'switch'].includes(piece.role))) {
      assert.equal(piece.colour, BLACK, `${id} ${piece.role}`)
    }
  }
})

test('every chassis has one switch slider, a piece of its own so it can slide on', () => {
  for (const id of CHASSIS_IDS) {
    const slider = chassisPieces(id).filter(piece => piece.role === 'switch')
    assert.equal(slider.length, 1, id)
    const s = size(slider[0]!.geometry)
    assert.ok(s.x === 8 && s.y === 4 && s.z === 12, `${id}: one slider, not a sprue (${s.toArray()})`)
  }
})

/** A rotor's geometry back where its socket draws it, with its pivot added back. */
const placed = (rotor: Rotor) => rotor.geometry.clone().translate(...rotor.pivot)

/** The bounding box of a whole train, as its socket draws it. */
function assembled(rotors: readonly Rotor[]): Box3 {
  const box = new Box3()
  for (const rotor of rotors) box.union(new Box3().setFromBufferAttribute(placed(rotor).getAttribute('position') as BufferAttribute))
  return box
}

const AXES = { x: new Vector3(1, 0, 0), z: new Vector3(0, 0, 1) }
/** A rotor's angular velocity per unit of axle speed, in its socket's frame. */
const spinOf = (rotor: Rotor) => AXES[rotor.axis].clone().multiplyScalar(rotor.rate)
/** How fast a point on a rotor moves, in its socket's frame. */
const velocityAt = (rotor: Rotor, point: Vector3) => spinOf(rotor).cross(point.clone().sub(new Vector3(...rotor.pivot)))

/** Where two gears touch: halfway between the nearest pair of their vertices. */
function contact(a: Rotor, b: Rotor): Vector3 {
  const pa = placed(a).getAttribute('position')
  const pb = placed(b).getAttribute('position')
  const u = new Vector3(); const v = new Vector3()
  let best = Infinity
  const at = new Vector3()
  for (let i = 0; i < pa.count; i++) {
    u.fromBufferAttribute(pa, i)
    for (let j = 0; j < pb.count; j++) {
      const d = u.distanceToSquared(v.fromBufferAttribute(pb, j))
      if (d < best) {
        best = d
        at.copy(u).add(v).multiplyScalar(0.5)
      }
    }
  }
  return at
}

const named = (rotors: readonly Rotor[], name: Rotor['name']) => rotors.find(rotor => rotor.name === name)!

/**
 * Two gears in mesh: at the point they touch both surfaces move the same way,
 * and teeth leave one exactly as fast as they arrive at the other. Tooth
 * counts are the ones the generator draws, so a rate that drifts from them is
 * teeth sliding through each other on screen.
 */
function assertMeshes(label: string, [a, teethA]: [Rotor, number], [b, teethB]: [Rotor, number]) {
  const at = contact(a, b)
  const va = velocityAt(a, at); const vb = velocityAt(b, at)
  assert.ok(va.dot(vb) > 0.5 * va.length() * vb.length(), `${label}: ${a.name} and ${b.name} move together where they touch`)
  near(Math.abs(a.rate) * teethA, Math.abs(b.rate) * teethB, `${label}: ${a.name}–${b.name} teeth per turn`)
}

test('a gear train is rotors that wind outward, a draw group per colour, and each turns in place', () => {
  for (const end of [1, -1] as const) {
    for (const [name, rotors] of [['PRO', gearSet(2, end)], ['single-shaft', gearSet(1, end)], ['counter', counterGear(end)]] as const) {
      for (const rotor of rotors) {
        const label = `${name} ${end} ${rotor.name}`
        // A turning rotor is all gear and the pins are all pin, so each has one group.
        assert.deepEqual(rotor.geometry.groups.map(group => GEAR_GROUPS[group.materialIndex!]), [rotor.rate ? 'gears' : 'pins'], label)
        const [piece] = piecesOf(rotor.geometry)
        assert.ok(signedVolume(piece!) > 0, `${label} outward`)
        if (!rotor.rate) continue
        // Centred on its axis, or it would wobble as it turns.
        const centre = new Box3().setFromBufferAttribute(rotor.geometry.getAttribute('position') as BufferAttribute).getCenter(new Vector3())
        const across = centre.clone().sub(AXES[rotor.axis].clone().multiplyScalar(centre.dot(AXES[rotor.axis])))
        assert.ok(across.length() < 0.1, `${label}: turns about its own axis (${across.toArray()})`)
      }
    }
  }
})

test('a gear set and a counter gear sit where their socket says', () => {
  for (const end of [1, -1] as const) {
    // The PRO train reaches in toward the motor, never out past the axle toward the bumper.
    const pro = assembled(gearSet(2, end))
    const inward = end === 1 ? pro.min.z : -pro.max.z
    assert.ok(inward < -19, `PRO pinion reaches the motor shaft: ${inward}`)
    assert.ok(Math.abs(end === 1 ? pro.max.z : pro.min.z) < 8, 'PRO axle spur is the outermost gear')
    // A single-shaft crown gear clears the propeller shaft's bevel at x ±4.
    const crown = assembled(gearSet(1, end))
    assert.ok(Math.min(Math.abs(crown.min.x), Math.abs(crown.max.x)) >= 4 && crown.min.x * crown.max.x > 0, `crown clears the bevel: ${crown.min.x}…${crown.max.x}`)
  }
  // The counter gear clears the motor cradle (x 14.5–17.5) and the inner face of every wheel it sits beside.
  const counter = assembled(counterGear(-1))
  for (const id of CHASSIS_IDS) {
    const l = layoutFor(id)
    if (!l.motor.across) {
      // gearSet(2, …) is placed for the mid motor on an 80 mm wheelbase.
      assert.equal(l.wheelbaseMm, 80, `${id} wheelbase`)
      assert.deepEqual(l.motor.position, [0, 18, 0], `${id} motor`)
      continue
    }
    const wheelFace = Math.min(l.treadFrontMm, l.treadRearMm) / 2 - 5.75
    assert.ok(counter.min.x >= 16 && counter.max.x < wheelFace, `${id} counter gear between cradle and wheel`)
  }
})

test('switched on, every gear train drives both axles forward off one motor', () => {
  for (const id of CHASSIS_IDS) {
    const sockets = socketsFor(id)
    const gearSockets = sockets.filter(socket => socket.kind === 'gear')
    const towardNose = (z: number) => z < 0 ? -1 as const : 1 as const
    if (!layoutFor(id).motor.across) {
      // Both pinions are the one double-shaft motor's, so they must turn as one.
      const pinions = gearSockets.map(socket => {
        const rotors = gearSet(2, towardNose(socket.position[2]))
        const label = `${id} ${socket.name}`
        assertMeshes(label, [named(rotors, 'axle'), 14], [named(rotors, 'counter'), 10])
        assertMeshes(label, [named(rotors, 'counter'), 14], [named(rotors, 'pinion'), 6])
        return spinOf(named(rotors, 'pinion'))
      })
      assert.ok(pinions[0]!.distanceTo(pinions[1]!) < 1e-9, `${id}: one motor shaft, turning one way (${pinions.map(p => p.toArray())})`)
      continue
    }
    // Single-shaft: each crown gear turns the propeller shaft through the bevel
    // at its end (generators/chassis.ts, singleShaftDrive). Both ends have to
    // ask the shaft to turn the same way.
    const shaft = gearSockets.map(socket => {
      const crown = named(gearSet(1, towardNose(socket.position[2])), 'axle')
      // The bevel's centre, in the gear socket's frame: on the car's centre line, 8 mm in from the axle.
      const bevel = new Vector3(0, 0, -towardNose(socket.position[2]) * 8)
      const pa = placed(crown).getAttribute('position')
      const at = new Vector3(); const v = new Vector3()
      let best = Infinity
      for (let i = 0; i < pa.count; i++) {
        const d = v.fromBufferAttribute(pa, i).distanceToSquared(bevel)
        if (d < best) { best = d; at.copy(v) }
      }
      const bevelSurface = AXES.z.clone().cross(at.clone().sub(new Vector3(0, 0, at.z)))
      return Math.sign(velocityAt(crown, at).dot(bevelSurface))
    })
    assert.equal(shaft[0], shaft[1], `${id}: both crown gears turn the propeller shaft one way`)
    // The counter gear turns the shaft through a crown the pane does not
    // draw, so only its own mesh with the pinion is on screen to check.
    const motorSocket = sockets.find(socket => socket.kind === 'counter-gear')!
    const rotors = counterGear(towardNose(motorSocket.position[2]))
    assertMeshes(`${id} counter-gear`, [named(rotors, 'pinion'), 8], [named(rotors, 'counter'), 16])
  }
})
