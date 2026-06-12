<p align="center">

  ![Spark logo](https://github.com/user-attachments/assets/5287631a-083c-4c86-80f6-4dca24aa263f#gh-light-mode-only)
  ![Spark logo](https://github.com/user-attachments/assets/91e8d74b-84a5-4073-bd72-d7228f948dc6#gh-dark-mode-only)

  <h3 align="center">An advanced 3D Gaussian Splatting renderer for THREE.js</h3>
  <div align="center">

  [Features](#features) -
  [Getting Started](#getting-started) -
  <a href="https://sparkjs.dev/">Documentation</a> -
  <a href="https://sparkjs.dev/">FAQ</a>
  </div>
  </p>

   <div align="center">

  [![License](https://img.shields.io/badge/license-MIT-%23d43e4c)](https://github.com/sparkjsdev/spark/blob/main/LICENSE)

  </div>

<p>
  <a href="https://sparkjs.dev" target="_blank">
    <picture>
    </picture>
  </a>

Built by [World Labs](https://www.worldlabs.ai).

## Features

- Integrates with THREE.js rendering pipeline to fuse splat and mesh-based objects
- **Multi-backend rendering** — same Spark scene renders bit-perfect on **Three.js**, **A-Frame**, and **BabylonJS** (see [Multi-backend rendering](#multi-backend-rendering) below)
- Portable: Works across almost all devices, targeting 98%+ WebGL2 support
- Renders fast even on low-powered mobile devices
- Render multiple splat objects together with correct sorting
- Most major splat file formats supported including: [.PLY](https://github.com/graphdeco-inria/gaussian-splatting) (also [compressed](https://blog.playcanvas.com/compressing-gaussian-splats/#compressed-ply-format)), [.SPZ](https://github.com/nianticlabs/spz), [.SPLAT](https://github.com/antimatter15/splat), [.KSPLAT](https://github.com/mkkellogg/GaussianSplats3D), [.SOG](https://developer.playcanvas.com/user-manual/gaussian-splatting/formats/sog/)
- Render multiple viewpoints simultaneously
- Fully dynamic: each splat can be transformed and edited for animation
- Real-time splat color editing, displacement, and skeletal animation
- Shader graph system to dynamically create/edit splats on the GPU

Check out all the [examples](https://sparkjs.dev/examples/) — every ordinary example exposes a `?engine={three,aframe,babylon}` toggle so you can A/B the same scene across all three backends.

## Getting Started

### Copy Code

Copy the following code into an `index.html` file.


```html
<style> body {margin: 0;} </style>
<script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/",
      "@sparkjsdev/spark": "https://sparkjs.dev/releases/spark/2.1.0/spark.module.js"
    }
  }
</script>
<script type="module">
  import * as THREE from "three";
  import { SparkRenderer, SplatMesh } from "@sparkjsdev/spark";

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.01, 1000);
  const renderer = new THREE.WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement)

  const spark = new SparkRenderer({ renderer });
  scene.add(spark);

  const splatURL = "https://sparkjs.dev/assets/splats/butterfly.spz";
  const butterfly = new SplatMesh({ url: splatURL });
  butterfly.quaternion.set(1, 0, 0, 0);
  butterfly.position.set(0, 0, -3);
  scene.add(butterfly);

  renderer.setAnimationLoop(function animate(time) {
    renderer.render(scene, camera);
    butterfly.rotation.y += 0.01;
  });
</script>
```

### CDN

```html
<script type="importmap">
  {
    "imports": {
      "three": "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js",
      "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/",
      "@sparkjsdev/spark": "https://sparkjs.dev/releases/spark/2.1.0/spark.module.js"
     }
  }
</script>
```

### pnpm

```shell
pnpm add @sparkjsdev/spark
```

## Multi-backend rendering

Spark renders **identically across Three.js, A-Frame, and BabylonJS** — a
27-scene visual-parity matrix gates the three engines bit-perfect
(0 / 786432 pixels differ) on every shared scene. The same SplatMesh,
the same shader, the same animation loop; only the host integration
changes.

### Three.js (native host)

The default. `SparkRenderer` extends `THREE.Mesh` and lives in your
scene. See the Getting Started snippet above.

### A-Frame

```js
import { aframe as sparkAframe } from "@sparkjsdev/spark";
sparkAframe.registerSparkAFrame(AFRAME);
```

```html
<a-scene>
  <a-entity spark-splat="src: https://sparkjs.dev/assets/splats/butterfly.spz"></a-entity>
</a-scene>
```

`registerSparkAFrame` registers a `spark` system + `spark-splat` component
pair so SplatMesh and SparkRenderer participate in A-Frame's scene-graph
+ render loop natively.

> **Note:** A-Frame's npm + CDN distributions both bundle their own
> `super-three@0.173.x` fork. For Spark and A-Frame to share a single
> Three.js triple, either build A-Frame from source against your Three
> (recommended for production) or use the structural mock pattern from
> `examples/js/spark-engine.js` for cross-namespace test fixtures. See
> `src/backends/README.md` "A-Frame".

### BabylonJS

Two opt-in modes:

```js
// Texture-bridge MVP (default): Spark renders to an offscreen Three
// canvas; Babylon composites it as a fullscreen Layer.
import { babylon as sparkBabylon } from "@sparkjsdev/spark";
const host = new sparkBabylon.SparkBabylonHost({
  babylon: { RawTexture, Layer, Engine, Texture, Color4 },
  scene: babylonScene,
  width, height,
});
host.add(new SplatMesh({ url: "..." }));
```

```js
// Native material: Splats render as a real Babylon Mesh inside the
// scene's render pass. Babylon meshes depth-sort against splats by
// construction. Bit-perfect against Three on 26/27 matrix scenes.
const host = new sparkBabylon.SparkBabylonHost({ /* ... */, mode: "native" });
```

Working demos: `examples/spark-babylon/` (texture-bridge) and
`examples/spark-babylon-native/` (native material).

## Run Examples locally

Install [Rust](https://www.rust-lang.org/tools/install) if it's not already installed in your machine.

Next, build Spark by running:
```
pnpm install
pnpm run build:wasm
pnpm run build
```
This will first build the Rust Wasm component (`pnpm run build:wasm`), then Spark itself (`pnpm run build`).

The examples fetch assets from a remote URL. This step is optional, but offline development and faster loading times are possible if you download and cache the assets files locally with the following command:
```
pnpm run assets:download
```

Once you've built Spark and optionally downloaded the assets, you can now run the examples:
```
pnpm start
```
This will run a dev server by default at [http://localhost:8080/](http://localhost:8080/). Check the console log output to see if yours is served on a different port.

## Develop and contribute to the project

### Build troubleshooting

First try cleaning all the build files and re-building everything:
```
pnpm run clean
pnpm install
pnpm run build:wasm
pnpm run build
```

There's no versioning system for assets. If you need to re-download a specific file you can delete that asset file individually or download all assets from scratch:

```
 pnpm run assets:clean
 pnpm run assets:download
```

### The `dist/` directory is build output

`dist/` is **not tracked in git** — it's regenerated from `src/`
on every build via `pnpm run build` (production + dev bundles +
`.d.ts` type declarations). It's listed in `.gitignore`, so any
local rebuild will never show up in `git status`, you don't need
the old `git update-index --assume-unchanged` workaround, and
merge conflicts on built bundles are no longer possible.

Publishing rebuilds automatically: the `prepublishOnly` script
runs `pnpm run build:wasm && pnpm run build` before `pnpm
publish`, so a published package always ships fresh artifacts
matching the committed `src/`. Manual `pnpm run build` is still
required for local example development (the examples'
`<script type="importmap">` blocks load
`/dist/spark.module.js` directly).

If a fresh clone shows `dist/` missing, run:

```
pnpm install
pnpm run build:wasm
pnpm run build
```

### Build docs and site

Install [Mkdocs Material](https://squidfunk.github.io/mkdocs-material/)

```
pip install mkdocs-material
```

If you hit an `externally managed environment` error on macOS and if you installed python via `brew` try:

```
brew install mkdocs-material
```

Edit markdown in `/docs` directory

```
pnpm run docs
```

### Build Spark website

Build the static site and docs in a `site` directory.

```
pnpm run site:build
```

You can run any static server in the `site` directory but for convenience you can run

```
pnpm run site:serve
```

### Deploy Spark website

The following command will generate a static site from the `docs` directory and push it to the [repo](https://github.com/sparkjsdev/sparkjsdev.github.io) that hosts the site via `gh-pages`

```
pnpm run site:deploy
```

### Compress splats

To compress a splat to [spz](https://scaniverse.com/spz) run

`pnpm run assets:compress <file or URL to ply>`
