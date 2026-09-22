/**
 * What each roller, plate, damper, brake and hidden fitting is, as numbers
 * the generators in ./generators/fittings.ts draw (docs/PLAN.md §5.6, "The
 * rest of the parts").
 *
 * One table per kind of socket, keyed by a row id the part record carries as
 * `fitting` (scripts/catalog/fittings.ts reads it out of the product name).
 * The ids share one namespace, so a part that fills two kinds of socket — a
 * wide sliding damper is a stay in a stay slot and a spring pair in the
 * damper slot — names one id that both tables hold. A part with no row in the
 * table its socket reads draws that table's default, exactly as a kit with no
 * silhouette draws the wedge.
 *
 * This module holds no three.js and no Zod: the scene imports it into the 3D
 * chunk, sockets.ts reads the plates' roller holes from it, and
 * `catalog:generate` and `catalog:verify` import it in Node.
 *
 * **Plates are authored from the front.** Millimetres from the stay socket,
 * x to the right and z toward the end of the car the plate is on, so one row
 * serves the front and the rear: the rear socket mirrors it in z. A piece is a
 * convex outline of the right half (x ≥ 0), mirrored in x — the triangle
 * helper fans convex outlines only, and a cut-out is the gap between two
 * pieces, the way the chassis' bumpers are built. Side stays are authored for
 * the right-hand side with x outward. Sizes are read off the product photos
 * against the 105 mm envelope and the roller posts they bolt over; a `?`
 * beside a row marks an outline chosen for a set of several plates, where
 * the name says which job it does but not which of its plates a reader
 * fits first.
 */
import type { Point2 } from './generators/mesh.ts'

/**
 * A roller, drawn about a vertical axis at the socket. `mm` is the diameter
 * when the record has no `rollerDiameterMm`; a record's own wins. `lowerMm`
 * makes it a double roller — a spool, a flange at the top and one at the
 * bottom with a deep waist between, the lower flange that much smaller (a
 * 13-12 is ⌀13 over ⌀12; 0 for a 13-13).
 */
export type RollerShape = {
  mm: number
  heightMm: number
  lowerMm?: number
  /** A plastic or rubber ring round the outside, its radial thickness. */
  ringMm?: number
  /** Spokes across the face; 0 is a solid face. */
  spokes: number
  /** How much smaller the top is than the bottom: a tapered roller, or with `bowl` a flared one. */
  taperMm?: number
  bowl?: true
  /** The steel ball race in the bore, which is what a ball-race roller is sold by. */
  race: boolean
  /**
   * A moulded roller's profile: the rim rounded right over, the face dished
   * round a raised hub. Without it a single roller is flat-sided with square
   * edges, which is what tells aluminium and a bare bearing from plastic.
   * This and a `bare` seal each replace the whole profile, so a row with
   * either draws no taper, spokes or second tier.
   */
  rounded?: true
  /**
   * The race is a sealed ball bearing and its face shows: an outer ring with
   * its edges broken, the black rubber seal set back inside it, and the steel
   * inner ring. `bare` is a bearing bolted on as the roller, its outer ring
   * the whole roller in the part's own colour; `bore` is a bearing pressed
   * into a roller's body, in a steel outer ring.
   */
  seal?: 'bare' | 'bore'
  /** A stabilising pole standing up out of the roller, its height. */
  poleMm?: number
  finish: 'metal' | 'plastic'
  /**
   * The part's recorded colour is its plastic ring's, and the roller itself
   * is bare aluminium: "19mm ALUMINUM ROLLERS (5 SPOKES) w/PLASTIC RINGS
   * (RED)" is a silver roller in a red ring, read off the product photos.
   */
  colourOnRing?: true
}

