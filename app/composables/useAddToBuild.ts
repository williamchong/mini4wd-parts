/**
 * The button that puts a part on the car, for every page that offers one: a
 * part's own page and a guide that names parts (`:part-links`). It decides
 * nothing: it hands the item number to the builder and goes there, and the
 * builder answers which slot it takes. See `pending` in useBuild.ts.
 *
 * Whether to offer the button at all is `goesOnCar`, the same test the builder
 * filters its catalog on.
 */
import type { Part } from '#shared/catalog/schema'

type Addable = Pick<Part, 'id' | 'category'>

export function useAddToBuild() {
  const localePath = useLocalePath()
  const { pending } = useBuild()
  const { track } = useAnalytics()

  function addToBuild(part: Addable) {
    // The head of a two-page funnel: the builder answers with `part_swap` when
    // the part lands, or `part_no_slot` when nothing on that chassis takes it.
    // Which page it came from is the event's own page location, in both SDKs.
    track('part_to_builder', { part: part.id, category: part.category })
    pending.value = part.id
    return navigateTo(localePath('/'))
  }

  return { addToBuild }
}
