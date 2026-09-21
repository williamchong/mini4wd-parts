# Adopting @nuxt/ui

**Decided 2026-09-22 (owner):** the site moves onto `@nuxt/ui` v4, and new UI
prefers a Nuxt UI component over a hand-written one. This reverses the position
in §5.5 of `docs/PLAN.md`, which cited `@nuxt/ui` as a cost of `@tresjs/nuxt`
rather than a thing worth having on its own. The bytes below were measured
before starting and are accepted, not disputed.

## What it costs

Measured 2026-09-22 on a throwaway Nuxt 4.5.2 app, `@nuxt/ui` 4.11.1, `gzip -9`,
one `node_modules` shared by all three rows:

| Build | JS gz | CSS gz | Total gz | Δ |
|---|---:|---:|---:|---:|
| Plain Nuxt, hand-written button/panel/input | 54.8 KB | 1.0 KB | 55.8 KB | — |
| `@nuxt/ui` installed, **zero components used** | 77.4 KB | 25.8 KB | 103.2 KB | **+47.4 KB** |
| `@nuxt/ui`, `UButton` + `UModal` + `UInput` | 137.8 KB | 25.7 KB | 163.5 KB | **+107.7 KB** |

`node_modules` 192 MB → 327 MB (+135 MB, paid by every CI run in
`.github/workflows/deploy.yml`). Build 4.7 s → 7.0 s on a trivial app.

The floor in row 2 is the number that matters here, not row 3: Tailwind's
preflight and Nuxt UI's generated theme ship on **every** route whether the page
uses a component or not, and ~840 of this site's 848 sitemap URLs are static
catalog documents that need no primitives at all. For scale, that CSS floor
alone (25.8 KB gz) is about six times today's entire stylesheet (`main.css`,
15,239 B raw ≈ 4 KB gz).

What is bought for it: a focus-trapped, scroll-locking, Escape-closing dialog
for the three pickers; a tab pattern that actually implements roving tabindex;
badges, toasts and form primitives; a token system and dark mode; and prose
components for the `@nuxt/content` pages. Those are real, and several of them
close compromises the current code documents in its own comments.

## The starting position

- 32 SFCs, 4,891 lines. **No `<style>` block anywhere** — every rule is in
  `app/assets/css/main.css`, 1,436 lines and 197 selectors, registered through
  `css: ['~/assets/css/main.css']` (`nuxt.config.ts:274`).
- No CSS custom properties. `#333`, `#2c3e50`, `#f5f5f5`, `#d8dee4` are written
  out at each use. Five media queries. No dark mode.
- `app/components/build/Scene.client.vue` is 1,466 lines of three.js and has
  almost no DOM. It is not part of this migration beyond its overlay buttons.

## Things installing the module changes whether or not we ask

Confirmed from the 4.11.1 package manifest, not from the docs:

- **`@nuxtjs/color-mode` ^4.0.1 is a hard dependency.** Dark mode arrives on
  install and follows the system by default. Every hardcoded `#fff` and `#333`
  in `main.css` is then wrong for half the visitors. Phase 0 pins light.
- **`@nuxt/fonts` ^0.14.0 is a hard dependency**, and Nuxt UI's default theme
  does not use the site's `-apple-system, BlinkMacSystemFont, …` stack. Left
  alone it changes how every Chinese glyph on the site renders, and it wants
  network at build time. Phase 0 overrides `--font-sans` to today's stack and
  confirms nothing is fetched during `nuxt generate`.
- **`@nuxt/icon` ^2.5.1 is a hard dependency.** Unless the icon collections are
  installed locally (`@iconify-json/*`), icons resolve against the Iconify API
  **at runtime** — a third-party request per page on a site that deliberately
  dropped its last two third-party hops (§5.5). Any icon we use must come from a
  locally installed collection.
- Also pulled in: the whole of TipTap, Embla carousel, TanStack table and
  virtual, `motion-v`, `vaul-vue`, `@internationalized/date`. This is where the
  135 MB goes. None of it reaches the bundle unless used.