export const ROLLERS: Record<string, RollerShape> = {
  // The moulded rollers every kit ships, and plain low-friction plastic ones.
  'plastic': { mm: 13, heightMm: 4, spokes: 0, race: false, rounded: true, finish: 'plastic' },
  'plastic-bearing': { mm: 13, heightMm: 4.5, spokes: 0, race: true, seal: 'bore', finish: 'plastic' },
  'plastic-double': { mm: 13, heightMm: 9, lowerMm: 1, spokes: 0, race: false, finish: 'plastic' },
  'plastic-double-even': { mm: 13, heightMm: 9, lowerMm: 0, spokes: 0, race: false, finish: 'plastic' },
  'plastic-double-rubber': { mm: 13, heightMm: 9, lowerMm: 1, ringMm: 0.8, spokes: 0, race: false, finish: 'plastic' },
  'aluminium-double': { mm: 13, heightMm: 8.5, lowerMm: 1, spokes: 0, race: false, finish: 'metal' },
  'aluminium-double-rubber': { mm: 13, heightMm: 8.5, lowerMm: 1, ringMm: 0.8, spokes: 0, race: false, finish: 'metal' },
  // Aluminium ball-race rollers, told apart by their face and their profile.
  'ball-race': { mm: 19, heightMm: 5, spokes: 0, race: true, finish: 'metal' },
  'ball-race-tapered': { mm: 19, heightMm: 5, taperMm: 2, spokes: 0, race: true, finish: 'metal' },
  'ball-race-bowl': { mm: 11, heightMm: 5, taperMm: 2, bowl: true, spokes: 0, race: true, finish: 'metal' },
  'ball-race-3-spoke': { mm: 17, heightMm: 5, spokes: 3, race: true, finish: 'metal' },
  'ball-race-5-spoke': { mm: 19, heightMm: 5, spokes: 5, race: true, finish: 'metal' },
  'ball-race-6-spoke': { mm: 19, heightMm: 5, ringMm: 1.2, spokes: 6, race: true, finish: 'metal', colourOnRing: true },
  'ball-race-5-spoke-ring': { mm: 19, heightMm: 5, ringMm: 1.2, spokes: 5, race: true, finish: 'metal', colourOnRing: true },
  // Aero-spoke is seven curved spokes; straight ones at this size. ?
  'ball-race-aero': { mm: 19, heightMm: 5, spokes: 7, race: true, finish: 'metal' },
  'aluminium-ring': { mm: 19, heightMm: 5, ringMm: 1.2, spokes: 0, race: true, finish: 'metal', colourOnRing: true },
  // A bare ball bearing bolted on as a roller: all race, no body.
  'bearing': { mm: 13, heightMm: 4, spokes: 0, race: true, seal: 'bare', finish: 'metal' },
  // A roller with a stabilising pole standing out of its top.
  'pole-roller': { mm: 13, heightMm: 4, spokes: 0, race: false, rounded: true, poleMm: 14, finish: 'plastic' },
  // A skid roller rides the track, not the fence, so it is wide and low.
  'skid-roller': { mm: 9, heightMm: 8, spokes: 0, race: false, finish: 'metal' },
  // Down-thrust rollers are tapered steeply to press the car down.
  'down-thrust': { mm: 13, heightMm: 5, taperMm: 3, spokes: 0, race: true, finish: 'metal' },
  // The add-ons draw what they are, for a link that fills a roller slot with one.
  'o-ring': { mm: 19, heightMm: 1.5, ringMm: 1.5, spokes: 0, race: false, finish: 'plastic' },
  'pipe': { mm: 5, heightMm: 5, spokes: 0, race: false, finish: 'metal' },
  'spacer': { mm: 5, heightMm: 1.5, spokes: 0, race: false, finish: 'metal' },
  'mount': { mm: 6, heightMm: 3, spokes: 0, race: false, finish: 'metal' }
}
export const DEFAULT_ROLLER = 'plastic'

/**
 * A roller mount on a plate: where, relative to the stay socket, and whether a
 * second roller stands above the first on a raised deck — a double-roller
 * stay's upper and lower pair.
 */
