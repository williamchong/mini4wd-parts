/**
 * The body shell, lofted from a silhouette (docs/PLAN.md §5.6): a few dozen
 * numbers per car that one function draws, so a shell briefly resembles the
 * car on that kit's box art without any of it being modelled.
 *
 * A silhouette is a hull — a run of cross-section stations along the car,
 * each an eight-cornered section: floor, flank up to a shoulder, a deck, and
 * a cabin on top of the deck — plus what a hull cannot be: wheel arches cut
 * into its flanks, fender pods, and a rear wing. That is enough for the shapes
 * Mini 4WD bodies actually take (wedges, Le Mans prototypes with pods, boxy
 * trucks) while staying a table of numbers and not a model.
 *
 * The numbers are authored as data (data/bodies/*.yml) and shipped as JSON, so
 * a station is a row, not an object: the keys would be most of the bytes.
 *
 * Units are millimetres. `z` runs from the tail (negative) to the nose, every
 * height is above the body's floor, and the floor sits `FLOOR_MM` below the
 * body socket so the shell hangs down over the chassis' flanks.
 */
import type { BufferGeometry } from 'three'
import { mirrorX, Triangles } from './mesh.ts'
import type { Point2, Point3 } from './mesh.ts'

/**
 * One cross-section: `z` along the car (listed tail to nose), then half the
 * width at the floor, the height of the shoulder where the flank stops being
 * vertical, half the width and the height of the deck, and — only where there
 * is a cabin — half the width and the height of the cabin top.
 */
export type Station = readonly [
  z: number, halfWidth: number, shoulder: number, halfDeck: number, deck: number,
  halfTop?: number, height?: number
]

/** A fender pod's section: `z`, half its width, the height of its top and of its underside. */
export type PodStation = readonly [z: number, halfWidth: number, top: number, bottom: number]

export type Silhouette = {
  hull: readonly Station[]
  /**
   * The radius of the arch cut into each flank over each axle, so the tire
   * shows under the body; one number for both ends, or `[front, rear]`, and 0
   * for an end whose fender covers its wheel.
   */
  arches?: number | readonly [front: number, rear: number]
  /** Fender pods, each a loft at x = ±`x`, mirrored. */
  pods?: readonly { x: number; stations: readonly PodStation[] }[]
  /** A rear wing: a blade with end plates, on pylons at x = ±`pylons` when given. */
  wing?: { z: number; halfWidth: number; height: number; chord: number; pylons?: number }
}

/** How far the body's floor sits below its socket. */
export const FLOOR_MM = 18
/**
 * Where the axles are, in the body's frame. Every v1 chassis has a wheelbase of
 * 80–83 mm and the body socket sits midway, so one shell fits all of them, and
 * the axle sits this far below the body's floor.
 */
export const AXLE_Z = 40
const AXLE_BELOW_FLOOR = 2
/** How far in from the flank an arch starts, so the chassis tub stays covered. */
const ARCH_INNER = 24
const at = (z: number, [x, y]: Point2): Point3 => [x, y - FLOOR_MM, z]

/** A symmetric ring from its right half, counter-clockwise seen from the nose. */
const ring = (z: number, right: readonly Point2[], offsetX = 0): Point3[] =>
  [...right, ...mirrorX(right)].map(([x, y]) => at(z, [x + offsetX, y]))

/** A station with its optional cabin filled in: no cabin is a cabin flush with the deck. */
type Section = [z: number, halfWidth: number, shoulder: number, halfDeck: number, deck: number, halfTop: number, height: number]
const resolved = ([z, halfWidth, shoulder, halfDeck, deck, halfTop, height]: Station): Section =>
  [z, halfWidth, shoulder, halfDeck, deck, halfTop ?? halfDeck * 0.7, height ?? deck]

/** Where across an arch its extra sections go, as the sine of the angle from the axle. */
const ARCH_SAMPLES = [-1, -0.92, -0.71, -0.38, 0, 0.38, 0.71, 0.92, 1]

/** The radius of each end's arch, front then rear. */
const archRadii = (arches: Silhouette['arches']): readonly [number, number] =>
  typeof arches === 'number' ? [arches, arches] : arches ?? [0, 0]

/**
 * The authored stations, plus sections interpolated across each arch so its
 * curve has points to follow. Only there: an interpolated section elsewhere
 * splits a flat-shaded face into slivers that shade in a sawtooth.
 */
