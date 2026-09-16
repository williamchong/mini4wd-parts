/**
 * The chassis under the sockets, from primitives (docs/PLAN.md §5.6): a floor
 * with wheel-arch cheeks, a centre hump over the motor and batteries, the
 * moulded bumpers with their roller posts, and side guards — enough that the
 * sockets have a car to sit on and the moulded parts of a stock kit are seen.
 * Whether this is enough for M1 or the chassis becomes a modelled GLB is
 * decided after the parts look right against it (§5.6).
 *
 * Positions match the socket table for the same chassis (../sockets.ts): the
 * roller posts stand under the roller sockets, the front-stay socket sits on
 * the front bumper, the side-stay sockets on the guards. Units are
 * millimetres, Y up, nose toward +Z, ground at y = 0.
 */
import type { BufferGeometry } from 'three'
import type { ChassisId } from '../../catalog/schema.ts'
import { Triangles } from './mesh.ts'
import type { Point2 } from './mesh.ts'

export type ChassisPiece = { geometry: BufferGeometry; colour: number }

const BLACK = 0x26292e
const COVER = 0x353a42

/** A box by size and centre, the way the socket table thinks. */
function box(t: Triangles, w: number, h: number, d: number, x: number, y: number, z: number) {
  t.box(x - w / 2, y - h / 2, z - d / 2, x + w / 2, y + h / 2, z + d / 2)
}

/** A roller post: a short cylinder up from the bumper to the roller. */
function post(t: Triangles, x: number, z: number) {
  const profile: Point2[] = [[0, 4], [2, 4], [2, 13], [0, 13]]
  const ring = new Triangles()
  ring.revolve(profile, 8, 'y')
  t.append(ring, x, 0, z)
}

/**
 * MA's bumper, seen from above: a wide plate whose outer corners carry the
 * roller posts, with the leading edge swept back between them. Outline is
 * counter-clockwise from above for the front; the rear is the same plate
 * mirrored in z, which reverses it.
 */
function bumper(t: Triangles, towardNose: 1 | -1) {
  const z = (v: number) => v * towardNose
  const outline: Point2[] = [
    [-45, z(64)], [-45, z(80)], [-36, z(84)], [-18, z(78)], [18, z(78)], [36, z(84)], [45, z(80)], [45, z(64)],
    [22, z(62)], [-22, z(62)]
  ]
  if (towardNose < 0) outline.reverse()
  t.prism(outline.map(([x, zz]) => [x, 4.5, zz] as const), outline.map(([x, zz]) => [x, 8, zz] as const))
}

function ma(): ChassisPiece[] {
  const black = new Triangles()
  box(black, 58, 3, 130, 0, 5.5, 0)
  bumper(black, 1)
  bumper(black, -1)
  for (const [x, z] of [[37, 78], [-37, 78], [37, -78], [-37, -78], [42, 0], [-42, 0]] as const) post(black, x, z)
  // Side guards out to the side-roller posts at x = ±42.
  box(black, 18, 4, 36, 38, 6, 0)
  box(black, 18, 4, 36, -38, 6, 0)
  // Wheel-arch cheeks between the axles: the flanks of an MA tub.
  box(black, 6, 12, 44, 26, 12, 0)
  box(black, 6, 12, 44, -26, 12, 0)

  // Battery bay behind the motor, motor cover over it; the motor pokes up through.
  const cover = new Triangles()
  box(cover, 30, 8, 100, 0, 11, 0)
  box(cover, 24, 4, 30, 0, 17, 0)

  return [
    { geometry: black.geometry(), colour: BLACK },
    { geometry: cover.geometry(), colour: COVER }
  ]
}

const CHASSIS: Partial<Record<ChassisId, () => ChassisPiece[]>> = { ma }

/** Undefined for a chassis the pane cannot draw; keep in step with ../chassis.ts. */
export function chassisPieces(chassis: ChassisId): ChassisPiece[] | undefined {
  return CHASSIS[chassis]?.()
}
