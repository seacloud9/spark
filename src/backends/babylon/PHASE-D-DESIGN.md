# Phase D — Native Babylon Spark material (design notes)

**Status (2026-06-10 post step 7):** Steps 1–7 landed. Native pipeline runs end-to-end. Texture bridge transfers ordering + extSplats from GPU directly via `gl.readPixels` against a private framebuffer (`framebufferTexture2D` for the regular DataTexture, `framebufferTextureLayer` for the WebGLArrayRenderTarget MRT pair). `threeRenderer.initTexture(orderingTexture)` is called between sparks so Spark's `texSubImage2D` path on subsequent sorts finds `__webglTexture` instead of throwing "ordering texture not found". `material.alphaMode = ALPHA_PREMULTIPLIED` paired with the `vec4(rgb*a, a)` fragment output composites the splat colors correctly. Diagnostic verification shipped during the step 7 debug: ordering texelFetch returns expected sort indices, extSplats texelFetch returns expected packed splat data, splat decode produces correct per-axis colors (`vRgba` reaches the fragment as expected). **Splats still do not appear at their correct projected positions** — the final `gl_Position = vec4(ndc.xy * clipCenter.w, clipCenter.zw)` write at the end of `splatVertex.glsl` produces values that get clipped. Remaining bug is in the projection math — most likely the Three `projectionMatrix` is not reaching the shader via Babylon's `setMatrix`, or the `renderToView{Quat,Pos,Basis}` uniforms are not being applied (the diagnostic with a fallback `gl_Position` override showed splat colors at the override position rather than the camera-projected position, confirming the splat decode succeeds but the real `gl_Position` write does not reach a visible clip-space coordinate). Next debug: probe `projectionMatrix` and `viewCenter` via a fragment-color readback to see what values the shader actually sees.

See `MULTI-BACKEND-PARITY-PLAN.md` for the rollout-wide context.

**Today (texture-bridge MVP, `SparkBabylonHost`):** Spark runs on an internal offscreen Three.js `WebGLRenderer`, the final RGBA buffer is read back via `gl.readPixels`, and Babylon composites the buffer as a fullscreen background `Layer`. Works, bit-perfect parity, but:
- Babylon meshes cannot occlude or depth-sort against Spark splats (Layer composites underneath the scene).
- One CPU `readPixels` per frame is a hard floor on per-frame cost.
- No native Babylon picking on splats.
- Multi-pass scenes (portals, multi-viewpoint) need multiple Spark renders per Babylon frame — currently impossible.

**Phase D goal:** replace the Layer composite with a Babylon `ShaderMaterial` that consumes Spark's accumulator output textures directly and renders the splat quad inside the Babylon render pass. The texture-bridge mode stays as a fallback (`mode: "texture" | "native"`).

## Architectural options

### Option A — Two contexts, CPU texture copy per frame (status quo extended)

Same as today, but Babylon uses a `RawTexture` updated with the readback RGBA. Then a `ShaderMaterial` on a `Mesh` (instead of a `Layer`) samples that texture. Babylon depth-sorts the mesh against the rest of the scene.

Pros: incremental, no shared context complexity.
Cons: still one CPU copy per frame. Babylon mesh occlusion would require depth buffer also copied (a second readback per frame).

### Option B — Shared GL context (Three.WebGLRenderer attached to Babylon's `engine._gl`)

Construct a `THREE.WebGLRenderer({ context: engine._gl, canvas: engine.getRenderingCanvas() })`. Spark runs against the same GL context Babylon owns. The sort + accumulator textures live in Babylon's GL — a Babylon `RawTexture` can wrap the underlying `WebGLTexture` handle directly via `engine.wrapWebGLTexture(...)`.

Pros: zero CPU readback. Spark textures are first-class Babylon textures. Real Babylon mesh occlusion against the splat material.
Cons: Three and Babylon both maintain GL state caches and will corrupt each other's. Need careful state save/restore around each engine's render calls — Babylon has `engine.wipeCaches()` and Three.js has `renderer.resetState()`. Compatible in principle, fragile in practice (extensions enabled, texture unit bindings, vertex attribute enable flags). Need a regression harness that exercises both engines' caches.

### Option C — Spark fully ported to Babylon (no Three.js)

A native Spark Babylon backend that does not use Three at all. The accumulator + sort + shader path all run as Babylon code.

Pros: cleanest end state. No shared-state contamination.
Cons: roughly a Babylon backend from scratch — many weeks of work. Out of scope for Phase D; this is "Phase G" if it ever happens.

**Recommended for Phase D:** start with Option A (mesh + RawTexture mirror of the current Layer path), then layer Option B on top once the Phase E multi-pass scenes are landing and the CPU-readback cost becomes a real blocker. Keep `mode: "texture" | "native"` on `SparkBabylonHost` so consumers can pick.

## File layout to land

```
src/backends/babylon/
├── SparkBabylonHost.ts                  (existing — gains mode flag + branch on construction)
├── SparkBabylonMaterial.ts              (NEW — Babylon ShaderMaterial wrapping Spark's
│                                          accumulator-output texture as the splat input)
├── SparkBabylonMesh.ts                  (NEW — Babylon Mesh + instanced quad geometry,
│                                          mirrors SparkRenderer's THREE.Mesh role inside Babylon)
└── PHASE-D-DESIGN.md                    (this file; delete after Phase D ships)
```

## SparkBabylonMaterial — TODO