function sectionsOf(hull: readonly Station[], arches: Silhouette['arches']): Section[] {
  const stations = hull.map(resolved)
  const [front, rear] = archRadii(arches)
  const first = stations[0]![0]
  const last = stations[stations.length - 1]![0]
  const extra = ([[AXLE_Z, front], [-AXLE_Z, rear]] as const)
    .flatMap(([axle, radius]) => radius > 0 ? ARCH_SAMPLES.map(k => axle + k * radius) : [])
    .filter(z => z > first && z < last && !stations.some(s => Math.abs(s[0] - z) < 0.5))
  const out = [...stations]
  for (const z of extra) {
    const i = stations.findIndex(s => s[0] > z)
    const a = stations[i - 1]!
    const b = stations[i]!
    const t = (z - a[0]) / (b[0] - a[0])
    out.push(a.map((v, j) => v + (b[j]! - v) * t) as Section)
  }
  return out.sort((p, q) => p[0] - q[0])
}

/** The deck's height at `z`, held level past either end of the hull. */
function deckAt(sections: readonly Section[], z: number): number {
  const i = sections.findIndex(s => s[0] >= z)
  if (i <= 0) return sections[i === 0 ? 0 : sections.length - 1]![4]
  const a = sections[i - 1]!
  const b = sections[i]!
  return a[4] + (b[4] - a[4]) * ((z - a[0]) / (b[0] - a[0]))
}

/** How high the flank's lower edge is lifted at `z`: the top of the arch over the nearest axle. */
function hemAt(z: number, arches: Silhouette['arches']): number {
  const [front, rear] = archRadii(arches)
  let hem = 0
  for (const [axle, radius] of [[AXLE_Z, front], [-AXLE_Z, rear]] as const) {
    const dz = z - axle
    if (radius > Math.abs(dz)) hem = Math.max(hem, Math.sqrt(radius * radius - dz * dz) - AXLE_BELOW_FLOOR)
  }
  return hem
}

/**
 * Ten corners: the floor out to where an arch starts, the flank's lower edge
 * (lifted over a wheel), shoulder, deck, cabin. Without an arch the first two
 * lie on the floor line, which costs two flat triangles a section and keeps
 * every ring the same length.
 */
function hullRing([z, halfWidth, shoulder, halfDeck, deck, halfTop, height]: Section, hem: number): Point3[] {
  const inner = Math.min(ARCH_INNER, halfWidth * 0.8)
  // An arch taller than the flank eats it, and stops just under the deck.
  const edge = Math.max(0, Math.min(hem, deck - 1))
  return ring(z, [[inner, 0], [halfWidth, edge], [halfWidth, Math.max(shoulder, edge + 0.5)], [halfDeck, deck], [halfTop, height]])
}

/** Six corners around a pod's centre line at `x`; the mirrored pod is re-wound to stay outward. */
function podRing([z, halfWidth, top, bottom]: PodStation, x: number, mirror: boolean): Point3[] {
  const mid = bottom + (top - bottom) * 0.6
  const points = ring(z, [[halfWidth, bottom], [halfWidth, mid], [halfWidth * 0.55, top]], x)
  return mirror ? points.map(([px, y, pz]) => [-px, y, pz] as const).reverse() : points
}

export function bodyGeometry(silhouette: Silhouette): BufferGeometry {
  const t = new Triangles()
  const sections = sectionsOf(silhouette.hull, silhouette.arches)
  t.solid(sections.map(s => hullRing(s, hemAt(s[0], silhouette.arches))))

  for (const { x, stations } of silhouette.pods ?? []) {
    t.solid(stations.map(s => podRing(s, x, false)))
    t.solid(stations.map(s => podRing(s, x, true)))
  }

  if (silhouette.wing) {
    const { z, halfWidth: w, height, chord, pylons } = silhouette.wing
    const y = height - FLOOR_MM
    const z0 = z - chord / 2
    const z1 = z + chord / 2
    const deck = deckAt(sections, z) - FLOOR_MM
    t.box(-w, y, z0, w, y + 1.5, z1)
    // On pylons the end plates are short fins; without, they reach down to the
    // deck and are what the wing stands on.
    const plateBottom = pylons === undefined ? Math.min(deck, y) : y - Math.min(8, height * 0.4)
    t.box(-w, plateBottom, z0, -w + 1.5, y + 1.5, z1)
    t.box(w - 1.5, plateBottom, z0, w, y + 1.5, z1)
    if (pylons !== undefined) {
      for (const px of [-pylons, pylons]) t.box(px - 1, deck, z0 + 2, px + 1, y, z1 - 2)
    }
  }

  return t.geometry()
}
