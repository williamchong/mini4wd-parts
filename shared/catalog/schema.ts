import { z } from 'zod'

/**
 * Catalog schemas, shared by `content.config.ts` (build-time validation of the
 * committed YAML) and `scripts/catalog/generate.ts` (validation before writing).
 * Keeping one definition is the point: a field the generator emits but the
 * collection rejects would only surface as a broken `nuxt generate`.
 *
 * Field shape follows docs/PLAN.md §4.2. Fields we cannot fill from the first
 * scrape (3D models, wizard roles, own photos) are omitted rather than stubbed.
 */

/** Chassis we model in v1. See docs/PLAN.md §2.2. */
export const CHASSIS_IDS = [
  'ma', 'ms', 'me', 'ar', 'fm-a', 'vz', 'super-2', 'vs'
] as const

export type ChassisId = (typeof CHASSIS_IDS)[number]

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

  priceJpy: z.number().optional(),
  priceJpyExTax: z.number().optional(),
  priceHkd: z.number().optional(),
  /** ISO date, or YYYY-MM when Tamiya only gives a month. */
  releaseDate: z.string().optional(),
  releaseDateRaw: z.string().optional(),
  status: z.enum(['current', 'limited', 'discontinued', 'unknown']),

  /** Link-outs. We store URLs as facts; no Tamiya image is re-hosted. */
  officialUrl: z.string(),
  officialImage: z.string().optional(),
  hkStoreUrl: z.string().optional(),

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

  priceJpy: z.number().optional(),
  priceJpyExTax: z.number().optional(),
  priceHkd: z.number().optional(),
  releaseDate: z.string().optional(),
  releaseDateRaw: z.string().optional(),
  status: z.enum(['current', 'limited', 'discontinued', 'unknown']),

  officialUrl: z.string(),
  officialImage: z.string().optional(),
  hkStoreUrl: z.string().optional(),

  specsRaw: z.string().optional(),
  scrapedAt: z.string()
})

export type Part = z.infer<typeof partSchema>
export type PartSpecs = z.infer<typeof partSpecs>
export type Chassis = z.infer<typeof chassisSchema>
export type Kit = z.infer<typeof kitSchema>
export type Loadout = z.infer<typeof loadout>
export type LoadoutEntry = z.infer<typeof loadoutEntry>
export type LabelNames = z.infer<typeof labelNames>
export type PartCategory = Part['category']
export type Slot = Part['slots'][number]

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
