/**
 * Where the 3D pane puts each slot, per chassis.
 *
 * One group per socket, named for the slot id, positioned from this table; the
 * attach step in Scene.client.vue — find the group by name, clear it, add the
 * mesh — is the whole of what it needs (docs/PLAN.md §5.4). This began as a
 * stand-in for the named empties a chassis GLB was going to carry, and became
 * the permanent socket source when the GLB was retired (§5.6, 2026-09-16):
 * the chassis geometry beside it (generators/chassis.ts) reads the same
 * layout, so the roller posts stand under the roller sockets by construction.
 * It is not in data/chassis/*.yml because that would be the second socket data
 * model §5.4 says not to have.
 *
 * Units are millimetres, Y up, the car's nose toward +Z, the ground at y = 0.
 * Positions are plausible rather than measured: each chassis' wheelbase and
 * tread are on its record, the regulation envelope (105 × 165 × 70) bounds the
 * rest, and a shape drawn for an impression does not need to be truer than that.
 *
 * Only slots you can see get a socket (§5.4). The gears are seen once the
 * shell is lifted, so gear-set has a socket at each axle, and a single-shaft
 * chassis' counter-gear one at its motor. The fittings with one true place
 * — axles, bearings, the propeller shaft, a piece at the motor — have sockets
 * too, since 2026-09-18 (§5.6, "The rest of the parts"), but no hit volume:
 * they sit inside the wheels and under the motor, where a tap belongs to what
 * is in front of them, and the list is how they are changed. Terminals,
 * gear covers and chassis units repaint the chassis instead of drawing, and
 * the switch and fasteners draw nothing.
 *
 * **A plate carries its rollers** (§5.2's cascade, chassis → plate → roller).
 * With no plate in a stay slot, or one that bolts over the bumper, that end's
 * rollers sit on the chassis' posts; with a plate whose row lists roller
 * holes, they sit in the holes, and a hole with an upper deck carries a
 * second roller above the first. So the socket set depends on the build, and
 * `socketsFor` takes what is fitted.
 */
import type { ChassisId } from '../catalog/chassis.ts'
import { ROLLER_TOP_MM, UPPER_ROLLER_MM } from './fittings.ts'
import type { Hole, Mount, PlateShape } from './fittings.ts'

/** The proxy shape drawn in a socket until a part has a generator. */
export type ProxyKind =
  | 'body' | 'motor' | 'gear' | 'counter-gear' | 'wheel' | 'tire' | 'roller' | 'stay' | 'side-stay' | 'brake' | 'damper'
  | 'axle' | 'bearing' | 'propeller-shaft' | 'chassis-unit'

export type SceneSocket = {
  /** Unique within the chassis; `-l`/`-r` suffixed for mirrored slots (§5.4). */
  name: string
  /** The slot this socket shows and opens, from data/taxonomy/slots.yml. */
  slotId: string
  kind: ProxyKind
  position: readonly [x: number, y: number, z: number]
  /** Turn about y, in radians: a single-shaft motor lies across the car, not along it. */
  rotateY?: number
  /** Which of the slot's entries this socket draws, where each entry has a place of its own (the damper slot); else the first. */
  entry?: number
  /** How long a shaft here is: an axle spans its tread, the propeller shaft the gap between its crowns, a stabiliser ball's screw the bare length under it. */
  span?: number
}

/** The stay slots whose plate can move rollers; a side stay leaves the side rollers on their posts. */
export type StaySlot = 'front-stay' | 'rear-stay'

/**
 * What is fitted that moves a socket: the plate in each stay slot, and the
 * mount of each entry in the damper slot, in order.
 */
export type Fit = {
  plates?: Partial<Record<StaySlot, PlateShape>>
  dampers?: readonly Mount[]
}

/**
 * A pair of roller posts: x and |z|, and how many rollers each post carries —
 * 2 where the chassis ships one above its stay and one under it. AR and MA are
 * the two that do, which is the "six rollers" their records claim
 * (data/chassis/{ar,ma}.yml, read off Tamiya's own photo of each); every other
 * chassis ships four. A plate in that end's stay slot replaces this with its
 * own holes, so this is the bare chassis' count.
 */
export type Post = readonly [x: number, z: number, tiers?: 1 | 2]

/**
 * The dozen numbers a chassis' sockets are laid out from. The chassis
 * generator reads the same layout, which is what keeps posts under rollers
 * and the motor bay under the motor without a second table.
 */
