# Claude handoff: Spark multi-backend rollout

Date: 2026-06-11 (post engine-aware rollout push).
Codex continuation update: 2026-06-12.
Claude perf Phase 1 update: 2026-06-12.
Codex feature-hardening update: 2026-06-13.

## Codex continuation status (2026-06-13)

Feature rollout is effectively in the hardening phase. No ordinary example remains to port. The remaining work before calling the feature phase complete is broader verification, docs cleanup, and keeping the test suite deterministic while avoiding the perf-optimization path until the feature surface settles.

### What Codex added after Phase 2 perf infra

- **Focused feature smokes now cover every engine-aware example class.** The multi-backend smoke file has targeted Three / A-Frame / Babylon probes for LoD, paging, offscreen targets, cube-depth readback, shader/dyno modifiers, raycasting, pointer interactions, painter brush mode, viewer URL loading, lofi world cycling, legacy portal, SparkPortals, and splat-portal render targets.
- **`lofi` hardening:** `examples/lofi/index.html` gained `testLofiAssets=1`, which swaps the remote 500k world list for local `butterfly.spz` + `cat.spz` fixtures. `window.sparkLofi` exposes deterministic `prefetchNext()`, `applyTargetWorldNow()`, and `setRustle()` hooks so the smoke can validate cached world switching, splat counts, and shader-state updates without autoplay/audio/CDN timing.
- **`splat-painter` hardening:** `examples/splat-painter/index.html` gained `testPainterAsset=cat.spz`, plus `data-painter-file-name`. The smoke now uses the local fixture, asserts the brush keyboard mode, dispatches a minimal down/up brush gesture, and verifies `data-painter-rgba-updates >= 1` across all three engines. This reduced the test budget from 600s to 300s, but the perf-plan note about full `RgbaArray.render()` per pointer move still applies to production/default large assets.
- **`viewer` hardening:** the viewer URL-form smoke now enters the local `/test/fixtures/assets/robot-head.spz` URL instead of a `sparkjs.dev` URL. It still exercises the real URL input, history update, UI hide/show, `SplatMesh` initialization, and splat count path. `robot-head.spz` is intentionally smaller than `butterfly.spz`; Babylon texture mode reliably finishes it.
- **Reusable fixture asset switch:** `examples/js/get-asset-url.js` gained `testFixtureAssets=1`. It maps an explicit allowlist to `/test/fixtures/assets/...`: `butterfly-ai.spz`, `butterfly.spz`, `cat.spz`, `distant-igloo.spz`, `fireplace.spz`, `fly.spz`, `penguin.spz`, `robot-head.spz`, `rubberduck.glb`, and `valley.spz`. The generic load sweep enables this only for examples whose asset usage is covered by that allowlist, preserving the query string in engine-switcher href assertions.
- **Focused smoke fixture rollout:** `test/e2e/multibackend-smoke.spec.ts` now has shared `exampleParams()` / `exampleQuery()` helpers. The generic load sweep and selected focused smokes use the same fixture-query logic, including `render-cube-depth`, `dynamic-lighting`, `glsl`, `envmap`, `hello-world`, `lod`, `multiple-splats`, `debug-color`, `raycasting`, `depth-of-field`, `mobile-joystick`, `extsplats`, `nonlod`, `interactive-ripples`, `interactive-deform`, `interactive-holes`, `splat-shader-effects`, `splat-dissolve-effects`, and `newportal`.
- **`interactive-holes` hardening:** `examples/interactive-holes/index.html` gained `testHolesAsset`, and the smoke routes it to local `cat.spz`. This removes the remote `painted-bedroom.spz` dependency from the focused interaction test while preserving default example behavior.
- **Smoke query cleanup:** all focused smoke navigations now go through `exampleQuery()` / `exampleParams()` instead of hand-built `?engine=` strings. This centralizes fixture switches (`testFixtureAssets`, `testLofiAssets`, `testPainterAsset`, `testHolesAsset`) and keeps custom knobs like `testTransitionFrames`, `testSnowSplats`, `testSkipInitialEffect`, and portal static mode in the same query builder.

