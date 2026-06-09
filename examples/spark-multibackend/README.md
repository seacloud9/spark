# Spark · Multi-backend playground

One HTML page that runs any scene from the parity catalogue through any of the three rendering backends — Three.js, A-Frame (structural mock), or BabylonJS via the texture bridge. Designed for fast visual review, not for production copying.

## Running

```bash
# from WSL
pnpm install
pnpm run dev
```

Then open <http://localhost:5173/examples/spark-multibackend/> and pick from the engine row and scene dropdown in the overlay. The URL updates so you can copy-paste links to specific configurations.

## URL parameters

| Param | Values | Default |
|---|---|---|
| `engine` | `three`, `aframe`, `babylon` | `three` |
| `scene` | any name from the scenes catalogue (axes, grid, sphere, multi, tinted, helloWorld, multipleSplats, debugColor, viewer, depthOfField, sogs, extSplats, nonLod, glsl, dynamicLighting, splatDissolve, splatReveal, animatedWarp, envMap) | `axes` |

Examples:

- <http://localhost:5173/examples/spark-multibackend/> — default Three, axes.
- <http://localhost:5173/examples/spark-multibackend/?engine=babylon&scene=envMap> — chrome rubber duck reflecting the splat fireplace through Babylon.
- <http://localhost:5173/examples/spark-multibackend/?engine=aframe&scene=multipleSplats> — A-Frame integration showing two URL-loaded splats.

Invalid values fall back to the defaults silently.

## Differences from the test fixtures

This page is the dev-server review companion to `tests/fixtures/snapshot-{three,aframe,babylon}.html` — same scenes, same engine plumbing, but:

- Fullscreen canvas instead of fixed 1024x768.
- Continuous render loop (`renderer.setAnimationLoop` / `engine.runRenderLoop`) instead of single-frame capture.
- Reuses `tests/fixtures/scenes.mjs` directly so adding a scene to the catalogue means it shows up here automatically.
- Loads `@sparkjsdev/spark` from `/src/index.ts` via an importmap, so it runs without a `pnpm run build` between source edits.

## A-Frame caveat (read before reporting "A-Frame renders blank")

A-Frame's npm and CDN builds both bake their own fork of Three.js (`super-three@0.173.5`). Running a real `<a-scene>` alongside Spark's `three@0.180` produces blank canvases — cross-namespace `WebGLRenderTarget`/`DataTexture` traffic breaks during render.

The `engine=aframe` mode therefore uses the **same structural AFRAME mock** the parity fixtures use: `registerSparkAFrame(aframeMock, ...)` runs the integration's `init`/`registerSystem` paths against a Spark-Three triple. The rendered output is identical to what a real A-Frame app would produce *if its build shared Spark's Three*. See [src/backends/README.md](../../src/backends/README.md#a-frame) for the production setup recipe.

## Babylon caveat

`engine=babylon` uses the texture-bridge MVP (`SparkBabylonHost`). Spark renders to an internal offscreen Three canvas; the RGBA buffer is uploaded to a Babylon `RawTexture` and composited as a fullscreen background `Layer`. Bit-perfect against the Three baseline but:

- Babylon meshes you add to the scene draw **on top of** the splats, not interleaved by depth.
- One CPU `readPixels` per frame is the cost floor.

The native Babylon material that closes both gaps is sketched in [src/backends/babylon/PHASE-D-DESIGN.md](../../src/backends/babylon/PHASE-D-DESIGN.md).
