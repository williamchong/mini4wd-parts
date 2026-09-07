> Research snapshot from 2026-09-08. Where this differs from `docs/PLAN.md`, the plan is authoritative.

# 3D Asset Feasibility: Web-based Mini 4WD Builder (research, 2026-09-08)

## TL;DR

- **Reusable existing models are thin.** There are a handful of full-car Sketchfab/CGTrader models (mostly non-free or unclear license, 100k-800k tris, not part-separated) and a large pool of 3D-*printing* STLs (custom bumpers, stays, pit boxes, tracks) that are mostly accessories, not faithful Tamiya GUP parts. Nothing exists as a clean, part-separated, web-ready glTF kit. Plan to **produce your own asset library**.
- **AI image-to-3D is not the main pipeline** for this domain. It is good enough for stylised *bodies* (organic shells) as a starting point, but produces mushy geometry for thin rollers, plates, gears and bumpers. **Procedural CAD (build123d/CadQuery/OpenSCAD -> glTF)** is the sweet spot for ~70% of GUP parts (rollers, plates, wheels, tires, masses, spacers, screws); **Blender** for chassis and bodies.
- **Stack recommendation for Nuxt 3/4:** Three.js via `@tresjs/nuxt` (client-only handled by the module), one GLB per part variant, chassis GLB carries named empty nodes as sockets, `gltf-transform` pipeline (meshopt + KTX2), `InstancedMesh` for rollers/screws, raycast hit-slots (invisible proxy meshes) for click-to-select. `<model-viewer>` is ruled out: it can swap *materials* (KHR_materials_variants) but not *geometry*.
- **MVP asset count:** roughly **60-80 distinct meshes**, ~150-250 person-hours of art/CAD work if mostly procedural; more if you want high-fidelity licensed-body lookalikes.
- **Licensing:** Tamiya protects Mini 4WD with patents, design rights and trademarks. Reproducing exact part shapes/logos and using Tamiya product names as a brand is the risk zone; simplified/stylised "type" representations (e.g. "19mm aluminium roller", "MA-type mid-motor chassis") with your own geometry is the defensible path, plus a clear "unofficial fan project" disclaimer.

---

## 1. Existing 3D models of Mini 4WD

### Full cars / chassis (rendering-oriented)

