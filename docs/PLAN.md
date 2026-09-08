# mini4wd.parts — Product & Technical Plan

Status: draft v1, 2026-09-08. Planning only; no implementation yet.
Research notes that fed this document (concepts, data sources, 3D assets, tech stack) are summarised inline with source links.

---

## 1. Vision and scope

A Traditional-Chinese-first (English second, Japanese later) site for Mini 4WD beginners that combines:

| # | Feature | Phase |
|---|---|---|
| F1 | Parts database (chassis, kits, Grade-Up Parts) with chassis compatibility and class legality | 1 |
| F2 | Tutorials: how to pick parts for different goals, class glossary (Open / Stock / B-MAX) | 1 |
| F3 | Car builder: pick a chassis, fill slots with parts, see compatibility warnings | 1 (2D list UI) → 3 (3D) |
| F4 | Shareable builds with part list, permalink and preview image | 1 (URL-encoded) → 2 (short links + OG image) → 3 (3D preview) |
| F5 | Beginner wizard / recommender (budget, class, course type → suggested build) | 2 |
| F6 | Ratings and popularity for parts and builds | 2 |
| F7 | Interactive 3D builder (click the car to select parts, model updates live) | 3 |
| F8 | Accounts, garages, comments, community data contributions | 4 |

Nothing like this exists today. Japanese resources are blog/wiki style and stale, Tamiya's compatibility matrix is a GIF image, the licensed Bandai game (超速グランプリ) shut down in May 2024, and there is no Traditional Chinese item-level database at all. See the prior-art notes in section 8.

### Guiding decisions

1. **Data first, 3D second.** The builder, wizard, share pages and 3D view all sit on the same slot-graph data model. Ship the parts database and a 2D builder before investing in 3D assets, which is the most expensive and riskiest workstream.
2. **Catalog in git, user data in a database.** Parts, chassis, rules and guides are versioned YAML/Markdown in the repo. Only builds, votes and view counts live in a database.
3. **Stay in the Nuxt/Vue toolchain**, at near-zero hosting cost.
4. **Facts are ours, Tamiya's expression is not.** Store facts (item numbers, prices, dimensions, compatibility) and our own text, photos and simplified 3D shapes. Link out to Tamiya for official descriptions and images.

---

## 2. Domain summary (what the site must model)

### 2.1 Race classes

| Class | Who runs it | Key rules | Site treatment |
|---|---|---|---|
| **Open** (公認競技会規則) | Tamiya official (Japan Cup, TMAC, HK Cup) | 105×165×70 mm, ≥90 g with batteries, tires 22–35 mm, Tamiya parts only, 2×AA Tamiya/FDK. Single-shaft chassis: Tune 2 series, Light-Dash, Hyper-Dash 3, Power-Dash, Sprint-Dash. PRO chassis: PRO motors. Ultra/Plasma-Dash banned. | Baseline ruleset every build is checked against |
| **Stock Class** (ストッククラス / 基礎賽) | Tamiya official, since Apr 2025, revised 2026-05 | Open rules plus: no chassis cutting, no new holes, no modified parts, plates must not wobble, forbidden zone between axles. Dash motors allowed. | Primary beginner ruleset |
| **B-MAX GP** | Basic-MAX GP committee (Yokohama), Tamiya cooperates; popular in Taiwan (TMU league), Malaysia, UK | Unified with Stock Class in Dec 2025; ver5.0 effective 2026-06-01 is identical in the modification section. Factory roller combos only, gear pairings per chassis, no 提灯/catcher dampers. | Same ruleset as Stock with a few extra flags |
| **"B-Stock"** | Local shorthand; **confirmed by the site owner (2026-09-08) to mean Stock Class** | Same rules as Tamiya Stock Class, and therefore B-MAX GP as well since the two were unified in Dec 2025. Not to be confused with "Box Stock" (unmodified kit, normal motor), a stricter shop-defined class in PH/UK/MY. | Alias entry redirecting to Stock Class, with a note that organiser PDFs govern |
| Junior / Family / Trial | Tamiya official, by age | Tune-series motors only | Motor legality flag |
| GT Advance, Box Stock, regional Stock variants (TH/PH/VN) | Community / shops | Vary | Glossary entries only |

