/**
 * The shapes the 3D pane draws for rollers, plates, dampers, brakes and the
 * hidden fittings, each from its row in ../fittings.ts (docs/PLAN.md §5.6,
 * "The rest of the parts"). One function per table, not per item: a 19 mm
 * ringless ball-race roller and a 13 mm one are one row and two diameters.
 *
 * Every shape is in the draw groups `FITTING_GROUPS` names, so a part is
 * painted in its own colour where it is the product and in a fixed colour
 * where it is not: the plastic ring round an aluminium roller, the screw it
 * turns on, the rubber pad of a brake. Units are millimetres, Y up, nose
 * toward +Z, each shape's origin its socket (../sockets.ts). Built on
 * ./mesh.ts for the same reason ./parts.ts is: no lathe, extrude or merge
 * helper from three reaches the 3D chunk.
 */
import type { BufferGeometry } from 'three'
import { STEEL } from './chassis.ts'
import { cylinder, Triangles, wound } from './mesh.ts'
import type { Point2 } from './mesh.ts'
import { teeth } from './parts.ts'
import type { Paint, PaintFinish } from './parts.ts'
import { UPPER_ROLLER_MM } from '../fittings.ts'
import type {
  AxleShape, BearingShape, BrakeShape, ChassisUnitShape, DamperShape, PlateShape, PropellerShape, RollerShape
} from '../fittings.ts'

/**
 * `body` is the part itself, in its recorded colour and finish; `trim` is
 * moulded plastic that goes with it (a roller's ring, a damper's bracket, a
 * brake's sponge); `steel` the screws and pins; `rubber` a rubber ring or pad.
 */
export const FITTING_GROUPS = ['body', 'trim', 'steel', 'rubber'] as const
type Group = (typeof FITTING_GROUPS)[number]
type Groups = Record<Group, Triangles>

const TRIM = 0x2a2d31
const SPONGE = 0x8e949b
const RUBBER = 0x1d1f22

function groups(): Groups {
  return Object.fromEntries(FITTING_GROUPS.map(group => [group, new Triangles()])) as Groups
}
const grouped = (g: Groups) => Triangles.grouped(FITTING_GROUPS.map(group => g[group]))

/**
 * The paint for each of `FITTING_GROUPS`. `trim` is the moulding that is not
 * the product: dark plastic, or a brake's sponge, whose colour a sponge set
 * that is only a sponge paints as its body instead.
 */
export function fittingPaints(colour: number, finish: PaintFinish, trim = TRIM): Paint[] {
  return [
    { colour, finish },
    { colour: trim, finish: 'plastic' },
    { colour: STEEL, finish: 'metal' },
    { colour: RUBBER, finish: 'plastic' }
  ]
}
/** A brake's trim is its sponge. */
export const brakePaints = (colour: number, finish: PaintFinish = 'plastic') => fittingPaints(colour, finish, SPONGE)
/** Bare aluminium, the roller under a coloured ring. */
const ALUMINIUM = 0xc9ced6
/** A roller's paint: its own colour, or a bare aluminium roller in a ring of that colour. */
export const rollerPaints = (shape: RollerShape, colour: number) =>
  shape.colourOnRing ? fittingPaints(ALUMINIUM, 'metal', colour) : fittingPaints(colour, shape.finish)

/** The steel race round the screw, `radius` across, standing just proud of a face `h` from the middle. */
const raceProfile = (radius: number, h: number): Point2[] => [[1.1, -h - 0.2], [radius, -h - 0.2], [radius, h + 0.2], [1.1, h + 0.2]]

/**
 * A sealed ball bearing `radius` across the outside, flat-faced and square:
 * its outer ring in `ring` with the edges broken, the black seal set back
 * between the rings, which is what reads as a bearing, and the steel inner
 * ring standing just proud round the screw.
 */
function sealedBearing(g: Groups, ring: Triangles, radius: number, h: number) {
  const seal = radius * 0.8
  // Never thinner than the screw it turns on can show round.
  const inner = Math.max(radius * 0.5, 1.6)
  const edge = Math.min(0.35, h * 0.2, radius * 0.1)
  ring.revolve([[seal, -h], [radius - edge, -h], [radius, -h + edge], [radius, h - edge], [radius - edge, h], [seal, h]], 16, 'y')
  g.rubber.revolve([[inner - 0.1, -h + edge], [seal + 0.1, -h + edge], [seal + 0.1, h - edge], [inner - 0.1, h - edge]], 16, 'y')
  g.steel.revolve(raceProfile(inner, h), 10, 'y')
}

/**
 * A roller at `mm` across, turning about y on its screw: one tier or two, a
 * taper, a moulded roller's rounded rim, a ring round the outside, spokes
 * across a recessed face, the steel race in its bore or a sealed bearing's
 * face (the whole roller, for a bare one), and a pole standing out of it for
 * the kind that has one.
 */