### Recent verification

- `lofi` slice: `pnpm exec playwright test test/e2e/multibackend-smoke.spec.ts --grep "lofi" --reporter=list` — 6/6 pass.
- `splat-painter` slice: `--grep "splat-painter"` — 6/6 pass.
- `viewer URL form loads splat` slice — 6/6 pass.
- `examples index` guard — 2/2 pass. `examples/index.html` lists 41 examples total; all ordinary examples are engine-aware, and only `editor`, `basic-xr`, `webxr`, `spark-babylon`, and `spark-babylon-native` remain documented exceptions.
- Fixture-backed representative generic loads:
  - `hello-world loads on engine` slice — 6/6 pass; grep also covered the focused hello-world animation smoke.
  - `envmap.*engine` slice — 6/6 pass, including fixture `models/rubberduck.glb`.
  - `render-cube-depth.*engine` slice — 6/6 pass, including the focused depth-toggle smoke.
- Fixture-backed focused-helper slices after the shared query helper:
  - `glsl updates` — 6/6 pass.
  - `dynamic-lighting toggles` — 6/6 pass.
  - `debug-color reapplies` — 6/6 pass.
  - `raycasting click delivers` — 6/6 pass.
  - `depth-of-field updates` — 6/6 pass.
  - `interactive-deform drag` — 6/6 pass.
  - `interactive-holes click` — 6/6 pass, with 3/3 hits and impulses on every engine using `cat.spz`.
  - `splat-dissolve-effects advances` — 6/6 pass.
  - `interactivity menu switches` — 6/6 pass after query-helper cleanup.
  - `multiple-viewpoints renders` — 6/6 pass after query-helper cleanup.
  - Portal family grep (`portal legacy two-pass`) — 18/18 pass; includes `newportal`, legacy `portal`, `splat-portal`, and their generic loads.
  - `lofi cycles` — 6/6 pass after clearing stale generated Vite optimizer cache.
  - `viewer URL form` — 6/6 pass after query-helper cleanup.
  - `splat-painter brush` — 6/6 pass after query-helper cleanup.
  - `mobile-joystick moves` — 6/6 pass after query-helper cleanup.
  - `extsplats compares` — 6/6 pass after query-helper cleanup.
- Focused slices run with the tiered testing strategy instead of a full matrix rerun:
  - `streaming-lod switches` — 6/6 pass; includes focused world switch and generic loads.
  - `multi-lod caps` — 6/6 pass; includes focused capped-paging smoke and generic loads.
  - `sogs decodes` — 6/6 pass; includes the large SOGS zip decode path and generic loads.
  - `procedural-splats builds` — 6/6 pass; includes generated text/image sources and generic loads.
  - `nonlod toggles` — 6/6 pass; includes focused LoD/coloring toggle and generic loads.
  - `lod toggles explicit LoD mesh state` — 3/3 pass when isolated with exact grep.
  - `multiple-splats reuses shared packed data` — 3/3 pass.
  - `interactive-ripples click delivers ripples` — 3/3 pass, with 3/3 hits on every backend.
  - `splat-shader-effects swaps modifiers` — 3/3 pass.
  - `particle-simulation updates snow controls` — 3/3 pass.
  - `particle-animation recreates cloud presets` — 3/3 pass.
  - `splat-flow rebuilds transition modifiers` — 3/3 pass.
  - `lod-on-demand creates LoD tree` — 3/3 pass.
  - `splat-reveal-effects switches effect mesh` — 3/3 pass.
  - `splat-transitions switches dynamic effect` — 3/3 pass.
  - A too-broad `--grep lod` run hit the shell wrapper timeout and left a channel-closed artifact for `lod loads on engine=three`; rerunning the intended exact grep passed, so this was a harness invocation issue, not a page regression. Use the WSL single-quoted grep form from the testing strategy section.