export type Layout = {
  wheelbaseMm: number
  treadFrontMm: number
  treadRearMm: number
  /** Roller post centres: the front and rear posts, and x for the side pair at z = 0. */
  rollers: { front: Post; rear: Post; side: number }
  /** How far out (|z|) the front and rear stays sit on their bumpers. */
  stayZ: number
  /** The side stays' x, on the side guards. */
  sideStayX: number
  /** The motor's centre, and whether the can lies across the car — a single-shaft FA-130 — rather than along it. */
  motor: { position: readonly [x: number, y: number, z: number]; across: boolean }
}

/** Wheel centres' height for a ⌀24 wheel; a larger tire lifts the whole car (§5.5). */
export const AXLE_Y = 12
export const BODY_Y = 32
const ROLLER_Y = 12
const STAY_Y = 8
/**
 * Where an end-mounted damper sits. The generator draws the bracket under the
 * weight — a Tamiya mass damper rests on its plate and flies up the screw on
 * landing — so this is the weight's centre, not the bracket's underside: the
 * surface CORNER_Y already names (10.5), the bracket (1.5) and half a 6 mm
 * weight. One height serves every end shape, so a thicker weight or a 2 mm
 * plate sits a millimetre out, within this file's plausible-not-measured rule.
 */
const DAMPER_Y = 15
/** On top of a stay or bumper, where a stabiliser stands. */
const CORNER_Y = 10.5
/**
 * Where a stabiliser ball sits: on the 30 mm screw through an end's outer
 * roller, which is just over a two-tier stack. Over a single roller the same
 * screw stands bare, and the socket's `span` is that length (Tamiya's photo
 * of 18647: the rear balls rest on the upper rollers, the front ones stand on
 * posts at the same height).
 */
const BALL_Y = ROLLER_Y + UPPER_ROLLER_MM + ROLLER_TOP_MM

/**
 * A mirrored slot is one slot and two sockets, both opening the same picker;
 * `x` is the right-hand offset and the left is its negation.
 *
 * `faceOut` turns the left socket to look the other way, for a shape with a
 * front and a back: a wheel's spokes are on its outboard face, so without it
 * the left wheel of every car would show a reader its back.
 */
const mirrored = (
  slotId: string, kind: ProxyKind, [x, y, z]: readonly [number, number, number], faceOut = false
): SceneSocket[] => [
  { name: `${slotId}-l`, slotId, kind, position: [-x, y, z], rotateY: faceOut ? Math.PI : undefined },
  { name: `${slotId}-r`, slotId, kind, position: [x, y, z] }
]

const single = (
  slotId: string, kind: ProxyKind, position: readonly [number, number, number], name = slotId
): SceneSocket => ({ name, slotId, kind, position })

/**
 * The rollers at one end: in the plate's holes when it has any, else on the
 * posts — which are a hole too, in the stay's own frame, so both are one path.
 * The first roller each side keeps the plain `-l`/`-r` name, so the tap
 * measurements and every test that names it still find it; the rest are
 * numbered, and all of them open the same picker.
 */
function rollers(slotId: string, towardNose: 1 | -1, l: Layout, plate?: PlateShape): SceneSocket[] {
  const [postX, postZ, postTiers = 1] = towardNose > 0 ? l.rollers.front : l.rollers.rear
  const holes: readonly Hole[] = plate?.holes ?? [[postX, postZ - l.stayZ, postTiers]]
  const found: SceneSocket[] = []
  for (const [x, z, tiers = 1] of holes) {
    for (let tier = 0; tier < tiers; tier++) {
      const n = found.length / 2
      const suffix = n ? `-${n + 1}` : ''
      for (const side of [-1, 1]) {
        found.push({
          name: `${slotId}-${side < 0 ? 'l' : 'r'}${suffix}`, slotId, kind: 'roller',
          position: [side * x, ROLLER_Y + tier * UPPER_ROLLER_MM, towardNose * (l.stayZ + z)]
        })
      }
    }
  }
  return found
}

/** An end's outer roller: how far out and along it is, and the height of the top one of its stack. */
type Corner = { x: number, z: number, top: number }

/**
 * The damper slot's sockets: one per entry, at the mount its row names, each
 * end or corner used once before any is used twice, the rear first — where a
 * first mass damper goes. An empty slot outlines a damper at each end, as it
 * always has, so the poster and the tap measurements stand.
 */
