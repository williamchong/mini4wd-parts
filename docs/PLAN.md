# mini4wd.parts — Product & Technical Plan

Status: draft v2, 2026-09-08. The catalog pipeline is built and 382 parts, 8 chassis and 305 kits are committed; §6 was re-targeted the same day around an MVP builder with a live 3D view, and M1a (kits) closed the same day.
Research notes that fed this document (concepts, data sources, 3D assets, tech stack) are summarised inline with source links.

---

## 1. Vision and scope

A Traditional-Chinese-first (English second, Japanese later) site for Mini 4WD beginners that combines:

| # | Feature | Milestone |
|---|---|---|
| F1 | Parts database (chassis, kits, Grade-Up Parts) with chassis compatibility and class legality | M1 |
| F2 | Tutorials: how to pick parts for different goals, class glossary (Open / Stock / B-MAX) | M2 |
| F3 | Car builder: start from a **kit** or a **bare chassis**, fill slots with parts, see compatibility warnings | **M1** |
| F4 | Shareable builds with part list, permalink and preview image | M1 (URL-encoded) → M2 (short links + OG image) → M3 (3D preview) |
| F5 | Beginner wizard / recommender (budget, class, course type → suggested build) | M4 |
| F6 | Ratings and popularity for parts and builds | M2 |
| F7 | 3D view of the assembled car, re-rendering live as parts change | **M1 (view-only)** → M3 (click the car to select) |
| F8 | Accounts, garages, comments, community data contributions | M4 |

Nothing like this exists today. Japanese resources are blog/wiki style and stale, Tamiya's compatibility matrix is a GIF image, the licensed Bandai game (超速グランプリ) shut down in May 2024, and there is no Traditional Chinese item-level database at all. See the prior-art notes in section 8.

### Guiding decisions

1. **Data first, 3D second — and the data is now paid for.** The builder, wizard, share pages and 3D view all sit on the same slot-graph data model, which landed on 2026-09-08 (382 parts, 8 chassis, a slot profile per chassis family). The ordering was never "3D last", it was "3D not before the data"; that condition is now met, so the 3D **view** moves into the MVP (§6 M1). What stays late is 3D as an *input* surface — clicking the car to select parts — because that is the expensive, risky half and the 2D list already does the job better on mobile.
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

Built 2026-09-08 as `scripts/catalog/` — four stages, deliberately separated so a re-run is cheap and can never overwrite hand-authoring:

1. **Scrape wide** (`npm run scrape`, or `--only=jp,compat,hk,fandom`): JP list pages → item ids → JP detail → per-chassis compat pages → tamiya.hk Store API → Fandom wiki. Throttled to one request per 700 ms with a disk cache under `.cache/`, ≈930 requests per full run (the EN catalog turned out to be unnecessary — the JP detail page carries the English name). Output: committed snapshots in `data/raw/*.json` covering **every** item in the parts genres, not just the v1 selection, so widening the catalog later costs no requests.
2. **Generate narrow** (`npm run catalog:generate`): raw snapshots + `data/taxonomy/*.yml` + `data/overrides/parts.yml` → schema-validated YAML in `content/parts/` and `content/chassis/`. Everything under `content/` is machine-written and rebuilt from scratch on every run.
3. **Hand-authored layer**: `data/overrides/parts.yml` (keyed by item number) and `data/chassis/*.yml`. Category corrections, motor legality, slot graphs and TW naming live here, never in `content/`. `npm run catalog:report` lists what still needs a human.
4. **Cross-check** (`npm run catalog:crossref`): our derived categories against the Fandom wiki's hand-written `Parts type`, joined on item number. Our categories come from ordered substring rules over Japanese names, whose one failure mode is a short keyword swallowing a longer word — an independent taxonomy is the cheapest detector for exactly that. A QA source only: CC-BY-SA, and nothing from it is written into `content/`. Its first run joined 121 of our 382 parts and caught two live defects (`シール` matching `シールド` and `シールタイプ`; propeller shafts filed as axles) plus a missing propeller-shaft slot.

