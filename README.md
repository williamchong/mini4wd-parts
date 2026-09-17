# 迷你四驅新手入門資訊站 Mini 4WD Beginner's Guide

這是一個迷你四驅新手入門資訊站的原始碼庫。
This is the source code repository for the Mini 4WD Beginner's Guide Information Site.

- 網址 URL: https://mini4wd.parts/
- 語言 Languages: 繁體中文（主要，香港用語）、English（次要）、日本語（規劃中）

## 網站願景 Vision

一個以繁體中文為主的迷你四驅新手網站，讓使用者可以瀏覽田宮（Tamiya）零件資料庫、在組車器中挑選零件組裝一台車、依照 Stock / B-MAX / Open 等賽制取得推薦配置，並分享自己的組裝成果。

A Traditional-Chinese-first site where beginners browse Tamiya Mini 4WD parts, assemble a car in a builder, get a recommended setup for Stock / B-MAX / Open racing, and share the result.

## 目前功能 What Works Today

- **組車器（首頁）Builder on the home page** — 由 305 款套件或 8 款淨底盤開始，逐個插槽更換零件，零件選單已按插槽、底盤相容性及摩打軸型過濾。Start from one of 305 kits or 8 bare chassis. Swap parts slot by slot, and each picker only lists parts that fit the slot, the chassis and the motor shaft type.
- **3D 預覽 3D pane** — MA 底盤以代理方塊顯示，可點擊車身開啟該插槽的零件選單。On MA, the car is drawn as proxy boxes, and tapping one opens that slot's picker.
- **可分享連結 Shareable link** — 組裝內容保存在網址中，重新整理不會遺失，複製連結即可分享。The build is kept in the URL, so a reload restores it and copying the link shares it.
- **零件資料庫 Parts database** — 382 件零件，各有獨立頁面（規格、相容底盤、賽制合法性、同系列款式），並按 29 個分類瀏覽。382 parts, each with its own page (specs, compatible chassis, class legality, variants), browsable in 29 categories.
- **底盤頁 Chassis pages** — 8 款底盤的規格、標準配置及使用該底盤的套件，可一鍵在組車器開啟。Specs, stock loadout and the kits on each of the 8 chassis, each kit opening straight in the builder.
- 麵包屑導覽、`BreadcrumbList` / `Product` JSON-LD、sitemap。Breadcrumbs, `BreadcrumbList` / `Product` JSON-LD and a sitemap.

## 路線圖 Roadmap

| # | 功能 Feature | 里程碑 Milestone | 狀態 Status |
|---|---|---|---|
| F1 | 零件資料庫（底盤、套件、改裝零件），含底盤相容性與賽制合法性 Parts database with chassis compatibility and class legality | M1 | ✅ 零件頁、分類、底盤頁 Part, category and chassis pages |
| F3 | 組車器：由套件或淨底盤開始，顯示相容性警告 Builder from a kit or bare chassis, with compatibility warnings | M1 | 🚧 組車器已上線，規則引擎未完成 Builder live, rule engine pending |
| F7 | 3D 模型：即時更新，並可點擊車身選零件 3D car that updates live and is the surface you tap to pick parts | M1 | 🚧 MA 代理方塊，模型製作中 MA proxy boxes, meshes pending |
| F4 | 可分享的組裝 Shareable builds | M1 → M2 → M3 | 🚧 網址連結已完成；短連結、預覽圖待 M2 URL links done; short links and preview cards in M2 |
| F2 | 教學與賽制名詞解釋 Tutorials and class glossary (Open / Stock / B-MAX) | M2 | ⏳ |
| F6 | 零件與組裝評分、熱門度 Ratings and popularity | M2 | ⏳ |
| F5 | 新手精靈 / 零件推薦 Beginner wizard and recommender | M4 | ⏳ |
| F8 | 帳號、車庫、留言、社群資料貢獻 Accounts, garages, comments, contributions | M4 | ⏳ |

完整的產品與技術規劃請見 See the full product and technical plan: [`docs/PLAN.md`](docs/PLAN.md)。研究筆記 Research notes: [`docs/research/`](docs/research/)。

## 技術 Tech Stack

