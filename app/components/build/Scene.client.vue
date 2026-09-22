<script setup lang="ts">
/**
 * The 3D pane: the build drawn as proxy shapes at the chassis' sockets, and the
 * surface you tap to change it (docs/PLAN.md §5.4, §5.5).
 *
 * Plain three, no TresJS (§4.1, 2026-09-16): the scene is one group per socket
 * named for its slot id, and a change to the build clears each group and adds
 * a mesh back. The groups come from the socket table in shared/scene/sockets.ts,
 * one layout per chassis, and the chassis under them is drawn from the same
 * layout (§5.6).
 *
 * `.client.vue` keeps three out of the server bundle, and pages/index.vue
 * mounts it lazily, so the chunk is split from the route's own JavaScript.
 * Nothing here runs during prerender.
 */
import {
  BoxGeometry, CylinderGeometry, DirectionalLight, Group, Mesh, Object3D,
  MeshPhysicalMaterial, MeshStandardMaterial, NeutralToneMapping, PerspectiveCamera, PlaneGeometry,
  Raycaster, Scene, ShadowMaterial, SphereGeometry, Vector2, Vector3, VSMShadowMap, WebGLRenderer
} from 'three'
import type { BufferGeometry } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { studioEnvironment } from '#shared/scene/studio'
import { dress } from '#shared/scene/shading'
import type { Occlusion } from '#shared/scene/occlusion'
import { layoutFor, socketsFor } from '#shared/scene/sockets'
import type { Fit, ProxyKind, SceneSocket } from '#shared/scene/sockets'
import { DEFAULT_SILHOUETTE } from '#shared/scene/bodies'
import { bodyGeometry } from '#shared/scene/generators/body'
import type { Silhouette } from '#shared/scene/generators/body'
import { chassisPieces } from '#shared/scene/generators/chassis'
import type { ChassisRole } from '#shared/scene/generators/chassis'
import * as parts from '#shared/scene/generators/parts'
import * as fittings from '#shared/scene/generators/fittings'
import {
  AXLES, BEARINGS, BRAKES, CHASSIS_UNITS, DAMPERS, DEFAULT_AXLE, DEFAULT_BEARING, DEFAULT_BRAKE, DEFAULT_DAMPER,
  DEFAULT_PLATE, DEFAULT_PROPELLER, DEFAULT_ROLLER, DEFAULT_SIDE_PLATE, PLATES, PROPELLERS, ROLLERS
} from '#shared/scene/fittings'
import { DEFAULT_TIRE, DEFAULT_WHEEL, entryShapeId, TIRES, WHEELS } from '#shared/scene/wheels'
import type { TireShape, WheelShape } from '#shared/scene/wheels'
import { cylinder, Triangles } from '#shared/scene/generators/mesh'
import type { ResolvedSlot } from '#shared/catalog/build'
import type { ChassisId, Kit, KitClear, PartColours, PartFinish, PartSpecs } from '#shared/catalog/schema'

const props = defineProps<{
  chassis: ChassisId
  /** The body shell the kit the build started from draws, when it has one (§5.6). */
  kitBody: string | null
  /** What that kit's body, wheels, tires and rollers are moulded in, from the catalog. */
  kitColours: Kit['colours'] | null
  /** Whether that kit's body is plated rather than painted. */
  kitBodyFinish: Kit['bodyFinish'] | null
  slots: ResolvedSlot[]
  /**
   * The catalog by item number, read for the specs that size a proxy, the
   * colour it is drawn in, a body part's shell, and — for a wheel, a tire or a
   * set — which shape of each it draws and whether its rim is metal.
   */
  parts: ReadonlyMap<string, {
    specs: PartSpecs
    colours?: PartColours
    body?: string
    wheel?: string
    tire?: string
    finish?: PartFinish
    fitting?: string
  }>
  /** The slot whose picker is open; its proxy stays lit until it closes. */
  openSlotId: string | null
}>()

const emit = defineEmits<{
  select: [slotId: string]
  /** The reader switched the car on. */
  power: []
  /** …and turned its sound off, or back on. */
  mute: [muted: boolean]
  /** The first frame is on the canvas; whatever stood in for it can go. */
  ready: []
}>()

const canvas = ref<HTMLCanvasElement>()

/**
 * What a proxy is showing: the kit's or chassis' own part, one the reader put
 * in, or nothing. The same distinction the list draws with `swapped` — where a
 * stock part came from is not something a beginner is asked to care about.
 */
type ProxyState = 'stock' | 'changed' | 'empty'
type Highlight = 'none' | 'hover' | 'open'

/**
 * What sizes a shape: `mm` is what `diameterFor` finds for the kind — a round
 * part's diameter, a plate's thickness — `wheelId` the wheel a tire seats on,
 * `id` which row of shared/scene/wheels.ts a wheel or tire is drawn from,
 * `silhouette` which body shell a body is lofted from, and `towardNose`
 * which end a stay or a gear faces. Each field is zero for the kinds that ignore it, so
 * the cache key built from them holds one geometry per shape that actually
 * differs. The motor and the gears are keyed by less than they depend on:
 * the chassis decides their layout — the paint is not shape — and the page
 * remounts this component per chassis, so a cache never outlives one answer.
 * The shapes themselves come from shared/scene/generators (§5.6).
 */
type Shape = {
  mm: number
  /** A wheel's own row, and the rim a tire seats on. */
  wheel?: WheelShape
  tire?: TireShape
  /** What those rows come to as a cache key; see `sign`. */
  id: string
  silhouette: string
  towardNose: 1 | -1 | 0
  /** The row of shared/scene/fittings.ts a roller, plate, damper, brake or hidden fitting draws from. */
  fitting: string
  /** A shaft's length, from its socket. */
  span: number
}
const shapeKey = (kind: ProxyKind, s: Shape) => `${kind}:${s.mm}:${s.id}:${s.silhouette}:${s.towardNose}:${s.fitting}:${s.span}`

/**
 * A wheel or tire as the numbers its generator actually reads, not as the row
 * it came from. Ten of the 46 wheel rows repeat another row's numbers under a
 * different Tamiya name — `large-ms-ii`, `large-fm-type` and `large-5-spoke`
 * are one shape — and a tire reads only its rim's diameter and
 * width, of which the 46 rows hold ten. Keying the geometry cache by the row
 * id instead would hold a tire geometry per (tire, wheel) *name* pair: 1288
 * entries where 230 differ, and the same 14 KB buffer built again for every
 * one of the thirteen 21×11 rims a reader tries.
 */
const sign = (kind: ProxyKind, wheel?: WheelShape, tire?: TireShape) =>
  kind === 'wheel' && wheel ? `${wheel.diameterMm}/${wheel.widthMm}/${wheel.spokes}/${wheel.dishMm}/${wheel.spoke ?? ''}`
    : kind === 'tire' && tire && wheel ? `${tire.diameterMm}/${tire.widthMm}/${tire.shoulderMm}@${wheel.diameterMm}/${wheel.widthMm}`
      : ''
/** The kinds whose hit volume scales with `mm`; the others are fixed boxes. */
const ROUND: ReadonlySet<ProxyKind> = new Set(['wheel', 'tire', 'roller'])
const GEARS: ReadonlySet<ProxyKind> = new Set(['gear', 'counter-gear'])
/** The kinds drawn differently at the front and the rear. */
const TOWARD_NOSE: ReadonlySet<ProxyKind> = new Set(['stay', 'gear', 'counter-gear'])

/** Every kind but the body, whose shell is lofted per kit and held apart from these tables. */
type Solid = Exclude<ProxyKind, 'body'>
/**
 * The fittings with one true place (sockets.ts): drawn, and drawn nothing for
 * when empty — an outline of an axle inside a wheel is a line nobody reads —
 * and with no hit volume, since what is in front of them takes the tap.
 */
type Hidden = 'axle' | 'bearing' | 'propeller-shaft' | 'chassis-unit'
const HIDDEN: ReadonlySet<ProxyKind> = new Set<Hidden>(['axle', 'bearing', 'propeller-shaft', 'chassis-unit'])
const isHidden = (kind: ProxyKind): kind is Hidden => HIDDEN.has(kind)
/** The kinds drawn from a row of shared/scene/fittings.ts, in `fittings.FITTING_GROUPS`' draw groups. */
const FITTINGS: ReadonlySet<ProxyKind> = new Set(['roller', 'stay', 'side-stay', 'damper', 'brake', ...HIDDEN])
/** The kinds drawn as a gear train, one mesh per rotor, rather than as one shape. */
type Train = 'gear' | 'counter-gear'

// An FA-130 lies across the car and has one shaft; a PRO motor lies along it with two.
const shafts = () => layoutFor(props.chassis).motor.across ? 1 : 2

const gearSide = (shape: Shape) => parts.gearSide(shafts(), shape.towardNose || 1)

const isTrain = (kind: ProxyKind): kind is Train => GEARS.has(kind)
const TRAINS: Record<Train, (shape: Shape) => parts.Rotor[]> = {
  gear: shape => parts.gearSet(shafts(), shape.towardNose || 1),
  'counter-gear': shape => parts.counterGear(shape.towardNose || 1)
}