Attribution page: Tamiya (facts, links), tamiya.hk (prices, zh-HK names), Fandom/Wikipedia (CC-BY-SA text where reused).

First run committed **382 parts** (244 regular GUP + 42 AO + 96 limited/special/station released since 2023-01) and 8 chassis. Coverage at that point: 99% categorised, 83% with chassis compatibility, 80% with HKD prices, 60% with a Traditional Chinese name.

**Kits came in a second pass, into their own snapshot.** The parts run covered only parts genres, so `data/raw/tamiya-jp-items.json` holds 690 items whose ids begin with 10/15/55/84/94/95 and no 18xxx or 19xxx. `KIT_GENRE_SERIES` adds the 14 kit genres under `3010` and writes `data/raw/tamiya-jp-kits.json` (448 items), kept separate so a kit re-scrape leaves the parts diff untouched. See §4.7.

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
| i18n | **@nuxtjs/i18n v10**, `prefix_except_default`, **zh-Hant** default, `/en/…`, later `/ja/…` | Keeps existing root URLs, emits hreflang/canonical, avoids the static-generation quirk of pure `prefix`. Region-neutral rather than zh-TW because every Traditional Chinese name in the catalog came from tamiya.hk: a zh-TW label would serve Hong Kong wording under a Taiwan flag for 100% of parts and kits. Hong Kong and Taiwan differ by a glossary, not by pages, so they are a reader-level wording toggle over one page set (`app/composables/useWording.ts`), not two locales. Promote zh-TW to a routed locale only if content diverges beyond terminology. |
| 3D display | **Google model-viewer** (already used) for hero, part previews, share pages | Cheap, AR-capable, but cannot compose meshes (only material variants). |
| 3D builder | **Three.js via @tresjs/nuxt** (v5.x, active) on the builder route only, client-only and code-split | Vue-native declarative scene graph; maps directly to the slot graph. Babylon is heavier; model-viewer cannot swap geometry. |
| Share/OG images | **nuxt-og-image v6** (Takumi renderer, runs on Workers) composing part list + a thumbnail captured from the builder canvas | Crawlers do not run WebGL, so the PNG must be pre-rendered. |
| Hosting | **Cloudflare Workers with static assets** (Pages is in maintenance mode), DNS for mini4wd.parts moved to Cloudflare | Unmetered static bandwidth, Worker only for `/api/*` and `/b/:id`. Free tier: 100K req/day, D1 5 GB / 5M reads / 100K writes per day (hard-enforced since 2026-09-01), R2 10 GB. |
| User data | **D1** (builds, votes, stats), **R2** (build thumbnails), **Turnstile** (abuse control) | Single vendor, no sleeping database (Supabase pauses after 7 idle days), no billing account needed (Firebase Storage now requires Blaze). |
| Auth | None in v1/v2 (device-id cookie + salted IP hash, one vote per build per device). v4: `nuxt-auth-utils` with GitHub/Google | Keep friction low; add identity only when garages/comments need it. |
| Analytics | Keep GA4; add PostHog for builder funnel, wizard completion, rule-warning frequency | PostHog plugin already available. |
| Data tooling | Node scraper in repo; `@gltf-transform/cli` for model optimisation; build123d (Python) for procedural part meshes | See section 5. |

`@nuxthub/core` is optional sugar over the same Cloudflare bindings (its managed admin was sunset 2025-12-31; the module continues self-host-first). Using Nitro's `cloudflare_module` preset directly is equally fine and avoids a dependency.

MVP can stay on GitHub Pages: everything in M1 is static, the 3D view included — TresJS runs in the browser. The move to Workers happens in M2 when short links and ratings need a database.

### 4.2 Data model