Sources: [Tamiya EN regulation](https://www.tamiya.com/english/mini4wd/regulation.htm), [Stock Class EN](https://www.tamiya.com/english/mini4wd/regulation_stockclass.html), [Tamiya HK 基礎賽](https://tamiya.hk/rule-stock-class/), [B-MAX GP ver5.0](https://basic-max.com/2026/05/13/bmaxgp-regu-v5/), [Japan Cup 2026](https://www.tamiya.com/japan/mini4wd/japancup.html).

### 2.2 Chassis

Current production chassis to feature in v1 (seven, plus ME as newest PRO sibling):

| Chassis | Motor | Shaft | Since | Kit gear | Notes |
|---|---|---|---|---|---|
| MA | mid | double (PRO) | 2013 | 3.5:1 | Most kits (69), monocoque, 6 rollers, beginner-friendly |
| MS | mid | double (PRO) | 2005 | 4:1 | 3-piece; basis of MSフレキ (Open only) |
| ME | mid | double (PRO) | 2025/26 | 3.5:1 | Newest; added to official regs Jan 2026 |
| AR | rear | single | 2012 | 4.2:1 | First 6-roller chassis, easy maintenance |
| FM-A | front | single | 2017 | 3.5:1 | Front-motor, stable on undulating tracks |
| VZ | rear | single | 2020 | 3.5:1 | Lightest (108 g), successor to VS |
| Super-II | rear | single | 2010 | 4.2:1 | Still in yearly limited kits |
| VS / Super XX / Super FM | rear/rear/front | single | 1997–2009 | various | Re-releases only; v2 |

Legacy chassis (Type-1…5, Zero, FM, Super-1, TZ, TZ-X, X) are catalogued as glossary entries only. Full table with wheelbase/tread/weight is in the concepts research; source: [Tamiya chassis select guide](https://www.tamiya.com/english/cms/mini4wd_chassis_select.html).

Key modelling fact: PRO chassis (MS/MA/ME) require double-shaft motors; all others require single-shaft. This is the first compatibility rule.

### 2.3 Motors

15 motors in two families (single-shaft and PRO double-shaft), each with RPM/torque/current ranges from Tamiya packaging and a legality set (Junior / Stock+B-MAX / Open / none). Full table in research; specs cross-checked against [MotorLab](https://motorlab-tw.github.io/en/benchmarks/tamiya-mini-4wd-motor-specs-list/). Japan-Cup coloured variants (95xxx) share specs with their 15xxx base motor.

### 2.4 Part taxonomy

- **Required to run:** kit (chassis + body + kit gears/wheels/tires/shafts/plastic rollers + usually FA-130 normal motor) + 2×AA batteries.
- **Optional (Grade-Up Parts):** rollers (plastic / aluminium / bearing; 8–19 mm), bearings, gear sets (3.5 / 3.7 / 4 / 4.2 / 5 : 1), counter and propeller shafts, wheels, tires, FRP/carbon plates and stays, brakes (stay + sponge grades), mass dampers, slide dampers, stabilisers, shafts, motor mounts, terminals, battery holders, body catches, screw/nut sets, tools, beginner bundles (First Try Parts Set per chassis, Starter Packs).
- **Item number scheme:** 18xxx regular kits, 19xxx Fully-Cowled/Aero kits, 15xxx regular GUP (GP No.), 95xxx limited/special (HG carbon, J-CUP motors, limited kits), 94xxx older limited. "HG" is a name prefix for premium items. "Hop-Up Options" is Tamiya's R/C line and does not apply.

### 2.5 Setup concepts for tutorials and the wizard

Gear ratio vs course type, roller width/placement (たからばこ setting), tire diameter and hardness, 90 g weight floor, brakes, mass dampers, front/mid/rear motor balance, flat vs 3D courses. Six beginner build archetypes will seed the wizard profiles: box run, first upgrade set, Stock/B-MAX bolt-on, flat speed, 3D stability, Open gimmick build (advanced, informational only).

---

## 3. Data sources and feasibility

| Source | Verdict | What we take |
|---|---|---|
| **Tamiya JP product catalog** `tamiya.com/japan/products/list.html?genre_item=30…` (1,203 Mini 4WD items; parts 631; regular GUP 244) | **Easy.** Server-rendered HTML, stable URLs, 20/page, no robots.txt. JP detail pages carry price, release date, description, 基本スペック, 使用可能シャーシ text and structured chassis tags. | Canonical item master |
| **Tamiya per-chassis compatibility pages** `product_info_ex.html?genre_item=mini4wd_chassis_{ar,ma,…}` (21 chassis codes; AR lists 428 items) | **Easy.** This is the machine-readable form of the GIF matching list. | Chassis ↔ part compatibility matrix |
| **Tamiya EN catalog** (351 items) | Easy but thin: names and one paragraph, no price/date/compat | English names |
| **tamiya.hk** (official HK distributor, WooCommerce) | **Easy.** Public Store API `/wp-json/wc/store/v1/products`, SKU = item number, HKD price, chassis filter taxonomy, TC category labels (導輪, 摩打, 避震器, 龍頭/鳳尾…). Names are English. | HK prices, TC taxonomy, HK terminology |
| **Tamiya PDFs** (lineup catalogs, parts catalog `parts2506_v3.pdf`, per-chassis parts lists MA/AR/FM-A 2021) | Medium. No per-kit assembly manuals are published online; PDFs are © Tamiya, no redistribution. | Reference for writing our own part-usage text |
| **Tamiya regulation, setting guide, chassis guide pages** | Easy (text) | Rule text for the rule engine and tutorials (paraphrased) |
| **Mini 4WD Fandom wiki** (608 articles; 91 GUP, 33 chassis, 337 cars; MediaWiki API works; CC-BY-SA) | Medium | Chassis history and car lineage, with attribution |
| **zh.wikipedia 迷你四驅** (CC-BY-SA) | Easy | Baseline TC glossary (馬達/摩打, 導輪, 軸承, 齒輪, 碳纖板) |
| Japanese community DBs (TEA-League, miniyonku.net, atwiki) | Hard / stale (CGI 500s, Cloudflare) | Occasional cross-check |
| 1999.co.jp, tamiyausa.com | Hard (bot detection) | Skip |
| Open datasets / GitHub | None exist | We build our own |

### 3.1 Initial data scope (≈300–400 items)

1. Chassis: MA, MS, ME, AR, FM-A, VZ, Super-II (+ VS as re-release).
2. Kits in production for those chassis (≈150–200).
3. All regular GUP (303010, 244 items) and AO parts (303030, 42).
4. Limited/special parts released since 2023-01 (≈120–180).
5. Skip in v1: legacy-era items, Wild/Dangun/Train, circuits, batteries beyond Neo Champ.

Neither Tamiya Stock Class nor B-MAX publishes an approved item list; both are rule-based. Legality is therefore a **derived per-item flag from category** (rollers, plates, dampers, brakes, bearings, motors are legal; tools and setting boards are not car parts) with manual overrides.

### 3.2 Pipeline

Built 2026-09-08 as `scripts/catalog/` — three stages, deliberately separated so a re-run is cheap and can never overwrite hand-authoring:

1. **Scrape wide** (`npm run scrape`): JP list pages → item ids → JP detail → per-chassis compat pages → tamiya.hk Store API. Throttled to one request per 700 ms with a disk cache under `.cache/`, ≈930 requests per full run (the EN catalog turned out to be unnecessary — the JP detail page carries the English name). Output: committed snapshots in `data/raw/*.json` covering **every** item in the parts genres, not just the v1 selection, so widening the catalog later costs no requests.
2. **Generate narrow** (`npm run catalog:generate`): raw snapshots + `data/taxonomy/*.yml` + `data/overrides/parts.yml` → schema-validated YAML in `content/parts/` and `content/chassis/`. Everything under `content/` is machine-written and rebuilt from scratch on every run.
3. **Hand-authored layer**: `data/overrides/parts.yml` (keyed by item number) and `data/chassis/*.yml`. Category corrections, motor legality, slot graphs and TW naming live here, never in `content/`. `npm run catalog:report` lists what still needs a human.
4. Attribution page: Tamiya (facts, links), tamiya.hk (prices, zh-HK names), Fandom/Wikipedia (CC-BY-SA text where reused).

First run committed **382 parts** (244 regular GUP + 42 AO + 96 limited/special/station released since 2023-01) and 8 chassis. Coverage at that point: 99% categorised, 83% with chassis compatibility, 80% with HKD prices, 60% with a Traditional Chinese name. Kits are a second pass with the same code.

### 3.3 Images and IP

- Tamiya product photos are copyrighted. Options: link out with a small hot-linked thumbnail and attribution (common practice, not formally licensed), or take own photos for the v1 scope (fully clean, and shows the real part). Recommendation: own photos for the ~50 parts that appear in the builder and wizard, hot-linked thumbnails with attribution elsewhere, and a clear "unofficial fan site" disclaimer.
- Item numbers and product names used nominatively in a catalogue are fine; avoid Tamiya logos, star mark and box art.

---

## 4. Technical architecture

### 4.1 Recommended stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Nuxt 4** (current 4.5) | Nuxt 3 reached end-of-life 2026-07-31; the scaffold's 3.14 is unsupported. Migration cost is near zero today (3 pages, 1 component). |
| Content | **@nuxt/content v3** with Zod-validated collections (parts, chassis, rules, guides) | SQL-backed collections, client-side WASM SQLite in static mode, D1 in serverless mode; Nuxt Studio is now free/OSS for editing. |
| i18n | **@nuxtjs/i18n v10**, `prefix_except_default`, zh-TW default, `/en/…`, later `/ja/…` | Keeps existing root URLs, emits hreflang/canonical, avoids the static-generation quirk of pure `prefix`. |
| 3D display | **Google model-viewer** (already used) for hero, part previews, share pages | Cheap, AR-capable, but cannot compose meshes (only material variants). |
| 3D builder | **Three.js via @tresjs/nuxt** (v5.x, active) on the builder route only, client-only and code-split | Vue-native declarative scene graph; maps directly to the slot graph. Babylon is heavier; model-viewer cannot swap geometry. |
| Share/OG images | **nuxt-og-image v6** (Takumi renderer, runs on Workers) composing part list + a thumbnail captured from the builder canvas | Crawlers do not run WebGL, so the PNG must be pre-rendered. |
| Hosting | **Cloudflare Workers with static assets** (Pages is in maintenance mode), DNS for mini4wd.parts moved to Cloudflare | Unmetered static bandwidth, Worker only for `/api/*` and `/b/:id`. Free tier: 100K req/day, D1 5 GB / 5M reads / 100K writes per day (hard-enforced since 2026-09-01), R2 10 GB. |
| User data | **D1** (builds, votes, stats), **R2** (build thumbnails), **Turnstile** (abuse control) | Single vendor, no sleeping database (Supabase pauses after 7 idle days), no billing account needed (Firebase Storage now requires Blaze). |
| Auth | None in v1/v2 (device-id cookie + salted IP hash, one vote per build per device). v4: `nuxt-auth-utils` with GitHub/Google | Keep friction low; add identity only when garages/comments need it. |
| Analytics | Keep GA4; add PostHog for builder funnel, wizard completion, rule-warning frequency | PostHog plugin already available. |
| Data tooling | Node scraper in repo; `@gltf-transform/cli` for model optimisation; build123d (Python) for procedural part meshes | See section 5. |

`@nuxthub/core` is optional sugar over the same Cloudflare bindings (its managed admin was sunset 2025-12-31; the module continues self-host-first). Using Nitro's `cloudflare_module` preset directly is equally fine and avoids a dependency.

MVP can stay on GitHub Pages: everything in Phase 1 is static. The move to Workers happens in Phase 2 when short links and ratings need a database.

### 4.2 Data model

**parts** (one YAML per item, key = Tamiya item number)
- `id`, `names {ja, en, zh-TW, zh-HK?}`, `category`, `subcategory`, `series` (regular GUP / limited / special / AO / kit)
- `slots []` (which builder sockets it can occupy), `chassisCompat {include[], exclude[], notes}`
- `classLegality {open, stock_bmax, junior, notes}` (derived + override)
- `specs {rollerDiameterMm, rollerType, gearRatio, motorShaft, motorRpm[min,max], motorTorque, weightG, wheelDiameterMm, tireHardness, plateThicknessMm, …}`
- `priceJpy`, `priceHkd`, `releaseDate`, `status` (current / limited / discontinued)
- `images []`, `model3d {glb, attach}`, `requires []`, `tags []`, `roles []` and scoring attributes for the wizard

**chassis**: id, names, family, motor position, shaft type, wheelbase/tread/weight, kit gear ratios, `slots [{id, type, maxCount, mirror, socketNode}]`, kits [].

**rules**: declarative JSON (see 4.3). **guides**: Markdown per locale. **profiles**: wizard weight vectors.

**D1 tables**: `builds(id, short_id, chassis_id, parts_json, class, title, locale, thumb_key, created_at, view_count)`, `votes(build_id, voter_hash, value, UNIQUE)`, `part_votes(part_id, voter_hash, value)`, `build_stats` (materialised).

A compact `catalog.json` (ids, names, category, slots, compat, key specs) is shipped to the client so the builder and rule engine run without database reads.

### 4.3 Rule engine

Declarative rules evaluated in the browser and re-validated by the Worker at share time. Rule types: slot capacity, chassis compatibility, motor shaft type, class legality (per selected class), dependencies (`requires`, e.g. bearing rollers need 2 mm screws), mutual exclusion, numeric constraints (total width ≤ 105 mm, tire 22–35 mm, weight ≥ 90 g estimate). Output is a list of `{ruleId, severity: error|warning|note, parts[], message{locale}}` displayed inline, PCPartPicker style. Never claim 100% coverage; show "verify against organiser PDF" notes for class rules.

### 4.4 Wizard / recommender

A rules-based scorer over the same catalog. Inputs: chassis owned or none, class, course type (flat / 3D / unknown), budget, experience. A `profiles` collection maps answers to weight vectors over part attributes (stability, speed, cost, ease); hard filters are compat, legality and budget. Output is a build the user can open in the builder. Community popularity (votes, inclusion counts) is added as one more weight in Phase 2. No ML.

### 4.5 Sharing

- Phase 1: build encoded in the URL (versioned compact byte array → base64url, e.g. `/build#v1.…`). Zero backend; share page renders the part list and a model-viewer preview of the chassis.
- Phase 2: `POST /api/builds` → short id, `/b/:id` page with OG image (Takumi card with part list + R2 thumbnail). Fallback OG card per chassis when no thumbnail exists.
- Phase 3: `/b/:id` embeds the interactive 3D assembled car.

### 4.6 i18n and SEO

One prerendered page per part (`/parts/15442-…`), chassis, guide and class, in each locale; JSON-LD `Product`; per-locale sitemaps. Part names in all locales live inline in the YAML so a single record feeds every locale; guide bodies are separate Markdown files per locale.

---

## 5. 3D builder feasibility

### 5.1 Findings

- **No reusable part-separated model library exists.** Sketchfab has one CC-BY Super-1 chassis (769k triangles, legacy chassis) and a few full cars of unclear licence; print sites hold custom accessories, not Tamiya GUP shapes. Everything found is dimensional reference only. The existing `public/images/4wd.glb` is a single baked model (3 meshes, 66k triangles) usable as a hero asset, not as a builder base.
- **Image-to-3D is not the main pipeline.** TRELLIS.2 (MIT), Hunyuan3D 2.1, Tripo and Meshy produce acceptable stylised **bodies** from a 3/4 product photo, but soften edges and lose sub-millimetre features (roller flanges, plate holes, gear teeth). Tamiya's 1–3 product photos are not the orthographic multi-view these models want. Photogrammetry of a real chassis works; black FRP and chrome rollers do not.
- **Procedural CAD is the sweet spot** for ~70% of parts: rollers, wheels, tires, plates, mass dampers, spacers and screws are revolves and extrusions with dimensions already in the catalog. build123d or CadQuery export GLB directly; one script with parameter tables regenerates the whole library in CI.
- **Blender** for chassis (2 in MVP, with named socket empties) and bodies (stylised, low-poly, no decals, for IP reasons).
- **Licensing:** Tamiya holds patents, design rights and trademarks. Simplified, dimensionally plausible representations referencing generic categories are the defensible path; do not offer GLBs for download; add a disclaimer.

### 5.2 Architecture

- One GLB per part variant, shared unit system, origin at mounting point, 6–8 shared PBR materials so parts can be recoloured at runtime.
- Chassis GLB carries named empty nodes as sockets (`socket_front_stay`, `socket_roller_FL_upper`, `socket_wheel_FR`, `socket_body`, `socket_motor`). Plates carry their own sockets so the part tree cascades (chassis → plate → roller). A JSON slot graph (slot → allowed categories, default, mirror flag) is the same structure the 2D builder and rule engine use.
- Pipeline: Blender / build123d → `gltf-transform optimize` (meshopt, quantisation, KTX2 for body textures) → `public/models/<category>/<id>.glb`.
- Runtime: `InstancedMesh` for rollers/screws; invisible oversized proxy volumes at sockets for raycast click-to-select (so 13 mm rollers are tappable on mobile); emissive highlight on hover; ghost placeholders for empty slots; preload chassis + defaults, lazy-load variants.
- Nuxt pitfalls: never import three at module scope in SSR paths; loaders in `.client.ts`; decoder WASM served from `public/`.

### 5.3 Effort

| Asset class | Count | Method | Hours |
|---|---|---|---|
| Chassis (MA + one of MS/VZ) with sockets | 2 | Blender | 30–40 |
| Bodies (stylised) | 4 | AI blockout → Blender retopo | 30–40 |
| Plates / stays / brake plates | 8 | Procedural | 15–20 |
| Rollers, wheels, tires, small parts | ~21 | Procedural | 12 + framework |
| Bumpers / dampers | 4 | Blender | 12–16 |
| Motor, gears, battery, switch | 5 | Blender low-poly | 5–10 |
| Materials, procedural framework, socket QA | | | 30–40 |
| **Total** | **~65–75 meshes** | | **~150–190 h** |

Roughly 4–6 weeks part-time for a one-person MVP asset set. Scaling to hundreds of GUP items afterwards is mostly parameter tables, which is the main argument for the procedural route.

---

## 6. Phased implementation plan

### Phase 0 — Foundation (1–2 weeks)
- Resolve branch layout: the deploy workflow targets `main`, which does not exist (branches are `master` and `gh-pages`). Decide on `main` + Actions deploy; retire the hand-managed `gh-pages` branch.
- Upgrade scaffold to Nuxt 4 + @nuxt/content v3 + @nuxtjs/i18n; define Zod schemas for parts / chassis / rules / guides / profiles.
- ~~Write the scraper; run once; commit ≈300–400 item YAMLs plus 8 chassis records~~ — done 2026-09-08 (382 parts + 8 chassis, see §3.2). Remaining: zh-TW names, which fall back to the imported zh-HK names until authored.
- Add PostHog.

### Phase 1 — Parts database, guides, 2D builder (4–6 weeks)
- Prerendered part, chassis, class and guide pages (zh-TW + en), sitemaps, JSON-LD, attribution page.
- Tutorials: class glossary (Open / Stock / B-MAX / B-Stock → Stock alias / Box Stock), chassis picker guide, motor guide, "first upgrade" guide, setup basics.
- Builder v0: chassis picker → slot list → part picker per slot with search/filter, rule engine warnings, class toggle, cost and estimated weight totals.
- Share v0: URL-encoded build, share page with part list and model-viewer chassis preview.
- Still on GitHub Pages.

### Phase 2 — Wizard, permalinks, community signals (4–6 weeks)
- Move hosting to Cloudflare Workers with static assets; DNS move; D1 migrations; R2.
- Short links, OG images, canvas thumbnail upload, Turnstile, rate limiting, server-side re-validation.
- Anonymous votes on builds and parts, view counts, "popular builds" and "most used parts" pages.
- Wizard with editable weight profiles seeded from the six archetypes.

### Phase 3 — 3D builder (6–10 weeks, asset work can start during Phase 1)
- Procedural part generator + Blender chassis/bodies + gltf-transform pipeline in CI.
- TresJS builder route: socket loading, click-to-select, hover highlight, swap animation, camera presets, mobile touch.
- 3D preview on share pages; AR via model-viewer on a baked export if feasible.

### Phase 4 — Identity and community (ongoing)
- Optional login, garages, comments, ja locale, contribution workflow (PRs or Nuxt Studio), price history from official feeds, per-course setting notes.

---

## 7. Risks and open questions

**Resolved:** *What "B-Stock" means locally* — the site owner confirmed on 2026-09-08 that B-Stock is local shorthand for **Stock Class**. It is modelled as an alias of Stock Class (and thus B-MAX GP), not as a separate ruleset. See §2.1.

| Risk / question | Mitigation |
|---|---|
| Tamiya IP: names, photos, 3D shapes | Facts + own text, own photos for builder parts, stylised 3D, disclaimer, no GLB downloads |
| 3D asset effort (150–190 h) dominates the timeline | Data-first ordering; procedural generation; start with one chassis (MA) and ~20 parts to validate UX before full asset production |
| Image-to-3D quality for thin parts | Only used for body blockouts; procedural/Blender for everything else |
| Cloudflare free-tier limits (KV 1K writes/day, D1 hard limits since 2026-09-01) | Use D1 not KV for writes; prerender everything; Workers Paid is $5/mo if ever needed |
| Scraper brittleness (Tamiya site is classic ASP, Shift_JIS) | One-off scrape committed to git; monthly diff run; manual review of new items |
| TC naming has no source of truth (HK 摩打 vs TW 馬達) | Store HK and TW variants; glossary page explaining both |
| Rule coverage can never be 100% | Three severities; "verify with organiser PDF" notes; rules are data so community can PR fixes |
| Existing scaffold is on EOL Nuxt 3 | Upgrade in Phase 0 before writing real content |

---

## 8. Prior art referenced

- PCPartPicker (rule-based compatibility with error/warning/note severities), keeb-finder builder (URL-encoded builds, no backend), KeebDepot (compatibility matrix), Gundamaxing / Bandai Builders Note (build showcase pages and ratings).
- Tamiya: chassis select guide, GUP matching list (GIF), gear matching list, setup guide, TAMIYA PASSPORT (events only), Mini 4WD Station (locator only).
- ミニ四駆 超速グランプリ (700+ scanned parts, 2D list + 3D car UX; service ended 2024-05-07).
- 4x4 Builder (open-source R3F vehicle configurator with URL config), BrickLink Studio (socket-graph part library).
- Japanese community: TEA-League, mini4wd.tech, ミニ四駆改造マニュアル@wiki, miniyonfan, mini4-masters. Traditional Chinese: TMU 台灣迷你四驅車聯盟, 台灣田宮四驅車同好會, HKM4A 香港迷你四驅協會, tamiya.hk setting guide, blog.hahasmile.com beginner glossary.

Full research notes with source URLs: `docs/research/concepts-and-rules.md`, `docs/research/data-sources.md`, `docs/research/3d-assets.md`, `docs/research/tech-stack.md`.
