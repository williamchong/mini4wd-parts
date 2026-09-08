/**
 * Hong Kong and Taiwan Traditional Chinese differ by a glossary, not by pages,
 * so the site serves one prerendered `zh-Hant` page set and treats the regional
 * wording as a reader preference. Terms live here rather than in the locale
 * JSON so there is a single dictionary to switch between, and so flipping the
 * default is one line rather than a URL migration.
 *
 * Hong Kong is the default because every Traditional Chinese name in the
 * catalog comes from tamiya.hk; see shared/catalog/names.ts, which applies the
 * same preference to part names.
 */
export type Wording = 'hk' | 'tw'

export const DEFAULT_WORDING: Wording = 'hk'

const STORAGE_KEY = 'mini4wd:wording'

const TERMS: Record<Wording, Record<string, string>> = {
  hk: { motor: '摩打', brake: '剎車' },
  tw: { motor: '馬達', brake: '煞車' }
}

export function isWording(value: unknown): value is Wording {
  return value === 'hk' || value === 'tw'
}

export function useWording() {
  const wording = useState<Wording>('wording', () => DEFAULT_WORDING)
  const { mergeLocaleMessage } = useI18n()

  /**
   * Merging is additive, so switching back re-merges the other dictionary
   * rather than undoing this one. Both variants carry the same keys.
   */
  function setWording(next: Wording, { persist = true } = {}) {
    wording.value = next
    mergeLocaleMessage('zh-Hant', { terms: TERMS[next] })
    if (persist && import.meta.client) {
      localStorage.setItem(STORAGE_KEY, next)
    }
  }

  /**
   * Reads the stored preference. Client-only: the page is prerendered with the
   * default wording, so this runs after hydration and swaps the text in a
   * normal reactive update instead of a hydration mismatch.
   */
  function restoreWording() {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (isWording(saved) && saved !== wording.value) {
      setWording(saved, { persist: false })
    }
  }

  return { wording, setWording, restoreWording }
}
