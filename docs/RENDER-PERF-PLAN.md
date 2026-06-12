# Render performance plan

**Status:** survey + proposed plan. No optimization commits yet.

This document captures (1) what render hot-paths look like today, (2) where the multi-backend rollout most likely introduced overhead vs the upstream `sparkjsdev/spark` master, (3) the missing perf-test infrastructure, and (4) a phased plan to measure, then fix.

**This is fork-local work.** No optimization derived here will be sent upstream. We may *cherry-pick from* upstream into our fork, but we never push to it. The `upstream` git remote is configured fetch-only (`push = no_push`) as a safety measure.

## 1. Upstream-fork relationship

Configured as of this doc:

```
origin    git@github.com:seacloud9/spark.git  (fetch + push, our fork)
upstream  https://github.com/sparkjsdev/spark.git  (fetch only — push disabled)
```

Divergence as of the doc commit:

- **90 commits** on `seacloud9/main` not on `sparkjsdev/main` — the multi-backend rollout, engine-aware example sweep, parity matrix, test consolidation, dist/ untracking, render-cube-depth interaction smoke. Documented in `CHANGELOG.md` under `## Unreleased`.
- **5 commits** on `sparkjsdev/main` not on `seacloud9/main`. Three are perf-relevant:
  - **`6d24120 make sort32 fast (#327)`** — Rust-side sort optimization in `rust/spark-rs/src/sort.rs` (+119 / -40 lines). Branchless WASM hot-loop changes. **Our fork is missing this.** Highest-priority cherry-pick candidate.
  - **`78bc65e Set dataReady false for textures arrays in SplatPager (#358)`** — splat-pager state fix; may also touch hot path.
  - **`69688c0 Infer encodeLinear from the current render target (#360)`** — refactor.
  - Plus `2e7d9e0` Rust compiler-warning cleanup and `63c6d6a` Rust API rename (`set_max_sh_degree` → `clamp_sh_degree` semantics change). The Rust rename is a build-side breaking change; cherry-picking it also forces a `pnpm run build:wasm` rebuild.

## 2. Known hot paths

### 2.1 Per-frame GPU readback in the Babylon texture bridge

[src/backends/babylon/SparkBabylonTextureBridge.ts](../src/backends/babylon/SparkBabylonTextureBridge.ts):91 already documents this:

> Cost: for typical scenes (≤4M splats, depth=1) the per-frame readback is roughly `2 × width × height × 16` bytes — for a 2048×74 hello-world spz that is ~5 MB / frame, which the JIT path handles inside a Babylon render-loop tick on commodity hardware. For larger scenes (multi-layer, full 2048³ texture) the readback dominates frame time; Phase D Option B (shared GL context via `THREE.WebGLRenderer({ context: engine._gl })`) eliminates this cost and is the planned follow-up once multi-pass Tier 6 scenes need it.

This applies to Babylon `mode: "texture"` (the default). `mode: "native"` already skips the readback — it draws splats directly through Babylon's material pipeline using the same GL context.

**Quick-win opportunity:** even before the shared-GL-context refactor, `readRenderTargetPixels` calls could be batched per-frame and tiled across multiple animation frames for very large scenes (Phase F follow-up territory).

### 2.2 Three-pass scene traversal in `collectThreeSparkScene`

[src/backends/three/ThreeSceneQuery.ts](../src/backends/three/ThreeSceneQuery.ts) walks the Three scene graph **three times** every accumulator update:

```
scene.traverse(...)         // allGenerators
scene.traverseVisible(...)  // globalEdits
scene.traverseVisible(...)  // visibleGenerators
```

This was a structural refactor for the multi-backend rollout (so A-Frame and Babylon backends can implement their own scene-query in the same shape). It preserves the original upstream behavior — which already did three traversals — so it is **not** a fork-introduced regression. But it is the canonical fold-into-one-pass optimization opportunity for any scene with deeply-nested object graphs (engine-aware A-Frame entities, Babylon-Three hybrid scenes).

### 2.3 Splat sort timing (commented out)

