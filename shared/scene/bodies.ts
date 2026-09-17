/**
 * The shell a kit with no silhouette yet is drawn in (docs/PLAN.md §5.6). Every
 * other shape is data: authored in data/bodies/*.yml, written by
 * `npm run catalog:generate` to content/bodies/<id>.json, and loaded by the
 * scene only when a kit that names it is chosen, so the 3D chunk carries none
 * of them.
 */
import type { Silhouette } from './generators/body.ts'

/** A plain wedge, for a kit with no silhouette and a body part with none. */
export const DEFAULT_SILHOUETTE: Silhouette = {
  hull: [
    [-64, 36, 6, 30, 12],
    [-30, 37, 8, 30, 16, 16, 25],
    [0, 36, 8, 30, 15, 14, 24],
    [30, 33, 6, 26, 12],
    [64, 22, 3, 16, 5]
  ]
}