function dampers(l: Layout, mounts: readonly Mount[] | undefined, corners: Record<1 | -1, Corner>): SceneSocket[] {
  const end = (towardNose: 1 | -1): readonly [number, number, number] => [0, DAMPER_Y, towardNose * (l.stayZ - 10)]
  if (!mounts?.length) return [single('damper', 'damper', end(1), 'damper-1'), single('damper', 'damper', end(-1), 'damper-2')]
  const used = { end: 0, side: 0, corner: 0, roller: 0 }
  // A lone side weight goes on the slotted pad the guards carry at z = 0, which
  // is what that pad is for. Two or more step fore and aft of it instead: at
  // the depths these come in, both on the pad would run into each other.
  const sideStep = mounts.filter(mount => mount === 'side').length > 1 ? 20 : 0
  return mounts.flatMap((mount, entry): SceneSocket[] => {
    const towardNose = used[mount]++ % 2 ? 1 : -1
    const name = `damper-${entry + 1}`
    if (mount === 'end') return [{ ...single('damper', 'damper', end(towardNose), name), entry }]
    const { x, z, top } = corners[towardNose]
    const at: readonly [number, number, number] = mount === 'side'
      ? [l.sideStayX + 2, 12, sideStep ? towardNose * sideStep : 0]
      : mount === 'roller' ? [x, BALL_Y, towardNose * z] : [x - 12, CORNER_Y, towardNose * (z - 4)]
    const span = mount === 'roller' ? BALL_Y - top - ROLLER_TOP_MM : undefined
    return mirrored('damper', 'damper', at).map(socket => ({ ...socket, name: socket.name.replace('damper', name), entry, span }))
  })
}

function sockets(l: Layout, fit: Fit): SceneSocket[] {
  const halfWheelbase = l.wheelbaseMm / 2
  const front = l.treadFrontMm / 2
  const rear = l.treadRearMm / 2
  const plates = fit.plates ?? {}
  const frontRollers = rollers('roller-front', 1, l, plates['front-stay'])
  const rearRollers = rollers('roller-rear', -1, l, plates['rear-stay'])
  // Where a stabiliser stands at each end: by that end's outer roller, the top one of a stack.
  const outer = (found: SceneSocket[]): Corner => {
    const [x, y, z] = found.reduce((a, b) => b.position[0] > a.position[0] || (b.position[0] === a.position[0] && b.position[1] > a.position[1]) ? b : a).position
    return { x, z: Math.abs(z), top: y }
  }
  const corners = { 1: outer(frontRollers), [-1]: outer(rearRollers) } as const
  const brakeZ = plates['rear-stay']?.brakeZ
  return [
    single('body', 'body', [0, BODY_Y, 0]),
    { ...single('motor', 'motor', l.motor.position), rotateY: l.motor.across ? Math.PI / 2 : undefined },
    // One gear set, drawn at both axles; numbered like the brake and dampers.
    single('gear-set', 'gear', [0, AXLE_Y, halfWheelbase], 'gear-set-1'),
    single('gear-set', 'gear', [0, AXLE_Y, -halfWheelbase], 'gear-set-2'),
    // Only a motor across the car turns a counter gear; a PRO chassis has no such slot.
    ...(l.motor.across ? [single('counter-gear', 'counter-gear', l.motor.position)] : []),
    ...mirrored('wheel-front', 'wheel', [front, AXLE_Y, halfWheelbase], true),
    ...mirrored('wheel-rear', 'wheel', [rear, AXLE_Y, -halfWheelbase], true),
    ...mirrored('tire-front', 'tire', [front, AXLE_Y, halfWheelbase]),
    ...mirrored('tire-rear', 'tire', [rear, AXLE_Y, -halfWheelbase]),
    single('front-stay', 'stay', [0, STAY_Y, l.stayZ]),
    single('rear-stay', 'stay', [0, STAY_Y, -l.stayZ]),
    // Turned to face out, since a side stay is authored with x outward.
    ...mirrored('side-stay', 'side-stay', [l.sideStayX, STAY_Y, 0], true),
    ...frontRollers,
    ...rearRollers,
    ...mirrored('roller-side', 'roller', [l.rollers.side, ROLLER_Y, 0]),
    // Not mirrored in the slot profile (maxCount 2, mirror false), so the
    // socket is numbered rather than sided; one rear brake is what a
    // beginner's first setup actually looks like. A brake stay carries it
    // further out, under its tab.
    single('brake', 'brake', [0, 4, -(brakeZ === undefined ? l.stayZ - 4 : l.stayZ + brakeZ)], 'brake-1'),
    ...dampers(l, fit.dampers, corners),
    // The fittings with one true place, drawn but not tapped (see above).
    { ...single('axle', 'axle', [0, AXLE_Y, halfWheelbase], 'axle-1'), span: l.treadFrontMm },
    { ...single('axle', 'axle', [0, AXLE_Y, -halfWheelbase], 'axle-2'), span: l.treadRearMm },
    ...mirrored('bearing', 'bearing', [front - 7, AXLE_Y, halfWheelbase]),
    ...mirrored('bearing', 'bearing', [rear - 7, AXLE_Y, -halfWheelbase]).map(s => ({ ...s, name: `${s.name}-2` })),
    ...(l.motor.across ? [{ ...single('propeller-shaft', 'propeller-shaft', [0, AXLE_Y, 0]), span: l.wheelbaseMm - 16 }] : []),
    single('chassis-unit', 'chassis-unit', l.motor.position)
  ]
}

