/**
 * What each Tamiya wheel and tire type is, as numbers the generators in
 * ./generators/parts.ts draw (docs/PLAN.md §5.6).
 *
 * The join key is the phrase itself. A kit's loadout says `Large Low-Profile
 * 6-Spoke`, `scripts/catalog/labels.ts` already normalises that to one
 * spelling so the vocabulary translates it once, and `shapeId` slugs the
 * normalised phrase into the keys below — so there is no phrase → shape
 * mapping table to keep in step with the translation one. A phrase with no row
 * here draws the small low-profile default, exactly as a kit with no
 * silhouette draws the wedge.
 *
 * This module holds no three.js and no Zod: the scene imports it into the 3D
 * chunk, and `catalog:verify` imports it in Node to check that every phrase in
 * `content/` reaches a row.
 *
 * **The sizes are Tamiya's, the faces are read off product photos.** The
 * diameters are the five the hobby actually sells — small ⌀24, small
 * low-profile ⌀26, large ⌀31, large low-profile ⌀30, super large ⌀35 — and the
 * regulation floor and ceiling are 22 and 35 (§2). Widths are estimates in the
 * narrow ⌀9 / standard ⌀11–12 / wide ⌀14 bands. A face is `spokes` and
 * `dish`, which is what separates a dish from a mesh at the size this pane
 * draws them, and `spoke` where the name says the spokes are not straight
 * bars: a Y or V spoke forks, a fin, saber, spiral or manta-ray spoke sweeps
 * round, a 3-spoke is broad blades, and a teardrop or fully cowled face is
 * nearly closed. A rim is authored 1 mm narrower than the tire
 * that wraps it, which is both how a real one sits and what keeps the lip and
 * the sidewall off the same plane; where a named type's spoke count is a judgement
 * rather than a count off a photo it is marked `?` in the comment beside it.
 * Whether a rim is plated or moulded is the part's, not the shape's: the same
 * face is sold in both, so `finish` lives on the part record.
 */

/**
 * One wheel type. `spokes` is 0 for a plain dished face; `dish` is how deep
 * the face is recessed inside the rim, which is what tells a flat dish from a
 * deep one. `spoke` is the spokes' shape where it is not a straight bar.
 */
export type WheelShape = {
  diameterMm: number
  widthMm: number
  spokes: number
  dishMm: number
  spoke?: 'y' | 'swept' | 'blade' | 'cowled'
}

/**
 * One tire type. `diameterMm` is the tire's own outer diameter — the number
 * Tamiya prints and the one §4.3's 22–35 mm rule checks — not a band added to
 * whatever wheel is under it. `shoulder` is the corner radius: small on a
 * slick, large on an arched tire, which is the whole visible difference
 * between the two at this size.
 */
export type TireShape = {
  diameterMm: number
  widthMm: number
  shoulderMm: number
}

/** The key a phrase maps to: its normalised spelling, slugged. */
export const shapeId = (phrase: string): string =>
  phrase.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

/**
 * What a stock wheel or tire entry draws: a chassis default's authored shape,
 * else the kit's own phrase, which *is* the key once slugged. Both the scene
 * and `catalog:verify` ask this, so the fallback chain is written once.
 */
export const entryShapeId = (entry: { shape?: string; label?: { en?: string } } | undefined): string | undefined =>
  entry?.shape ?? (entry?.label?.en ? shapeId(entry.label.en) : undefined)

/** Drawn for a wheel or tire whose phrase reaches no row: what most modern kits ship. */
export const DEFAULT_WHEEL = 'small-low-profile-dish-type'
export const DEFAULT_TIRE = 'small-low-profile-slick'

/**
 * Every wheel phrase the 305 kits carry, plus the Grade-Up Part faces the kits
 * never ship. Counts in the comments are kits reached, and are why the list is
 * ordered the way it is rather than alphabetically.
 */
