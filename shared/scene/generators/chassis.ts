/**
 * The chassis under the sockets, built from prisms and revolves (docs/PLAN.md
 * §5.6). All eight are drawn from the same handful of pieces, each at the
 * detail a reader recognises it by from below and with the shell lifted:
 * where the motor sits and which way it lies, how the cells are laid, the
 * bumper outlines with their cut-outs, whether the floor is a sealed tub or an
 * open frame, and the tread. Nothing finer than that shows under an opaque
 * body, and §5.1's IP position wants a stylised shape rather than a mould.
 *
 * Positions come from the same layout the socket table is built from
 * (../sockets.ts): the roller posts stand under the roller sockets, the gear
 * housings sit on the axles, the motor bay cradles the motor socket, the
 * side guards carry the side-stay sockets. Units are millimetres, Y up, nose
 * toward +Z, ground at y = 0.
 */
import type { BufferGeometry } from 'three'
import type { ChassisId } from '../../catalog/chassis.ts'
import { AXLE_Y, layoutFor } from '../sockets.ts'
import type { Layout } from '../sockets.ts'
import { cylinder, Triangles } from './mesh.ts'
import type { Point2 } from './mesh.ts'

/**
 * What a piece is on the real car, which is what a kit's colours are keyed by:
 * the frame, an MS chassis' nose and tail units, and the A-parts sprue (gear
 * covers, motor cover, switch) are moulded per box; the cells, their caps and
 * the steel are the same in every one.
 */
export type ChassisRole = 'frame' | 'ends' | 'aParts' | 'cells' | 'caps' | 'steel'
export type ChassisPiece = { geometry: BufferGeometry; colour: number; role: ChassisRole }

export const BLACK = 0x26292e
const CELL = 0xb9bec6
const CELL_CAP = 0x3c4046
export const STEEL = 0xd2d6dc

/** The floor's underside and top: bumper plates and guards sit on the same band. */
const FLOOR_Y0 = 4
const FLOOR_Y1 = 7
const PLATE_Y0 = 4.5
const PLATE_Y1 = 8

/** The groups every chassis is drawn in, one per `ChassisRole`. */
class Chassis {
  readonly frame = new Triangles()
  /**
   * The bumpers and the floor past the axles. One moulding with the frame on
   * every chassis but MS, whose three units `split` parts into their own.
   */
  ends = this.frame
  readonly aParts = new Triangles()
  readonly cells = new Triangles()
  readonly caps = new Triangles()
  readonly steel = new Triangles()
  readonly layout: Layout

  // A plain field, not a parameter property: Node strips types and no more.
  constructor(layout: Layout) {
    this.layout = layout
  }

  /** Give the nose and tail units a group of their own (MS). */
  split() {
    this.ends = new Triangles()
  }

  /** One piece per group that has anything in it: a PRO chassis has no steel. */
  pieces(): ChassisPiece[] {
    const groups: [Triangles, number, ChassisRole][] = [
      [this.frame, BLACK, 'frame'],
      [this.aParts, BLACK, 'aParts'],
      [this.cells, CELL, 'cells'],
      [this.caps, CELL_CAP, 'caps'],
      [this.steel, STEEL, 'steel']
    ]
    if (this.ends !== this.frame) groups.splice(1, 0, [this.ends, BLACK, 'ends'])
    return groups.filter(([t]) => !t.empty).map(([t, colour, role]) => ({ geometry: t.geometry(), colour, role }))
  }

  /** A solid floor between two stations, the width of the tub. */
  floor(half: number, z0: number, z1: number, into = this.frame) {
    into.box(-half, FLOOR_Y0, z0, half, FLOOR_Y1, z1)
  }

  /**
   * An open floor: two side rails, a spine and cross ribs at the stations,
   * which is what the single-shaft chassis look like from below, cells showing
   * between the ribs.
   */
  openFrame(half: number, z0: number, z1: number, ribs: readonly number[]) {
    for (const x of [-half + 2, half - 2]) this.frame.boxAt(4, 3, z1 - z0, x, 5.5, (z0 + z1) / 2)
    for (const z of ribs) this.frame.boxAt(half * 2, 3, 5, 0, 5.5, z)
  }

  /** Side walls up from the floor, each `[z, length, height]`, mirrored in x. */
  walls(x: number, segments: readonly (readonly [z: number, length: number, height: number])[], into = this.frame) {
    for (const side of [-x, x]) {
      for (const [z, length, height] of segments) into.boxAt(4, height, length, side, FLOOR_Y1 + height / 2 - 1, z)
    }
  }

