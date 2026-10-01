/**
 * The rule engine: what is wrong with a build, or worth a second look
 * (docs/PLAN.md §4.3, §6 M1b).
 *
 * Functions rather than the declarative rules §4.3 describes. There are four
 * kinds of check, each needs part lookups a rule format would have to
 * reinvent, and the messages interpolate names resolved at render time — so a
 * finding carries ids and the page owns the words (`build.rules.*`). Rules as
 * data wait for the contribution workflow they were meant to serve (M4).
 *
 * It reads the same `ResolvedSlot[]` the build list renders, so a finding
 * always points at a row the reader can see, and imports only types from
 * schema.ts so no Zod reaches the page.
 *
 * Deliberately absent, because they could never fire or have no data yet:
 * slot capacity (the picker writes one part per swap and `reconcileBuild` cuts
 * a link to `maxCount`), and weight and overall size (no part records a
 * weight). The page lists those as not checked.
 *
 * Tire diameter left that list on 2026-09-18 (§5.6). Every wheel, tire and set
 * now records one, taken from the shape it draws, and `catalog:verify` fails
 * the build if any of them is outside the 22-35 mm envelope — so a rule here
 * could not fire on a build assembled from this catalog, and the page no
 * longer tells the reader it went unchecked.
 *
 * `body-tire-size` (2026-10-02, §4.3) is the one finding that is not a
 * verdict. A body that covers its wheels has arches cut to the tire it was
 * boxed with, and a large tire under arches cut for a small one usually
 * touches them until they are trimmed — usually, because nothing we hold
 * measures a clearance. So it is a note, it fires only for a body the catalog
 * marks `smallArches`, and its words say what the box shipped with rather
 * than that the tire will not fit.
 */
import { isChassisCompatible, isShaftCompatible } from './build.ts'
import type { BuildableChassis, BuildablePart, BuildClass, ResolvedEntry, ResolvedSlot } from './build.ts'
import type { Kit } from './schema.ts'

export type Severity = 'error' | 'warning' | 'note'

export type RuleId =
  | 'required-empty'
  | 'chassis-incompatible'
  | 'motor-shaft'
  | 'class-illegal'
  | 'class-unknown'
  | 'body-tire-size'
  | 'link-trimmed'

export type Finding = {
  rule: RuleId
  severity: Severity
  /** The row the finding is about; absent for one about the whole build. */
  slotId?: string
  partId?: string
}

export type BuildCheck = {
  slots: ResolvedSlot[]
  chassis: Pick<BuildableChassis, 'id' | 'motorShaft'>
  partsById: ReadonlyMap<string, Pick<BuildablePart, 'chassisCompat' | 'classLegality' | 'specs' | 'smallArches'>>
  /** The kit the build started from, whose body is on the car until the body row is swapped. */
  kit?: Pick<Kit, 'smallArches'>
  buildClass: BuildClass
  /** The link this build was opened from lost a kit, a slot or a part on the way in. */
  linkTrimmed?: boolean
}

const RANK: Record<Severity, number> = { error: 0, warning: 1, note: 2 }

/**
 * From here up a tire is large diameter (大径): Tamiya's ⌀30 and ⌀31, against
 * the ⌀24 and ⌀26 it calls small. Sizes are compared as these two classes, not
 * as millimetres, so a ⌀24 body on ⌀26 tires is not a jump.
 */
export const LARGE_TIRE_MM = 30

/**
 * Whether a tire-row entry is a large-diameter tire. A catalog part records
 * its diameter. A stock tire is a phrase or a chassis default's shape, and
 * both name the size in their first word (`Large Avante-Type Slick`,
 * `large-arched`); reading that word keeps the shape table, which says the
 * same in millimetres, in the 3D chunk and out of the page. rules.test.ts
 * holds the word to the table.
 */
export function isLargeTire(
  entry: Pick<ResolvedEntry, 'partId' | 'label' | 'shape'>,
  partsById: ReadonlyMap<string, Pick<BuildablePart, 'specs'>>
): boolean {
  if (entry.partId) return (partsById.get(entry.partId)?.specs.tireDiameterMm ?? 0) >= LARGE_TIRE_MM
  return /^large\b/i.test(entry.shape ?? entry.label?.en ?? '')
}

/** The tire rows, whose slot ids and slot types are the same two words. */
export const TIRE_SLOTS: ReadonlySet<ResolvedSlot['type']> = new Set(['tire-front', 'tire-rear'])

/**
 * Errors first, then warnings, then notes; within a severity, the order of the
 * build list, so the summary reads top to bottom like the rows it points at.
 */
export function checkBuild({ slots, chassis, partsById, kit, buildClass, linkTrimmed }: BuildCheck): Finding[] {
  const findings: Finding[] = []
  if (linkTrimmed) findings.push({ rule: 'link-trimmed', severity: 'note' })

  // Once for the car and on the body row, whichever end the large tires are
  // on: it is the body the reader may have to trim, and two notes saying so
  // would be one fact twice.
  const bodySlot = slots.find(slot => slot.type === 'body')
  const body = bodySlot?.entries[0]
  const smallArches = body?.partId
    ? partsById.get(body.partId)?.smallArches
    : body?.origin === 'kit' && kit?.smallArches
  if (bodySlot && smallArches && slots.some(slot =>
    TIRE_SLOTS.has(slot.type) && slot.entries.some(entry => isLargeTire(entry, partsById)))) {
    findings.push({ rule: 'body-tire-size', severity: 'note', slotId: bodySlot.id })
  }

  for (const slot of slots) {
    if (slot.required && !slot.entries.length) {
      // Every bare chassis starts without a body. It is not a raceable car, but
      // it is the normal place to start, and red there reads as a mistake.
      const severity = slot.type === 'body' ? 'warning' : 'error'
      findings.push({ rule: 'required-empty', severity, slotId: slot.id })
    }

    // One finding per part per row, however many of it the row holds.
    for (const partId of new Set(slot.entries.map(entry => entry.partId))) {
      const part = partId ? partsById.get(partId) : undefined
      if (!partId || !part) continue
      const at = { slotId: slot.id, partId }

      // The more specific reason wins: a single-shaft motor on a PRO chassis
      // is usually also missing from Tamiya's list for it, and two errors on
      // one row would say the same thing twice.
      if (!isShaftCompatible(part, slot.type, chassis)) {
        findings.push({ rule: 'motor-shaft', severity: 'error', ...at })
      }
      else if (!isChassisCompatible(part, chassis.id)) {
        findings.push({ rule: 'chassis-incompatible', severity: 'error', ...at })
      }

      const legality = part.classLegality[buildClass]
      if (legality === 'illegal') findings.push({ rule: 'class-illegal', severity: 'error', ...at })
      else if (legality === 'unknown') findings.push({ rule: 'class-unknown', severity: 'note', ...at })
    }
  }

  // Array.prototype.sort is stable, so the list order survives within a rank.
  return findings.sort((a, b) => RANK[a.severity] - RANK[b.severity])
}
