/**
 * Which chassis the 3D pane can draw. Its own module, deliberately apart from
 * the socket tables in ./sockets.ts.
 *
 * The build page reads this to decide whether to reserve the pane at all; the
 * scene component reads the sockets. When the page also imported sockets.ts,
 * the bundler had a module shared between the route chunk and the lazy scene
 * chunk and placed it in a chunk already shared elsewhere — the @nuxt/content
 * prose components — which put 10.7 KB gzipped back on every /build load that
 * the lazy split had just kept off it (measured 2026-09-16, docs/PLAN.md §5.5).
 * sockets.test.ts holds the two in agreement instead.
 */
import type { ChassisId } from '../catalog/schema.ts'

export const SCENE_CHASSIS: ReadonlySet<ChassisId> = new Set<ChassisId>(['ma'])
