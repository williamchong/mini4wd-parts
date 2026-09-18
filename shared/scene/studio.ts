/**
 * The light the pane's materials reflect (docs/PLAN.md §5.6, "Materials and
 * light"): a photo studio built from glowing panels, prefiltered by
 * `PMREMGenerator` into the map `scene.environment` takes. Nothing in it is lit; a panel is a basic
 * material whose colour runs above 1, the same trick three's RoomEnvironment
 * uses, so the cube render that captures it is a handful of draws.
 *
 * Laid out for a car rather than a room: panels overhead and along both flanks,
 * parallel to the car's length (+Z is the nose). They are large on purpose.
 * A generated body is faceted, and a flat face is a flat mirror that catches a
 * panel whole or misses it, so a small panel lights one facet and leaves its
 * neighbours dark; a large one rolls a highlight across several (compared
 * against three's RoomEnvironment, docs/PLAN.md §5.6, "Materials and light").
 * Units are the PMREM cube camera's, a studio about 30 across around a car at
 * the origin; the car's own scale does not matter to a reflection.
 */
import { BackSide, BoxGeometry, FrontSide, Mesh, MeshBasicMaterial, PMREMGenerator, Scene } from 'three'
import type { Side, Texture, WebGLRenderer } from 'three'
import type { Point3 } from './generators/mesh.ts'

/** A panel: centre, size, and how bright it glows. */
type Panel = readonly [x: number, y: number, z: number, w: number, h: number, d: number, glow: number]

const PANELS: readonly Panel[] = [
  // Overhead: one wide softbox the length of the car, the highlight along the roof.
  [0, 14, 0, 14, 0.1, 28, 3],
  // Flank panels, low and long, the highlight along each side of the shell.
  [-13, 4, 0, 0.1, 5, 18, 1.8],
  [13, 4, 0, 0.1, 5, 18, 1.8],
  // A key box to the front-right, toward where the home view looks from.
  [9, 7, 11, 9, 8, 0.1, 1.4],
  // A dim kicker behind, so the tail edge separates from the backdrop.
  [0, 6, -14, 12, 5, 0.1, 0.8]
]

/** The studio walls, and the floor a car's underside and tires pick up. */
const WALL = 0.2
const FLOOR = 0.45

/**
 * The studio prefiltered for `renderer`, ready for `scene.environment`. The
 * scene and everything in it are disposed before this returns; the map is
 * the caller's to dispose, and belongs to that renderer's context.
 */
export function studioEnvironment(renderer: WebGLRenderer): Texture {
  const studio = new Scene()
  const box = new BoxGeometry()
  const materials: MeshBasicMaterial[] = []
  function add(glow: number, [x, y, z]: Point3, [w, h, d]: Point3, side: Side = FrontSide) {
    const material = new MeshBasicMaterial({ side })
    material.color.setScalar(glow)
    materials.push(material)
    const mesh = new Mesh(box, material)
    mesh.position.set(x, y, z)
    mesh.scale.set(w, h, d)
    studio.add(mesh)
  }
  add(WALL, [0, 12, 0], [32, 30, 32], BackSide)
  add(FLOOR, [0, -2.9, 0], [30, 0.1, 30])
  for (const [x, y, z, w, h, d, glow] of PANELS) add(glow, [x, y, z], [w, h, d])

  const pmrem = new PMREMGenerator(renderer)
  // 128 rather than three's 256: the panels are large and soft, so the finer
  // map adds nothing a reflection shows, at four times the prefiltering work
  // and memory on every mount.
  const map = pmrem.fromScene(studio, 0.02, 0.1, 100, { size: 128 }).texture
  pmrem.dispose()
  for (const material of materials) material.dispose()
  box.dispose()
  return map
}