export type Hole = readonly [x: number, z: number, tiers?: 1 | 2]

/** How far above the lower roller an upper one sits (the deck carrying it is a `layer`). */
export const UPPER_ROLLER_MM = 12
/** From a roller's socket up to where its screw stands proud of it: the head, or whatever caps it. */
export const ROLLER_TOP_MM = 3

export type PlateShape = {
  /** Convex outlines of the right half, mirrored in x. */
  pieces: readonly (readonly Point2[])[]
  /** When the record has no `plateThicknessMm`. */
  thicknessMm: number
  /**
   * Roller mounts on the right, mirrored. Absent means the plate bolts on over
   * the chassis' own roller posts and the rollers stay where they were.
   */
  holes?: readonly Hole[]
  /** Further decks at another height, `y` from the socket: an upper roller deck, a sprung sub-plate, a brake tab. */
  layers?: readonly { y: number; pieces: readonly (readonly Point2[])[] }[]
  /** Springs standing between the plate and its first layer, a sliding damper's; right half, mirrored. */
  springs?: readonly Point2[]
  /** How far out from the socket a brake sponge sits under this plate, when it carries one. */
  brakeZ?: number
  /** A side stay, x outward; the front and rear sockets draw the default outline for one. */
  side?: true
  /** The chassis' moulded bumper at this end is cut away and this unit replaces it. */
  replacesBumper?: true
}

/** The mounting tongue every stay has where it bolts to the bumper's centre. */
const TONGUE: Point2[] = [[0, -14], [12, -14], [18, -4], [18, 6], [0, 6]]

