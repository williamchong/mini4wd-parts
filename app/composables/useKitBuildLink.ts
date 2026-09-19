/**
 * A link that opens the builder on a kit, for the places that list kits: a
 * chassis page and a guide. Kits have no page of their own yet, and which box
 * to start from is the question those lists answer (docs/PLAN.md §6 M1b). The
 * hash is the builder's own share format, so this reuses `encodeBuild` rather
 * than inventing a second entry point — and Google ignores a hash, so these
 * are an affordance and not internal links.
 */
import { newBuild } from '#shared/catalog/build'
import { encodeBuild } from '#shared/catalog/share'
import type { ChassisId } from '#shared/catalog/schema'

export function useKitBuildLink() {
  const localePath = useLocalePath()
  return (chassis: ChassisId, kitId: string) =>
    ({ path: localePath('/'), hash: `#${encodeBuild(newBuild(chassis, kitId))}` })
}
