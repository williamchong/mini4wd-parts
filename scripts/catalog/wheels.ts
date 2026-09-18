/**
 * Product names -> the wheel and tire shapes in shared/scene/wheels.ts
 * (docs/PLAN.md §5.6).
 *
 * A kit says what it ships as a phrase the wiki wrote, and `shapeId` turns
 * that straight into a key. A Grade-Up Part says it in Tamiya's own product
 * name instead — "LARGE DIA. LOW FRICTION LOW-PROFILE TIRES (31mm) & CARBON
 * WHEELS (DISH)" — so this module reads the four things a name can say about a
 * shape (its size, its profile, its width, and its face or tread) and composes
 * them into a key.
 *
 * The composition is deliberately loose: it tries the most specific key the
 * name supports and falls back a word at a time, so a face nobody has drawn
 * yet lands on the same size and profile rather than on nothing. Hardness and
 * compound are not shape — a hard tire and a soft one are the same annulus —
 * so `SUPER HARD`, `SOFT`, `LOW FRICTION` and the colour in brackets are all
 * ignored here; `colours.ts` reads the colour from the same name.
 */
import { TIRES, WHEELS } from '../../shared/scene/wheels.ts'
import { normalise } from './taxonomy.ts'
import type { PartCategory } from '../../shared/catalog/schema.ts'

/** The categories whose parts draw a wheel, a tire, or both. */
export const WHEEL_CATEGORIES: ReadonlySet<PartCategory> = new Set(['wheel', 'tire', 'wheel-tire-set'])

/** What a name said, in the order the keys are composed. */
type Read = { size?: string; profile?: string; width?: string; face?: string }

/**
 * A tire's millimetres are printed on about one name in five and are the
 * tire's outer diameter, never the rim's: "SMALL DIA. LOW FRICTION
 * LOW-PROFILE TIRES (26mm) & CARBON WHEELS" is a ⌀26 tire on a ⌀21 wheel.
 * They are read here as a size of last resort, for the names that print the
 * number and not the words.
 */
function sizeFrom(name: string): { size: string; profile?: string } {
  if (/large[ -](?:dia|diameter)|大径/i.test(name)) return { size: 'large' }
  if (/small[ -](?:dia|diameter)|小径/i.test(name)) return { size: 'small' }
  const mm = Number(/\b(\d{2})\s*mm/i.exec(name)?.[1])
  if (mm >= 30) return { size: 'large' }
  if (mm === 26) return { size: 'small', profile: 'low-profile' }
  // Small is Tamiya's unmarked case: every large product says 大径 or LARGE
  // DIA. in its name, and "OFFSET TREAD TIRES" or "LOW-PROFILE TIRE & WHEEL
  // SET (Y SPOKE)" with no size word is the small one on the shelf.
  return { size: 'small' }
}

/** The face a wheel name names, in the wheel table's own words. */
function faceFrom(name: string): string | undefined {
  const spokes = /\b(\d{1,2})[ -]?spoke/i.exec(name)?.[1]
  if (spokes) return `${spokes}-spoke`
  if (/\bY[ -]?spoke/i.test(name)) return 'y-spoke'
  if (/\bV[ -]?spoke/i.test(name)) return 'v-spoke'
  if (/\bdish\b/i.test(name)) return 'dish-type'
  if (/\bfin\b/i.test(name)) return 'fin-type'
  if (/\bmesh\b/i.test(name)) return 'mesh-type'
  if (/\bspiral\b/i.test(name)) return 'spiral-type'
  // The one named car family whose wheel Tamiya still sells as a part.
  if (/fully[ -]cowled/i.test(name)) return 'fully-cowled-type'
  return undefined
}

/**
 * The tread a tire name names, or nothing for a slick — which is most of the
 * corpus, and which carries no shape at all: a slick *is* the plain annulus
 * every row starts from. Saying so lets a narrow slick resolve to the narrow
 * row rather than to a wide slick one.
 */
function treadFrom(name: string): string | undefined {
  if (/sponge|スポンジ/i.test(name)) return 'sponge'
  if (/semi[- ]?pneumatic|中空/i.test(name)) return 'semi-pneumatic'
  if (/arched|アーチ/i.test(name)) return 'arched'
  if (/spike|スパイク/i.test(name)) return 'spike'
  if (/offset/i.test(name)) return 'offset'
  return undefined
}

/**
 * The first key the table actually holds, most specific first. Composing and
 * then checking — rather than mapping each name to one key — is what lets the
 * 53 parts and the 43 kit phrases share one table without a second lookup:
 * `LARGE DIA. V SPOKE NARROW WHEELS` wants `large-narrow-v-spoke`, and a name
 * whose face has no row yet still lands on `large-narrow`.
 */
function resolve(table: Record<string, unknown>, { size, profile, width, face }: Read): string | undefined {
  if (!size) return undefined
  const candidates = [
    [size, profile, width, face],
    [size, profile, face],
    [size, width, face],
    [size, face],
    [size, profile, width],
    [size, profile],
    [size, width],
    [size]
  ]
  return candidates
    .map(parts => parts.filter(Boolean).join('-'))
    .find(key => Object.hasOwn(table, key))
}

/**
 * The tire diameter a product name prints, where it prints one — about one
 * wheel or tire name in five. Always the tire's, never the rim's, and a fact
 * rather than something we chose, so `catalog:verify` holds the shape table to
 * it instead of the record taking it as a second source of the same number.
 */
export const printedTireMm = (name: string): number | undefined =>
  Number(/\((\d{2})\s*mm/i.exec(normalise(name))?.[1]) || undefined

/**
 * The shapes a wheel, tire or wheel-and-tire set draws. A set names both, and
 * its two halves are read from the same name: the words before and after the
 * `&` when it has one, since "LARGE DIA. 1-WAY WHEELS WT w/OFFSET TREAD TIRES"
 * puts the wheel's words and the tire's on opposite sides of it.
 */
export function shapesFor(raw: string): { wheel?: string; tire?: string } {
  // NFKC first, as every other name reader in the pipeline does: a full-width
  // "（２６ｍｍ）" has to read as the ASCII one, and three wheel names already
  // carry full-width brackets.
  const name = normalise(raw)
  const common = { ...sizeFrom(name) }
  if (/low[- ]profile|low[- ]height|ローハイト/i.test(name)) common.profile = 'low-profile'
  const width = /\bnarrow\b|ナロー/i.test(name) ? 'narrow' : /\bwide\b/i.test(name) ? 'wide' : undefined
  return {
    wheel: resolve(WHEELS, { ...common, width, face: faceFrom(name) }),
    tire: resolve(TIRES, { ...common, width, face: treadFrom(name) })
  }
}