- Last-demo index polish:
  - `examples/index.html` now labels the page as links to each supported host/backend, not all hosts for every row.
  - Documented exceptions now only expose supported links: `editor`, `basic-xr`, and `webxr` link to Three only; `spark-babylon` and `spark-babylon-native` link to Babylon only.
  - Rationale: the Three-only rows are host-specific editor/XR surfaces, not missing renderer examples. Desktop renderer/runtime parity is already covered by the ordinary engine-aware examples; XR headset-session parity and editor chrome are separate work. The Babylon-only rows are already direct Babylon host references, so adding Three/A-Frame links would make the page less honest rather than more universal.
  - The `examples index` guard asserts the exception list and each exception row's exact supported links. Verified 2/2 pass.
- `spark-babylon-native` shader-load fix:
  - The native Babylon reference page could throw `Failed to fetch dynamically imported module ... default.vertex/default.fragment` when Babylon 9 tried to lazy-load built-in shader chunks from Vite's optimized dependency cache.
  - `examples/spark-babylon-native/index.html` now imports Babylon's `default.vertex`, `default.fragment`, and `standard.fragment` shader modules explicitly before constructing the scene. This keeps the Spark native `ShaderMaterial` path and the TorusKnot `StandardMaterial` path out of Babylon's async shader-chunk fallback.
  - The page also writes `data-babylon-native-ready` and `data-babylon-native-frames` for smoke verification. `test/e2e/multibackend-smoke.spec.ts` now has a narrow `spark-babylon-native host reference loads without shader chunk errors` guard that waits for rendered frames, checks the WebGL canvas has nonzero pixels, and fails on console/page errors. Verified 1/1 pass.
- `spark-babylon` texture-bridge reference hardening:
  - The texture-mode Babylon reference page now imports Babylon's `layer.vertex` and `layer.fragment` shader modules explicitly before constructing the scene. This mirrors the native fix for the Layer-based texture bridge path.
  - The page writes `data-babylon-texture-ready` and `data-babylon-texture-frames`; the smoke spec has a matching `spark-babylon host reference loads without shader chunk errors` guard that checks rendered frames, nonzero canvas pixels, and no console/page errors.
  - Verified together with the native guard: `--grep 'spark-babylon.*host reference'` passed 2/2.
- Shared Babylon texture-bridge shader fix:
  - User reported live console errors on `particle-simulation`, `particle-animation`, and `splat-reveal-effects` with `?engine=babylon`: Babylon `Layer` effect compilation tried to fetch stale/missing Vite optimized chunks such as `layer.vertex-*.js` / `layer.fragment-*.js`.
  - `examples/js/spark-engine.js setupBabylonBackend()` now explicitly imports `@babylonjs/core/Shaders/layer.vertex.js` and `@babylonjs/core/Shaders/layer.fragment.js` before importing core Babylon constructors and creating `SparkBabylonHost`. This fixes the shared engine-aware Babylon texture bridge path, not just individual demos.
  - `test/e2e/multibackend-smoke.spec.ts` now has a narrow `reported Babylon texture-bridge demos load without layer shader chunk errors` guard for those three URLs. It waits for the engine switcher and fails on page/console errors, catching setup-level shader chunk regressions without waiting on every heavy default asset.
  - Verification: direct Playwright probe against the three `localhost:8080` URLs had no console/page errors after the fix; the new reported-URL guard passed 1/1; focused demo smokes for `particle-simulation updates snow controls`, `particle-animation recreates cloud presets`, and `splat-reveal-effects switches effect mesh` passed 9/9.
- Phase 3 painter coalescing:
  - `examples/splat-painter/index.html` now coalesces expensive full-mesh `RgbaArray.render()` rebuilds through `requestAnimationFrame` instead of calling `updateRgba()` synchronously for every drag `pointermove`.
  - The painter smoke now sends a same-tick burst of pointer moves and asserts the move count is high while `data-painter-rgba-updates` stays bounded. Verification: `splat-painter brush paints` passed 3/3 with 6 pointer moves and 2 RGBA rebuilds on each backend.

### Local WSL/Vite cache caveat

On 2026-06-13 a lofi smoke initially failed before the engine switcher appeared because Vite hit the known `/mnt/c` optimizer rename issue:

```
EACCES: permission denied, rename 'node_modules/.vite/deps_temp_*' -> 'node_modules/.vite/deps'
```

