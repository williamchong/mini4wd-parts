/**
 * A link that opens the builder on a kit, or on a bare chassis: a kit page's
 * own button and a chassis page's hero. The hash is the builder's own share
 * format, so this reuses `encodeBuild` rather than inventing a second entry
 * point — and Google ignores a hash, so these are an affordance and not
 * internal links; a kit's *page* at `/kits/<id>` is the link a crawler
 * follows (docs/PLAN.md §4.7).
 *
 * With no kit it opens the builder on the bare chassis: the same state with
 * one layer skipped (§4.7), which is what a chassis page's own button wants.
 *
 * `from` rides in the query, not the hash: the hash is the packed build and
 * has no room for a flag, while the query is read once by `useBuildLink` to
 * count where the build started and then dropped from the address bar.
 */
import { newBuild } from '#shared/catalog/build'
import { encodeBuild } from '#shared/catalog/share'
import type { ChassisId } from '#shared/catalog/schema'
import { BUILD_FROM_QUERY, KIT_PAGE_ENTRY } from '~/composables/useAnalytics'

export function useKitBuildLink() {
  const localePath = useLocalePath()
  return (chassis: ChassisId, kitId?: string, from?: typeof KIT_PAGE_ENTRY) => ({
    path: localePath('/'),
    ...(from ? { query: { [BUILD_FROM_QUERY]: from } } : {}),
    hash: `#${encodeBuild(newBuild(chassis, kitId))}`
  })
}
