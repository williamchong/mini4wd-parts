<script setup lang="ts">
/**
 * The 3D pane: the build drawn as proxy shapes at the chassis' sockets, and the
 * surface you tap to change it (docs/PLAN.md §5.4, §5.5).
 *
 * Plain three, no TresJS (§4.1, 2026-09-16): the scene is one group per socket
 * named for its slot id, and a change to the build clears each group and adds
 * a mesh back. That attach step is what the chassis GLB's named empties will be
 * driven by later; only where the groups come from changes.
 *
 * `.client.vue` keeps three out of the server bundle, and build.vue mounts it
 * lazily under `v-if`, so the chunk is fetched only once a build exists.
 * Nothing here runs during prerender.
 */
import {
  AmbientLight, BoxGeometry, CylinderGeometry, DirectionalLight, Group, Mesh,
  MeshStandardMaterial, PerspectiveCamera, Raycaster, Scene, SphereGeometry,
  Vector2, Vector3, WebGLRenderer
} from 'three'
import type { BufferGeometry } from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { socketsFor } from '#shared/scene/sockets'
import type { ProxyKind } from '#shared/scene/sockets'
import type { EntryOrigin, ResolvedSlot } from '#shared/catalog/build'
import type { ChassisId } from '#shared/catalog/schema'

const props = defineProps<{
  chassis: ChassisId
  slots: ResolvedSlot[]
  /** The slot whose picker is open; its proxy stays lit until it closes. */
  openSlotId: string | null
}>()

const emit = defineEmits<{ select: [slotId: string] }>()

const canvas = ref<HTMLCanvasElement>()

/** What a proxy is showing: where its slot's contents came from, or nothing. */
type ProxyState = EntryOrigin | 'empty'
type Highlight = 'none' | 'hover' | 'open'

/**
 * Sizes are category defaults in millimetres (§5.5); sizing from `specs` is a
 * later upgrade that changes the look, not the risk. Box arguments are
 * width (x, across the car), height (y), depth (z, along the car). Wheels and
 * tires spin about x, rollers about y.
 */
const VISIBLE: Record<ProxyKind, () => BufferGeometry> = {
  body: () => new BoxGeometry(40, 30, 130),
  motor: () => new BoxGeometry(30, 15, 20),
  wheel: () => new CylinderGeometry(10, 10, 10, 24).rotateZ(Math.PI / 2),
  tire: () => new CylinderGeometry(13, 13, 9, 24).rotateZ(Math.PI / 2),
  roller: () => new CylinderGeometry(6.5, 6.5, 5, 20),
  stay: () => new BoxGeometry(60, 2, 20),
  'side-stay': () => new BoxGeometry(20, 2, 40),
  brake: () => new BoxGeometry(40, 3, 14),
  damper: () => new BoxGeometry(14, 10, 8)
}

/**
 * What the raycast actually tests: invisible volumes larger than the visible
 * shapes, because a 13 mm roller on a 165 mm car filling a phone screen is
 * about 28 px, under the 44 px minimum tap target. The roller's is a sphere
 * twice its diameter. The wheel's face sits proud of the tire's, so a tap on
 * the hub is the wheel and one on the band is the tire; whether a thumb can
 * tell them apart is what the phone test decides.
 *
 * The body is the exception in the other direction. Measured on a phone-sized
 * frame (2026-09-16), a hit box the size of the body took 62 of 81 taps aimed
 * at a front wheel and the top third of the taps aimed at a front roller: it
 * is the largest thing on the car and it sits in front of everything else from
 * most angles. So its hit volume is the roof only, and `slotAt` prefers any
 * other part along the ray besides.
 */
const HIT: Record<ProxyKind, () => BufferGeometry> = {
  body: () => new BoxGeometry(40, 10, 130).translate(0, 10, 0),
  motor: () => new BoxGeometry(34, 19, 24),
  wheel: () => new CylinderGeometry(10, 10, 12, 16).rotateZ(Math.PI / 2),
  tire: () => new CylinderGeometry(15, 15, 9, 16).rotateZ(Math.PI / 2),
  roller: () => new SphereGeometry(13, 12, 8),
  stay: () => new BoxGeometry(60, 8, 22),
  'side-stay': () => new BoxGeometry(22, 8, 40),
  brake: () => new BoxGeometry(40, 8, 16),
  damper: () => new BoxGeometry(18, 14, 12)
}

/** The same three origins the list's badge distinguishes, plus empty. */
const COLOUR: Record<ProxyState, number> = {
  chassis: 0x9aa0a6,
  kit: 0x4a7fd1,
  user: 0xe8842a,
  empty: 0xb8bcc2
}

/** The pixel distance under which a pointer down/up pair is a tap, not an orbit. */
const TAP_SLOP_PX = 6

type ProxyData = { slotId: string; state: ProxyState; kind: ProxyKind }

let cleanup: (() => void) | undefined
let resetCamera = () => {}