The fix was to remove only the generated `node_modules/.vite/deps_temp_*` directory after verifying its resolved path stayed under this repo. Re-running `lofi cycles` then passed 6/6. Do not treat this as an app regression.
- Repeated clean checks after the hardening batches: `pnpm exec tsc --noEmit`, `pnpm exec biome check ...`, and `git diff --check ...`.

### Completion read

- **Feature rollout / multi-backend example coverage:** about 90-95% complete. Remaining work is hardening + broad verification, not new ordinary example ports.
- **Perf plan:** Phases 0-2 are shipped. Phase 3 targeted optimizations and Phase 4 CI perf gating remain intentionally deferred until the feature checkpoint is cut.
- **Whole roadmap including perf optimization/gating:** roughly 70-75% complete.

### Testing strategy from here

Do not run the full smoke matrix after every small edit. The current matrix is broad enough that a full run is a checkpoint tool, not a development loop.

- **Tier 0, every code/doc batch:** `pnpm exec tsc --noEmit`, `pnpm exec biome check ...`, and `git diff --check ...` on the touched paths. These are cheap and catch TypeScript, formatting, and whitespace drift.
- **Tier 1, per touched example:** run the exact focused Playwright grep for that example only, using single-quoted grep text inside WSL, for example:
  ```bash
  wsl bash -ic "cd /mnt/c/Users/brend/exp/spark && nvm use 20 >/dev/null && pnpm exec playwright test test/e2e/multibackend-smoke.spec.ts --grep 'splat-flow rebuilds transition modifiers' --reporter=list"
  ```
- **Tier 2, per touched helper/shared query path:** run representative examples that exercise the helper categories instead of every example. Suggested set: `examples index`, `hello-world animates`, `viewer URL form`, `lofi cycles`, `interactive-ripples click`, `portal legacy two-pass`, and one heavy LoD scene (`streaming-lod switches` or `multi-lod caps`).
- **Tier 3, milestone only:** run grouped focused slices for the remaining unverified feature families, then a generic load sweep or full `multibackend-smoke.spec.ts` only before a commit/handoff that claims feature-phase completion.
- **Tier 4, perf path:** use `pnpm run test:perf:smoke` for harness sanity. Do not start Phase 3 optimization or CI perf gating until the feature checkpoint is cut.

Why: the smoke suite now validates all ordinary examples across Three, A-Frame, and Babylon, so repeated full runs spend most time re-proving unaffected examples. How to apply: pick the narrowest tier that covers the files or helper behavior touched, record the command and result here, and reserve full matrix runs for release gates.

### Current caution

The working tree is intentionally very dirty. Some files are Brendon's long-running WIP and must not be reverted. The Codex continuation has added changes across examples, the smoke spec, perf infra, fixture helpers, and docs; before committing, inspect scope carefully and separate unrelated WIP from feature-hardening commits.

## Status as of this handoff (2026-06-12 afternoon)

**Multi-backend parity:** unchanged from this morning's Codex continuation — 27 scenes, bit-perfect 0/786432 across Three / A-Frame / Babylon-texture / Babylon-native (envMap remains native-excluded; texture mode bit-perfect there). All 36/41 ordinary examples engine-aware; 5 documented exceptions guarded by smoke index.

**Render perf:** `docs/RENDER-PERF-PLAN.md` Phase 0/0.5 already done (upstream `sort32 fast` + `dataReady false` cherry-picked as `b4804c8` + `2f51875`; dual-spark fix shipped in `d713d90`). **Phase 1 instrumentation now landed** — see below.

## Phase 1 perf instrumentation (claude session 2026-06-12)

Added `SparkRenderer.perfMetrics` getter returning a `SparkPerfMetrics` snapshot of last-frame timings. Six fields:
- `lastFrameMs` — delta between `onBeforeRender` invocations (per-frame wall budget proxy).
- `lastSortMs` — `driveSort` body (worker round-trip + ordering upload). `0` until first sort fires.
- `lastAccumulateMs` — `SplatAccumulator.generate()` inside `updateInternal`.
- `lastTraverseMs` — existing `this.lastTraverseTime` (LOD traverse).
- `lastLodRaycastMs` — raycast `traverseLodTrees` in `driveLod` (was computed but discarded — now surfaced).
- `lastBabylonReadbackMs` — `SparkBabylonTextureBridge.syncOnce()` total. `0` in native mode.

