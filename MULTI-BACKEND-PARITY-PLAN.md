# Examples × Backend Parity Plan

**Goal (AGENTS.md):** 100% visual parity across Three / A-Frame / Babylon on every example in `examples/`.

**Status (2026-06-09):** 7 / ~40 examples represented in the parity matrix. Real `.spz` URL loading verified bit-perfect across all three backends (`helloWorld`, `multipleSplats`). The remaining examples split into tractable, blocked-on-feature, and intrinsically-non-gatable buckets — see the phases below.

This is a multi-session journey; each phase is a self-contained deliverable that lands incrementally.

## Inventory and classification

All 40 example directories under `examples/` (excluding `spark-babylon/` which is the new Babylon host demo, and the support directories `js/` and the `index.html` portal page) split into seven tiers:

### Tier 1 — Procedural, in matrix today (5 scenes, ✅ done)

| Example dir | Matrix scene | Notes |
|---|---|---|
| _(none direct)_ | `axes` | `constructAxes`. Adapter sanity. |
| _(none direct)_ | `grid` | `constructGrid` 5×5×5 RGB. |
| _(none direct)_ | `sphere` | `constructSpherePoints` oriented. |
| _(none direct)_ | `multi` | Sphere + axes Group, cross-mesh sort. |
| _(none direct)_ | `tinted` | `SplatMesh.recolor` modifier. |

### Tier 2 — URL-loaded, in matrix today (2 scenes, ✅ done)

| Example dir | Matrix scene | Notes |
|---|---|---|
| `hello-world/` | `helloWorld` | `butterfly.spz` from sparkjs.dev CDN. |
| `multiple-splats/` | `multipleSplats` | `butterfly-ai.spz` + `cat.spz`, two URL splats in a Group. |

### Tier 3 — URL-loaded, static-frame portable (10 examples, planned next)

These all load a `.spz` from the CDN and render with one or two tunable parameters (camera, modifier, LoD knob). Each becomes one new scene in `scenes.mjs`. Each takes ~15–30 min once the CDN budget is set.

| Example dir | Builds on | Camera/asset notes |
|---|---|---|
| `debug-color/` | URL load + `modifiers.setWorldNormalColor`, `modifiers.setDepthColor` | `butterfly.spz` + `butterfly-ai.spz`, two splats side by side |
| `dynamic-lighting/` | URL load + lighting modifier | `fireplace.spz` |
| `envmap/` | URL load + EXR env map (EXRLoader is Three.js — A-Frame and Babylon mocks will need the same texture path) | `fireplace.spz` + EXR env map |
| `glsl/` | URL load + custom GLSL shader effect on `SplatMesh` | `butterfly.spz` |
| `nonlod/` | URL load with `enableLod: false` | One splat file |
| `viewer/` | URL load, generic viewer | Camera matches viewer's default frame |
| `sogs/` | URL load of `.sog` (SOGSv2) — exercises the SOGS reader path | One `.sog` file from CDN |
| `depth-of-field/` | URL load + `SparkRenderer` DoF config | `valley.spz` |
| `procedural-splats/` (partial) | `constructAxes` + `constructGrid` + `textSplats` + `imageSplats` | Caveat: `textSplats` is canvas-font dependent and may not be deterministic across runs |
| `extsplats/` | URL load with extended-splat encoding | `distant-igloo.spz` |

**Phase deliverable:** 10 new scenes in `scenes.mjs`, 10 new rows in the matrix. Matrix grows from 7 to 17 scenes, ~102 tests total. CI time on cold cache ~30–45 min.

### Tier 4 — Animated, static-frame portable with care (5 examples)

Each example has a `setAnimationLoop` that mutates splat state over time. To pixel-diff, the parity fixture must lock the time uniform to a deterministic value (e.g. `t = 1.5 s`) and re-render until the splat sort has converged.

| Example dir | What's animated |
|---|---|
| `splat-transitions/` | Interpolation between two splats |
| `splat-flow/` | Particle-flow animation across splats |
| `particle-animation/` | Procedural particle animation, uses sky.jpeg texture |
| `particle-simulation/` | Physics-driven particle simulation |
| `streaming-lod/` | LoD level streams in over time — needs network and convergence wait |

**Phase deliverable:** scenes.mjs gains an optional `time` config per scene; the fixture writes that value into `SparkRenderer.update({ time })`. 5 new scenes; ~30 tests. Each scene may need a per-fixture tolerance bump if shader-driven animation introduces sub-pixel jitter across backends.