onMounted(() => {
  const element = canvas.value
  const sockets = socketsFor(props.chassis)
  if (!element || !sockets) return

  // Per instance, not per module: the caches are disposed with the scene that
  // filled them, and the component remounts on every chassis change.
  const geometries = new Map<string, BufferGeometry>()
  const materials = new Map<string, MeshStandardMaterial>()

  function geometry(table: Record<ProxyKind, () => BufferGeometry>, kind: ProxyKind, prefix: string) {
    const key = `${prefix}:${kind}`
    let found = geometries.get(key)
    if (!found) {
      found = table[kind]()
      geometries.set(key, found)
    }
    return found
  }

  /**
   * One material per state and highlight, shared by every proxy in that state,
   * so repopulating a socket allocates a mesh and nothing else. Highlight is an
   * emissive lift of the same colour, which reads as "lit" without a post pass.
   */
  function material(state: ProxyState, highlight: Highlight, kind: ProxyKind) {
    // The body is the one proxy that encloses others: drawn solid it hides the
    // motor and the inside of every wheel, so it is always see-through.
    const opacity = state === 'empty' ? 0.3 : kind === 'body' ? 0.45 : 1
    const key = `${state}:${highlight}:${opacity}`
    let found = materials.get(key)
    if (!found) {
      found = new MeshStandardMaterial({
        color: COLOUR[state],
        roughness: 0.6,
        metalness: 0.1,
        transparent: opacity < 1,
        opacity,
        emissive: COLOUR[state],
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

  // The chassis itself is not a slot, so it is one static tray under the
  // sockets rather than a proxy; it exists to give the boxes a car to sit on.
  const tray = new Mesh(new BoxGeometry(60, 6, 140), new MeshStandardMaterial({ color: 0x5b6470, roughness: 0.8 }))
  tray.position.set(0, 8, 0)
  scene.add(tray)

  const car = new Group()
  for (const socket of sockets) {
    const group = new Group()
    group.name = socket.name
    group.position.set(...socket.position)
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

  let dirty = true
  let hits: Mesh[] = []
  let hovered: string | null = null

  const highlightFor = (slotId: string): Highlight =>
    slotId === props.openSlotId ? 'open' : slotId === hovered ? 'hover' : 'none'

  /** The attach step: for each socket, clear it and add what its slot holds. */
  function populate() {
    const bySlot = new Map(props.slots.map(slot => [slot.id, slot]))
    hits = []
    for (const socket of sockets!) {
      const group = car.getObjectByName(socket.name)
      const slot = bySlot.get(socket.slotId)
      if (!group || !slot) continue
      group.clear()
      const state: ProxyState = slot.entries[0]?.origin ?? 'empty'
      const data: ProxyData = { slotId: socket.slotId, state, kind: socket.kind }
      const visible = new Mesh(geometry(VISIBLE, socket.kind, 'v'), material(state, highlightFor(socket.slotId), socket.kind))
      visible.userData = data
      const hit = new Mesh(geometry(HIT, socket.kind, 'h'))
      hit.visible = false
      hit.userData = data
      group.add(visible, hit)
      hits.push(hit)
    }
    dirty = true
  }

  /** Re-pick materials after hover or the open slot changed; no re-attach. */
  function restyle() {
    for (const group of car.children) {
      const visible = group.children[0]
      if (visible instanceof Mesh) {
        const data = visible.userData as ProxyData
        visible.material = material(data.state, highlightFor(data.slotId), data.kind)
      }
    }
    dirty = true
  }

  const raycaster = new Raycaster()
  const pointer = new Vector2()

  function slotAt(clientX: number, clientY: number): string | null {
    const rect = element!.getBoundingClientRect()
    pointer.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    )
    raycaster.setFromCamera(pointer, camera)
    const along = raycaster.intersectObjects(hits, false).map(hit => hit.object.userData as ProxyData)
    // Nearest wins, except that the body loses to anything seen through it:
    // it is translucent, so the wheel behind it is what the reader is looking at.
    const chosen = along.find(data => data.kind !== 'body') ?? along[0]
    return chosen?.slotId ?? null
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
    const slotId = slotAt(event.clientX, event.clientY)
    if (slotId) emit('select', slotId)
  }

  // Hover is a mouse affordance; a finger has nothing to hover with.
  function onPointerMove(event: PointerEvent) {
    if (event.pointerType !== 'mouse' || down) return
    const next = slotAt(event.clientX, event.clientY)
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
    dirty = true
  })
  resize.observe(element)

  // Drawn only when something changed: the controls report their own motion
  // (damping included), the build and the highlight set `dirty`. A static
  // scene therefore costs the GPU nothing between interactions.
  let frame = 0
  function tick() {
    frame = requestAnimationFrame(tick)
    if (controls.update() || dirty) {
      renderer.render(scene, camera)
      dirty = false
    }
  }

  populate()
  tick()

  const stopSlots = watch(() => props.slots, populate)
  const stopOpen = watch(() => props.openSlotId, restyle)

  // Damping keeps applying the last drag's momentum after `reset()`, so a
  // reset pressed while the view is still coasting would drift off home.
  // Spending the momentum with damping off first leaves nothing to apply.
  resetCamera = () => {
    controls.enableDamping = false
    controls.update()
    controls.reset()
    controls.enableDamping = true
    dirty = true
  }

  cleanup = () => {
    cancelAnimationFrame(frame)
    stopSlots()
    stopOpen()
    resize.disconnect()
    for (const [type, handler] of listeners) element.removeEventListener(type, handler)
    controls.dispose()
    // dispose() drops the caches but keeps the GL context; the canvas is
    // recreated on every chassis change, and browsers cap live contexts.
    renderer.dispose()
    renderer.forceContextLoss()
    tray.geometry.dispose()
    tray.material.dispose()
    for (const g of geometries.values()) g.dispose()
    for (const m of materials.values()) m.dispose()
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
  </div>
</template>
