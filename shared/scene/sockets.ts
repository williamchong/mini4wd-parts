/**
 * Where the 3D pane puts each slot, for chassis that have no GLB yet.
 *
 * docs/PLAN.md §5.2 puts the sockets in the chassis GLB as named empty nodes.
 * Until that file exists, the scene builds the same thing in code: one group
 * per socket, named for the slot id, positioned from this table. The attach
 * step — find the group by name, clear it, add the mesh — is what the GLB will
 * use unchanged; only where the groups come from swaps. This is a stand-in for
 * the GLB's empties, not catalog data, and is deleted per chassis as its GLB
 * lands (§5.5). It is not in data/chassis/*.yml because that would be the
 * second socket data model §5.4 says not to have.
 *
 * Units are millimetres, Y up, the car's nose toward +Z, the ground at y = 0.
 * Positions are plausible rather than measured: MA's wheelbase (80) and tread
 * (59.5) are on the chassis record, the regulation envelope (105 × 165 × 70)
 * bounds the rest, and a proxy box does not need to be truer than that.
 *
 * Only slots you can see get a socket (§5.4): gear-set, terminal, switch, axle,
 * bearing and fastener draw nothing and are picked from the list.
 */
import type { ChassisId } from '../catalog/schema.ts'

/** The proxy shape drawn in a socket until a part has a generator. */
export type ProxyKind =
  | 'body' | 'motor' | 'wheel' | 'tire' | 'roller' | 'stay' | 'side-stay' | 'brake' | 'damper'

export type SceneSocket = {
  /** Unique within the chassis; `-l`/`-r` suffixed for mirrored slots (§5.4). */
  name: string
  /** The slot this socket shows and opens, from data/taxonomy/slots.yml. */
  slotId: string
  kind: ProxyKind
  position: readonly [x: number, y: number, z: number]
}

/**
 * A mirrored slot is one slot and two sockets, both opening the same picker;
 * `x` is the right-hand offset and the left is its negation.
 */
const mirrored = (
  slotId: string, kind: ProxyKind, [x, y, z]: readonly [number, number, number]
): SceneSocket[] => [
  { name: `${slotId}-l`, slotId, kind, position: [-x, y, z] },
  { name: `${slotId}-r`, slotId, kind, position: [x, y, z] }
]

const single = (
  slotId: string, kind: ProxyKind, position: readonly [number, number, number], name = slotId
): SceneSocket => ({ name, slotId, kind, position })

/** Wheel centres from the MA record: wheelbase 80, tread 59.5, wheel ⌀24. */
const AXLE_Y = 12
const HALF_WHEELBASE = 40
const HALF_TREAD = 29.75

const MA: SceneSocket[] = [
  single('body', 'body', [0, 32, 0]),
  single('motor', 'motor', [0, 18, 0]),
  ...mirrored('wheel-front', 'wheel', [HALF_TREAD, AXLE_Y, HALF_WHEELBASE]),
  ...mirrored('wheel-rear', 'wheel', [HALF_TREAD, AXLE_Y, -HALF_WHEELBASE]),
  ...mirrored('tire-front', 'tire', [HALF_TREAD, AXLE_Y, HALF_WHEELBASE]),
  ...mirrored('tire-rear', 'tire', [HALF_TREAD, AXLE_Y, -HALF_WHEELBASE]),
  single('front-stay', 'stay', [0, 8, 72]),
  single('rear-stay', 'stay', [0, 8, -72]),
  ...mirrored('side-stay', 'side-stay', [38, 8, 0]),
  ...mirrored('roller-front', 'roller', [37, 12, 78]),
  ...mirrored('roller-rear', 'roller', [37, 12, -78]),
  ...mirrored('roller-side', 'roller', [42, 12, 0]),
  // Not mirrored in the slot profile (maxCount 2 and 4, mirror false), so the
  // sockets are numbered rather than sided; one rear brake and a damper at
  // each end is what a beginner's first setup actually looks like.
  single('brake', 'brake', [0, 4, -68], 'brake-1'),
  single('damper', 'damper', [0, 18, 62], 'damper-1'),
  single('damper', 'damper', [0, 18, -62], 'damper-2')
]

const SOCKETS: Partial<Record<ChassisId, readonly SceneSocket[]>> = { ma: MA }

/** Undefined for a chassis the pane cannot draw yet; the list is its surface. */
export function socketsFor(chassis: ChassisId): readonly SceneSocket[] | undefined {
  return SOCKETS[chassis]
}
