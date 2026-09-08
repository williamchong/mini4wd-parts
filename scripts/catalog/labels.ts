/**
 * Loadout labels: turning the wiki's free-text wheel and tire phrases into the
 * localised records the builder renders (docs/PLAN.md §4.8).
 *
 * The wiki is hand-edited, so the same wheel arrives spelled several ways —
 * `Fin-Type` and `Fin-type`, `Fully Cowled Type` and `Fully-Cowled Type`, one
 * `Saber-Type` truncated to `Saber-Typ`. Normalising **before** the phrase is
 * used as a translation key is what keeps one wheel from occupying two rows of
 * the vocabulary and being translated twice.
 *
 * Two failure modes, two mechanisms: spelling is fixed mechanically here,
 * word-order and truncation are named explicitly in the `aliases` block of
 * data/taxonomy/loadout-labels.yml, because no rule derives one from the other.
 */
import { readYamlFile } from './io.ts'
import type { LabelNames } from '../../shared/catalog/schema.ts'

interface LabelVocabulary {
  aliases: Record<string, string>
  labels: Record<string, Omit<LabelNames, 'en'>>
}

const VOCABULARY = readYamlFile<LabelVocabulary>('data/taxonomy/loadout-labels.yml')

/**
 * An all-lowercase word, which in a wheel name is always a casing slip: the
 * wiki writes `Low-Profile Fin-type` and `Low profile 6-spoke` for the same
 * things it usually capitalises.
 *
 * Matching by shape rather than by a list of known words is what makes the
 * rules below safe to write case-sensitively, and it leaves `MS`, `TZ`, `FM`,
 * `VS` and `PRO` alone — a list would have to grow for every new wheel type,
 * and the day it lagged the phrase would quietly become a second vocabulary
 * key that renders untranslated.
 */
const LOWERCASE_WORD = /\b[a-z]+\b/g

/**
 * One spelling per phrase.
 *
 * `Manta Ray Type` -> `Manta Ray-Type` because the wiki uses the space and the
 * hyphen interchangeably. `(Both)` and `(Both set)` say the two axles match,
 * which the two slot entries already say, so they go; `(1st)` and `(2nd)` stay,
 * because they are the only thing distinguishing the wheels they mark.
 */
export function normaliseLabel(phrase: string): string {
  return phrase
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*\(both[^)]*\)/gi, '')
    .replace(LOWERCASE_WORD, word => word[0]!.toUpperCase() + word.slice(1))
    .replace(/\b(Low|High) Profile\b/g, '$1-Profile')
    .replace(/\bFully[- ]Cowled\b/g, 'Fully Cowled')
    // Digits are in the class because the wiki writes both `6-spoke` and
    // `V Spoke`, and dropping `6 Spoke` on the floor would silently miss the
    // vocabulary row `Large Low-Profile 6-Spoke` already authored for it.
    .replace(/([A-Za-z0-9])\s+Type\b/g, '$1-Type')
    .replace(/([A-Za-z0-9])\s+Spoke\b/g, '$1-Spoke')
    // The wiki names the same motor `Torque-Tuned 2` and `Torque-Tuned 2 Motor`,
    // and the slot already says it is a motor. Dropping the suffix also reduces
    // a bare `Motor` — which the generator's filter lets through — to nothing,
    // which `labelFor` turns into no label at all rather than a row reading
    // "Motor".
    .replace(/\bMotor$/, '')
    .trim()
}

/**
 * The localised record for one imported phrase.
 *
 * The normalised English is always kept: it is what the wiki said, it is the
 * key a reviewer looks up, and it is what an English reader should see. A
 * phrase with no entry in the vocabulary resolves to English alone, which the
 * builder marks as a fallback rather than hiding.
 */
export function labelFor(phrase: string | undefined): LabelNames | undefined {
  if (!phrase) return undefined
  const normalised = normaliseLabel(phrase)
  if (!normalised) return undefined
  const canonical = lookup(VOCABULARY.aliases, normalised) ?? normalised
  return { en: canonical, ...lookup(VOCABULARY.labels, canonical) }
}

/**
 * Own properties only. The vocabulary is a YAML-parsed plain object and the key
 * is scraped text, so a phrase normalising to `constructor` would otherwise
 * hand back something off the prototype chain.
 */
const lookup = <T>(table: Record<string, T>, key: string): T | undefined =>
  Object.hasOwn(table, key) ? table[key] : undefined

/**
 * A label that reads the same in every locale — a gear ratio, `3.5:1`.
 *
 * Written into each key we serve rather than into `ja` alone: both fallback
 * chains do end at `ja`, so one copy would resolve correctly everywhere, but it
 * would also be reported as an untranslated Japanese string in a Chinese page,
 * and suppressing that costs more than the two extra copies.
 */
export const neutralLabel = (value: string): LabelNames =>
  ({ ja: value, en: value, 'zh-HK': value, 'zh-TW': value })