Verified: typecheck clean, biome clean, axes scene 8/8 still bit-perfect on all four backends. No runtime overhead — producers write instance fields directly; the getter just packs them into a plain object.

Exports: `SparkPerfMetrics` re-exported from `src/index.ts` alongside `SparkRenderer` / `SparkRendererOptions`.

### Phase 2 perf-test infrastructure (Codex update 2026-06-12)

Phase 2 is now benchmark-only so feature work can continue before optimization starts. The harness lands the speed measurements we need without a default CI gate:

1. **`test/perf/render-fps.spec.ts`** — Playwright loads `test/fixtures/snapshot-{three,aframe,babylon}.html?scene=<scene>`, drives `requestAnimationFrame` for 600 frames by default, samples `spark.perfMetrics` each frame, prints a compact p50 / p95 terminal summary, and writes full p50 / p95 / p99 summaries to `tmp/perf/render-fps.json`. Reports and baselines include selected scenes/backends/frame counts/full-default metadata. Last-observed work-item metrics summarize changed nonzero samples so throttled producers do not duplicate one stale value across the whole frame window.
   - Hot scenes for the default run: `helloWorld` (177K splats baseline), `glsl` (dyno raw-shader path), `sogs` (cold-cache SOGS load + many splats), `splatShaderEffects` (5-variant effectType branch coverage).
   - Narrow development loop: `pnpm run test:perf:smoke`, or direct env overrides such as `SPARK_PERF_SCENES=axes SPARK_PERF_BACKENDS=three SPARK_PERF_FRAMES=30 pnpm run test:perf`.
2. **Baseline behavior** — `test/perf/regression-baseline.json` starts empty. `SPARK_PERF_UPDATE_BASELINE=1 pnpm run test:perf` writes reviewed local numbers from the full default benchmark; partial baseline writes are refused unless `SPARK_PERF_ALLOW_PARTIAL_BASELINE=1` is set. `SPARK_PERF_ASSERT_BASELINE=1` turns ±15% p50 drift, or a missing committed baseline entry, into a hard failure later.
3. **`pnpm run test:perf` / `pnpm run test:perf:smoke`** — uses `playwright.perf.config.ts`, one worker, and `test/perf-results` output, separate from `test:e2e`. The smoke script runs `axes` across all four backend modes with three measured frames.

Phase 3 optimizations and hard CI gating remain deferred until the feature list is complete.

### Pickup notes for Phase 2

- `spark` is the SparkRenderer instance; the fixtures now put it on `window.spark` and expose `window.sparkPerfBenchmark.renderFrame()` for one backend-correct benchmark frame.
- `lastBabylonReadbackMs` currently measures `SparkBabylonTextureBridge.syncOnce()`, which is used by Babylon native material sync. Texture mode's direct `SparkBabylonHost.renderOnce()` readPixels path is not yet surfaced through that field, so the benchmark reports the metric as observed instead of asserting texture/native expectations.
- Phase 1 fields START at `0` until their producer fires. Throttled producers (sort gated by `minSortIntervalMs`, raycast gated by `lodRaycastIntervalMs`) may not fire every frame — the perf spec should record nonzero samples only or aggregate over the full 600-frame window.
- The `axes` smoke is the fastest sanity check (< 60s wall time for 8 sub-tests including parity). Use it as the smoke-cycle scene during Phase 2 spec development before running the heavy hot-scene set.

## Headline numbers

