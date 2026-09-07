> Research snapshot from 2026-09-08. Where this differs from `docs/PLAN.md`, the plan is authoritative.

# mini4wd.parts – Technical Architecture Research (2026-09-08)

Scope: parts database, 3D builder, shareable builds, beginner wizard, guides, community ratings. Current scaffold: Nuxt 3.14 + @nuxt/content 2.x, `nuxt generate` to GitHub Pages, custom domain `mini4wd.parts`.

---

## 1. Prior art

### General "part picker" sites
| Site | What it does well | Takeaway |
|---|---|---|
| [PCPartPicker](https://pcpartpicker.com/forums/topic/269851-how-does-pcpartpicker-works) | Rule-based compatibility checks (form factor, socket, PSU wattage, BIOS-update warnings) run as you add parts; saved lists have permalinks; user ratings. Known gaps: does not check QVL-level nuances ([cgdirector](https://www.cgdirector.com/pcpartpicker-compatibility-warnings-explained/)). | Compatibility = a small set of declarative rules over structured specs, with three severities (error / warning / note). Never claim 100% coverage; show "verify manually" notes. |
| [KeebDepot](https://keebdepot.com/), [keyboardpartpicker.io](https://keyboardpartpicker.io/), [keeb-finder builder](https://keeb-finder.com/custom-keyboard-builder) | Keeb-finder encodes the whole build into the URL (bookmarkable, shareable with no backend). KeebDepot adds a compatibility matrix + live prices. | URL-encoded builds are a zero-backend MVP for sharing. |
| [Gundamaxing](https://gundamaxing.com/), [Gunpla Corps](https://gunplacorps.com/), [Builders Note (Bandai official)](https://www.gn-app.com/en) | Showcase/"build passport" pages, kit ratings, collection tracking. Bandai runs an official community app. | Community builds need a strong per-build page (hero image, part list, author). |

### Mini 4WD specific (Japanese ecosystem)
- **Tamiya official**: [Chassis Select Guide](https://www.tamiya.com/japan/cms/mini4wd_chassis_select.html), [Grade-Up Parts Matching List](https://www.tamiya.com/japan/mini4wd/regulation/1709/parts1709.html) and [gear-ratio matching list](https://www.tamiya.com/japan/mini4wd/regulation_gear.html). The matching list is a **GIF image matrix** (parts x chassis) plus PDF – not machine-readable, not searchable. The English [setup guide](https://www.tamiya.com/english/mini4wd/setupguide/setupguide.htm) is prose. This is the biggest gap your site can fill: a queryable, per-part compatibility database.
- **[TAMIYA PASSPORT](https://miniyonfan.com/app-tamiyapassport/)** app: event search/entry, beacon/QR check-in, profile. No machine registration or setting sharing found. **[Mini 4WD Station](https://www.tamiya.com/japan/mini4wd/mini4wdstation)** is a shop/circuit locator, not a machine registry.
- **[ミニ四駆 超速グランプリ](https://dengekionline.com/articles/24014/)** (Bandai Namco game): 700+ 3D-scanned parts, per-course setting, machine "garage". Best UX reference for a parts picker UI, but it is a game, not a real-parts tool.
- **Community databases**: [TEA-League chassis database](https://www.tea-league.com/mt/tea/archives/1900/01/post_513.html) (chassis lineage + specs), [SISO-Lab GUP database](http://toyz.siso-lab.net/m4wd-gup-database-open/), [miniyonku.net parts catalog](http://www.miniyonku.net/products-parts-catalog), [ミニ四駆改造マニュアル@wiki](https://w.atwiki.jp/mini_4wd/pages/88.html). All are blog/wiki style, Japanese-only, mostly stale, no builder, no sharing.
- **Community/SNS**: [ミニ四駆ちゃんねる☆](https://sns.prtls.jp/mini4wd/privacy.html) (small SNS); most sharing actually happens on X/Instagram with photos, per Tamiya's own [SNS campaign page](https://www.tamiya.com/japan/mini4wd/mini4sns_pickup.html).
- **Calculators**: gear-ratio/speed calculators exist only as blog posts ([example](https://ameblo.jp/jojojojon0524/entry-12717253320.html), [mini4wd.tech](https://www.mini4wd.tech/archives/mini4wd-gear-ratio.html)).
- **Class rules**: [Basic-MAX GP regulations v4.0s](https://basic-max.com/2025/12/17/bmaxgp-regu-v4s/); as of Dec 2025 the Stock class and B-MAX GP rules were unified ([2026 comparison](https://www.kakamigahara-bunka.jp/archives/2982)). Class legality is a real, data-drivable concept (no-machining, Tamiya-parts-only, no mass-damper swing gimmicks, etc.).

**Conclusion**: No site combines a structured multilingual parts DB + compatibility rules + 3D builder + share pages + ratings for Mini 4WD. Traditional-Chinese content is essentially absent. That is the niche.

---

## 2. Nuxt architecture options

### Framework status (verify-first findings)
- **Nuxt 4** shipped July 2025; 4.5 is current (Vite 8, SSR streaming). **Nuxt 3 reached EOL on 31 July 2026** – the scaffold's 3.14 is unsupported. Nuxt 5 is expected ~Q4 2026 once Nitro 3 stabilises ([releases.sh](https://releases.sh/nuxt), [Nuxt 4 guide](https://sadiqueali.medium.com/nuxt-4-in-2026-the-complete-developers-guide-1a6161462550)).
- **@nuxt/content v3**: SQL-backed collections with Zod/Valibot schemas, indexes; static mode ships a WASM SQLite to the browser for client-side queries; serverless mode supports D1 / Postgres / LibSQL ([collections](https://content.nuxt.com/docs/collections/define), [validators](https://content.nuxt.com/docs/collections/validators), [static deploy](https://content.nuxt.com/docs/deploy/static), [serverless deploy](https://content.nuxt.com/docs/deploy/serverless)). Nuxt Studio (visual editor) is now [free and open source](https://content.nuxt.com/blog/studio-oss). nuxt-og-image v6 dropped Content v2 support.
- **Recommendation: upgrade now** to Nuxt 4 + Content v3 before writing real content. The current scaffold is 3 pages and one component; migration cost is near zero today and grows with every page.

### (a) Fully static on GitHub Pages + third-party backend
- Zero hosting cost, bandwidth unmetered, keep current CNAME. All parts/guide pages prerendered. Builder runs client-side.
- Dynamic bits go to a BaaS: **Supabase** free tier (500 MB, 2 projects) but **projects pause after 7 days of DB inactivity** – annoying for a hobby site with sporadic traffic ([limits](https://automationatlas.io/answers/supabase-free-tier-limits-2026/)). **Firebase Spark**: Firestore 50K reads / 20K writes per day, anonymous auth free to 50K MAU, but Cloud Storage now requires Blaze (billing) since Feb 2026 ([agentdeals](https://agentdeals.dev/vendor/firebase)). **PocketBase** needs a VPS (not free, needs ops).
- OG images for share links are the weak point: GitHub Pages cannot run code, so a crawler hitting `/b/abc123` gets a generic OG image unless a separate function generates it.
- Verdict: fine for MVP (with URL-encoded builds and no backend at all), weak for v1.

### (b) Cloudflare Workers (+ optional @nuxthub/core)
- **NuxtHub status correction**: it was **not** folded into Nuxt core. The managed **NuxtHub Admin sunset on 31 Dec 2025**; `@nuxthub/core` continues as a self-hosting-first, multi-cloud module (database, KV, blob, cache stay; browser rendering, AI, Vectorize bindings were deprecated from the module) ([changelog](https://hub.nuxt.com/changelog/self-hosting-first), [repo](https://github.com/nuxt-hub/core)). You can equally skip it and use Nitro's `cloudflare_module` preset with D1/KV/R2 bindings directly ([nuxt.com/deploy/cloudflare](https://nuxt.com/deploy/cloudflare)).
- **Pages vs Workers**: Pages is in maintenance mode; Cloudflare recommends **Workers with static assets** for new projects (parity for static, SSR, custom domains since March 2026) ([cogley.jp](https://cogley.jp/articles/cloudflare-pages-to-workers-migration), [migration guide](https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/)).
- **Free tier (Aug/Sept 2026)**: Workers 100K req/day + 10 ms CPU; static asset requests unmetered; **D1** 5 GB, 5M rows read/day, 100K rows written/day – **hard-enforced from 1 Sept 2026** (queries error until midnight UTC) ([D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/), [changelog](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/)); **KV** 100K reads / **1K writes** per day (too tight for ratings – use D1 for writes); **R2** 10 GB; **Browser Rendering** 10 min/day ([limits](https://developers.cloudflare.com/browser-run/limits/)). Workers Paid is $5/mo if ever needed.
- Custom domain: move `mini4wd.parts` DNS to Cloudflare (free plan) and attach the Worker as a custom domain; retire the GitHub Pages CNAME. Prerendered pages are served as static assets (free); only `/api/*` and `/b/:id` hit the Worker.
- Verdict: best fit. One deployment, one vendor, near-zero cost, and prerendering keeps 95%+ of traffic off the Worker quota.

### (c) Vercel / Netlify with Nuxt server routes
- Also free for hobby, easy Nuxt support, but you still need a DB (Neon/Turso/Supabase) and blob storage from a second vendor; Vercel's function/edge limits are fine but commercial-use restrictions on Hobby plans and cold starts on a sparse-traffic site are a mild negative. No advantage over (b) for this project.

### Cross-cutting
- **Auth**: v1 needs none. Anonymous ratings keyed by a random device id cookie + salted IP hash, one vote per (build, device) enforced in D1 with a unique index. Add **Cloudflare Turnstile** (free) on vote/share POSTs, rate-limit per IP in the Worker, keep share payload size-capped and schema-validated (Zod/valibot) so only valid part IDs land in the DB. v2: GitHub/Google OAuth via `nuxt-auth-utils` (sessions in encrypted cookies; no auth vendor required).
- **OG images for builds**: use [nuxt-og-image v6](https://nuxtseo.com/docs/og-image/migration-guide/v6) – **Takumi** renderer is default and runs on Workers via `@takumi-rs/wasm` ([Takumi](https://nuxtseo.com/docs/og-image/renderers/takumi)); components need `.takumi.vue` suffix. Compose the OG card from (part list + chassis) and a **pre-rendered 3D thumbnail**: the simplest reliable approach is to have the builder capture the WebGL canvas (`toBlob`) at share time and upload a ≤200 KB PNG to R2 with the build; the Worker composes it into the OG card. Fallback: a per-chassis static render. Cloudflare Browser Rendering (10 min/day free) is an option for headless renders but adds 3D-in-headless-Chrome fragility; avoid initially.

---

## 3. Data modeling

### Catalog in repo vs DB
Keep the **catalog (parts, chassis, rules, guides) in the repo as YAML/JSON under `content/`**, validated by @nuxt/content v3 Zod schemas, prerendered to per-part pages. Reasons: git history and PR review of data, one source of truth for build + Worker, no read quota consumed, Nuxt Studio for editing, easy community contributions. Put **only user-generated data (builds, votes, view counts) in D1**. Ship a compact `catalog.json` (id, names, category, chassisCompat, slot, key specs) to the builder client so rule evaluation runs in the browser without DB reads.

### Schema sketch (Zod-validated collections)
```
parts (collection, one YAML per item)
  id: "15442"                 # Tamiya item number, primary key
  names: { ja, en, zh-TW }
  category: roller | bearing | plate | stay | gear | motor | wheel | tire | battery | brake | mass_damper | screw | body | chassis | misc
  subcategory: e.g. "aluminum_ball_bearing_roller"
  slots: ["front_roller","rear_roller"]        # which builder sockets it can occupy
  chassisCompat: { include: ["MA","MS","AR"], exclude: [], notes: {ja,en,zh-TW} }
  classLegality: { official: true, bmax: true, stock: true, notes: {...} }
  specs: { rollerDiameterMm, rollerType, gearRatio, motorRpmRange, motorTorque, weightG, wheelDiameterMm, tireHardness, thicknessMm }
  priceJpy, releaseDate, status: current | discontinued | limited
  images: [{src, alt}], model3d: { glb: "/models/15442.glb", attach: {...} }
  requires: ["screw_2mm_set"]                  # dependency rule hooks
  tags: []
chassis (collection): id, names, family (MS/MA/AR/FM-A/VZ/S2/…), slots: [{id, type, maxCount, position}], specs (wheelbase, tread, weight, motorMount), kits: []
rules (collection): declarative rule objects (see below)
guides (markdown collection): standard content pages, per locale
```
D1 tables: `builds(id, short_id, chassis_id, parts_json, title, author_id nullable, locale, created_at, thumb_key, view_count)`, `votes(build_id, voter_hash, value, created_at, UNIQUE(build_id, voter_hash))`, `part_votes(part_id, voter_hash, value)`, `build_stats(build_id, score, votes, views)` (materialised, updated in the same request or by a cron trigger).

### Rule engine
Declarative JSON rules evaluated on the client and re-validated on the Worker at share time:
```
{ id: "roller_needs_2mm_screws", severity: "warning", when: { anySlotHasTag: "ball_bearing_roller" }, require: { anyPartHasTag: "screw_2mm" }, message: {ja,en,zh-TW} }
{ id: "chassis_compat", severity: "error", type: "chassisCompat" }                # built-in
{ id: "slot_capacity", severity: "error", type: "slotCapacity" }                  # built-in
{ id: "bmax_no_machined", severity: "error", class: "bmax", when: { anyPartHasTag: "requires_machining" } }
{ id: "roller_count_official", severity: "error", class: "official", maxRollers: 6 }
```
Rule types: slot capacity, chassis-compat lists, class legality (per selected class), dependencies (`requires`), mutual exclusion, numeric constraints (e.g. total width ≤ 105 mm, roller diameter range by class). Output: list of `{ruleId, severity, parts[], message}` shown inline like PCPartPicker.

### Wizard / recommender
A rules-based scorer over the same catalog: the wizard collects budget, chassis, class, course type (flat/technical/jump-heavy), experience; each part carries `roles` and simple numeric attributes (grip, stability, speed, cost). A `profiles` collection maps answers to weight vectors; score = weighted sum + hard filters (chassis compat, class legality, budget). Later blend in community popularity (votes, build inclusion counts) as one more weight. No ML needed; keep the weights as data so they can be tuned without code.

---

## 4. 3D in Nuxt (integration only)
- **[@tresjs/nuxt](https://nuxt.com/modules/tresjs)** is mature: v5.1.0 published Sept 2026 from the TresJS monorepo (the standalone [Tresjs/nuxt](https://github.com/Tresjs/nuxt) repo was archived Feb 2026 as part of the move); ships devtools and auto-imports. It renders inside `<ClientOnly>`/`.client.vue` components; three.js (~600 KB min, more with GLTFLoader/controls) must be lazy-loaded on the builder route only so prerendered parts pages stay light.
- **Google `<model-viewer>`** (already used) is the right choice for **display-only** cases: hero, per-part previews, share pages (poster fallback, AR, ~300 KB from CDN, no SSR issues if registered as a custom element in `vue.compilerOptions.isCustomElement`). It cannot compose multiple parts onto a chassis.
- **Recommendation**: model-viewer for part/share/hero pages; TresJS for the builder route (declarative Vue components map naturally to a slot-based scene graph; plain three.js is a fallback if you need fine control, but TresJS exposes the underlying three objects anyway). Keep the builder client-only and code-split.

---

## 5. i18n and SEO
- **[@nuxtjs/i18n](https://nuxt.com/modules/i18n)** v10.x (10.4–10.6, Vue I18n v11) supports Nuxt 4, static route localisation, lazy locale files and a strict SEO mode that emits `hreflang`/canonical automatically ([new features](https://i18n.nuxtjs.org/docs/guide/new-features)).
- URL strategy: `prefix_except_default` with `zh-TW` default (`/parts/15442`, `/en/parts/15442`, later `/ja/...`). Pure `prefix` has a long-standing static-generation index quirk ([issue #3016](https://github.com/nuxt-modules/i18n/issues/3016)); `prefix_except_default` avoids it and keeps existing root URLs.
- SEO plan: one prerendered page per part, per chassis, per guide, per class; slugs contain the item number (`/parts/15442-aluminum-ball-race-rollers`) with names in all locales in the title/meta; JSON-LD `Product` for parts; per-locale sitemaps via `@nuxtjs/sitemap`; Content v3 stores translated guide bodies as separate markdown files per locale, while part names/notes live inline in the YAML so a single record feeds all locales.

---

## 6. Analytics / ops
- Keep GA4 for acquisition/search-console alignment. Add **PostHog** (free tier 1M events/mo, EU/US cloud) for product analytics: builder funnel (chassis chosen → parts added → shared), wizard completion, rule-warning frequency (which rules fire most = data quality signal), feature flags for gating v2 features. Load it lazily and respect DNT; the owner already has the PostHog plugin, so instrumenting is cheap.
- Ops: GitHub Actions `wrangler deploy`; D1 migrations checked in; nightly D1 export to R2 as backup; Cloudflare Analytics for edge traffic.

---

## 7. Recommended architecture
**Nuxt 4 + @nuxt/content v3 (Zod collections for parts/chassis/rules/guides) + @nuxtjs/i18n + TresJS (builder) / model-viewer (display) + nuxt-og-image v6 (Takumi), deployed to Cloudflare Workers with static assets; D1 for builds and votes, R2 for build thumbnails, Turnstile for abuse control. DNS for mini4wd.parts moves to Cloudflare.**

Why: it is the only option that keeps hosting at $0 with unmetered static bandwidth, generates real OG images for shared builds, stores user data without a second vendor or a sleeping database, and stays fully within the Nuxt/Vue toolchain the owner prefers. The catalog-in-repo decision keeps D1 usage to user-generated rows only, so the free limits (100K writes/day) are orders of magnitude above hobby traffic. The main cost is a one-time domain/DNS migration off GitHub Pages.

---

## 8. Phased rollout
**MVP (weeks 1–4) – static, no backend**
- Upgrade to Nuxt 4 + Content v3; define Zod schemas; seed ~150 core parts + all current chassis from the Tamiya matching list.
- Prerendered part/chassis/guide pages, zh-TW + en, sitemaps, JSON-LD.
- Builder v0: slot picker (2D list UI) with client-side rule engine; build encoded in URL (`/b?c=MA&p=15442,15441,...` or base64url); model-viewer preview of the chassis.
- Still on GitHub Pages (or already on Workers static assets – either works). Add PostHog.

**v1 (months 2–4) – dynamic share + community**
- Move to Cloudflare Workers; D1 `builds`/`votes`; `POST /api/builds` returns short id; `/b/:id` share page prerendered-on-demand with Takumi OG image + R2 thumbnail captured from the builder canvas.
- Anonymous up/down votes and view counts (Turnstile + per-device hash), "popular builds" and "most used parts" pages regenerated from D1 aggregates.
- Beginner wizard as a rules-based scorer with editable weight profiles; class-legality toggle (official / B-MAX-stock).

**v2 (months 4+) – 3D builder and identity**
- TresJS builder: chassis GLB with named attachment points; parts snap to slots; canvas capture for thumbnails; AR view via model-viewer on share pages.
- Optional login (GitHub/Google via nuxt-auth-utils) for profiles, saved garages, comments; ja locale; community part-data contributions via PRs or Nuxt Studio; price tracking from official shop feeds; per-course setting notes.

### Key sources
- Nuxt: https://nuxt.com/blog/v4 · https://releases.sh/nuxt · https://nuxt.com/deploy/cloudflare
- Content v3: https://content.nuxt.com/docs/collections/define · https://content.nuxt.com/docs/deploy/static · https://content.nuxt.com/docs/deploy/serverless
- NuxtHub: https://hub.nuxt.com/changelog/self-hosting-first · https://github.com/nuxt-hub/core
- Cloudflare: https://developers.cloudflare.com/d1/platform/pricing/ · https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/ · https://developers.cloudflare.com/workers/static-assets/migration-guides/migrate-from-pages/ · https://developers.cloudflare.com/browser-run/limits/
- OG image: https://nuxtseo.com/docs/og-image/migration-guide/v6 · https://nuxtseo.com/docs/og-image/renderers/takumi
- 3D: https://nuxt.com/modules/tresjs · https://github.com/Tresjs/nuxt
- i18n: https://nuxt.com/modules/i18n · https://i18n.nuxtjs.org/docs/guide/new-features
- BaaS: https://automationatlas.io/answers/supabase-free-tier-limits-2026/ · https://agentdeals.dev/vendor/firebase
- Mini 4WD: https://www.tamiya.com/japan/mini4wd/regulation/1709/parts1709.html · https://www.tamiya.com/japan/cms/mini4wd_chassis_select.html · https://basic-max.com/2025/12/17/bmaxgp-regu-v4s/ · https://miniyonfan.com/app-tamiyapassport/ · https://www.tea-league.com/mt/tea/archives/1900/01/post_513.html
- Comparables: https://pcpartpicker.com/forums/topic/269851-how-does-pcpartpicker-works · https://keebdepot.com/ · https://keeb-finder.com/custom-keyboard-builder · https://gundamaxing.com/ · https://www.gn-app.com/en
