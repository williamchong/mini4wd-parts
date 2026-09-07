# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

"迷你四驅新手入門資訊站" (Mini 4WD Beginner's Guide Information Site) at https://mini4wd.parts/. The live site is still an "under development" landing page with a 3D model of a Mini 4WD car. The project is being planned as a Traditional-Chinese-first Tamiya Mini 4WD parts database, car builder (list UI first, 3D later), beginner wizard, tutorial site, and build-sharing site.

**Read `docs/PLAN.md` before implementing any feature.** It holds the agreed scope, phase order, data model, rule-engine design, hosting decisions and open questions. Supporting research with source URLs is in `docs/research/`. Do not re-research points already settled there.

## Current State of the Repo

- The committed history (branches `master` and `gh-pages`) is the plain `index.html` landing page.
- The working tree contains an untracked **Nuxt 3.14 + @nuxt/content 2.x** scaffold (`nuxt.config.ts`, `package.json`, `pages/`, `layouts/`, `components/`, `content/`, `assets/`, `public/`, `.github/workflows/deploy.yml`). Nuxt 3 reached end-of-life in July 2026; the plan upgrades to Nuxt 4 + @nuxt/content v3 in Phase 0 before real content is written.
- `.github/workflows/deploy.yml` deploys on push to `main`, but no `main` branch exists yet. Settling the branch layout is a Phase 0 task.
- `public/images/4wd.glb` is a single baked hero model (3 meshes, ~66k triangles). It is not part-separated and cannot serve as the 3D builder base.

## Planned Architecture (see docs/PLAN.md §4)

- **Framework:** Nuxt 4, `nuxt generate` for static pages; server routes only for `/api/*` and `/b/:id` from Phase 2.
- **Content:** @nuxt/content v3 collections with Zod schemas. Catalog data (parts, chassis, rules, guides, wizard profiles) is versioned YAML/Markdown in `content/`, keyed by Tamiya item number. Only user-generated data (builds, votes, view counts) goes to a database.
- **i18n:** @nuxtjs/i18n, `prefix_except_default`, `zh-TW` default, `/en/`, later `/ja/`. Part names for all locales live inline in each part record; guide bodies are separate Markdown files per locale.
- **3D:** Google `<model-viewer>` for display (hero, part previews, share pages). TresJS / Three.js for the builder route only, client-only and code-split. Part meshes are one GLB per variant; the chassis GLB carries named socket nodes.
- **Hosting:** Phase 1 stays on GitHub Pages. Phase 2 moves to Cloudflare Workers with static assets, D1 (builds, votes), R2 (thumbnails), Turnstile (abuse control), nuxt-og-image for share cards.
- **Rule engine and wizard:** declarative JSON rules (slot capacity, chassis compat, motor shaft type, class legality, dependencies, numeric limits) evaluated client-side and re-validated server-side; the wizard is a weighted scorer over the same catalog, no ML.

## Domain Notes

- Race classes: Tamiya **Open** (official regulation), Tamiya **Stock Class** (ストッククラス / 基礎賽, since 2025), and **B-MAX GP** (unified with Stock Class in Dec 2025). "**B-Stock**" is local shorthand for Stock Class (owner-confirmed 2026-09-08); model it as an alias of Stock Class, not a separate ruleset. "Box Stock" is a different, stricter shop class.
- Chassis in v1 scope: MA, MS, ME, AR, FM-A, VZ, Super-II (+ VS). PRO chassis (MS/MA/ME) need double-shaft motors; all others single-shaft.
- Item numbers: 18xxx / 19xxx kits, 15xxx regular Grade-Up Parts, 95xxx limited/special, 94xxx older limited.
- Regulation envelope: 105 × 165 × 70 mm, ≥ 90 g with batteries, tires 22–35 mm, 2×AA.

## Data and IP Rules

- Primary data source is the Tamiya Japan product catalog plus its per-chassis compatibility pages (`product_info_ex.html?genre_item=mini4wd_chassis_*`); secondary sources are tamiya.hk's public store API (HKD prices, TC category names) and Fandom / Wikipedia (CC-BY-SA, attribute).
- Store **facts** (item number, names, price, release date, dimensions, compatibility) and our own text. Do not copy Tamiya descriptions, redistribute Tamiya PDFs, or host Tamiya product photos as our own. Prefer own photos for parts shown in the builder.
- 3D assets must be simplified, stylised representations generated procedurally or modelled in-house. Never offer GLB downloads. Keep the "unofficial fan site" disclaimer.
- Traditional Chinese terminology differs between Hong Kong (摩打, 剎車) and Taiwan (馬達, 煞車); store both variants where they differ.

## Development Notes

- Run Node/npm commands only after the Nuxt scaffold is committed and `package.json` is in place.
- Commit messages follow the existing gitmoji style (see `git log`).
- Analytics: GA4 (`G-GJ34BG7E3W`) is live; PostHog is planned for builder and wizard funnels.
- The site is bilingual today (Traditional Chinese primary, English secondary) and targets Mini 4WD beginners and hobbyists.