### Tier 5 — Animated effect / shader-driven (4 examples)

Same shape as Tier 4 but the variability is in a custom shader the example wires up. Need to carry the example's shader code into the scene catalogue, then render at a fixed time.

| Example dir | Effect |
|---|---|
| `splat-dissolve-effects/` | Splats dissolving |
| `splat-reveal-effects/` | Splats revealing |
| `splat-shader-effects/` | Generic shader effect demo |
| `lofi/` | Lo-fi visual effect over animation |

**Phase deliverable:** 4 new scenes with custom shader wiring. ~24 tests.

### Tier 6 — Multi-pass / multi-camera (4 examples, **blocked on native Babylon material**)

These render to multiple cameras or render-targets per frame. The current `SparkBabylonHost` texture-bridge MVP only drives one Spark render per Babylon frame; multi-camera or multi-pass would need either multiple texture bridges (clunky) or the native Babylon material that draws splats inside Babylon's render pass.

| Example dir | Why blocked |
|---|---|
| `multiple-viewpoints/` | Two cameras render same scene to two viewport regions; the texture bridge supports one camera. |
| `portal/`, `newportal/`, `splat-portal/` | `SparkPortals` runs two `SparkRenderer` instances in a two-pass portal effect; texture bridge supports one. |
| `render-cube-depth/` | Cube-map depth render; requires Babylon RenderTargetTexture cube path that the texture bridge does not expose. |

**Phase deliverable:** lands alongside the native Babylon material backend. Three + A-Frame parity is unblocked today; Babylon parity for these scenes waits for the material backend. Likely a separate phase entry once the native material is in flight.

### Tier 7 — Interactive (5 examples, capture initial state only)

These respond to pointer/keyboard input. The initial-load static frame is parity-able; the interactive divergences from baseline are not, by definition.

| Example dir | Interactivity |
|---|---|
| `interactive-deform/` | Pointer-driven deform |
| `interactive-holes/` | Pointer-driven hole carving |
| `interactive-ripples/` | Pointer-driven ripples |
| `splat-painter/` | Pointer-driven painting onto splats |
| `interactivity/` | Mixed input demo |
| `raycasting/` | Click → highlight; initial frame parity-able, the click result is input-driven |

**Phase deliverable:** 6 initial-state-only scenes; document that the gate proves the load + setup path, not the interactive divergence.

### Tier 8 — Non-gatable in CI (3 examples)

| Example dir | Why |
|---|---|
| `basic-xr/` | WebXR requires headset session; no headless equivalent in Playwright. |
| `webxr/` | Same. |
| `editor/` | Full editor UI — pixel parity of an editor chrome adds little value vs the splat parity already covered by other scenes. |
| `mobile-joystick/` | Joystick input simulation in Playwright is doable but high-friction; defer until the rest is covered. |

**Phase deliverable:** these stay out of the gate. Document the rationale in AGENTS.md so the "every example" rule has an explicit exception list rather than a quiet gap.

## Phased rollout

### Phase A — Tier 3 URL-loaded sweep ✅ DONE (10 / 10 scenes, commit `06d7bbe`)

All ten Tier 3 scenes landed across this and the previous session: `helloWorld`, `multipleSplats`, `debugColor`, `viewer`, `depthOfField`, `sogs`, `extSplats`, `nonLod`, `glsl`, `dynamicLighting`, `envMap`.

Matrix is now 15 scenes total (5 Tier 1 + 2 Tier 2 + 10 Tier 3). All 20 pairwise diffs (10 URL × 2 backend pairs) report 0 / 786432 pixels — bit-perfect parity across Three / A-Frame / Babylon on every URL-loaded scene, including the .spz, SOGS, ExtSplats, modifier, dyno shader-graph, dyno raw-GLSL, SplatEdit/Sdf, and renderEnvMap paths.

Infrastructure landed in Phase A:
- `sparkOverrides` field in scene config (b21f985) — merges into `SparkRenderer` construction across all three fixtures.
- `postInit({ spark, scene, camera, renderer })` hook (06d7bbe) — lets a scene config touch `SparkRenderer` (renderEnvMap, etc.) after construction.
- Network-scene timeout budget — Three/A-Frame `test.setTimeout(240s)`, `goto(180s)`, `data-ready(180s)`; Babylon `test.setTimeout(540s)`, `goto(240s)`, `data-ready(360s)`.

