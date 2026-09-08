> Research snapshot from 2026-09-08. Where this differs from `docs/PLAN.md`, the plan is authoritative.

> **Corrected 2026-09-08 by the first scraper run** (`scripts/catalog/`). Four points below were wrong or incomplete:
> 1. **The JP detail page already carries the English name**, in the `<span>` right after the `<h1>`. The English catalog does not need to be scraped at all — that removes ~400 requests and a parser.
> 2. **tamiya.hk carries a Traditional Chinese name per SKU** in the Store API's `short_description` (`15549` → 「田宮 15549 HG 碳纖維 闊身後置支架 (2mm) (滑動阻尼裝置用)」), not just English. It covers 60% of our v1 selection, which turns per-item TC naming from "author all of it" into "fill the gaps".
> 3. **Decode with `new TextDecoder('shift_jis')`** (Node's WHATWG decoder is Windows-31J), *not* strict Shift_JIS. `iconv -f SHIFT_JIS` aborts on the NEC extension characters in item names and silently truncates the GUP list page from 20 items to 4.
> 4. **Page sizes differ per view**: the product lists page at 20, the per-chassis compatibility pages at 40. Genres that fit on a single page render no pager block at all, so an absent item count is normal rather than a markup change.
>
> Volumes actually retrieved: 690 parts across the six parts genres, 1,104 Mini 4WD SKUs from tamiya.hk, and 175–470 compatible items per chassis (ME is newest and smallest, MA largest).

# Mini 4WD parts database — data-source feasibility (2026-09-08)

Summary verdict up front:

| Source | Feasibility | Use for |
|---|---|---|
| Tamiya JP product catalog (tamiya.com/japan) | **Easy** (HTML scrape, stable URLs, no robots.txt) | Canonical item master: item no., JP/EN name, price, release date, description, spec, 使用可能シャーシ, chassis tags, 2 images |
| Tamiya EN product catalog | Easy but thin | English names/descriptions only; no price/date/compat |
| Tamiya per-chassis compat catalogs (`product_info_ex.html?genre_item=mini4wd_chassis_*`) | **Easy** | Chassis→parts compatibility matrix (e.g. AR: 428 items) |
| Tamiya manuals/PDFs | Medium/limited | Only lineup catalogs + parts catalogs + per-chassis parts-list PDFs; no per-kit 組立説明書 online |
| Tamiya official regulations (公認競技会規則, ストッククラス) + B-MAX GP | Easy (text) | Rule text; **no enumerated parts list** exists |
| Mini 4WD Fandom wiki | Medium; CC-BY-SA; MediaWiki API works | 91 GUP pages w/ infobox, 33 chassis pages, 337 car pages; English prose, good for chassis history |
| Japanese community DBs (TEA-League, miniyonku.net, atwiki) | Hard/low value (stale, CGI broken, Cloudflare) | Occasional cross-check only |
| tamiya.hk (official HK distributor, WooCommerce) | **Easy** (public Store API) | HK prices, chassis filter taxonomy, TC category names; product names are English |
| 1999.co.jp / tamiyausa.com | Hard (Cloudflare / bot detection) | Skip |
| Open datasets / GitHub | None usable | Build our own |

---

## 1. Tamiya official product catalog

### English site (`https://www.tamiya.com/english/products/list.html?genre_item=e_3030`)

Observed (fetched 2026-09-08, page is Shift_JIS-encoded HTML, no robots.txt — `/robots.txt` returns the site's 404 page):

- **205 results** in `e_3030` "Mini 4WD Parts", **20 per page, 11 pages**. Pagination: `list.html?field_sort=d&cmdarticlesearch=1&genre_item=e_3030&absolutepage=N`. Sort form has `sortkey=sort_rd|sort_ga` (release date / item no.).
- Other EN genre counts: `e_30` Mini 4WD (all) 351; `e_3010` Kits 133; `e_303010` Grade-Up Parts 170; `e_301030` Racing Mini 4WD 30; `e_301080` PRO 45.
- Sub-genre codes (same tree in JP without the `e_` prefix): `3010` kits → `301010` Mini 4WD, `301020` Wild, `301030` Racer, `301031` Racer Special, `301040` Fully Cowled, `301050` Aero, `301051` Laser, `301070` REV, `301080` PRO, `301081` Super, `301082` Mighty, `301083` Real/Mechanical, `301084` Beginners, `301085` 特別企画(マシン), `301086` 限定(マシン), `301089` Dangun, `301090` Train; `3020` Batteries; `3030` Parts → `303010` GUP, `303020` 特別企画(パーツ), `303025` 限定(パーツ), `303030` AO parts; `3040` Circuits; `3050` Mini 4WD Station limited.
- List-page fields per item (`<li><a data-article="15549">`): item no., name, category label, thumbnail `//d7z22c0gz59ng.cloudfront.net/cms/img/usr/item/{first digit}/{item}/{item}_s.jpg`. A hidden `<!-- -->` table also contains a post timestamp per item (`2026/08/05 00:00`).
- Detail URL: `https://www.tamiya.com/english/products/{item}/index.html`. EN detail has: name, `Item No:`, one description paragraph, OG meta, "Tags" block (empty on EN for 15549), "Information is current as of …" line. **No price, no release date, no compat list on EN.**
- Images: `{item}_s.jpg` = **600×450** (28 KB), `{item}_1.jpg` = **1000×750** (65 KB); `_2`/`_3` 404 for parts (kits also only `_1`+`_s` in samples). CDN is CloudFront, hot-linkable technically, but copyrighted.
- **No JSON API.** Site search is Yahoo! Custom Search JS; the catalog is server-rendered classic ASP-style (`cmdarticlesearch`, `absolutepage`).

### Japanese site (`https://www.tamiya.com/japan/products/list.html?genre_item=3030`) — richer, use this as primary

- Counts: `30` all Mini 4WD **1,203件**; `3010` kits 469; `3030` parts **631** (32 pages × 20); `303010` GUP 244; `303020` 特別企画パーツ 262; `303025` 限定パーツ 83; `303030` AO 42; `3050` Station限定 52; `3040` circuits 30; `301030` Racer kits 105; `301080` PRO 64.
- JP detail page (`/japan/products/{item}/index.html`) fields observed on 15549 and kit 18025:
  - `Item No:15549`, JP name, EN name, series label ("タミヤ ミニ四駆グレードアップパーツ …")
  - **Release**: `2026年2月21日(土)ごろ発売`; kits also `【初回発売月】 1990年1月…` (re-release history)
  - **Price**: `1,078円 （本体価格980円）`
  - Description paragraph, `【基本スペック】`, `【使用可能シャーシ】 ME､MA､MS､VZ、AR､VS､スーパーII…` (free text)
  - **Structured chassis tags** `シャーシ一覧` linking to `product_info_ex.html?genre_item=mini4wd_chassis_super2|vs|ar|vz|ms|ma|me…`
  - Kits: `全長=127`, `全幅86mm 全高53mm`, motor included, chassis tag.
  - `情報は2026年01月06日時点のものです` snapshot date.
- **Chassis compatibility catalogs** ("ミニ四駆シャーシ別 対応パーツ検索"): `https://www.tamiya.com/japan/products/product_info_ex.html?genre_item=mini4wd_chassis_ar` → **428件** for AR (11 pages, same pagination). EN equivalent `…/english/products/product_info_ex.html?genre_item=e_mini4wd_chassis_ar` and `…,e_machine_kit` to restrict to kits. 21 chassis codes: `ar FM FM_A ma me ms super1 super2 superFM superTZ superTZ_X superX superXX type1…type5 vs vz zero`. Index: `https://www.tamiya.com/english/cms/mini4wd_chassis_select.html` (JP: `/japan/cms/mini4wd_chassis_select.html`).
- Also: `ミニ四駆グレードアップパーツマッチングリスト` (`/japan/mini4wd/regulation/1709/parts1709.html`) is a **GIF image** (`parts_matching_2305_v1.gif`) — not scrapeable; the per-chassis pages above are the machine-readable version. Gear-ratio matching: `/japan/mini4wd/regulation_gear.html`.

### Legal / practical

- No `robots.txt`; footer has only cookie/privacy policy; the downloads page states 説明図/パンフレット are © Tamiya and may not be reproduced/redistributed. Product text and photos are copyrighted; **facts** (item no., price, date, dimensions, compat) are not.
- Recommended approach: **one-off scrape → committed JSON in repo** (≈1,200 JP pages + 21 chassis pages ≈ 1,300 requests, throttled), re-run monthly via GitHub Action for new items (sort by `sort_rd`). Store facts + our own short TC descriptions; **link** to tamiya.com detail pages and **hot-link or cache `_s.jpg` thumbnails at your own risk** — safest is linking to the official page with a small thumbnail and attribution, or shooting own photos for the initial scope.

## 2. Official assembly guides / manuals

- **No per-kit or per-GUP 組立説明書 PDFs online.** Kit detail pages (checked 18025, 95719) carry no PDF links. The downloads page `https://www.tamiya.com/japan/customer/downloads/mini4wd/index.html` says explicitly that not all products' 説明図 are published and that they are © Tamiya (no copying/redistribution); RC manuals exist (`/japan/customer/downloads/rc/`), Mini 4WD only gets pamphlets.
- What *is* downloadable (CloudFront `…/cms/img/usr/inst/pdf/mini4wd/`):
  - Lineup catalogs `adv/lineup1604.pdf … lineup2510_v1.pdf` (semi-annual, latest Oct 2025)
  - **Parts catalogs** `parts/parts1604.pdf … parts2506_v3.pdf` (latest June 2025 — the "MINI 4WD TUNE-UP PARTS" catalog with photo, item no., short blurb per part; great as a reference for TC copywriting)
  - Parts matching PDFs `parts/parts_matching_1604/1704/1709.pdf`
  - **Per-chassis parts lists** `parts/AR_L_2021_2.pdf`, `FMA_L_2021.pdf`, `MA_L_2021.pdf`
- Guides: EN Mini 4WD Guide `https://www.tamiya.com/english/mini4wd/setupguide/setupguide.htm`; JP `セッティングの基礎知識` `https://www.tamiya.com/japan/cms/mini4wdsettingguide_basic.html`; chassis select guide `/japan/cms/mini4wd_chassis_select.html`; EN item top `/english/mini4wd/m4item/m4item.htm`.
- Mini 4WD Station list `https://www.tamiya.com/japan/mini4wd/mini4wdstation`; regulations `/japan/mini4wd/regulation.html`, `/japan/mini4wd/regulation_stockclass.html`; EN regulation `/english/mini4wd/regulation.htm`.
- Verdict: **Medium** — use the parts catalog PDF + setting guide as source material for part-usage explanations (paraphrase, don't reproduce). Link to Tamiya for anything else.

## 3. Wikis

### Mini 4WD Fandom wiki (`https://mini-4wd.fandom.com`)

- API works: `https://mini-4wd.fandom.com/api.php` (MediaWiki 1.43.9). Stats: **608 content articles**, 3,209 pages, 2,078 images, 14,649 edits, 3 active users; recent edits 2026-09-06 (alive but small). License **CC-BY-SA** (`https://www.fandom.com/licensing`).
- Categories: Mini 4WD cars 337 (Racing 91, PRO 68, Fully Cowled 32, REV 23, Aero 11, Super 13, Wild 15…), **Grade-Up Parts 91**, **Chassis 33**, Motors 17, Batteries 22, Wheel and tire sets 12, Stays and side guards 12, Circuits 15.
- Structured templates: `Template:Infobox Grade-Up Parts` (fields: No., Release Date, Parts type; groups Motor {Rev, Torque, Electric consumption, Weight}, Battery, Charger, Stay {Type, Material}, Wheels {Type, Spokes, Size, Width, Fitment, Material}, Tires {Type, Size, Width, Surface, Material} …), `Infobox Mini 4wd info` (cars), `Chassis data`/`Chassis stats`, `Infobox Tools`, navboxes per series/motor/chassis. Export via `action=parse&prop=wikitext` or `action=query&generator=categorymembers`.
- Quality: English prose is decent for chassis history (e.g. MA Chassis page: release June 2013, design notes, compatibility remarks). Coverage of GUP is shallow (91 of ~600 parts). Good for chassis/car narrative, not a parts master.

### Japanese

- Wikipedia JP `ミニ四駆` and zh `迷你四驅` (`https://zh.wikipedia.org/zh-tw/迷你四驅`, 75 KB): chassis timeline, boom history, TC terms (馬達, 導輪, 軸承, 齒輪, 電池, 改裝零件, 碳纖/FRP), HK distributor "偉高模型" mention. CC-BY-SA.
- `ミニ四駆改造マニュアル@wiki` (`https://w.atwiki.jp/mini_4wd/`, e.g. 用語集 `pages/211.html`) — Cloudflare "Just a moment" to curl; glossary/technique content, not a DB.
- TEA-League GUP list `https://www.tea-league.com/mt/tea/archives/1990/01/post_720.html` lists **517 distinct 15xxx/94xxx/95xxx item numbers** but its search backend `cgi/gup/database.cgi` returns **HTTP 500**; content looks frozen.
- miniyonku.net `製品パーツカタログ` (`http://www.miniyonku.net/products-parts-catalog`, sub-pages `catalog-guide-roller` etc.): ~54 roller items, last dated 2015–2016. Stale.
- Verdict: Fandom **Medium** (usable, attribution required); JP community DBs **Hard/low value**.

## 4. Other structured datasets

- GitHub: `LitoMore/tamiya-toys` is a personal README list (2 stars, no license, no data files). `gh search` finds nothing else (`HNHN-g1t/MINI4-LIN9` = sales-info scraper, `ohenak/android-mini-4wd-tools` = lap tools). **No open item dataset exists.**
- Apps: 「ミニ四駆 超速グランプリ」(game), TAMIYA PASSPORT, lap timers, Motor Pitch Analyzer — no parts-database app with exportable data.
- MotorLab motor table `https://motorlab-tw.github.io/en/benchmarks/tamiya-mini-4wd-motor-specs-list/` (15 motors, RPM/torque; Taiwanese author) — useful spec cross-check.
- **tamiya.hk** (offical HK distributor Waigo 偉高模型, WooCommerce): GUP category **662 items / 28 pages**, chassis filter taxonomy `?filter_mini-4wd-chassis=ar|fm-a|ma|…` (same 21 chassis + `ez-chassis`). Public Store API works: `https://tamiya.hk/wp-json/wc/store/v1/products?per_page=…&category=981` → `sku "TA 95719"`, name, price (HKD ×100). Names are English; TC only on category labels (導輪, 摩打, 避震器, 底盤, 齒輪, 軸承, 輪圈/車胎, 剎車配件, 龍頭/鳳尾/補強配件). Product URL slug embeds item no.: `/product/tamiya-15549-hg-carbon-wide-rear-plate-2mm-sliding-dampers/`.
- 1999.co.jp (Hobby Search) and tamiyausa.com both serve Cloudflare/bot-detection pages to curl and 403 to fetchers — **Hard**; don't depend on them. rcmart.hk publishes TC catalog PDFs (`https://hk.rcmart.com/hobby-news/Tamiya-Mini-4WD-Catalogue-2023-05`).
- **Images/licensing**: Tamiya product photos are © Tamiya; distributors use them under license. Practical policy: (1) store only facts + your own text; (2) show official `_s.jpg` via hot-link or a tiny cached thumbnail with "圖片來源：TAMIYA" and link-out (common practice, low risk but not formally licensed); (3) for the initial scope, take **own photos** of packaging/parts (you'll own them, and they can show the real part) — this is the only fully clean option; (4) Fandom images are user-uploaded fair-use, not safer.

## 5. Suggested initial scope ("recent, well-documented")

Regulation reality check: neither Tamiya ストッククラス (2026年版2, effective 2026-06-01, `regulation_stockclass.html`) nor **B-MAX GP ver5.0** (published 2026-05-13, `https://basic-max.com/2026/05/13/bmaxgp-regu-v5/`, now **identical in the 改造 section to Tamiya Stock Class** — the two were unified; Q&A lists 13 numbered rules) publishes an approved **item list**. They are *rule-based*: Tamiya-made Mini 4WD/ラジ四駆/Dangun parts only, no chassis cutting/new holes, plates unmodified except 皿ビス, fixed roller/gear/pinion combos, no 提灯/anchor gimmicks, 禁止範囲 zone under the wheelbase. So "B-MAX legal" must be derived as a per-item flag from *part category* (e.g. any GUP roller, plate, mass damper, brake, bearing, motor incl. dash motors is legal; HG setting board / setting gauge / pinion puller are not "car parts"; body/chassis kits fine).

Recommended v1 scope (≈300–400 items, all with Tamiya JP data + chassis tags):

1. **Chassis** (7 current): MA, MS, AR, FM-A, VZ, Super-II, VS (+ ME as "PRO" sibling). Source: Tamiya chassis select page + `product_info_ex` per chassis; Fandom for history.
2. **Kits** currently in production for those chassis: `product_info_ex.html?genre_item=mini4wd_chassis_{x},machine_kit` (est. 150–200 across the 7).
3. **Regular GUP (303010) — 244 items**, all current-production, the core "what should I buy" list; add `303030` AO parts (42) since bolt-on racers need them.
4. **Recent limited/special parts** released 2023→now from `303020`/`303025`/`3050` (est. 120–180 items; take by 発売 date ≥ 2023-01).
5. Derive fields: category (roller / plate / damper / brake / bearing / motor / gear / wheel-tire / shaft / battery / tool), `compatibleChassis[]` (from chassis tags), `bmaxLegal` (category rule), `releaseDate`, `priceJPY`, `priceHKD` (tamiya.hk).

Skip in v1: Type-1…5/Zero/FM/Super-1/TZ/X/XX era items, Wild/Dangun/Train, circuits, batteries beyond Neo Champ.

## 6. Traditional Chinese sources

- **Hong Kong**: tamiya.hk (Waigo 偉高模型 — the HK distributor since the 1980s, also does HK限定 items such as 92316) is the best official TC-adjacent source: TC category taxonomy, HK pricing, chassis filters; product names remain English. Setting guide in TC: `https://tamiya.hk/mini-4wd-machine-setting-guide/` (terms: 摩打, 導輪, 防撞桿, 制震鉛塊, 減速海綿, 基礎零件套裝). rcmart.hk TC catalogs. Note HK uses 摩打/剎車/底盤 whereas Taiwan uses 馬達/煞車/底盤.
- **Taiwan**: no distributor catalog site found (Tamiya's TW agent listing is only on `/english/agent/agent.htm`). Retailers with TC names + item nos: MR.JOE HOBBY `https://store.mrjoe.com.tw/category/155695`, 四驅博士學校 `https://sites.google.com/view/taiwanmini4wd`, syhobby.com, 無限領域 inffieldshop.com. Blog with TC beginner glossary: `https://blog.hahasmile.com/田宮四驅車新手攻略/`.
- TC naming: zh.wikipedia gives baseline terms (馬達 vs 摩打, 導輪, 軸承, 齒輪, 電池, 碳纖板/FRP板, 改裝零件); tamiya.hk category names cover the rest (避震器=damper, 龍頭/鳳尾 = front/rear stays — HK slang). **There is no TC item-level database**, so TC names must be authored (JP name → TC, with HK/TW variant field). Communities: HK/TW Facebook groups and retailer pages dominate; PTT/Dcard/巴哈 have no dedicated board (search found nothing specific).
- Verdict: **Medium** — taxonomy and glossary are obtainable; per-item TC names are original work (and become a differentiator).

## Recommended pipeline

1. Scraper (Node script in repo, run locally / monthly Action): JP `list.html?genre_item=30…` all pages → `data-article` ids → JP detail (name JP/EN, price, date, spec, description, chassis tags) → EN detail (EN description) → `product_info_ex` per chassis to fill compat → tamiya.hk Store API by SKU for HKD price. Output `content/items/*.json` (Nuxt Content fits the existing repo layout).
2. Hand-authored layer: TC name (HK/TW), category, B-MAX flag override, usage notes, own photos.
3. Attribution page: Tamiya (facts/links), tamiya.hk (prices), Fandom/Wikipedia (CC-BY-SA text if any is reused).