## Invariants the migration may not break

These are load-bearing and each has a reason on file. A phase that trips one is
wrong even if it looks better.

1. **`LocaleControls.vue` stays a `<details>`.** Its links must be in the
   prerendered HTML so a crawler reaches `/en` and a reader can switch before
   hydration (CLAUDE.md, §4.6). `UDropdownMenu` renders its panel client-side.
   **This one control keeps its hand-written CSS permanently**; it is the
   documented exception to "prefer a Nuxt UI component".
2. **Trailing slashes.** `experimental.defaults.nuxtLink.trailingSlash =
   'append'` is one of three settings that have to agree, or every canonical,
   hreflang and breadcrumb URL names a redirect chain (`nuxt.config.ts:54-64`).
   Nuxt UI routes `:to` through its own `ULink`; phase 0 proves in the built
   HTML that a `UButton :to` still emits the slash.
3. **`.scene-frame` keeps its explicit `aspect-ratio` box.** It exists so the
   space is held before the client-only scene chunk loads; that is the whole
   reason model-viewer was replaceable (§5.5).
4. **`.kit-list > li` keeps `content-visibility: auto` and
   `contain-intrinsic-size`.** It is what stops a 305-row picker fetching every
   photo.
5. **No Zod value imports into a route** (CLAUDE.md). Unchanged, and worth
   re-checking after the CSS floor lands, since the budget is tighter now.
6. **`.starter-name { word-break: keep-all }`** and the CJK wording rules. Any
   utility class that sets `break-words` on Chinese text is a regression.
7. **`.fallback`** is applied *alongside* another class on four different
   surfaces. It stays a global class, not a variant.

## Component mapping

"Prefer the Nuxt UI component" applied file by file. Where the answer is "keep
what is there", the reason is given.

| Today | Becomes | Note |
|---|---|---|
| `.picker-backdrop` + `.picker[role=dialog]` in `PartPicker`, `SlotPicker`, `BasePicker` | **`UModal`** | The real win. Gets focus trap, Escape, scroll lock and focus return, none of which the three hand-rolled dialogs do today. |
| `.picker-search` `<input type=search>` | **`UInput`** | `type="search"`, leading icon. |
| `.picker-list` rows of `<button>` | `UButton variant="ghost"` wrapping `PartCard` | Keep the `<ul>`/`<li>` and the `role="presentation"` divider: the list semantics are deliberate. |
| `.door-toggle` in `BasePicker` (kit / chassis) | **`UTabs`** | `BasePicker.vue` says in a comment it is "deliberately not `role=tablist`" because plain buttons do not implement roving tabindex. `UTabs` does. This closes that compromise rather than papering over it. |
| `.door-toggle` in `Findings` (race class) | **`URadioGroup`** (button variant) | It is a single choice among three, not navigation — a radio group is the honest role, and it is what a screen reader wants. |
| `.chassis-chips button.active` | `UButton size="xs"`, `variant` toggling | Filters, not badges. `.chip-count` keeps `tabular-nums`. |
| `.build-share-actions button.primary/.secondary` | **`UButton`** `color="primary"` / `variant="outline"`, `icon=` | The four inline SVGs go; icons must come from a locally installed collection. |
| copy-link success | **`useToast()`** | New behaviour. Today the copy button says nothing back. |
| `button.link` (8 call sites) | `UButton variant="link"` | |
| `.show-more` | `UButton block variant="outline"` | |
| `.part-legality`, `.kit-status`, `.chip`, `.finding-severity` | **`UBadge`** | Four colour treatments collapse into one component's `color` prop. |
| `.build-notice` | **`UAlert`** | |
| `.findings-list li` | `UBadge` + text | *Not* `UAlert` per row — the list is often long and an alert each would shout. |
| `.breadcrumbs` | **`UBreadcrumb`** inside our `Breadcrumbs.vue` | The component stays: it owns the `BreadcrumbList` JSON-LD and the declared hierarchy (§4.6). Only its markup is swapped. |
| `.part-hero`, `.part-section`, `.home-about` | **`UCard`** / `UPageSection` | Detail pages only. |
| `.part-card` in list rows | plain markup + utilities | `UCard`'s ring and padding is wrong for a dense picker row. |
| `.more-slots`, `.findings-unchecked` `<details>` | `UCollapsible` | Optional, low value; neither is crawl-sensitive. Do it last or not at all. |
| `.category-grid`, `.chassis-list`, `.kit-list`, `.slot-row` | Tailwind grid utilities | No component involved. |
| `.content-container h1/h2/p/img` | Nuxt UI **prose components** | v4 ships them for `@nuxt/content`. Must be done in the same phase as preflight, since preflight is what removes the heading sizes these rules assume. |
| `.locale-menu*` (10 selectors) | **unchanged** | Invariant 1. |
| `.scene-*` overlay buttons | `UButton size="xs"` with `variant` on `aria-pressed` | Absolute positioning stays in CSS. |