| Source | What | Format / size | License | Notes |
|---|---|---|---|---|
| [Sketchfab: Mini 4WD Super1 Chassis (nickqd)](https://sketchfab.com/3d-models/mini-4wd-super1-chassis-093d3f7e19a14037a4cd761ab6e75585) | Super-1 chassis (1990s) | Sketchfab download (glTF/USDZ auto-conversions), 769k tris / 387k verts | **CC-BY** | The only clearly CC-licensed chassis found. Far too heavy for web (needs decimation); Super-1 is a legacy chassis, not MA/MS/VZ. |
| [Sketchfab: Tamiya mini 4WD Aero Avante (rize.arts)](https://sketchfab.com/3d-models/tamiya-mini-4wd-aero-avante-f71215ceb8044e51a0005b83235d3961) | Complete Aero Avante on AR chassis | 114k tris | Not stated / not marked downloadable | Reference only. |
| [Sketchfab: Tamiya mini 4wd saber (Riatno)](https://sketchfab.com/3d-models/tamiya-mini-4wd-saber-15287cc5a12d4b73906a94c966f24cd4) | Full car, "Download Free" | unknown | Check page (Sketchfab free downloads are CC variants) | Single merged model; not part-split. |
| [Sketchfab: Vanguard Sonic (kkula9999)](https://sketchfab.com/3d-models/tamiya-mini-4wd-vanguard-sonic-6367b353f52d464c818f7ba3f93e8b7e) | Full car | unknown | unknown | Reference only. |
| [CGTrader: Sonic Magnum / Avante car toy (surf3d)](https://www.cgtrader.com/3d-models/car/racing-car/tamiya-mini-4wd-sonic-magnum-avante-car-toy) (also on [RenderHub](https://www.renderhub.com/surf3d/tamiya-mini-4wd-sonic-magnum-avante-car-toy)) | Full car, MAX/OBJ/FBX/STL/BLEND | paid | CGTrader royalty-free (no redistribution of source) | Marketplace models are usable in a product but cannot be re-shared as downloadable files. |
| [CGTrader "mini4wd" search](https://www.cgtrader.com/3d-models/mini4wd) / [TurboSquid "tamiya"](https://www.turbosquid.com/Search/3D-Models/tamiya) | ~49 items on CGTrader, few on TurboSquid | mixed | paid, royalty-free | Mostly full cars or print files; none part-modular. |
| [GrabCAD: Tamiya Mini 4WD](https://grabcad.com/library/tamiya-mini-4wd-1), [Mini 4WD Racing Tamiya](https://grabcad.com/library/mini-4wd-racing-tamiya-1) | Hobbyist CAD (SolidWorks/STEP) of full cars | STEP/SLDPRT | GrabCAD terms: free personal use, redistribution/commercial use not granted | Handy as dimensional reference (STEP imports into Blender/build123d). |

### 3D-printing community (STL, print-oriented)

- [Printables tag "mini4wd"](https://www.printables.com/tag/mini4wd), [Cults3D tag "mini4wd"](https://cults3d.com/en/tags/mini4wd) (14k hits but mostly tag noise; ~24 real under ["mini 4wd"](https://cults3d.com/en/tags/mini+4wd)), [MakerWorld "tamiya mini 4wd" collection](https://makerworld.com/en/collections/4939751-tamiya-mini-4wd), [Thangs 2-lane track](https://thangs.com/designer/rucdoc/3d-model/2%20Lane%20tamiya%20Mini%204wd%20track-921503), [STLFinder aggregate](https://www.stlfinder.com/3dmodels/tamiya-mini-4wd/).
- Content is overwhelmingly **accessories and custom parts**: pit boxes, motor cases, tool holders, track segments, custom rear bumpers, roller sliders, "ATB"-style stays, RC conversions of VZ chassis, and a few custom bodies/chassis (e.g. [Thingiverse MS Chassis by ckw8217](https://www.thingiverse.com/thing:893769), mirrored on [MyMiniFactory](https://www.myminifactory.com/object/3d-print-mini-4wd-ms-chassis-10237) and [Cults](https://cults3d.com/en/3d-model/tool/mini-4wd-ms-chassis)). Thingiverse defaults to CC-BY / CC-BY-NC per item; Printables and MakerWorld are mostly CC-BY-NC or "Standard Digital File License" (no redistribution). Each file must be checked individually.
- **Japanese scene:** BOOTH sells original-design chassis/bodies as STL+STEP (e.g. [アズパカ: フロントモーターシャーシ](https://booth.pm/ja/items/3544664), [水平対向4モーター四駆シャーシ](https://booth.pm/ja/items/3511803)); these are *original* designs (not Tamiya copies) under seller-specific personal-use terms. Blogs document modelling Tamiya-compatible parts in Fusion 360 ([fusion360.hatenadiary](https://fusion360.hatenadiary.com/entry/2017/01/09/110610), [テルえもん body modelling](https://fusion360.teruemon.com/form/mini4wd-body-modeling/), [Kazuki Room Blender build](https://kazuki-room.com/make-mini-4wd-with-blender-and-3d-printer/)) and there was a CC-BY "ミニ四バス" body on Thingiverse ([jig.jp](https://fukuno.jig.jp/726)). None of these is a catalogue of Tamiya GUP parts.

### Verdict on reuse
- No CC-licensed MA/MS/VZ/AR/FM-A chassis or GUP part set exists. Print STLs are the wrong topology (watertight solids, tens of thousands of tris, no UVs) and mostly custom designs. Treat everything found as **dimensional reference** only; expect to model your own library.

### Licensing risk (Tamiya IP)
- Tamiya layers patents, design registrations and trademarks on Mini 4WD ([+VISION analysis of Tamiya's IP mix](https://vision00.jp/column/5251/)); "ミニ四駆"/"Mini 4WD" is a registered trademark, and Tamiya's race regulations even forbid self-made bodies/chassis in official events ([規則](https://www.tamiya.com/japan/mini4wd/regulation.html)), showing how tightly they control the ecosystem. No public "fan creation guideline" exists for Mini 4WD.
- Risk ladder: (1) redistributing scans/copies of Tamiya moulds = highest; (2) faithful reproductions rendered in-app but not downloadable = medium (design-right infringement is about the *shape*, and body shells are the most distinctive); (3) **simplified, stylised, dimensionally plausible parts** referencing generic categories ("19mm plastic-ring roller", "FRP front wide stay") = low; (4) use of product names/item numbers as *nominative* references in a parts catalogue is generally OK, but avoid Tamiya logos, star-mark, box art, and any implication of endorsement. Keep bodies noticeably simplified (low-poly, no decals) and add a disclaimer. Do not offer the glTFs for download.

---

## 2. Generating models from images (state of the art, 2026)

| Tool | Open? / License | Input | Output | Realistic fit for Mini 4WD parts |
|---|---|---|---|---|
| [Microsoft TRELLIS.2 (4B)](https://github.com/microsoft/TRELLIS.2) | **MIT**, weights on HF; needs ~24 GB VRAM | single image (512-1536^3 voxel res) | GLB with PBR + opacity | Best open model for sharp edges/thin surfaces (O-Voxel handles open/non-manifold). Good for **bodies** from a 3/4 product photo. Still hallucinates hidden side; rollers/plates come out as blobs. |
| [Hunyuan3D-2.1](https://github.com/Tencent-Hunyuan/Hunyuan3D-2.1) (and 2mv multi-view) | Open weights, but Tencent license **excludes EU/UK/South Korea** and has commercial ambiguity ([issue #254](https://github.com/Tencent-Hunyuan/Hunyuan3D-2/issues/254)); 10 GB shape / 29 GB with textures | 1-4 views | GLB/OBJ + PBR | 2mv accepts front/back/left/right views which matches Tamiya's 1-3 product photos poorly (usually 3/4 + top). Hunyuan3D **3.0/3.1 are API-only** (Tencent Cloud), not open. |
| [SPAR3D](https://github.com/Stability-AI/stable-point-aware-3d) / SF3D | Stability Community License (free < $1M revenue) | single image, <1 s | UV-unwrapped mesh | Fast, low fidelity; fine for placeholder bodies only. |
| [TripoSR](https://github.com/VAST-AI-Research/TripoSR) / [TripoSG](https://github.com/VAST-AI-Research/TripoSG) | MIT | single image | mesh | TripoSG is competitive with TRELLIS for shape; no PBR. |
| [Tripo (hosted)](https://developers.tripo3d.ai/en/pricing) | API $0.20-0.40 per image-to-3D; free tier | single + **multi-view** | GLB, quad option | Cleanest topology of the hosted tools; multi-view mode wants orthogonal views. |
| [Meshy](https://www.meshy.ai/pricing) | Free 100 credits/mo, outputs **CC-BY 4.0** on free plan; Pro $20/mo full rights | single/multi image | GLB/FBX/OBJ, remesh to target polycount | Stylised game-asset look; good "low-poly body" generator. |
| [Rodin / Hyper3D](https://www.3daistudio.com/3d-generator-ai-comparison-alternatives-guide/rodin-alternative) | $99+/mo tiers | single/multi | GLB 4K PBR | Highest photoreal detail; overkill and pricey. |
| Luma Genie | **Removed** from Luma's site (pivot to video) | - | - | Skip. |
| [RealityScan 2.x (ex-RealityCapture)](https://www.cgchannel.com/2026/06/epic-games-releases-realityscan-2-2-with-amd-gpu-support/) | Free under $1M revenue; desktop + mobile | 50-200 own photos | mesh + texture | Photogrammetry of a real chassis works (matte plastic, textured); black FRP/carbon plates and chrome/aluminium rollers fail (featureless/reflective). |
| Polycam / Apple Object Capture | Polycam freemium; Object Capture free on Mac/iOS | photos or LiDAR | USDZ/GLB | Object Capture on a Mac is good for a ~150mm chassis on a turntable; needs heavy retopo/decimation after. |

**Limitations that matter here** (consistent across [3DBite](https://3dbite.com/ai-tools-3d-model-generation-printing-2026/), [Sloyd](https://www.sloyd.ai/blog/how-accurate-are-ai-generated-3d-models-from-images), [Beets3D](https://www.beets3d.com/en/post/ai-3d-printing-modeling-tools-review-2026)): AI generators soften edges of regular geometry, lose sub-mm features (roller flanges, gear teeth, screw threads, plate holes), guess the back side, and 1-3 product photos are not "multi-view" in the sense the models expect (they want orthographic front/back/side). Photogrammetry needs dozens of your own photos plus cleanup.

**Verdict by part category**

| Category | Recommended source | Why |
|---|---|---|
| Rollers (9/13/19mm plastic, alu, bearing) | **Procedural** (revolve profile; 1 script, N params) | Exact dimensions from product specs; ~200-600 tris each. |
| Wheels / tires (small/large dia, low-profile, barrel, sponge) | **Procedural** | Lathe + optional spoke pattern; tire as torus-ish revolve. |
| FRP/carbon plates, stays, brake plates | **Procedural** (2D outline + holes -> extrude) | Sketch the outline once; thickness 1.5/2/3mm param. |
| Mass dampers, spacers, screws, nuts, bearings | **Procedural + instancing** | Trivial primitives. |
| Bumpers (ATB, sliding dampers) | **Blender** (or procedural if simplified box + pivot) | Compound shapes, but few variants. |
| Motor (single vs double shaft), gears | **Blender** low-poly; hidden mostly | Only silhouette matters. |
| Chassis (MA, MS/VZ) | **Blender** manual, referencing photos/GrabCAD STEP; optionally photogrammetry of a real one as base | The one asset where fidelity of socket positions matters; needs empties. |
| Bodies (3-5) | **AI (TRELLIS.2 / Meshy) as blockout -> Blender retopo** or Blender from scratch | Organic shells are where AI helps; keep stylised for IP reasons. |

Procedural pipeline that works today: [build123d](https://build123d.readthedocs.io/en/latest/import_export.html) or [CadQuery Assembly.export()](https://cadquery.readthedocs.io/en/latest/importexport.html) export **GLB directly** (with named parts); OpenSCAD exports STL only (then Blender/gltf-transform). Run once in CI to regenerate the whole GUP library when specs change.

---

## 3. Modular model architecture on the web

**Asset model**
- One GLB per part variant (`roller-19mm-alu.glb`), in a shared unit system (1 unit = 1 mm scaled x0.01, or model in metres), origin at the part's mounting point, +Z up or +Y up consistently. Keep to a few shared materials (plastic-black, plastic-white, alu, FRP, carbon, rubber) so parts can be re-coloured at runtime.
- The chassis GLB carries **named empty nodes as sockets**: `socket_front_stay`, `socket_roller_FL_upper`, `socket_wheel_FR`, `socket_body`, `socket_motor`, etc. Sockets on stays/plates cascade (plate has its own `socket_roller_L/R`), so a part tree = chassis -> plate -> roller. At runtime: load part GLB, `parent.getObjectByName(socket).add(partScene)`. Store a JSON "slot graph" (slot id -> allowed categories, default variant, mirror flag).
- Pipeline: Blender/CAD -> `gltf-transform optimize --compress meshopt --texture-compress ktx2` ([gltf-transform](https://gltf-transform.dev/)). Meshopt decodes faster than Draco for many small files and supports quantization; KTX2/Basis mainly matters for body textures (parts can be untextured PBR). LOD is unnecessary at this scale (whole car < 100k tris); do decimate CAD output (roller: 300 tris, not 30k).
- Rollers/screws/bearings: `InstancedMesh` per variant (raycast returns `instanceId`); note [OutlinePass does not support InstancedMesh](https://github.com/mrdoob/three.js/issues/18533), so highlight by swapping an emissive material or drawing a duplicate proxy mesh.
- Click-to-select: raycast against **invisible slot proxy boxes/spheres** placed at sockets (bigger than the real part, so tiny rollers are clickable on mobile); hover = emissive tint on the proxy's assigned part, or a screen-space outline via `postprocessing`/`OutlineEffect` for non-instanced parts. Empty slots render as ghost "+" placeholders.

**Engine comparison**

| Option | Runtime composition | Nuxt fit | Notes |
|---|---|---|---|
| **Three.js + [@tresjs/nuxt](https://nuxt.com/modules/tresjs)** (TresJS 5.8.x, cientos for `useGLTF`, `OrbitControls`, `Environment`) | Full control | Best: module handles client-only `TresCanvas` (no `<ClientOnly>` needed), auto-imports. Repo consolidated into [Tresjs/tres monorepo](https://github.com/Tresjs/tres) Feb 2026; still active. | Smallest bundle (~170 KB core, tree-shakeable); the R3F-equivalent for Vue. Recommended. |
| Babylon.js | Full control, built-in highlight layer, GUI | Works with client-only plugin | ~1.4 MB (WebGPU/WGSL builds smaller); heavier than needed. |
| [`<model-viewer>`](https://modelviewer.dev/examples/scenegraph/) | **Materials only** via `KHR_materials_variants`; extension spec says "mesh geometry cannot be changed" ([KHR README](https://github.com/KhronosGroup/glTF/blob/main/extensions/2.0/Khronos/KHR_materials_variants/README.md)); scene-graph API is still limited | Trivial | Keep for the landing page and for the "share" static viewer of a *baked* car, not for the builder. |
| PlayCanvas | Full, editor-centric | Iframe/embed | Team/editor workflow; awkward inside a Nuxt SPA. |
| Vue alternatives (vue-three, Lunchbox) | - | - | Less maintained than TresJS. |

**SSR pitfalls (Nuxt):** never import `three` in a server-rendered path (`window`/`WebGL` access at module scope); keep loaders in `onMounted`/client plugins; `@tresjs/nuxt` already marks canvas client-only, but your own composables that touch `THREE.TextureLoader`/`KTX2Loader` (needs `renderer.detectSupport`) must be `.client.ts`. Serve decoder WASM (meshopt/basis) from `public/` and set `transcoderPath`. Preload the chassis and default parts; lazy-load variants on selection. Use `useState`/Pinia for the build state so the 2D parts panel and 3D view stay in sync.

**Reference configurators**
- [4x4 Builder (theshanergy, R3F, open source)](https://github.com/theshanergy/4x4builder) - the closest analogue: swappable wheels/tires/lifts on a base vehicle, URL-persisted config.
- [IGC Three.js configurator architecture guide](https://www.intelligentgraphicandcode.com/development/threejs-interfaces/product-configurators), [Wawa Sensei tutorial](https://wawasensei.dev/tuto/how-to-use-three-js-to-create-a-3D-product-configurator), [GitHub topic 3d-configurator](https://github.com/topics/3d-configurator).
- BrickLink Studio / LDraw is the gold standard for a **socket-graph part library** (each part has connection points); PC-part-picker style sites are 2D lists with one hero render - a hybrid (2D catalogue + 3D preview) is a good UX model.

**Existing Mini 4WD builders**
- [Mini 4WD Hyper Dash Grand Prix (ミニ四駆 超速グランプリ)](https://mini-4wd.fandom.com/wiki/Mini_4WD_Hyper_Dash_Grand_Prix) - Bandai Namco/Dimps, 700+ scanned GUP parts, body cutting/painting, **service ended 7 May 2024**. Proves demand and the interaction model (2D part list + 3D car), and that Tamiya licensed it - i.e. an official licensed product existed, which cuts both ways.
- Unofficial mobile games: Mini Legend, "Mini4WD Let's GO", Mini4WD (zhizigame) - Unity apps, not web.
- Web: only a [Unity physics simulation demo (ニコニコ)](https://originalnews.nico/411814) and [course-layout editors](https://www.courselayout.net/courselayout-tool/). **No web-based 3D Mini 4WD builder/setting simulator exists** - clear whitespace.

---

## 4. Sharing an assembled car (static site)

- **URL encoding:** slot graph is small (~15 slots x 1-byte variant ids + colours). Encode as a compact byte array -> base64url (or a versioned string like `v1.ma.b03.w2t1.rF19a...`), e.g. `/build#<code>` so the static page needs no server. Include a schema version byte for future part-ID changes.
- **OG preview image:** crawlers do not run WebGL, so a static site needs a pre-rendered PNG. Options: (a) **client-side snapshot** (`renderer.domElement.toBlob()` after an explicit render, no need for `preserveDrawingBuffer` if you render synchronously before capture) uploaded to R2/Supabase Storage on "Share" and referenced by a short id; (b) **Cloudflare Browser Rendering / Browser Run** headless-Chrome screenshot of `/render?code=...` at the edge ([docs](https://developers.cloudflare.com/browser-run/how-to/og-images-astro/)) cached in KV - works for arbitrary URLs without user action but costs per render; (c) Satori/`workers-og` HTML-to-PNG cards with part list text plus a pre-rendered per-body thumbnail as a cheap fallback. Recommended: (a) for shared builds, (c) as fallback for un-shared codes.
- **Permalinks:** short id -> code (+ image URL) in Cloudflare KV/D1 via Pages Functions or [NuxtHub](https://hub.nuxt.com/docs/getting-started/deploy) (`hubKV`/`hubDatabase` with zero config); Supabase equally fine. The share page is a small SSR/ISR route only for meta tags; the builder itself stays static.

---

## 5. Effort estimate (MVP)

**Mesh inventory** (MVP: 2 chassis, 4 bodies, ~10 GUP categories x 3-5 variants)

| Class | Count | Method | Hours each | Subtotal |
|---|---|---|---|---|
| Chassis (MA + MS or VZ) with sockets, hidden internals simplified | 2 | Blender (photogrammetry/STEP reference) | 12-20 | 30-40 |
| Bodies (stylised) | 4 | AI blockout + Blender retopo/UV, or Blender from scratch | 6-10 | 30-40 |
| Front/rear stays & plates (FRP wide, carbon, brake plates) | 8 | Procedural (build123d) | 1-2 (after 4-6 h framework) | 15-20 |
| Rollers (13/19mm plastic, alu, bearing, double) | 6 | Procedural | 0.5 | 3 + framework |
| Wheels (small/large, low-profile, dish/spoke) | 5 | Procedural | 1 | 5 |
| Tires (normal, low-profile, barrel, sponge) | 4 | Procedural | 0.5 | 2 |
| Bumpers/dampers (ATB, sliding, mass damper) | 4 | Blender | 3-4 | 12-16 |
| Motor, gears, propeller shaft, battery, switch | 5 | Blender low-poly | 1-2 | 5-10 |
| Screws/nuts/spacers/bearings (instanced) | 6 | Procedural | 0.25 | 2 |
| Materials/textures (6-8 shared PBR, KTX2) | - | Blender + gltf-transform | - | 8 |
| **Total distinct meshes** | **~65-75** | | | **~130-170 h art/CAD** |

Add ~10-20 h for the procedural framework (parametric roller/plate/wheel generators + GLB export + CI), and ~10 h for socket authoring/QA (fit checks of every part in every compatible socket). A one-person effort of roughly 4-6 weeks part-time for assets alone; scaling to a "full catalogue" (hundreds of GUP items) is mostly parameter tables once the generators exist, which is the strongest argument for the procedural route.

**Pipeline summary:** Blender (chassis, bodies, bumpers) + build123d scripts (all round/flat GUP parts) -> GLB -> `gltf-transform optimize` (meshopt, quantize, KTX2) -> `public/models/<category>/<id>.glb` + `parts.json` (ids, category, socket compatibility, dimensions, Tamiya item no. for reference) -> TresJS builder loading on demand.