  /**
   * A bumper at one end: a crossbar carrying the roller posts, and between it
   * and the tub either two arms sweeping out from the tub's corners with a
   * centre rib (the cut-outs most mouldings have), the arms alone, arms from
   * the centre line making a V, or one solid plate. `nose` adds a pointed
   * centre plate past the bar. Outlines are listed for the front and mirrored
   * in z for the rear, which reverses them.
   */
  bumper(towardNose: 1 | -1, b: {
    half: number; bar: number; base: number; corner: number
    fill: 'rib' | 'arms' | 'vee' | 'plate'; nose?: boolean
  }) {
    const inner = b.bar - 9
    const shapes: Point2[][] = [
      [[-b.half, b.bar - 10], [-b.half, b.bar - 4], [-b.half + 8, b.bar], [b.half - 8, b.bar], [b.half, b.bar - 4], [b.half, b.bar - 10]]
    ]
    if (b.fill === 'plate') {
      shapes.push([[-b.corner - 8, b.base], [-b.corner - 8, inner], [b.corner + 8, inner], [b.corner + 8, b.base]])
    } else {
      const from = b.fill === 'vee' ? 6 : b.corner
      shapes.push(
        [[-from, b.base], [-from, b.base + 4], [-b.corner - 11, inner], [-b.corner - 3, inner]],
        [[b.corner + 3, inner], [b.corner + 11, inner], [from, b.base + 4], [from, b.base]]
      )
      if (b.fill === 'rib') shapes.push([[-5, b.base], [-5, inner], [5, inner], [5, b.base]])
    }
    if (b.nose) shapes.push([[-12, b.bar - 4], [0, b.bar + 6], [12, b.bar - 4]])
    for (const shape of shapes) {
      const outline = shape.map(([x, z]) => [x, z * towardNose] as const)
      if (towardNose < 0) outline.reverse()
      this.ends.plate(outline, PLATE_Y0, PLATE_Y1)
    }
  }

  /** A short cylinder up from each bumper to each roller, where the layout puts the roller. */
  posts() {
    const { front, rear, side } = this.layout.rollers
    const at = (into: Triangles, x: number, z: number) => into.revolve(cylinder(2, 4, 13), 8, 'y', [x, 0, z])
    for (const sign of [-1, 1]) {
      at(this.ends, sign * front[0], front[1])
      at(this.ends, sign * rear[0], -rear[1])
      at(this.frame, sign * side, 0)
    }
  }

  /** Side guards out to the side-roller posts, a slotted pad each side, `length` along the car. */
  guards(length = 20) {
    const x = this.layout.sideStayX
    const reach = this.layout.rollers.side - x + 14
    for (const side of [-1, 1]) {
      this.frame.boxAt(reach, 4, 8, side * x, 6, length / 2 + 4)
      this.frame.boxAt(reach, 4, 8, side * x, 6, -(length / 2 + 4))
      this.frame.boxAt(6, 4, length, side * (x + 6), 6, 0)
    }
  }

  /** Two AA cells lying along the car at `xs`, centred on `z`, with a terminal plate at each end. */
  cellsAlong(xs: readonly number[], z: number) {
    for (const x of xs) {
      this.cells.revolve(cylinder(7.2, z - 25, z + 25), 12, 'z', [x, 11.5, 0])
      this.caps.boxAt(12, 14, 1.5, x, 11.5, z + 26.5)
      this.caps.boxAt(12, 14, 1.5, x, 11.5, z - 26.5)
    }
  }

  /** Gear covers at an axle, A parts: the PRO pair either side of the spur, or one central crown-gear housing. */
  gearHousings(z: number, xs: readonly number[]) {
    for (const x of xs) this.aParts.boxAt(10, 14, 14, x, AXLE_Y, z)
  }

  /** The PRO drivetrain: a double-shaft motor along the car (a proxy, not drawn here), spur housings at each axle, cells either side. */
  proDrive() {
    const halfWheelbase = this.layout.wheelbaseMm / 2
    this.gearHousings(halfWheelbase, [-18, 18])
    this.gearHousings(-halfWheelbase, [-18, 18])
    this.cellsAlong([-17.5, 17.5], 0)
  }

