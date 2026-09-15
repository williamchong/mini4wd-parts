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
import type { Chassis, Kit, Part } from '#shared/catalog/schema'

export const itemId = (doc: { stem: string, id: string }): string =>
  doc.stem.split('/').pop() ?? doc.id

type CatalogRecords = { parts: Part, chassis: Chassis, kits: Kit }

/** The schema's own type, narrowed to whichever columns the query selected. */
type Selected<C extends keyof CatalogRecords, T> =
  Pick<CatalogRecords[C], Exclude<keyof T, 'stem'> & keyof CatalogRecords[C]>

/**
 * `stem` is dropped once its item number has been taken: keeping it would ship
 * "parts/15549" alongside "15549" in every prerendered payload, and the return
 * type never claimed to carry it.
 *
 * The cast is the boundary, and it corrects two things. `id` is narrower than
 * `string` on some records (a chassis' is a `ChassisId`), and only the file
 * layout guarantees the stem carries a valid one. And @nuxt/content types a
 * collection from its schema's *input*, where every `.default()` field is
 * optional — a slot's `mirror`, a kit's `stockLoadout` — while shared/ expects
 * the output. The generator writes every default out explicitly, so the output
 * is what is on disk. `catalog:verify` is what actually checks both.
 *
 * The collection name exists only to pick that output type.
 */
export const fromContent = <C extends keyof CatalogRecords>(_collection: C) =>
  <T extends { id: string, stem: string }>(doc: T): Selected<C, T> => {
    const { stem: _stem, ...rest } = doc
    return { ...rest, id: itemId(doc) } as unknown as Selected<C, T>
  }
