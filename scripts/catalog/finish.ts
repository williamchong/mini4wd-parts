/**
 * Product names -> the finish the 3D pane shades a part or a kit's body in,
 * where the material *is* the product (docs/PLAN.md §5.6, "Materials and
 * light", phase 4): a plated wheel or body, an aluminium wheel, a carbon
 * plate. Everything else is its kind's own moulding and records nothing.
 *
 * Read from the English and Japanese names together, because they do not say
 * the same thing: a plated kit is メッキ in Japanese and "METALLIC" in English,
 * a word Tamiya also uses for metallic paint.
 */
import { normalise } from './taxonomy.ts'
import type { PartFinish } from '../../shared/catalog/schema.ts'

/**
 * Ordered, first match wins. Two traps, both real names in the catalog:
 * "POLYCARBONATE" is a clear body, not carbon, and "CARBON REINFORCED" is a
 * moulding with carbon fibre in the plastic, not a carbon plate. Each rule
 * reads only the words next to its own: a set names several things, and a
 * "matte" or a "reinforced" further along describes one of the others.
 */
const RULES: readonly [RegExp, PartFinish][] = [
  [/matte?\s+(?:[\w-]+\s+){0,2}plated|マット\S*メッキ/i, 'matte-plated'],
  [/plated|メッキ/i, 'plated'],
  [/aluminum|aluminium|アルミ/i, 'aluminium'],
  [/(?<!poly)carbon(?!\s*reinforced)|カーボン(?!強化)/i, 'carbon']
]

export function finishFor(...names: (string | undefined)[]): PartFinish | undefined {
  const text = normalise(names.filter(Boolean).join(' / '))
  return RULES.find(([pattern]) => pattern.test(text))?.[1]
}