- Nuxt 4 + @nuxt/content v3，`nuxt generate` 產生靜態網站，部署於 GitHub Pages（M2 起遷移至 Cloudflare Workers + D1 / R2）
- 零件、底盤、套件資料以 YAML 存放於 repo（`content/` 由腳本產生，勿手動修改；修正寫入 `data/overrides/` 或 `data/chassis/`）
- @nuxtjs/i18n（`zh-Hant` 預設、`/en/`、之後 `/ja/`）；目前以香港用語為準
- three.js（組車器 3D 畫面，只在瀏覽器載入並獨立分包）
- 產品縮圖由本站自行縮小並託管於 `public/thumbs/`，不直接連結田宮圖片
- 資料來源：田宮日本官網產品目錄與底盤對應零件頁、tamiya.hk 商店 API、Fandom Wiki（CC-BY-SA，附註出處）

## 開發 Development

```sh
npm ci
npm run dev          # 開發伺服器 dev server
npm run generate     # 產生靜態網站 static build
npm test             # 單元測試 unit tests
npm run typecheck    # scripts/ + app/ 型別檢查 type checks
```

資料管線 Catalog pipeline:

```sh
npm run scrape             # 更新 data/raw/（有節流與快取 throttled, cached）
npm run catalog:generate   # data/ → content/
npm run catalog:thumbs     # 產生縮圖 product thumbnails
npm run catalog:verify     # 驗證 content/ validate the committed YAML
npm run catalog:report     # 列出需人手處理的項目 what still needs a human
npm run catalog:crossref   # 與 Fandom Wiki 分類對照 audit categories against the wiki
```

CI 在部署前會執行 `npm test`、`npm run typecheck` 及 `npm run catalog:verify`。CI runs tests, type checks and catalog verification before every deploy.

## 授權 Licence

- **原始碼 Source code** — [GNU GPL v3.0 或更新版本 or later](LICENSE)：`app/`、`shared/`、`scripts/`、`i18n/` 及設定檔，包括在瀏覽器中產生 3D 模型的程式碼。`app/`, `shared/`, `scripts/`, `i18n/` and the config files, including the code that generates the 3D models in the browser.
- **素材 Assets** — [CC BY-SA 4.0](LICENSE-ASSETS)：本站撰寫的文字（`content/zh-Hant/`、`content/en/`、`docs/`）、本站整理的零件資料（`data/chassis/`、`data/overrides/`、`data/taxonomy/` 及其產生的 `content/parts/`、`content/chassis/`、`content/kits/`），以及 `public/images/` 與 `public/favicon.png`。Our own text (`content/zh-Hant/`, `content/en/`, `docs/`), our compiled catalog (`data/chassis/`, `data/overrides/`, `data/taxonomy/` and the `content/parts/`, `content/chassis/`, `content/kits/` generated from them), and `public/images/` and `public/favicon.png`.

以下不在上述授權範圍內 Not covered by either licence:

- `public/thumbs/` 的產品縮圖版權屬田宮所有。The product thumbnails in `public/thumbs/` are © TAMIYA.
- 取自 Mini 4WD Fandom Wiki 的套件內容及零件系列（`loadoutSourceTitle`、`fandomTitle`）沿用該 Wiki 的 [CC BY-SA](https://www.fandom.com/licensing) 條款。Kit contents and part families taken from the Mini 4WD Fandom Wiki (`loadoutSourceTitle`, `fandomTitle`) stay under the wiki's own [CC BY-SA](https://www.fandom.com/licensing) terms.
- `data/raw/` 為第三方網站的抓取快取。`data/raw/` is a scrape cache of third-party sites.
- 「ミニ四駆 / Mini 4WD」及田宮商標。The "Mini 4WD" name and TAMIYA trademarks.

## 免責聲明 Disclaimer

本站為非官方的同好網站，與田宮（TAMIYA）無任何關係。「ミニ四駆 / Mini 4WD」為田宮的註冊商標。本站僅收錄產品編號、價格、尺寸、相容性等事實資訊，以及本站自行撰寫的說明；產品縮圖版權屬田宮所有，並附上原廠產品頁連結。

This is an unofficial fan site with no affiliation to TAMIYA. "Mini 4WD" is a registered trademark of TAMIYA. The site stores factual data (item numbers, prices, dimensions, compatibility) together with its own text. Product thumbnails are © TAMIYA and shown beside a link to Tamiya's own product page.