export function roller(shape: RollerShape, mm: number): BufferGeometry {
  const g = groups()
  const r = mm / 2
  const h = shape.heightMm / 2
  // A sealed bearing in the bore is half the face, as in the photos, so its seal reads.
  const race = shape.race ? Math.min(3.5, r * (shape.seal === 'bore' ? 0.5 : 0.4)) : 0
  const bore = race || 1
  const top = r - (shape.bowl ? 0 : shape.taperMm ?? 0)
  const bottom = r - (shape.bowl ? shape.taperMm ?? 0 : 0)
  if (shape.seal === 'bare') {
    sealedBearing(g, g.body, r, h)
  } else if (shape.rounded) {
    // A moulded roller: the rim rounded right over, top and bottom, and each
    // face dished between it and a raised hub, so it reads soft beside the
    // square edges of an aluminium roller or a bearing.
    const round = Math.min(h, r * 0.3)
    const rim = r - round
    const dish = Math.min(0.5, h * 0.25)
    const hub = Math.max(bore + 0.8, r * 0.35)
    const arc = (y: number, from: number, to: number): Point2[] => Array.from({ length: 4 }, (_, i) => {
      const a = from + ((to - from) * i) / 3
      return [rim + round * Math.cos(a), y + round * Math.sin(a)] as const
    })
    const outside = [...arc(-h + round, -Math.PI / 2, 0), ...arc(h - round, 0, Math.PI / 2)]
      // A rim rounded the full height meets itself at the equator: one point, not a zero-length side.
      .filter((p, k, all) => k === 0 || Math.hypot(p[0] - all[k - 1]![0], p[1] - all[k - 1]![1]) > 1e-6)
    g.body.revolve([
      [bore, -h], [hub, -h], [hub + 0.3, -h + dish], [rim - 0.3, -h + dish],
      ...outside,
      [rim - 0.3, h - dish], [hub + 0.3, h - dish], [hub, h], [bore, h]
    ], 16, 'y')
  } else if (shape.lowerMm !== undefined) {
    // A spool: a flange top and bottom, the lower that much smaller, and a
    // waist between them deep enough to read at pane size.
    const lower = r - shape.lowerMm / 2
    const flange = h * 0.38
    const waist = Math.max(bore + 0.8, Math.min(r, lower) - 2.2)
    g.body.revolve([
      [bore, -h], [lower, -h], [lower, -h + flange], [waist, -h + flange * 1.4],
      [waist, h - flange * 1.4], [r, h - flange], [r, h], [bore, h]
    ], 16, 'y')
    if (shape.ringMm) {
      // A rubber ring round each flange.
      for (const [radius, h0, h1] of [[r, h - flange, h], [lower, -h, -h + flange]] as const) {
        g.rubber.revolve([[radius - 0.2, h0 + 0.2], [radius + shape.ringMm, h0 + 0.2], [radius + shape.ringMm, h1 - 0.2], [radius - 0.2, h1 - 0.2]], 16, 'y')
      }
    }
  } else if (shape.spokes) {
    // A face recessed to half the height, spokes standing across it to the rim.
    const rim = Math.max(bore + 1, r - 1.4)
    g.body.revolve([[bore, -h], [bottom, -h], [top, h], [rim, h], [rim, 0], [bore, 0]], 16, 'y')
    teeth(g.body, shape.spokes, bore, rim, 0, h, 'y', [0, 0, 0])
  } else {
    g.body.revolve([[bore, -h], [bottom, -h], [top, h], [bore, h]], 16, 'y')
  }
  // A ring round the middle of a single roller, standing a little proud of it.
  if (shape.ringMm && shape.lowerMm === undefined) {
    const inner = Math.min(top, bottom) - 0.2
    const ring = shape.finish === 'metal' ? g.trim : g.rubber
    ring.revolve([[inner, -h * 0.7], [inner + shape.ringMm, -h * 0.7], [inner + shape.ringMm, h * 0.7], [inner, h * 0.7]], 16, 'y')
  }
  if (shape.seal === 'bore') sealedBearing(g, g.steel, race, h)
  else if (race && shape.seal !== 'bare') g.steel.revolve(raceProfile(race, h), 10, 'y')
  // The screw it turns on, standing through it.
  g.steel.revolve(cylinder(1, -h - 1.5, h + 1.5), 6, 'y')
  if (shape.poleMm) g.body.revolve([[0, h], [2.4, h], [2.4, h + shape.poleMm - 1], [1.6, h + shape.poleMm], [0, h + shape.poleMm]], 8, 'y')
  return grouped(g)
}