export const PLATES: Record<string, PlateShape> = {
  // The trapezoid every stay drew before this table, for a plate no row names.
  'default': { pieces: [[[0, -9], [30, -9], [40, 9], [0, 9]]], thicknessMm: 1.5 },
  // Stock-width plates over the bumper: the rollers stay on the posts.
  'reinforcing': { pieces: [[[0, -10], [22, -10], [42, 3], [42, 10], [0, 10]]], thicknessMm: 1.5 },
  // A small plate with no single place: the short reinforcing plate, and the mount, support and angle-adjuster sets. ?
  'reinforcing-short': { pieces: [[[0, -4], [30, -4], [40, 3], [40, 9], [0, 9]]], thicknessMm: 1.5 },
  'reinforcing-roller': { pieces: [TONGUE, [[18, -4], [30, -4], [44, 4], [44, 11], [18, 11]]], thicknessMm: 1.5 },
  'bumper-plate': { pieces: [[[0, -14], [20, -14], [44, 1], [44, 10], [36, 14], [0, 14]]], thicknessMm: 1.5 },
  // Wide plates: the rollers move out to the ends, where 19 mm ones just fit 105 mm.
  'wide-front': {
    pieces: [TONGUE, [[18, -4], [30, 0], [30, 10], [18, 10]], [[30, 0], [44, 2], [47, 6], [44, 11], [30, 10]]],
    thicknessMm: 1.5, holes: [[43, 6]]
  },
  // AR's nose is pointed, so its plate is a V to the tongue.
  'wide-front-ar': {
    pieces: [[[0, -16], [8, -16], [30, 2], [30, 10], [0, 14]], [[30, 2], [44, 2], [47, 6], [44, 11], [30, 10]]],
    thicknessMm: 1.5, holes: [[43, 6]]
  },
  // VZ's front bumper is narrow and short, so the plate reaches further forward.
  'wide-front-vz': {
    pieces: [TONGUE, [[18, -4], [28, 2], [28, 13], [18, 13]], [[28, 2], [44, 5], [47, 9], [44, 13], [28, 13]]],
    thicknessMm: 1.5, holes: [[43, 9]]
  },
  // For the full-cowled cars, whose shell covers the bumper: flat and forward.
  'wide-front-cowled': {
    pieces: [[[0, -6], [24, -6], [30, 4], [30, 16], [0, 16]], [[30, 4], [44, 6], [47, 10], [44, 15], [30, 16]]],
    thicknessMm: 1.5, holes: [[43, 10]]
  },
  'wide-rear': {
    pieces: [TONGUE, [[18, -4], [32, 0], [32, 10], [18, 10]], [[32, 0], [44, 2], [47, 6], [44, 11], [32, 10]]],
    thicknessMm: 1.5, holes: [[43, 6]]
  },
  // Two rollers each side, one over the plate and one under it on the same
  // screw: the AR ships six rollers and this plate is where its rear four go,
  // which is how Tamiya builds it on the box of the AR starter pack.
  'wide-rear-ar': {
    pieces: [[[0, -14], [26, -14], [32, 0], [32, 10], [0, 10]], [[32, 0], [44, 2], [47, 6], [44, 11], [32, 10]]],
    thicknessMm: 1.5, holes: [[43, 6, 2]]
  },
  // An upper and a lower roller each side; the upper deck stands on posts.
  'rear-double-roller': {
    pieces: [TONGUE, [[18, -4], [44, 2], [46, 6], [44, 10], [18, 10]]],
    thicknessMm: 2, holes: [[42, 6, 2]],
    layers: [{ y: UPPER_ROLLER_MM, pieces: [[[26, 1], [44, 2], [46, 6], [44, 10], [26, 10]]] }]
  },
  // Three bolt holes to the chassis, so the tongue is a bar right across.
  'rear-double-roller-3pt': {
    pieces: [[[0, -14], [30, -14], [34, -4], [34, 10], [0, 10]], [[34, -2], [44, 2], [46, 6], [44, 10], [34, 10]]],
    thicknessMm: 2, holes: [[42, 6, 2]],
    layers: [{ y: UPPER_ROLLER_MM, pieces: [[[28, 1], [44, 2], [46, 6], [44, 10], [28, 10]]] }]
  },
  // A row of holes for any setting; drawn with the outer pair fitted, upper and lower. ?
  'multi-roller-front': {
    pieces: [TONGUE, [[18, -4], [44, 0], [46, 5], [44, 12], [18, 12]]],
    thicknessMm: 1.5, holes: [[42, 6, 2]],
    layers: [{ y: UPPER_ROLLER_MM, pieces: [[[28, 0], [44, 0], [46, 5], [44, 12], [28, 12]]] }]
  },
  'multi-roller-rear': {
    pieces: [[[0, -14], [26, -14], [32, -2], [32, 12], [0, 12]], [[32, -1], [44, 0], [46, 5], [44, 12], [32, 12]]],
    thicknessMm: 1.5, holes: [[42, 6, 2]],
    layers: [{ y: UPPER_ROLLER_MM, pieces: [[[28, 0], [44, 0], [46, 5], [44, 12], [28, 12]]] }]
  },
  'rear-roller-stay': {
    pieces: [TONGUE, [[18, -4], [40, 2], [44, 6], [42, 11], [18, 11]]],
    thicknessMm: 1.5, holes: [[41, 6]]
  },
  // A rear plate with a tab hanging below it for the brake sponge.
  'brake-stay': {
    pieces: [[[0, -12], [24, -12], [42, 3], [42, 10], [0, 10]]],
    thicknessMm: 1.5, brakeZ: 14,
    layers: [{ y: -5, pieces: [[[0, 8], [20, 8], [20, 20], [0, 20]]] }]
  },
  // MS's bumperless nose and tail units: no moulded bumper, a flat mounting face for a plate.
  'bumperless': {
    pieces: [[[0, -16], [30, -16], [44, 2], [44, 9], [0, 9]]],
    thicknessMm: 3, holes: [[41, 6]], replacesBumper: true
  },
  // A thin skid under the nose, below the bumper.
  'under-guard': {
    pieces: [[[0, -14], [28, -14], [30, 10], [0, 18]]],
    thicknessMm: 1, layers: [{ y: -6, pieces: [[[0, -14], [28, -14], [30, 10], [0, 18]]] }]
  },
  // VS's steering unit is a front bumper of its own; drawn as its plate until someone asks for the linkage.
  'steering': {
    pieces: [[[0, -14], [16, -14], [24, -2], [38, 0], [42, 6], [38, 12], [0, 12]]],
    thicknessMm: 3, holes: [[40, 6]]
  },
  // A wide plate on a sprung sub-plate: the plate slides and the springs bring it back.
  'wide-slide-damper-front': {
    pieces: [TONGUE],
    thicknessMm: 1.5, holes: [[43, 6]], springs: [[12, 0]],
    layers: [{ y: 4, pieces: [[[0, -6], [30, -6], [44, 2], [47, 6], [44, 11], [0, 11]]] }]
  },
  'wide-slide-damper-rear': {
    pieces: [TONGUE],
    thicknessMm: 1.5, holes: [[43, 6]], springs: [[12, 0]],
    layers: [{ y: 4, pieces: [[[0, -6], [32, -6], [44, 2], [47, 6], [44, 11], [0, 11]]] }]
  },
  // Side stays, x outward from the side guard.
  'side-default': { pieces: [[[-9, -22], [9, -22], [9, 22], [-9, 22]]], thicknessMm: 1.5, side: true },
  // Longer, with a lip past the guard; the side rollers stay on their posts,
  // which already stand at the edge of the envelope on the wide chassis.
  'side-extension': { pieces: [[[-9, -26], [6, -26], [10, -8], [10, 8], [6, 26], [-9, 26]]], thicknessMm: 1.5, side: true }
}
export const DEFAULT_PLATE = 'default'
export const DEFAULT_SIDE_PLATE = 'side-default'

