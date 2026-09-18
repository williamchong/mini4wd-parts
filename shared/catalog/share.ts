/**
 * A build as the text after `#` in a link, so a reload keeps it and a copied
 * link shares it (docs/PLAN.md §6 M1b).
 *
 * Packed bytes, base64url, because a link is pasted into chats rather than
 * read: a kit with five swaps is 40 characters.
 *
 *   byte 0      format version, 1
 *   byte 1      chassis, as an index into SHARE_CHASSIS
 *   bytes 2–4   kit item number, uint24, 0 for none
 *   then, per swap:
 *     1 byte    slot id, as an index into SHARE_SLOTS
 *     1 byte    part count, 0 for a slot the user emptied
 *     3 bytes   each part's item number, uint24
 *
 * Item numbers are stored as numbers: every id in the catalog is a five-digit
 * Tamiya item number, and a uint24 holds eight digits.
 *
 * Two steps, kept apart on purpose. `parseBuild` is syntax only and needs no
 * catalog; `reconcileBuild` checks what the link names against the catalog the
 * page actually shipped, which is the only place a link from an older catalog
 * or a hand-edited one can be caught.
 */
import type { BuildableChassis, BuildState } from './build.ts'
import type { ChassisId, Kit, Part } from './schema.ts'

const VERSION = 1

/**
 * **Append only.** A link stores positions in these lists, so reordering or
 * removing an entry silently re-points every link already shared. share.test.ts
 * pins the positions with a literal encoded link and checks both lists cover
 * the catalog. Not imported from schema.ts, which would pull Zod into the page.
 */
export const SHARE_CHASSIS: readonly ChassisId[] = ['ma', 'ms', 'me', 'ar', 'fm-a', 'vz', 'super-2', 'vs']

/** **Append only**, like SHARE_CHASSIS. The ids of data/taxonomy/slots.yml. */
export const SHARE_SLOTS: readonly string[] = [
  'body', 'motor', 'gear-set', 'counter-gear', 'propeller-shaft', 'terminal', 'switch',
  'axle', 'bearing', 'wheel-front', 'wheel-rear', 'tire-front', 'tire-rear', 'front-stay',
  'rear-stay', 'side-stay', 'roller-front', 'roller-rear', 'roller-side', 'brake', 'damper',
  'fastener', 'gear-cover', 'chassis-unit'
]

const MAX_ID = 0xFFFFFF

/** A parsed link, before anything in it has been checked against the catalog. */
export type SharedBuild = {
  chassis: ChassisId
  kit?: string
  swaps: Record<string, string[]>
}

// No leading zero: `00000` would pack as 0, which means "no kit", and could
// not come back out as the same string.
const toNumber = (id: string) => /^[1-9]\d{0,7}$/.test(id) && Number(id) <= MAX_ID ? Number(id) : undefined