/** The pieces of one plate layer, the right half mirrored unless it is a side stay, at the end `towardNose` faces. */
function layer(into: Triangles, pieces: PlateShape['pieces'], side: boolean, towardNose: 1 | -1, y0: number, y1: number) {
  for (const piece of pieces) {
    const halves = side ? [piece] : [piece, piece.map(([x, z]) => [-x, z] as const)]
    for (const half of halves) into.plate(wound(half.map(([x, z]) => [x, z * towardNose] as const)), y0, y1)
  }
}

/**
 * A stay from its row, lying on top of the socket (the bumper the socket
 * marks), `thicknessMm` thick: its pieces, its raised or lowered decks, the
 * posts carrying an upper roller deck, and a sliding damper's springs.
 * `towardNose` is +1 at the front and -1 at the rear; rows are authored for
 * the front and mirrored in z for the rear.
 */
export function plate(shape: PlateShape, thicknessMm: number, towardNose: 1 | -1): BufferGeometry {
  const g = groups()
  const side = !!shape.side
  const top = 1 + thicknessMm
  layer(g.body, shape.pieces, side, towardNose, 1, top)
  for (const deck of shape.layers ?? []) layer(g.body, deck.pieces, side, towardNose, deck.y, deck.y + thicknessMm)
  const upper = shape.layers?.find(deck => deck.y > top)
  for (const [x, z, tiers] of shape.holes ?? []) {
    if (tiers !== 2) continue
    // With an upper deck, a post inboard of each upper roller carries it. With
    // none, the pair is stacked on one screw through the hole, so that is what
    // stands there — up through both rollers, and proud of the upper one.
    const [r, from, to] = upper ? [1.2, top, upper.y] : [1.1, 1, top + UPPER_ROLLER_MM + 3]
    const inboard = upper ? 6 : 0
    for (const sign of side ? [1] : [-1, 1]) g.steel.revolve(cylinder(r, from, to), 6, 'y', [sign * (x - inboard), 0, z * towardNose])
  }
  const sprung = shape.layers?.[0]
  for (const [x, z] of shape.springs ?? []) {
    if (!sprung) break
    for (const sign of [-1, 1]) spring(g.steel, [sign * x, top, z * towardNose], 2.2, sprung.y - top)
  }
  return grouped(g)
}

/** A coil spring standing on `base`: three turns as rings, which is what one reads as at this size. */
function spring(into: Triangles, [x, y, z]: readonly [number, number, number], r: number, height: number) {
  const turns = 3
  const pitch = height / turns
  for (let i = 0; i < turns; i++) {
    const h0 = y + i * pitch
    into.revolve([[r - 0.6, h0], [r, h0], [r, h0 + pitch * 0.6], [r - 0.6, h0 + pitch * 0.6]], 8, 'y', [x, 0, z])
  }
}

/**
 * A damper-slot part at its mount. At an end, a mass damper is a pair across
 * a bracket; at a side or a corner the socket is already one of a mirrored
 * pair, so the part is drawn once.
 */
