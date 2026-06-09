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

### Phase A — Tier 3 URL-loaded sweep (≈ 6–8 commits, 1 session)

Add the 10 Tier 3 scenes one or two per commit. Each commit is a green parity (Three / A-Frame / Babylon all bit-perfect or within tolerance) plus a new row in the mosaic. The pattern is well-established by `helloWorld` and `multipleSplats`; no architectural change needed.

Dependency: stable network access to sparkjs.dev. Defer per-scene vendoring of `.spz` files to Phase F.

Exit: matrix has 17 scenes (5 Tier 1 + 2 Tier 2 + 10 Tier 3). All ratios 0% or within agreed tolerance.

### Phase B — Time-locked animation scenes (≈ 5–8 commits, 1 session)

Extend `scenes.mjs` to support `{ time?: number, fixedFrameCount?: number }` in scene configs. Update all three backend fixtures to write the fixed time into the Spark render call. Add Tier 4 scenes one or two per commit.

Dependency: SparkRenderer's `time` uniform must be settable from the outside (it currently reads `performance.now()`). May need a Spark API change to make this explicit. Tracked as a soft prerequisite.

Exit: matrix has 22 scenes. Animation parity at a fixed timestamp is bit-perfect across backends.

### Phase C — Shader-effect scenes (≈ 4 commits, 1 session)

Same shape as Phase B but with shader wiring lifted from each Tier 5 example into the scene catalogue. May need a `shaderSetup(mesh)` hook in the scene config.

Exit: matrix has 26 scenes.

### Phase D — Native Babylon material backend (≈ 5–10 commits, 1–2 sessions)

The texture-bridge MVP cannot let Babylon meshes occlude or depth-sort against splats, costs one CPU readPixels per frame, and cannot drive multi-pass or multi-camera scenes. The native material draws splats inside Babylon's render pass against a Babylon ShaderMaterial backed by Spark's accumulator output textures.

Deliverables:
- `src/backends/babylon/SparkBabylonMaterial.ts` — Babylon ShaderMaterial that consumes Spark's `extSplats` / `extSplats2` textures and applies the same vertex/fragment shader chunks (`splatVertex`, `splatFragment`, `splatDefines`).
- `src/backends/babylon/SparkBabylonMesh.ts` — Babylon Mesh that hosts the material + instanced geometry, mirrors `SparkRenderer`'s `THREE.Mesh` role.
- An adapter layer that drives the per-frame Spark accumulator update from Babylon's `onBeforeRenderObservable`, then feeds the resulting accumulator textures into the material as uniforms.
- A Babylon-mode flag on `SparkBabylonHost` to switch from texture-bridge to native material (`mode: "texture" | "native"`).

Exit:
- Babylon parity tolerance drops from 5% to 1%.
- Tier 6 (multi-pass / multi-camera) becomes implementable on Babylon.
- The honest scope notes in `src/backends/README.md` and `tmp/README.md` get a "native material" subsection.

### Phase E — Tier 6 multi-pass + Tier 7 interactive (≈ 6–8 commits, 1 session)

After Phase D unblocks multi-camera / multi-pass:
- Add `multipleViewpoints`, `portal`, `newportal`, `splatPortal`, `renderCubeDepth` scenes.
- Add initial-state-only scenes for the interactive examples.

Exit: matrix has ~36 scenes. AGENTS.md "Backend Visual Parity Goal" lists the 4 non-gatable XR/editor exceptions explicitly.

### Phase F — Asset vendoring + CI hardening (≈ 3–5 commits, 1 session)

Today the parity gate depends on sparkjs.dev being reachable from CI. Vendor a small subset of the test-critical `.spz` files into `tests/fixtures/assets/` so the gate is offline-stable; switch network scenes to local URL by default, keep CDN as fallback. Add CI cache for the vendored assets.

Exit: CI runs without network dependency. Per-scene timeouts shrink back toward the procedural-scene budget.

## Realistic effort summary

| Phase | Scenes added | Commits | Sessions |
|---|---:|---:|---:|
| A — URL sweep | +10 | 6–8 | 1 |
| B — Animation (time-locked) | +5 | 5–8 | 1 |
| C — Shader effects | +4 | 4 | 1 |
| D — Native Babylon material | 0 (unblocks scenes) | 5–10 | 1–2 |
| E — Multi-pass + interactive | +10 | 6–8 | 1 |
| F — Asset vendoring + CI hardening | 0 | 3–5 | 1 |

Total: ~30 commits, 6–7 sessions to reach the AGENTS.md goal with the documented exceptions. The 4 XR/editor examples land as exception list entries in AGENTS.md.

## Current Phase A progress

- 2 / 10 Tier 3 scenes done (`helloWorld`, `multipleSplats`).
- 8 / 10 remaining: `debug-color`, `dynamic-lighting`, `envmap`, `glsl`, `nonlod`, `viewer`, `sogs`, `depth-of-field`, plus the partial `procedural-splats` (deferred for `textSplats` flakiness) and `extsplats`.

The pattern in `scenes.mjs` (`buildUrlSplat` helper + `NETWORK_SCENES` set in `tests/e2e/snapshot.spec.ts`) is reusable for each. New scenes need a position / camera / optional modifier wiring; the rest is mechanical.
