/**
 * Traditional Chinese terms whose Hong Kong and Taiwan wording differ.
 *
 * Both dictionaries live under `terms` in i18n/locales/zh-Hant.json and are
 * selected by key, so the reader's toggle never mutates the messages. English
 * has no `terms` block at all, which is why a missing key falls through to a
 * plain label rather than being an error: only Traditional Chinese has two
 * spellings to choose between.
 */
export function useTerm() {
  const { t, te } = useI18n()
  const { wording } = useWording()

  function term(name: string, fallbackKey?: string) {
    const key = `terms.${wording.value}.${name}`
    if (te(key)) return t(key)
    return fallbackKey ? t(fallbackKey) : name
  }

  return { term }
}
