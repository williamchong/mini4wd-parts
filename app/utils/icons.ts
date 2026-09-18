import type { Slot } from '#shared/catalog/schema'

/**
 * The drawn stand-ins for what goes in a slot, used wherever there is no photo
 * — which is most of a stock build. Of 1,783 kit loadout entries only 15 name a
 * catalog part; the rest are molded pieces Tamiya never sold separately, so
 * they have no product photo and never will (docs/PLAN.md §4.7).
 *
 * Ours, drawn here, rather than an icon font or a sprite: fifteen glyphs is
 * less code than a dependency, they inherit `currentColor` so they follow the
 * row they sit in, and nothing is fetched.
 *
 * Circles are written as two arcs (`M cx-r cy a r r 0 1 0 2r 0 …`) so a glyph
 * is a list of `d` strings and SlotIcon stays one `v-for`.
 */
export const GLYPHS = {
  // Concentric rings: a roller seen from above, the way it sits on a plate.
  roller: ['M5 12a7 7 0 1 0 14 0a7 7 0 1 0-14 0', 'M9.5 12a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0-5 0'],
  // The same ring with spokes, which is what tells a wheel from a roller.
  wheel: ['M5 12a7 7 0 1 0 14 0a7 7 0 1 0-14 0', 'M12 5v14', 'M5 12h14'],
  // A fat band, because a tire is the thing wrapped around the wheel above.
  tire: ['M4 12a8 8 0 1 0 16 0a8 8 0 1 0-16 0', 'M7.5 12a4.5 4.5 0 1 0 9 0a4.5 4.5 0 1 0-9 0'],
  stay: ['M3 9.5h18v5H3z', 'M6 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0', 'M16 12a1 1 0 1 0 2 0a1 1 0 1 0-2 0'],
  brake: ['M4 7.5h16v3H4z', 'M6.5 10.5h11v4.5h-11z'],
  damper: ['M7 6.5h10v4H7z', 'M7 13.5h10v4H7z'],
  // Two shafts, one per side: the PRO motor a beginner meets first.
  motor: ['M5.5 8h13v8h-13z', 'M2.5 12h3', 'M18.5 12h3'],
  gear: ['M6 12a6 6 0 1 0 12 0a6 6 0 1 0-12 0', 'M12 3v3', 'M12 18v3', 'M3 12h3', 'M18 12h3',
    'M10 12a2 2 0 1 0 4 0a2 2 0 1 0-4 0'],
  shaft: ['M3 12h18', 'M5.5 9.5v5', 'M18.5 9.5v5'],
  bearing: ['M5 12a7 7 0 1 0 14 0a7 7 0 1 0-14 0', 'M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0',
    'M12 6v1.6', 'M12 16.4v1.6', 'M6 12h1.6', 'M16.4 12h1.6'],
  // The sprung strip that presses on the battery.
  terminal: ['M3.5 15l4-6 4 6 4-6 4 6'],
  switch: ['M5 9h14v6H5z', 'M7.4 12a1.6 1.6 0 1 0 3.2 0a1.6 1.6 0 1 0-3.2 0'],
  body: ['M4 16.5v-2.5l3-4.5h10l3 4.5v2.5z'],
  fastener: ['M9 7a3 3 0 1 0 6 0a3 3 0 1 0-6 0', 'M12 10v7.5', 'M10.5 17.5l1.5 2.5 1.5-2.5'],
  chassis: ['M5 8h14v8H5z', 'M2.5 9.5h2.5', 'M19 9.5h2.5', 'M2.5 14.5h2.5', 'M19 14.5h2.5'],
  generic: ['M6 6h12v12H6z']
} as const

type Glyph = keyof typeof GLYPHS

/** Slots, plus the chassis itself, which is not a slot but needs a picture. */
export type IconName = Slot | 'chassis'

/**
 * One glyph serves a family — front, rear and side rollers are one roller —
 * because the row already says which end of the car it is talking about.
 */
const GLYPH_FOR: Record<IconName, Glyph> = {
  'front-stay': 'stay',
  'rear-stay': 'stay',
  'side-stay': 'stay',
  'roller-front': 'roller',
  'roller-rear': 'roller',
  'roller-side': 'roller',
  'brake': 'brake',
  'damper': 'damper',
  'motor': 'motor',
  'gear': 'gear',
  'counter-gear': 'gear',
  'shaft': 'shaft',
  'propeller-shaft': 'shaft',
  'bearing': 'bearing',
  'wheel-front': 'wheel',
  'wheel-rear': 'wheel',
  'tire-front': 'tire',
  'tire-rear': 'tire',
  'terminal': 'terminal',
  'switch': 'switch',
  'body': 'body',
  'fastener': 'fastener',
  // Both are the chassis itself: a gear cover is an A part, a unit a piece of the frame.
  'gear-cover': 'chassis',
  'chassis-unit': 'chassis',
  'chassis': 'chassis',
  // A part that fills nothing reaches no picker, but the type allows it.
  'none': 'generic'
}

export const glyphFor = (name: IconName) => GLYPHS[GLYPH_FOR[name]]

/**
 * The one glyph that stands for a *list* of parts: the slot type most of them
 * fill. A browse page groups by category rather than by slot, so it has no
 * single icon otherwise — and reading it off the parts themselves beats a
 * hand-written category-to-icon table, which would be a fourth list to keep in
 * step with the taxonomy, the naming rules and the locale files.
 */
export function commonestSlot(parts: { slots: Slot[] }[]): IconName {
  const tally = new Map<Slot, number>()
  for (const part of parts) {
    for (const slot of part.slots) tally.set(slot, (tally.get(slot) ?? 0) + 1)
  }
  return [...tally].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'none'
}