/**
 * How many rollers the plate in an end's stay slot carries on each side: one
 * per tier of each hole, or the one on the chassis' post when the row has no
 * holes, is a side stay, or is not a plate. The pane draws a roller at each
 * (sockets.ts), and the build list prints the count, so that four rollers
 * drawn on a double-roller stay are not listed as two. The list cannot import
 * this table, so `catalog:generate` writes the count onto the part record.
 */
export function rollersPerSide(fitting: string | undefined): number {
  const plate = fitting ? PLATES[fitting] : undefined
  if (!plate?.holes || plate.side) return 1
  return plate.holes.reduce((n, [, , tiers = 1]) => n + tiers, 0)
}

/**
 * A part's count as its record carries it, or `undefined` where the part does
 * not place the rollers at all — anything but an end plate, and an end plate
 * that bolts on over the bumper. They then stay on the chassis' own posts,
 * whose count is on the chassis record (`stockRollersPerSide` in sockets.ts),
 * so the record has to tell "one per side on this plate" from "not this
 * plate's to say".
 */
export function partRollersPerSide(part: { slots: readonly string[]; fitting?: string }): number | undefined {
  const onAnEnd = part.slots.includes('front-stay') || part.slots.includes('rear-stay')
  const plate = part.fitting ? PLATES[part.fitting] : undefined
  return onAnEnd && plate?.holes && !plate.side ? rollersPerSide(part.fitting) : undefined
}

/**
 * Where a damper-slot part mounts. `end`: across the car at the front or
 * rear, where a mass damper's bracket bolts; `side`: on the side guards, a
 * mirrored pair; `corner`: at the outer roller of an end, a mirrored pair,
 * where stabilisers stand; `roller`: on top of that roller's own screw, a
 * mirrored pair, where a stabiliser ball caps it.
 */
export type Mount = 'end' | 'side' | 'corner' | 'roller'

/**
 * One damper-slot part. `form` is what the generator builds; `w`, `h` and `d`
 * are the weight's own size across, up and along — for a round one, `w` is
 * its diameter.
 */
