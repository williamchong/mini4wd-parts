import type { Finding } from '#shared/catalog/rules'

/**
 * What colour a rule-engine finding wears.
 *
 * The map is here rather than at the two call sites (the findings list and the
 * slot row that repeats the same finding) so a severity cannot end up one
 * colour in the list and another on the row it points at. `note` is neutral on
 * purpose: it is the engine saying something true, not something wrong.
 */
const SEVERITY_COLOR = {
  error: 'error',
  warning: 'warning',
  note: 'neutral'
} as const satisfies Record<Finding['severity'], string>

export const severityColor = (severity: Finding['severity']) => SEVERITY_COLOR[severity]