function toBase64Url(bytes: number[]): string {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

/**
 * Anything the format cannot hold — a chassis or slot missing from the
 * tables, an id that is not a number — is left out rather than thrown on: this
 * runs in a watcher on every change, and the test that keeps the tables
 * complete is where to fail. An unencodable chassis is the empty string, which
 * is no link at all.
 */
export function encodeBuild(state: BuildState): string {
  const chassis = SHARE_CHASSIS.indexOf(state.chassis)
  if (chassis < 0) return ''
  const bytes = [VERSION, chassis]
  const push24 = (n: number) => bytes.push(n >> 16, (n >> 8) & 0xFF, n & 0xFF)
  push24(state.kit ? toNumber(state.kit) ?? 0 : 0)

  for (const [slotId, partIds] of Object.entries(state.swaps)) {
    const slot = SHARE_SLOTS.indexOf(slotId)
    const ids = partIds.map(toNumber)
    if (slot < 0 || ids.length > 0xFF || ids.some(n => n === undefined)) continue
    bytes.push(slot, ids.length)
    for (const id of ids) push24(id!)
  }
  return toBase64Url(bytes)
}

/**
 * Undefined for anything that is not a build this format can read — an empty
 * hash, a heading anchor, a truncated link. Never throws: the hash is input
 * from whoever sent the link. A slot index past the end of SHARE_SLOTS is skipped
 * rather than failing the whole link.
 */
export function parseBuild(hash: string): SharedBuild | undefined {
  const text = hash.startsWith('#') ? hash.slice(1) : hash
  if (!/^[\w-]+$/.test(text)) return undefined
  let raw: string
  try {
    raw = atob(text.replaceAll('-', '+').replaceAll('_', '/'))
  } catch {
    return undefined
  }
  const bytes = Array.from(raw, c => c.charCodeAt(0))
  let at = 0
  const read24 = () => (bytes[at++]! << 16) | (bytes[at++]! << 8) | bytes[at++]!

  if (bytes.length < 5 || bytes[at++] !== VERSION) return undefined
  const chassis = SHARE_CHASSIS[bytes[at++]!]
  if (!chassis) return undefined
  const kit = read24()

  const swaps: Record<string, string[]> = {}
  while (at < bytes.length) {
    if (at + 2 > bytes.length) return undefined
    const slotId = SHARE_SLOTS[bytes[at++]!]
    const count = bytes[at++]!
    if (at + count * 3 > bytes.length) return undefined
    const partIds = Array.from({ length: count }, () => String(read24()))
    if (slotId) swaps[slotId] = partIds
  }

  return { chassis, kit: kit ? String(kit) : undefined, swaps }
}

export type ShareCatalog = {
  chassis: ReadonlyArray<Pick<BuildableChassis, 'id' | 'slots'>>
  kits: ReadonlyArray<Pick<Kit, 'id' | 'chassis'>>
  partsById: ReadonlyMap<string, Pick<Part, 'slots'>>
}

/**
 * The build a link describes, as far as this catalog can honour it, or
 * undefined when it names no chassis we ship.
 *
 * - An unknown kit is dropped, so a link from an older catalog opens as the
 *   bare chassis rather than carrying a dead id into every re-share.
 * - A known kit's own chassis wins over the link's: `ma` with a VZ kit is
 *   representable and wrong, and no UI path produces it. Swaps made for the
 *   other chassis are cleared rather than guessed at.
 * - A swap is dropped when its slot is not on the chassis; a part when it is
 *   not in the catalog or does not declare the slot's type; the rest is cut to
 *   the slot's `maxCount`. These are structural, like `resolveBuild` dropping
 *   an unknown loadout key.
 * - Chassis *compatibility* is deliberately not filtered. A build arriving by
 *   link was not assembled in the picker, and saying so is the rule engine's
 *   job (§6 M1b) — filtering it here would hide exactly that case.
 */
export function reconcileBuild(shared: SharedBuild, catalog: ShareCatalog): BuildState | undefined {
  const kit = shared.kit ? catalog.kits.find(k => k.id === shared.kit) : undefined
  const chassisId = kit?.chassis ?? shared.chassis
  const chassis = catalog.chassis.find(c => c.id === chassisId)
  if (!chassis) return undefined

  const swaps: Record<string, string[]> = {}
  if (chassis.id === shared.chassis) {
    for (const [slotId, partIds] of Object.entries(shared.swaps)) {
      const slot = chassis.slots.find(s => s.id === slotId)
      if (!slot) continue
      const kept = partIds
        .filter(id => catalog.partsById.get(id)?.slots.includes(slot.type))
        .slice(0, slot.maxCount)
      // An emptied slot is a choice the link states. A slot whose every part
      // was dropped is not: it falls back to stock rather than reading as one.
      if (kept.length || !partIds.length) swaps[slotId] = kept
    }
  }

  return { chassis: chassis.id, kit: kit?.id, swaps }
}

/**
 * Whether `reconcileBuild` lost anything the link named: its kit, its chassis,
 * a slot, or a part. Compared after the fact rather than tracked inside it, so
 * the reconciler stays one job and this cannot disagree with what it did.
 */
export function wasTrimmed(shared: SharedBuild, state: BuildState): boolean {
  if (shared.chassis !== state.chassis || shared.kit !== state.kit) return true
  const sharedSlots = Object.entries(shared.swaps)
  return sharedSlots.length !== Object.keys(state.swaps).length
    || sharedSlots.some(([slotId, partIds]) => partIds.length !== state.swaps[slotId]?.length)
}