[src/SparkRenderer.ts:1100](../src/SparkRenderer.ts#L1100):

```ts
// console.log(`Sorted (${this.minSortIntervalMs}) ${numSplats} splats in ${(performance.now() - now).toFixed(0)} ms`);
```

`SparkRenderer.lastTraverseTime` (1454) and `lastLodRaycastTime` (1518) are kept as instance state but never surfaced through an API or telemetry hook. We have the measurement points but no way to consume them programmatically.

### 2.4 `SparkRenderer.onBeforeRender` invoked manually per frame in Babylon native mode

[src/backends/babylon/SparkBabylonMesh.ts](../src/backends/babylon/SparkBabylonMesh.ts): the native-mode `syncOnce` invokes `spark.onBeforeRender(renderer, scene, camera)` manually because Babylon's render loop doesn't trigger Three's render-path that normally fires it. This is required for correctness — it populates per-frame uniforms like `renderToView{Quat,Pos,Basis}`. It also calls `threeRenderer.initTexture(orderingTexture)` so subsequent sorts find the GL-side handle.

This is necessary work, not waste — but it is **extra per-frame work for native-mode Babylon** that texture-mode does not pay (texture-mode runs Three's render and inherits the onBeforeRender call for free).

### 2.5 LOD traversal + raycast intervals

`SparkRenderer.lastTraverseTime` and `lastLodRaycastTime` are throttled by `minSortIntervalMs` and `lodRaycastIntervalMs` already — good. The risk is that the LOD walk visits the entire scene graph each tick. For multi-instance SplatMesh groups (e.g., `raycasting/` example with 5 robots sharing one PackedSplats), this might be cheaper than the worst case.

### 2.6 Aframe dual-SparkRenderer race (FIXED in `d713d90`)

The `examples/js/spark-engine.js setupAframeBackend` helper was instantiating TWO `SparkRenderer`s in the same scene: one from `setupThreeBackend` (the base) and one from `registerSparkAFrame`'s `init()`. A stale comment claimed the first was removed; it never was. Every aframe-mode example was paying for two `onBeforeRender` + sort + draw passes per frame.

**Measured impact:** the `helloWorld` parity capture wall time dropped from ~2.0m to ~1.1m after `d713d90` shipped — a clean 2× speedup for the aframe path alone. Surfaced by the `raycasting click delivers hits` interaction smoke (which timed out on aframe pre-fix because Playwright's `mouse.click` waited for the doubled-cost frames to settle).

This is exactly the kind of regression that the Phase 1 instrumentation + Phase 2 perf-test budgets in §4 would catch automatically.

### 2.7 `splat-painter` per-pointermove RgbaArray rebuild

[examples/splat-painter/index.html](../examples/splat-painter/index.html) `updateRgba()` runs a full `RgbaArray.render({ ... })` over the entire splat mesh on EVERY `pointermove` while the brush is in drag mode. The render pipeline allocates a fresh `RgbaArray`, runs the generator over every splat, performs a GPU readback, and disposes the previous array — a complete texture rebuild per move event.

In production this is masked because the browser coalesces `pointermove` events to ~60 Hz, and the rebuild on a small splat scene (e.g., `cat.spz`) is fast enough to fit between coalesced moves. But on a large scene (the example default is `greyscale-bedroom.spz` from CDN — a SOGS scene with millions of splats) each rebuild is multiple seconds, and Playwright's synthesized `mouse.move` events do NOT coalesce, so a drag test that dispatches even 4 explicit moves blocks for ~30+ seconds total.

**Mitigation paths** (priority order):

1. **Coalesce ourselves.** Track `mouseMoveScheduled` flag inside the pointermove handler; if a rebuild is already in flight, skip the new one and apply the latest brush stroke on the next animation frame. Pure JS change, no renderer impact, ships independent of the bigger plan.
2. **Incremental rgba update.** Only re-render the splats inside the brush radius rather than the entire mesh. Requires the brush dyno to mark which splat indices changed; the existing brush-mode test already iterates indices, so the signal exists.
3. **Defer to release.** Update brush direction/origin uniforms continuously but ONLY trigger `updateRgba()` on pointerup. Visual feedback during drag would be lost; gated on whether the painted preview is essential UX.

**Surfaced by:** `splat-painter brush paints` interaction smoke needing a 600s test budget (vs 360s for the other Tier 7 smokes). Captured here so the perf plan covers it even before instrumentation lands.

### 2.8 Three-pass scene traversal in `collectThreeSparkScene` (still applies)

See §2.2. The dual-spark fix in 2.6 doesn't change this — `collectThreeSparkScene` still walks the scene three times. With aframe now running 1 SparkRenderer instead of 2, the relative cost of the triple traversal grew (it's now a larger share of the per-frame budget).

## 3. Known fork-local source modifications

`git diff HEAD -- src/SplatAccumulator.ts src/utils.ts` shows two modified files in the working tree:

- [src/SplatAccumulator.ts](../src/SplatAccumulator.ts) — the `collectGenerators` block was extracted into [collectThreeSparkScene](../src/backends/three/ThreeSceneQuery.ts) (Three abstraction layer for the multi-backend rollout). **Same big-O complexity as upstream**, just routed through one indirection. No measurable hot-path regression expected.
- [src/utils.ts](../src/utils.ts) — content unknown until we diff. Likely added the `floatToUint8` helper for the GLES backend.

These are **uncommitted modifications** today. Both are part of the multi-backend infrastructure landed across the recent commits; they don't represent a separate divergence. Step 1 below will let us compare them against upstream master.

## 4. Phased plan

### Phase 0 — DONE (upstream wired + divergence measured)

Captured in §1 above. Total divergence: 90 commits ahead, 5 behind. Three of the five upstream commits touch perf-relevant code; `6d24120 make sort32 fast (#327)` is the standout cherry-pick candidate.

**Recommended Phase 0.5 (≤ 1 hour):** cherry-pick the three perf-relevant upstream commits into a local-only branch `perf/upstream-cherry-pick`, rebuild WASM (`pnpm run build:wasm`), run the full parity matrix to confirm no regression, then merge into `main`. This gives us the sort32-fast win without writing any new code.

```bash
git checkout -b perf/upstream-cherry-pick
git cherry-pick 6d24120 78bc65e 69688c0
pnpm run build:wasm && pnpm run build
pnpm exec playwright test test/e2e/snapshot.spec.ts --reporter=list
# if green:
git checkout main && git merge --ff-only perf/upstream-cherry-pick
```

Skip the cherry-pick of `2e7d9e0` + `63c6d6a` unless we want the Rust API rename (changes the LOD-builder semantics; not a perf change).

### Phase 1 — bottleneck instrumentation — ✅ SHIPPED

Surfaced the existing + new timers through a single `SparkRenderer.perfMetrics` getter so consumers (tests + dev examples) can read them without monkey-patching:

```ts
interface SparkPerfMetrics {
  lastFrameMs: number;            // delta between onBeforeRender frames
  lastSortMs: number;             // driveSort body (worker round-trip + ordering upload)
  lastAccumulateMs: number;       // SplatAccumulator generate() in updateInternal
  lastTraverseMs: number;         // existing this.lastTraverseTime (LOD traverse)
  lastLodRaycastMs: number;       // raycast traverseLodTrees call in driveLod
  lastBabylonReadbackMs: number;  // SparkBabylonTextureBridge syncOrdering+syncExtSplats (0 in native mode)
}
```

All measurements come from `performance.now()`. Producers write the underlying instance fields directly; reading `perfMetrics` allocates one plain object. Zero overhead when not read. Throttled producers (sort, raycast, Babylon readback) leave `0` until they fire, then keep the last-observed value — consumers can detect "not measured yet" by checking `=== 0`.

**Verified 2026-06-12:** typecheck clean, biome clean, axes scene 8/8 backends still 0/786432 px diff against the four-way parity matrix (`three`, `aframe`, `babylon-texture`, `babylon-native`). No behavioral change in the render path — measurement points are wraps, not gates.

**Files touched:**
- [src/SparkRenderer.ts](../src/SparkRenderer.ts): `SparkPerfMetrics` interface export, six new instance fields + `lastFrameStartMs` private, `perfMetrics` getter, four new timing wraps (`onBeforeRender` frame delta, `updateInternal` accumulate, `driveSort` body, `driveLod` raycast — the raycast site already computed `raycastTraverseTime` but discarded it; now mirrored onto `lastLodRaycastMs`).
- [src/backends/babylon/SparkBabylonTextureBridge.ts](../src/backends/babylon/SparkBabylonTextureBridge.ts): wrapped `syncOnce()` body with `performance.now()` delta written to `sparkRenderer.lastBabylonReadbackMs`.
- [src/index.ts](../src/index.ts): re-export `type SparkPerfMetrics` alongside `SparkRenderer` / `SparkRendererOptions`.

### Phase 2 — perf-test infrastructure (≤ 4 hours)

Today there are zero perf tests. Add a new test bucket [test/perf/](../test/perf/) (parallel to `test/e2e/`):

1. **`test/perf/render-fps.spec.ts`** — Playwright-driven page that loads `test/fixtures/snapshot-{three,aframe,babylon}.html?scene=<scene>`, runs `requestAnimationFrame` for N frames (say 600 = 10 s @ 60 fps), records frame intervals + the new `perfMetrics`, asserts a budget:
   - Three: ≤ 16.67 ms p50, ≤ 33 ms p99 on the parity matrix's hot scenes (`helloWorld`, `glsl`, `sogs`, `splatShaderEffects`).
   - A-Frame: same budget (structural mock = same Three triple, should match).
   - Babylon texture: ≤ 18 ms p50 (~10% slack for the per-frame readback).
   - Babylon native: ≤ 16.67 ms p50 (no readback; same budget as Three).

2. **`test/perf/memory-growth.spec.ts`** — capture `performance.measureUserAgentSpecificMemory()` (or `performance.memory.usedJSHeapSize` fallback) at frame 60 and frame 600. Assert delta is bounded — catches splat-buffer / packedData leaks.

3. **`test/perf/regression-baseline.json`** — committed file storing the last-green run's per-scene per-backend p50/p99/memory deltas. CI re-runs and asserts within a tolerance band (say ±15% on time, ±20% on memory). When the band trips, the failure message points at the JSON line that needs updating after human review.

4. **`pnpm run test:perf`** — new script wraps `playwright test test/perf/`. Separate from `test:e2e` because perf runs are slow + flaky on shared CI runners and want their own retry/serialization policy.

### Phase 3 — targeted optimizations (post-instrumentation, scope-dependent)

Each item below should be **measured first** via Phase 2 telemetry before implementation. The size of the win determines whether it's worth the complexity. Listed in priority order from "biggest expected win" to "speculative".

1. **Shared GL context for Babylon texture mode** (eliminates the per-frame readback). Spec'd in the texture-bridge file (line 95) as Phase D Option B. Highest expected win; significant refactor (Babylon Engine + Three WebGLRenderer must share a `WebGL2RenderingContext`). Gate the implementation on a Phase 2 measurement showing readback > 5 ms p50 on the slowest matrix scene.

2. **Fold three-pass scene traversal in `collectThreeSparkScene` into one pass.** Tradeoff: code clarity (separate buckets) vs hot-path passes. Should improve LOD-streaming + deeply-nested aframe scenes. Quick win if measurements show traverse > 1 ms p50.

3. **Reuse scratch buffers across resize boundaries in `SparkBabylonTextureBridge`.** The current code reallocates `scratch: Uint32Array` only when the Spark target grows, which is correct — but the buffer also re-zeroes per `readRenderTargetPixels` call. Verify whether `texSubImage2D` upload needs the buffer pre-zeroed; if not, drop the implicit zero.

4. **Profile `SplatAccumulator.update()` body** — there's a real chance the per-generator gen-pass dispatch in the accumulator dominates frame time on the multi-effect (5-variant shader bundle) scenes. Phase 1 metrics will tell.

5. **Worker reuse + transfer-only ArrayBuffer messaging** for the sort step. The sort already runs in a `SplatWorker`. Confirm via Phase 1 telemetry that the worker-message overhead isn't a significant share of total sort time.

### Phase 4 — CI gating

Wire the new `test:perf` job into `.github/workflows/ci-e2e.yml` (or a sibling `ci-perf.yml`) so regressions are caught at PR time. Requires:
- A reproducible test runner (probably a dedicated GitHub Actions runner — shared runners have too much variance for tight budgets).
- Or: run perf on demand only (PR label-gated) and treat the budgets as soft until a baseline stabilizes.

## 5. Phase 0 deliverable (what we can ship today)

If you green-light Phase 0, the immediate deliverable is:

```bash
git remote add upstream https://github.com/sparkjsdev/spark.git
git fetch upstream
```

Followed by a doc commit that lists every commit on `seacloud9/main` that's not on `sparkjsdev/main`, categorized as: multi-backend rollout, fork-only feature, fork-only fix, fork-only cleanup, divergence. That establishes the surface area we then point perf instrumentation at in Phase 1.

## 6. Out of scope (for now)

- WebGPU port — would invalidate all current GL-specific paths.
- Worker pool for parallel SplatPager decode — already streaming-capable, scope creep.
- Custom shader optimization (dyno dispatcher branches) — already proven bit-perfect across 5 effectType variants, no evidence of slowness today.
- Mobile-specific tuning — Spark already targets 98%+ WebGL2 support per the README; mobile performance work belongs in its own plan once we have desktop baselines.
