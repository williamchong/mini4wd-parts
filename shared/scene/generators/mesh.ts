/**
 * The two constructions every generated shape here is made of: a loft between
 * rings of points, and a prism from a flat outline. Hand-built, because three's
 * ExtrudeGeometry drags its curve and triangulation code into the 3D chunk
 * (about 8 KB gzipped, measured 2026-09-16) for outlines that are all convex.
 *
 * Both return flat-shaded, non-indexed triangles: every face gets its own
 * normal, which is the low-poly look, and also what stops a shape lofted from
 * a dozen numbers looking like it is trying to be smooth.
 */
import { BufferGeometry, Float32BufferAttribute } from 'three'

export type Point3 = readonly [x: number, y: number, z: number]
export type Point2 = readonly [x: number, y: number]

/** The other half of a symmetric outline: `right` mirrored in x, in the order that keeps the winding. */
export const mirrorX = (right: readonly Point2[]): Point2[] =>
  right.map(([x, y]) => [-x, y] as const).reverse()

export class Triangles {
  private readonly positions: number[] = []

  get empty() {
    return this.positions.length === 0
  }

  tri(a: Point3, b: Point3, c: Point3) {
    this.positions.push(...a, ...b, ...c)
  }

  /** A fan over a convex polygon, wound so its normal is `flip ? -n : n` for a counter-clockwise outline. */
  fan(points: readonly Point3[], flip = false) {
    for (let k = 1; k + 1 < points.length; k++) {
      if (flip) this.tri(points[0]!, points[k + 1]!, points[k]!)
      else this.tri(points[0]!, points[k]!, points[k + 1]!)
    }
  }

  /**
   * Quads between consecutive rings of equal length, each wound so the
   * outside is out when the rings are listed in the +z direction and each
   * ring runs counter-clockwise seen from +z.
   */
  loft(rings: readonly (readonly Point3[])[]) {
    for (let i = 0; i + 1 < rings.length; i++) {
      const a = rings[i]!
      const b = rings[i + 1]!
      for (let k = 0; k < a.length; k++) {
        const n = (k + 1) % a.length
        this.tri(a[k]!, a[n]!, b[n]!)
        this.tri(a[k]!, b[n]!, b[k]!)
      }
    }
  }

  /** A closed loft: rings, a cap at the first (facing -z) and at the last (facing +z). */
  solid(rings: readonly (readonly Point3[])[]) {
    this.loft(rings)
    this.fan(rings[0]!, true)
    this.fan(rings[rings.length - 1]!)
  }

  /**
   * A closed profile in the (radius, along-axis) plane swept around an axis:
   * a rectangle makes a cylinder, an annulus profile a tire. The profile is
   * listed counter-clockwise with radius to the right and the axis up, and
   * the result is closed, so it needs no caps. A point on the axis (radius 0)
   * is one apex, not a ring of coincident points, so a capped cylinder is a
   * fan at each end and no zero-area triangles: half of what a naive sweep
   * of the same profile would emit.
   */
  revolve(profile: readonly Point2[], segments: number, axis: 'x' | 'y' | 'z', [ox, oy, oz]: Point3 = [0, 0, 0]) {
    const place = (r: number, h: number, i: number): Point3 => {
      const a = (i / segments) * Math.PI * 2
      const u = r * Math.cos(a)
      const v = r * Math.sin(a)
      const [x, y, z]: Point3 = axis === 'x' ? [h, u, v] : axis === 'y' ? [v, h, u] : [u, v, h]
      return [x + ox, y + oy, z + oz]
    }
    const ring = ([r, h]: Point2): Point3[] => Array.from({ length: segments }, (_, i) => place(r, h, i))
    for (let k = 0; k < profile.length; k++) {
      const a = profile[k]!
      const b = profile[(k + 1) % profile.length]!
      if (a[0] === 0 && b[0] === 0) continue
      if (a[0] > 0 && b[0] > 0) {
        this.loft([ring(a), ring(b)])
        continue
      }
      // One end on the axis: the same quads as the loft with the degenerate
      // ring collapsed to its apex, which keeps the winding the loft has.
      const [apexProfile, rimProfile] = a[0] === 0 ? [a, b] : [b, a]
      const apex = place(0, apexProfile[1], 0)
      const rim = ring(rimProfile)
      for (let i = 0; i < segments; i++) {
        const n = (i + 1) % segments
        if (a[0] === 0) this.tri(apex, rim[n]!, rim[i]!)
        else this.tri(rim[i]!, rim[n]!, apex)
      }
    }
  }

  /** An axis-aligned box from two corners. */
  box(x0: number, y0: number, z0: number, x1: number, y1: number, z1: number) {
    const bottom: Point3[] = [[x0, y0, z0], [x0, y0, z1], [x1, y0, z1], [x1, y0, z0]]
    const top: Point3[] = bottom.map(([x, , z]) => [x, y1, z] as const)
    this.prism(bottom, top)
  }

  /** A box by size and centre, the way the socket table thinks. */
  boxAt(w: number, h: number, d: number, x = 0, y = 0, z = 0) {
    this.box(x - w / 2, y - h / 2, z - d / 2, x + w / 2, y + h / 2, z + d / 2)
  }

  /** A flat plate from a plan-view outline (x, z), counter-clockwise from above, between two heights. */
  plate(outline: readonly Point2[], y0: number, y1: number) {
    this.prism(outline.map(([x, z]) => [x, y0, z] as const), outline.map(([x, z]) => [x, y1, z] as const))
  }

  /**
   * A prism between a bottom and a top outline of equal length, both listed
   * counter-clockwise seen from above (+y).
   */
  prism(bottom: readonly Point3[], top: readonly Point3[]) {
    this.fan(bottom, true)
    this.fan(top)
    for (let k = 0; k < bottom.length; k++) {
      const n = (k + 1) % bottom.length
      this.tri(bottom[k]!, bottom[n]!, top[n]!)
      this.tri(bottom[k]!, top[n]!, top[k]!)
    }
  }

  geometry(): BufferGeometry {
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(this.positions, 3))
    geometry.computeVertexNormals()
    return geometry
  }

  /**
   * Several sets of triangles as one geometry with a draw group each, in
   * order, for a mesh drawn with one material per group: a shape with more
   * than one colour that is still one proxy to hit, cache and dispose. An
   * empty set is an empty group, so group indices never shift.
   */
  static grouped(sets: readonly Triangles[]): BufferGeometry {
    const all = new Triangles()
    const geometry = new BufferGeometry()
    for (const [index, set] of sets.entries()) {
      geometry.addGroup(all.positions.length / 3, set.positions.length / 3, index)
      for (const value of set.positions) all.positions.push(value)
    }
    geometry.setAttribute('position', new Float32BufferAttribute(all.positions, 3))
    geometry.computeVertexNormals()
    return geometry
  }
}

/** A plate on its own, for a part that is nothing else. */
export function plate(outline: readonly Point2[], y0: number, y1: number): BufferGeometry {
  const t = new Triangles()
  t.plate(outline, y0, y1)
  return t.geometry()
}

/** The revolve profile of a solid cylinder: radius `r`, from `h0` to `h1` along the axis. */
export const cylinder = (r: number, h0: number, h1: number): Point2[] => [[0, h0], [r, h0], [r, h1], [0, h1]]