- **Parity matrix:** 27 scenes. Bit-perfect 0/786432 px diff on every Three vs A-Frame vs Babylon-texture pair. Babylon-native bit-perfect on **26/27** (envMap remains the documented native exclusion).
- **Engine-aware live coverage:** all ordinary examples are now engine-aware and exposed from `examples/index.html`. The only non-engine-aware rows are the documented exceptions/showcases: `editor`, `basic-xr`, `webxr`, `spark-babylon`, `spark-babylon-native`.
- **Tier 4 (time-driven animation):** CLOSED OUT.
- **Tier 7 (interactive):** CLOSED OUT.
- **Tier 5 shader-driven:** CLOSED OUT for engine-aware smoke coverage (`lofi` now gates Three / A-Frame / Babylon load).
- **Tier 6 multi-pass / multi-camera:** CLOSED OUT for engine-aware smoke coverage (`multiple-viewpoints`, `portal`, `newportal`, `splat-portal`, `render-cube-depth` all gate Three / A-Frame / Babylon load).

## What landed on 2026-06-11 (8 commits, all on `main`)

Last commit before session: `024deba`. After: `c571ad1`.

| # | SHA | Type | Summary |
|---|---|---|---|
| 1 | `3863742` | feat(e2e) | splatShaderEffects Electronic/Meditation/Waves variants (3 scenes, 24/24 bit-perfect) |
| 2 | `fc24759` | docs(parity) | Plan bump: matrix 27 scenes, native 26/27 |
| 3 | `947b10d` | feat(examples) | raycasting engine-aware (Tier 7, 3/3 smoke) |
| 4 | `d571cb2` | feat(examples) | particle-animation + particle-simulation + splat-flow engine-aware + `env.canvas` helper (Tier 4, 9/9 smoke) |
| 5 | `9d3be00` | feat(examples) | interactive-ripples + interactive-deform engine-aware (Tier 7, 6/6 smoke) |
| 6 | `eb54747` | feat(examples) | interactivity + interactive-holes + splat-painter engine-aware (closes Tier 7, 9/9 smoke) |
| 7 | `c01b323` | feat(examples) | viewer engine-aware (3/3 smoke) |
| 8 | `c571ad1` | feat(examples) | multiple-viewpoints engine-aware — first Tier 6 multi-pass port, validates texture-bridge survival (3/3 smoke) |

## Helper changes worth knowing

`examples/js/spark-engine.js` gained `env.canvas` (in commit `d571cb2`). It is the VISIBLE top-of-DOM canvas:
- Three / A-Frame: identical to `env.renderer.domElement`.
- Babylon: the BabylonJS engine's canvas. `env.renderer` is the offscreen Three renderer that the texture-bridge reads from — pointer events DO NOT REACH IT.

**Always bind input controls to `env.canvas`:** PointerControls, SparkControls, OrbitControls, raycast click handlers, drag/drop targets. Every Tier 7 port in this session uses this pattern.

The Codex continuation added `env.runManual(tick)` for examples that own their render pass (`portal`, `splat-portal`, `newportal`). Three/A-Frame call `tick(time, dtMs, xrFrame)` without the helper's automatic `renderer.render`. Babylon calls the same tick, then presents the already-rendered offscreen Three canvas through the texture bridge before `babylonScene.render()`.

`env.run(tick)` now forwards the optional `xrFrame` argument on the Three path. This keeps `lofi`'s XR hand-update path alive on native Three while A-Frame/Babylon run the desktop path.

## What's left

No ordinary example is left to port for engine-aware smoke coverage. `test/e2e/multibackend-smoke.spec.ts` now has two index guards:

- every `ENGINE_AWARE_EXAMPLES` row must be marked `class="engine-aware"` and expose A-Frame/Babylon links;
- the only allowed non-engine-aware rows are exactly `editor`, `basic-xr`, `webxr`, `spark-babylon`, `spark-babylon-native`.

### Do NOT port

- **`spark-babylon`**, **`spark-babylon-native`** — Babylon host showcases by design. The whole point is they demonstrate the Babylon host directly; engine-switching them would defeat the purpose.
- **`basic-xr`**, **`webxr`**, **`editor`** — Documented non-gatable exceptions. XR requires headset session semantics; editor chrome parity is lower value than the splat/runtime coverage already gated elsewhere.

### Closed in `a3db749` (was a known caveat)

