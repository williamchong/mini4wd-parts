/**
 * The body shell, lofted from a silhouette (docs/PLAN.md §5.6): a few dozen
 * numbers per kit that one function draws, so a shell briefly resembles the
 * car on that kit's box art without any of it being modelled.
 *
 * A silhouette is a hull — a run of cross-section stations along the car,
 * each an eight-cornered section: floor, flank up to a shoulder, a deck, and
 * a cabin on top of the deck — plus what a hull cannot be: fender pods over
 * the wheels, and a rear wing. That is enough for the shapes Mini 4WD bodies
 * actually take (wedges, Le Mans prototypes with pods, boxy trucks) while
 * staying a table of numbers and not a model.
 *
 * Units are millimetres. `z` runs from the tail (negative) to the nose, every
 * height is above the body's floor, and the floor sits `FLOOR_MM` below the
 * body socket so the shell hangs down over the chassis' flanks.
 */
import type { BufferGeometry } from 'three'
import { mirrorX, Triangles } from './mesh.ts'
import type { Point2, Point3 } from './mesh.ts'

export type Station = {
  /** Along the car; stations are listed tail to nose. */
  z: number
  /** Half the width at the floor. */
  halfWidth: number
  /** Height of the shoulder, where the flank stops being vertical. */
  shoulder: number
  /** Half the width of the deck, the body's upper surface. */
  halfDeck: number
  /** Height of the deck. */
  deck: number
  /** Half the width of the cabin top; omit where there is no cabin. */
  halfTop?: number
  /** Height of the cabin top; omit where there is no cabin. */
  height?: number
}

export type PodStation = {
  z: number
  halfWidth: number
  /** Height of the pod's top and of its underside. */
  top: number
  bottom: number
}

export type Silhouette = {
  hull: Station[]
  /** Fender pods at x = ±`x`, one loft mirrored. */
  pods?: { x: number; stations: PodStation[] }
  /** A rear wing: a blade with end plates, on pylons at x = ±`pylons` when given. */
  wing?: { z: number; halfWidth: number; height: number; chord: number; pylons?: number }
  /** Body colour, from the box art; wheel and roller colours when the kit's differ from the defaults. */
  colour: number
  wheelColour?: number
  rollerColour?: number
}

/** How far the body's floor sits below its socket. */
export const FLOOR_MM = 18

const at = (z: number, [x, y]: Point2): Point3 => [x, y - FLOOR_MM, z]

/** A symmetric ring from its right half, counter-clockwise seen from the nose. */
const ring = (z: number, right: readonly Point2[], offsetX = 0): Point3[] =>
  [...right, ...mirrorX(right)].map(([x, y]) => at(z, [x + offsetX, y]))

/** Eight corners: floor, shoulder, deck, cabin. */
function hullRing(s: Station): Point3[] {
  const t = s.halfTop ?? s.halfDeck * 0.7
  const h = s.height ?? s.deck
  return ring(s.z, [[s.halfWidth, 0], [s.halfWidth, s.shoulder], [s.halfDeck, s.deck], [t, h]])
}

/** Six corners around a pod's centre line at `x`; the mirrored pod is re-wound to stay outward. */
function podRing(s: PodStation, x: number, mirror: boolean): Point3[] {
  const w = s.halfWidth
  const mid = s.bottom + (s.top - s.bottom) * 0.6
  const points = ring(s.z, [[w, s.bottom], [w, mid], [w * 0.55, s.top]], x)
  return mirror ? points.map(([px, y, z]) => [-px, y, z] as const).reverse() : points
}

export function bodyGeometry(silhouette: Silhouette): BufferGeometry {
  const t = new Triangles()
  t.solid(silhouette.hull.map(hullRing))

  if (silhouette.pods) {
    const { x, stations } = silhouette.pods
    t.solid(stations.map(s => podRing(s, x, false)))
    t.solid(stations.map(s => podRing(s, x, true)))
  }

  if (silhouette.wing) {
    const { z, halfWidth: w, height, chord, pylons } = silhouette.wing
    const y = height - FLOOR_MM
    const z0 = z - chord / 2
    const z1 = z + chord / 2
    t.box(-w, y, z0, w, y + 1.5, z1)
    const plateHeight = Math.min(8, height * 0.4)
    t.box(-w, y - plateHeight, z0, -w + 1.5, y + 1.5, z1)
    t.box(w - 1.5, y - plateHeight, z0, w, y + 1.5, z1)
    if (pylons !== undefined) {
      const deck = silhouette.hull[0]!.deck - FLOOR_MM
      for (const px of [-pylons, pylons]) t.box(px - 1, deck, z0 + 2, px + 1, y, z1 - 2)
    }
  }

  return t.geometry()
}