**parts** (one YAML per item, key = Tamiya item number)
- `id`, `names {ja, en, zh-TW, zh-HK?}`, `category`, `subcategory`, `series` (regular GUP / limited / special / AO / kit)
- `slots []` (which builder sockets it can occupy), `chassisCompat {include[], exclude[], notes}`
- `classLegality {open, stock_bmax, junior, notes}` (derived + override)
- `specs {rollerDiameterMm, rollerType, gearRatio, motorShaft, motorRpm[min,max], motorTorque, weightG, wheelDiameterMm, tireHardness, plateThicknessMm, …}`
- `priceJpy`, `priceHkd`, `releaseDate`, `status` (current / limited / discontinued)
- `images []`, `model3d {glb, attach}`, `requires []`, `tags []`, `roles []` and scoring attributes for the wizard

**chassis**: id, names, family, motor position, shaft type, wheelbase/tread/weight, kit gear ratios, `slots [{id, type, maxCount, mirror, required}]` (plus `socketNode` when the 3D sockets land, §5.2), kits [].

**rules**: declarative JSON (see 4.3). **guides**: Markdown per locale. **profiles**: wizard weight vectors.

**D1 tables**: `builds(id, short_id, chassis_id, parts_json, class, title, locale, thumb_key, created_at, view_count)`, `votes(build_id, voter_hash, value, UNIQUE)`, `part_votes(part_id, voter_hash, value)`, `build_stats` (materialised).

A compact `catalog.json` (ids, names, category, slots, compat, key specs) is shipped to the client so the builder and rule engine run without database reads.

### 4.3 Rule engine

Declarative rules evaluated in the browser and re-validated by the Worker at share time. Rule types: slot capacity, unfilled `required` slots (§4.2 — the build is not a runnable car), chassis compatibility, motor shaft type, class legality (per selected class), dependencies (`requires`, e.g. bearing rollers need 2 mm screws), mutual exclusion, numeric constraints (total width ≤ 105 mm, tire 22–35 mm, weight ≥ 90 g estimate). Output is a list of `{ruleId, severity: error|warning|note, parts[], message{locale}}` displayed inline, PCPartPicker style. Never claim 100% coverage; show "verify against organiser PDF" notes for class rules.

### 4.4 Wizard / recommender

A rules-based scorer over the same catalog. Inputs: chassis owned or none, class, course type (flat / 3D / unknown), budget, experience. A `profiles` collection maps answers to weight vectors over part attributes (stability, speed, cost, ease); hard filters are compat, legality and budget. Output is a build the user can open in the builder. Community popularity (votes, inclusion counts) is added as one more weight once M2 has collected it — which is why the wizard sits in M4, after the data that makes it good. No ML.

### 4.5 Sharing

- M1: build encoded in the URL (versioned compact byte array → base64url, e.g. `/build#v1.…`). Zero backend; share page renders the part list and a model-viewer preview of the chassis.
- M2: `POST /api/builds` → short id, `/b/:id` page with OG image (Takumi card with part list + R2 thumbnail). Fallback OG card per chassis when no thumbnail exists.
- M3: `/b/:id` embeds the interactive 3D assembled car.

### 4.6 i18n and SEO

One prerendered page per part (`/parts/15442-…`), chassis, guide and class, in each locale; JSON-LD `Product`; per-locale sitemaps. Part names in all locales live inline in the YAML so a single record feeds every locale; guide bodies are separate Markdown files per locale, one @nuxt/content collection each (`content/zh-Hant/**`, `content/en/**`).

Traditional Chinese is one page set, not two: `zh-Hant` at the root, with `zh-HK` and `zh-TW` hreflang alternates pointing at the same URL and a wording toggle deciding which regional term a reader sees. `resolveName` in `shared/catalog/names.ts` applies the same preference to catalog names, and prose reaches it through the `:term{name="…"}` MDC component.

### 4.7 Kits and build presets

The MVP's two entry points — bare chassis and existing kit — are the same object with different seeds.