`procedural-splats` stayed deferred (textSplats font flakiness).

### Phase B — Time-locked animation scenes (foundation done, Tier 4 ports continuing)

Foundation landed in commit `3d85821`:

- `scenes.mjs` scene configs accept `time?: number` (seconds). The three fixtures set `spark.time = sceneCfg.time` before the `spark.update()` call so any time-dependent shader code (DoF jitter, sort fade-in, dyno modifiers reading the `time` uniform) sees a deterministic value rather than the wall clock.
- `SparkRenderer.time?: number` was already public — `spark.update()` reads `this.time ?? this.clock.getElapsedTime()`. No Spark API change was needed; this was a soft prerequisite that turned out to be already met.

First time-driven scene: `animatedWarp` (also in `3d85821`). Mirrors the animated portion of `examples/glsl` with a dyno `warpRadial` block driven by `animateT = dyno.dynoFloat(1.5)`. Bit-perfect parity at the fixed time.

Tier 4 ports still pending (~1-2 hours per scene, each ports to scenes.mjs):

- `splat-transitions` — 4-effect switching system (spheric, explosion, flow, morph). Port the simplest effect (spheric) first as a single scene; the rest can land later.
- `splat-flow` — 3 splat URLs + dali-env.glb sky + a substantial custom dyno transition pipeline with hash-based per-splat behaviour.
- `particle-animation` — procedural cloud generator (~20K splats, octave noise, wind, sky.jpeg). The static frame is parity-able once the generator is replicated inline.
- `particle-simulation` — physics step per frame; deterministic-frame parity needs a fixed simulation step count.
- `streaming-lod` — depends on streaming the LoD over time; static-frame parity is meaningless until streaming completes (or until we mock the streaming layer).

Exit (when Tier 4 ports finish): matrix at ~21 scenes (5 Tier 1 + 2 Tier 2 + 10 Tier 3 + 1 demonstrator + 5 Tier 4). Animation parity at a fixed timestamp bit-perfect across backends.

### Phase C — Shader-effect scenes (≈ 4 commits, 1 session)

Same shape as Phase B but with shader wiring lifted from each Tier 5 example into the scene catalogue. May need a `shaderSetup(mesh)` hook in the scene config.

Exit: matrix has 26 scenes.

### Phase D — Native Babylon material backend ✅ DONE (8 commits, 2026-06-10)

Shipped end-to-end. The texture-bridge MVP path is preserved as the default; `mode: "native"` on `SparkBabylonHost` opts into the new path. The native material draws splats inside Babylon's render pass against a Babylon `ShaderMaterial` backed by Spark's accumulator output textures, transferred from Three's GL via direct `gl.readPixels` against a private framebuffer.

