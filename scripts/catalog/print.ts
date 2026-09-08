/** Console formatting shared by the report and cross-reference stages. */

export const section = (title: string) => console.log(`\n${title}\n${'-'.repeat(title.length)}`)

/** A counted list, truncated so one noisy category cannot bury the rest. */
export function list(label: string, items: string[], limit = 12) {
  console.log(`${label}: ${items.length}`)
  for (const item of items.slice(0, limit)) console.log(`    ${item}`)
  if (items.length > limit) console.log(`    … ${items.length - limit} more`)
}
