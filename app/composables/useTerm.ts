/**
 * Traditional Chinese terms whose Hong Kong and Taiwan wording differ.
 *
 * Both dictionaries live under `terms` in i18n/locales/zh-Hant.json and are
 * selected by key, so the reader's toggle never mutates the messages. English
 * has no `terms` block at all, which is why a missing key falls through to a
 * plain label rather than being an error: only Traditional Chinese has two
 * spellings to choose between.
 */
import type { Slot } from '#shared/catalog/schema'

export function useTerm() {
  const { t, te } = useI18n()
  const { wording } = useWording()

  function term(name: string, fallbackKey?: string) {
    const key = `terms.${wording.value}.${name}`
    if (te(key)) return t(key)
    return fallbackKey ? t(fallbackKey) : name
  }

  /** A build slot's name, which follows the wording toggle like any term. */
  const slotLabel = (slot: { id: string, type: string }) => term(slot.type, `build.slot.${slot.id}`)

  /**
   * The same name for a slot *type*, which is what a part declares — a chassis
   * calls the `gear` slot `gear-set` and the `shaft` slot `axle`, and a part
   * page has only the type to go on.
   */
  const slotTypeLabel = (type: Slot) => term(type, `build.slot.${type}`)

  return { term, slotLabel, slotTypeLabel }
}