## Phases

Each phase ends green on `npm test`, `npm run typecheck`, `npm run
catalog:verify` and `nuxt generate`, and is one gitmoji commit. Bundle size is
re-measured at 0, 2 and 6 and recorded here.

**Phase 0 — land the module, change nothing visible.**
Install; add `@nuxt/ui` to `modules`; put `@import "tailwindcss"` and
`@import "@nuxt/ui"` at the head of the existing `main.css` so the 197 selectors
still load and still win. Pin `colorMode.preference = 'light'`. Override
`--font-sans` to the current stack. Install the icon collection locally. Then
prove, in the generated output: the slash survives on a `UButton :to`; no
Iconify or font request at build or runtime; prose pages still render; the
`<details>` locale menu is still in the HTML. Record the real delta on this
repo — the 47 KB is from a toy app and this one has 1,709 routes.
*Nothing in this phase changes a pixel.* If it does, stop and fix it here.

**Phase 1 — buttons and badges.**
`button.link`, share actions, `.show-more`, `.slot-actions button.primary`,
scene overlay buttons; then `.chip`, `.part-legality`, `.kit-status`,
`.finding-severity`. Highest ratio of CSS deleted to risk taken, and it settles
the colour palette before anything structural moves.

**Phase 2 — the three pickers become `UModal`.**
The a11y payoff, and the one phase worth the whole migration on its own. Test
on a 360 px viewport: `.kit-list`'s `min(20rem, 100%)` track exists because a
fixed floor pushed the dialog past the phone viewport, and `UModal` has its own
width handling that must not undo that.

**Phase 3 — toggles.**
`BasePicker` doors → `UTabs`; findings class → `URadioGroup`; chassis chips.
Delete the `.door-toggle` block and the "deliberately not a tablist" comment
with it, since it stops being true.

**Phase 4 — prose, breadcrumbs, cards.**
Drop the `main.css` override of Tailwind preflight and let the reset apply;
swap `.content-container` prose for Nuxt UI's prose components; `UBreadcrumb`;
`UCard` on the part and chassis detail pages. Highest visual-regression risk of
any phase — the guides and `/about` are entirely `@nuxt/content` markdown.

**Phase 5 — tokens and dark mode.**
Replace the hardcoded greys with Nuxt UI's semantic colours, then unpin
`colorMode`. This is the capability the pre-adoption audit found genuinely
missing, and it is cheap once phases 1–4 have removed the literals.

**Phase 6 — sweep.**
Delete whatever is left of `main.css` beyond the locale menu, the scene frame,
the CJK rules and the perf hints. Re-measure. Amend the docs.

## Docs to amend when this lands

- `docs/PLAN.md` §4.1 and §5.5 — §5.5 currently reasons *against* `@nuxt/ui`.
  Amend in the file's existing style (`**Amended 2026-09-22 (owner):** …`)
  rather than rewriting the original, so the reversal and its cost stay legible.
- `CLAUDE.md` — the "Planned Architecture" bullets, and a line under the
  bundle-discipline note saying what the new floor is.
- `README.md` 授權 — no new top-level directory, so no licence line is needed.
