/**
 * Reading catalog records back out of @nuxt/content.
 *
 * A collection overwrites each record's own `id` with the source file path
 * ("parts/parts/15549.yml"), so after a query the Tamiya item number — the key
 * that every loadout `partId`, every `compatibleParts` entry and every
 * data/overrides file is keyed by — is no longer on `.id`. It survives on
 * `stem`, as "<collection>/<item number>".
 *
 * Rather than teach the rest of the app about `stem`, records are put back into
 * their catalog shape at the point they are loaded, so everything downstream —
 * and every pure function in shared/catalog/build.ts — sees the schema type it
 * expects.
 */

export const itemId = (doc: { stem: string, id: string }): string =>
  doc.stem.split('/').pop() ?? doc.id

/**
 * `stem` is dropped once its item number has been taken: keeping it would ship
 * "parts/15549" alongside "15549" in every prerendered payload, and the return
 * type never claimed to carry it.
 *
 * The cast is the boundary: `id` is narrower than `string` on some records
 * (a chassis' is a `ChassisId`), and only the file layout guarantees the stem
 * carries a valid one. `catalog:verify` is what actually checks that.
 */
export const fromContent = <T extends { id: string }>(doc: T & { stem: string }): T => {
  const { stem: _stem, ...rest } = doc
  return { ...rest, id: itemId(doc) } as T
}
