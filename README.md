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
- Portable: Works across almost all devices, targeting 98%+ WebGL2 support
- Renders fast even on low-powered mobile devices
- Render multiple splat objects together with correct sorting
- Most major splat file formats supported including: [.PLY](https://github.com/graphdeco-inria/gaussian-splatting) (also [compressed](https://blog.playcanvas.com/compressing-gaussian-splats/#compressed-ply-format)), [.SPZ](https://github.com/nianticlabs/spz), [.SPLAT](https://github.com/antimatter15/splat), [.KSPLAT](https://github.com/mkkellogg/GaussianSplats3D), [.SOG](https://developer.playcanvas.com/user-manual/gaussian-splatting/formats/sog/)
- Render multiple viewpoints simultaneously
- Fully dynamic: each splat can be transformed and edited for animation
- Real-time splat color editing, displacement, and skeletal animation
- Shader graph system to dynamically create/edit splats on the GPU

Check out all the [examples](https://sparkjs.dev/examples/)

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
