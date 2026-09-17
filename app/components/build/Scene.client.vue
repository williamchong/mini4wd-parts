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
import { silhouetteFor, silhouetteId } from '#shared/scene/bodies'
import { bodyGeometry } from '#shared/scene/generators/body'
import type { Silhouette } from '#shared/scene/generators/body'
import { chassisPieces } from '#shared/scene/generators/chassis'
import * as parts from '#shared/scene/generators/parts'
import { cylinder, Triangles } from '#shared/scene/generators/mesh'
import type { ResolvedSlot } from '#shared/catalog/build'
import type { ChassisId, PartSpecs } from '#shared/catalog/schema'

const props = defineProps<{
  chassis: ChassisId
  /** The kit the build started from, whose box art the body shell is drawn after. */
  kit: string | null
  slots: ResolvedSlot[]
  /** The catalog by item number, read only for the specs that size a proxy. */
  parts: ReadonlyMap<string, { specs: PartSpecs }>
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
 * part's diameter, a plate's thickness — `wheelMm` the wheel a tire sits on,
 * `silhouette` which table entry a body is lofted from, and `towardNose`
 * which end a stay faces. Each field is zero for the kinds that ignore it, so
 * the cache key built from them holds one geometry per shape that actually
 * differs. The motor is the one shape keyed by nothing here: it depends on
 * the chassis alone, and the page remounts this component per chassis, so a
 * cache never outlives one answer. The shapes themselves come from
 * shared/scene/generators (§5.6).
 */
type Shape = { mm: number; wheelMm: number; silhouette: string; towardNose: 1 | -1 | 0 }
const shapeKey = (kind: ProxyKind, s: Shape) => `${kind}:${s.mm}:${s.wheelMm}:${s.silhouette}:${s.towardNose}`
/** The kinds whose hit volume scales with `mm`; the others are fixed boxes. */
const ROUND: ReadonlySet<ProxyKind> = new Set(['wheel', 'tire', 'roller'])

/** Every kind but the body, whose shell is lofted per kit and held apart from these tables. */
type Solid = Exclude<ProxyKind, 'body'>

const VISIBLE: Record<Solid, (shape: Shape) => BufferGeometry> = {
  // An FA-130 lies across the car and has one shaft; a PRO motor lies along it with two.
  motor: () => parts.motor(layoutFor(props.chassis).motor.across ? 1 : 2),
  wheel: shape => parts.wheel(shape.mm),
  tire: shape => parts.tire(shape.wheelMm, shape.mm - shape.wheelMm),
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
  motor: () => outlineBox(20, 20, 25),
  wheel: shape => outlineRing(shape.mm / 2, 10, 'x'),
  tire: shape => outlineRing(shape.mm / 2, 9, 'x'),
  roller: shape => outlineRing(shape.mm / 2, 4, 'y'),
  stay: shape => outlineBox(80, shape.mm, 18, 1 + shape.mm / 2),
  'side-stay': shape => outlineBox(18, shape.mm, 44, 1 + shape.mm / 2),
  brake: () => outlineBox(40, 5, 14, -1.5),
  damper: () => outlineBox(9, 10, 9)
}

/**
 * The diameter a round proxy is drawn at, in millimetres. A roller or wheel
 * is sized from its own record when the catalog has one (41 rollers, 9
 * wheels); no tire records a diameter, so a tire is a band around whatever
 * wheel sits in its socket. The defaults are the sizes the taps were measured
 * at (§5.5), so a slot with no spec looks exactly as it did.
 */
const DEFAULT_DIAMETER_MM = { roller: 13, wheel: 20, tire: 26 } as const
const TIRE_BAND_MM = DEFAULT_DIAMETER_MM.tire - DEFAULT_DIAMETER_MM.wheel

function specsOf(slot: ResolvedSlot | undefined): PartSpecs | undefined {
  const id = slot?.entries[0]?.partId
  return id ? props.parts.get(id)?.specs : undefined
}

/** The wheel a tire socket's tire sits on: the wheel slot at the same end. */
function wheelUnder(slot: ResolvedSlot, bySlot: Map<string, ResolvedSlot>): number {
  return specsOf(bySlot.get(slot.id.replace('tire', 'wheel')))?.wheelDiameterMm ?? DEFAULT_DIAMETER_MM.wheel
}

function diameterFor(kind: ProxyKind, slot: ResolvedSlot, bySlot: Map<string, ResolvedSlot>): number {
  switch (kind) {
    case 'roller': return specsOf(slot)?.rollerDiameterMm ?? DEFAULT_DIAMETER_MM.roller
    case 'stay': case 'side-stay': return specsOf(slot)?.plateThicknessMm ?? DEFAULT_PLATE_MM
    case 'wheel': return specsOf(slot)?.wheelDiameterMm ?? DEFAULT_DIAMETER_MM.wheel
    case 'tire': return specsOf(slot)?.tireDiameterMm ?? wheelUnder(slot, bySlot) + TIRE_BAND_MM
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
 * taps aimed at the wheels behind it; now the shell is opaque, whatever the
 * reader sees under their finger is what they get, and lifting the shell is
 * how they reach what it covers.
 */
const HIT: Record<Solid, (mm: number) => BufferGeometry> = {
  motor: () => new BoxGeometry(34, 19, 24),
  wheel: mm => new CylinderGeometry(mm / 2, mm / 2, 12, 16).rotateZ(Math.PI / 2),
  tire: mm => new CylinderGeometry(mm / 2 + 2, mm / 2 + 2, 9, 16).rotateZ(Math.PI / 2),
  roller: mm => new SphereGeometry(mm, 12, 8),
  stay: () => new BoxGeometry(60, 8, 22),
  'side-stay': () => new BoxGeometry(22, 8, 40),
  brake: () => new BoxGeometry(40, 8, 16),
  damper: () => new BoxGeometry(18, 14, 12)
}

/**
 * A changed part is orange and an empty slot grey, as before (§5.5). A stock
 * part used to be blue as well; now that it has a shape it takes the colour
 * the real thing mostly comes in, so a stock kit reads as a car and the
 * orange still says what the reader changed. The body's colour is its kit's.
 */
const COLOUR: Record<Exclude<ProxyState, 'stock'>, number> = {
  changed: 0xe8842a,
  empty: 0xb8bcc2
}
/** What a material is besides its colour: the four finishes a proxy can have. */
const FINISH: Record<ProxyKind, 'shell' | 'rubber' | 'metal' | 'plastic'> = {
  body: 'shell',
  motor: 'metal',
  wheel: 'plastic',
  tire: 'rubber',
  roller: 'metal',
  stay: 'plastic',
  'side-stay': 'plastic',
  brake: 'plastic',
  damper: 'metal'
}
const STOCK_TINT: Record<ProxyKind, number> = {
  body: 0xd8dbe0,
  motor: 0x9aa0a8,
  wheel: 0x3a3d42,
  tire: 0x1d1f22,
  roller: 0xc9ced6,
  stay: 0x2a2d31,
  'side-stay': 0x2a2d31,
  brake: 0x3a3d42,
  damper: 0xb9bec6
}

/** The pixel distance under which a pointer down/up pair is a tap, not an orbit. */
const TAP_SLOP_PX = 6

type ProxyData = { slotId: string; state: ProxyState; kind: ProxyKind; tint: number }

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

onMounted(() => {
  const element = canvas.value
  const sockets = socketsFor(props.chassis)
  if (!element) return

  // Per instance, not per module: the caches are disposed with the scene that
  // filled them, and the component remounts on every chassis change.
  const geometries = new Map<string, BufferGeometry>()
  const materials = new Map<string, MeshStandardMaterial>()

  function geometry<K extends ProxyKind, T>(table: Record<K, (arg: T) => BufferGeometry>, kind: K, arg: T, key: string) {
    let found = geometries.get(key)
    if (!found) {
      found = table[kind](arg)
      geometries.set(key, found)
    }
    return found
  }

  /**
   * The body is held apart from the cache: a kit change on the same chassis
   * does not remount, and with a silhouette per kit the cache would keep every
   * shell a reader had browsed past. One slot, disposed when the kit changes.
   */
  let body: { id: string; geometry: BufferGeometry } | undefined
  function bodyFor(id: string) {
    if (body?.id !== id) {
      body?.geometry.dispose()
      const geometry = bodyGeometry(silhouetteFor(id))
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
   * a transparent material draws identically, and it is the only one in the
   * scene, so there is nothing for it to sort against.
   */
  const shell = new MeshStandardMaterial({ roughness: 0.55, metalness: 0.1, transparent: true })
  function styleShell(state: Exclude<ProxyState, 'empty'>, highlight: Highlight, tint: number) {
    const colour = state === 'stock' ? tint : COLOUR[state]
    shell.color.setHex(colour)
    shell.emissive.setHex(colour)
    shell.emissiveIntensity = highlight === 'open' ? 0.6 : highlight === 'hover' ? 0.3 : 0
    return shell
  }

  /** The chassis' own materials, one per colour, disposed with the rest. */
  function chassisMaterial(colour: number) {
    const key = `chassis:${colour}`
    let found = materials.get(key)
    if (!found) {
      found = new MeshStandardMaterial({ color: colour, roughness: 0.75 })
      materials.set(key, found)
    }
    return found
  }

  /**
   * One material per state and highlight, shared by every proxy in that state,
   * so repopulating a socket allocates a mesh and nothing else. Highlight is an
   * emissive lift of the same colour, which reads as "lit" without a post pass.
   */
  function material(state: ProxyState, highlight: Highlight, kind: ProxyKind, tint: number) {
    // An empty slot is an outline, not a ghost: a translucent solid read as a
    // part that was half there. Everything else is opaque, the body included —
    // what it covers is reached by lifting it.
    if (kind === 'body' && state !== 'empty') return styleShell(state, highlight, tint)
    const colour = state === 'stock' ? tint : COLOUR[state]
    const finish = FINISH[kind]
    const key = `${state}:${highlight}:${colour}:${finish}`
    let found = materials.get(key)
    if (!found) {
      found = new MeshStandardMaterial({
        color: colour,
        roughness: finish === 'rubber' ? 0.9 : 0.55,
        metalness: finish === 'metal' ? 0.5 : 0.1,
        wireframe: state === 'empty',
        emissive: colour,
        emissiveIntensity: highlight === 'open' ? 0.6 : highlight === 'hover' ? 0.3 : 0
      })
      materials.set(key, found)
    }
    return found
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
    chassis.add(new Mesh(piece.geometry, chassisMaterial(piece.colour)))
  }
  car.add(chassis)
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
    shell.opacity = 1 - progress * (1 - LIFTED_OPACITY)
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
   * The colour a stock part is drawn in: the kit's own for the body, and for
   * the wheels and rollers when the kit's livery says they differ (white fin
   * wheels, blue rollers); the category default otherwise.
   */
  function stockTint(kind: ProxyKind, bodySilhouette: string, livery: Silhouette): number {
    if (kind === 'body') return silhouetteFor(bodySilhouette).colour
    if (kind === 'wheel') return livery.wheelColour ?? STOCK_TINT.wheel
    if (kind === 'roller') return livery.rollerColour ?? STOCK_TINT.roller
    return STOCK_TINT[kind]
  }

  /** The attach step: for each socket, clear it and add what its slot holds. */
  function populate() {
    const bySlot = new Map(props.slots.map(slot => [slot.id, slot]))
    const livery = silhouetteFor(props.kit)
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
      const mm = diameterFor(socket.kind, slot, bySlot)
      const shape: Shape = {
        mm,
        wheelMm: socket.kind === 'tire' ? wheelUnder(slot, bySlot) : 0,
        silhouette: socket.kind === 'body' ? silhouetteId(slot.swapped ? null : props.kit) : '',
        towardNose: socket.kind === 'stay' ? (socket.position[2] < 0 ? -1 : 1) : 0
      }
      const tint = stockTint(socket.kind, shape.silhouette, livery)
      const data: ProxyData = { slotId: socket.slotId, state, kind: socket.kind, tint }
      const table = state === 'empty' ? OUTLINE : VISIBLE
      const visibleGeometry = socket.kind === 'body'
        ? bodyFor(shape.silhouette)
        : geometry(table, socket.kind, shape, `${table === OUTLINE ? 'o' : 'v'}:${shapeKey(socket.kind, shape)}`)
      const visible = new Mesh(visibleGeometry, material(state, highlightFor(socket.slotId), socket.kind, tint))
      visible.userData = data
      proxies.push(visible)
      // The shell is its own hit volume; everything else gets an oversized one.
      if (socket.kind === 'body') {
        group.add(visible)
        hits.push(visible)
      } else {
        const hitMm = ROUND.has(socket.kind) ? mm : 0
        const hit = new Mesh(geometry(HIT, socket.kind, hitMm, `h:${socket.kind}:${hitMm}`))
        hit.visible = false
        hit.userData = data
        group.add(visible, hit)
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
      visible.material = material(data.state, highlightFor(data.slotId), data.kind, data.tint)
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
    // Seated, it is opaque and the nearest hit is what the reader sees.
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
    body?.geometry.dispose()
    for (const m of materials.values()) m.dispose()
    shell.dispose()
    geometries.clear()
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
