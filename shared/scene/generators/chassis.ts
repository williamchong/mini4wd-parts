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
import { UPPER_ROLLER_MM } from '../fittings.ts'
import { AXLE_Y, layoutFor } from '../sockets.ts'
import type { Layout } from '../sockets.ts'
import { cylinder, Triangles, wound } from './mesh.ts'
import type { Point2 } from './mesh.ts'

/**
 * What a piece is on the real car, which is what a kit's colours are keyed by:
 * the frame, an MS chassis' nose and tail units, and the A-parts sprue (gear
 * covers, motor cover, switch) are moulded per box; the cells and their
 * terminal caps are the same in every one. The switch is moulded on the A
 * parts sprue but is a piece of its own, because it slides when the car is on.
 */
export type ChassisRole = 'frame' | 'ends' | 'aParts' | 'switch' | 'cells' | 'caps'
/**
 * `end` marks the moulded bumper at the front (+1) or the rear (-1), with its
 * roller posts: a piece of its own, so a bumperless unit in that end's stay
 * slot can take it away (../fittings.ts, `replacesBumper`).
 */
export type ChassisPiece = { geometry: BufferGeometry; colour: number; role: ChassisRole; end?: 1 | -1 }

export const BLACK = 0x26292e
const CELL = 0xb9bec6
const CELL_CAP = 0x3c4046
export const STEEL = 0xd2d6dc

/** The floor's underside and top: bumper plates and guards sit on the same band. */
const FLOOR_Y0 = 4
const FLOOR_Y1 = 7
const PLATE_Y0 = 4.5
const PLATE_Y1 = 8

/** Convex outlines of the right half, x ≥ 0, in millimetres; a cut-out is the gap between two. */
export type Outline = readonly (readonly Point2[])[]
export type ChassisOutlines = { front?: Outline; rear?: Outline; wings?: Outline }

/**
 * The bumpers and side flanges a reader tells these chassis apart by, read
 * off Tamiya's plan-view photo of each against the roller posts in
 * ../sockets.ts: AR's fan nose and open tail, the window in a VS, VZ or MS
 * tail, Super-II's T-plate nose and braced tail, the swept wings of VS and
 * FM-A. A bumper's z is from the middle of the car toward its own end, so one
 * list serves either end; a wing's z is toward the nose. A wing reaches the
 * side-roller post at z = 0, which it carries in place of `guards`. MA and ME
 * keep `bumper`'s template, which already reads as theirs.
 */
export const OUTLINES = {
  ar: {
    // A fan from the nose of the hull, its front edge swept back between the rollers.
    front: [
      [[0, 52], [25, 52], [40, 76], [36, 80], [0, 70]],
      [[36, 75], [45, 77], [45, 84], [38, 84]]
    ],
    // Arms curving out and back to the rollers, a crossbar set in behind them.
    rear: [
      [[18, 52], [26, 52], [37, 66], [31, 68]],
      [[31, 68], [37, 66], [45, 78], [45, 84], [38, 83]],
      [[0, 74], [36, 71], [37, 75], [0, 79]]
    ],
    // Flanges behind the middle, out to the side post.
    wings: [[[27, 4], [47, 3], [47, -3], [37, -27], [27, -32]]]
  },
  'fm-a': {
    front: [
      [[0, 53], [20, 53], [20, 72], [0, 75]],
      [[17, 54], [25, 54], [40, 76], [39, 83], [32, 80]]
    ],
    // The same arms, and a crossbar with a comb of ribs along its back edge.
    rear: [
      [[17, 54], [25, 54], [40, 76], [39, 83], [32, 80]],
      [[0, 77], [24, 75], [26, 80], [0, 83]],
      [[3, 82], [6, 82], [6, 85], [3, 85]],
      [[10, 81.5], [13, 81.5], [13, 84.5], [10, 84.5]],
      [[17, 81], [20, 81], [20, 84], [17, 84]]
    ],
    // Triangles swept back to a point behind the middle, and a pad out to the side post.
    wings: [
      [[21, 19], [46, -13], [46, -18], [21, -21]],
      [[32, 3], [44, 3], [44, -3], [32, -3]]
    ]
  },
  vz: {
    // A slotted plate on the nose, arms out to the rollers and a link from its corner.
    front: [
      [[0, 53], [26, 53], [26, 73], [0, 73]],
      [[22, 54], [28, 54], [41, 75], [40, 82], [33, 80]],
      [[24, 69], [34, 74], [34, 79], [24, 74]]
    ],
    // Two rails and a crossbar round a window, arms out to the rollers.
    rear: [
      [[13, 58], [21, 58], [21, 77], [13, 77]],
      [[0, 71], [14, 71], [14, 79], [0, 79]],
      [[19, 66], [24, 64], [43, 74], [43, 82], [24, 79]]
    ],
    wings: [[[22, 3], [47, 3], [47, -3], [37, -16], [22, -20]]]
  },
  'super-2': {
    // A neck widening into a straight bar the full width, a roller at each end.
    front: [
      [[0, 54], [24, 54], [40, 70], [0, 70]],
      [[0, 69], [38, 69], [43, 76], [41, 81], [0, 78]]
    ],
    // A Y: arms out to the rollers, braced back to a spine down the middle.
    rear: [
      [[16, 56], [24, 56], [43, 74], [43, 81], [34, 80]],
      [[0, 56], [4, 56], [4, 77], [0, 77]],
      [[2, 70], [22, 60], [27, 65], [2, 76]],
      [[0, 72], [12, 72], [12, 77], [0, 77]]
    ]
  },
  vs: {
    // One broad trapezoid from the frame's corners out to the rollers, a slot through its middle.
    front: [
      [[0, 54], [20, 54], [24, 58], [0, 58]],
      [[8, 58], [24, 58], [42, 74], [42, 81], [8, 80]],
      [[0, 72], [8, 72], [8, 80], [0, 80]]
    ],
    rear: [
      [[12, 58], [21, 58], [21, 77], [12, 77]],
      [[0, 71], [13, 71], [13, 79], [0, 79]],
      [[19, 64], [24, 62], [44, 74], [44, 82], [24, 79]]
    ],
    wings: [[[22, 24], [46, 3], [49, 0], [49, -3], [42, -10], [22, -16]]]
  },
  ms: {
    // The tail unit's two rails and crossbar round a window behind the rear axle.
    rear: [
      [[20, 56], [28, 56], [28, 77], [20, 77]],
      [[0, 72], [28, 72], [28, 79], [0, 79]],
      [[26, 70], [44, 74], [44, 82], [26, 79]]
    ]
  }
} satisfies Partial<Record<ChassisId, ChassisOutlines>>

