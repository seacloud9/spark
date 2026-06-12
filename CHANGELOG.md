## Unreleased

Multi-backend rendering: Spark now renders identically across Three.js, A-Frame, and BabylonJS. Every ordinary `examples/` page exposes a `?engine={three,aframe,babylon}` toggle, and a 27-scene visual-parity matrix gates the three backends bit-perfect (0 / 786432 pixels differ) on every shared scene.

### New features

- **A-Frame backend adapter** (`registerSparkAFrame`) — drop Spark into an `<a-scene>` via `<a-entity spark-splat src="...">`. The integration registers a system + component pair so SplatMesh and SparkRenderer participate in A-Frame's scene-graph + render loop natively. See `examples/hello-world/?engine=aframe` for a working demo.
- **BabylonJS backend adapter** (`SparkBabylonHost`) — two opt-in modes:
  - `mode: "texture"` (default, MVP) — Spark renders to an internal offscreen Three canvas; Babylon composites the result as a fullscreen `Layer`. Compositing model: splats render behind Babylon content. Bit-perfect against Three at 5% tolerance (actual: 0 / 786432 px diff).
  - `mode: "native"` — Splats render as a real Babylon `Mesh` inside the scene's render pass via `SparkBabylonMaterial` + `SparkBabylonMesh`. Babylon meshes depth-sort against splats by construction. Bit-perfect against Three on 26 / 27 matrix scenes; the one exclusion is `envMap` (a non-splat Three `rubberduck.glb` that does not bridge to Babylon's native render pass yet — captured next to the `NATIVE_BABYLON_SCENES` set in `test/e2e/snapshot.spec.ts`).
  - Working demos: `examples/spark-babylon/` (texture) and `examples/spark-babylon-native/` (native).
- **Engine-aware examples helper** (`examples/js/spark-engine.js`) — single `setupSparkExample({ cameraConfig, clearColor })` factory that returns the same `{ scene, camera, renderer, spark, canvas, add, run }` shape on all three backends. Every ordinary example consumes this helper and stays engine-agnostic. Includes `env.canvas` (the visible top-of-DOM canvas, distinct from the offscreen Three renderer in Babylon mode) for binding `PointerControls` / `SparkControls` / `OrbitControls` / raycast click handlers, and `env.runManual` for examples (`portal`, `splat-portal`, `newportal`) that own their render pass.
- **Visual-parity test matrix** — `test/e2e/snapshot.spec.ts` renders 27 scenes across `three`, `aframe`, `babylon`, and `babylon-native` host fixtures and compares pairs via `pixelmatch`. Locally-vendored asset set (`test/fixtures/assets/`) removes CDN flakiness from the gate.
- **Engine-aware smoke spec** — `test/e2e/multibackend-smoke.spec.ts` asserts that every ordinary example loads cleanly on every engine, plus a two-way index guard (every `engine-aware` row in `examples/index.html` exposes A-Frame + Babylon links AND only the documented exceptions — `editor`, `basic-xr`, `webxr`, `spark-babylon`, `spark-babylon-native` — may be unmarked).
- **Targeted-interaction smoke** for `render-cube-depth` — clicks the Depth checkbox on each engine and asserts the offline `renderCubeMap()` + `readCubeTargets()` pipeline completes with 6 cube faces. Template for future interaction-parity gates.
- **Native splat shader effects bundle** — `splatShaderEffectsFlare`, `splatShaderEffectsElectronic`, `splatShaderEffectsMeditation`, `splatShaderEffectsWaves` join `splatShaderEffects` in the parity matrix, exercising all 5 branches of the integer-dispatcher inside the same shader bundle (Disintegrate, Flare, Electronic, Meditation, Waves).

### Enhancements

