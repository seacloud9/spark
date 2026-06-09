# Spark multi-backend support

Spark ships first-class support for three render hosts:

| Backend | Status | Entry point | Notes |
|---|---|---|---|
| Three.js | Native | `SparkRenderer`, `SplatMesh` | Spark's home environment. `SparkRenderer` extends `THREE.Mesh`; everything else hangs off the same Three scene. |
| A-Frame | Integration | `aframe.registerSparkAFrame(AFRAME, options?)` | Registers a `spark` system + `spark-splat` URL component on the supplied AFRAME global. |
| BabylonJS | Texture-bridge MVP | `new babylon.SparkBabylonHost({ babylon, scene, width, height, ... })` | Hosts a Spark Three render as a Babylon `Layer` + `RawTexture`. |

All three paths are verified pixel-perfect against each other on the parity
matrix in `tests/e2e/snapshot.spec.ts` — see `tmp/README.md` for the matrix
shape and per-scene results.

## Public API surface

```ts
import {
  // Three host adapter primitives — used by SparkRenderer internally,
  // exposed here so custom Three host code can reuse the same
  // XR-camera and Vision Pro 1x1 baseLayer fallbacks.
  ThreeHostSceneAdapter,
  fillThreeDrawingBufferSize,
  getThreeRenderCamera,

  // Engine-neutral types.
  type SparkBackendKind,
  type SparkBackendCapabilities,
  type SparkFrameContext,
  type SparkHostSceneAdapter,

  // Backend integration namespaces.
  aframe,
  babylon,
} from "@sparkjsdev/spark";
```

## A-Frame

A-Frame's npm and CDN builds both bake their own fork of Three.js
(`super-three@0.173.x`) into the dist bundle. There is no runtime path to
make A-Frame's bundle import Spark's `three@0.180`; two Three namespaces
in one page break cross-namespace `WebGLRenderTarget` / `DataTexture`
traffic during render. **For real visual parity, consumers must build
A-Frame from source against shared Three, or own the renderer/scene
plumbing in their app build and call `registerSparkAFrame` against the
AFRAME-shaped surface they wire up themselves.**

```ts
import * as AFRAME from "aframe";              // or a custom build
import { aframe as sparkAframe } from "@sparkjsdev/spark";

sparkAframe.registerSparkAFrame(AFRAME, {
  // Optional. Passed through to SparkRenderer for the auto-mounted
  // background instance.
  sparkRendererOptions: { enableLod: false },
});

// Then in markup:
//   <a-scene>
//     <a-entity spark-splat="src: https://example/scene.spz"></a-entity>
//   </a-scene>
```

What `registerSparkAFrame` registers:

- A `spark` system: on a-scene `loaded`, attaches a `SparkRenderer` to the
  scene root.
- A `spark-splat` component: reads `src` from the schema and mounts a
  `SplatMesh` per entity via `setObject3D`. `update` re-mounts on `src`
  change; `remove` disposes.

It also bridges Spark's `THREE.ShaderChunk` entries onto `AFRAME.THREE.ShaderChunk`
so SparkRenderer's `#include <splatDefines>` resolves against either Three
namespace. The bridge is a no-op when both share Three (the recommended
production setup).

## BabylonJS

Babylon has its own scene/renderer/material/observable stack and shares
nothing with Three. Spark's `SparkRenderer` cannot be a Babylon
`TransformNode` without a full per-splat material port. `SparkBabylonHost`
is the **MVP texture bridge**: Spark renders internally to an offscreen
Three canvas, the pixels are uploaded to a Babylon `RawTexture`, and
Babylon's render loop composites the texture as a fullscreen background
`Layer`.

```ts
import {
  Color4, Engine, FreeCamera, Layer, RawTexture, Scene, Texture, Vector3,
} from "@babylonjs/core";
import {
  babylon as sparkBabylon,
  SplatMesh,
  constructAxes,
} from "@sparkjsdev/spark";

const canvas = document.querySelector("#renderCanvas");
const engine = new Engine(canvas, false, { preserveDrawingBuffer: true });
const scene = new Scene(engine);
// Babylon refuses to render without a camera, even when all visible
// content comes from a background Layer.
new FreeCamera("placeholder", new Vector3(0, 0, 0), scene);

const host = new sparkBabylon.SparkBabylonHost({
  babylon: { RawTexture, Layer, Engine, Texture, Color4 },
  scene,
  width: 1024,
  height: 768,
});
host.setCamera({ position: [0.9, 0.7, 1.9], lookAt: [0, 0, 0], fov: 45 });

const mesh = new SplatMesh({
  constructSplats: (splats) => {
    constructAxes({ splats, scale: 0.45, axisRadius: 0.025 });
  },
});
await mesh.initialized;
host.add(mesh);

await scene.whenReadyAsync();
engine.runRenderLoop(async () => {
  await host.renderOnce();
  scene.render();
});
```

**What `SparkBabylonHost` buys:**

- A real Babylon-driven canvas containing Spark splats.
- A Spark-shaped API for consumers already in a Babylon app.
- Compatible with the existing Babylon render loop and observables —
  call `host.renderOnce()` from `scene.onBeforeRenderObservable` or
  before each `scene.render()`.

**What it does NOT buy and is deferred:**

- Babylon meshes cannot occlude or depth-sort against Spark splats —
  the splats are background-composited, not scene geometry.
- One CPU `readPixels` per frame. Fine for viewers, not optimal for
  hot real-time multi-MSplat loops.
- No native Babylon picking on splats.

A native Babylon Spark material that draws splats inside the Babylon
render pass closes those gaps. See AGENTS.md "Backend Visual Parity
Goal" and the deep-research-report Babylon parity table for the planned
rollout.

## Three host adapter

`ThreeHostSceneAdapter` and the two free helpers exported alongside it
formalise the points where Spark touches Three's renderer / scene /
camera lifecycle: the XR camera substitution (`getRenderCamera`) and the
Apple Vision Pro 1x1 `baseLayer` fallback (`getDrawingBufferSize`).
`SparkRenderer` itself uses the free helpers in its `onBeforeRender` hot
path; the class is exposed so custom host code (e.g. a bespoke wrapper
around Three running in an unusual environment) can reuse the same
contract.

```ts
import {
  ThreeHostSceneAdapter,
  fillThreeDrawingBufferSize,
  getThreeRenderCamera,
} from "@sparkjsdev/spark";
import * as THREE from "three";

const adapter = new ThreeHostSceneAdapter({
  scene,
  camera: () => activeCamera,   // function form supports late binding
  renderer,
});

adapter.traverseVisible((node) => { /* ... */ });
const cam = adapter.getRenderCamera();          // XR-aware
const { width, height } = adapter.getDrawingBufferSize();
```

## Parity gating

Every scene in `tests/fixtures/scenes.mjs` is rendered through all three
backends by `tests/e2e/snapshot.spec.ts` and compared via `pixelmatch`.
The matrix grows as new scenes land; tolerances are 1% for A-Frame and
5% for Babylon. The Babylon tolerance bakes in headroom for the
texture-bridge CPU round-trip and any sRGB / linear drift, and will
tighten to 1% once the native Babylon material lands.

CI runs the matrix on every PR via `.github/workflows/ci-e2e.yml` and
uploads `tmp/*.png` plus `tmp/parity-summary.json` as a downloadable
artefact. A run that drifts shows up in the JSON `scenes.*.ratio` field
and in the rendered diff overlays in tmp/.