/**
 * A row by id, or its table's default: a part no row names — a fitting the
 * name reader did not place, a link from before it existed — draws its
 * socket's ordinary shape, the way a kit with no silhouette draws the wedge.
 * A side stay and an end stay share one table but not their outlines, so each
 * socket only takes a row authored for it.
 */
const row = <T,>(table: Record<string, T>, id: string, fallback: string): T => table[id] ?? table[fallback]!
const rollerRow = (id: string) => row(ROLLERS, id, DEFAULT_ROLLER)
const plateRow = (kind: 'stay' | 'side-stay', id: string) => {
  const found = PLATES[id]
  return found && !!found.side === (kind === 'side-stay') ? found : PLATES[kind === 'stay' ? DEFAULT_PLATE : DEFAULT_SIDE_PLATE]!
}
const damperRow = (id: string) => row(DAMPERS, id, DEFAULT_DAMPER)
/** The damper-slot forms that are a metal weight; the rest are moulded stabilisers and springs' plastic. */
const WEIGHTS: ReadonlySet<string> = new Set(['weights', 'blocks', 'sheet', 'stack', 'plate-weight'])

const VISIBLE: Record<Exclude<Solid, Train>, (shape: Shape) => BufferGeometry> = {
  motor: () => parts.motor(shafts()),
  wheel: shape => parts.wheel(shape.wheel!),
  tire: shape => parts.tire(shape.tire!, shape.wheel!),
  roller: shape => fittings.roller(rollerRow(shape.fitting), shape.mm),
  stay: shape => fittings.plate(plateRow('stay', shape.fitting), shape.mm, shape.towardNose || 1),
  'side-stay': shape => fittings.plate(plateRow('side-stay', shape.fitting), shape.mm, 1),
  brake: shape => fittings.brake(row(BRAKES, shape.fitting, DEFAULT_BRAKE)),
  damper: shape => fittings.damper(damperRow(shape.fitting), shape.span),
  axle: shape => fittings.axle(row(AXLES, shape.fitting, DEFAULT_AXLE), shape.span),
  bearing: shape => fittings.bearing(row(BEARINGS, shape.fitting, DEFAULT_BEARING)),
  'propeller-shaft': shape => fittings.propellerShaft(row(PROPELLERS, shape.fitting, DEFAULT_PROPELLER), shape.span),
  'chassis-unit': shape => fittings.chassisUnit(CHASSIS_UNITS[shape.fitting] ?? {})
}

/**
 * What an empty slot shows: the simplest outline of the shape that would go
 * there, drawn in wireframe. Simpler than the real shapes on purpose — a
 * wireframe of a 16-segment revolve is a tangle, an octagonal ring is a slot.
 * An empty body draws nothing (see `populate`).
 */
const outlineBox = (w: number, h: number, d: number, y = 0) => {
  const t = new Triangles()
  t.boxAt(w, h, d, 0, y, 0)
  return t.geometry()
}
const outlineRing = (r: number, w: number, axis: 'x' | 'y') => {
  const t = new Triangles()
  t.revolve(cylinder(r, -w / 2, w / 2), 8, axis)
  return t.geometry()
}
const OUTLINE: Record<Exclude<Solid, Hidden>, (shape: Shape) => BufferGeometry> = {
  motor: () => outlineBox(20, 15, 25),
  // The gear a reader would look for: the PRO axle spur or the single-shaft
  // crown gear, and the counter gear beside the motor. Centres and widths are
  // those gears' in generators/parts.ts; HIT's boxes around them are looser.
  gear: shape => shafts() === 1
    ? outlineRing(9, 3.5, 'x').translate(5.5 * gearSide(shape), 0, 0)
    : outlineRing(7.5, 3, 'x').translate(7.5 * gearSide(shape), 0, 0),
  'counter-gear': shape => outlineRing(7, 3.5, 'x').translate(19.75, 5.5, 7.5 * (shape.towardNose || 1)),
  wheel: shape => outlineRing(shape.mm / 2, 10, 'x'),
  tire: shape => outlineRing(shape.mm / 2, 9, 'x'),
  roller: shape => outlineRing(shape.mm / 2, 4, 'y'),
  stay: shape => outlineBox(80, shape.mm, 18, 1 + shape.mm / 2),
  'side-stay': shape => outlineBox(18, shape.mm, 44, 1 + shape.mm / 2),
  brake: () => outlineBox(40, 5, 14, -1.5),
  damper: () => outlineBox(9, 10, 9)
}

/** The row a wheel or tire draws from, or the default for a shape with none. */
const wheelShape = (id: string) => row(WHEELS, id, DEFAULT_WHEEL)
const tireShape = (id: string) => row(TIRES, id, DEFAULT_TIRE)

/**
 * Which shape a wheel or tire socket draws, most specific first: a part in the
 * slot names its own — a wheel-and-tire set names one for each of the four
 * sockets it fills — then a chassis default's authored shape, then the kit's
 * own phrase, which *is* the key once slugged (§5.6). `catalog:verify` holds
 * every phrase in the catalog to a row, so the last fallback is for a build
 * that arrived from a URL, not for the catalog.
 */
function shapeIdFor(kind: 'wheel' | 'tire', slot: ResolvedSlot | undefined): string {
  const entry = slot?.entries[0]
  // `||`, not `??`: an entry with an empty label resolves to an empty id, and
  // that is a miss like any other rather than a shape of its own.
  return (entry?.partId ? props.parts.get(entry.partId)?.[kind] : entryShapeId(entry)) || ''
}

const rowFor = {
  wheel: (slot: ResolvedSlot | undefined) => wheelShape(shapeIdFor('wheel', slot)),
  tire: (slot: ResolvedSlot | undefined) => tireShape(shapeIdFor('tire', slot))
}

/** The catalog record of the part in a slot's `entry`th place, when it is a catalog part. */
function partIn(slot: ResolvedSlot | undefined, entry = 0) {
  const id = slot?.entries[entry]?.partId
  return id ? props.parts.get(id) : undefined
}
const specsOf = (slot: ResolvedSlot | undefined, entry = 0): PartSpecs | undefined => partIn(slot, entry)?.specs
const coloursOf = (slot: ResolvedSlot | undefined, entry = 0): PartColours | undefined => partIn(slot, entry)?.colours
/**
 * The fittings row a part names, or '' for a kit's moulding or a part with
 * none: its table's default. A damper entry with no item number names its own
 * row in `shape` — a starter pack's stabiliser balls, which Tamiya sells in no
 * bag of their own. Only the damper slot reads it: a wheel's or tire's `shape`
 * is a key of another table.
 */
function fittingIn(slot: ResolvedSlot | undefined, entry = 0): string {
  const own = slot?.entries[entry]
  if (own?.partId) return partIn(slot, entry)?.fitting ?? ''
  return (slot?.type === 'damper' && own?.shape) || ''
}

/**
 * The size of what is not a wheel or a tire; those are their row's diameter.
 * A roller is its record's `rollerDiameterMm` where the catalog has one (42
 * rollers), else its row's, whose default is the 13 mm the taps were measured
 * at (§5.5); a plate its record's thickness, else its row's.
 */
function diameterFor(kind: ProxyKind, slot: ResolvedSlot, entry: number, fitting: string): number {
  switch (kind) {
    case 'roller': return specsOf(slot, entry)?.rollerDiameterMm ?? rollerRow(fitting).mm
    case 'stay': case 'side-stay': return specsOf(slot, entry)?.plateThicknessMm ?? plateRow(kind, fitting).thicknessMm
    default: return 0
  }
}

/**
 * What in the build moves a socket (shared/scene/sockets.ts): an end plate
 * whose row carries roller holes, and where each damper-slot part mounts.
 * Only a plate authored for an end moves that end's rollers; a side row or
 * one with no holes leaves them on the posts, which `socketsFor` does anyway.
 */
function fitOf(bySlot: ReadonlyMap<string, ResolvedSlot>): Fit {
  const plates: NonNullable<Fit['plates']> = {}
  for (const slotId of ['front-stay', 'rear-stay'] as const) {
    const slot = bySlot.get(slotId)
    const plate = slot?.entries.length ? plateRow('stay', fittingIn(slot)) : undefined
    // Only a plate that moves a socket: any other keeps the chassis' own set, which `socketsFor` keeps.
    if (plate?.holes || plate?.brakeZ !== undefined) plates[slotId] = plate
  }
  const damper = bySlot.get('damper')
  // A weight sold bare goes where the build says; everything else carries its
  // own answer, which `catalog:verify` is what keeps true (schema.ts `mount`).
  return { plates, dampers: damper?.entries.map((own, entry) => own.mount ?? damperRow(fittingIn(damper, entry)).mount) }
}

/**
 * What the raycast actually tests: invisible volumes larger than the visible
 * shapes, because a 13 mm roller on a 165 mm car filling a phone screen is
 * about 28 px, under the 44 px minimum tap target. The roller's is a sphere
 * twice its diameter, up to a 13 mm roller's. The wheel's face sits proud of
 * the tire's, so a tap on the hub is the wheel and one on the band is the
 * tire; whether a thumb can tell them apart is what the phone test decides.
 *
 * The body is the exception: its hit volume is its own shell, exactly what is
 * drawn. While the body was a translucent box (§5.5) a box-sized hit stole
 * taps aimed at the wheels behind it; now the shell is solid, whatever the
 * reader sees under their finger is what they get, and lifting the shell is
 * how they reach what it covers. A clear shell is drawn see-through but is
 * still there to tap: the motor under a clear Avante is reached the same way.
 *
 * The gears sit beside the motor's hit box rather than centred on their
 * sockets, so theirs are moved off it: a PRO train reaches in from the axle
 * toward the motor, a crown gear stands outboard of its housing, and a counter
 * gear's box starts where the turned motor's ends, at x = 17.
 */
