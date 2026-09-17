import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Vector3 } from 'three'
import type { BufferGeometry } from 'three'
import { CHASSIS_IDS } from '../../catalog/chassis.ts'
import { DEFAULT_SILHOUETTE, silhouetteFor } from '../bodies.ts'
import { bodyGeometry, FLOOR_MM } from './body.ts'
import { BLACK, chassisPieces, STEEL } from './chassis.ts'
import { layoutFor, socketsFor } from '../sockets.ts'
import { plate, Triangles } from './mesh.ts'
import { brake, counterGear, damper, GEAR_GROUPS, gearSet, motor, MOTOR_GROUPS, motorPaints, roller, sideStay, stay, tire, wheel } from './parts.ts'
import type { MotorGroup, Paint } from './parts.ts'

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

test('a roller is its recorded diameter across, and spins about y', () => {
  for (const mm of [9, 13, 19]) {
    const s = size(roller(mm))
    near(s.x, mm, 'x'); near(s.z, mm, 'z')
    assert.ok(s.y < mm, 'thinner than it is wide')
  }
})

test('a wheel is its recorded diameter tall, and spins about x', () => {
  for (const mm of [20, 24, 31]) {
    const s = size(wheel(mm))
    near(s.y, mm, 'y'); near(s.z, mm, 'z')
    assert.ok(s.x < mm, 'narrower than it is tall')
  }
})

test('a tire is a band around its wheel, wider in diameter by the band', () => {
  const s = size(tire(24, 6))
  near(s.y, 30, 'y'); near(s.z, 30, 'z')
  assert.ok(s.x < 10, 'no wider than the wheel')
})

test('a stay is a plate of its recorded thickness, lying on top of the socket, either end', () => {
  for (const t of [1.5, 3]) {
    for (const end of [1, -1] as const) {
      const geometry = stay(t, end)
      near(size(geometry).y, t, 'thickness')
      geometry.computeBoundingBox()
      assert.ok(geometry.boundingBox!.min.y >= 1, 'above the bumper')
      assert.ok(signedVolume(geometry) > 0, `outward at ${end}`)
    }
  }
  near(size(sideStay(2)).y, 2, 'side stay thickness')
  assert.ok(signedVolume(sideStay(2)) > 0, 'side stay outward')
})

test('every revolved part winds outward', () => {
  for (const [name, geometry] of [['roller', roller(13)], ['wheel', wheel(24)], ['tire', tire(24, 6)], ['motor', motor()], ['single-shaft motor', motor(1)], ['damper', damper()], ['brake', brake()]] as const) {
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
  assert.ok(size(brake()).x > size(brake()).y, 'a brake is flat')
  assert.ok(size(damper()).y > size(damper()).x, 'a damper stands up')
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
  const pods = { x: 29, stations: [{ z: 20, halfWidth: 6, top: 10, bottom: 2 }, { z: 60, halfWidth: 6, top: 10, bottom: 2 }] }
  const withPods = signedVolume(bodyGeometry({ ...DEFAULT_SILHOUETTE, pods }))
  // Two pods of a 6-cornered section, 40 long: well over the hull alone.
  assert.ok(withPods > hull + 2 * 40 * 8 * 6, `pods add volume: ${withPods - hull}`)
  const wing = { z: -60, halfWidth: 40, height: 34, chord: 12, pylons: 14 }
  const winged = bodyGeometry({ ...DEFAULT_SILHOUETTE, wing })
  assert.ok(signedVolume(winged) > hull, 'wing adds volume')
  winged.computeBoundingBox()
  near(winged.boundingBox!.max.y, 35.5 - FLOOR_MM, 'wing top'); near(winged.boundingBox!.max.x, 40, 'wing span')
})

test('the Blast Arrow silhouette is a closed outward shell', () => {
  const geometry = bodyGeometry(silhouetteFor('18635'))
  assert.ok(signedVolume(geometry) > 50_000, 'a car-sized volume')
})

test('every kit without an entry gets the default silhouette', () => {
  assert.equal(silhouetteFor('00000'), DEFAULT_SILHOUETTE)
  assert.equal(silhouetteFor(null), DEFAULT_SILHOUETTE)
  assert.notEqual(silhouetteFor('18635'), DEFAULT_SILHOUETTE)
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

test('a chassis whose motor lies across the car draws its propeller shaft in steel; a PRO chassis does not', () => {
  for (const id of CHASSIS_IDS) {
    const steel = chassisPieces(id).some(p => p.colour === STEEL)
    assert.equal(steel, layoutFor(id).motor.across, id)
  }
})

test('every roller socket has a post under it', () => {
  const p = new Vector3()
  for (const id of CHASSIS_IDS) {
    const black = chassisPieces(id).find(p => p.colour === BLACK)!.geometry.getAttribute('position')
    for (const socket of socketsFor(id).filter(s => s.kind === 'roller')) {
      const [x, , z] = socket.position
      let found = false
      for (let i = 0; i < black.count && !found; i++) {
        p.fromBufferAttribute(black, i)
        found = Math.abs(p.x - x) < 2.5 && Math.abs(p.z - z) < 2.5 && p.y > 12.9
      }
      assert.ok(found, `${id} ${socket.name} has no post`)
    }
  }
})

test('a gear set and a counter gear wind outward, a draw group per colour, and sit where their socket says', () => {
  for (const end of [1, -1] as const) {
    for (const [name, geometry] of [['PRO', gearSet(2, end)], ['single-shaft', gearSet(1, end)], ['counter', counterGear(end)]] as const) {
      assert.equal(geometry.groups.length, GEAR_GROUPS.length, name)
      for (const [index, piece] of piecesOf(geometry).entries()) {
        if (!piece.getAttribute('position').count) continue
        assert.ok(signedVolume(piece) > 0, `${name} ${end}: ${GEAR_GROUPS[index]} outward`)
      }
    }
    // The PRO train reaches in toward the motor, never out past the axle toward the bumper.
    const pro = gearSet(2, end); pro.computeBoundingBox()
    const inward = end === 1 ? pro.boundingBox!.min.z : -pro.boundingBox!.max.z
    assert.ok(inward < -19, `PRO pinion reaches the motor shaft: ${inward}`)
    assert.ok(Math.abs(end === 1 ? pro.boundingBox!.max.z : pro.boundingBox!.min.z) < 8, 'PRO axle spur is the outermost gear')
  }
  // A single-shaft crown gear clears the propeller shaft's bevel at x ±4.
  const crown = gearSet(1, 1); crown.computeBoundingBox()
  assert.ok(crown.boundingBox!.min.x >= 4, `crown clears the bevel: ${crown.boundingBox!.min.x}`)
  // The counter gear clears the motor cradle (x 14.5–17.5) and the inner face of every wheel it sits beside.
  const counter = counterGear(-1); counter.computeBoundingBox()
  for (const id of CHASSIS_IDS) {
    const l = layoutFor(id)
    if (!l.motor.across) {
      // gearSet(2, …) is placed for the mid motor on an 80 mm wheelbase.
      assert.equal(l.wheelbaseMm, 80, `${id} wheelbase`)
      assert.deepEqual(l.motor.position, [0, 18, 0], `${id} motor`)
      continue
    }
    const wheelFace = Math.min(l.treadFrontMm, l.treadRearMm) / 2 - 5.75
    assert.ok(counter.boundingBox!.min.x >= 16 && counter.boundingBox!.max.x < wheelFace, `${id} counter gear between cradle and wheel`)
  }
})
