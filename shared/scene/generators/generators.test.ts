import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Vector3 } from 'three'
import type { BufferGeometry } from 'three'
import { SCENE_CHASSIS } from '../chassis.ts'
import { DEFAULT_SILHOUETTE, silhouetteFor } from '../bodies.ts'
import { bodyGeometry, FLOOR_MM } from './body.ts'
import { chassisPieces } from './chassis.ts'
import { plate, Triangles } from './mesh.ts'
import { brake, damper, motor, roller, sideStay, stay, tire, wheel } from './parts.ts'

const size = (geometry: BufferGeometry) => {
  geometry.computeBoundingBox()
  return geometry.boundingBox!.getSize(new Vector3())
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
  for (const [name, geometry] of [['roller', roller(13)], ['wheel', wheel(24)], ['tire', tire(24, 6)], ['motor', motor()], ['damper', damper()], ['brake', brake()]] as const) {
    assert.ok(signedVolume(geometry) > 0, name)
  }
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

test('every chassis the pane draws has chassis pieces that wind outward, and only those', () => {
  for (const id of SCENE_CHASSIS) {
    const pieces = chassisPieces(id)
    assert.ok(pieces?.length, id)
    for (const piece of pieces) {
      if (piece.geometry.index) continue // three's own primitives
      assert.ok(signedVolume(piece.geometry) > 0, `${id} piece outward`)
    }
  }
  assert.equal(chassisPieces('vz'), undefined)
})