- Every Tier 4 (animation), Tier 5 (shader-effects), Tier 6 (multi-pass / multi-camera), and Tier 7 (interactive) example is now engine-aware. `examples/index.html` exposes per-engine links for all 36 ordinary examples; the 5 documented exceptions (XR / editor / Babylon-host showcases) are intentional and guarded by the smoke spec.
- New `examples/spark-babylon/` and `examples/spark-babylon-native/` host demos showcasing the texture-bridge and native material backends.
- Phase F asset vendoring: 8 of 9 parity-matrix assets (`butterfly.spz`, `butterfly-ai.spz`, `cat.spz`, `fly.spz`, `distant-igloo.spz`, `fireplace.spz`, `valley.spz`, `robot-head.spz`, `penguin.spz`, plus `rubberduck.glb`) vendored under `test/fixtures/assets/`, removing CDN dependencies from local + CI runs.
- Native unit tests for the new backend adapters (`test/ThreeHostSceneAdapter.test.ts`, `test/ThreeSceneQuery.test.ts`, `test/capture.test.ts`, `test/gles.test.ts`, `test/loading.test.ts`).

### Performance

- **`make sort32 fast (#327)`** — Rust-side branchless WASM hot-loop optimization in `rust/spark-rs/src/sort.rs`. Cherry-picked from `sparkjsdev/spark` upstream (commit `6d24120`, author Ali Milhim, co-authored by Andreas Sundquist). Speeds up the 32-bit sort path that runs every accumulator update.
- **`Set dataReady false for textures arrays in SplatPager (#358)`** — SplatPager state-management fix cherry-picked from upstream (commit `78bc65e`, author Noeri Huisman). Reduces unnecessary GPU uploads during paged-splat state transitions.
- **Aframe dual-SparkRenderer fix** in `examples/js/spark-engine.js` — `setupAframeBackend` was racing TWO SparkRenderers per frame (one from `setupThreeBackend`, one from `registerSparkAFrame`), silently doubling GPU work for every aframe-mode example. Now removes the first explicitly. Surfaced by the new `raycasting click delivers hits` interaction smoke, which timed out on aframe before the fix.
- **`docs/RENDER-PERF-PLAN.md`** — phased plan covering instrumentation (`SparkRenderer.perfMetrics` getter), perf test infrastructure (`test/perf/` FPS budget + memory-growth + regression baseline), and targeted optimization candidates (Babylon texture-bridge shared GL context, three-pass scene traversal fold-into-one, scratch buffer reuse). Upstream remote configured fetch-only (`upstream push = no_push`) for divergence comparison without ever pushing.

### Contributor experience

- **`dist/` is no longer tracked in git.** Build output is regenerated from `src/` on every `pnpm run build` and is matched by `.gitignore`. No more phantom dirty working trees, no more merge conflicts on built bundles, no more `git update-index --assume-unchanged` workaround. A new `prepublishOnly` script runs `pnpm run build:wasm && pnpm run build` before `pnpm publish` so the published package always ships fresh artifacts matching the committed `src/`. See README "The `dist/` directory is build output".
- **Test directory consolidated:** the previous split between `test/` (Node `--test` unit) and `tests/` (Playwright e2e) is gone — everything lives under `test/` now. Unit tests at `test/*.test.ts`, e2e specs at `test/e2e/`, fixtures at `test/fixtures/`, Playwright output at `test/results/` (gitignored). `playwright.config.ts` stays at the repo root.
- Stale `package-lock.json` removed — `pnpm-lock.yaml` is the authoritative lockfile.
- 12 leftover `test-results-*/` debug-artifact directories from Phase D's diagnostic-ladder bisection removed; future stray `--output=foo` runs are gitignored via the new `test-results-*/` rule.

### Documentation

- `MULTI-BACKEND-PARITY-PLAN.md` — full phased plan (A through G), per-tier example inventory, exit criteria.
- `docs/claude-handoff.md` — engine-aware port template, helper API, smoke command, file-read order for the rollout.
- `AGENTS.md`, `src/backends/README.md` — backend rollout goals + adapter shape for each engine.


## 2.1.0 (Apr 18, 2026)

Bug fixes and adjustments post 2.0.0 release.

### Enhancements 