const HIT: Record<Exclude<Solid, Hidden>, (shape: Shape) => BufferGeometry> = {
  motor: () => new BoxGeometry(34, 19, 24),
  gear: shape => shafts() === 1
    ? new BoxGeometry(16, 20, 16).translate(6 * gearSide(shape), 0, 4 * (shape.towardNose || 1))
    : new BoxGeometry(14, 22, 30).translate(4 * gearSide(shape), 3, -6 * (shape.towardNose || 1)),
  'counter-gear': shape => new BoxGeometry(7, 20, 20).translate(20.5, 5, 7 * (shape.towardNose || 1)),
  wheel: ({ mm }) => new CylinderGeometry(mm / 2, mm / 2, 12, 16).rotateZ(Math.PI / 2),
  tire: ({ mm }) => new CylinderGeometry(mm / 2 + 2, mm / 2 + 2, 9, 16).rotateZ(Math.PI / 2),
  // Capped at the default roller's: a 19 mm roller's 38 mm sphere took the front tire's taps (§5.6).
  roller: ({ mm }) => new SphereGeometry(Math.min(mm, rollerRow(DEFAULT_ROLLER).mm), 12, 8),
  stay: () => new BoxGeometry(60, 8, 22),
  'side-stay': () => new BoxGeometry(22, 8, 40),
  brake: () => new BoxGeometry(40, 8, 16),
  // A ball capping a roller is inside that roller's sphere, so its own volume hugs it (see `proxyAt`).
  damper: shape => damperRow(shape.fitting).mount === 'roller' ? new SphereGeometry(5, 8, 6).translate(0, 4, 0) : new BoxGeometry(18, 14, 12)
}

/**
 * An empty slot is grey. Everything else is drawn in the colour of what fills
 * it: a catalog part in its own recorded colour, stock or changed alike, and a
 * kit's moulded body, wheels and tires in the kit's. Changed parts used to be
 * orange (§5.5), which made the pane say *that* the reader changed a part and
 * never *which* one — a blue roller swapped for a red one looked the same.
 * The list row already says what was changed; the pane now shows the car.
 */
const EMPTY_COLOUR = 0xb8bcc2
/** What a material is besides its colour: a painted piece's finish, or a shell or a tire. */
type Finish = parts.PaintFinish | 'shell' | 'rubber'
/**
 * How each finish meets the studio's light. Metal is fully metallic: all its
 * colour comes from what it reflects, which the studio is there to give it.
 */
const SURFACE: Record<Finish, { roughness: number; metalness: number }> = {
  shell: { roughness: 0.4, metalness: 0 },
  rubber: { roughness: 0.9, metalness: 0 },
  metal: { roughness: 0.3, metalness: 1 },
  plastic: { roughness: 0.5, metalness: 0 },
  // A mirror in the part's colour: silver, gold, or a kit's blue.
  plated: { roughness: 0.1, metalness: 1 },
  'matte-plated': { roughness: 0.38, metalness: 1 },
  // Black and satin, whether woven sheet or a carbon-filled moulding.
  carbon: { roughness: 0.32, metalness: 0 }
}
/** A part record's finish as the pane draws it: an aluminium part is its metal. */
const PART_SURFACE: Record<PartFinish, parts.PaintFinish> = { plated: 'plated', 'matte-plated': 'matte-plated', aluminium: 'metal', carbon: 'carbon' }
/**
 * The desktop tier (shared/scene/occlusion.ts): the frames the 16:9 poster is
 * shown in, so each poster matches the first frame of the tier it covers.
 */
const OCCLUDED = '(min-width: 640px)'
/** The layer an empty slot's outline is drawn on, which occlusion does not see. */
const OUTLINE_LAYER = 1
/** How strongly each highlight lights a part's outline (shared/scene/shading.ts). */
const RIM: Record<Highlight, number> = { none: 0, hover: 0.9, open: 1.6 }
/** The kinds a carbon finish is woven sheet on; a carbon wheel is a carbon-filled moulding. */
const PLATE_KINDS: ReadonlySet<ProxyKind> = new Set(['stay', 'side-stay', 'brake'])
/** The kinds a part record's finish reaches; the catalog records it on no other (scripts/catalog/finish.ts). */
const SOLD_AS_MATERIAL: ReadonlySet<ProxyKind> = new Set(['wheel', 'body', 'stay', 'side-stay', 'brake'])
const FINISH: Record<ProxyKind, Finish> = {
  body: 'shell',
  motor: 'metal',
  gear: 'plastic',
  'counter-gear': 'plastic',
  wheel: 'plastic',
  tire: 'rubber',
  roller: 'metal',
  stay: 'plastic',
  'side-stay': 'plastic',
  brake: 'plastic',
  damper: 'metal',
  axle: 'metal',
  bearing: 'plastic',
  'propeller-shaft': 'metal',
  'chassis-unit': 'metal'
}
/** A motor's is its end bell: AO-1001's white, the motor a kit ships with. */
const STOCK_TINT: Record<ProxyKind, number> = {
  body: 0xd8dbe0,
  motor: 0xeef0f2,
  // A kit's gears have no item number and no recorded colour, so a neutral
  // moulding until a catalog gear set is put in.
  gear: 0xd9d4c5,
  'counter-gear': 0xd9d4c5,
  wheel: 0x3a3d42,
  tire: 0x1d1f22,
  roller: 0xc9ced6,
  stay: 0x2a2d31,
  'side-stay': 0x2a2d31,
  brake: 0x3a3d42,
  damper: 0xb9bec6,
  // A kit's axles and propeller shaft are bare steel; its bushings dark moulding.
  axle: 0xc9ced6,
  bearing: 0x3a3d42,
  'propeller-shaft': 0xc9ced6,
  'chassis-unit': 0xc9ced6
}

/** A catalog colour, `#rrggbb`, as the number three takes. */
function hexColour(hex: string): number
function hexColour(hex: string | undefined): number | undefined
function hexColour(hex: string | undefined) {
  return hex ? parseInt(hex.slice(1), 16) : undefined
}

/** The pixel distance under which a pointer down/up pair is a tap, not an orbit. */
const TAP_SLOP_PX = 6

/**
 * `paints` is set for a shape drawn in more than one colour, one per draw group
 * of its geometry: the motor, whose end bell and sticker are what tell one
 * motor from another, with `tint` its end bell; and the gears, in `tint` on
 * steel pins. `finish` overrides the kind's own material for a part whose
 * material is the product — a plated or aluminium wheel against a moulded one.
 */
type ProxyData = { slotId: string; state: ProxyState; kind: ProxyKind; tint: number; finish?: Finish; paints?: readonly parts.Paint[]; capsRoller?: boolean }

/**
 * The body shells, one lazily imported JSON file each, generated from
 * data/bodies by `npm run catalog:generate` (§5.6). A shell is fetched when a
 * kit or body part that draws it is chosen, so the 3D chunk carries none of
 * the 196 and the page payload only their ids. Loaded shapes are plain numbers
 * and outlive a remount; geometry is built from them per scene.
 */
const SHAPE_FILES = import.meta.glob<Silhouette>('../../../content/bodies/*.json', { import: 'default' })
const shapes = new Map<string, Silhouette>([['default', DEFAULT_SILHOUETTE]])

let cleanup: (() => void) | undefined
let resetCamera = () => {}
/** Granted inside the click that switches the car on; see `togglePower`. */
let startMotor = () => {}

/**
 * The shell lifted off the chassis: the assembled car is what a reader
 * recognises, the lifted one is how they reach the motor and cells under it.
 * The pane opens lifted, so the first sight is what the build is made of.
 * The toggle is in the pane, beside reset, and the list needs no equivalent
 * because every slot is already a row there.
 */
const lifted = ref(true)
const LIFT_MM = 24
const LIFTED_OPACITY = 0.35
/**
 * A clear or smoked moulding — a clear body, a kit's clear chassis — seated.
 * It is what the plastic is, so it holds on the assembled car too; lifted, a
 * clear shell fades no further than an opaque one does. Enough to read as a
 * tinted shell with the chassis behind it: at 0.45 a clear body was a ghost.
 */
const CLEAR_OPACITY = 0.65

