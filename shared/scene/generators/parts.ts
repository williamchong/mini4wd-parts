/**
 * The shapes the 3D pane draws for parts, generated from the part's specs
 * (docs/PLAN.md §5.6). One function per proxy kind, not per item: a 19 mm
 * aluminium roller and a 19 mm plastic one are the same call.
 *
 * Every shape is low-poly and dimensionally plausible, nothing more — the pane
 * is for an impression of the build, and the only reference we hold for any
 * part is one product photo. Units are millimetres, Y up, the car's nose
 * toward +Z. Wheels and tires spin about X, rollers about Y, and each shape's
 * origin is the socket it goes in (docs/PLAN.md §5.5).
 *
 * Everything is built on ./mesh.ts rather than three's primitives: a revolve
 * of a rectangle is a cylinder, and one Triangles instance holding several
 * of them is the merged geometry, so neither LatheGeometry nor
 * BufferGeometryUtils is pulled into the 3D chunk (1.4 KB gz between them,
 * measured 2026-09-16). This module still imports three at module level on
 * purpose: only the lazily loaded scene component imports it, so it lives in
 * the 3D chunk and nothing on a route's own JavaScript grows.
 */
import type { BufferGeometry } from 'three'
import { plate, Triangles } from './mesh.ts'
import type { Point2 } from './mesh.ts'

/** The revolve profile of a solid cylinder: radius `r`, from `h0` to `h1` along the axis. */
const cylinder = (r: number, h0: number, h1: number): Point2[] => [[0, h0], [r, h0], [r, h1], [0, h1]]

/**
 * A roller: a ring with a raised hub, so it reads as a bearing on a post
 * rather than a coin. `diameterMm` is the catalog's `rollerDiameterMm`.
 */
export function roller(diameterMm: number): BufferGeometry {
  const r = diameterMm / 2
  const t = new Triangles()
  t.revolve(cylinder(r, -2, 2), 16, 'y')
  t.revolve(cylinder(r * 0.4, -3.25, 3.25), 10, 'y')
  return t.geometry()
}

/**
 * A wheel: a rim with a dished face and an axle stub. Width is the common
 * narrow-wheel width; the catalog records no wheel width.
 */
export function wheel(diameterMm: number): BufferGeometry {
  const r = diameterMm / 2
  const t = new Triangles()
  t.revolve(cylinder(r, -5, 5), 16, 'x')
  t.revolve(cylinder(r * 0.55, -5.75, 5.75), 12, 'x')
  t.revolve(cylinder(1.5, -7, 7), 6, 'x')
  return t.geometry()
}

/**
 * A tire: an annulus around its wheel, revolved from a rectangular profile
 * with a small chamfer so the shoulder catches light. `wheelDiameterMm` is
 * the wheel it sits on; the band is what §5.5 sizes when no tire has a
 * diameter.
 */
export function tire(wheelDiameterMm: number, bandMm: number): BufferGeometry {
  const inner = wheelDiameterMm / 2 - 0.5
  const outer = wheelDiameterMm / 2 + bandMm / 2
  const halfWidth = 4.75
  const chamfer = Math.min(1, bandMm / 4)
  const t = new Triangles()
  t.revolve([
    [inner, -halfWidth],
    [outer - chamfer, -halfWidth],
    [outer, -halfWidth + chamfer],
    [outer, halfWidth - chamfer],
    [outer - chamfer, halfWidth],
    [inner, halfWidth]
  ], 16, 'x')
  return t.geometry()
}

/**
 * A front or rear stay: a wide FRP plate, broader at the roller end, sitting on
 * the moulded bumper. `thicknessMm` is `plateThicknessMm` when the part has
 * one. `towardNose` is +1 at the front and -1 at the rear, so the wide edge
 * faces outward on both.
 */
export function stay(thicknessMm: number, towardNose: 1 | -1): BufferGeometry {
  const out = 9 * towardNose
  const back = -9 * towardNose
  // Counter-clockwise from above either way round: the order flips with the end.
  const outline: Point2[] = [[-40, out], [-30, back], [30, back], [40, out]]
  if (towardNose > 0) outline.reverse()
  // On top of the bumper the socket marks, not through it.
  return plate(outline, 1, 1 + thicknessMm)
}

/** A side stay: a narrow plate along the car, holding a side roller. */
export function sideStay(thicknessMm: number): BufferGeometry {
  return plate([[-9, -22], [-9, 22], [9, 22], [9, -22]], 1, 1 + thicknessMm)
}

/** A brake: a plate with a sponge pad under it, both in one shape. */
export function brake(): BufferGeometry {
  const t = new Triangles()
  t.box(-20, -1, -7, 20, 1, 7)
  t.box(-18, -4, -6, 18, -1, 6)
  return t.geometry()
}

/** A mass damper: a cylindrical weight on a post. */
export function damper(): BufferGeometry {
  const t = new Triangles()
  t.revolve(cylinder(4.5, -5, 5), 12, 'y')
  t.revolve(cylinder(1, -6, 10), 6, 'y')
  return t.geometry()
}

/**
 * A double-shaft motor: a can along the car with a shaft out of each end,
 * which is how MA and MS carry it. Mostly hidden under the body; only its
 * silhouette matters (§5.4).
 */
export function motor(): BufferGeometry {
  const t = new Triangles()
  t.revolve(cylinder(10, -12.5, 12.5), 14, 'z')
  t.revolve(cylinder(1, -18.5, 18.5), 6, 'z')
  return t.geometry()
}