Shipped components (commit chain `b820092` → `9b08d03`):
- `src/backends/babylon/SparkBabylonShaderChunks.ts` — bridges `THREE.ShaderChunk` onto `BABYLON.Effect.IncludesShadersStore`.
- `src/backends/babylon/SparkBabylonMaterial.ts` — Babylon `ShaderMaterial` wrapping Spark's splat vertex/fragment. Prepends `#version 300 es` + the explicit Three globals (`position` attribute, `projectionMatrix` / `isOrthographic` uniforms, `usampler2D` / `sampler2D` precision) Babylon does not auto-inject. Pairs `vec4(rgb*a, a)` premultiplied fragment output with `alphaMode = ALPHA_PREMULTIPLIED`.
- `src/backends/babylon/SparkBabylonMesh.ts` — Babylon `Mesh` with thin-instance quad geometry. Per-frame, invokes `spark.onBeforeRender` manually (native mode never triggers Three's render path that normally fires it), calls `initTexture` on the ordering texture so subsequent sorts find `__webglTexture`, drives the texture bridge + uniform sync, and sets `thinInstanceCount`. Identity matrix buffer grows with `spark.activeSplats`.
- `src/backends/babylon/SparkBabylonTextureBridge.ts` — GPU readback for `ordering` (regular 2D, `framebufferTexture2D`) and `extSplats` / `extSplats2` (`WebGLArrayRenderTarget`, `framebufferTextureLayer` per MRT slot per layer). Bypasses Three's `readRenderTargetPixels` which silently rejects integer formats.
- `src/backends/babylon/SparkBabylonHost.ts` — `mode: "texture" | "native"` flag. `babylonNative` constructor surface (separate from `babylon`) so texture-mode consumers do not have to import the extra Babylon symbols.
- `tests/fixtures/snapshot-babylon.html` + `tests/e2e/snapshot.spec.ts` — `?mode=native` URL param, native captures + bit-perfect parity assertions across the scenes in `NATIVE_BABYLON_SCENES`.

Exit (achieved, exceeds planned):
- **Babylon parity tolerance drops from 5% to bit-perfect** on every scene in `NATIVE_BABYLON_SCENES` (planned: 1%; actual: 0 / 786432 pixels differ).
- **21 of 22 matrix scenes** ship at bit-perfect parity: `axes`, `grid`, `sphere`, `multi`, `tinted`, `helloWorld`, `multipleSplats`, `debugColor`, `viewer`, `depthOfField`, `nonLod`, `glsl`, `dynamicLighting`, `extSplats`, `animatedWarp`, `splatDissolve`, `splatReveal`, `sogs`, `raycasting`, `interactiveDeform`, `interactiveRipples` (three Tier 7 scenes shipped). The pipeline handles every Spark feature path in the catalogue — accumulator generation, sort, ordering upload, MRT extSplats output, dyno-driven shader chunks, time uniform, custom shader injection, SplatPager streaming, SOGS unpack, multi-instance SplatMesh groups, and per-splat custom dyno modifiers (interactiveRipples lifts the example's shockwave shader as-is; interactiveDeform lifts the dragBounce shader as-is with a different gate mechanism — runtime `if`-conditional plus zero-displacement vec3).
- `envMap` excluded with documented rationale: its rubberduck.glb non-splat Three mesh doesn't bridge to Babylon's native render pass (texture mode hides this behind the Layer composite). Bridging non-splat Three meshes is a separate native-mode feature, out of scope for Phase D.
- Tier 6 (multi-pass / multi-camera) is implementable on Babylon — the architectural unlock is in place. Phase E can start.

### Phase E — Tier 6 multi-pass + Tier 7 interactive (≈ 6–8 commits, 1 session)

After Phase D unblocks multi-camera / multi-pass:
- Add `multipleViewpoints`, `portal`, `newportal`, `splatPortal`, `renderCubeDepth` scenes.
- Add initial-state-only scenes for the interactive examples.

Exit: matrix has ~36 scenes. AGENTS.md "Backend Visual Parity Goal" lists the 4 non-gatable XR/editor exceptions explicitly.

### Phase F — Asset vendoring + CI hardening (in flight, 8/9 assets vendored)

Today's parity matrix loads 9 distinct assets — 8 `.spz` / `.zip` and 1 `.glb`. As of `c78cbca` + the Phase F batch commit, 8 of 9 are vendored under `tests/fixtures/assets/` (and `tests/fixtures/assets/models/`).

The one exclusion is `sutro.zip` (26 MB SOGS package). vite's dev-server static-file pipeline does not return it inside the network-scene `data-ready` timeout budget; the page hangs on fetch with no progress logs. The `sogs` scene falls through `splatUrl`'s CDN fallback. Vendoring sutro.zip needs either a separate static-asset server or git LFS — tracked as Phase F follow-up work.

`scenes.mjs` carries two helpers:
- `splatUrl(filename)`: returns `/tests/fixtures/assets/<filename>` if the filename is in `VENDORED_ASSETS`, otherwise `${ASSET_BASE}/splats/<filename>`.
- `modelUrl(filename)`: same shape for `/models/<filename>`.

Adding a new scene with a new asset is a two-step process: (1) drop the file into `tests/fixtures/assets/` (or `models/`), (2) add the filename to the appropriate Set. No fixture change required.

Total disk footprint: ~57 MB in the working tree. Heavy but acceptable for plain git; if it crosses ~100 MB or starts hurting clone time a follow-up commit can switch the directory to git LFS.

Remaining for Phase F:
- Tighten the Babylon network-scene timeout budget. Current limit (test 540s, goto 240s, data-ready 360s) was sized for cold-cache CDN fetches; with vendored assets every scene completes well inside that envelope. Shrink to roughly the procedural-scene budget once CI has run cleanly on vendored assets a few times.
- Add a `git lfs` migration step if the vendored directory grows past ~100 MB.

Verification (2026-06-09): targeted `pnpm exec playwright test tests/e2e/snapshot.spec.ts -g "depthOfField|dynamicLighting|envMap|sogs"` — 24/24 pass, **0 / 786432 pixels differ** on every three↔aframe and three↔babylon comparison. Capture timings (native Windows, three / aframe / babylon): depthOfField (valley.spz vendored) 11.8s / 6.1s / 27.1s; dynamicLighting (fireplace.spz vendored) 4.1s / 4.1s / 17.4s; envMap (fireplace.spz + rubberduck.glb vendored) 23.0s / 23.0s / 45.9s; sogs (sutro.zip CDN) 25.9s / 22.4s / 96s. Babylon-sogs is the long pole (sutro.zip download + SOGS fflate decode + texture-bridge readPixels overhead, all from a CDN-served zip) but lands well inside the 360s data-ready budget — no need to vendor sutro.zip ahead of the LFS migration.

Full-matrix verification (2026-06-09, WSL+/mnt/c, all 19 scenes): **116/116 pass, 0 / 786432 pixels differ** on every pair. Wall time 1.8h. Capture timing envelope under WSL was meaningfully slower than native Windows (Babylon sogs 4.7m WSL vs 96s native; Babylon envMap 3.9m WSL vs 45.9s native — WSL pays a /mnt/c filesystem-bridge tax on top of the existing texture-bridge readPixels cost). Procedural scene timeout bumped from Playwright's 30s default → 90s in the same change to absorb vite's cold prebundle on the first test (axes/three) without flaking the run. Page-nav timeouts (`page.goto` `timeout`) cut from 240s / 180s → 90s / 60s for Babylon / Three+A-Frame network scenes — page nav is dominated by initial HTML/JS load, not splat decode (that's the data-ready wait). `test.setTimeout` and data-ready budgets kept where they are; per the plan's "shrink once CI has run cleanly a few times" gate, broader cuts wait for additional clean runs.

### Phase G — Real A-Frame fixture via from-source build (≈ 4–6 commits, 1 session)

**Problem.** Today's `aframe-${scene}` parity captures do not actually exercise A-Frame. The fixture (`tests/fixtures/snapshot-aframe.html`) constructs a structural mock of the AFRAME global (`registerSystem`, `registerComponent`, `THREE`) and hands Spark's own `THREE` to `registerSparkAFrame`. The render path that runs is "Spark Three through the A-Frame system/component lifecycle adapter" — bit-perfect against Three by construction. The mock proves:

- `registerSparkAFrame` correctly registers the system + component on the supplied AFRAME-shaped surface.
- The shader-chunk bridge mirrors `THREE.ShaderChunk` onto `AFRAME.THREE.ShaderChunk` (no-op when both share Three).
- `SparkRenderer` mounts onto the scene root via `setObject3D` without identity errors.

It does NOT prove:

- A real `<a-scene>` element drives the lifecycle hooks in the order A-Frame guarantees.
- A-Frame's component-update + DOM-attribute reflow path interacts cleanly with `SparkRenderer`'s `onBeforeRender` hot path.
- The cross-namespace ShaderChunk bridge is even reachable in a real A-Frame app (it is — but the test never exercises it).

The mock exists because A-Frame's npm and CDN builds both bake `super-three@0.173.x` into the bundle and there is no runtime patch to make A-Frame's bundle import Spark's `three@0.180`. Two THREE namespaces in one page break cross-namespace `WebGLRenderTarget` / `DataTexture` traffic; the only paths that work are (a) build A-Frame from source against shared Three, or (b) own the renderer/scene plumbing in the consuming app. The fixture takes path (b). Real consumers who want pixel parity take path (a).

**Phase G goal.** Vendor a custom A-Frame build compiled against `peerDependencies: { three: ">=0.180" }`, add a third A-Frame fixture variant (`snapshot-aframe-real.html`) that loads it, and add e2e captures + parity assertions that exercise a real `<a-scene>`. Keeps the existing mock fixture (which proves the adapter wiring) — the new fixture proves real A-Frame integration.

**Deliverables.**

1. **Vendored A-Frame build under `tests/fixtures/aframe-real/`.** Recipe: clone `aframevr/aframe` at a known-good tag, set `super-three` to alias `three@0.180` via package.json `overrides` (or replace `aframe-master/src/lib/three.js` to re-export from shared `three`), run the rollup build, drop the resulting `aframe.min.js` into the fixtures dir. Commit only the built artefact, not the build tree. Document the recipe in a `tests/fixtures/aframe-real/REBUILD.md` so the next person can refresh the bundle when A-Frame upstream moves.

2. **`tests/fixtures/snapshot-aframe-real.html`** — new fixture that loads the vendored bundle, builds a real `<a-scene>` element, registers Spark via `registerSparkAFrame(window.AFRAME, ...)`, attaches the scene's splat via the existing `<a-entity spark-splat="src: ...">` component for URL scenes or via direct `setObject3D` for procedural scenes (mirroring the existing `aframeMock.registerComponent` shape).

3. **`tests/e2e/snapshot.spec.ts` — new test variant per scene**: `aframe-real-${scene}.png` capture + a `Three vs A-Frame real parity (${scene})` assertion at the same tolerance the mock currently uses (`0.01`). Starts on procedural scenes first; expands once those go green.

4. **`src/backends/README.md` update.** Document the recipe and the gate's structural shape: mock fixture proves adapter wiring, real fixture proves the cross-namespace bridge actually fires inside a real A-Frame scene-render loop.

5. **Rename or annotate `aframe-${scene}` artifacts.** Either rename the existing captures to `aframe-mock-${scene}` so it is visually obvious in the parity mosaic that two A-Frame paths are gated, or keep the name and add a `tmp/README.md` section that names the structural-mock-vs-real distinction. Either is fine; pick whichever produces less churn at the artifact-naming level.

**Risks / open questions.**

- A-Frame's source build may not accept a shared-Three override cleanly. Several A-Frame components (`tracked-controls`, `cursor`, etc.) call methods that may have been removed or renamed between super-three's pinned version and Three `0.180`. Likely need to either restrict the test scenes to ones that do not exercise those components, or carry small patches against the A-Frame source.
- Bundle size — A-Frame's full build is ~1.5 MB. Vendoring it inflates the test-fixture directory. Acceptable on git but watch the LFS threshold.
- If the from-source build proves too brittle to maintain, fall back to documenting "real A-Frame parity is a consumer responsibility" and remove the gate entirely. The mock fixture still serves as the adapter-wiring smoke.

**Exit criteria.** All 19 matrix scenes pass `aframe-real-${scene}` ↔ `three-${scene}` parity within 1% tolerance, AND the mock fixture is renamed / annotated so the structural difference between the two A-Frame gates is unambiguous.

## Realistic effort summary

| Phase | Scenes added | Commits | Sessions |
|---|---:|---:|---:|
| A — URL sweep | +10 | 6–8 | 1 |
| B — Animation (time-locked) | +5 | 5–8 | 1 |
| C — Shader effects | +4 | 4 | 1 |
| D — Native Babylon material | 0 (unblocks scenes) | 5–10 | 1–2 |
| E — Multi-pass + interactive | +10 | 6–8 | 1 |
| F — Asset vendoring + CI hardening | 0 | 3–5 | 1 |
| G — Real A-Frame fixture (from-source build) | 0 (proves existing) | 4–6 | 1 |

Total: ~34 commits, 7–8 sessions to reach the AGENTS.md goal with the documented exceptions. The 4 XR/editor examples land as exception list entries in AGENTS.md.

## Current state (2026-06-09, post Phase A)

**Phase A is complete. 15 scenes in the matrix, all 20 pairwise diffs at 0 / 786432 pixels.** Next is Phase B (animation time-locked scenes).

Phase A commit timeline:
- `985bdeb` helloWorld
- `038eeef` multipleSplats
- `177e3af` debugColor + viewer
- `b21f985` sparkOverrides plumbing + depthOfField
- `e35fa8a` sogs + extSplats
- `4ecff26` nonLod + glsl + dynamicLighting
- `06d7bbe` envMap + postInit hook (Phase A complete)
- `b0266ca` mid-phase plan checkpoint at 7/10

Next-session work continues with Phase B. The fixtures now support both `sparkOverrides` and `postInit`; Phase B's time-uniform plumbing is the next infrastructure piece, then the five Tier 4 animated scenes (`splat-transitions`, `splat-flow`, `particle-animation`, `particle-simulation`, `streaming-lod`) land using the same scenes.mjs + spec patterns established in Phase A.