export const WHEELS: Record<string, WheelShape> = {
  // — Small diameter, low profile: the modern standard, ⌀26 tire on a ⌀21 rim —
  'small-low-profile-saber-type': { diameterMm: 21, widthMm: 11, spokes: 5, dishMm: 1.6, spoke: 'swept' }, // 42 kits
  'small-low-profile-fin-type': { diameterMm: 21, widthMm: 11, spokes: 10, dishMm: 1.2, spoke: 'swept' }, // 32
  'small-low-profile-a-spoke': { diameterMm: 21, widthMm: 11, spokes: 5, dishMm: 2 }, // 23
  'small-low-profile-y-spoke': { diameterMm: 21, widthMm: 11, spokes: 6, dishMm: 1.8, spoke: 'y' }, // 14
  'small-low-profile-spiral-type': { diameterMm: 21, widthMm: 11, spokes: 8, dishMm: 1.4, spoke: 'swept' }, // 9 ?
  'small-low-profile-dish-type': { diameterMm: 21, widthMm: 11, spokes: 0, dishMm: 1.2 }, // 6
  'small-low-profile-angular-type': { diameterMm: 21, widthMm: 11, spokes: 5, dishMm: 2.2 }, // 5 ?
  'small-low-profile-t-spoke': { diameterMm: 21, widthMm: 11, spokes: 5, dishMm: 1.8 }, // 1
  'small-low-profile': { diameterMm: 21, widthMm: 11, spokes: 0, dishMm: 1.2 },
  'small-x-low-profile': { diameterMm: 21, widthMm: 9, spokes: 5, dishMm: 1.6 }, // 2, Super-X narrow
  'small-low-profile-5-spoke': { diameterMm: 21, widthMm: 11, spokes: 5, dishMm: 1.8 },
  'small-low-profile-12-spoke': { diameterMm: 21, widthMm: 11, spokes: 12, dishMm: 1.2 },
  'small-low-profile-3-spoke': { diameterMm: 21, widthMm: 8, spokes: 3, dishMm: 2.4, spoke: 'blade' },

  // — Small diameter, full profile: the classic ⌀24 fitment —
  'small-vs-type': { diameterMm: 17.5, widthMm: 11, spokes: 6, dishMm: 2 }, // 20 ?
  'small-fully-cowled-type': { diameterMm: 17.5, widthMm: 11, spokes: 6, dishMm: 2.4, spoke: 'cowled' }, // 9 ?
  'small-tz-fully-cowled-type': { diameterMm: 17.5, widthMm: 11, spokes: 6, dishMm: 2.4, spoke: 'cowled' }, // 3 ?
  'small-fully-cowled-mesh-type': { diameterMm: 17.5, widthMm: 11, spokes: 12, dishMm: 1.6 }, // 2
  small: { diameterMm: 17.5, widthMm: 11, spokes: 0, dishMm: 1.6 }, // 2
  'small-narrow': { diameterMm: 17.5, widthMm: 8, spokes: 5, dishMm: 2 },
  'small-narrow-3-spoke': { diameterMm: 17.5, widthMm: 8, spokes: 3, dishMm: 2.4, spoke: 'blade' },
  'small-7-spoke': { diameterMm: 17.5, widthMm: 11, spokes: 7, dishMm: 1.6 },
  'small-spike': { diameterMm: 17.5, widthMm: 12, spokes: 5, dishMm: 1.8 },

  // — Large diameter: ⌀31 tire on a ⌀25.5 rim, ⌀26.5 under a low-profile one —
  'large-narrow-lightweight': { diameterMm: 25.5, widthMm: 8, spokes: 6, dishMm: 2.2 }, // 24
  'large-ms-ii': { diameterMm: 25.5, widthMm: 11, spokes: 5, dishMm: 2 }, // 19 ?
  'large-manta-ray-type': { diameterMm: 25.5, widthMm: 11, spokes: 8, dishMm: 1.6, spoke: 'swept' }, // 18 ?
  'large-ms-i': { diameterMm: 25.5, widthMm: 11, spokes: 6, dishMm: 2.2 }, // 14 ?
  'large-teardrop-type': { diameterMm: 25.5, widthMm: 11, spokes: 5, dishMm: 2, spoke: 'cowled' }, // 8 ?
  'large-v-spoke': { diameterMm: 25.5, widthMm: 11, spokes: 5, dishMm: 2.4, spoke: 'y' }, // 8
  'large-tz-fully-cowled-type': { diameterMm: 25.5, widthMm: 11, spokes: 6, dishMm: 2.4, spoke: 'cowled' }, // 7 ?
  'large-flat-dish': { diameterMm: 25.5, widthMm: 11, spokes: 0, dishMm: 0.8 }, // 4
  'large-mesh-type': { diameterMm: 25.5, widthMm: 11, spokes: 12, dishMm: 1.6 }, // 3
  'large-tz-type': { diameterMm: 25.5, widthMm: 11, spokes: 6, dishMm: 2 }, // 2 ?
  'large-lightweight': { diameterMm: 25.5, widthMm: 11, spokes: 6, dishMm: 2.2 }, // 2
  'large-fm-type': { diameterMm: 25.5, widthMm: 11, spokes: 5, dishMm: 2 }, // 1 ?
  'large-low-profile-6-spoke': { diameterMm: 26.5, widthMm: 11, spokes: 6, dishMm: 1.8 }, // 8
  'large-low-profile-dish-type': { diameterMm: 26.5, widthMm: 11, spokes: 0, dishMm: 1.2 }, // 1
  'large-low-profile': { diameterMm: 26.5, widthMm: 11, spokes: 0, dishMm: 1.2 }, // 1
  'large-low-profile-5-spoke': { diameterMm: 26.5, widthMm: 11, spokes: 5, dishMm: 1.8 },
  'large-low-profile-v-spoke': { diameterMm: 26.5, widthMm: 11, spokes: 5, dishMm: 2.4, spoke: 'y' },
  'large-narrow-v-spoke': { diameterMm: 25.5, widthMm: 8, spokes: 5, dishMm: 2.4, spoke: 'y' },
  'large-narrow': { diameterMm: 25.5, widthMm: 8, spokes: 5, dishMm: 2.2 },
  'large-5-spoke': { diameterMm: 25.5, widthMm: 11, spokes: 5, dishMm: 2 },
  'large-wide': { diameterMm: 25.5, widthMm: 14, spokes: 5, dishMm: 2 },
  large: { diameterMm: 25.5, widthMm: 11, spokes: 5, dishMm: 2 },

  // Two kits ship two sets of wheels in one box, and the wiki writes both into
  // the one field. §4.8 leaves those phrases untranslated rather than parsing
  // them; here they are rows of their own, drawing the first set named, which
  // is the one on the box art.
  'small-low-profile-saber-type-1st-set-low-profile-fin-type-2nd-set': { diameterMm: 21, widthMm: 11, spokes: 5, dishMm: 1.6, spoke: 'swept' },
  'small-low-profile-fin-type-1st-low-profile-dish-type-2nd': { diameterMm: 21, widthMm: 11, spokes: 10, dishMm: 1.2, spoke: 'swept' }
}

