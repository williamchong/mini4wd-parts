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
 */
import { isChassisCompatible, isShaftCompatible } from './build.ts'
import type { BuildableChassis, BuildablePart, BuildClass, ResolvedSlot } from './build.ts'

export type Severity = 'error' | 'warning' | 'note'

export type RuleId =
  | 'required-empty'
  | 'chassis-incompatible'
  | 'motor-shaft'
  | 'class-illegal'
  | 'class-unknown'
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
  partsById: ReadonlyMap<string, Pick<BuildablePart, 'chassisCompat' | 'classLegality' | 'specs'>>
  buildClass: BuildClass
  /** The link this build was opened from lost a kit, a slot or a part on the way in. */
  linkTrimmed?: boolean
}

const RANK: Record<Severity, number> = { error: 0, warning: 1, note: 2 }

/**
 * Errors first, then warnings, then notes; within a severity, the order of the
 * build list, so the summary reads top to bottom like the rows it points at.
 */
export function checkBuild({ slots, chassis, partsById, buildClass, linkTrimmed }: BuildCheck): Finding[] {
  const findings: Finding[] = []
  if (linkTrimmed) findings.push({ rule: 'link-trimmed', severity: 'note' })

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
