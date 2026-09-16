/**
 * The chassis under the sockets, built from prisms and revolves (docs/PLAN.md
 * §5.6). There are eight chassis in the catalog and one of them is drawn today,
 * so each gets the detail a reader would recognise it by rather than a tray:
 * the tub with its side walls and wheel arches, the two AA cells beside the
 * motor, the gear housings at each axle, the bumpers with their cut-outs and
 * roller posts, the side guards and the switch.
 *
 * Positions match the socket table for the same chassis (../sockets.ts): the
 * roller posts stand under the roller sockets, the front-stay socket sits on
 * the front bumper, the side-stay sockets on the guards. Units are
 * millimetres, Y up, nose toward +Z, ground at y = 0.
 */
import type { BufferGeometry } from 'three'
import type { ChassisId } from '../../catalog/schema.ts'
import { cylinder, Triangles } from './mesh.ts'
import type { Point2 } from './mesh.ts'

export type ChassisPiece = { geometry: BufferGeometry; colour: number }

const BLACK = 0x26292e
const CELL = 0xb9bec6
const CELL_CAP = 0x3c4046

/** A short cylinder up from the bumper to the roller. */
const post = (t: Triangles, x: number, z: number) => t.revolve(cylinder(2, 4, 13), 8, 'y', [x, 0, z])

/**
 * MA's bumper at one end: a crossbar carrying the roller posts, two arms
 * sweeping out from the tub's corners to it, and a centre rib, which leaves
 * the two cut-outs the real moulding has. Outlines are listed for the front
 * and mirrored in z for the rear, which reverses them.
 */
function bumper(t: Triangles, towardNose: 1 | -1) {
  const shapes: Point2[][] = [
    // Crossbar, ends swept for the roller pads.
    [[-46, 76], [-46, 82], [-38, 86], [38, 86], [46, 82], [46, 76]],
    // Arms, from the tub corner out to the crossbar.
    [[-29, 62], [-29, 66], [-40, 77], [-32, 77]],
    [[32, 77], [40, 77], [29, 66], [29, 62]],
    // Centre rib.
    [[-5, 62], [-5, 77], [5, 77], [5, 62]]
  ]
  for (const shape of shapes) {
    const outline = shape.map(([x, z]) => [x, z * towardNose] as const)
    if (towardNose < 0) outline.reverse()
    t.plate(outline, 4.5, 8)
  }
}

function ma(): ChassisPiece[] {
  const black = new Triangles()
  // The tub: a floor the width of the tread, and walls up its sides between
  // the wheel arches, which is what shows below the body.
  black.boxAt(58, 3, 128, 0, 5.5, 0)
  for (const x of [-27, 27]) {
    black.boxAt(4, 12, 40, x, 12, 0)
    black.boxAt(4, 8, 10, x, 10, 60)
    black.boxAt(4, 8, 10, x, 10, -60)
  }
  // Gear housings either side of each axle, inboard of the wheels.
  for (const z of [-40, 40]) {
    for (const x of [-18, 18]) black.boxAt(10, 14, 14, x, 12, z)
  }
  bumper(black, 1)
  bumper(black, -1)
  for (const [x, z] of [[37, 78], [-37, 78], [37, -78], [-37, -78], [42, 0], [-42, 0]] as const) post(black, x, z)
  // Side guards out to the side-roller posts, with a slot each.
  for (const x of [-38, 38]) {
    black.boxAt(18, 4, 8, x, 6, 14)
    black.boxAt(18, 4, 8, x, 6, -14)
    black.boxAt(6, 4, 20, x + Math.sign(x) * 6, 6, 0)
  }
  // The switch, a slider behind the rear axle.
  black.boxAt(8, 4, 12, 0, 9, -52)
  // Motor cover clip over the motor's middle.
  black.boxAt(22, 2, 12, 0, 28.5, 0)

  // Two AA cells, one each side of the motor, lying along the car.
  const cells = new Triangles()
  const caps = new Triangles()
  for (const x of [-17.5, 17.5]) {
    cells.revolve(cylinder(7.2, -25, 25), 12, 'z', [x, 11.5, 0])
    // Terminal plates at the ends of each cell.
    caps.boxAt(12, 14, 1.5, x, 11.5, 26.5)
    caps.boxAt(12, 14, 1.5, x, 11.5, -26.5)
  }

  return [
    { geometry: black.geometry(), colour: BLACK },
    { geometry: cells.geometry(), colour: CELL },
    { geometry: caps.geometry(), colour: CELL_CAP }
  ]
}

const CHASSIS: Partial<Record<ChassisId, () => ChassisPiece[]>> = { ma }

/** Undefined for a chassis the pane cannot draw; keep in step with ../chassis.ts. */
export function chassisPieces(chassis: ChassisId): ChassisPiece[] | undefined {
  return CHASSIS[chassis]?.()
}
