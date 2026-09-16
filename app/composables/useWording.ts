/**
 * Hong Kong and Taiwan Traditional Chinese differ by a glossary, not by pages,
 * so the site serves one prerendered `zh-Hant` page set and the regional
 * wording is a lookup key rather than a second build.
 *
 * Only Hong Kong wording is offered today. Every Traditional Chinese name in
 * the catalog comes from tamiya.hk (see shared/catalog/names.ts), so a Taiwan
 * setting would relabel three glossary terms and leave 382 part names in Hong
 * Kong wording underneath — a promise the data cannot keep. The `tw` half of
 * both the glossary and the catalog stays where it is, so offering the choice
 * again is a menu entry rather than a migration.
 */
import type { Wording } from '#shared/catalog/names'

export const DEFAULT_WORDING: Wording = 'hk'

export function useWording() {
  // A constant behind a composable: `useTerm` and `useCatalogName` go on asking
  // the same question, and this file is the only one that changes on the day
  // there is a second answer.
  const wording = computed<Wording>(() => DEFAULT_WORDING)

  return { wording }
}
