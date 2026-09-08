/**
 * Catalog names bound to the page's locale and the reader's wording setting.
 *
 * `resolveName` needs three arguments and two of them are the same on every
 * call site, so without this every template repeats
 * `resolveName(x.names, locale, wording)` and any one of them can drift.
 */
import { resolveName } from '#shared/catalog/names'
import type { NameLocale, Names } from '#shared/catalog/names'

export function useCatalogName() {
  const { locale } = useI18n()
  const { wording } = useWording()

  // The site has one Traditional Chinese page set, so every locale that is not
  // English resolves through the zh-Hant order.
  const nameLocale = computed<NameLocale>(() => locale.value === 'en' ? 'en' : 'zh-Hant')

  /** The name, plus the locale key it actually came from. */
  const resolve = (names: Names) => resolveName(names, nameLocale.value, wording.value)

  /**
   * True when the best name we have is the Japanese one. 40% of parts and 67%
   * of kits are in that state, and showing a Japanese string unmarked in a
   * Chinese page reads as a mistake rather than as a gap in the data.
   */
  const isFallback = (names: Names) => {
    if (nameLocale.value === 'en') return false
    const { from } = resolve(names)
    return from !== 'zh-HK' && from !== 'zh-TW'
  }

  return { resolve, name: (names: Names) => resolve(names).value, isFallback }
}