/**
 * The car switched on (docs/PLAN.md §5.6): the axles ease up to `SPIN_RPS`
 * and every wheel, tire and gear turns with them at its own rate; switched
 * off, they coast to a stop.
 *
 * 2.4 is what the *wheels* do, and the finest rim in the catalog sets it: a
 * 12-spoke face has a 30° pitch, so it aliases above 15° a frame, and 2.4 rps
 * is 14.4° a frame at 60 fps. Every other rim has room to spare, and the 5-
 * and 6-spoke faces that are most of the catalog stay clear even at 30 fps —
 * the 6-spoke by 1.2°, which is the margin to check before nudging this up.
 * It was 0.6 until 2026-09-22, when the car was visibly slower than the motor
 * it could be heard running (owner).
 *
 * The gear train cannot come with it — see `GEAR_RATE`. At this speed the
 * 6-tooth PRO pinion would turn 47° a frame at 60 fps against a 60° tooth
 * pitch, well past where it runs visibly backwards, so it keeps the speed it
 * has always had. The cost is that a gear on an axle now turns slower than
 * the wheel on the same axle. That is only there to be found with the shell
 * lifted and the chassis looked into; a pinion strobing backwards would be
 * there to be seen every time.
 */
const powered = ref(false)
const SPIN_RPS = 2.4
/**
 * What a gear in the train turns for one turn of `SPIN_RPS`, on top of its
 * own ratio: exactly the factor that holds the train at the 0.6 rps axle
 * speed it was drawn against, so nothing in it strobes.
 */
const GEAR_RATE = 0.25
/**
 * Time constants of the ease: a motor spins up faster than a car coasts
 * down. With the stop below, a coast from full speed takes ln(30) × 0.5 ≈
 * 1.7 s; at 0.8 and 0.005 it was 3.8 s of the pane drawing a crawl.
 */
const SPIN_UP_S = 0.4
const COAST_S = 0.5
/**
 * Below this a coasting car has stopped, and the pane stops drawing. It rides
 * with `SPIN_RPS` at a thirtieth of it, which is what keeps the ln(30) above
 * true — pinned at 0.02 a four-times-faster car would coast 2.39 s instead of
 * 1.70, 41% longer, and would snap to a stop from a quick flick of the switch
 * at a different point than it used to.
 */
const STOPPED_RPS = SPIN_RPS / 30
/** The longest step one frame may take, so a tab coming back does not jump. */
const MAX_STEP_S = 0.1
/** How far the switch slider moves toward the nose when the car is on. */
const SWITCH_TRAVEL_MM = 4

/**
 * The motor heard as well as seen (`app/utils/motorSound.ts`), and **on by
 * default** (owner, 2026-09-22) — which is where it started, before it was
 * hushed on 2026-09-21 for being a sound still being tuned. The tuning is
 * settled now, and what settled it left the motor about 13 dB quieter than
 * any version before it, which is the half of this that matters: a noise
 * nobody asked for is only welcome if it is quiet. 開動 now makes one, and
 * the toggle beside it stops it, remembered per browser the way the race
 * class is on the page.
 *
 * The stored value is read as "only an explicit yes means muted", which keeps
 * all three groups of readers on what they last said: one who has never
 * touched the toggle gets the new default, a '1' from one who switched the
 * sound off still silences it, and the '0' written under the old default
 * still means what it meant — that they wanted to hear it. Storage can be
 * absent or throw, and the pane works the same without it.
 */
const muted = ref(false)
const MUTE_KEY = 'scene-muted'
onMounted(() => {
  try {
    muted.value = localStorage.getItem(MUTE_KEY) === '1'
  }
  catch {}
})

/**
 * Teeth on the pinion the motor drives: what puts the whine two octaves and a
 * bit above the buzz. A PRO chassis' double-shaft motor carries a 6-tooth
 * pinion at each end; a single-shaft one drives the counter gear through 8.
 * Fixed for the pane's life, since the page remounts it per chassis.
 */
const pinionTeeth = layoutFor(props.chassis).motor.across ? 8 : 6

/**
 * The free speed of the motor actually fitted, which is what the sound is
 * built out of — a Hyper-Dash is audibly not a Torque-Tuned. Tamiya prints a
 * range per motor, so the middle of it stands for the motor. 94380, the
 * FA-130 every kit ships with, prints none and neither does an empty slot;
 * 13,000 is where a stock can sits, beside the 13,500 of the Torque-Tuned 2
 * that does print one.
 */
const STOCK_RPM = 13000
const motorRpm = computed(() => {
  const { motorRpmMin: min, motorRpmMax: max } = specsOf(props.slots.find(slot => slot.id === 'motor')) ?? {}
  return min && max ? (min + max) / 2 : min ?? max ?? STOCK_RPM
})

/**
 * The switch. Flipping `powered` would be the whole of it for the picture,
 * but an `AudioContext` is granted only inside the gesture that asked for it:
 * a watcher on `powered` runs a microtask later, which Safari has already
 * declined by then.
 */
function togglePower() {
  powered.value = !powered.value
  if (powered.value && !muted.value) startMotor()
}

function toggleMute() {
  muted.value = !muted.value
  // Unmuting is the first gesture the context may ever see: the reader who
  // muted on their last visit switched this car on to silence.
  if (!muted.value && powered.value) startMotor()
  emit('mute', muted.value)
  // Written here rather than from a watcher on `muted`, because this is the
  // only thing that ever changes it: a watcher also fired on the read-back
  // above, putting the restored value straight back where it came from.
  try {
    localStorage.setItem(MUTE_KEY, muted.value ? '1' : '0')
  }
  catch {}
}

/**
 * The chassis pieces a kit moulds in its own colours: which of the kit's
 * colours each takes, and which `clear` entry makes it see-through. MS's nose
 * and tail units take the frame's unless the kit gives them a colour of their
 * own; no wiki row makes them clear apart from it.
 */
const KIT_MOULDED: Partial<Record<ChassisRole, { colour: (colours: NonNullable<Kit['colours']>) => string | undefined; clear: KitClear }>> = {
  frame: { colour: colours => colours.chassis, clear: 'chassis' },
  ends: { colour: colours => colours.chassisEnds ?? colours.chassis, clear: 'chassis' },
  aParts: { colour: colours => colours.aParts, clear: 'aParts' },
  switch: { colour: colours => colours.aParts, clear: 'aParts' }
}

