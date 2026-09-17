# Body shells

One file per car (docs/PLAN.md §5.6). A shell is a few dozen numbers that
`shared/scene/generators/body.ts` lofts into the shape the 3D pane draws over
the chassis, so a reader who owns that box recognises the car. It is not a
model of it: no surface detail, no decals, no mould features, and one colour —
the kit record's, not this file's.

`npm run catalog:generate` writes each file to `content/bodies/<id>.json` and
puts the id on every kit and body part that draws it; the pane fetches that one
file when a kit is chosen.

## Writing one

1. **Find the car.** `npm run catalog:bodies -- --todo` lists every car still on
   the default wedge, in authoring order, with its kits, chassis and the size
   Tamiya prints.
2. **Look at the box art.** `npm run catalog:bodies -- --art=18640` fetches the
   full-size photo to `.cache/bodies/art/<kit>.jpg`. Pick a reference kit whose
   photo shows the built car, not a boxed one.
3. **Write `<id>.yml`** (see the fields below), named after the car in kebab
   case.
4. **Render it:** `npm run catalog:bodies -- --only=<id>` writes
   `.cache/bodies/render/<id>.png` — the box art, a three-quarter view from the
   angle Tamiya shoots from, a side view and a top view, all on the reference
   kit's chassis in its colours.
5. **Correct once, then stop.** The target is recognition, not accuracy.
6. `npm run catalog:generate && npm run catalog:verify`.

## The frame

Millimetres, and the same frame the chassis is drawn in:

- **`z`** runs along the car, nose positive. The axles are at `z = ±40` and the
  chassis reaches about `±80`; a body is usually `-65 … +68`.
- **`x`** is half-width from the centre line. Wheels sit at about `x = ±30`
  (their inner faces near `±25`), and the regulation limit is `±52.5`. A body
  that covers its wheels is about 36 wide; one that runs between them, as most
  classic cars do, is 20–26.
- **heights** are above the body's floor, which sits 14 mm above the ground.
  **So a car whose 全高 is 43 has its roof at 29 here** — the render prints
  both, and `catalog:verify` fails a shell more than 10 mm out.

## Fields

```yaml
name: Raikiri            # the car, as the wiki titles it
reference: '18640'       # the kit whose box art this was read from
titles: [Raikiri]        # wiki articles whose kits draw this shell
kits: ['95691']          # kits to attach by item number: those no article
                         # covers, and those whose article covers two shells
parts: ['15515']         # body parts (clear body sets) that are this car
hull:                    # sections, tail to nose, each:
  # z, halfWidth, shoulder, halfDeck, deck[, halfTop, height]
  - [-64, 30, 10, 24, 16]
  - [-12, 37, 12, 30, 20, 20, 29]
  - [68, 20, 4, 15, 7]
arches: 16               # radius of the wheel cut-out, or [front, rear], or
                         # omitted where the body runs between the wheels
pods:                    # separate lofts at x = ±x, mirrored: fender pods,
  - x: 29                # nose fins, rear fins
    stations:            # z, halfWidth, top, bottom
      - [14, 7, 10, 2]
      - [40, 9, 16, 1]
wing: { z: -54, halfWidth: 24, height: 31, chord: 12, pylons: 14 }
```

A **hull section** is eight corners: the floor at `halfWidth`, the flank up to
`shoulder`, the deck (`halfDeck` wide, `deck` high), and a cabin on top of it
(`halfTop`, `height`). Leave the last two off where there is no cabin — a nose,
a tail, a flat bed — and the deck is the top there. Six to ten sections is
plenty: put them where the shape changes, not at even spacing.

A **wing** with `pylons` stands on two posts; without, its end plates reach
down to the deck, which is how a tail flap sits on a tail.

## Rules

- Do not put colours here. Kits carry their own (`data/overrides/kits.yml`).
- A recolour, a re-release or the same car on another chassis is the same
  shell: add its article to `titles` or its item number to `kits`, do not copy
  the file. Split only when the two really differ.
- Sections run tail to nose, each narrowing upward (`halfDeck ≤ halfWidth`,
  cabin inside the deck). `catalog:verify` enforces that, the regulation
  envelope, and the printed size.