  /**
   * The single-shaft drivetrain the pane cannot otherwise show: a cradle for
   * the FA-130 lying across the car, a crown-gear housing on each axle, and the
   * propeller shaft between them with a bevel at each end.
   */
  singleShaftDrive() {
    const [, , mz] = this.layout.motor.position
    const halfWheelbase = this.layout.wheelbaseMm / 2
    for (const x of [-16, 16]) this.frame.boxAt(3, 16, 22, x, 10, mz)
    this.frame.boxAt(30, 2, 22, 0, 4, mz)
    // Each housing on the far side of the shaft from its crown gear, which is
    // right of the shaft at the front and left at the rear (parts.ts, gearSide).
    this.gearHousings(halfWheelbase, [-4])
    this.gearHousings(-halfWheelbase, [4])
    this.steel.revolve(cylinder(1.2, -halfWheelbase + 8, halfWheelbase - 8), 6, 'z', [0, AXLE_Y, 0])
    for (const z of [-halfWheelbase + 8, halfWheelbase - 8]) this.steel.revolve(cylinder(4, z - 1, z + 1), 8, 'z', [0, AXLE_Y, 0])
  }

  /** The switch slider, wherever the chassis keeps it; an A part. */
  switch(z: number) {
    this.aParts.boxAt(8, 4, 12, 0, 9, z)
  }

  /** A PRO chassis' motor cover over the middle: a clip, or a cage of `bars` cross bars; an A part. */
  motorCover(bars?: readonly number[]) {
    if (!bars) this.aParts.boxAt(22, 2, 12, 0, 28.5, 0)
    else for (const z of bars) this.aParts.boxAt(24, 2, 3, 0, 28.5, z)
  }
}

/**
 * MA: a one-piece tub, the two AA cells lying either side of the double-shaft
 * motor, gear housings at each axle, cut-out bumpers, slotted side guards, the
 * switch behind the rear axle and the motor cover clip over the middle.
 */
function ma(c: Chassis) {
  c.floor(29, -64, 64)
  c.walls(27, [[0, 40, 12], [60, 10, 8], [-60, 10, 8]])
  c.proDrive()
  c.bumper(1, { half: 46, bar: 86, base: 62, corner: 29, fill: 'rib' })
  c.bumper(-1, { half: 46, bar: 86, base: 62, corner: 29, fill: 'rib' })
  c.posts()
  c.guards()
  c.switch(-52)
  c.motorCover()
}

/**
 * MS: the same PRO layout as MA in three pieces — a nose unit, a centre unit
 * and a tail unit with visible seams between them, which is what makes the
 * MSフレキ cut possible — wider in the tread, a ribbed battery cover on the
 * underside of the centre unit, and a flat rear deck rather than cut-outs.
 */
function ms(c: Chassis) {
  c.split()
  c.floor(31, -44, 44)
  c.floor(31, 46, 68, c.ends)
  c.floor(31, -68, -46, c.ends)
  c.walls(29, [[0, 44, 12]])
  c.walls(29, [[57, 22, 8], [-57, 22, 8]], c.ends)
  // The battery cover, and the ridges moulded across it.
  c.frame.boxAt(40, 1.5, 60, 0, 3.25, 0)
  for (const z of [-20, 0, 20]) c.frame.boxAt(40, 1, 2, 0, 2, z)
  c.proDrive()
  c.bumper(1, { half: 47, bar: 86, base: 68, corner: 31, fill: 'rib' })
  c.bumper(-1, { half: 46, bar: 86, base: 68, corner: 31, fill: 'plate' })
  c.posts()
  c.guards()
  c.switch(-56)
  c.motorCover()
}

/**
 * ME: the newest PRO tub, narrower at the front than the rear, its floor split
 * by a flex line ahead of the rear axle, and the motor held under a cage of
 * cross bars rather than a clip.
 */
function me(c: Chassis) {
  c.frame.plate([[-26, -64], [-26, -23], [26, -23], [26, -64]], FLOOR_Y0, FLOOR_Y1)
  c.frame.plate([[-29, -21], [-25, 64], [25, 64], [29, -21]], FLOOR_Y0, FLOOR_Y1)
  c.walls(27, [[0, 40, 12], [60, 10, 8], [-60, 10, 8]])
  c.proDrive()
  c.bumper(1, { half: 43, bar: 86, base: 62, corner: 27, fill: 'rib' })
  c.bumper(-1, { half: 46, bar: 86, base: 62, corner: 30, fill: 'rib' })
  c.posts()
  c.guards()
  c.switch(-52)
  c.motorCover([-9, 0, 9])
}

