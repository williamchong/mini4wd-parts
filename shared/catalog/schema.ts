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
  'shaft',
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

/** How a derived field got its value, so the report can audit coverage. */
const provenance = z.enum(['scraped', 'derived', 'override'])

export const partNames = z.object({
  ja: z.string(),
  en: z.string().optional(),
  /** Imported from tamiya.hk's Store API short_description. */
  'zh-HK': z.string().optional(),
  /** Hand-authored later; renderers fall back zh-TW -> zh-HK -> en -> ja. */
  'zh-TW': z.string().optional()
})

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
  /** Which locale each TC name came from, for the attribution page. */
  nameSources: z.record(z.string(), z.string()).optional(),

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
    required: z.boolean().default(false)
  })),
  /** Item numbers Tamiya lists on this chassis' compat page (v1 scope only). */
  compatibleParts: z.array(z.string()).default([])
})

export type Part = z.infer<typeof partSchema>
export type PartSpecs = z.infer<typeof partSpecs>
export type Chassis = z.infer<typeof chassisSchema>
export type PartCategory = Part['category']
export type Slot = Part['slots'][number]

/**
 * A hand-authored entry in data/overrides/parts.yml. Typed against the real
 * record so a mistyped override field is a compile error rather than a value
 * Zod silently strips at generate time.
 */
export type PartOverride = {
  [K in keyof Part]?: Part[K] extends object ? Partial<Part[K]> : Part[K]
}
