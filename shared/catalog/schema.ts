import { z } from 'zod'
import { CHASSIS_IDS } from './chassis.ts'
import type { ChassisId } from './chassis.ts'

/**
 * Catalog schemas, shared by `content.config.ts` (build-time validation of the
 * committed YAML) and `scripts/catalog/generate.ts` (validation before writing).
 * Keeping one definition is the point: a field the generator emits but the
 * collection rejects would only surface as a broken `nuxt generate`.
 *
 * Field shape follows docs/PLAN.md §4.2. Fields we cannot fill from the first
 * scrape (3D models, wizard roles, own photos) are omitted rather than stubbed.
 */

// Re-exported so the schema stays the one import most callers need; the list
// itself lives in ./chassis.ts, which page components can import without Zod.
export { CHASSIS_IDS, byChassisOrder, isChassisId } from './chassis.ts'
export type { ChassisId } from './chassis.ts'

/**
 * Our chassis id -> Tamiya's `genre_item` code. Tamiya's codes are
 * inconsistently cased (`FM_A` but `super2`), which is why we keep our own ids.
 * Verified against /japan/cms/mini4wd_chassis_select.html.
 */
export const CHASSIS_CODES: Record<ChassisId, string> = {
  'ma': 'ma',
  'ms': 'ms',
  'me': 'me',
  'ar': 'ar',
  'fm-a': 'FM_A',
  'vz': 'vz',
  'super-2': 'super2',
  'vs': 'vs'
}

/** Reverse lookup for the chassis tags printed on item detail pages. */
export const CODE_TO_CHASSIS = Object.fromEntries(
  Object.entries(CHASSIS_CODES).map(([id, code]) => [code.toLowerCase(), id])
) as Record<string, ChassisId>

/**
 * One of Tamiya's chassis tags as our id, or undefined when the tag names a
 * chassis outside the v1 set. Tamiya's codes are inconsistently cased, so every
 * caller has to fold before looking up — hence one place that does it.
 */
export const chassisIdFor = (code: string): ChassisId | undefined =>
  CODE_TO_CHASSIS[code.toLowerCase()]

/**
 * Our own part taxonomy. Tamiya's own category labels are too coarse (almost
 * everything is just "ミニ四駆グレードアップパーツ"), so this is derived from
 * name keywords in scripts/catalog/taxonomy.ts and correctable per item.
 */
export const PART_CATEGORIES = [
  'roller',
  'plate',
  'bumper',
  'brake',
  'mass-damper',
  'slide-damper',
  'stabilizer',
  'bearing',
  'gear',
  'gear-cover',
  /**
   * Two different parts share the word シャフト. `shaft` is the axle the wheels
   * ride on; `propeller-shaft` is the drivetrain link that only single-shaft
   * chassis have. They fill different slots, so they cannot share a category.
   */
  'shaft',
  'propeller-shaft',
  'wheel',
  'tire',
  'wheel-tire-set',
  'motor',
  'motor-mount',
  'terminal',
  'switch',
  'battery',
  'battery-holder',
  'spacer',
  'screw',
  'body-catch',
  'body',
  'chassis-set',
  'sticker',
  'setting-tool',
  'tool',
  'bundle',
  'accessory',
  'other'
] as const

/**
 * Tamiya's kit product lines, the `3010` branch of the same tree. Kits are a
 * separate collection from parts because almost nothing they carry is the same:
 * a kit has a chassis and a loadout, not a category and a slot list.
 */
export const KIT_SERIES = [
  'standard',      // 301010 ミニ四駆シリーズ
  'racer',         // 301030 レーサーミニ四駆
  'racer-special', // 301031 レーサーミニ四駆 特別仕様
  'fully-cowled',  // 301040 フルカウルミニ四駆
  'aero',          // 301050 エアロミニ四駆
  'laser',         // 301051 レーザーミニ四駆
  'rev',           // 301070 ミニ四駆REV
  'pro',           // 301080 ミニ四駆PRO
  'super',         // 301081 スーパーミニ四駆
  'mighty',        // 301082 マイティミニ四駆
  'real',          // 301083 リアル/メカニカルミニ四駆
  'beginners',     // 301084 ビギナーズミニ四駆
  'special',       // 301085 特別企画(マシン)
  'limited'        // 301086 限定(マシン)
] as const