/** A double-shaft motor along the car between the axles, as the PRO chassis carry it. */
const MID_MOTOR = { position: [0, 18, 0], across: false } as const
/** An FA-130 across the car just inside the rear axle, driving it through the counter gear. */
const REAR_MOTOR = { position: [0, 13, -27], across: true } as const

/**
 * Wheelbase and tread are the chassis record's; roller posts sit just outside
 * the wider tread and the stays just inside the roller line, so a wide chassis
 * (AR, MS, VS) carries its rollers further out than a narrow one (MA, FM-A, VZ).
 */
const LAYOUTS: Record<ChassisId, Layout> = {
  ma: {
    wheelbaseMm: 80, treadFrontMm: 59.5, treadRearMm: 59.5,
    rollers: { front: [37, 78], rear: [37, 78, 2], side: 42 }, stayZ: 72, sideStayX: 38, motor: MID_MOTOR
  },
  ms: {
    wheelbaseMm: 80, treadFrontMm: 67, treadRearMm: 69,
    rollers: { front: [41, 78], rear: [41, 78], side: 46 }, stayZ: 72, sideStayX: 41, motor: MID_MOTOR
  },
  me: {
    wheelbaseMm: 80, treadFrontMm: 60, treadRearMm: 66,
    rollers: { front: [38, 78], rear: [41, 78], side: 45 }, stayZ: 72, sideStayX: 40, motor: MID_MOTOR
  },
  ar: {
    wheelbaseMm: 82, treadFrontMm: 67, treadRearMm: 67,
    rollers: { front: [41, 80], rear: [41, 80, 2], side: 45 }, stayZ: 74, sideStayX: 40, motor: REAR_MOTOR
  },
  'fm-a': {
    wheelbaseMm: 83, treadFrontMm: 59.5, treadRearMm: 59.5,
    rollers: { front: [37, 80], rear: [37, 80], side: 42 }, stayZ: 74, sideStayX: 38,
    motor: { position: [0, 13, 28], across: true }
  },
  vz: {
    wheelbaseMm: 80, treadFrontMm: 59.5, treadRearMm: 65.5,
    rollers: { front: [37, 78], rear: [40, 78], side: 44 }, stayZ: 72, sideStayX: 39, motor: REAR_MOTOR
  },
  'super-2': {
    wheelbaseMm: 80, treadFrontMm: 64, treadRearMm: 64,
    rollers: { front: [39, 78], rear: [39, 78], side: 44 }, stayZ: 72, sideStayX: 39, motor: REAR_MOTOR
  },
  vs: {
    wheelbaseMm: 80, treadFrontMm: 64, treadRearMm: 69,
    rollers: { front: [39, 78], rear: [41, 78], side: 46 }, stayZ: 72, sideStayX: 41, motor: REAR_MOTOR
  }
}

export const layoutFor = (chassis: ChassisId): Layout => LAYOUTS[chassis]

/**
 * How many rollers this chassis' own rear posts hold on each side, before any
 * plate. `catalog:generate` writes it onto the chassis record, the way a
 * plate's count is written onto its part record, because the build list prints
 * the count and cannot import this table (shared/scene/fittings.ts).
 */
export const stockRollersPerSide = (chassis: ChassisId): number => LAYOUTS[chassis].rollers.rear[2] ?? 1

const SOCKETS = new Map<ChassisId, readonly SceneSocket[]>()

/**
 * A chassis' sockets with `fit` fitted. The bare set — nothing moving a
 * roller or a damper — is what almost every build draws, so it is the one
 * kept; a fitted set is thirty-odd small objects, rebuilt when the build is.
 */
export function socketsFor(chassis: ChassisId, fit?: Fit): readonly SceneSocket[] {
  const bare = !fit || (!fit.dampers?.length && !Object.values(fit.plates ?? {}).some(Boolean))
  if (!bare) return sockets(LAYOUTS[chassis], fit)
  let found = SOCKETS.get(chassis)
  if (!found) {
    found = sockets(LAYOUTS[chassis], {})
    SOCKETS.set(chassis, found)
  }
  return found
}
