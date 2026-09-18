/**
 * The shapes the 3D pane draws for wheels, tires, motors and gears, generated
 * from the part's specs (docs/PLAN.md §5.6). One function per proxy kind, not
 * per item: two wheels of one shape are the same call. Rollers, plates,
 * dampers, brakes and the hidden fittings are ./fittings.ts, drawn from the
 * rows in ../fittings.ts.
 *
 * Every shape is low-poly and dimensionally plausible, nothing more — the pane
 * is for an impression of the build, and the only reference we hold for any
 * part is one product photo. Units are millimetres, Y up, the car's nose
 * toward +Z. Wheels and tires spin about X, and each shape's
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
import { cylinder, onAxis, Triangles } from './mesh.ts'
import type { Point2, Point3 } from './mesh.ts'
import type { TireShape, WheelShape } from '../wheels.ts'

/**
 * A wheel: a rim barrel with a face recessed inside it, its spokes standing
 * from that face out to the lip, and an axle stub through the middle. One
 * revolve draws the barrel, the dish and the bore, so the shape a reader sees
 * — how deep the face sits and how many spokes cross it — is the two numbers
 * `WheelShape` carries for it and nothing else.
 *
 * Drawn with the face toward +x, which is the outboard side of the right-hand
 * wheel; the left socket turns 180° about y (`sockets.ts`) so both faces look
 * out of the car.
 */
export function wheel(shape: WheelShape): BufferGeometry {
  const r = shape.diameterMm / 2
  const hw = shape.widthMm / 2
  // The rim wall, and the hub the spokes stand on: fractions of the radius so
  // a ⌀17.5 small wheel and a ⌀26.5 large one keep the same proportions.
  const ri = r - Math.max(1.6, r * 0.11)
  const hub = Math.max(2.6, r * 0.22)
  const face = hw - shape.dishMm
  const t = new Triangles()
  // Inboard back, outer barrel, outboard lip, and down the inside to the face.
  t.revolve([[hub, -hw], [r, -hw], [r, hw], [ri, hw], [ri, face], [hub, face]], 16, 'x')
  if (shape.spokes) teeth(t, shape.spokes, hub, ri, face, hw, 'x', [0, 0, 0])
  t.revolve(cylinder(1.5, -hw - 1, hw + 1), 6, 'x')
  return t.geometry()
}

/**
 * A tire: an annulus around the wheel it seats on, chamfered at the shoulder.
 * `shape` is the tire's own size — Tamiya's ⌀24, ⌀26 or ⌀31, not a band added
 * to the rim — so a reader who puts large tires on small wheels sees a tall
 * sidewall rather than a tire that moved. The shoulder is what separates an
 * arched tire from a slick at this size.
 *
 * `wheel` is the rim under it, which decides two things: where the inner face
 * seats, and that the tire is at least a little wider than the rim, the way a
 * real one covers it. Without that last part a ⌀12 rim in a ⌀12 tire puts the
 * lip and the sidewall on the same plane, and the two flicker against each
 * other as the car turns.
 */