- Constructor takes `{ scene: Babylon Scene, sparkBuffer: BabylonTexture }`.
- Build a `BABYLON.ShaderMaterial` with name `"sparkSplat"` and the inline vertex/fragment from `src/shaders/splatVertex.glsl` + `src/shaders/splatFragment.glsl` (after the `#include <splatDefines>` shim is ported into a `BABYLON.Effect.IncludesShadersStore` entry, mirroring how `registerSparkAFrame` bridges `THREE.ShaderChunk`).
- Uniforms to wire from SparkRenderer:
  - `time` (float) — already settable via Phase B's `sparkCfg.time` plumbing
  - `renderSize` (vec2)
  - `renderToViewPos` (vec3), `renderToViewQuat` (vec4), `renderToViewBasis` (mat3)
  - `near`, `far`, `maxStdDev`, `minPixelRadius`, `maxPixelRadius`, `minAlpha`, `enable2DGS`, `lodInflate`, `preBlurAmount`, `blurAmount`, `focalDistance`, `apertureAngle`, `falloff`, `clipXY`, `focalAdjustment`, `encodeLinear` — straight pass-through from `spark.uniforms.<name>.value`.
  - `ordering` (sampler2D) — bind from `spark.orderingTexture` after wrapping it as a Babylon `RawTexture`.
  - `extSplats`, `extSplats2` (sampler2D) — bind from `spark.display.getTextures()`.
- The vertex shader references `gl_InstanceID`; Babylon supports instanced rendering via `mesh.thinInstanceCount` and `gl_InstanceID` directly in shader source.
- Disable Babylon's standard lighting / shadow pipeline — `material.disableLighting = true`, `material.alpha = ???` for the back-to-front sorting Spark needs. (Spark uses additive-like Painter's blend; map to Babylon `Engine.ALPHA_COMBINE` or a custom `_alphaMode`.)
- Match Spark's depth handling: Spark writes depth from the shader (`gl_FragDepth`). Babylon supports this via `material.depthFunction = Engine.LEQUAL` plus `material.forceDepthWrite = true` and a fragment that writes `gl_FragDepth`. Validate this against the existing Three depth behaviour.

## SparkBabylonMesh — TODO

- Construct a `BABYLON.Mesh` named `"sparkSplatMesh"` with the same geometry as `SparkRenderer` — an instanced quad (2 triangles, 4 vertices) using `mesh.thinInstanceSetBuffer("matrix", ..., 16)` for the per-instance transform. Set `mesh.thinInstanceCount = spark.activeSplats` each frame.
- Material is the `SparkBabylonMaterial` instance.
- Per-frame hook: register with `scene.onBeforeRenderObservable` to:
  1. Drive Spark's update via `spark.update({ scene: threeScene, camera: threeCamera })` (Spark's internal pipeline, same as today's texture-bridge).
  2. Sync Spark's accumulator output textures into the Babylon-side `RawTexture` wrappers.
  3. Update `mesh.thinInstanceCount` to `spark.activeSplats`.
- Babylon picking: `pickingPredicate` returns false until precise per-splat picking lands (Phase D follow-up; same as the Babylon texture-bridge MVP today).

## SparkBabylonHost — TODO

- Add `mode?: "texture" | "native"` to `SparkBabylonHostOptions` (default `"texture"` to preserve existing behaviour).
- In constructor: if `"native"`, build `SparkBabylonMaterial` + `SparkBabylonMesh` instead of the existing `RawTexture` + `Layer`. The internal Three triple stays — Spark's pipeline keeps running there until Option B lands.
- Existing public API (`setCamera`, `add`, `remove`, `renderOnce`, `dispose`) stays unchanged.
- `renderOnce()` in native mode: drive `spark.update()`, then no `readPixels` is needed — Babylon's render loop picks up the splat mesh as scene geometry.

## Cross-namespace shader chunk handling

A-Frame integration already bridges Spark's `THREE.ShaderChunk` entries onto `AFRAME.THREE.ShaderChunk` so `#include <splatDefines>` resolves. For Babylon there is no `ShaderChunk` — Babylon uses `BABYLON.Effect.IncludesShadersStore`. The native material needs a small adapter that registers each Spark shader chunk under the same name on the Babylon includes store.

`getShaders()` in `src/shaders.ts` is the source of truth (`splatVertex`, `splatFragment`, `splatDefines` plus the compute helpers). Phase D adds a `registerSparkBabylonShaderChunks(BABYLON)` helper that mirrors the Phase A `bridgeShaderChunks` pattern, called once on first `SparkBabylonMaterial` construction.

## Validation / parity once Phase D lands

- Three vs Babylon parity tolerance drops from current 5% to 1% (the texture-bridge's CPU-roundtrip headroom no longer applies).
- All existing 18 matrix scenes must remain bit-perfect against the native material path — they already do against the texture-bridge MVP, so any regression here is a real shader/uniform mismatch.
- A new test in `tests/e2e/snapshot.spec.ts` runs each scene against `mode: "native"` and asserts bit-perfect parity vs `mode: "texture"`.

## Estimated effort

- SparkBabylonMaterial.ts skeleton + shader chunk registration: ~3 hours.
- SparkBabylonMesh.ts + thin-instance geometry + per-frame hook: ~2 hours.
- SparkBabylonHost `mode` flag + branch: ~1 hour.
- Uniform wiring + texture wrapping: ~3 hours (this is where most of the per-uniform debugging lives).
- Depth/blend mode parity with Three: ~2 hours.
- Test wiring + parity verification across the 18 scenes: ~2 hours.

Total: ~13 hours, realistically 1-2 sessions. Option B (shared GL context) is a follow-up worth 1 additional session on top.
