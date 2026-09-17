/**
 * The shapes the 3D pane draws for parts, generated from the part's specs
 * (docs/PLAN.md §5.6). One function per proxy kind, not per item: a 19 mm
 * aluminium roller and a 19 mm plastic one are the same call.
 *
 * Every shape is low-poly and dimensionally plausible, nothing more — the pane
 * is for an impression of the build, and the only reference we hold for any
 * part is one product photo. Units are millimetres, Y up, the car's nose
 * toward +Z. Wheels and tires spin about X, rollers about Y, and each shape's
 * origin is the socket it goes in (docs/PLAN.md §5.5).
 *
 * Everything is built on ./mesh.ts rather than three's primitives: a revolve
 * of a rectangle is a cylinder, and one Triangles instance holding several
 * of them is the merged geometry, so neither LatheGeometry nor
 * BufferGeometryUtils is pulled into the 3D chunk (1.4 KB gz between them,
 * measured 2026-09-16). This module still imports three at module level on
 * purpose: only the lazily loaded scene component imports it, so it lives in
 * the 3D chunk and nothing on a route's own JavaScript grows.
 */
import type { BufferGeometry } from 'three'
import { STEEL } from './chassis.ts'
import { cylinder, plate, Triangles } from './mesh.ts'
import type { Point2, Point3 } from './mesh.ts'

/**
 * A roller: a ring with a raised hub, so it reads as a bearing on a post
 * rather than a coin. `diameterMm` is the catalog's `rollerDiameterMm`.
 */
export function roller(diameterMm: number): BufferGeometry {
  const r = diameterMm / 2
  const t = new Triangles()
  t.revolve(cylinder(r, -2, 2), 16, 'y')
  t.revolve(cylinder(r * 0.4, -3.25, 3.25), 10, 'y')
  return t.geometry()
}

/**
 * A wheel: a rim with a dished face and an axle stub. Width is the common
 * narrow-wheel width; the catalog records no wheel width.
 */
export function wheel(diameterMm: number): BufferGeometry {
  const r = diameterMm / 2
  const t = new Triangles()
  t.revolve(cylinder(r, -5, 5), 16, 'x')
  t.revolve(cylinder(r * 0.55, -5.75, 5.75), 12, 'x')
  t.revolve(cylinder(1.5, -7, 7), 6, 'x')
  return t.geometry()
}

/**
 * A tire: an annulus around its wheel, revolved from a rectangular profile
 * with a small chamfer so the shoulder catches light. `wheelDiameterMm` is
 * the wheel it sits on; the band is what §5.5 sizes when no tire has a
 * diameter.
 */
export function tire(wheelDiameterMm: number, bandMm: number): BufferGeometry {
  const inner = wheelDiameterMm / 2 - 0.5
  const outer = wheelDiameterMm / 2 + bandMm / 2
  const halfWidth = 4.75
  const chamfer = Math.min(1, bandMm / 4)
  const t = new Triangles()
  t.revolve([
    [inner, -halfWidth],
    [outer - chamfer, -halfWidth],
    [outer, -halfWidth + chamfer],
    [outer, halfWidth - chamfer],
    [outer - chamfer, halfWidth],
    [inner, halfWidth]
  ], 16, 'x')
  return t.geometry()
}

/**
 * A front or rear stay: a wide FRP plate, broader at the roller end, sitting on
 * the moulded bumper. `thicknessMm` is `plateThicknessMm` when the part has
 * one. `towardNose` is +1 at the front and -1 at the rear, so the wide edge
 * faces outward on both.
 */
export function stay(thicknessMm: number, towardNose: 1 | -1): BufferGeometry {
  const out = 9 * towardNose
  const back = -9 * towardNose
  // Counter-clockwise from above either way round: the order flips with the end.
  const outline: Point2[] = [[-40, out], [-30, back], [30, back], [40, out]]
  if (towardNose > 0) outline.reverse()
  // On top of the bumper the socket marks, not through it.
  return plate(outline, 1, 1 + thicknessMm)
}

/** A side stay: a narrow plate along the car, holding a side roller. */
export function sideStay(thicknessMm: number): BufferGeometry {
  return plate([[-9, -22], [-9, 22], [9, 22], [9, -22]], 1, 1 + thicknessMm)
}

/** A brake: a plate with a sponge pad under it, both in one shape. */
export function brake(): BufferGeometry {
  const t = new Triangles()
  t.box(-20, -1, -7, 20, 1, 7)
  t.box(-18, -4, -6, 18, -1, 6)
  return t.geometry()
}

/** A mass damper: a cylindrical weight on a post. */
export function damper(): BufferGeometry {
  const t = new Triangles()
  t.revolve(cylinder(4.5, -5, 5), 12, 'y')
  t.revolve(cylinder(1, -6, 10), 6, 'y')
  return t.geometry()
}

/** The can's section: a 20 mm circle with flats top and bottom, 15 mm apart (the FA-130 envelope). */
const CAN_R = 10.05
const CAN_FLAT = 7.55
/** Points along each rounded side of the section, ends included. */
const CAN_ARC = 6

/**
 * One ring of the flat-sided can section at `z`, scaled about the axis for a
 * chamfer, counter-clockwise seen from +z: the right arc, the top flat, the
 * left arc and the bottom flat.
 */
function canRing(z: number, scale = 1): Point3[] {
  const r = CAN_R * scale
  const reach = Math.asin(CAN_FLAT / CAN_R)
  const ring: Point3[] = []
  for (const centre of [0, Math.PI]) {
    for (let i = 0; i <= CAN_ARC; i++) {
      const a = centre - reach + (2 * reach * i) / CAN_ARC
      ring.push([r * Math.cos(a), r * Math.sin(a), z])
    }
  }
  return ring
}