`render-cube-depth`'s checkbox-triggered `offline.renderCubeMap()` + `readCubeTargets()` path is now gated by a per-engine interaction smoke. The Depth checkbox is rewired to an explicit `addEventListener` and `toggleDepth()` writes `data-cube-depth-ready`, `data-depth-ready`, and `data-depth-faces` body dataset flags; the new test clicks through one full cycle and asserts `data-depth-ready="depth"` + `data-depth-faces="6"` on each of Three / A-Frame / Babylon. Verified 3/3 pass in 6.4m wall time. This is currently the only example in the matrix that gates anything beyond initial page load — its shape is the template for future targeted-interaction smokes (raycasting hit, splat-painter brush, interactive-deform drag, etc.).

## Engine-aware port template

Cleanest template is commit `eb54747` (the Tier 7 closeout). The minimal surface transform:

1. **Importmap:** add `"@babylonjs/core": "https://cdn.jsdelivr.net/npm/@babylonjs/core@9/+esm"`.
2. **Drop** `SparkRenderer` from the `@sparkjsdev/spark` import; **add** `import { setupSparkExample } from "../js/spark-engine.js"`.
3. **Replace** manual `Scene` / `PerspectiveCamera` / `WebGLRenderer` / `SparkRenderer` setup with `const env = await setupSparkExample({ cameraConfig, clearColor })`.
4. **Bind controls to `env.canvas`** (NOT `env.renderer.domElement`).
5. **Replace** `scene.add(splat)` → `env.add(splat)` for SplatMesh. Non-splat Three meshes can use `env.scene.add(...)` directly — the helper's `scene` is `host.threeScene` in babylon mode so it bridges correctly.
6. **Replace** `renderer.setAnimationLoop(...)` with `env.run(...)`. Same `(time, dtMs)` signature; renderer.render is called by the helper.
7. **Drop** manual resize handler — helper installs one.
8. **Drop** any stale `<canvas id="...">` element if helper now attaches its own canvas.

Per-example tweaks: see `examples/raycasting/index.html` (simple), `examples/particle-simulation/index.html` (medium, OrbitControls-style camera mutation), `examples/splat-painter/index.html` (complex, multiple pointer handlers).

## Required follow-up after each port

1. Mark `<tr class="engine-aware">` on the row in `examples/index.html`.
2. Add the example name to `ENGINE_AWARE_EXAMPLES` in `test/e2e/multibackend-smoke.spec.ts`.
3. Run smoke before commit:
   ```bash
   wsl -d Ubuntu -- bash -ic 'cd /mnt/c/Users/brend/exp/spark && nvm use 20 && \
     pnpm exec playwright test test/e2e/multibackend-smoke.spec.ts --grep "<name>"'
   ```
   `bash -ic` (interactive) loads nvm — `bash -lc` does NOT.
4. Commit with rich body covering why / what / verification (see `eb54747` for the form). Write the body to `c:/tmp/commit-msg.txt`, then `git commit -F c:/tmp/commit-msg.txt` — bash heredocs eat backticks.

## Files to read first next session

1. `MULTI-BACKEND-PARITY-PLAN.md` — Live parity-matrix state (memory files lag this).
2. `test/fixtures/scenes.mjs` — The 27 scene definitions.
3. `test/e2e/snapshot.spec.ts` — `SCENES` / `NETWORK_SCENES` / `NATIVE_BABYLON_SCENES` configuration.
4. `test/e2e/multibackend-smoke.spec.ts` — `ENGINE_AWARE_EXAMPLES` array.
5. `examples/js/spark-engine.js` — The helper. `env.canvas` and the three `setup*Backend` functions.

## Memory pointers

- `project_parity_phased_plan.md` — Phase A–G phased state; engine-aware coverage list now lives here.
- `feedback_update_examples_index.md` — Every engine-aware port must mark the row engine-aware in `examples/index.html` + add to `ENGINE_AWARE_EXAMPLES` in the smoke spec.
- `feedback_use_wsl_for_playwright.md` — WSL/bash-ic for all Playwright invocations.
- `feedback_bash_heredoc_commit_messages.md` — Write commit messages to `c:/tmp/commit-msg.txt` then `git commit -F`.