/** Where an item sits in Tamiya's own product tree. */
export const PART_SERIES = [
  'gup',      // 303010 ミニ四駆グレードアップパーツ (regular, GP No.)
  'ao',       // 303030 AO パーツ (spares)
  'special',  // 303020 特別企画
  'limited',  // 303025 限定
  'station',  // 3050 ミニ四駆ステーション限定
  'other'
] as const

/**
 * Builder sockets a part can occupy. The 2D builder, the rule engine and the
 * later 3D socket graph all read this same list (docs/PLAN.md §4.2, §5.2).
 */
export const SLOTS = [
  'front-stay',
  'rear-stay',
  'side-stay',
  'roller-front',
  'roller-rear',
  'roller-side',
  'brake',
  'damper',
  'motor',
  'gear',
  'counter-gear',
  'shaft',
  'propeller-shaft',
  'bearing',
  'wheel-front',
  'wheel-rear',
  'tire-front',
  'tire-rear',
  'terminal',
  'switch',
  'body',
  'fastener',
  'gear-cover',
  'chassis-unit',
  'none'
] as const

/** Tri-state: we never claim a rule we have not actually checked. */
const legality = z.enum(['legal', 'illegal', 'unknown'])

export type PartLegality = z.infer<typeof legality>

/** How a derived field got its value, so the report can audit coverage. */
const provenance = z.enum(['scraped', 'derived', 'override'])

export const partNames = z.object({
  ja: z.string(),
  en: z.string().optional(),
  /** Imported from tamiya.hk's Store API short_description. */
  'zh-HK': z.string().optional(),
  /**
   * Hand-authored later. Which of the two Traditional Chinese variants is tried
   * first is the reader's wording preference, not the locale — see
   * `resolveName` in ./names.ts, which owns the fallback order.
   */
  'zh-TW': z.string().optional()
})

/** Which source each name came from, for the attribution page. */
export const nameSources = z.record(z.string(), z.string())

export const partSpecs = z.object({
  rollerDiameterMm: z.number().optional(),
  rollerType: z.enum(['plastic', 'aluminium', 'bearing', 'other']).optional(),
  plateThicknessMm: z.number().optional(),
  plateMaterial: z.enum(['frp', 'carbon', 'aluminium', 'other']).optional(),
  /**
   * Rollers each side on this plate, where the plate is the one placing them:
   * a double-roller stay's 2, a plain wide stay's 1 (§5.6). Absent means the
   * part does not place them, and the chassis' own posts do.
   */
  rollersPerSide: z.number().optional(),
  gearRatio: z.string().optional(),
  motorShaft: z.enum(['single', 'double']).optional(),
  motorRpmMin: z.number().optional(),
  motorRpmMax: z.number().optional(),
  motorTorqueMin: z.number().optional(),
  motorTorqueMax: z.number().optional(),
  wheelDiameterMm: z.number().optional(),
  tireDiameterMm: z.number().optional(),
  tireHardness: z.string().optional(),
  weightG: z.number().optional(),
  pieces: z.number().optional()
})

/** The mouldings of a kit that can be clear plastic: its body and its chassis'. */
export const KIT_CLEAR = ['body', 'chassis', 'aParts'] as const
export type KitClear = typeof KIT_CLEAR[number]

/** What a part can be made of where that is the product, not its kind's moulding (see `finish`). */
export const PART_FINISHES = ['plated', 'matte-plated', 'aluminium', 'carbon'] as const
export type PartFinish = (typeof PART_FINISHES)[number]