- Support plain x/y/z/r/g/b point clouds in ply files (#340) (@mrxz)
- Implement forEachSplat and getBoundingBox for PagedSplats (#324) (@mrxz)
- Specify 0.180.0 or higher as Three.js peer dependency (#309) (@mrxz)

### Bug Fixes

- Rename packed to packedData as Chrome 149 onwards considers it a reserved keyword (#351) (@mrxz)
- Remove spark-internal-rs from biome.json ignore list (#350) (@mrxz)
- Fix issue when premultipliedAlpha cannot longer be changed on the fly (#331) (@mrxz)
- Fix problem when loading CloudCompare-exported binary PLY files (#338) (@mrxz)
- Address memory leak by clearing texture references so can be GCed (#326) (@mrxz)
- Fix examples importmaps (@mrxz, @dmarcos)
- Docs Improvements (@mrxz, @dmarcos, @mikeyzhong)


## 2.0.0 (Apr 14, 2026)

Spark 2.0 is a major release that adds a Level-of-Detail (LoD) system for 3DGS, enabling huge worlds to be rendered on the web on any device, with progressive streaming, virtual splat paging, and higher precision storage. It remains mostly backward compatible with 0.1 apps.

### New features

- New `SparkRenderer` that supports rendering multiple LoD splat trees computed according to max splat counts, minimum screen-space size, and camera foveation. Also supports rendering splats from a virtual paging system, extended precision encoding. New options for custom render targets and overriding material properties including custom shaders and uniforms.
- Tunable LoD rendering: max splat count tunable with `SparkRenderer.lodSplatCount` and `.lodSplatScale`, minimum detail with `.lodRenderScale`, foveation parameters using `.coneFov0`, `.coneFov`, `.coneFoveate`, and `.behindFoveate`. Individual meshes tunable using `SplatMesh.lodScale`, `.coneFov(0)`, `.coneFoveate`, and `.behindFoveate`.
- New splat file format `.RAD` (RADiance field) that supports custom field encoding, columnar storage and compression, and chunked random access, enabling progressive loading and streaming of huge 3DGS scenes.
- Two 3DGS downsampling algorithms: `tiny-lod` for generating LoD splat trees on-demand in the browser after loading, and `bhatt-lod` for higher-quality LoD splat tree generation in an offline setting. Both algorithms can be run in the browser or from the `build-lod` cmdline tool.
- On-demand LoD splat creation using `new SplatMesh({ lod: true })` and `SplatMesh.createLodSplats`, and instant toggling between LoD and non-LoD versions of the splats using `SplatMesh.enableLod`.
- Virtual splat paging system `SplatPager` to preallocate GPU buffers shared across splat objects, loaded across the network in order prioritized by the viewpoint, managed in LRU fashion.
- High-precision splat encoding in `ExtSplats` that mirrors `PackedSplats` and alleviates most precision issues. High precision usage selectable using `SplatMesh.extSplats`,`SparkRenderer.pagedExtSplats`, and `.accumExtSplats`.
- Multiple viewport rendering using multiple `SparkRenderer`, generalizing viewport rendering to encompass different scenes, splats, and shader effects between renders.

### Enhancements

- Huge file loading support from `ReadableStream`, enabling multi-GB splat files from URLs or local drag-and-drop without first allocating a full `Uint8Array`.
- Chainable splat Dyno modifiers using `SplatMesh.objectModifiers` and `.worldModifiers` arrays.
- New `SparkXr` wrapper for AR / VR experiences

### Breaking changes

- Apps must now explicitly create a `SparkRenderer` and add it to the scene. Spark no longer automatically injects one because it would sometimes result in multiple renderers within the scene.
- Multiple viewpoints now use multiple `SparkRenderer` instances instead of `spark.newViewpoint()`, and sorting options are configured directly on each renderer.
- Spark 2.0 requires THREE.js r179 or newer, replaces `VRButton` with `SparkXr`, and replaces `SparkRenderer.getRgba()` / `.readRgba()` workflows with generator-based RGBA rendering.
- `OldSparkRenderer` and related `Old*` classes are available as temporary fallbacks for code that still depends on the 0.1 renderer model.

### Deprecations

- Deprecated the experimental stochastic sort-free rendering mode.
- Deprecated splat texture support for arbitrary per-splat RGBA texture profiles.


## 0.1.10 (Oct 24, 2025)

[SOG v2](https://blog.playcanvas.com/playcanvas-open-sources-sog-format-for-gaussian-splatting/) support, new examples and bug fixes

### Enhancements

- SOGSv2 (SOG) compression format support (#179) (@mrxz)
- Use DecompressionStream for decompressing .spz files for faster loading times (#181) (@mrxz)
- Make WASD default control for viewer (#6d7d801) (@dmarcos)
- Add `minPixelRadius` property to discard splats during vertex shader (#184) (@mrxz)
- Docs enhancements (@querielo)
- Interactive holes example (#189) (@kali-shade)
- Interactive ripples effect (#194) (@kali-shade)
- Support logarithmic depth buffer (#199) (@Philipp-M)

### Bug fixes

- Issue preventing the splats from being updated when they should. (#191) (@mrxz)
- Make bash script conform to "standard" (#197) (@Philipp-M)
- Fix issue with splats rendered at incorrect position for a few frames (#200) (fix #192, #193) (@mrxz)

## 0.1.9 (Sep 22, 2025)

Performance improvements, SPZ v3 support, new splat transition and reveal effects, brush painting / erasing splat example.

### Enhancements

- New splat transition effects (#172) (@kali-shade)
- New splat reveal effects (#153, #149) (@kali-shade)
- Add support for SPZ v3 (fix #151) (#171) (@gwegash, @dmarcos)
- Reduce small memory allocations when loading ply files (#147) (@mrxz)
- Improve .ply parsing speed using compiled parser function (#150) (@mrxz)
- Add support for ortographic rendering (#157) (@mrxz)
- Make sure all examples resize when the window is resized (#155) (@mrxz)
- Call gl.flush() to encourage eager execution. SparkRenderer.updateInternal was not immediately executed (#156) (@mrxz)
- Use child mesh in `SplatMesh` to auto-inject `SparkRenderer` instead of monkey-patching (#158) (@mrxz)
- Pre-compute lookup tables when parsing SOGS files (#159) (@mrxz)
- Avoid allocating THREE.Quaternion instances in `setPackedSplat` (#160) (@mrxz)
- Use native `Float16Array` to encode a number as a float16 if available. (#161) (@mrxz)
- Splat brush painting / brush erasing example (#165) (@winnie1994)

## 0.1.8 (July 31, 2025)

Bug fix + SplatMesh bounding box calculation.

### Bug fixes

- Fix SH encoding scale factors (#142) (@asundqui, @mrxz, @heimeii)
- Calculate a SplatMesh's bounding box! `SplatMesh.getBoundingBox()` (#126) (@winnie1994)

## 0.1.7 (July 30, 2025)

Image quality and performance improvements.

### Enhancements

- Customizable splat encoding ranges (rgb, sh1, sh2, sh3) for wider range of colors and scales support improving contrast and color reproduction. Expose `premultipliedAlpha` flag to use when accumulating splat RGB (#134) (@asundqui)
- [Experimental Stochastic splat ordering option](https://sparkjs.dev/examples/stochastic/). Faster rendering since sorting no longer needed but with some visual quality tradeoffs (#8f5596e) (@asundqui)
- Higher precision mode (float32) for splat sorting in addition to the default one (float16). Addresses z-fighting issues between splats (@asundqui, @mrxz) (#129)
- Allow decoding and parsing of SOGS images to happen in parallel (@mrxz) (#122)
- New [splat shaders effect example](http://sparkjs.dev/examples/splat-shader-effects) (#141) (@kali-shade)
- Expose `minAlpha` and `maxPixelRadius` in the [SparkRenderer](https://sparkjs.dev/docs/spark-renderer/) parameters (#130) (@asundqui)
- Tree-shaking on worker code (@mrxz) (#118)
- Add JSDocs to docs (@mrxz) (#123)
- Use THREE.js built-in [full screen quad](https://github.com/mrdoob/three.js/blob/95febf473cc326ac2029c51442b2fea3348c5321/examples/jsm/postprocessing/Pass.js#L138) instead of custom setup to cover the entire render target (@mrxz) (#121)
- Redunce bundle size by removing `anyhow::anyhow` dependency (#127) (@asundqui)

### Deprecations

- Remove `SparkRenderer` blending parameter. Rely instead on `THREE.js` built-in support for `premultipliedAlpha` that sets the right blending mode automatically (#136) (@mrxz)


## 0.1.6 (July 11, 2025)

Visual quality improvements, .zip sogs file support, bug fixes.

### Enhancements

- Can load [SOGS](https://blog.playcanvas.com/playcanvas-adopts-sogs-for-20x-3dgs-compression/) compressed splats packaged in a .zip file (#100) (@asundqui)
- Rename `SparkRenderer` renderScale parameter to [focalAdjustment](https://sparkjs.dev/docs/spark-renderer/#optional-parameters) (#113) (fix #99) (@asundqui, @mrxz)
- Use OffscreenCanvas and WebGL2 context to decode webp SOGS images instead of 3rd party dependency (#90) (@mrxz)
- [Animated transitions between splats example](https://sparkjs.dev/examples/splat-transitions/) (#69) (@winnie1994)
- [Example of loading a SOGS compressed splat](https://sparkjs.dev/examples/sogs/) (@dmarcos, @vincentwoo, @61cygni)
- Expand value range of internal splat encoding to improve visual quality. Lower zero cut-off to retain and render small splats. (#110) (@asundqui, @mrxz)

### Bug fixes

- Fix visible property of SplatMesh not having effect. (fix #77) (#100) (@asundqui, @cyango)
- Add missing sh1 and sh2 support to SOGS compressed support (fix #108) (#109) (@lucasoptml)
- Prevent unintentional reuse of ArrayBuffer on concurrent file requests or hits to THREE.Cache. Replace use of THREE.FileLoader with fetch API (#94, #112) (fix #93) (@mrxz, @asundqui)


## 0.1.5 (July 1, 2025)

Visual quality improvements and [SOGS](https://blog.playcanvas.com/playcanvas-adopts-sogs-for-20x-3dgs-compression/) support

### Enhancements

- Add support for [SOGS](https://blog.playcanvas.com/playcanvas-adopts-sogs-for-20x-3dgs-compression/) compression format 3D Gaussian Splatting (#73) (@asundqui)
- Change splat shapes by using any RGBA texture to compute the Gaussian falloff (#79) (@asundqui)
- Use RenderTarget properties to reduce manual render state tracking (#80) (@mrxz)

### Bug fixes

- Visual quality, Fix .ksplat decoding (fix #66) (@asundqui)
- Visual quality, Fix Spherical Harmonics not included in SPZ transcoding (fix #66) (#83) (@asundqui)
- Visual quality, Fix incorrect calculation of renderer size. Especially improves rendering in high DPI displays (#71) (@mrxz)
- Fix support of compressed .ply files exported from SuperSplat. Newer versions include min/max_r/g/b properties in the header that were not parsed (#82) (@asundqui)

## 0.1.4 (June 24, 2025)

### Enhancements

- Ability to render depth and normal values (#58) (@asundqui)
- New parameters to change renderer focal distance and aperture angle (#59) (@asundqui)
- GLSL code injection example (#56)
- WebXR example (#50)

### Bug fixes

- Option to disable SparkControls camera roll for touch controls (fix #46) (#60) (@asundqui)
- Fix sign in SH2 coefficient signs improving visual quality (#64)

## 0.1.3 (June 11, 2025)

Fix types export in published package.

## 0.1.2 (June 10, 2025)

It removes unnecessary dependencies from the published package.

## 0.1.1 (June 10, 2025)

### Bug fixes

- Fix compressed .ply files by gsplat not loading (#34) (@bolopenguin, @asundqui)
- Fix image quality rendering with mostly transparent splats (#36) (@hybridherbst, @@asundqui)
- Fix SplatMesh not rendering when it's a child of an Object3D (#38) (@dmarcos)


## 0.1.0 (June 2, 2025)

First release