export function damper(shape: DamperShape, span = 0): BufferGeometry {
  const g = groups()
  const { w, h, d } = shape
  const pair = shape.mount === 'end' ? [-13, 13] : [0]
  switch (shape.form) {
    case 'weights':
      // A cylinder on a post at each end of a bracket across the car.
      g.trim.box(-17, -h / 2 - 2, -3, 17, -h / 2 - 0.5, 3)
      for (const x of pair) {
        g.body.revolve(cylinder(w / 2, -h / 2, h / 2), 12, 'y', [x, 0, 0])
        g.steel.revolve(cylinder(1, -h / 2 - 2, h / 2 + 1.5), 6, 'y', [x, 0, 0])
      }
      break
    case 'blocks':
      for (const x of pair) g.body.boxAt(w, h, d, x, 0, 0)
      if (pair.length > 1) g.trim.box(-17, -h / 2 - 1.5, -3, 17, -h / 2, 3)
      break
    case 'plate-weight':
      // A carbon plate across the end, a ball-connected block hanging under each side.
      g.trim.box(-18, h / 2, -6, 18, h / 2 + 1.5, 6)
      for (const x of pair) {
        g.body.boxAt(w, h, d * 0.6, x, 0, 0)
        g.steel.revolve(cylinder(1.5, h / 2 - 1, h / 2 + 0.2), 8, 'y', [x, 0, 0])
      }
      break
    case 'stack':
      // Stacked 2.5 g discs on a post.
      for (const x of pair) {
        for (let i = 0; i < 3; i++) g.body.revolve(cylinder(w / 2, -h / 2 + (i * h) / 3, -h / 2 + ((i + 0.8) * h) / 3), 12, 'y', [x, 0, 0])
        g.steel.revolve(cylinder(1, -h / 2 - 1.5, h / 2 + 1.5), 6, 'y', [x, 0, 0])
      }
      break
    case 'pole':
      // A steel rod standing on the stay, the ball that rides the fence on top.
      g.steel.revolve(cylinder(1, 0, h - w / 2), 6, 'y')
      g.body.revolve([[0, h - w], [w * 0.3, h - w], [w / 2, h - w / 2], [w * 0.3, h], [0, h]], 10, 'y')
      break
    case 'head':
      // A short post and the wide head that rides the fence.
      g.steel.revolve(cylinder(1.2, 0, h * 0.6), 6, 'y')
      g.body.revolve([[0, h * 0.5], [w / 2, h * 0.5], [w / 2, h * 0.8], [w / 2 - 1, h], [0, h]], 14, 'y')
      break
    case 'cap': {
      // A ball on a short neck, screwed onto the top of a roller's screw; `span` is the bare screw under it.
      const r = w / 2
      const neck = h - w
      const ball: Point2[] = Array.from({ length: 7 }, (_, i) => {
        const a = -Math.PI / 3 + (Math.PI * 5 / 6) * i / 6
        return [r * Math.cos(a), neck + r + r * Math.sin(a)] as const
      })
      g.body.revolve([[0, 0], [r * 0.55, 0], [r * 0.55, neck], ...ball], 12, 'y')
      if (span > 0) g.steel.revolve(cylinder(1, -span, 0), 6, 'y')
      break
    }
    case 'tube':
      g.body.revolve(cylinder(w / 2, 0, h), 12, 'y')
      g.steel.revolve(cylinder(1, h, h + 1.5), 6, 'y')
      break
    case 'springs':
      for (const x of pair) spring(g.steel, [x, -h / 2, 0], w / 2, h)
      break
  }
  return grouped(g)
}

/** A brake: the plate it is cut into and the pad under it, or a sponge alone, which is then the body. */
export function brake(shape: BrakeShape): BufferGeometry {
  const g = groups()
  const [pw, pd, t] = shape.pad
  if (shape.plate) {
    const [w, d] = shape.plate
    g.body.box(-w / 2, -1, -d / 2, w / 2, 1, d / 2)
    ;(shape.rubber ? g.rubber : g.trim).box(-pw / 2, -1 - t, -pd / 2, pw / 2, -1, pd / 2)
  } else {
    g.body.box(-pw / 2, -1 - t, -pd / 2, pw / 2, -1, pd / 2)
  }
  return grouped(g)
}

/** An axle across one end, `span` long, turning about x with its wheels. */
export function axle(shape: AxleShape, span: number): BufferGeometry {
  const g = groups()
  g.body.revolve(cylinder(shape.radiusMm, -span / 2, span / 2), shape.sides, 'x')
  return grouped(g)
}

/** A bearing or bushing on the axle inboard of a wheel, its race showing where it has one. */
export function bearing(shape: BearingShape): BufferGeometry {
  const g = groups()
  const r = shape.outerMm / 2
  const hw = shape.widthMm / 2
  g.body.revolve([[1.1, -hw], [r, -hw], [r, hw], [1.1, hw]], 12, 'x')
  if (shape.race) g.steel.revolve([[1.1, -hw - 0.15], [r * 0.6, -hw - 0.15], [r * 0.6, hw + 0.15], [1.1, hw + 0.15]], 10, 'x')
  return grouped(g)
}

/**
 * A single-shaft chassis' propeller shaft along the car, `span` between its
 * two bevels, which stand at each end where they meet the crown gears.
 */
export function propellerShaft(shape: PropellerShape, span: number): BufferGeometry {
  const g = groups()
  g.body.revolve(cylinder(shape.radiusMm, -span / 2, span / 2), 6, 'z')
  for (const z of [-span / 2, span / 2]) g.steel.revolve(cylinder(4, z - 1, z + 1), 8, 'z')
  return grouped(g)
}

/**
 * A part that adds a piece at the motor, drawn about the motor's centre: the
 * aluminium support a Super-II motor sits on, or the shield over its can. A
 * repaint-only unit draws nothing here; the chassis is repainted instead.
 */
export function chassisUnit(shape: ChassisUnitShape): BufferGeometry {
  const g = groups()
  if (shape.piece === 'motor-support') {
    g.body.box(-15, -10, -8, 15, -8.5, 8)
    for (const x of [-15, 13.5]) g.body.box(x, -8.5, -8, x + 1.5, 2, 8)
  } else if (shape.piece === 'cooling-shield') {
    g.body.box(-12, 9, -13, 12, 10, 13)
    for (const x of [-12, 11]) g.body.box(x, 2, -13, x + 1, 9, 13)
  }
  return grouped(g)
}