/**
 * The draw groups of `motor()`, in order. Only the first three change from
 * one motor to the next; the rest are the same on every motor Tamiya sells.
 */
export const MOTOR_GROUPS = ['cap', 'can', 'sticker', 'print', 'shaft', 'clip', 'terminals', 'vents'] as const
export type MotorGroup = (typeof MOTOR_GROUPS)[number]

/**
 * A motor, with its parts in the draw groups `MOTOR_GROUPS` names. Every Mini
 * 4WD motor is one shape in two layouts, so this one is drawn from the
 * product photos rather than as a proxy: a steel can with flats top and
 * bottom, vents in its rounded sides and a bearing boss at the front; the
 * plastic end bell behind it, the part whose colour names the motor; the
 * clear terminal clip over the joint with a brass tab either side; and the
 * sticker on the top flat, with two bands of print across it.
 *
 * `shafts` is 2 for the double-shaft PRO motor, whose shaft also leaves
 * through a boss in the end bell, and 1 for the FA-130 type the other
 * chassis carry. Drawn along the car with the front toward +z; a
 * single-shaft chassis' socket turns it across (sockets.ts). The sticker is
 * always drawn, so a bare can paints it in the can's colour rather than
 * needing a second geometry.
 */
export function motor(shafts: 1 | 2 = 2): BufferGeometry {
  const groups = Object.fromEntries(MOTOR_GROUPS.map(group => [group, new Triangles()])) as Record<MotorGroup, Triangles>
  const { cap, can, sticker, print, shaft, clip, terminals, vents } = groups
  const BACK = -12.5
  const JOINT = -7
  const FRONT = 12.5

  // The end bell, chamfered at the back, with its bearing boss.
  cap.solid([canRing(BACK, 0.9), canRing(BACK + 0.8), canRing(JOINT)])
  cap.revolve(cylinder(shafts === 2 ? 4.2 : 3.2, BACK - 1.2, BACK), 10, 'z')
  // The can, a touch proud of the end bell where it is crimped on, with the
  // front shoulder and the boss the shaft leaves through.
  can.solid([canRing(JOINT, 1.02), canRing(JOINT + 1, 1.02), canRing(JOINT + 1), canRing(FRONT - 1.2), canRing(FRONT, 0.88)])
  can.revolve(cylinder(3, FRONT, FRONT + 1.5), 10, 'z')
  shaft.revolve(cylinder(1, shafts === 2 ? BACK - 8.5 : FRONT, FRONT + 8.5), 8, 'z')

  // The sticker on the top flat, and its print: a name band and a logo band.
  const top = CAN_FLAT
  sticker.box(-6, top, -3, 6, top + 0.2, 10)
  print.box(-5, top + 0.2, -1.5, 5, top + 0.3, 3.5)
  print.box(-5, top + 0.2, 5, 2, top + 0.3, 8.5)

  // The terminal clip over the joint, a brass tab standing either side of it.
  clip.box(-4, top, BACK + 0.5, 4, top + 2.4, -3.5)
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -5.6 : 4.2
    terminals.box(x0, top - 1.5, BACK + 2.4, x0 + 1.4, top + 3.2, BACK + 3)
  }

  // A vent in each rounded side, toward the front.
  for (const side of [-1, 1]) {
    const x0 = side < 0 ? -CAN_R - 0.35 : CAN_R
    vents.box(x0, -1.5, 6, x0 + 0.35, 1.5, 9.5)
  }

  return Triangles.grouped(MOTOR_GROUPS.map(group => groups[group]))
}

/** How one draw group is painted: a colour and whether it is metal. */
export type Paint = { colour: number; finish: 'metal' | 'plastic' }

const BRASS = 0xc9a24e
const CLIP = 0xe8eae4
const VENT = 0x2a2d31
const INK_DARK = 0x1f2124
const INK_LIGHT = 0xf0f1f2

/** Perceived lightness of a colour, 0 to 1, to pick print that reads on a sticker. */
function lightness(colour: number): number {
  const r = (colour >> 16) & 0xff
  const g = (colour >> 8) & 0xff
  const b = colour & 0xff
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255
}

/**
 * The paint for each of `motor()`'s draw groups, in `MOTOR_GROUPS` order.
 * `cap` is the end bell's colour, which every motor record carries; with no
 * `sticker` the can is bare, and the sticker and its print take the can's
 * colour so they vanish into it.
 */
export function motorPaints({ cap, sticker, can = STEEL }: { cap: number; sticker?: number; can?: number }): Paint[] {
  const bare = sticker === undefined
  const label = bare ? can : sticker
  const print = bare ? can : lightness(sticker) > 0.5 ? INK_DARK : INK_LIGHT
  const labelFinish = bare ? 'metal' : 'plastic'
  const paints: Record<MotorGroup, Paint> = {
    cap: { colour: cap, finish: 'plastic' },
    can: { colour: can, finish: 'metal' },
    sticker: { colour: label, finish: labelFinish },
    print: { colour: print, finish: labelFinish },
    shaft: { colour: STEEL, finish: 'metal' },
    clip: { colour: CLIP, finish: 'plastic' },
    terminals: { colour: BRASS, finish: 'metal' },
    vents: { colour: VENT, finish: 'plastic' }
  }
  return MOTOR_GROUPS.map(group => paints[group])
}