/**
 * AR: a sealed, wide underbody — the battery cover and the motor hatch are
 * the only lines on it — the FA-130 across the rear, cells side by side
 * ahead of it, a pointed aero nose on the front bumper and long side guards.
 */
function ar(c: Chassis) {
  c.frame.plate([[-30, -66], [-35, -22], [-35, 22], [-30, 66], [30, 66], [35, 22], [35, -22], [30, -66]], 3, FLOOR_Y1)
  c.frame.boxAt(26, 1.5, 52, 0, 2.25, 12)
  c.frame.boxAt(30, 1.5, 24, 0, 2.25, -27)
  for (const z of [-33, -21]) c.frame.boxAt(30, 1, 2, 0, 1.5, z)
  c.walls(29, [[12, 44, 10], [61, 10, 8], [-61, 10, 8]])
  c.singleShaftDrive()
  c.bumper(1, { half: 47, bar: 88, base: 66, corner: 30, fill: 'rib', nose: true })
  c.bumper(-1, { half: 44, bar: 88, base: 66, corner: 30, fill: 'arms' })
  c.posts()
  c.guards(28)
  c.switch(-52)
  c.cellsAlong([-9.5, 9.5], 12)
}

/**
 * FM-A: the FA-130 across the front, cells behind it, skid bars under the
 * nose for the jumps it was made for, and a wide flat rear deck for a stay.
 */
function fmA(c: Chassis) {
  c.floor(28, -66, 66)
  c.walls(27, [[-14, 44, 10], [62, 10, 8], [-62, 10, 8]])
  c.singleShaftDrive()
  c.bumper(1, { half: 44, bar: 88, base: 66, corner: 28, fill: 'rib' })
  c.bumper(-1, { half: 46, bar: 88, base: 66, corner: 28, fill: 'plate' })
  for (const x of [-16, 16]) c.frame.boxAt(4, 3, 16, x, 2.5, 74)
  c.posts()
  c.guards()
  c.switch(-52)
  c.cellsAlong([-9.5, 9.5], -13)
}

/**
 * VZ: the lightest, an open frame you see the cells through, the motor across
 * the rear, a narrow front and a wider rear, short side guards.
 */
function vz(c: Chassis) {
  c.openFrame(27, -64, 64, [-60, -20, 20, 60])
  c.walls(27, [[62, 8, 8], [-62, 8, 8]])
  c.singleShaftDrive()
  c.bumper(1, { half: 43, bar: 86, base: 62, corner: 27, fill: 'rib' })
  c.bumper(-1, { half: 46, bar: 86, base: 62, corner: 29, fill: 'arms' })
  c.posts()
  c.guards(12)
  c.switch(52)
  c.cellsAlong([-9.5, 9.5], 13)
}

/**
 * Super-II: the modernised Super-1, an open frame with the motor across the
 * rear, a solid front bumper plate and arms at the rear, side guards.
 */
function superTwo(c: Chassis) {
  c.openFrame(29, -64, 64, [-60, -24, 24, 60])
  c.walls(29, [[62, 8, 8], [-62, 8, 8]])
  c.singleShaftDrive()
  c.bumper(1, { half: 45, bar: 86, base: 62, corner: 29, fill: 'plate' })
  c.bumper(-1, { half: 45, bar: 86, base: 62, corner: 29, fill: 'arms' })
  c.posts()
  c.guards()
  c.switch(52)
  c.cellsAlong([-9.5, 9.5], 13)
}

/**
 * VS: the short classic, an open frame with the motor across the rear, a
 * front bumper whose arms meet at the centre line in a V, a wider rear tread.
 */
function vs(c: Chassis) {
  c.openFrame(29, -64, 64, [-60, -24, 24, 60])
  c.walls(29, [[62, 8, 8], [-62, 8, 8]])
  c.singleShaftDrive()
  c.bumper(1, { half: 45, bar: 86, base: 62, corner: 29, fill: 'vee' })
  c.bumper(-1, { half: 46, bar: 86, base: 62, corner: 30, fill: 'arms' })
  c.posts()
  c.guards()
  c.switch(52)
  c.cellsAlong([-9.5, 9.5], 13)
}

const CHASSIS: Record<ChassisId, (c: Chassis) => void> = {
  ma, ms, me, ar, 'fm-a': fmA, vz, 'super-2': superTwo, vs
}

export function chassisPieces(chassis: ChassisId): ChassisPiece[] {
  const c = new Chassis(layoutFor(chassis))
  CHASSIS[chassis](c)
  return c.pieces()
}