/** Every tire phrase the kits carry, plus the Grade-Up Part fitments. */
export const TIRES: Record<string, TireShape> = {
  'small-low-profile-slick': { diameterMm: 26, widthMm: 12, shoulderMm: 1 }, // 134 kits
  'large-avante-type-slick': { diameterMm: 31, widthMm: 12, shoulderMm: 1.4 }, // 72
  'large-arched': { diameterMm: 31, widthMm: 12, shoulderMm: 3.4 }, // 32
  'small-x-narrow-type': { diameterMm: 24, widthMm: 9, shoulderMm: 1 }, // 20
  'small-high-profile-slick': { diameterMm: 24, widthMm: 12, shoulderMm: 1.2 }, // 9
  'large-low-profile-slick': { diameterMm: 31, widthMm: 12, shoulderMm: 1 }, // 9
  'large-avante-type-spiked': { diameterMm: 31, widthMm: 13, shoulderMm: 2.6 }, // 6, tread deferred
  'small-treaded-radial': { diameterMm: 24, widthMm: 12, shoulderMm: 1.6 }, // 5, tread deferred
  'small-low-profile': { diameterMm: 26, widthMm: 12, shoulderMm: 1 }, // 2
  'large-low-profile': { diameterMm: 31, widthMm: 12, shoulderMm: 1 }, // 1
  'small-rally-block': { diameterMm: 24, widthMm: 13, shoulderMm: 2.6 }, // 1, tread deferred
  'small-low-profile-offset': { diameterMm: 26, widthMm: 12, shoulderMm: 1.2 }, // 1
  small: { diameterMm: 24, widthMm: 12, shoulderMm: 1 },
  'small-offset': { diameterMm: 24, widthMm: 12, shoulderMm: 1.4 },
  'small-arched': { diameterMm: 24, widthMm: 12, shoulderMm: 2.6 },
  'small-narrow': { diameterMm: 24, widthMm: 9, shoulderMm: 1 },
  'small-sponge': { diameterMm: 24, widthMm: 12, shoulderMm: 2 },
  'small-narrow-sponge': { diameterMm: 24, widthMm: 9, shoulderMm: 2 },
  'small-semi-pneumatic': { diameterMm: 24, widthMm: 12, shoulderMm: 2.4 },
  'small-spike': { diameterMm: 25, widthMm: 13, shoulderMm: 2.6 },
  'large-narrow': { diameterMm: 31, widthMm: 9, shoulderMm: 1.2 },
  'large-narrow-arched': { diameterMm: 31, widthMm: 9, shoulderMm: 3.4 },
  'large-narrow-sponge': { diameterMm: 31, widthMm: 9, shoulderMm: 2 },
  'large-wide': { diameterMm: 31, widthMm: 15, shoulderMm: 1.4 },
  'large-low-profile-offset': { diameterMm: 31, widthMm: 12, shoulderMm: 1.2 },
  'large-offset': { diameterMm: 31, widthMm: 12, shoulderMm: 1.4 },
  'large-spike': { diameterMm: 32, widthMm: 13, shoulderMm: 2.6 },
  large: { diameterMm: 31, widthMm: 12, shoulderMm: 1.2 }
}
