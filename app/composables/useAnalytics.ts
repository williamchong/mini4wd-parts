/**
 * One `track()` for the whole site, fanning every event out to GA4 and PostHog
 * with the same name and the same properties, so a GA report and a PostHog
 * insight are always about the same thing (docs/PLAN.md §4.1).
 *
 * **No readiness check anywhere.** Both tags load at `onNuxtReady`, and both
 * `proxy` objects record calls and replay them once their SDK is there, so a
 * swap made in the first second counts exactly like one made in the tenth.
 *
 * **Ids, never names.** `resolve(part.names)` would give the same item two
 * different values in `zh-Hant` and `en` and split every report in half. Item
 * numbers, slot ids and chassis ids are already stable, bounded vocabularies.
 * Nothing here may carry the build hash either, for the same reason: it is
 * unbounded, and one report row per build is no report at all.
 *
 * **Every property is a GA4 custom dimension** that has to be registered by
 * hand in the GA4 admin before it shows up in a standard report — PostHog
 * discovers them on first receipt. Adding one here is not free; see the list in
 * docs/PLAN.md §6 M0.
 */
import type { BuildClass } from '#shared/catalog/build'
import type { ChassisId } from '#shared/catalog/chassis'
import type { RuleId, Severity } from '#shared/catalog/rules'
import type { PartCategory } from '#shared/catalog/schema'

/**
 * The events, and what each one carries. Types only — erased before a byte is
 * emitted, which is what lets this import from `shared/` freely (CLAUDE.md:
 * types are free, values drag Zod into the route's bundle).
 */
export type AnalyticsEvents = {
  /** A build began. The denominator for everything below, and the one number
   *  the 137 KB 3D chunk's fate rests on (docs/PLAN.md §5.5). */
  build_start: { chassis: ChassisId, kit?: string, entry: 'kit' | 'chassis' | 'link', trimmed?: boolean }
  /** A part went into a slot. `source` is what says whether the 3D pane is
   *  really the selection surface it was built to be (§5.4). */
  part_swap: { chassis: ChassisId, slot: string, part: string, source: 'row' | 'scene' | 'copy' | 'part_page' }
  part_revert: { chassis: ChassisId, slot: string }
  /** `ok: false` is the `window.prompt` fallback — no clipboard permission. */
  build_share: { chassis: ChassisId, kit?: string, swaps: number, ok: boolean }
  /** Rule-warning frequency (§4.1), deduped per build by the caller. */
  rule_triggered: { rule: RuleId, severity: Severity, slot?: string, build_class: BuildClass }
  build_class_set: { build_class: BuildClass }
  /** A part page handed an item number to the builder. */
  part_to_builder: { part: string, category: PartCategory }
  /** …and no slot on this chassis would take it: a button that led nowhere. */
  part_no_slot: { part: string, chassis: ChassisId }
  scene_ready: { chassis: ChassisId, ms: number }
  scene_tap: { chassis: ChassisId, slot: string, has_build: boolean }
}

export function useAnalytics() {
  const { proxy: ga } = useScriptGoogleAnalytics()
  const { proxy: ph } = useScriptPostHog()

  function track<E extends keyof AnalyticsEvents>(event: E, props: AnalyticsEvents[E]) {
    // Nothing to send while prerendering, and more than a wasted call: the
    // proxies queue for an SDK that never arrives on the server, so 1,709
    // routes would each grow a stack that is never drained.
    if (import.meta.server) return

    ga.gtag('event', event, props)
    // No `$current_url` override here: `disable_capture_url_hashes` in
    // nuxt.config.ts strips the build out of the URL for *every* PostHog event,
    // including the `$pageview` and `$$heatmap` this could never have reached.
    ph.posthog.capture(event, props)
  }

  return { track }
}
