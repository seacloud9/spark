# Claude handoff: Spark multi-backend rollout

Date: 2026-06-11 (post engine-aware rollout push).

## Headline numbers

- **Parity matrix:** 27 scenes. Bit-perfect 0/786432 px diff on every Three vs A-Frame vs Babylon-texture pair. Babylon-native bit-perfect on **26/27** (envMap remains the documented native exclusion).
- **Engine-aware live coverage:** **31/41 examples (76%)**, up from 21/41 (51%) at the start of the 2026-06-11 session.
- **Tier 4 (time-driven animation):** CLOSED OUT.
- **Tier 7 (interactive):** CLOSED OUT.
- **Tier 5 shader-driven:** 4/5 done (lofi remains).
- **Tier 6 multi-pass / multi-camera:** 1/5 done (`multiple-viewpoints` shipped — validates texture-bridge survives Three-side secondary-SparkRenderer multi-pass). Four portal variants follow the same template.

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

## Helper change worth knowing

`examples/js/spark-engine.js` gained `env.canvas` (in commit `d571cb2`). It is the VISIBLE top-of-DOM canvas:
- Three / A-Frame: identical to `env.renderer.domElement`.
- Babylon: the BabylonJS engine's canvas. `env.renderer` is the offscreen Three renderer that the texture-bridge reads from — pointer events DO NOT REACH IT.

**Always bind input controls to `env.canvas`:** PointerControls, SparkControls, OrbitControls, raycast click handlers, drag/drop targets. Every Tier 7 port in this session uses this pattern.

## What's left (10 examples)

### 4 Tier 6 multi-pass — next-session primary target

`multiple-viewpoints` shipped in `c571ad1` and **validated the texture-bridge hypothesis**: a secondary `SparkRenderer` with `target: { width, height, doubleBuffer: true }` runs the multi-pass entirely on the Three side, and Babylon's texture-bridge composites the final Three canvas as a Layer — so the offscreen render stays valid WITHOUT needing Babylon multi-camera support. The four remaining variants follow the same template.

Listed in order of estimated portability:

1. **`portal`**, **`newportal`**, **`splat-portal`** — Same secondary-SparkRenderer + RenderTarget shape as multiple-viewpoints. Apply the same template (commit `c571ad1` is the canonical reference).
2. **`render-cube-depth`** — Offline SparkRenderer for depth cube. Verify the cube target survives the bridge (the multiple-viewpoints test was a 2D `target`; a cube target may need different handling).

### 1 Tier 5 — `lofi`

Has SparkXr (WebXR), audio carousel, world transitions, and SparkRenderer XR animation loop with `xrFrame`. Needs XR-gated init (skip SparkXr instantiation on babylon/aframe modes). Audio playback and worlds cache are backend-agnostic and stay intact. ~890 lines so non-trivial but mechanical.

### Do NOT port

- **`spark-babylon`**, **`spark-babylon-native`** — Babylon host showcases by design. The whole point is they demonstrate the Babylon host directly; engine-switching them would defeat the purpose.
- **`basic-xr`**, **`webxr`**, **`editor`** — Documented Tier 8 non-gatable exceptions in AGENTS.md.

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
2. Add the example name to `ENGINE_AWARE_EXAMPLES` in `tests/e2e/multibackend-smoke.spec.ts`.
3. Run smoke before commit:
   ```bash
   wsl -d Ubuntu -- bash -ic 'cd /mnt/c/Users/brend/exp/spark && nvm use 20 && \
     pnpm exec playwright test tests/e2e/multibackend-smoke.spec.ts --grep "<name>"'
   ```
   `bash -ic` (interactive) loads nvm — `bash -lc` does NOT.
4. Commit with rich body covering why / what / verification (see `eb54747` for the form). Write the body to `c:/tmp/commit-msg.txt`, then `git commit -F c:/tmp/commit-msg.txt` — bash heredocs eat backticks.

## Files to read first next session

1. `MULTI-BACKEND-PARITY-PLAN.md` — Live parity-matrix state (memory files lag this).
2. `tests/fixtures/scenes.mjs` — The 27 scene definitions.
3. `tests/e2e/snapshot.spec.ts` — `SCENES` / `NETWORK_SCENES` / `NATIVE_BABYLON_SCENES` configuration.
4. `tests/e2e/multibackend-smoke.spec.ts` — `ENGINE_AWARE_EXAMPLES` array.
5. `examples/js/spark-engine.js` — The helper. `env.canvas` and the three `setup*Backend` functions.

## Memory pointers

- `project_parity_phased_plan.md` — Phase A–G phased state; engine-aware coverage list now lives here.
- `feedback_update_examples_index.md` — Every engine-aware port must mark the row engine-aware in `examples/index.html` + add to `ENGINE_AWARE_EXAMPLES` in the smoke spec.
- `feedback_use_wsl_for_playwright.md` — WSL/bash-ic for all Playwright invocations.
- `feedback_bash_heredoc_commit_messages.md` — Write commit messages to `c:/tmp/commit-msg.txt` then `git commit -F`.
