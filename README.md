# 迷你四驅新手入門資訊站 Mini 4WD Beginner's Guide

這是一個迷你四驅新手入門資訊站的原始碼庫。
This is the source code repository for the Mini 4WD Beginner's Guide Information Site.

- 網址 URL: https://mini4wd.parts/
- 語言 Languages: 繁體中文（主要）、English（次要）、日本語（規劃中）

## 網站願景 Vision

一個以繁體中文為主的迷你四驅新手網站，讓使用者可以瀏覽田宮（Tamiya）零件資料庫、在組車器中挑選零件組裝一台車、依照 Stock / B-MAX / Open 等賽制取得推薦配置，並分享自己的組裝成果。

A Traditional-Chinese-first site where beginners browse Tamiya Mini 4WD parts, assemble a car in a builder, get a recommended setup for Stock / B-MAX / Open racing, and share the result.

## 規劃功能 Planned Features

| # | 功能 Feature | 階段 Phase |
|---|---|---|
| F1 | 零件資料庫（底盤、車款、改裝零件），含底盤相容性與賽制合法性 Parts database with chassis compatibility and class legality | 1 |
| F2 | 教學：如何依目標挑選零件、賽制名詞解釋 Tutorials and class glossary (Open / Stock / B-MAX) | 1 |
| F3 | 組車器：選底盤、填零件、顯示相容性警告 Car builder with compatibility warnings | 1 (清單 list UI) → 3 (3D) |
| F4 | 可分享的組裝：零件清單、永久連結、預覽圖 Shareable builds with part list, permalink and preview | 1 → 2 → 3 |
| F5 | 新手精靈 / 零件推薦 Beginner wizard and recommender | 2 |
| F6 | 零件與組裝評分、熱門度 Ratings and popularity | 2 |
| F7 | 互動式 3D 組車器：點擊車身選零件、即時更新模型 Interactive 3D builder | 3 |
| F8 | 帳號、車庫、留言、社群資料貢獻 Accounts, garages, comments, contributions | 4 |

## 開發狀態 Development Status

- 🚧 規劃階段 Planning stage. 目前線上仍是「開發中」的落地頁。The live site is still the "under development" landing page.
- 完整的產品與技術規劃請見 See the full product and technical plan: [`docs/PLAN.md`](docs/PLAN.md)
- 研究筆記 Research notes: [`docs/research/`](docs/research/) — 賽制與概念 concepts and rules、資料來源 data sources、3D 資產 3D assets、技術架構 tech stack

## 技術方向 Technical Direction

- Nuxt 4 + @nuxt/content v3（零件、底盤、規則、教學以 YAML / Markdown 存放於 repo）
- @nuxtjs/i18n（zh-TW 預設、`/en/`、之後 `/ja/`）
- Google model-viewer（展示）＋ TresJS / Three.js（3D 組車器）
- 第一階段為純靜態網站（GitHub Pages）；第二階段起遷移至 Cloudflare Workers，使用 D1 / R2 儲存使用者組裝與評分
- 資料來源：田宮日本官網產品目錄與底盤對應零件頁、tamiya.hk 商店 API、Fandom / Wikipedia（CC-BY-SA，附註出處）

## 免責聲明 Disclaimer

本站為非官方的同好網站，與田宮（TAMIYA）無任何關係。「ミニ四駆 / Mini 4WD」為田宮的註冊商標。本站僅收錄產品編號、價格、尺寸、相容性等事實資訊，以及本站自行撰寫的說明與自行拍攝的照片。

This is an unofficial fan site with no affiliation to TAMIYA. "Mini 4WD" is a registered trademark of TAMIYA. The site stores factual data (item numbers, prices, dimensions, compatibility) together with its own text and photos.
