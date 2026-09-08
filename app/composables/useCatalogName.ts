/**
 * Catalog names bound to the page's locale and the reader's wording setting.
 *
 * `resolveName` needs three arguments and two of them are the same on every
 * call site, so without this every template repeats
 * `resolveName(x.names, locale, wording)` and any one of them can drift.
 */
import { resolveLabel, resolveName } from '#shared/catalog/names'
import type { NameLocale, Names } from '#shared/catalog/names'
import type { LabelNames } from '#shared/catalog/schema'

export function useCatalogName() {
  const { locale } = useI18n()
  const { wording } = useWording()

  // The site has one Traditional Chinese page set, so every locale that is not
  // English resolves through the zh-Hant order.
  const nameLocale = computed<NameLocale>(() => locale.value === 'en' ? 'en' : 'zh-Hant')

  /** The name, plus the locale key it actually came from. */
  const resolve = (names: Names) => resolveName(names, nameLocale.value, wording.value)

  /** Whether a resolved name came from a locale this page does not serve. */
  const marks = (from: keyof Names) =>
    nameLocale.value !== 'en' && from !== 'zh-HK' && from !== 'zh-TW'

  /**
   * A loadout label, which may have no locale we can serve at all — a
   * wiki-imported phrase we have not translated carries only `en`.
   *
   * Returns the marking alongside the value rather than leaving the caller to
   * ask separately, because the answer falls out of the same walk and asking
   * twice means walking twice for every entry of every slot.
   */
  const label = (names: LabelNames) => {
    const hit = resolveLabel(names, nameLocale.value, wording.value)
    return hit && { ...hit, fallback: marks(hit.from) }
  }

  /**
   * True when the best name we have is not a Traditional Chinese one. 40% of
   * parts and 67% of kits are in that state, as are the wiki-imported loadout
   * labels, and showing a foreign string unmarked in a Chinese page reads as a
   * mistake rather than as a gap in the data.
   */
  const isFallback = (names: Names) => marks(resolve(names).from)

  return { resolve, name: (names: Names) => resolve(names).value, isFallback, label }
}
