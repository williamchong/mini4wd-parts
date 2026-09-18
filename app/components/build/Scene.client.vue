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
  AmbientLight, BoxGeometry, CylinderGeometry, DirectionalLight, Group, Mesh,
  MeshStandardMaterial, PerspectiveCamera, Raycaster, Scene, SphereGeometry,
  Vector2, Vector3, WebGLRenderer
} from 'three'
import type { BufferGeometry } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { layoutFor, socketsFor } from '#shared/scene/sockets'
import type { ProxyKind } from '#shared/scene/sockets'
import { DEFAULT_SILHOUETTE } from '#shared/scene/bodies'
import { bodyGeometry } from '#shared/scene/generators/body'
import type { Silhouette } from '#shared/scene/generators/body'
import { chassisPieces } from '#shared/scene/generators/chassis'
import type { ChassisRole } from '#shared/scene/generators/chassis'
import * as parts from '#shared/scene/generators/parts'
import { DEFAULT_TIRE, DEFAULT_WHEEL, entryShapeId, TIRES, WHEELS } from '#shared/scene/wheels'
import type { TireShape, WheelShape } from '#shared/scene/wheels'
import { cylinder, Triangles } from '#shared/scene/generators/mesh'
import type { ResolvedSlot } from '#shared/catalog/build'
import type { ChassisId, Kit, KitClear, PartColours, PartSpecs } from '#shared/catalog/schema'

const props = defineProps<{
  chassis: ChassisId
  /** The body shell the kit the build started from draws, when it has one (§5.6). */
  kitBody: string | null
  /** What that kit's body, wheels, tires and rollers are moulded in, from the catalog. */
  kitColours: Kit['colours'] | null
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
    finish?: 'metal'
  }>
  /** The slot whose picker is open; its proxy stays lit until it closes. */
  openSlotId: string | null
}>()

const emit = defineEmits<{
  select: [slotId: string]
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
}
const shapeKey = (kind: ProxyKind, s: Shape) => `${kind}:${s.mm}:${s.id}:${s.silhouette}:${s.towardNose}`

/**
 * A wheel or tire as the numbers its generator actually reads, not as the row
 * it came from. Eleven of the 46 wheel rows are the same four numbers under
 * different Tamiya names — `large-ms-ii`, `large-teardrop-type` and
 * `large-fm-type` are one shape — and a tire reads only its rim's diameter and
 * width, of which the 46 rows hold ten. Keying the geometry cache by the row
 * id instead would hold a tire geometry per (tire, wheel) *name* pair: 1288
 * entries where 230 differ, and the same 14 KB buffer built again for every
 * one of the thirteen 21×11 rims a reader tries.
 */
const sign = (kind: ProxyKind, wheel?: WheelShape, tire?: TireShape) =>
  kind === 'wheel' && wheel ? `${wheel.diameterMm}/${wheel.widthMm}/${wheel.spokes}/${wheel.dishMm}`
    : kind === 'tire' && tire && wheel ? `${tire.diameterMm}/${tire.widthMm}/${tire.shoulderMm}@${wheel.diameterMm}/${wheel.widthMm}`
      : ''
/** The kinds whose hit volume scales with `mm`; the others are fixed boxes. */
const ROUND: ReadonlySet<ProxyKind> = new Set(['wheel', 'tire', 'roller'])
const GEARS: ReadonlySet<ProxyKind> = new Set(['gear', 'counter-gear'])
/** The kinds drawn differently at the front and the rear. */
const TOWARD_NOSE: ReadonlySet<ProxyKind> = new Set(['stay', 'gear', 'counter-gear'])

/** Every kind but the body, whose shell is lofted per kit and held apart from these tables. */
type Solid = Exclude<ProxyKind, 'body'>
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

const VISIBLE: Record<Exclude<Solid, Train>, (shape: Shape) => BufferGeometry> = {
  motor: () => parts.motor(shafts()),
  wheel: shape => parts.wheel(shape.wheel!),
  tire: shape => parts.tire(shape.tire!, shape.wheel!),
  roller: shape => parts.roller(shape.mm),
  stay: shape => parts.stay(shape.mm, shape.towardNose || 1),
  'side-stay': shape => parts.sideStay(shape.mm),
  brake: () => parts.brake(),
  damper: () => parts.damper()
}