/** The groups every chassis is drawn in, one per `ChassisRole`. */
class Chassis {
  readonly frame = new Triangles()
  /**
   * The bumpers and the floor past the axles. One moulding with the frame on
   * every chassis but MS, whose three units `split` parts into their own.
   */
  ends = this.frame
  readonly aParts = new Triangles()
  readonly switchSlider = new Triangles()
  readonly cells = new Triangles()
  /** The terminal plates at the cells' ends, which a terminal part repaints. */
  readonly caps = new Triangles()
  /** Each end's moulded bumper and its roller posts, in the frame's or the ends' colour. */
  readonly bumpers = { 1: new Triangles(), [-1]: new Triangles() }
  readonly layout: Layout

  // A plain field, not a parameter property: Node strips types and no more.
  constructor(layout: Layout) {
    this.layout = layout
  }

  /** Give the nose and tail units a group of their own (MS). */
  split() {
    this.ends = new Triangles()
  }

  /** One piece per group that has anything in it. */
  pieces(): ChassisPiece[] {
    const bumperRole: ChassisRole = this.ends === this.frame ? 'frame' : 'ends'
    const groups: [Triangles, number, ChassisRole, (1 | -1)?][] = [
      [this.frame, BLACK, 'frame'],
      [this.bumpers[1], BLACK, bumperRole, 1],
      [this.bumpers[-1], BLACK, bumperRole, -1],
      [this.aParts, BLACK, 'aParts'],
      [this.switchSlider, BLACK, 'switch'],
      [this.cells, CELL, 'cells'],
      [this.caps, CELL_CAP, 'caps']
    ]
    if (this.ends !== this.frame) groups.splice(1, 0, [this.ends, BLACK, 'ends'])
    return groups.filter(([t]) => !t.empty).map(([t, colour, role, end]) => ({ geometry: t.geometry(), colour, role, ...(end ? { end } : {}) }))
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
   * The template bumper at one end: a crossbar carrying the roller posts, and
   * between it and the tub two arms sweeping out from the tub's corners with
   * a centre rib, the cut-outs most mouldings have. A chassis with a bumper
   * of its own shape draws it from `OUTLINES` instead. Outlines are listed for
   * the front and mirrored in z for the rear, which reverses them.
   */
  bumper(towardNose: 1 | -1, b: { half: number; bar: number; base: number; corner: number }) {
    const inner = b.bar - 9
    const shapes: Point2[][] = [
      [[-b.half, b.bar - 10], [-b.half, b.bar - 4], [-b.half + 8, b.bar], [b.half - 8, b.bar], [b.half, b.bar - 4], [b.half, b.bar - 10]],
      [[-b.corner, b.base], [-b.corner, b.base + 4], [-b.corner - 11, inner], [-b.corner - 3, inner]],
      [[b.corner + 3, inner], [b.corner + 11, inner], [b.corner, b.base + 4], [b.corner, b.base]],
      [[-5, b.base], [-5, inner], [5, inner], [5, b.base]]
    ]
    for (const shape of shapes) {
      const outline = shape.map(([x, z]) => [x, z * towardNose] as const)
      if (towardNose < 0) outline.reverse()
      this.bumpers[towardNose].plate(outline, PLATE_Y0, PLATE_Y1)
    }
  }

  /**
   * A bumper drawn from its outline in `OUTLINES`, into that end's piece:
   * mirrored in z for the rear, since its z runs toward its own end.
   */
  outline(towardNose: 1 | -1, pieces: Outline) {
    this.mirrored(this.bumpers[towardNose], pieces, towardNose)
  }

  /** The flanges out from the frame's sides; their z is toward the nose, so neither end mirrors them. */
  wings(pieces: Outline) {
    this.mirrored(this.frame, pieces, 1)
  }

  /** Each piece and its mirror in x as plates on the bumper band, which the winding helper puts right way round. */
  private mirrored(into: Triangles, pieces: Outline, zSign: 1 | -1) {
    for (const piece of pieces) {
      for (const side of [1, -1]) into.plate(wound(piece.map(([x, z]) => [x * side, z * zSign] as const)), PLATE_Y0, PLATE_Y1)
    }
  }

  /**
   * A short cylinder up from each bumper to each roller, where the layout puts
   * the roller — long enough to carry the upper one too where that end's posts
   * hold two, since the screw a stacked pair shares runs the height of both.
   */
  posts() {
    const { front: [frontX, frontZ, frontTiers = 1], rear: [rearX, rearZ, rearTiers = 1], side } = this.layout.rollers
    const at = (into: Triangles, x: number, z: number, tiers: number) =>
      into.revolve(cylinder(2, 4, 13 + (tiers - 1) * UPPER_ROLLER_MM), 8, 'y', [x, 0, z])
    for (const sign of [-1, 1]) {
      at(this.bumpers[1], sign * frontX, frontZ, frontTiers)
      at(this.bumpers[-1], sign * rearX, -rearZ, rearTiers)
      at(this.frame, sign * side, 0, 1)
    }
  }

  /** Side guards out to the side-roller posts, a slotted pad each side, 20 mm along the car. */
  guards() {
    const x = this.layout.sideStayX
    const reach = this.layout.rollers.side - x + 14
    for (const side of [-1, 1]) {
      this.frame.boxAt(reach, 4, 8, side * x, 6, 14)
      this.frame.boxAt(reach, 4, 8, side * x, 6, -14)
      this.frame.boxAt(6, 4, 20, side * (x + 6), 6, 0)
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
   * the FA-130 lying across the car and a crown-gear housing on each axle. The
   * propeller shaft between them is a slot of its own, drawn at its socket
   * (../sockets.ts) in whatever shaft is fitted.
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
  }

  /** The switch slider, wherever the chassis keeps it, in the off position; an A part. */
  switch(z: number) {
    this.switchSlider.boxAt(8, 4, 12, 0, 9, z)
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
  c.bumper(1, { half: 46, bar: 86, base: 62, corner: 29 })
  c.bumper(-1, { half: 46, bar: 86, base: 62, corner: 29 })
  c.posts()
  c.guards()
  c.switch(-52)
  c.motorCover()
}

/**
 * MS: the same PRO layout as MA in three pieces — a nose unit, a centre unit
 * and a tail unit with visible seams between them, which is what makes the
 * MSフレキ cut possible — wider in the tread, a ribbed battery cover on the
 * underside of the centre unit, and a tail unit whose rails and crossbar
 * frame a window behind the rear axle.
 */
function ms(c: Chassis) {
  c.split()
  c.floor(31, -44, 44)
  c.floor(31, 46, 68, c.ends)
  // The tail unit's floor stops at the axle, so its window shows.
  c.floor(31, -60, -46, c.ends)
  c.walls(29, [[0, 44, 12]])
  c.walls(29, [[57, 22, 8], [-57, 22, 8]], c.ends)
  // The battery cover, and the ridges moulded across it.
  c.frame.boxAt(40, 1.5, 60, 0, 3.25, 0)
  for (const z of [-20, 0, 20]) c.frame.boxAt(40, 1, 2, 0, 2, z)
  c.proDrive()
  c.bumper(1, { half: 47, bar: 86, base: 68, corner: 31 })
  c.outline(-1, OUTLINES.ms.rear)
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
  c.bumper(1, { half: 43, bar: 86, base: 62, corner: 27 })
  c.bumper(-1, { half: 46, bar: 86, base: 62, corner: 30 })
  c.posts()
  c.guards()
  c.switch(-52)
  c.motorCover([-9, 0, 9])
}

/**
 * AR: a sealed, wide underbody — the battery cover and the motor hatch are
 * the only lines on it — the FA-130 across the rear, cells side by side
 * ahead of it, the hull narrowing where the wheels are, a fan for a front
 * bumper swept back between its rollers, an open tail of curved arms and a
 * crossbar, and flanges out to the sides behind the middle.
 */
function ar(c: Chassis) {
  // Narrow where the wheels are, widening between them.
  c.frame.plate([[-25, -66], [-25, 66], [25, 66], [25, -66]], 3, FLOOR_Y1)
  c.frame.plate([[-25, -26], [-35, -20], [-35, 20], [-25, 26], [25, 26], [35, 20], [35, -20], [25, -26]], 3, FLOOR_Y1)
  c.frame.boxAt(26, 1.5, 52, 0, 2.25, 12)
  c.frame.boxAt(30, 1.5, 24, 0, 2.25, -27)
  for (const z of [-33, -21]) c.frame.boxAt(30, 1, 2, 0, 1.5, z)
  c.walls(24, [[12, 44, 10], [61, 10, 8], [-61, 10, 8]])
  c.singleShaftDrive()
  c.outline(1, OUTLINES.ar.front)
  c.outline(-1, OUTLINES.ar.rear)
  c.posts()
  c.wings(OUTLINES.ar.wings)
  c.switch(-52)
  c.cellsAlong([-9.5, 9.5], 12)
}

/**
 * FM-A: the FA-130 across the front, cells behind it, skid bars under the
 * nose for the jumps it was made for, arms out to the rollers at both ends
 * with a ribbed crossbar across the tail, and swept wings at the sides.
 */
function fmA(c: Chassis) {
  c.floor(28, -66, 66)
  c.walls(27, [[-14, 44, 10], [62, 10, 8], [-62, 10, 8]])
  c.singleShaftDrive()
  c.outline(1, OUTLINES['fm-a'].front)
  c.outline(-1, OUTLINES['fm-a'].rear)
  for (const x of [-16, 16]) c.frame.boxAt(4, 3, 16, x, 2.5, 74)
  c.posts()
  c.wings(OUTLINES['fm-a'].wings)
  c.switch(-52)
  c.cellsAlong([-9.5, 9.5], -13)
}

/**
 * VZ: the lightest, an open frame you see the cells through, the motor across
 * the rear, a narrow front and a wider rear, a window in the tail bumper and
 * short wings at the sides.
 */
function vz(c: Chassis) {
  c.openFrame(27, -64, 64, [-60, -20, 20, 60])
  c.walls(27, [[62, 8, 8], [-62, 8, 8]])
  c.singleShaftDrive()
  c.outline(1, OUTLINES.vz.front)
  c.outline(-1, OUTLINES.vz.rear)
  c.posts()
  c.wings(OUTLINES.vz.wings)
  c.switch(52)
  c.cellsAlong([-9.5, 9.5], 13)
}

/**
 * Super-II: the modernised Super-1, an open frame with the motor across the
 * rear, a T-plate nose whose bar runs the full width, a braced Y at the
 * tail, side guards.
 */
function superTwo(c: Chassis) {
  c.openFrame(29, -64, 64, [-60, -24, 24, 60])
  c.walls(29, [[62, 8, 8], [-62, 8, 8]])
  c.singleShaftDrive()
  c.outline(1, OUTLINES['super-2'].front)
  c.outline(-1, OUTLINES['super-2'].rear)
  c.posts()
  c.guards()
  c.switch(52)
  c.cellsAlong([-9.5, 9.5], 13)
}

/**
 * VS: the short classic, an open frame with the motor across the rear, one
 * broad trapezoid for a front bumper, a window in the tail, big swept wings
 * at the sides, and a wider rear tread.
 */
function vs(c: Chassis) {
  c.openFrame(29, -64, 64, [-60, -24, 24, 60])
  c.walls(29, [[62, 8, 8], [-62, 8, 8]])
  c.singleShaftDrive()
  c.outline(1, OUTLINES.vs.front)
  c.outline(-1, OUTLINES.vs.rear)
  c.posts()
  c.wings(OUTLINES.vs.wings)
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
