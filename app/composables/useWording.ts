/**
 * Hong Kong and Taiwan Traditional Chinese differ by a glossary, not by pages,
 * so the site serves one prerendered `zh-Hant` page set and treats the regional
 * wording as a reader preference. Both dictionaries live under `terms` in
 * i18n/locales/zh-Hant.json and are selected by key, so the messages themselves
 * are never mutated and English readers never download them.
 *
 * Hong Kong is the default because every Traditional Chinese name in the
 * catalog comes from tamiya.hk; see shared/catalog/names.ts, which applies the
 * same preference to part names.
 */
import type { Wording } from '#shared/catalog/names'

export const DEFAULT_WORDING: Wording = 'hk'

const STORAGE_KEY = 'mini4wd:wording'

export function isWording(value: unknown): value is Wording {
  return value === 'hk' || value === 'tw'
}

export function useWording() {
  const wording = useState<Wording>('wording', () => DEFAULT_WORDING)

  function setWording(next: Wording) {
    wording.value = next
    localStorage.setItem(STORAGE_KEY, next)
  }

  /**
   * Client-only: pages are prerendered with the default wording, so this runs
   * after hydration and swaps the text in a normal reactive update rather than
   * a hydration mismatch.
   */
  function restoreWording() {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isWording(saved)) wording.value = saved
  }

  return { wording, setWording, restoreWording }
}