onMounted(() => {
  const element = canvas.value
  if (!element) return

  // Per instance, not per module: the caches are disposed with the scene that
  // filled them, and the component remounts on every chassis change.
  const geometries = new Map<string, BufferGeometry>()
  const trains = new Map<string, parts.Rotor[]>()
  const materials = new Map<string, MeshStandardMaterial>()

  function cached<T>(cache: Map<string, T>, key: string, make: () => T) {
    let found = cache.get(key)
    if (!found) {
      found = make()
      cache.set(key, found)
    }
    return found
  }
  const geometry = <K extends ProxyKind, T>(table: Record<K, (arg: T) => BufferGeometry>, kind: K, arg: T, key: string) =>
    cached(geometries, key, () => table[kind](arg))
  const train = (kind: Train, shape: Shape, key: string) => cached(trains, key, () => TRAINS[kind](shape))

  /**
   * The body is held apart from the cache: a kit change on the same chassis
   * does not remount, and with a silhouette per kit the cache would keep every
   * shell a reader had browsed past. One slot, disposed when the kit changes.
   */
  let body: { id: string; geometry: BufferGeometry } | undefined
  function bodyFor(id: string, silhouette: Silhouette) {
    if (body?.id !== id) {
      body?.geometry.dispose()
      const geometry = bodyGeometry(silhouette)
      // The shell is its own hit volume, and a long thin shell's bounding box
      // rejects most rays before its triangles are tested; its sphere would not.
      geometry.computeBoundingBox()
      body = { id, geometry }
    }
    return body.geometry
  }

  /**
   * The shell's material, on its own rather than in the cache: its opacity is
   * animated every frame of a lift, which no shared material may be. It is
   * always transparent, because whether a material is opaque is baked into
   * its shader program and flipping it mid-lift would recompile; at opacity 1
   * a transparent material draws identically. The only other transparent
   * thing is a kit's clear chassis, and the shell's `renderOrder` draws it
   * after that from every angle, not only the ones where it is nearer.
   *
   * Clearcoated, so a painted shell reads as paint under a gloss layer: the
   * studio's panels reflect in the coat while the colour stays in the base.
   */
  const shell = new MeshPhysicalMaterial({ roughness: 0.4, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.08, transparent: true })
  const shellRim = dress(shell).rim
  /** The shell's opacity seated, set by `populate`; `tickBody` fades from it as the shell lifts. */
  let seatedOpacity = 1
  function styleShell(highlight: Highlight, tint: number, finish: Finish) {
    // Plated or painted, it is the one shell material: metalness and roughness
    // are uniforms, so a plated kit costs no second shader program.
    Object.assign(shell, SURFACE[finish])
    shell.color.setHex(tint)
    shellRim.value = RIM[highlight]
    return shell
  }

  /**
   * The chassis' own materials, one per colour, disposed with the rest. A clear
   * moulding is transparent from the start rather than switched to it, and has
   * a material of its own for the same shader-program reason as the shell's.
   */
  function chassisMaterial(colour: number, clear = false) {
    const key = `chassis:${colour}:${clear}`
    let found = materials.get(key)
    if (!found) {
      found = new MeshStandardMaterial({ color: colour, roughness: 0.6, transparent: clear, opacity: clear ? CLEAR_OPACITY : 1 })
      // Never highlighted, but dressed all the same, so it shares the parts' program.
      dress(found)
      materials.set(key, found)
    }
    return found
  }

  /**
   * One material per state and highlight, shared by every proxy in that state,
   * so repopulating a socket allocates a mesh and nothing else. Highlight is a
   * rim of light round the part's outline (shared/scene/shading.ts), and an
   * empty slot's outline, a line a pixel wide with no surface to have a rim,
   * is lifted in its own colour instead.
   */
  function material(state: ProxyState, highlight: Highlight, kind: ProxyKind, tint: number, finish: Finish = FINISH[kind]) {
    // An empty slot is an outline, not a ghost: a translucent solid read as a
    // part that was half there. Everything else is opaque, the body included —
    // what it covers is reached by lifting it — unless the body is clear plastic.
    if (kind === 'body' && state !== 'empty') return styleShell(highlight, tint, finish)
    const empty = state === 'empty'
    const colour = empty ? EMPTY_COLOUR : tint
    // Stock and changed draw alike now, so only emptiness splits the cache.
    const weave = finish === 'carbon' && PLATE_KINDS.has(kind)
    const key = `${empty}:${highlight}:${colour}:${finish}:${weave}`
    let found = materials.get(key)
    if (!found) {
      found = new MeshStandardMaterial({
        color: colour,
        ...SURFACE[finish],
        wireframe: empty,
        emissive: colour,
        emissiveIntensity: empty ? RIM[highlight] * 0.4 : 0
      })
      dress(found, { weave }).rim.value = empty ? 0 : RIM[highlight]
      materials.set(key, found)
    }
    return found
  }

  /** A proxy's material, or one per draw group when it is painted in several; an empty slot's outline has no groups. */
  function materialsFor(data: ProxyData, highlight: Highlight) {
    if (data.paints && data.state !== 'empty') {
      return data.paints.map(paint => material(data.state, highlight, data.kind, paint.colour, paint.finish))
    }
    return material(data.state, highlight, data.kind, data.tint, data.finish)
  }

  const renderer = new WebGLRenderer({ canvas: element, antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

  // Khronos PBR Neutral: the tone curve that leaves base colours where they
  // are, and the kits' colours were matched to box art by eye (§5.6).
  renderer.toneMapping = NeutralToneMapping
  // The shadow's light is fixed to the world and the car only moves when the
  // build does, so an orbit leaves the shadow where it was: the map is redrawn
  // on request (`shadowsChanged`), not on every frame the camera moves.
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = VSMShadowMap
  renderer.shadowMap.autoUpdate = false

  const scene = new Scene()
  // The light is what the materials reflect, not lamps: a studio of glowing
  // panels, prefiltered once per mount (docs/PLAN.md §5.6, "Materials and
  // light"). The map belongs to this renderer's context, so it is made here
  // and disposed with it, not kept across remounts.
  scene.environment = studioEnvironment(renderer)
  // Below 1, so the key light below has room to shade a white shell: at full
  // strength the panels light a body from every side and its facets read alike.
  scene.environmentIntensity = 0.75
  const camera = new PerspectiveCamera(35, 1, 10, 2000)
  /**
   * The home view: a three-quarter angle from the front-right, at whatever
   * distance fits the car's width to the frame's. Distance is a function of
   * aspect because the pane is 16:9 on a desktop and 4:3 on a phone, and a
   * fixed distance that filled the wide frame left the car at half the narrow
   * one — where every roller's tap target was already the marginal case.
   */
  const HOME_DIRECTION = new Vector3(170, 120, 210).normalize()
  // Half-extents of the car as projected from that direction, not one
  // bounding sphere: a Mini 4WD is three times wider than it is tall, and a
  // sphere fit fills the frame's height while leaving a third of its width.
  // Height includes the nearest roller, which hangs below the projected
  // chassis at this elevation and was the first thing a 16:9 frame clipped.
  const HALF_WIDTH_MM = 95
  const HALF_HEIGHT_MM = 70
  function homeDistance(aspect: number) {
    const halfVertical = (camera.fov / 2) * (Math.PI / 180)
    const halfHorizontal = Math.atan(Math.tan(halfVertical) * aspect)
    return Math.max(HALF_WIDTH_MM / Math.sin(halfHorizontal), HALF_HEIGHT_MM / Math.sin(halfVertical))
  }
  camera.position.copy(HOME_DIRECTION).multiplyScalar(homeDistance(1))
  camera.layers.enable(OUTLINE_LAYER)

  // One lamp on top of the studio, for form: it shades the faces the soft
  // panels light alike, and it is the light the ground shadow will come from.
  const key = new DirectionalLight(0xffffff, 1.2)
  key.position.set(120, 200, 160)
  scene.add(key)

  /**
   * The light the floor's shadow comes from, which lights nothing: at zero
   * intensity it adds nothing to the car, but a `ShadowMaterial` darkens by
   * every light's shadow whatever its strength. Nearly overhead, so the car
   * stands in its shadow as a product shot does, where the key's would fall
   * behind the car from the home view. Its map covers the car's footprint
   * with the widest plates, and is blurred wide because a shadow that soft is
   * what reads as contact rather than as a second, darker car on the floor.
   */
  const shade = new DirectionalLight(0xffffff, 0)
  shade.position.set(-30, 300, -40)
  shade.castShadow = true
  shade.shadow.mapSize.set(512, 512)
  Object.assign(shade.shadow.camera, { left: -130, right: 130, top: 130, bottom: -130, near: 100, far: 500 })
  shade.shadow.radius = 14
  shade.shadow.blurSamples = 16
  shade.shadow.bias = -0.002
  scene.add(shade)

  /**
   * The floor the car stands on: invisible but for the shadow on it, so it
   * lays over the frame's own background the way the transparent canvas does.
   * Tires touch y = 0, and a lift for large wheels raises the car, not this.
   */
  const ground = new Mesh(new PlaneGeometry(600, 600).rotateX(-Math.PI / 2), new ShadowMaterial({ opacity: 0.35 }))
  ground.receiveShadow = true
  scene.add(ground)
  function shadowsChanged() {
    renderer.shadowMap.needsUpdate = true
  }

  const car = new Group()
  // The chassis itself is not a slot, so it is drawn once under the sockets
  // rather than as a proxy (shared/scene/generators/chassis.ts). It rides in
  // the car group so a lift for large wheels raises it too.
  const chassis = new Group()
  for (const piece of chassisPieces(props.chassis)) {
    const mesh = new Mesh(piece.geometry, chassisMaterial(piece.colour))
    mesh.castShadow = true
    mesh.userData = { colour: piece.colour, role: piece.role, end: piece.end }
    chassis.add(mesh)
  }
  car.add(chassis)

  /**
   * The chassis in the kit's mouldings: its frame and A parts in the colours
   * the box has them in, see-through where they are clear plastic, and black
   * for a bare chassis or a kit the wiki has no row for. Repainted with every
   * populate, because a kit change on the same chassis does not remount.
   *
   * The parts that *are* the chassis paint over the kit (§5.6, "The rest of
   * the parts"): gold terminals repaint the terminal caps, a gear cover the A
   * parts, an MS unit or colour chassis set its frame or its ends — in the
   * order the slots are listed, the later winning. A bumperless unit in a
   * stay slot takes that end's moulded bumper away.
   */
  function paintChassis(bySlot: ReadonlyMap<string, ResolvedSlot>) {
    const colours = props.kitColours
    const own = new Map<ChassisRole, number>()
    const terminal = hexColour(coloursOf(bySlot.get('terminal'))?.primary)
    if (terminal !== undefined) own.set('caps', terminal)
    for (const slot of [bySlot.get('gear-cover'), bySlot.get('chassis-unit')]) {
      slot?.entries.forEach((_, entry) => {
        const colour = hexColour(coloursOf(slot, entry)?.primary)
        if (colour === undefined) return
        for (const role of CHASSIS_UNITS[fittingIn(slot, entry)]?.repaint ?? []) own.set(role, colour)
      })
    }
    const bare = {
      1: !!PLATES[fittingIn(bySlot.get('front-stay'))]?.replacesBumper,
      [-1]: !!PLATES[fittingIn(bySlot.get('rear-stay'))]?.replacesBumper
    }
    for (const mesh of chassis.children) {
      if (!(mesh instanceof Mesh)) continue
      const { colour, role, end } = mesh.userData as { colour: number; role: ChassisRole; end?: 1 | -1 }
      mesh.visible = !(end && bare[end])
      const kit = KIT_MOULDED[role]
      const moulded = colours && kit ? kit.colour(colours) : undefined
      const clear = !own.has(role) && !!kit && !!colours?.clear?.includes(kit.clear)
      mesh.material = chassisMaterial(own.get(role) ?? hexColour(moulded) ?? colour, clear)
    }
  }

  /**
   * One group per socket, named for it. The set follows the build — a plate
   * with roller holes moves that end's rollers, each damper-slot part has a
   * place of its own (shared/scene/sockets.ts) — so each populate places the
   * groups it needs and drops the rest. A group that stays is only moved if
   * its socket did: the body's is animated by the lift, and resetting it to
   * rest mid-lift would jump.
   */
  const groups = new Map<string, Group>()
  function placeSockets(sockets: readonly SceneSocket[]) {
    const live = new Set(sockets.map(socket => socket.name))
    for (const [name, group] of groups) {
      if (live.has(name)) continue
      car.remove(group)
      groups.delete(name)
    }
    for (const socket of sockets) {
      let group = groups.get(socket.name)
      if (!group) {
        group = new Group()
        group.name = socket.name
        groups.set(socket.name, group)
        car.add(group)
      }
      // By value: a fitted socket set is rebuilt each time, its positions new arrays.
      const at = `${socket.position}:${socket.rotateY ?? 0}`
      if (group.userData.at !== at) {
        group.userData.at = at
        group.position.set(...socket.position)
        group.rotation.y = socket.rotateY ?? 0
      }
    }
  }
  let sockets = socketsFor(props.chassis)
  placeSockets(sockets)
  scene.add(car)

  const controls = new OrbitControls(camera, element)
  controls.target.set(0, 15, 0)
  controls.enableDamping = true
  controls.enablePan = false
  controls.minDistance = 120
  controls.maxDistance = 600
  controls.maxPolarAngle = Math.PI / 2 + 0.05
  controls.update()
  controls.saveState()

  /**
   * Frames are requested, not looped: a frame is scheduled only when something
   * changed, and a still scene schedules nothing, so an idle or scrolled-away
   * pane keeps no main-thread wake-up running either. The controls announce
   * their own motion through `change` — a drag, a zoom, and every frame damping
   * is still coasting, which is what keeps a released drag drawing to rest.
   *
   * Nothing is drawn before the first resize: a frame requested at mount runs
   * before the observer fires, draws into the default 300×150 canvas, and is
   * wiped by `setSize` before it is painted — having already sent `ready`.
   */
  let frame = 0
  let sized = false
  /**
   * Whether the first scene's shaders are built. Physical materials, shadows
   * and the environment make programs large enough that compiling them inside
   * the first `render` stalls a phone's main thread; `compileAsync` hands them
   * to the driver first (KHR_parallel_shader_compile where it has it) while
   * the poster still covers the pane, and nothing is drawn until it settles.
   */
  let compiled = false
  /** The desktop tier's passes, once loaded; until then, and on a phone, the renderer draws directly. */
  let occluder: Occlusion | undefined
  function requestRender() {
    if (sized && compiled && !frame) frame = requestAnimationFrame(tick)
  }
  let drawn = false

  /**
   * The body group eases toward its lifted or seated height, and the shell
   * fades as it rises so it hides nothing of what it was covering. While it
   * is still moving, each frame requests the next — through `requestRender`,
   * whose guard is what stops a frame being scheduled twice when the controls
   * are coasting at the same time.
   */
  const bodyGroup = groups.get('body')
  const bodyRestY = bodyGroup?.position.y ?? 0
  // Placed, not eased: the first frame is drawn under the poster, and a shell
  // rising as the poster fades would be a lift nobody asked for.
  if (bodyGroup && lifted.value) bodyGroup.position.y = bodyRestY + LIFT_MM

  /** One frame of an ease toward `target`, requesting the next while it is further off than `within`. */
  function easeToward(current: number, target: number, factor: number, within: number) {
    const remaining = target - current
    if (Math.abs(remaining) <= within) return target
    requestRender()
    return current + remaining * factor
  }

  function tickBody() {
    if (!bodyGroup) return
    const from = bodyGroup.position.y
    bodyGroup.position.y = easeToward(from, bodyRestY + (lifted.value ? LIFT_MM : 0), 0.18, 0.05)
    // Lifted, the shell is there to be seen through, and a shadow the size of
    // the car under a shell that is barely there would say otherwise.
    for (const shellMesh of bodyGroup.children) shellMesh.castShadow = !lifted.value
    if (bodyGroup.position.y !== from) shadowsChanged()
    const progress = (bodyGroup.position.y - bodyRestY) / LIFT_MM
    shell.opacity = seatedOpacity - progress * (seatedOpacity - Math.min(seatedOpacity, LIFTED_OPACITY))
  }

  /**
   * The drive: one axle speed and one axle angle for the whole car, each
   * spinner turned to the angle times its rate. The angle is the scene's,
   * not a mesh's, so a kit swap mid-spin rebuilds the meshes without
   * resetting them; it is never wrapped, because the rates are not whole
   * numbers and a wrap would jump every gear but the axle's. While the car is
   * on or still coasting, each frame requests the next — unless the pane is
   * scrolled away, when it stops and the next frame on screen starts the
   * clock again from a zero step.
   */
  let speed = 0
  let turned = 0
  let lastSpin = 0
  let onScreen = true
  const motor = createMotorSound(pinionTeeth)
  startMotor = motor.start
  /**
   * What the motor is doing, which is not what the wheels are drawn doing: an
   * axle at speed turns some 66 times a second and `SPIN_RPS` draws 2.4, so
   * the sound takes the envelope out of it and puts the real rpm back in.
   * (The anti-strobe lie is `GEAR_RATE`'s now, not this one's.) Dividing by
   * `SPIN_RPS` is what makes that envelope 0–1 whatever `SPIN_RPS` becomes.
   */
  const heard = () => muted.value || !onScreen || document.hidden ? 0 : speed / SPIN_RPS
  function tickSpin() {
    const now = performance.now()
    const step = lastSpin ? Math.min((now - lastSpin) / 1000, MAX_STEP_S) : 0
    const on = powered.value
    speed += ((on ? SPIN_RPS : 0) - speed) * (1 - Math.exp(-step / (on ? SPIN_UP_S : COAST_S)))
    if (!on && speed < STOPPED_RPS) speed = 0
    turned += speed * step * Math.PI * 2
    for (const { object, axis, rate } of spinners) object.rotation[axis] = turned * rate
    // Unconditional on purpose, and it must stay that way: the frame that
    // stops the car is the same frame that forces `speed` to 0 above, so a
    // guard like `if (on || speed)` here would skip the one call that fades
    // the sound out and schedules the suspend — leaving a motor running under
    // an audible floor for as long as the page is open.
    motor.set(heard(), motorRpm.value)
    lastSpin = (on || speed) && onScreen ? now : 0
    if (lastSpin) requestRender()
  }

  /** The switch slider eases to on or off the way the shell eases up and down. */
  const slider = chassis.children.find(piece => (piece.userData as { role: ChassisRole }).role === 'switch')
  function tickSwitch() {
    if (slider) slider.position.z = easeToward(slider.position.z, powered.value ? SWITCH_TRAVEL_MM : 0, 0.35, 0.02)
  }

  function tick() {
    frame = 0
    controls.update()
    tickBody()
    tickSpin()
    tickSwitch()
    if (occluder) occluder.render()
    else renderer.render(scene, camera)
    if (!drawn) {
      drawn = true
      emit('ready')
    }
  }
  controls.addEventListener('change', requestRender)

  let hits: Mesh[] = []
  let proxies: Mesh[] = []
  /** What turns when the car is on, rebuilt with the meshes by `populate`. */
  let spinners: { object: Object3D; axis: 'x' | 'z'; rate: number }[] = []
  let hovered: string | null = null

  const highlightFor = (slotId: string): Highlight =>
    slotId === props.openSlotId ? 'open' : slotId === hovered ? 'hover' : 'none'

  /**
   * The colour a proxy is drawn in, most specific first. A slot holding a
   * catalog part takes that part's colour — a wheel-and-tire set gives the
   * tire socket its `tire` — whether the kit shipped it or the reader chose
   * it. A kit's own moulded body, wheels and tires have no item number and
   * take the kit's recorded colours, as long as the slot is still the kit's.
   * Then the category's natural colour.
   *
   * A stock roller falls back to the kit's A parts, because that is the sprue
   * it is moulded on: the wiki records an A-parts colour for almost every kit
   * and a roller colour for none, so without this every kit's rollers were the
   * stock grey while its chassis was painted correctly around them. A kit
   * whose rollers are not its A parts overrides it in data/overrides/kits.yml.
   */
  function tintFor(kind: ProxyKind, slot: ResolvedSlot, entry = 0): number {
    const part = coloursOf(slot, entry)
    const own = kind === 'tire' ? part?.tire ?? part?.primary : part?.primary
    if (own) return hexColour(own)
    if (slot.swapped) return STOCK_TINT[kind]
    const kit = props.kitColours
    const moulded = kind === 'roller' ? kit?.roller ?? kit?.aParts
      : kind === 'body' || kind === 'wheel' || kind === 'tire' || kind === 'damper' ? kit?.[kind] : undefined
    return hexColour(moulded) ?? STOCK_TINT[kind]
  }

  /**
   * Whether a body is clear plastic, by the same precedence as its colour: a
   * body part's own record, else the kit's while the slot is still the kit's.
   */
  function clearFor(slot: ResolvedSlot): boolean {
    const part = coloursOf(slot)
    if (part) return !!part.clear
    return !slot.swapped && !!props.kitColours?.clear?.includes('body')
  }

  /**
   * A part sold as its material is drawn in it rather than in its kind's
   * moulding: a plated, aluminium or carbon wheel, a plated body, a carbon
   * plate or brake stay. A roller's or a weight's metal is its fitting row's.
   */
  function finishFor(kind: ProxyKind, slot: ResolvedSlot): parts.PaintFinish | undefined {
    if (!SOLD_AS_MATERIAL.has(kind)) return undefined
    const partId = slot.entries[0]?.partId
    const own = partId ? props.parts.get(partId)?.finish : undefined
    if (own) return PART_SURFACE[own]
    // A body is plated by its own record, else by the kit's while the slot is
    // still the kit's: the same precedence as its colour and its clearness.
    if (kind === 'body' && !slot.swapped && props.kitBodyFinish) return props.kitBodyFinish
    return undefined
  }

  /**
   * Whether a fitting is the metal it is sold as or a moulding, from its row:
   * an aluminium roller and a brass weight are metal, a plastic roller, a
   * stabiliser head and every plate — FRP and carbon are read by their
   * recorded colour — are not.
   */
  function fittingFinish(kind: ProxyKind, fitting: string): 'metal' | 'plastic' {
    switch (kind) {
      case 'damper': return WEIGHTS.has(damperRow(fitting).form) ? 'metal' : 'plastic'
      case 'bearing': return row(BEARINGS, fitting, DEFAULT_BEARING).finish
      case 'stay': case 'side-stay': case 'brake': return 'plastic'
      default: return 'metal'
    }
  }

  /**
   * The shell a body slot draws: a swapped-in body part's own, else the kit's,
   * else the wedge. `undefined` while its file is still loading, and the scene
   * repopulates when it lands; a shell that fails to load draws the wedge.
   */
  let disposed = false
  const loading = new Set<string>()
  function silhouetteFor(slot: ResolvedSlot): { id: string; silhouette?: Silhouette } {
    const partId = slot.entries[0]?.partId
    const id = (slot.swapped ? partId && props.parts.get(partId)?.body : props.kitBody) || 'default'
    const loaded = shapes.get(id)
    const load = SHAPE_FILES[`../../../content/bodies/${id}.json`]
    if (loaded || !load) return { id: loaded ? id : 'default', silhouette: loaded ?? DEFAULT_SILHOUETTE }
    if (loading.has(id)) return { id }
    loading.add(id)
    load()
      .then(shape => shapes.set(id, shape), () => shapes.set(id, DEFAULT_SILHOUETTE))
      .then(() => disposed || populate())
    return { id }
  }

  /**
   * A motor's paint: its end bell in `tint`, and its sticker and can from the
   * catalog record. A motor with no record — a PRO chassis' stock motor is a
   * label — is drawn as the bare kit motor.
   */
  function motorPaintsFor(slot: ResolvedSlot, tint: number) {
    const colours = coloursOf(slot)
    return parts.motorPaints({ cap: tint, sticker: hexColour(colours?.sticker), can: hexColour(colours?.can) })
  }

  /** The attach step: for each socket, clear it and add what its slot holds. */
  function populate() {
    const bySlot = new Map(props.slots.map(slot => [slot.id, slot]))
    paintChassis(bySlot)
    sockets = socketsFor(props.chassis, fitOf(bySlot))
    placeSockets(sockets)
    const rims = new Map<string, WheelShape>()
    const rimAt = (wheelSlotId: string) => {
      let found = rims.get(wheelSlotId)
      if (!found) rims.set(wheelSlotId, found = rowFor.wheel(bySlot.get(wheelSlotId)))
      return found
    }
    hits = []
    proxies = []
    spinners = []
    let lift = 0
    for (const socket of sockets) {
      const group = groups.get(socket.name)
      const slot = bySlot.get(socket.slotId)
      if (!group || !slot) continue
      group.clear()
      const state: ProxyState = !slot.entries.length ? 'empty' : slot.swapped ? 'changed' : 'stock'
      // An empty body slot draws nothing: a tap on the shell only lifts it and
      // the body is chosen from the list, so there is no target to outline,
      // and a wireframe loft over the whole car was the one outline that read
      // as a tangle rather than a slot.
      // Nor does an empty hidden fitting: an outlined axle inside a wheel is a
      // line nobody reads, and the list says the slot is empty.
      if ((socket.kind === 'body' || isHidden(socket.kind)) && state === 'empty') continue
      // Each damper-slot part has a socket of its own; a chassis-unit socket
      // draws the first unit that adds a piece, the rest only repaint.
      const entry = socket.kind === 'chassis-unit'
        ? slot.entries.findIndex((_, i) => CHASSIS_UNITS[fittingIn(slot, i)]?.piece)
        : socket.entry ?? 0
      if (entry < 0) continue
      const fitting = FITTINGS.has(socket.kind) ? fittingIn(slot, entry) : ''
      const shell = socket.kind === 'body' ? silhouetteFor(slot) : undefined
      // A shell still loading draws nothing yet, as an empty body does.
      if (shell && !shell.silhouette) continue
      // A tire seats on the wheel at its own end, so both sockets resolve the
      // same rim; `rims` keeps that to one lookup per end rather than per socket.
      const wheel = socket.kind === 'wheel' || socket.kind === 'tire'
        ? rimAt(socket.kind === 'wheel' ? slot.id : slot.id.replace('tire', 'wheel'))
        : undefined
      const tire = socket.kind === 'tire' ? rowFor.tire(slot) : undefined
      const mm = wheel && socket.kind === 'wheel' ? wheel.diameterMm : tire ? tire.diameterMm : diameterFor(socket.kind, slot, entry, fitting)
      const shape: Shape = {
        mm,
        wheel,
        tire,
        id: sign(socket.kind, wheel, tire),
        silhouette: shell?.id ?? '',
        towardNose: TOWARD_NOSE.has(socket.kind) ? (socket.position[2] < 0 ? -1 : 1) : 0,
        fitting,
        span: socket.span ?? 0
      }
      const tint = tintFor(socket.kind, slot, entry)
      const finish = finishFor(socket.kind, slot)
      const data: ProxyData = { slotId: socket.slotId, state, kind: socket.kind, tint, finish }
      if (socket.kind === 'body') seatedOpacity = clearFor(slot) ? CLEAR_OPACITY : 1
      if (socket.kind === 'motor') data.paints = motorPaintsFor(slot, tint)
      if (GEARS.has(socket.kind)) data.paints = parts.gearPaints(tint)
      if (FITTINGS.has(socket.kind)) {
        data.paints = socket.kind === 'brake' ? fittings.brakePaints(tint, finish ?? 'plastic')
          : socket.kind === 'roller' ? fittings.rollerPaints(rollerRow(fitting), tint)
            : fittings.fittingPaints(tint, finish ?? fittingFinish(socket.kind, fitting))
      }
      const key = shapeKey(socket.kind, shape)
      const kind = socket.kind
      const paint = materialsFor(data, highlightFor(socket.slotId))
      // `shell` is set and loaded for every body that reaches here (see above).
      // A gear train is a mesh per rotor, each at its pivot so it can turn in place.
      let visibles: Mesh[]
      if (kind === 'body') visibles = [new Mesh(bodyFor(shell!.id, shell!.silhouette!), paint)]
      // An empty hidden fitting has already gone on (above); the guard is for the type.
      else if (state === 'empty' && !isHidden(kind)) visibles = [new Mesh(geometry(OUTLINE, kind, shape, `o:${key}`), paint)]
      else if (isTrain(kind)) visibles = train(kind, shape, `t:${key}`).map(rotor => {
        const mesh = new Mesh(rotor.geometry, paint)
        mesh.position.set(...rotor.pivot)
        if (rotor.rate) spinners.push({ object: mesh, axis: rotor.axis, rate: rotor.rate * GEAR_RATE })
        return mesh
      })
      else visibles = [new Mesh(geometry(VISIBLE, kind, shape, `v:${key}`), paint)]
      for (const visible of visibles) {
        visible.userData = data
        // An outline would cast a shadow of its wireframe: an empty slot is
        // not a thing, so it throws none, and occlusion does not see it.
        visible.castShadow = state !== 'empty'
        if (state === 'empty') visible.layers.set(OUTLINE_LAYER)
        proxies.push(visible)
      }
      // A wheel or tire turns with its axle, an empty one's outline too. The
      // left wheel's socket is turned 180°, so in its own frame it turns back.
      // The axle through them too, whose socket is never turned.
      if (kind === 'wheel' || kind === 'tire' || kind === 'axle') spinners.push({ object: visibles[0]!, axis: 'x', rate: Math.cos(socket.rotateY ?? 0) })
      // The shell is its own hit volume; a hidden fitting has none, since what
      // is in front of it takes the tap; everything else gets an oversized one.
      if (kind === 'body') {
        // Last among the transparent: a clear chassis seen from below is nearer.
        visibles[0]!.renderOrder = 1
        group.add(...visibles)
        hits.push(...visibles)
      } else if (isHidden(kind)) {
        group.add(...visibles)
      } else {
        // Only a round part's size, a gear's end and a ball on a roller change its hit volume.
        data.capsRoller = kind === 'damper' && damperRow(fitting).mount === 'roller'
        const hitShape: Shape = { mm: ROUND.has(kind) ? mm : 0, id: '', silhouette: '', towardNose: GEARS.has(kind) ? shape.towardNose : 0, fitting: data.capsRoller ? fitting : '', span: 0 }
        const hit = new Mesh(geometry(HIT, kind, hitShape, `h:${shapeKey(kind, hitShape)}`))
        hit.visible = false
        hit.userData = data
        group.add(...visibles, hit)
        hits.push(hit)
      }
      // A tire larger than the axle height would sink into the ground: raise
      // the whole car instead, by the largest tire on it.
      if (socket.kind === 'tire') lift = Math.max(lift, mm / 2 - socket.position[1])
    }
    car.position.y = lift
    shadowsChanged()
    requestRender()
  }

  /** Re-pick materials after hover or the open slot changed; no re-attach. */
  function restyle() {
    for (const visible of proxies) {
      const data = visible.userData as ProxyData
      visible.material = materialsFor(data, highlightFor(data.slotId))
    }
    requestRender()
  }

  const raycaster = new Raycaster()
  const pointer = new Vector2()

  function proxyAt(clientX: number, clientY: number): ProxyData | null {
    const rect = element!.getBoundingClientRect()
    pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    )
    raycaster.setFromCamera(pointer, camera)
    const found = raycaster.intersectObjects(hits, false)
    const along = found.map(hit => hit.object.userData as ProxyData)
    // A stabiliser ball rests on its roller, inside the generous sphere that
    // roller takes taps with, so the nearest hit is never the ball. It wins
    // where the ray reaches it before leaving that sphere — not a ball at the
    // far end of the car that happens to lie behind this roller.
    if (along[0]?.kind === 'roller') {
      const reach = found[0]!.distance + 2 * rollerRow(DEFAULT_ROLLER).mm
      const ball = found.findIndex(hit => (hit.object.userData as ProxyData).capsRoller && hit.distance < reach)
      if (ball > 0) return along[ball]!
    }
    // A lifted shell fades so it hides nothing, so it must not take the taps
    // aimed at what it uncovered either: it wins only where nothing else is.
    // Seated, it is on the car and the nearest hit, clear or not.
    if (lifted.value) return along.find(proxy => proxy.kind !== 'body') ?? along[0] ?? null
    return along[0] ?? null
  }

  let down: { x: number; y: number } | null = null

  function onPointerDown(event: PointerEvent) {
    down = { x: event.clientX, y: event.clientY }
  }

  /**
   * A tap is a down/up pair that barely moved; anything else was an orbit and
   * must not also pick, or every drag would end by opening a picker.
   */
  function onPointerUp(event: PointerEvent) {
    if (!down) return
    const moved = Math.hypot(event.clientX - down.x, event.clientY - down.y)
    down = null
    if (moved > TAP_SLOP_PX) return
    const proxy = proxyAt(event.clientX, event.clientY)
    // The shell is the exception: a tap lifts it or seats it, and the body is
    // changed from its row in the list. Tapping the biggest thing on the car
    // to open a picker would make the picker the thing that keeps opening.
    if (proxy?.kind === 'body') lifted.value = !lifted.value
    else if (proxy) emit('select', proxy.slotId)
  }

  // Hover is a mouse affordance; a finger has nothing to hover with.
  function onPointerMove(event: PointerEvent) {
    if (event.pointerType !== 'mouse' || down) return
    const next = proxyAt(event.clientX, event.clientY)?.slotId ?? null
    if (next === hovered) return
    hovered = next
    element!.style.cursor = next ? 'pointer' : 'grab'
    restyle()
  }

  function onPointerLeave() {
    if (hovered === null) return
    hovered = null
    element!.style.cursor = 'grab'
    restyle()
  }

  const listeners = [
    ['pointerdown', onPointerDown],
    ['pointerup', onPointerUp],
    ['pointermove', onPointerMove],
    ['pointerleave', onPointerLeave]
  ] as const
  for (const [type, handler] of listeners) element.addEventListener(type, handler)

  const resize = new ResizeObserver(([entry]) => {
    const { width, height } = entry!.contentRect
    if (!width || !height) return
    renderer.setSize(width, height, false)
    occluder?.setSize(width, height)
    camera.aspect = width / height
    camera.updateProjectionMatrix()
    // Refit the home view to the new aspect, and make it what reset returns
    // to; the current view is only moved if it had not been touched yet.
    const atHome = camera.position.distanceTo(controls.position0) < 1e-6
    controls.position0.copy(HOME_DIRECTION).multiplyScalar(homeDistance(camera.aspect))
    if (atHome) {
      camera.position.copy(controls.position0)
      controls.update()
    }
    // Drawn here rather than requested: `setSize` has just cleared the canvas,
    // and a draw inside the observer callback lands in this frame's paint,
    // where a requested one would leave a blank frame first.
    sized = true
    if (!compiled) return
    cancelAnimationFrame(frame)
    tick()
  })
  resize.observe(element)

  const visibility = new IntersectionObserver(([entry]) => {
    onScreen = !!entry?.isIntersecting
    // Coming back asks for a frame, which puts the sound back with the
    // picture. Going away gets none — so the motor is silenced here, or a car
    // left running would follow the reader down the page.
    if (onScreen) requestRender()
    else motor.set(0, motorRpm.value)
  })
  visibility.observe(element)

  // The same hole one level up: a hidden tab runs no animation frame at all,
  // and a motor nobody can see is the one thing worse than one nobody asked for.
  const onTabChange = () => {
    if (document.hidden) motor.set(0, motorRpm.value)
    else requestRender()
  }
  document.addEventListener('visibilitychange', onTabChange)

  populate()
  // The desktop tier is loaded alongside the compile, and the first frame
  // waits for both, so occlusion never appears a moment after the poster
  // goes. Whatever happens, draw: a failed compile is compiled again by
  // `render`, and a failed import leaves the renderer drawing directly.
  const tier = matchMedia(OCCLUDED).matches
    ? import('#shared/scene/occlusion').then(({ occlusion }) => {
      if (disposed) return
      occluder = occlusion(renderer, scene, camera)
      // Sized already if the pane was measured first; else the observer will.
      const { x, y } = renderer.getSize(new Vector2())
      if (sized) occluder.setSize(x, y)
    })
    : undefined
  Promise.allSettled([renderer.compileAsync(scene, camera), tier]).then(() => {
    if (disposed) return
    compiled = true
    requestRender()
  })

  const stopSlots = watch(() => props.slots, populate)
  const stopOpen = watch(() => props.openSlotId, restyle)
  const stopLift = watch(lifted, requestRender)
  const stopPower = watch(powered, on => {
    requestRender()
    if (on) emit('power')
  })

  // Damping keeps applying the last drag's momentum after `reset()`, so a
  // reset pressed while the view is still coasting would drift off home.
  // Spending the momentum with damping off first leaves nothing to apply.
  resetCamera = () => {
    controls.enableDamping = false
    controls.update()
    controls.reset()
    controls.enableDamping = true
    requestRender()
  }

  cleanup = () => {
    disposed = true
    cancelAnimationFrame(frame)
    controls.removeEventListener('change', requestRender)
    stopSlots()
    stopOpen()
    stopLift()
    stopPower()
    resize.disconnect()
    visibility.disconnect()
    document.removeEventListener('visibilitychange', onTabChange)
    motor.stop()
    for (const [type, handler] of listeners) element.removeEventListener(type, handler)
    controls.dispose()
    // dispose() drops the caches but keeps the GL context; the canvas is
    // recreated on every chassis change, and browsers cap live contexts.
    renderer.dispose()
    renderer.forceContextLoss()
    for (const piece of chassis.children) {
      if (piece instanceof Mesh) piece.geometry.dispose()
    }
    for (const g of geometries.values()) g.dispose()
    for (const rotors of trains.values()) for (const rotor of rotors) rotor.geometry.dispose()
    body?.geometry.dispose()
    for (const m of materials.values()) m.dispose()
    shell.dispose()
    occluder?.dispose()
    ground.geometry.dispose()
    ground.material.dispose()
    geometries.clear()
    trains.clear()
    materials.clear()
  }
})

onBeforeUnmount(() => cleanup?.())
</script>

<template>
  <div class="scene">
    <!-- role="img" on the canvas, not the wrapper: an img role makes its
         children presentational, which would hide the button below it. The
         list is the keyboard and screen-reader path (§5.4). -->
    <canvas ref="canvas" role="img" :aria-label="$t('build.scene.label')" />
    <!--
      The three toggles read their pressed state off `aria-pressed` and paint
      themselves from it, which is the same thing the markup said before and
      keeps one source of truth for "is this on". Where they sit over the
      canvas is still main.css's business: a corner is a position, not a
      variant.
    -->
    <UButton size="xs" color="neutral" variant="outline" class="scene-reset" @click="resetCamera()">
      {{ $t('build.scene.resetCamera') }}
    </UButton>
    <UButton
      size="xs"
      v-bind="emphasis(lifted)"
      class="scene-lift"
      :aria-pressed="lifted"
      @click="lifted = !lifted"
    >
      {{ $t(lifted ? 'build.scene.fitBody' : 'build.scene.liftBody') }}
    </UButton>
    <UButton
      size="xs"
      v-bind="emphasis(powered)"
      class="scene-power"
      :aria-pressed="powered"
      @click="togglePower()"
    >
      {{ $t(powered ? 'build.scene.powerOff' : 'build.scene.powerOn') }}
    </UButton>
    <UButton
      size="xs"
      v-bind="emphasis(muted)"
      class="scene-mute"
      :aria-pressed="muted"
      @click="toggleMute()"
    >
      {{ $t(muted ? 'build.scene.unmute' : 'build.scene.mute') }}
    </UButton>
  </div>
</template>