export type DamperShape = {
  mount: Mount
  /**
   * Set where Tamiya sells the weight bare — マスダンパー スクエア, the
   * adjustable discs, マルチセッティングウェイト — so where it goes is the
   * builder's choice and `mount` is only the common one. A set that ships its
   * own plate, or names its chassis and side, carries its mount as a fact
   * about the product, and a loadout entry may not override that (§4.2).
   */
  anywhere?: true
  form: 'weights' | 'blocks' | 'sheet' | 'stack' | 'plate-weight' | 'pole' | 'head' | 'cap' | 'tube' | 'springs'
  w: number
  h: number
  d: number
}

/** A sliding damper's spring pair. */
const SPRINGS: DamperShape = { mount: 'end', form: 'springs', w: 4, h: 8, d: 4 }

export const DAMPERS: Record<string, DamperShape> = {
  // The cylinder at each end of a bracket, bouncing on a post: the default.
  'mass-damper': { mount: 'end', form: 'weights', w: 9, h: 6, d: 9 },
  'mass-damper-heavy': { mount: 'end', form: 'weights', w: 11, h: 8, d: 11 },
  'slimline': { mount: 'end', form: 'blocks', w: 6, h: 4, d: 20 },
  'block-6-32': { mount: 'end', form: 'blocks', anywhere: true, w: 6, h: 6, d: 32 },
  'block-8-32': { mount: 'end', form: 'blocks', anywhere: true, w: 8, h: 8, d: 32 },
  'block-6-14': { mount: 'end', form: 'blocks', anywhere: true, w: 6, h: 6, d: 14 },
  'block-8-14': { mount: 'end', form: 'blocks', anywhere: true, w: 8, h: 8, d: 14 },
  // Ball-connector blocks hang from a carbon plate across the end.
  'ball-block': { mount: 'end', form: 'plate-weight', w: 8, h: 8, d: 20 },
  'adjustable': { mount: 'end', form: 'stack', anywhere: true, w: 10, h: 7, d: 10 },
  'side-mass-damper': { mount: 'side', form: 'blocks', w: 6, h: 7, d: 24 },
  // Thin plates of lead under the side guards.
  'balance-weight': { mount: 'side', form: 'sheet', anywhere: true, w: 8, h: 2, d: 26 },
  // Stabilisers stand at the corners and ride the fence above the rollers.
  // A pole is a steel rod with a ball on top; `w` is the ball.
  'stabilizer-pole': { mount: 'corner', form: 'pole', w: 5, h: 22, d: 5 },
  'stabilizer-head': { mount: 'corner', form: 'head', w: 11, h: 7, d: 11 },
  'stabilizer-head-17': { mount: 'corner', form: 'head', w: 17, h: 7, d: 17 },
  'ball-cap': { mount: 'roller', form: 'cap', w: 6, h: 7, d: 6 },
  'hi-mount-tube': { mount: 'corner', form: 'tube', w: 9, h: 12, d: 9 },
  // A sliding damper in the damper slot is its spring pair; the spring sets are the springs alone.
  'springs': SPRINGS,
  'wide-slide-damper-front': SPRINGS,
  'wide-slide-damper-rear': SPRINGS
}
export const DEFAULT_DAMPER = 'mass-damper'

/** A brake: the plate it is cut into, if any, and the sponge or rubber pad under it. */
export type BrakeShape = {
  plate?: readonly [w: number, d: number]
  pad: readonly [w: number, d: number, t: number]
  /** A rubber pad rather than sponge: dark whatever the plate. */
  rubber?: true
}

