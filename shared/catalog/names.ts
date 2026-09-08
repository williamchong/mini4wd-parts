import type { Part } from './schema.ts'

/**
 * Picking a display name out of a catalog record.
 *
 * Parts, chassis and kits all carry the same `names` shape, and none of them is
 * guaranteed to have every locale: `ja` is the only required one. The site
 * serves one region-neutral Traditional Chinese page set, so which Traditional
 * Chinese variant is *preferred* is a reader setting rather than a locale — see
 * app/composables/useWording.ts, which applies the same preference to UI text.
 *
 * Today `zh-TW` is empty for every part and kit (every Traditional Chinese name
 * we have came from tamiya.hk), so `hk` resolves directly and `tw` falls
 * through to the Hong Kong name. That is the honest outcome: a Taiwan reader
 * sees Hong Kong wording rather than a Japanese name.
 */
export type Names = Part['names']

export type NameLocale = 'zh-Hant' | 'en'

export type Wording = 'hk' | 'tw'

const ORDER: Record<NameLocale, Record<Wording, (keyof Names)[]>> = {
  'zh-Hant': {
    hk: ['zh-HK', 'zh-TW', 'en', 'ja'],
    tw: ['zh-TW', 'zh-HK', 'en', 'ja']
  },
  en: {
    // A Latin-script reader gets nothing from a Chinese name, but the Japanese
    // name is at least the string printed on the box.
    hk: ['en', 'ja'],
    tw: ['en', 'ja']
  }
}

/**
 * The name to show, and which locale key it actually came from. Callers that
 * want to mark a fallback (an English name shown in a Chinese page, say) need
 * the second half; most just take `.value`.
 */
export function resolveName(
  names: Names,
  locale: NameLocale,
  wording: Wording = 'hk'
): { value: string, from: keyof Names } {
  for (const key of ORDER[locale][wording]) {
    const value = names[key]
    if (value) return { value, from: key }
  }
  // `ja` is required by the schema, so this is unreachable for validated data.
  return { value: names.ja, from: 'ja' }
}

/** Whether a record has a Traditional Chinese name of either regional variant. */
export function hasTraditionalChineseName(names: Names): boolean {
  return Boolean(names['zh-HK'] || names['zh-TW'])
}