**A build** is `{ chassis, kit?, class, slots: { [slotId]: Array<{ partId, origin }> } }`, where `origin` is `stock` (came with the kit or the chassis' own runner) or `swapped` (the user chose it). Carrying `origin` is what makes three things fall out for free: a "what you changed from the box" diff, a shopping list of only the parts you still need to buy, and a legality check that can say *which* modification broke Stock Class.

- **Bare chassis:** seed from the chassis' `defaultLoadout` (kit gears, plastic rollers, kit wheels/tires, shafts, FA-130), leave every slot it does not name empty. `defaultLoadout` decides what is seeded, not the slot's `required` flag (§4.3).
- **From a kit:** seed from the kit's `stockLoadout` — the chassis `defaultLoadout` overlaid with the kit's own body and its per-kit differences, since a kit may ship a different gear ratio, low-profile wheels or harder tires.

#### Where the kit data comes from

Two sources, and the split matters because they have opposite gaps.

**Tamiya** has no kit records in our snapshot at all (§3.2), but remains the only source for **price, release date, official URL and the zh-HK names** the HK store join supplies — so the kit genres have to be added and re-scraped regardless.

**The Fandom wiki turns the loadout from hand-authoring into an import.** Tamiya publishes no structured bill-of-materials — its kit pages give the chassis and prose — but the wiki's `Template:Technical Info List` is a per-item spec table, and it is well populated. Measured 2026-09-08 across 305 articles:

| | |
|---|---|
| rows (one per kit variant) | 819 |
| distinct item numbers | 819, of which **334 are 18xxx/19xxx kits** |
| chassis type | 99.9% |
| wheel size / type / spoke / fitment / colour / material | 99–100% |
| tire size / type / colour / material | 99.6–100% |
| gear ratio | 98.2% |
| motor | 86.8% |
| body colour / material, L × W × H | 94–100% |

That is exactly the **kit-specific delta** — the slots where kits differ from one another. What it omits (plastic rollers, shafts, bearings, terminal, gear cover) is precisely what the chassis `defaultLoadout` supplies uniformly. So the two sources compose: wiki for the delta, `defaultLoadout` for the rest, `data/overrides/kits.yml` only for the outliers rather than for all 300-odd kits by hand.

Caveats to hold onto: the wiki skews toward notable and anime-derived cars over current shelf stock, so a recent kit may be missing; its fields are free text (`Wheel type=Low-Profile Fin-Type`); and it is **CC-BY-SA**, so kit pages that use it must attribute, not just the attribution page. Tamiya stays canonical wherever the two disagree on a fact.

#### What the join actually yields (built and measured 2026-09-08)

The 819 rows are not 819 usable kits — over half sit on chassis we do not model. Walking all 14 kit genre list pages and joining on item number gave:

| | |
|---|---|
| Tamiya kit ids across the 14 in-scope genres | 448 |
| of those, carrying a chassis tag | 433 |
| **of those, on a v1 chassis — the committed catalog** | **305** |
| by chassis | ma 69, vs 50, super-2 50, ms 50, ar 34, fm-a 29, vz 21, me 2 |
| covered by a wiki loadout | 96% (13 kits fall back to the chassis default) |
| with a gear ratio | 97% |
| with an HKD price | 78% |
| with a Traditional Chinese name | 33% |

**Deciding a kit's chassis needs both signals, in the right order.** The chassis tags on a kit page are a *compatibility* list, not a statement about the box: ロボレース デボット2.0 (MAシャーシ) is tagged `ms`, `ar` and `ma`, so reading the first tag files an MA kit under MS — a wrong slot profile and a wrong `defaultLoadout`, and nothing downstream can catch it because MS is a real chassis. So the **name** wins where it names a chassis, the **tag** is trusted only when it leaves one in-scope answer, and the rest are left for `data/overrides/kits.yml`. Across 448 kits that is 4 with multiple tags, of which 2 the name settles, 1 is out of scope anyway, and exactly 1 (95586 ディオマース・ネロ) needs a human.

Three findings changed the design, and all three point the same way — **the wiki describes a box, it does not enumerate purchasable parts**:

1. **The motor field is worthless and does not need to be.** 423 of 463 v1 rows say `Standard`, which is the normal motor the chassis `defaultLoadout` already supplies. Only a real upgrade is a delta worth storing.
2. **Tamiya rarely supplies the gear ratio.** Its 【基本スペック】 block carries `ギヤ比` on about 5% of kit pages (2 of a 40-kit sample), against the wiki's 98%. So the two are not interchangeable: **Tamiya is canonical for identity, price, date and chassis; the wiki carries the loadout.** Where Tamiya does print a ratio it still wins, and those are the newest kits — which is how ME gets one despite having no wiki row.
3. **Most loadout entries can never have an item number.** `Wheel type = Low-Profile Saber-Type` is moulded into the kit and Tamiya has never sold it as a Grade-Up Part. So a loadout entry carries an optional `partId` **and** a free-text `label`, and a label with no item number is the normal case. That is also what makes the shopping list correct: an entry with no `partId` is something you already own and cannot buy.

That last point retires the "free-text → item-number lookup table per chassis" this section used to call for. There are 47 distinct wheel types and 14 tire types across the v1 rows, and authoring a mapping for them up front would mostly produce mappings to nothing. `npm run catalog:report` lists the labels by frequency instead, so `data/overrides/kits.yml` can name the few that really do correspond to a catalog part.

ME is the coverage hole — Tamiya lists only two ME kits so far and the wiki covers neither — but that is mitigated: Tamiya prints `ギヤ比` in its own spec block on about one kit page in twenty, and those are the newest kits, so ME still gets a real gear ratio. Where the two disagree Tamiya wins, per §3.

#### Schema and work

**New `kits` collection** (`content/kits/*.yml`, generated like parts): `id`, `names {ja, en, zh-TW, zh-HK}`, `series`, `seriesNumber`, `chassis`, `gearRatio`, `stockLoadout`, `loadoutSource`, `loadoutSourceTitle`, `priceJpy`, `priceHkd`, `releaseDate`, `status`, `officialUrl`. `bodyArchetype` is deliberately absent until the 3D work needs it: nothing can fill it yet, and the catalog omits fields it cannot fill rather than stubbing them.

**New field on chassis:** `defaultLoadout` — slot id → what the bare runner provides. Hand-authored in `data/chassis/*.yml`, eight records.

A kit stores only the **delta** over its chassis' `defaultLoadout`, not the merged result. Seeding a build merges the two, which the bare-chassis entry point needs anyway, and it means re-authoring a chassis default does not require regenerating every kit that uses it.

1. Add `KIT_GENRE_SERIES` to `scripts/catalog/sources/tamiya-jp.ts` alongside `GENRE_SERIES` (14 codes; Wild, Dangun and Train stay out per §3.1). The genre becomes a type parameter on `ListEntry`/`JpItem`, so a kit reaching the part builder is a compile error rather than a bogus `gupNumber`.
2. Add a `Technical Info List` reader to `sources/fandom.ts`. `parseTemplate` had to become `parseTemplates`: a car article carries one call per variant and the old parser returned only the first.
3. Scrape kits into their own `data/raw/tamiya-jp-kits.json`, so a kit re-scrape leaves the parts diff alone.
4. Author `defaultLoadout` for the eight chassis.
5. Extend `shared/catalog/schema.ts` with `kitSchema`, `loadout` and `defaultLoadout`, register the collection in `content.config.ts`, and extend `catalog:verify`. The verify check has to resolve a loadout's slot **id** to the chassis profile's slot **type** before testing a part against it — the profile calls a shaft slot `axle` and a gear slot `gear-set`, so comparing ids to types directly would pass almost anything.

Scoping note: M1 does not need all 448 kits, only enough current, in-shops kits that a beginner recognises the box on their desk. The 292 that landed with a wiki loadout make that a coverage question rather than an authoring one.

Two prefix fixes fell out of this work: the wiki item-number pattern was missing `17`, `92` and `93` (limited kit variants), which is why the count above is 819 rather than the 639 first measured, and the tamiya.hk SKU filter was missing `17` (Beginner's kits).

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

### 5.4 Cutting that down for M1

150–190 h is the roadmap's long pole and it is not an MVP. Three decisions cut it to roughly **40–50 h** without giving up the thing the owner actually asked for — watching a 3D car change as you swap parts.

**1. Parametric by category, never per item.** A 19 mm aluminium roller and a 19 mm plastic roller are one revolve with two parameter sets. Build the generators against `category` + `specs`, not against item numbers, and 383 parts collapse to about a dozen scripts. The catalog already carries the parameters (`rollerDiameterMm`, `wheelDiameterMm`, `plateThicknessMm`, …), which is exactly what §3's spec extraction was for.

**2. A universal fallback, so no build can fail to render.** Any part with no generator draws a labelled grey proxy sized from its specs (or a category-default box). This is the load-bearing decision: it decouples asset production from catalog coverage entirely. The builder ships when the *chassis* is done, and every generator added after that is a silent visual upgrade with no code change. Without this rule, 3D blocks on 383 meshes and never ships.

**3. One chassis, generic bodies.** §7 already mitigates the asset risk with "start with one chassis (MA) and ~20 parts to validate UX". M1 takes that literally: **MA only** in 3D. MA is the right pick — most kits (69), monocoque so it is one mesh, and beginner-facing. The other seven chassis get the full 2D builder plus a still image and a "3D preview coming" note. Bodies are **3 generic stylised archetypes** assigned per kit, not per-kit shapes: bodies are simultaneously the most expensive geometry and the highest IP risk (§5.1), so buying only 3 of them is doubly right. Label them in the UI as representative shapes.

**Sockets reuse the slot ids that already exist.** The empty nodes in the chassis GLB are named for the ids in `data/taxonomy/slots.yml` — `roller-front`, `wheel-rear`, `front-stay`, `body`, `motor`. No socket-name mapping table, no second data model: the 3D pane reads the same build object the 2D list writes, and `parent.getObjectByName(slotId).add(mesh)` is the whole attach step. Mirrored slots (`mirror: true`) get `-l`/`-r` suffixed sockets and one mesh instanced twice.

**Priority is what you can see.** Body, wheels, tires, rollers, stays and chassis colour carry essentially all the visual difference between two builds. Motor, gears, terminal, bearings, switch and screws are hidden or sub-millimetre — crude shapes or nothing, and no one will notice.

| M1 asset | Count | Method | Hours |
|---|---|---|---|
| MA chassis, slot-named socket empties | 1 | Blender | 15–20 |
| Generic stylised bodies | 3 | AI blockout → Blender retopo | 8–12 |
| Parametric generators (roller, wheel, tire, plate/stay, brake, mass damper, spacer, screw, bearing, shaft, motor, gear) | ~12 | build123d → GLB | 10–14 |
| Shared materials, fallback proxy, socket QA | — | | 6–8 |
| **M1 total** | | | **~40–50 h** |

**M1's 3D pane is view-only.** Selection stays in the 2D list: it is faster, it works on a phone, it is accessible, and it needs no raycast proxies, no hover outlines and no touch tuning. Click-the-car-to-select is deferred to M3 (§6) with the rest of §5.2's interaction work.

---

## 6. Roadmap

Re-targeted 2026-09-08. The owner set the MVP as: **start from a bare chassis or an existing kit, swap parts in a compatibility-checked list, and watch a 3D model of the result update.** That pulls the 3D view (F7) forward out of the old Phase 3 and pushes the wizard (F5) and community signals (F6) back behind it. §1's data-first ordering is not abandoned, it is spent — see guiding decision 1.

Milestones are renamed M0–M4 to make clear they are not the old Phase 0–4.

### M0 — Foundation (remaining, ~1 week)

- Add PostHog, so the builder funnel has a baseline from its first day.
- ~~Push the four local commits (`8f41dbb`…`4d00ff3`)~~ — done 2026-09-08; the catalog is live.
- ~~Resolve branch layout: `main` + Actions deploy, retire the hand-managed `gh-pages` and the stale `master`~~ — done 2026-09-09; Pages reports `build_type: workflow` and only `main` remains.
- ~~Add `@nuxtjs/i18n` **before** any real routes exist, so `/parts/…` and `/build` are born with `prefix_except_default` rather than retrofitted~~ — done 2026-09-09 (§4.1, §4.6).
- ~~Nuxt 4 + @nuxt/content v3 scaffold, Zod schemas~~ — done, `83086af`.
- ~~Scraper and catalog pipeline; 382 parts + 8 chassis~~ — done 2026-09-08 (§3.2).

### M1 — MVP: the builder (the target)

Three workstreams. The catalog and builder ones are independent of the asset one, and the fallback proxy (§5.4) means the builder ships whether or not the meshes are ready — start them in parallel and let the 3D fidelity climb behind a working product.

~~**a. Catalog: kits (§4.7).**~~ — done 2026-09-08. 305 kits across the 8 v1 chassis, 96% with an imported `stockLoadout`, plus a hand-authored `defaultLoadout` on all 8 chassis. Nothing was hand-authored per kit.

**b. Site and builder.**
- Part and chassis pages, prerendered per locale, JSON-LD `Product`, sitemap, attribution page. These are what search engines see and they are cheap now that the data exists.
- `/build` with two entry points: kit picker (search by name or item number, filtered to current kits) or bare-chassis picker.
- Slot list from the chassis' profile, each row showing its part, `stock` vs `swapped`, and a swap action.
- Part picker per slot: filtered by slot type, chassis compatibility and the selected class; searchable; shows price and the specs that matter for that slot.
- Rule engine (§4.3) inline, three severities. Ship the rules that the committed data can actually answer — slot capacity, chassis compat, motor shaft type, class legality, tire diameter — and leave the ones needing data we do not have (total width, precise weight) as explicit "not checked yet" rather than guessing.
- Totals: part count, JPY and HKD cost, estimated weight, final gear ratio.
- Build encoded in the URL (§4.5); reload restores; copy-link shares.

**c. 3D view (§5.4).** MA chassis with slot-named sockets, 3 generic bodies, ~12 parametric generators, the fallback proxy, `@tresjs/nuxt` on the `/build` route only, client-only and code-split. View-only: orbit, zoom, reset camera. Other chassis show a still and a notice.

**M1 is done when:** a beginner can open `/build`, pick the kit box on their desk, change the motor and rollers, see a warning that the motor is Open-only, see the cost of what they still need to buy, watch the car update in 3D, and send the link to a friend — in Traditional Chinese and en.

**Explicitly not in M1:** the wizard, votes, accounts, short links, OG images, D1, click-to-select in 3D, per-kit body shapes, chassis other than MA in 3D. Still on GitHub Pages, still fully static.

### M2 — Permalinks, sharing, community signals (4–6 weeks)

Move to Cloudflare Workers with static assets; DNS to Cloudflare; D1 and R2. Short links and `/b/:id`, canvas-snapshot thumbnails to R2, `nuxt-og-image` share cards, Turnstile, rate limiting, server-side re-validation of shared builds. Anonymous votes on builds and parts, view counts, "popular builds" and "most used parts". Guides and tutorials (F2): class glossary, chassis picker, motor guide, first-upgrade guide, setup basics.

### M3 — Full 3D builder (6–10 weeks)

The remaining chassis, per-kit bodies where they are worth modelling, the rest of the parametric library, and 3D as an *input* surface: raycast slot proxies, click-to-select, hover highlight, swap animation, camera presets, mobile touch tuning (§5.2). 3D preview on share pages; AR via model-viewer on a baked export.

### M4 — Wizard, identity, community (ongoing)

Beginner wizard (F5) seeded from the six archetypes in §2.5 and weighted by the popularity data M2 collects — it is a better recommender with real usage behind it, which is why it moved after M2 rather than before. Optional login, garages, comments, `ja` locale, contribution workflow, price history, per-course setting notes.

---

## 7. Risks and open questions

**Resolved:** *What "B-Stock" means locally* — the site owner confirmed on 2026-09-08 that B-Stock is local shorthand for **Stock Class**. It is modelled as an alias of Stock Class (and thus B-MAX GP), not as a separate ruleset. See §2.1.

| Risk / question | Mitigation |
|---|---|
| Tamiya IP: names, photos, 3D shapes | Facts + own text, own photos for builder parts, stylised 3D, disclaimer, no GLB downloads |
| 3D asset effort (150–190 h) dominates the timeline | M1 buys only ~40–50 h of it: one chassis, 3 generic bodies, ~12 parametric generators, and a labelled fallback proxy so the builder ships independently of mesh coverage (§5.4) |
| Pulling 3D into the MVP repeats the mistake §1 warned about | The 3D **view** is cheap and bounded; the 3D **input** surface (raycast proxies, click-to-select, touch tuning) is the expensive half and stays in M3. If the MA chassis mesh slips, the fallback proxy means M1 still ships with a recognisable car |
| ~~Tamiya publishes no bill-of-materials for kits, so "start from my kit" has no source~~ | Resolved 2026-09-08: 305 kits committed, 96% with a `stockLoadout` imported from the wiki's `Technical Info List`, the chassis `defaultLoadout` supplying the rest, and the 13 uncovered kits degrading to it rather than breaking (§4.7) |
| Wiki kit data is CC-BY-SA and free text, not item numbers | Each kit carries `loadoutSourceTitle` so kit pages attribute on the page itself, not only the attribution page. Free-text values are deliberately **not** forced into item numbers: a loadout entry may carry a label alone, which is correct because most moulded parts were never sold separately. `catalog:report` ranks those labels by frequency so `data/overrides/kits.yml` can name the few that do map. Tamiya stays canonical on any fact the two disagree on |
| Body shapes are the highest IP risk and the priciest geometry | M1 ships 3 generic stylised archetypes shared across kits, labelled in the UI as representative, not per-kit reproductions (§5.4) |
| Image-to-3D quality for thin parts | Only used for body blockouts; procedural/Blender for everything else |
| Cloudflare free-tier limits (KV 1K writes/day, D1 hard limits since 2026-09-01) | Use D1 not KV for writes; prerender everything; Workers Paid is $5/mo if ever needed |
| Scraper brittleness (Tamiya site is classic ASP, Shift_JIS) | One-off scrape committed to git; monthly diff run; manual review of new items |
| TC naming has no source of truth (HK 摩打 vs TW 馬達) | Store HK and TW variants; glossary page explaining both |
| Rule coverage can never be 100% | Three severities; "verify with organiser PDF" notes; rules are data so community can PR fixes |
| ~~Existing scaffold is on EOL Nuxt 3~~ | Resolved: upgraded to Nuxt 4 + @nuxt/content v3 in `83086af` |

---

## 8. Prior art referenced

- PCPartPicker (rule-based compatibility with error/warning/note severities), keeb-finder builder (URL-encoded builds, no backend), KeebDepot (compatibility matrix), Gundamaxing / Bandai Builders Note (build showcase pages and ratings).
- Tamiya: chassis select guide, GUP matching list (GIF), gear matching list, setup guide, TAMIYA PASSPORT (events only), Mini 4WD Station (locator only).
- ミニ四駆 超速グランプリ (700+ scanned parts, 2D list + 3D car UX; service ended 2024-05-07).
- 4x4 Builder (open-source R3F vehicle configurator with URL config), BrickLink Studio (socket-graph part library).
- Japanese community: TEA-League, mini4wd.tech, ミニ四駆改造マニュアル@wiki, miniyonfan, mini4-masters. Traditional Chinese: TMU 台灣迷你四驅車聯盟, 台灣田宮四驅車同好會, HKM4A 香港迷你四驅協會, tamiya.hk setting guide, blog.hahasmile.com beginner glossary.

Full research notes with source URLs: `docs/research/concepts-and-rules.md`, `docs/research/data-sources.md`, `docs/research/3d-assets.md`, `docs/research/tech-stack.md`.