/** A flat sRGB colour, `#rrggbb`. */
const hex = z.string().regex(/^#[0-9a-f]{6}$/)

/**
 * The colour a part is drawn in (docs/PLAN.md §5.6): what a reader would call
 * it — "the blue rollers", "the gold nut" — not a measured swatch. `primary`
 * is the part itself; `tire` is the second component a wheel-and-tire set
 * carries, since one set fills both slots. `derived` means it was read from
 * the part's name, its wiki variant or its material; `override` that it was
 * set by looking at the product photo in data/overrides/parts.yml.
 *
 * A motor is the exception to "one colour": every Mini 4WD motor is the same
 * can in one of two shaft layouts, and what tells two apart is the end bell
 * (`primary`) and the sticker on the can's flat top — a Japan Cup edition is
 * its base motor with a new sticker. `sticker` is absent on a bare can
 * (AO-1001), and `can` only where the can is not plated steel.
 */
export const partColours = z.object({
  primary: hex,
  tire: hex.optional(),
  sticker: hex.optional(),
  can: hex.optional(),
  /**
   * A body moulded in clear or smoked polycarbonate, which the pane draws
   * see-through even seated on the chassis. Only body parts carry it.
   */
  clear: z.literal(true).optional(),
  source: provenance
})

/**
 * Slot id -> the item numbers that fill it. The shape `loadout` has one layer
 * down, and named here for the same reason: it is a concept with consumers of
 * its own (scripts/catalog/generate.ts, the part page), and an inlined
 * `z.record` leaves each of them restating `Record<string, string[]>` by hand.
 *
 * Unlike a loadout entry this holds item numbers and nothing else — see
 * `contents` on `partSchema` for why it can hold nothing else.
 */
export const partContents = z.record(z.string(), z.array(z.string().regex(/^\d{4,5}$/)))

export const partSchema = z.object({
  /** Tamiya item number, e.g. "15549". The catalog's primary key. */
  id: z.string().regex(/^\d{4,5}$/),
  names: partNames,
  nameSources: nameSources.optional(),

  series: z.enum(PART_SERIES),
  /** GUP number printed on the box ("No.549"), regular GUP only. */
  gupNumber: z.number().optional(),
  /** Tamiya's own category label, kept verbatim for auditing our derivation. */
  seriesLabel: z.string().optional(),

  category: z.enum(PART_CATEGORIES),
  categorySource: provenance,
  subcategory: z.string().optional(),
  slots: z.array(z.enum(SLOTS)),
  /**
   * False for tools, setting gauges, stickers and cases. Only car parts get a
   * meaningful class legality, and only car parts appear in the builder.
   */
  isCarPart: z.boolean(),
  /**
   * True when the part goes with the thing its slot is named for rather than
   * being it — a roller O-ring, a spare pinion, a damper spring. It still fills
   * the slot; the picker lists it after the rest. Written only when true.
   */
  isAddOn: z.boolean().optional(),

  /**
   * What a parts set puts on the car: slot **id** -> the item numbers that go
   * in that row. Only the `bundle` category carries one, and the set's own
   * `slots` are read back off these keys by scripts/catalog/generate.ts, so the
   * two can never disagree about where a set is offered.
   *
   * Item numbers and nothing else, because that is all a build can hold: a slot
   * in `BuildState.swaps` is a list of them, with nowhere to put a loose piece
   * that has no product behind it. Where a piece has no separate SKU — the
   * chassis-specific FRP plates, the set's own coloured 13mm rollers — the
   * set's own item number stands in that row, because the set is what you buy
   * to get that piece. Only the pieces Tamiya's own contents sentence names as
   * a product become a different item number (data/overrides/parts.yml).
   */
  contents: partContents.optional(),

  chassisCompat: z.object({
    /**
     * Chassis Tamiya lists for this part. An EMPTY list means the part is not
     * chassis-specific (washers, spacers, AO spares) and the builder should
     * offer it everywhere — it never means "unknown".
     */
    include: z.array(z.enum(CHASSIS_IDS)),
    /** Chassis Tamiya lists that are out of v1 scope (super1, tz, x...). */
    other: z.array(z.string()).default([]),
    source: provenance
  }),

  classLegality: z.object({
    open: legality,
    stockBmax: legality,
    junior: legality,
    source: provenance,
    notes: z.string().optional()
  }),

  specs: partSpecs.default({}),
  colours: partColours.optional(),

  priceJpy: z.number().optional(),
  priceJpyExTax: z.number().optional(),
  priceHkd: z.number().optional(),
  /** ISO date, or YYYY-MM when Tamiya only gives a month. */
  releaseDate: z.string().optional(),
  releaseDateRaw: z.string().optional(),
  status: z.enum(['current', 'limited', 'discontinued', 'unknown']),

  /**
   * Link-outs, stored as facts. `officialImage` is Tamiya's full-size photo and
   * is never rendered — what the site shows is `thumbnail`, our own 160x120
   * downscale of it under public/thumbs (docs/PLAN.md §6 M1b). Absent when
   * Tamiya publishes no photo or the fetch failed, and the UI falls back to the
   * slot icon.
   */
  officialUrl: z.string(),
  officialImage: z.string().optional(),
  thumbnail: z.string().optional(),
  /**
   * The 320x240 copy of the same photo, which only a part page renders — a row
   * thumbnail leading a detail page is a postage stamp. Absent where Tamiya's
   * own photo was too small to make one without enlarging it, and the page
   * falls back to `thumbnail` (scripts/catalog/thumbs.ts).
   */
  detailThumbnail: z.string().optional(),
  hkStoreUrl: z.string().optional(),
  /**
   * The Mini 4WD Fandom article covering this part's product family, e.g.
   * "Aluminum Ball-Race Roller" for all thirteen of its colours. The title, not
   * the URL: `fandomArticleUrl` in ./kits.ts builds the link, and a stored URL
   * would be the same string with 38 bytes of prefix on every record.
   *
   * The only field any part takes from `data/raw/fandom-parts.json`, which is
   * otherwise a cross-check the catalog never imports (scripts/catalog/
   * crossref.ts). It earns the exception the same way a kit's
   * `loadoutSourceTitle` does: the link *is* the CC-BY-SA attribution, and no
   * other source groups item numbers into families at all. Present on 121 of
   * 382 parts — the wiki covers Grade-Up Parts, not the AO spares range.
   */
  fandomTitle: z.string().optional(),
  /**
   * The shell a body part draws in the 3D pane, for the clear and spare body
   * sets: the id of a data/bodies file, set there under `parts`.
   */
  body: z.string().optional(),
  /**
   * The wheel and tire shapes this part draws in the 3D pane: keys of `WHEELS`
   * and `TIRES` in shared/scene/wheels.ts (§5.6). A wheel-and-tire set fills
   * four slots and carries both; a bare wheel or tire carries one.
   */
  wheel: z.string().optional(),
  tire: z.string().optional(),
  /**
   * The material the 3D pane shades this part in, where the material *is* the
   * product: a plated or aluminium wheel, a plated body, a carbon plate or
   * carbon wheel. Drawing one as its kind's moulding loses what the buyer paid
   * for. Read from the name by scripts/catalog/finish.ts, on wheels, bodies and
   * plates only, the parts the pane reads it on. Absent means the kind's own
   * moulding, which is what every wheel a kit ships is.
   */
  finish: z.enum(PART_FINISHES).optional(),
  /**
   * The row of shared/scene/fittings.ts this part draws as in the 3D pane: a
   * roller's, a plate's, a damper's, a brake's or a hidden fitting's (§5.6,
   * "The rest of the parts"), read from its name by scripts/catalog/
   * fittings.ts. Absent on a part that draws its socket's default.
   */
  fitting: z.string().optional(),

  /** Free-text 【基本スペック】 from Tamiya, kept for later spec parsing. */
  specsRaw: z.string().optional(),
  scrapedAt: z.string()
})

/**
 * One thing a runner or a kit puts in a slot before the user changes anything.
 *
 * `partId` is optional, and for most entries it is absent. What comes in the
 * box is largely molded into the kit — the wheels, the tires, the plastic
 * rollers, the terminal, the double-shaft normal motor — and Tamiya sells no
 * Grade-Up Part equivalent, so there is no item number to name. The builder
 * still has to show those slots as filled, and the shopping list still has to
 * leave them out, which is exactly what a `label` with no `partId` means:
 * you already own this, and you cannot buy it separately.
 */
/**
 * A label's own names, in whatever locales we have for it.
 *
 * Every key is optional, unlike `partNames` where `ja` is required, because a
 * label's locales depend on where it came from: a wiki-imported wheel phrase
 * has only `en`, a hand-authored chassis default has only Traditional Chinese.
 * `resolveLabel` in ./names.ts is the partial-tolerant reader that follows from
 * that, and it can return nothing.
 */
export const labelNames = partNames.partial()

export const loadoutEntry = z.object({
  partId: z.string().optional(),
  /** Shown when there is no catalog part to link to. */
  label: labelNames.refine(names => Object.values(names).some(Boolean), {
    message: 'needs at least one locale'
  }).optional(),
  /**
   * For a wheel or tire entry, which shape the 3D pane draws it as: a key of
   * `WHEELS` or `TIRES` in shared/scene/wheels.ts (§5.6).
   *
   * Only a chassis' `defaultLoadout` sets it. A kit says what it ships as a
   * phrase, and `shapeId` turns that phrase straight into the key, so storing
   * the slug beside the label would be the same string twice in every
   * visitor's payload; "Kit standard wheels" names no shape, which is what
   * this field is for and what the 13 kits no wiki row reaches fall back to.
   */
  shape: z.string().optional(),
  source: z.enum(['fandom', 'tamiya', 'chassis', 'override'])
}).refine(entry => entry.partId !== undefined || entry.label !== undefined, {
  message: 'needs a partId or a label'
})

/** Slot id (from data/taxonomy/slots.yml) -> what fills it. */
export const loadout = z.record(z.string(), z.array(loadoutEntry))

export const chassisSchema = z.object({
  id: z.enum(CHASSIS_IDS),
  names: partNames,
  /** Tamiya's genre_item code, e.g. "ma" in mini4wd_chassis_ma. */
  tamiyaCode: z.string(),
  family: z.enum(['pro', 'standard']),
  motorPosition: z.enum(['front', 'mid', 'rear']),
  motorShaft: z.enum(['single', 'double']),
  releaseYear: z.number(),
  kitGearRatio: z.string().optional(),
  wheelbaseMm: z.number().optional(),
  treadFrontMm: z.number().optional(),
  treadRearMm: z.number().optional(),
  weightG: z.number().optional(),
  status: z.enum(['current', 'rerelease', 'discontinued']),
  notes: z.string().optional(),
  /**
   * Rollers each side on this chassis' own rear posts, where it ships more
   * than one: AR and MA carry a roller above the stay and one under it, which
   * is the "six rollers" their notes claim. Written by `catalog:generate` from
   * the scene's layout table, the way a plate's count is written onto its part
   * record, because the build list prints it and cannot import that table
   * (shared/scene/sockets.ts). The front posts hold one on all eight.
   */
  rearRollersPerSide: z.number().optional(),
  /**
   * Our downscale of Tamiya's chassis photo. A chassis is not a catalogue item,
   * so the only place Tamiya pictures one is the chassis select page.
   */
  thumbnail: z.string().optional(),
  /** The 320x240 copy the chassis page leads with, as a part page does. */
  detailThumbnail: z.string().optional(),
  slots: z.array(z.object({
    id: z.string(),
    type: z.enum(SLOTS),
    maxCount: z.number(),
    mirror: z.boolean().default(false),
    /**
     * A build with this slot empty is not a runnable car, so the rule engine
     * reports an `error`. Not a seeding instruction — seeding reads
     * `defaultLoadout`. Authored in data/taxonomy/slots.yml.
     */
    required: z.boolean().default(false)
  })),
  /**
   * What the bare runner supplies, slot by slot. This is what seeds a build
   * started from a chassis rather than a kit, and it is the base a kit's
   * `stockLoadout` overlays (docs/PLAN.md §4.7). Hand-authored in
   * data/chassis/*.yml: Tamiya publishes no bill of materials for a runner.
   *
   * Unrelated to a slot's `required` flag — a runner fills optional slots too,
   * and leaves some required ones (the body) to the kit.
   */
  defaultLoadout: loadout.default({}),

  /** Item numbers Tamiya lists on this chassis' compat page (v1 scope only). */
  compatibleParts: z.array(z.string()).default([])
})

/**
 * A boxed kit: a chassis, a body and the loadout that differs from the bare
 * runner. One of the builder's two entry points (docs/PLAN.md §4.7).
 */
export const kitSchema = z.object({
  id: z.string().regex(/^\d{4,5}$/),
  names: partNames,
  nameSources: z.record(z.string(), z.string()).optional(),

  series: z.enum(KIT_SERIES),
  /**
   * The number printed on the box within its own line ("ミニ四駆PRO No.64").
   * Deliberately not `gupNumber`: the detail page prints both in the same
   * place, and reading a kit's series number as a Grade-Up Part number would
   * silently claim the kit is a part you can buy.
   */
  seriesNumber: z.number().optional(),
  seriesLabel: z.string().optional(),

  chassis: z.enum(CHASSIS_IDS),
  /** As shipped, which is not always the chassis' usual ratio. */
  gearRatio: z.string().optional(),

  /**
   * What this kit adds to or changes about its chassis' `defaultLoadout` —
   * the body always, plus whichever wheels, tires, gears or motor differ.
   * Stored as the delta rather than the merged result so that re-authoring a
   * chassis default does not require regenerating every kit that uses it.
   */
  stockLoadout: loadout.default({}),
  /**
   * Where the wheels, tires and motor came from. `chassis` means no wiki row
   * covers this kit and the runner's defaults stand for all three — the kit may
   * still carry a `gearRatio`, which Tamiya sometimes prints itself.
   */
  loadoutSource: z.enum(['fandom', 'chassis']),
  /**
   * Fandom article the loadout was read from. The wiki is CC-BY-SA, so a kit
   * page that uses it has to attribute on the page itself, not only on the
   * site-wide attribution page.
   */
  loadoutSourceTitle: z.string().optional(),
  /**
   * What the box's body, wheels and tires are moulded in, from the same wiki
   * row as the loadout (`Body color`, `Wheel color`, `Tire color`). The body
   * is its plastic, not its stickers: a "Clear" or "Smoke" special is drawn
   * clear or smoked. `scraped` from the wiki, `override` where
   * data/overrides/kits.yml corrects it or fills a kit the wiki has no row for.
   */
  colours: z.object({
    body: hex.optional(),
    wheel: hex.optional(),
    tire: hex.optional(),
    /** Only from data/overrides/kits.yml: the wiki has no roller colour field. */
    roller: hex.optional(),
    /**
     * The chassis as this box moulds it: the frame (`Chassis frame`, or an MS
     * chassis' centre unit), an MS chassis' nose and tail units where they
     * differ from its centre, and the A-parts sprue — gear covers, motor
     * cover, switch. Absent, the pane draws the chassis black.
     */
    chassis: hex.optional(),
    chassisEnds: hex.optional(),
    aParts: hex.optional(),
    /** Which of the mouldings above are clear or smoked plastic, drawn see-through. */
    clear: z.array(z.enum(KIT_CLEAR)).optional(),
    source: provenance
  }).optional(),
  /**
   * The shell the 3D pane draws for this kit: the id of a data/bodies file,
   * matched by the wiki article the loadout came from or listed there by item
   * number (docs/PLAN.md §5.6). Absent while the car has no silhouette.
   */
  body: z.string().optional(),
  /**
   * A body sold plated rather than painted, read from the kit's Japanese name
   * (メッキ; the English says "METALLIC", which Tamiya also uses for paint).
   * The pane draws it as coloured chrome in `colours.body`.
   */
  bodyFinish: z.enum(['plated', 'matte-plated']).optional(),

  priceJpy: z.number().optional(),
  priceJpyExTax: z.number().optional(),
  priceHkd: z.number().optional(),
  releaseDate: z.string().optional(),
  releaseDateRaw: z.string().optional(),
  status: z.enum(['current', 'limited', 'discontinued', 'unknown']),

  officialUrl: z.string(),
  officialImage: z.string().optional(),
  thumbnail: z.string().optional(),
  hkStoreUrl: z.string().optional(),

  specsRaw: z.string().optional(),
  scrapedAt: z.string()
})

/**
 * A body shell's shape (docs/PLAN.md §5.6), as shared/scene/generators/body.ts
 * draws it: rows rather than objects, because this is what ships to the
 * browser and the keys would be most of the bytes. Mirrors `Silhouette` there,
 * which cannot import Zod.
 */
const mm = z.number().finite()
const station = z.union([
  z.tuple([mm, mm, mm, mm, mm]),
  z.tuple([mm, mm, mm, mm, mm, mm, mm])
])
export const silhouetteSchema = z.object({
  hull: z.array(station).min(2)
    .refine(rows => rows.every((row, i) => i === 0 || row[0] > rows[i - 1]![0]), 'stations must run tail to nose')
    .refine(rows => rows.every(([, halfWidth, shoulder, halfDeck, deck, halfTop, height]) =>
      halfDeck <= halfWidth && shoulder <= deck && (halfTop === undefined || (halfTop <= halfDeck && height! >= deck))),
    'each station narrows and rises: deck inside the floor, shoulder under the deck, cabin inside and on top of the deck'),
  arches: z.union([mm.nonnegative(), z.tuple([mm.nonnegative(), mm.nonnegative()])]).optional(),
  pods: z.array(z.object({
    x: mm,
    stations: z.array(z.tuple([mm, mm, mm, mm])).min(2)
      .refine(rows => rows.every((row, i) => i === 0 || row[0] > rows[i - 1]![0]), 'pod stations must run tail to nose')
  }).strict()).optional(),
  wing: z.object({ z: mm, halfWidth: mm, height: mm, chord: mm, pylons: mm.optional() }).strict().optional()
}).strict()

/**
 * An authored body, data/bodies/<id>.yml: the silhouette plus which kits and
 * parts draw it. A kit is matched by `titles` (the wiki article its loadout
 * came from) unless some body lists it under `kits`, which is also how the
 * kits no article covers are reached. `reference` is the kit whose box art the
 * numbers were read from.
 */
export const bodySchema = silhouetteSchema.extend({
  name: z.string(),
  reference: z.string().regex(/^\d{4,5}$/),
  titles: z.array(z.string()).default([]),
  kits: z.array(z.string().regex(/^\d{4,5}$/)).default([]),
  parts: z.array(z.string()).default([])
}).strict()

export type Part = z.infer<typeof partSchema>
export type PartSpecs = z.infer<typeof partSpecs>
export type PartColours = z.infer<typeof partColours>
export type Chassis = z.infer<typeof chassisSchema>
export type Kit = z.infer<typeof kitSchema>
export type Loadout = z.infer<typeof loadout>
export type PartContents = z.infer<typeof partContents>
export type LoadoutEntry = z.infer<typeof loadoutEntry>
export type LabelNames = z.infer<typeof labelNames>
export type PartCategory = Part['category']
export type Slot = Part['slots'][number]
export type BodySource = z.infer<typeof bodySchema>

/**
 * A hand-authored entry in one of the data/overrides files. Typed against the
 * real record so a mistyped override field is a compile error rather than a
 * value Zod silently strips at generate time.
 */
export type Override<T> = {
  [K in keyof T]?: T[K] extends object ? Partial<T[K]> : T[K]
}

export type PartOverride = Override<Part>
export type KitOverride = Override<Kit>