export function tire(shape: TireShape, wheel: WheelShape): BufferGeometry {
  const inner = wheel.diameterMm / 2 - 0.5
  // A tire smaller than the wheel under it is a mismatched pair, not a shape:
  // keep a visible sidewall rather than turning the profile inside out.
  const outer = Math.max(shape.diameterMm / 2, inner + 1)
  const halfWidth = Math.max(shape.widthMm, wheel.widthMm + 0.6) / 2
  const chamfer = Math.min(shape.shoulderMm, (outer - inner) * 0.8, halfWidth * 0.8)
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

/**
 * `count` teeth about an axis, each a small prism standing from radius `r0`
 * out to `r1` and from `h0` to `h1` along the axis, narrower at the tip than
 * the root. Radial teeth on a disc make a spur gear; a ring of them standing
 * on one face makes a crown gear.
 */
export function teeth(t: Triangles, count: number, r0: number, r1: number, h0: number, h1: number, axis: 'x' | 'y' | 'z', origin: Point3) {
  // At the root a tooth fills half its pitch, the gap the other half.
  const half = Math.PI / count / 2
  for (let i = 0; i < count; i++) {
    const a = (i / count) * Math.PI * 2
    const footprint: Point2[] = [[r0, a - half], [r1, a - half * 0.55], [r1, a + half * 0.55], [r0, a + half]]
      .map(([r, angle]) => [r! * Math.cos(angle!), r! * Math.sin(angle!)] as const)
    const ring = (h: number) => footprint.map(([u, v]) => onAxis(axis, origin, [u, v, h]))
    t.solid([ring(h0), ring(h1)])
  }
}

/** A spur gear: a disc of `count` teeth whose tips reach `r`, from `h0` to `h1` along its axis. */
function spur(t: Triangles, count: number, r: number, h0: number, h1: number, axis: 'x' | 'y' | 'z', origin: Point3) {
  const depth = Math.min(1.2, r * 0.25)
  // The disc a little past the teeth's root, so no seam shows between them.
  t.revolve(cylinder(r - depth + 0.3, h0, h1), count, axis, origin)
  teeth(t, count, r - depth, r, h0, h1, axis, origin)
}

/**
 * The draw groups of every gear-train rotor: the moulded gears, whose colour is
 * what a gear set is sold by, and the steel pins they turn on.
 */
export const GEAR_GROUPS = ['gears', 'pins'] as const

/**
 * One piece of a gear train that turns as a whole, so the pane can switch the
 * car on (docs/PLAN.md §5.6). `geometry` is in `GEAR_GROUPS`' draw groups and
 * built about `pivot`, which lies on `axis`: a mesh placed at `pivot` and
 * turned about that axis spins in place. `rate` is its turns per turn of the
 * axle, in the socket's own frame and signed by the right-hand rule about
 * +axis, where an axle turning +1 about +x rolls the car toward its nose.
 * The rates come from the teeth as drawn rather than any real ratio, so the
 * teeth are seen to mesh. The pins are a rotor that holds still.
 */
export type Rotor = {
  name: 'axle' | 'counter' | 'pinion' | 'pins'
  geometry: BufferGeometry
  pivot: Point3
  axis: 'x' | 'z'
  rate: number
}

function rotor(name: Rotor['name'], pivot: Point3, axis: Rotor['axis'], rate: number, gears: Triangles, pins = new Triangles()): Rotor {
  const geometry = Triangles.grouped([gears, pins]).translate(-pivot[0], -pivot[1], -pivot[2])
  return { name, geometry, pivot, axis, rate }
}

/**
 * Which side of the car's centre line a gear set's train is on, -1 left or +1
 * right: the left at the front and the right at the rear for PRO, the other
 * way round for a single-shaft crown gear. One shaft turning one way drives
 * both axles forward only if the gears it turns face it from opposite sides,
 * the way the real gear covers sit diagonally; mirrored front to back instead,
 * the rear axle ran backwards (generators.test.ts). The scene's outline and
 * hit volume for a gear set follow the same side.
 */
export const gearSide = (shafts: 1 | 2, towardNose: 1 | -1): 1 | -1 => shafts === 2 ? -towardNose as 1 | -1 : towardNose

/** The span `from`…`to` out from the centre line on `side`, in increasing order. */
const across = (side: 1 | -1, from: number, to: number) => side < 0 ? [-to, -from] as const : [from, to] as const

/** A PRO train's gears, as drawn: the axle spur, the counter gear's spur and crown, the pinion. */
const PRO_TEETH = { axle: 14, counterSpur: 10, counterCrown: 14, pinion: 6 } as const
/** The counter gear turns the other way from the axle, and faster by the spur pair's teeth. */
const PRO_COUNTER = -PRO_TEETH.axle / PRO_TEETH.counterSpur
const PRO_PINION = -PRO_COUNTER * PRO_TEETH.counterCrown / PRO_TEETH.pinion

/**
 * The gear set at one axle, drawn from its socket on the axle's centre line.
 * `towardNose` is +1 at the front axle and -1 at the rear, which says which
 * way the motor lies.
 *
 * PRO (`shafts` 2): the motor lies along the car and each end of its shaft
 * carries a pinion, which turns the crown face of a counter gear, whose small
 * spur turns the spur gear on the axle — the whole train, between the two
 * housings the chassis draws. Positions follow the socket table's mid motor
 * (shaft tips 21 mm either side of centre, 6 mm above the axles) on the
 * 80 mm wheelbase all three PRO chassis share.
 *
 * Single-shaft (`shafts` 1): the propeller shaft's bevel meets a crown gear on
 * the axle, beside the housing; the motor pinion and counter gear are the
 * counter-gear slot's, at the motor (`counterGear()`).
 */
export function gearSet(shafts: 1 | 2, towardNose: 1 | -1): Rotor[] {
  if (shafts === 2) {
    // The motor is toward the car's middle: -z at the front axle, +z at the rear.
    const inward = -towardNose
    const side = gearSide(2, towardNose)
    const axle = new Triangles()
    spur(axle, PRO_TEETH.axle, 7.5, ...across(side, 6, 9), 'x', [0, 0, 0])
    const counterAt: Point3 = [0, 6, 12 * inward]
    const counter = new Triangles()
    spur(counter, PRO_TEETH.counterSpur, 5.5, ...across(side, 6, 9), 'x', counterAt)
    counter.revolve(cylinder(7.5, ...across(side, 4.5, 6)), 14, 'x', counterAt)
    teeth(counter, PRO_TEETH.counterCrown, 5.5, 7.5, ...across(side, 3, 4.5), 'x', counterAt)
    const pins = new Triangles()
    pins.revolve(cylinder(1, ...across(side, 1.5, 10.5)), 6, 'x', counterAt)
    // The pinion on the motor shaft, against the crown face.
    const [z0, z1] = [17 * inward, 20 * inward].sort((a, b) => a - b)
    const pinionAt: Point3 = [0, 6, 0]
    const pinion = new Triangles()
    spur(pinion, PRO_TEETH.pinion, 2.2, z0!, z1!, 'z', pinionAt)
    return [
      rotor('axle', [0, 0, 0], 'x', 1, axle),
      rotor('counter', counterAt, 'x', PRO_COUNTER, counter),
      rotor('pinion', pinionAt, 'z', PRO_PINION, pinion),
      rotor('pins', [0, 0, 0], 'x', 0, new Triangles(), pins)
    ]
  }
  const side = gearSide(1, towardNose)
  const crown = new Triangles()
  crown.revolve(cylinder(9, ...across(side, 5.2, 6.7)), 16, 'x')
  teeth(crown, 16, 6.5, 9, ...across(side, 4, 5.2), 'x', [0, 0, 0])
  crown.revolve(cylinder(2.5, ...across(side, 6.7, 8.7)), 8, 'x')
  return [rotor('axle', [0, 0, 0], 'x', 1, crown)]
}

/**
 * A single-shaft chassis' counter gear, drawn from the motor socket before the
 * socket turns the motor across the car, so the motor's shaft runs along +x
 * here: the pinion on the shaft and the counter gear it turns, on a steel pin,
 * toward the axle the motor is nearer (`towardNose`).
 *
 * The counter gear turns the propeller shaft through a crown the pane does
 * not draw, so nothing on screen fixes its speed or its direction: it turns 2
 * for the axle's 1, the way the axles turn, and the pinion 4, a stock 4:1.
 */
export function counterGear(towardNose: 1 | -1): Rotor[] {
  const pinion = new Triangles()
  spur(pinion, 8, 2.4, 18, 21, 'x', [0, 0, 0])
  const counterAt: Point3 = [0, 5.5, 7.5 * towardNose]
  const counter = new Triangles()
  spur(counter, 16, 7, 18, 21.5, 'x', counterAt)
  const pins = new Triangles()
  pins.revolve(cylinder(1, 16, 23.5), 6, 'x', counterAt)
  return [
    rotor('pinion', [0, 0, 0], 'x', -4, pinion),
    rotor('counter', counterAt, 'x', 2, counter),
    rotor('pins', [0, 0, 0], 'x', 0, new Triangles(), pins)
  ]
}

/** The paint for each of `GEAR_GROUPS`: the gears in their colour, the pins in steel. */
export function gearPaints(colour: number): Paint[] {
  return [{ colour, finish: 'plastic' }, { colour: STEEL, finish: 'metal' }]
}