const DEFAULT_PLATE_MM = 1.5

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
const OUTLINE: Record<Solid, (shape: Shape) => BufferGeometry> = {
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

/**
 * The diameter a roller is drawn at: its own record's when the catalog has one
 * (41 rollers), else the size the taps were measured at (§5.5). A wheel and a
 * tire are sized by their shape instead (§5.6).
 */
const DEFAULT_ROLLER_MM = 13

/** The row a wheel or tire draws from, or the default for a shape with none. */
const wheelShape = (id: string) => WHEELS[id] ?? WHEELS[DEFAULT_WHEEL]!
const tireShape = (id: string) => TIRES[id] ?? TIRES[DEFAULT_TIRE]!

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

function specsOf(slot: ResolvedSlot | undefined): PartSpecs | undefined {
  const id = slot?.entries[0]?.partId
  return id ? props.parts.get(id)?.specs : undefined
}

function coloursOf(slot: ResolvedSlot): PartColours | undefined {
  const id = slot.entries[0]?.partId
  return id ? props.parts.get(id)?.colours : undefined
}

/** The size of what is not a wheel or a tire; those are their row's diameter. */
function diameterFor(kind: ProxyKind, slot: ResolvedSlot): number {
  switch (kind) {
    case 'roller': return specsOf(slot)?.rollerDiameterMm ?? DEFAULT_ROLLER_MM
    case 'stay': case 'side-stay': return specsOf(slot)?.plateThicknessMm ?? DEFAULT_PLATE_MM
    default: return 0
  }
}

/**
 * What the raycast actually tests: invisible volumes larger than the visible
 * shapes, because a 13 mm roller on a 165 mm car filling a phone screen is
 * about 28 px, under the 44 px minimum tap target. The roller's is a sphere
 * twice its diameter. The wheel's face sits proud of the tire's, so a tap on
 * the hub is the wheel and one on the band is the tire; whether a thumb can
 * tell them apart is what the phone test decides.
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
const HIT: Record<Solid, (shape: Shape) => BufferGeometry> = {
  motor: () => new BoxGeometry(34, 19, 24),
  gear: shape => shafts() === 1
    ? new BoxGeometry(16, 20, 16).translate(6 * gearSide(shape), 0, 4 * (shape.towardNose || 1))
    : new BoxGeometry(14, 22, 30).translate(4 * gearSide(shape), 3, -6 * (shape.towardNose || 1)),
  'counter-gear': shape => new BoxGeometry(7, 20, 20).translate(20.5, 5, 7 * (shape.towardNose || 1)),
  wheel: ({ mm }) => new CylinderGeometry(mm / 2, mm / 2, 12, 16).rotateZ(Math.PI / 2),
  tire: ({ mm }) => new CylinderGeometry(mm / 2 + 2, mm / 2 + 2, 9, 16).rotateZ(Math.PI / 2),
  roller: ({ mm }) => new SphereGeometry(mm, 12, 8),
  stay: () => new BoxGeometry(60, 8, 22),
  'side-stay': () => new BoxGeometry(22, 8, 40),
  brake: () => new BoxGeometry(40, 8, 16),
  damper: () => new BoxGeometry(18, 14, 12)
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
/** What a material is besides its colour: the four finishes a proxy can have. */
type Finish = 'shell' | 'rubber' | 'metal' | 'plastic'
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
  damper: 'metal'
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
  damper: 0xb9bec6
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
type ProxyData = { slotId: string; state: ProxyState; kind: ProxyKind; tint: number; finish?: Finish; paints?: readonly parts.Paint[] }

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

/**
 * The shell lifted off the chassis: the assembled car is what a reader
 * recognises, the lifted one is how they reach the motor and cells under it.
 * The toggle is in the pane, beside reset, and the list needs no equivalent
 * because every slot is already a row there.
 */
const lifted = ref(false)
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
 * The chassis pieces a kit moulds in its own colours: which of the kit's
 * colours each takes, and which `clear` entry makes it see-through. MS's nose
 * and tail units take the frame's unless the kit gives them a colour of their
 * own; no wiki row makes them clear apart from it.
 */
const KIT_MOULDED: Partial<Record<ChassisRole, { colour: (colours: NonNullable<Kit['colours']>) => string | undefined; clear: KitClear }>> = {
  frame: { colour: colours => colours.chassis, clear: 'chassis' },
  ends: { colour: colours => colours.chassisEnds ?? colours.chassis, clear: 'chassis' },
  aParts: { colour: colours => colours.aParts, clear: 'aParts' }
}

onMounted(() => {
  const element = canvas.value
  const sockets = socketsFor(props.chassis)
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
   */
  const shell = new MeshStandardMaterial({ roughness: 0.55, metalness: 0.1, transparent: true })
  /** The shell's opacity seated, set by `populate`; `tickBody` fades from it as the shell lifts. */
  let seatedOpacity = 1
  function styleShell(highlight: Highlight, tint: number) {
    shell.color.setHex(tint)
    shell.emissive.setHex(tint)
    shell.emissiveIntensity = highlight === 'open' ? 0.6 : highlight === 'hover' ? 0.3 : 0
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
      found = new MeshStandardMaterial({ color: colour, roughness: 0.75, transparent: clear, opacity: clear ? CLEAR_OPACITY : 1 })
      materials.set(key, found)
    }
    return found
  }

  /**
   * One material per state and highlight, shared by every proxy in that state,
   * so repopulating a socket allocates a mesh and nothing else. Highlight is an
   * emissive lift of the same colour, which reads as "lit" without a post pass.
   */
  function material(state: ProxyState, highlight: Highlight, kind: ProxyKind, tint: number, finish: Finish = FINISH[kind]) {
    // An empty slot is an outline, not a ghost: a translucent solid read as a
    // part that was half there. Everything else is opaque, the body included —
    // what it covers is reached by lifting it — unless the body is clear plastic.
    if (kind === 'body' && state !== 'empty') return styleShell(highlight, tint)
    const empty = state === 'empty'
    const colour = empty ? EMPTY_COLOUR : tint
    // Stock and changed draw alike now, so only emptiness splits the cache.
    const key = `${empty}:${highlight}:${colour}:${finish}`
    let found = materials.get(key)
    if (!found) {
      found = new MeshStandardMaterial({
        color: colour,
        roughness: finish === 'rubber' ? 0.9 : 0.55,
        metalness: finish === 'metal' ? 0.5 : 0.1,
        wireframe: empty,
        emissive: colour,
        emissiveIntensity: highlight === 'open' ? 0.6 : highlight === 'hover' ? 0.3 : 0
      })
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

  const scene = new Scene()
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

  scene.add(new AmbientLight(0xffffff, 0.9))
  const key = new DirectionalLight(0xffffff, 1.6)
  key.position.set(120, 200, 160)
  const fill = new DirectionalLight(0xffffff, 0.5)
  fill.position.set(-100, 80, -120)
  scene.add(key, fill)

  const car = new Group()
  // The chassis itself is not a slot, so it is drawn once under the sockets
  // rather than as a proxy (shared/scene/generators/chassis.ts). It rides in
  // the car group so a lift for large wheels raises it too.
  const chassis = new Group()
  for (const piece of chassisPieces(props.chassis)) {
    const mesh = new Mesh(piece.geometry, chassisMaterial(piece.colour))
    mesh.userData = { colour: piece.colour, role: piece.role }
    chassis.add(mesh)
  }
  car.add(chassis)

  /**
   * The chassis in the kit's mouldings: its frame and A parts in the colours
   * the box has them in, see-through where they are clear plastic, and black
   * for a bare chassis or a kit the wiki has no row for. Repainted with every
   * populate, because a kit change on the same chassis does not remount.
   */
  function paintChassis() {
    const colours = props.kitColours
    for (const mesh of chassis.children) {
      if (!(mesh instanceof Mesh)) continue
      const { colour, role } = mesh.userData as { colour: number; role: ChassisRole }
      const kit = KIT_MOULDED[role]
      const moulded = colours && kit ? kit.colour(colours) : undefined
      const clear = !!kit && !!colours?.clear?.includes(kit.clear)
      mesh.material = chassisMaterial(hexColour(moulded) ?? colour, clear)
    }
  }
  const groups = new Map<string, Group>()
  for (const socket of sockets) {
    const group = new Group()
    group.name = socket.name
    group.position.set(...socket.position)
    if (socket.rotateY) group.rotation.y = socket.rotateY
    groups.set(socket.name, group)
    car.add(group)
  }
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
  function requestRender() {
    if (sized && !frame) frame = requestAnimationFrame(tick)
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
  function tickBody() {
    if (!bodyGroup) return
    const target = bodyRestY + (lifted.value ? LIFT_MM : 0)
    const remaining = target - bodyGroup.position.y
    if (Math.abs(remaining) > 0.05) {
      bodyGroup.position.y += remaining * 0.18
      requestRender()
    } else {
      bodyGroup.position.y = target
    }
    const progress = (bodyGroup.position.y - bodyRestY) / LIFT_MM
    shell.opacity = seatedOpacity - progress * (seatedOpacity - Math.min(seatedOpacity, LIFTED_OPACITY))
  }

  function tick() {
    frame = 0
    controls.update()
    tickBody()
    renderer.render(scene, camera)
    if (!drawn) {
      drawn = true
      emit('ready')
    }
  }
  controls.addEventListener('change', requestRender)

  let hits: Mesh[] = []
  let proxies: Mesh[] = []
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
   */
  function tintFor(kind: ProxyKind, slot: ResolvedSlot): number {
    const part = coloursOf(slot)
    const own = kind === 'tire' ? part?.tire ?? part?.primary : part?.primary
    if (own) return hexColour(own)
    if (slot.swapped) return STOCK_TINT[kind]
    const kit = props.kitColours
    const moulded = kind === 'body' || kind === 'wheel' || kind === 'tire' || kind === 'roller' ? kit?.[kind] : undefined
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
   * A plated, aluminium or carbon wheel is sold as its material, so it is drawn
   * as metal rather than in the moulded finish every kit wheel has. Nothing
   * else overrides its kind's material.
   */
  function finishFor(kind: ProxyKind, slot: ResolvedSlot): Finish | undefined {
    if (kind !== 'wheel') return undefined
    const partId = slot.entries[0]?.partId
    return partId ? props.parts.get(partId)?.finish : undefined
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
    paintChassis()
    const bySlot = new Map(props.slots.map(slot => [slot.id, slot]))
    const rims = new Map<string, WheelShape>()
    const rimAt = (wheelSlotId: string) => {
      let found = rims.get(wheelSlotId)
      if (!found) rims.set(wheelSlotId, found = rowFor.wheel(bySlot.get(wheelSlotId)))
      return found
    }
    hits = []
    proxies = []
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
      if (socket.kind === 'body' && state === 'empty') continue
      const shell = socket.kind === 'body' ? silhouetteFor(slot) : undefined
      // A shell still loading draws nothing yet, as an empty body does.
      if (shell && !shell.silhouette) continue
      // A tire seats on the wheel at its own end, so both sockets resolve the
      // same rim; `rims` keeps that to one lookup per end rather than per socket.
      const wheel = socket.kind === 'wheel' || socket.kind === 'tire'
        ? rimAt(socket.kind === 'wheel' ? slot.id : slot.id.replace('tire', 'wheel'))
        : undefined
      const tire = socket.kind === 'tire' ? rowFor.tire(slot) : undefined
      const mm = wheel && socket.kind === 'wheel' ? wheel.diameterMm : tire ? tire.diameterMm : diameterFor(socket.kind, slot)
      const shape: Shape = {
        mm,
        wheel,
        tire,
        id: sign(socket.kind, wheel, tire),
        silhouette: shell?.id ?? '',
        towardNose: TOWARD_NOSE.has(socket.kind) ? (socket.position[2] < 0 ? -1 : 1) : 0
      }
      const tint = tintFor(socket.kind, slot)
      const data: ProxyData = { slotId: socket.slotId, state, kind: socket.kind, tint, finish: finishFor(socket.kind, slot) }
      if (socket.kind === 'body') seatedOpacity = clearFor(slot) ? CLEAR_OPACITY : 1
      if (socket.kind === 'motor') data.paints = motorPaintsFor(slot, tint)
      if (GEARS.has(socket.kind)) data.paints = parts.gearPaints(tint)
      const key = shapeKey(socket.kind, shape)
      const kind = socket.kind
      const paint = materialsFor(data, highlightFor(socket.slotId))
      // `shell` is set and loaded for every body that reaches here (see above).
      // A gear train is a mesh per rotor, each at its pivot so it can turn in place.
      let visibles: Mesh[]
      if (kind === 'body') visibles = [new Mesh(bodyFor(shell!.id, shell!.silhouette!), paint)]
      else if (state === 'empty') visibles = [new Mesh(geometry(OUTLINE, kind, shape, `o:${key}`), paint)]
      else if (isTrain(kind)) visibles = train(kind, shape, `t:${key}`).map(rotor => {
        const mesh = new Mesh(rotor.geometry, paint)
        mesh.position.set(...rotor.pivot)
        return mesh
      })
      else visibles = [new Mesh(geometry(VISIBLE, kind, shape, `v:${key}`), paint)]
      for (const visible of visibles) {
        visible.userData = data
        proxies.push(visible)
      }
      // The shell is its own hit volume; everything else gets an oversized one.
      if (kind === 'body') {
        // Last among the transparent: a clear chassis seen from below is nearer.
        visibles[0]!.renderOrder = 1
        group.add(...visibles)
        hits.push(...visibles)
      } else {
        // Only a round part's size and a gear's end change its hit volume.
        const hitShape: Shape = { mm: ROUND.has(kind) ? mm : 0, id: '', silhouette: '', towardNose: GEARS.has(kind) ? shape.towardNose : 0 }
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
    const along = raycaster.intersectObjects(hits, false).map(hit => hit.object.userData as ProxyData)
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
    cancelAnimationFrame(frame)
    tick()
  })
  resize.observe(element)

  populate()

  const stopSlots = watch(() => props.slots, populate)
  const stopOpen = watch(() => props.openSlotId, restyle)
  const stopLift = watch(lifted, requestRender)

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
    resize.disconnect()
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
    <button type="button" class="scene-reset" @click="resetCamera()">
      {{ $t('build.scene.resetCamera') }}
    </button>
    <button type="button" class="scene-lift" :aria-pressed="lifted" @click="lifted = !lifted">
      {{ $t(lifted ? 'build.scene.fitBody' : 'build.scene.liftBody') }}
    </button>
  </div>
</template>
