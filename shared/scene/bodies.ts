/**
 * Body silhouettes by kit (docs/PLAN.md §5.6): the numbers a shell is lofted
 * from, authored by looking at the kit's box art, plus the colours the kit's
 * body, wheels and rollers come in. Kits that share a body (recolours, chassis
 * re-releases) share an entry.
 *
 * A TypeScript constant for now, like the socket table, while the station
 * format is still being judged against the first few shells. Once it settles
 * the table moves under data/, keyed by a body id a kit names through
 * data/overrides/kits.yml, so the rest of the 305 can be authored as data.
 */
import type { Silhouette } from './generators/body.ts'

/** A plain wedge for a kit with no entry yet, and for a body from the parts catalog. */
export const DEFAULT_SILHOUETTE: Silhouette = {
  colour: 0xd8dbe0,
  hull: [
    { z: -64, halfWidth: 36, shoulder: 6, halfDeck: 30, deck: 12 },
    { z: -30, halfWidth: 37, shoulder: 8, halfDeck: 30, deck: 16, halfTop: 16, height: 25 },
    { z: 0, halfWidth: 36, shoulder: 8, halfDeck: 30, deck: 15, halfTop: 14, height: 24 },
    { z: 30, halfWidth: 33, shoulder: 6, halfDeck: 26, deck: 12 },
    { z: 64, halfWidth: 22, shoulder: 3, halfDeck: 16, deck: 5 }
  ]
}

const SILHOUETTES: Record<string, Silhouette> = {
  // Blast Arrow (MA, 2013): a Le Mans prototype. Two front fender pods with
  // headlights either side of a low pointed nose, a bubble cabin behind the
  // middle with an intake hump behind it, rear fenders over the wheels, and a
  // wide rear wing on two pylons. White with blue and red on the box; white
  // fin wheels, blue plastic rollers.
  '18635': {
    colour: 0xf1f2f4,
    wheelColour: 0xe4e6e9,
    rollerColour: 0x3d63d8,
    hull: [
      { z: -70, halfWidth: 37, shoulder: 5, halfDeck: 30, deck: 11 },
      { z: -56, halfWidth: 38, shoulder: 7, halfDeck: 30, deck: 14 },
      { z: -40, halfWidth: 38, shoulder: 8, halfDeck: 28, deck: 16, halfTop: 9, height: 22 },
      { z: -26, halfWidth: 36, shoulder: 8, halfDeck: 24, deck: 16, halfTop: 11, height: 28 },
      { z: -12, halfWidth: 32, shoulder: 7, halfDeck: 20, deck: 15, halfTop: 12, height: 29 },
      { z: 4, halfWidth: 26, shoulder: 6, halfDeck: 17, deck: 13, halfTop: 11, height: 22 },
      { z: 20, halfWidth: 20, shoulder: 5, halfDeck: 14, deck: 11 },
      { z: 44, halfWidth: 14, shoulder: 4, halfDeck: 9, deck: 8 },
      { z: 68, halfWidth: 6, shoulder: 2, halfDeck: 3, deck: 4 }
    ],
    pods: {
      x: 29,
      stations: [
        { z: 14, halfWidth: 7, top: 10, bottom: 2 },
        { z: 26, halfWidth: 9, top: 15, bottom: 1 },
        { z: 40, halfWidth: 9, top: 16, bottom: 1 },
        { z: 54, halfWidth: 8, top: 13, bottom: 2 },
        { z: 64, halfWidth: 5, top: 7, bottom: 4 }
      ]
    },
    wing: { z: -64, halfWidth: 34, height: 32, chord: 12, pylons: 14 }
  }
}

export function silhouetteFor(kit: string | null | undefined): Silhouette {
  return (kit && SILHOUETTES[kit]) || DEFAULT_SILHOUETTE
}

/** The id the geometry cache keys a shell by. */
export function silhouetteId(kit: string | null | undefined): string {
  return silhouetteFor(kit) === DEFAULT_SILHOUETTE ? 'default' : kit!
}
