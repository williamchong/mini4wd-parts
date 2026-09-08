/**
 * The build the user is assembling: a chassis, an optional kit, and the swaps
 * they have made. Nothing more — everything derived from it (the slot list, the
 * totals, later the rule findings) is computed by the pure functions in
 * shared/catalog/build.ts, which is why they can be tested without a browser.
 */
import { newBuild } from '#shared/catalog/build'
import type { BuildClass, BuildState } from '#shared/catalog/build'
import type { ChassisId } from '#shared/catalog/schema'

export function useBuild() {
  /** Null until the user has picked a chassis or a kit to start from. */
  const build = useState<BuildState | null>('build', () => null)
  const buildClass = useState<BuildClass>('build-class', () => 'open')

  function start(chassis: ChassisId, kit?: string) {
    build.value = newBuild(chassis, kit)
  }

  function reset() {
    build.value = null
  }

  /** Put parts in a slot. An empty list empties the slot, which is not the
   *  same as never having touched it — see `BuildState.swaps`. */
  function swap(slotId: string, partIds: string[]) {
    if (!build.value) return
    build.value = { ...build.value, swaps: { ...build.value.swaps, [slotId]: partIds } }
  }

  /** Drop the swap so the slot falls back to what the kit or chassis put there. */
  function revert(slotId: string) {
    if (!build.value) return
    const swaps = { ...build.value.swaps }
    delete swaps[slotId]
    build.value = { ...build.value, swaps }
  }

  return { build, buildClass, start, reset, swap, revert }
}
