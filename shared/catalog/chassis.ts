/**
 * The chassis list, and the order everything shows it in.
 *
 * Its own module, free of Zod, for the reason `share.ts` already documents:
 * importing a *value* from `schema.ts` drags Zod into whatever imports it, and
 * in a page component that is 60 KB of validator shipped to a reader who wanted
 * to sort eight chips. `schema.ts` imports from here and re-exports, so nothing
 * that legitimately wants the schema has to know this file exists.
 */

/** Chassis we model in v1. See docs/PLAN.md §2.2. */
export const CHASSIS_IDS = [
  'ma', 'ms', 'me', 'ar', 'fm-a', 'vz', 'super-2', 'vs'
] as const

export type ChassisId = (typeof CHASSIS_IDS)[number]

export const isChassisId = (value: string): value is ChassisId =>
  CHASSIS_IDS.includes(value as ChassisId)

/**
 * Newest family first, roughly, which is the order the builder's chip row, the
 * chassis index and every filter already used by hand. Stated once so the three
 * cannot drift apart.
 */
export const byChassisOrder = <T extends { id: ChassisId }>(a: T, b: T) =>
  CHASSIS_IDS.indexOf(a.id) - CHASSIS_IDS.indexOf(b.id)
