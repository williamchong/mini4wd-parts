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
 * Only slots you can see get a socket (§5.4): terminal, switch, axle, bearing,
 * fastener and propeller-shaft draw nothing and are picked from the list. The
 * gears are seen once the shell is lifted, so gear-set has a socket at each
 * axle, and a single-shaft chassis' counter-gear one at its motor.
 */
import type { ChassisId } from '../catalog/chassis.ts'

/** The proxy shape drawn in a socket until a part has a generator. */
export type ProxyKind =
  | 'body' | 'motor' | 'gear' | 'counter-gear' | 'wheel' | 'tire' | 'roller' | 'stay' | 'side-stay' | 'brake' | 'damper'

export type SceneSocket = {
  /** Unique within the chassis; `-l`/`-r` suffixed for mirrored slots (§5.4). */
  name: string
  /** The slot this socket shows and opens, from data/taxonomy/slots.yml. */
  slotId: string
  kind: ProxyKind
  position: readonly [x: number, y: number, z: number]
  /** Turn about y, in radians: a single-shaft motor lies across the car, not along it. */
  rotateY?: number
}

/**
 * The dozen numbers a chassis' sockets are laid out from. The chassis
 * generator reads the same layout, which is what keeps posts under rollers
 * and the motor bay under the motor without a second table.
 */
export type Layout = {
  wheelbaseMm: number
  treadFrontMm: number
  treadRearMm: number
  /** Roller post centres: x and |z| for the front and rear pairs, x for the side pair at z = 0. */
  rollers: { front: readonly [x: number, z: number]; rear: readonly [x: number, z: number]; side: number }
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

function sockets(l: Layout): SceneSocket[] {
  const halfWheelbase = l.wheelbaseMm / 2
  const front = l.treadFrontMm / 2
  const rear = l.treadRearMm / 2
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
    ...mirrored('side-stay', 'side-stay', [l.sideStayX, STAY_Y, 0]),
    ...mirrored('roller-front', 'roller', [l.rollers.front[0], ROLLER_Y, l.rollers.front[1]]),
    ...mirrored('roller-rear', 'roller', [l.rollers.rear[0], ROLLER_Y, -l.rollers.rear[1]]),
    ...mirrored('roller-side', 'roller', [l.rollers.side, ROLLER_Y, 0]),
    // Not mirrored in the slot profile (maxCount 2 and 4, mirror false), so the
    // sockets are numbered rather than sided; one rear brake and a damper at
    // each end is what a beginner's first setup actually looks like.
    single('brake', 'brake', [0, 4, -(l.stayZ - 4)], 'brake-1'),
    single('damper', 'damper', [0, 18, l.stayZ - 10], 'damper-1'),
    single('damper', 'damper', [0, 18, -(l.stayZ - 10)], 'damper-2')
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
    rollers: { front: [37, 78], rear: [37, 78], side: 42 }, stayZ: 72, sideStayX: 38, motor: MID_MOTOR
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
    rollers: { front: [41, 80], rear: [41, 80], side: 45 }, stayZ: 74, sideStayX: 40, motor: REAR_MOTOR
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

const SOCKETS = new Map<ChassisId, readonly SceneSocket[]>()

export function socketsFor(chassis: ChassisId): readonly SceneSocket[] {
  let found = SOCKETS.get(chassis)
  if (!found) {
    found = sockets(LAYOUTS[chassis])
    SOCKETS.set(chassis, found)
  }
  return found
}
