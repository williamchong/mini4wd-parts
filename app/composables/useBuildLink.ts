/**
 * Keeps the build in the page's `#hash`, so a reload restores it and the
 * address bar is always a link to what is on screen (docs/PLAN.md §6 M1b).
 *
 * Client-only by construction. The page is prerendered as the empty car and the
 * hash is read after hydration, as a normal reactive update rather than a
 * hydration mismatch.
 *
 * The hash is written with `history.replaceState`, never through the router:
 * a router navigation would run scroll behaviour and route watchers for what is
 * only a change of state, and pushing an entry per swap would turn the back
 * button into an undo that leaves the reader stuck on the page.
 */
import { encodeBuild, parseBuild, reconcileBuild, wasTrimmed } from '#shared/catalog/share'
import type { BuildState } from '#shared/catalog/build'
import type { ShareCatalog } from '#shared/catalog/share'

const COPIED_MS = 2000

export function useBuildLink(catalog: () => ShareCatalog | undefined) {
  const { t } = useI18n()
  const route = useRoute()
  const { build } = useBuild()
  const copied = ref(false)
  /**
   * The last link opened lost something on the way in — a part no longer in
   * the catalog, a kit on another chassis. The rule engine says so; the page
   * clears it once the reader starts a different build.
   */
  const linkTrimmed = ref(false)

  /**
   * Replaces the build with the one in the hash when there is a valid one, and
   * otherwise writes the build back over whatever the hash holds, so the
   * address bar keeps linking to what is on screen.
   */
  function readHash(hash: string) {
    const shared = parseBuild(hash)
    const known = catalog()
    // A link the catalog is not there to check yet is left alone rather than
    // overwritten. Unreachable while the page awaits its catalog before it
    // mounts; a `lazy` fetch would change that.
    if (shared && !known) return
    const state = shared && known ? reconcileBuild(shared, known) : undefined
    if (shared && state) {
      linkTrimmed.value = wasTrimmed(shared, state)
      build.value = state
    }
    else writeHash(build.value)
  }

  const linkFor = (state: BuildState | null) => {
    const packed = state ? encodeBuild(state) : ''
    return packed && `#${packed}`
  }

  function writeHash(state: BuildState | null) {
    const hash = linkFor(state)
    if (location.hash === hash) return
    // Vue Router keeps its scroll position in `history.state`; replacing it
    // with null would lose that on the next back navigation.
    history.replaceState(history.state, '', `${location.pathname}${location.search}${hash}`)
  }

  onMounted(() => {
    // The route's hash, not `location.hash`, and watched rather than read once.
    // A prerendered page opened at `/#…` hydrates against its payload path `/`:
    // Nuxt strips the hash from the URL until `app:suspense:resolve`, which
    // fires after this hook, and only then restores the route. Watching also
    // covers a second link pasted into the same tab. The first, empty read is
    // what puts the hash back after client-side navigation, where the build
    // came along in state but the URL did not — a locale switch, say.
    watch(() => route.hash, readHash, { immediate: true })
  })

  // Nothing changes the build during the server's single render pass, so this
  // only ever fires in the browser.
  watch(build, writeHash)

  let timer: ReturnType<typeof setTimeout> | undefined

  async function copyLink() {
    const hash = linkFor(build.value)
    if (!hash) return
    const url = `${location.origin}${location.pathname}${location.search}${hash}`
    try {
      await navigator.clipboard.writeText(url)
    } catch {
      // No clipboard permission, or not a secure context. Ugly, and it works
      // in every browser.
      window.prompt(t('build.copyLink'), url)
      return
    }
    copied.value = true
    clearTimeout(timer)
    timer = setTimeout(() => { copied.value = false }, COPIED_MS)
  }

  onBeforeUnmount(() => clearTimeout(timer))

  return { copied, copyLink, linkTrimmed }
}