export const BRAKES: Record<string, BrakeShape> = {
  'brake-set': { plate: [40, 14], pad: [36, 12, 2] },
  // MS's multi-brake: a wider plate, two pads.
  'multi-brake': { plate: [46, 16], pad: [40, 14, 2] },
  'rubber-brake': { plate: [40, 14], pad: [36, 12, 1.5], rubber: true },
  // A sponge set alone: the sponge, stuck to whatever the car has there.
  'sponge': { pad: [36, 12, 2] }
}
export const DEFAULT_BRAKE = 'brake-set'

/**
 * An axle through both wheels of one end. It spans the tread, so a 60 mm
 * and a 72 mm shaft draw the same length — what a reader sees between the
 * wheels is its section and its colour.
 */
export type AxleShape = { radiusMm: number; sides: number }

export const AXLES: Record<string, AxleShape> = {
  'round': { radiusMm: 1, sides: 8 },
  'hex': { radiusMm: 1.15, sides: 6 },
  'reinforced': { radiusMm: 1.05, sides: 8 },
  'hollow': { radiusMm: 1.25, sides: 8 }
}
export const DEFAULT_AXLE = 'round'

/** What the axle turns in, inboard of each wheel. */
export type BearingShape = { outerMm: number; widthMm: number; race: boolean; finish: 'metal' | 'plastic' }

export const BEARINGS: Record<string, BearingShape> = {
  'bushing': { outerMm: 6, widthMm: 3, race: false, finish: 'plastic' },
  'ball': { outerMm: 8, widthMm: 3, race: true, finish: 'metal' },
  'ball-small': { outerMm: 6, widthMm: 2.5, race: true, finish: 'metal' },
  'metal': { outerMm: 6, widthMm: 3, race: false, finish: 'metal' },
  'eyelet': { outerMm: 4.5, widthMm: 1.5, race: false, finish: 'metal' }
}
export const DEFAULT_BEARING = 'bushing'

/** A single-shaft chassis' propeller shaft between the two crown gears. */
export type PropellerShape = { radiusMm: number }

export const PROPELLERS: Record<string, PropellerShape> = {
  'propeller': { radiusMm: 1.2 },
  'propeller-hollow': { radiusMm: 1.5 }
}
export const DEFAULT_PROPELLER = 'propeller'

/**
 * A part that is the chassis itself: which of its mouldings it repaints in its
 * own colour (an MS unit, a colour chassis set, a gear cover), or a piece it
 * adds at the motor.
 */
export type ChassisUnitShape = {
  repaint?: readonly ('frame' | 'ends' | 'aParts')[]
  piece?: 'motor-support' | 'cooling-shield'
}

export const CHASSIS_UNITS: Record<string, ChassisUnitShape> = {
  'ms-ends': { repaint: ['ends'] },
  'ms-centre': { repaint: ['frame'] },
  'ms-set': { repaint: ['frame', 'ends'] },
  'gear-cover': { repaint: ['aParts'] },
  'motor-support': { piece: 'motor-support' },
  'cooling-shield': { piece: 'cooling-shield' }
}

/**
 * The table each slot type draws from, for `catalog:verify` to hold a part's
 * `fitting` to the tables of the slots it fills: an id that only another
 * kind's table holds would pass a check against all of them, then draw its
 * socket's default.
 */
export const FITTING_TABLES: Record<string, Record<string, unknown>> = {
  'roller-front': ROLLERS,
  'roller-rear': ROLLERS,
  'roller-side': ROLLERS,
  'front-stay': PLATES,
  'rear-stay': PLATES,
  'side-stay': PLATES,
  'damper': DAMPERS,
  'brake': BRAKES,
  'shaft': AXLES,
  'bearing': BEARINGS,
  'propeller-shaft': PROPELLERS,
  'chassis-unit': CHASSIS_UNITS,
  'gear-cover': CHASSIS_UNITS
}

/** The regulation's half width, which every roller must stay inside. */
export const HALF_WIDTH_MM = 52.5
/** The largest roller Tamiya sells, which is what a plate's outer hole is checked with. */
export const LARGEST_ROLLER_MM = 19
