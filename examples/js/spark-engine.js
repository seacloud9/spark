// Engine-aware setup helper for the Spark examples.
//
// Usage in an example (see examples/hello-world/index.html for the live
// reference):
//
//   import { setupSparkExample } from "../js/spark-engine.js";
//
//   const env = await setupSparkExample({
//     cameraConfig: { fov: 60, position: [0, 0, 0], lookAt: [0, 0, -1] },
//     // optional: clearColor, sparkOptions, time
//   });
//
//   const butterfly = new SplatMesh({ url: ... });
//   butterfly.position.set(0, 0, -3);
//   env.add(butterfly);
//
//   env.run((time, deltaTime) => {
//     butterfly.rotation.y += deltaTime / 2500;
//   });
//
// The example branches on the ?engine= URL parameter:
//   - three   (default): plain Three.js with SparkRenderer.
//   - aframe : a structural AFRAME mock that exercises registerSparkAFrame
//              against the same Three triple.  See src/backends/README.md
//              for why CDN/npm A-Frame cannot share Three with Spark.
//   - babylon: SparkBabylonHost — internal Three renders splats; Babylon
//              composites the result as a fullscreen Layer.
//
// All three return the same shape so the example body stays engine-
// agnostic.

import * as THREE from "three";
import {
  SparkRenderer,
  aframe as sparkAframe,
  babylon as sparkBabylon,
} from "@sparkjsdev/spark";

export function getEngine() {
  const params = new URLSearchParams(window.location.search);
  const v = params.get("engine");
  if (v === "aframe" || v === "babylon") return v;
  return "three";
}

function buildCamera(cfg, aspect) {
  const camera = new THREE.PerspectiveCamera(
    cfg?.fov ?? 60,
    aspect,
    cfg?.near ?? 0.1,
    cfg?.far ?? 1000,
  );
  if (cfg?.position) {
    camera.position.set(cfg.position[0], cfg.position[1], cfg.position[2]);
  }
  if (cfg?.lookAt) {
    camera.lookAt(cfg.lookAt[0], cfg.lookAt[1], cfg.lookAt[2]);
  }
  return camera;
}

function attachCanvas(canvas) {
  if (canvas && canvas.parentNode) return canvas;
  const c = canvas ?? document.createElement("canvas");
  c.style.display = "block";
  c.style.width = "100vw";
  c.style.height = "100vh";
  document.body.appendChild(c);
  return c;
}

async function setupThreeBackend({
  canvas,
  cameraConfig,
  sparkOptions,
  clearColor,
  time,
}) {
  const c = attachCanvas(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas: c, antialias: false });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight, false);
  if (clearColor != null) renderer.setClearColor(clearColor, 1);

  const scene = new THREE.Scene();
  const camera = buildCamera(
    cameraConfig,
    window.innerWidth / window.innerHeight,
  );

  const spark = new SparkRenderer({
    renderer,
    ...(sparkOptions ?? {}),
  });
  scene.add(spark);
  if (typeof time === "number") spark.time = time;

  window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight, false);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
  });

  return {
    engine: "three",
    scene,
    camera,
    renderer,
    spark,
    canvas: c,
    add: (node) => scene.add(node),
    run: (tick) => {
      let lastTime = 0;
      renderer.setAnimationLoop((t, xrFrame) => {
        const dt = t - (lastTime || t);
        lastTime = t;
        tick?.(t, dt, xrFrame);
        renderer.render(scene, camera);
      });
    },
    runManual: (tick) => {
      let lastTime = 0;
      renderer.setAnimationLoop((t, xrFrame) => {
        const dt = t - (lastTime || t);
        lastTime = t;
        tick?.(t, dt, xrFrame);
      });
    },
  };
}

async function setupAframeBackend(opts) {
  // A-Frame's bundled super-three collides with Spark's three; the
  // production-correct setup uses a structural AFRAME mock so
  // registerSparkAFrame runs against the same Three triple. See
  // src/backends/README.md "A-Frame" for the recipe.
  const base = await setupThreeBackend(opts);

  // setupThreeBackend already mounted a SparkRenderer in the scene.
  // registerSparkAFrame's spark-system init() will mount a SECOND one.
  // Remove the first so the scene only carries one SparkRenderer —
  // otherwise both run per-frame onBeforeRender / sort / draw and
  // double the GPU work (measurable on raycasting / interactive scenes
  // where the doubled cost slows Playwright's mouse.click past its
  // settle timeout).
  if (base.spark && base.spark.parent) {
    base.spark.parent.remove(base.spark);
  }

  const systems = {};
  const sceneEl = {
    renderer: base.renderer,
    object3D: base.scene,
    camera: base.camera,
    hasLoaded: true,
    systems,
    addEventListener(_e, h) {
      if (typeof h === "function") queueMicrotask(h);
    },
  };
  const aframeMock = {
    THREE,
    registerSystem(name, def) {
      const inst = Object.create(def);
      inst.el = sceneEl;
      if (typeof inst.init === "function") inst.init();
      systems[name] = inst;
    },
    registerComponent() {},
  };
  sparkAframe.registerSparkAFrame(aframeMock, {
    sparkRendererOptions: { ...(opts.sparkOptions ?? {}) },
  });

  // Hand the example the SparkRenderer the aframe system mounted, so
  // env.spark points at the live one (the original was removed above).
  base.spark = systems.spark?.spark ?? base.spark;
  base.engine = "aframe";
  return base;
}

async function setupBabylonBackend({
  canvas,
  cameraConfig,
  sparkOptions,
  clearColor,
  time,
}) {
  const c = attachCanvas(canvas);
  await Promise.all([
    import("@babylonjs/core/Shaders/layer.vertex.js"),
    import("@babylonjs/core/Shaders/layer.fragment.js"),
  ]);
  const { Color4, Engine, FreeCamera, Layer, RawTexture, Scene, Texture, Vector3 } =
    await import("@babylonjs/core");

  const engine = new Engine(c, false, {
    preserveDrawingBuffer: true,
    stencil: false,
  });
  engine.setSize(window.innerWidth, window.innerHeight);

  const babylonScene = new Scene(engine);
  babylonScene.clearColor = new Color4(0, 0, 0, 1);
  // Babylon refuses to render without an active camera even if the only
  // visible content comes from a background Layer.
  new FreeCamera("placeholder", new Vector3(0, 0, 0), babylonScene);

  const host = new sparkBabylon.SparkBabylonHost({
    babylon: { RawTexture, Layer, Engine, Texture, Color4 },
    scene: babylonScene,
    width: window.innerWidth,
    height: window.innerHeight,
    sparkRendererOptions: { ...(sparkOptions ?? {}) },
    clearColor: clearColor ?? 0x000000,
  });
  host.setCamera({
    position: cameraConfig?.position ?? [0, 0, 0],
    lookAt: cameraConfig?.lookAt ?? [0, 0, -1],
    fov: cameraConfig?.fov ?? 60,
    near: cameraConfig?.near ?? 0.1,
    far: cameraConfig?.far ?? 1000,
  });
  if (typeof time === "number") host.sparkRenderer.time = time;

  // Resize: Babylon's engine handles canvas dimensions; the host's
  // texture-bridge dimensions are fixed at construction. A future commit
  // can add host.setSize.
  window.addEventListener("resize", () => {
    engine.resize();
  });

  await babylonScene.whenReadyAsync();

  function presentCurrentThreeFrame() {
    if (host.mode !== "texture") return host.renderOnce();

    const gl = host.threeRenderer.getContext();
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.readPixels(
      0,
      0,
      host.width,
      host.height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      host.pixels,
    );
    host.texture.update(host.pixels);
  }

  return {
    engine: "babylon",
    scene: host.threeScene,
    camera: host.threeCamera,
    renderer: host.threeRenderer,
    spark: host.sparkRenderer,
    canvas: c,
    babylonScene,
    babylonEngine: engine,
    host,
    add: (node) => host.add(node),
    run: (tick) => {
      let lastTime = 0;
      engine.runRenderLoop(async () => {
        const t = performance.now();
        const dt = t - (lastTime || t);
        lastTime = t;
        tick?.(t, dt);
        await host.renderOnce();
        babylonScene.render();
      });
    },
    runManual: (tick) => {
      let lastTime = 0;
      engine.runRenderLoop(async () => {
        const t = performance.now();
        const dt = t - (lastTime || t);
        lastTime = t;
        await tick?.(t, dt);
        await presentCurrentThreeFrame();
        babylonScene.render();
      });
    },
  };
}

export async function setupSparkExample(opts = {}) {
  const engine = getEngine();
  let env;
  if (engine === "babylon") env = await setupBabylonBackend(opts);
  else if (engine === "aframe") env = await setupAframeBackend(opts);
  else env = await setupThreeBackend(opts);

  // Persistent bottom-edge engine footer so every example exposes the
  // three engine URLs + a back-to-examples link without each example
  // wiring it manually.
  mountEngineSwitcher(engine);

  return env;
}

function getExampleName() {
  // examples/<name>/[index.html] → <name>; fall back to "example" on
  // unfamiliar paths (root, custom layouts).
  const parts = window.location.pathname.split("/").filter(Boolean);
  const idx = parts.lastIndexOf("examples");
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  if (parts.length) return parts[parts.length - 1].replace(/\.html?$/i, "");
  return "example";
}

const ENGINE_TITLES = {
  three:
    "Three.js — Spark's native render host. SparkRenderer extends THREE.Mesh.",
  aframe:
    "A-Frame integration adapter (registerSparkAFrame). A-Frame's npm/CDN distributions bake their own Three.js fork (super-three@0.173) that cannot share Three with Spark, so this mode runs the integration's registerSystem / spark-splat code paths against a structural AFRAME mock backed by Spark's Three. Identical to what a real <a-scene> would render if its build shared Three with Spark.",
  babylon:
    "BabylonJS texture-bridge MVP (SparkBabylonHost). Spark renders to an internal offscreen Three canvas; Babylon composites the result as a fullscreen Layer. Babylon meshes draw on top of splats today; the native material backend is on the way (see PHASE-D-DESIGN.md).",
};

const ENGINE_LABELS = {
  three: "three",
  aframe: "aframe*",
  babylon: "babylon",
};

function mountEngineSwitcher(active) {
  if (document.getElementById("spark-engine-switcher")) return;
  const footer = document.createElement("footer");
  footer.id = "spark-engine-switcher";
  footer.style.cssText = [
    "position:fixed",
    "left:0",
    "right:0",
    "bottom:0",
    "z-index:9999",
    "background:rgba(0,0,0,0.72)",
    "color:#fff",
    "padding:8px 14px",
    "font-family:system-ui,sans-serif",
    "font-size:12px",
    "display:flex",
    "gap:14px",
    "align-items:center",
    "flex-wrap:wrap",
    "border-top:1px solid rgba(255,255,255,0.08)",
    "backdrop-filter:blur(4px)",
  ].join(";");

  const back = document.createElement("a");
  back.href = "../";
  back.textContent = "← examples";
  back.style.cssText =
    "color:#9fd0ff;text-decoration:none;font-weight:500";
  footer.appendChild(back);

  const name = document.createElement("span");
  name.textContent = getExampleName();
  name.style.cssText = "opacity:0.7";
  footer.appendChild(name);

  const sep = document.createElement("span");
  sep.style.cssText = "opacity:0.35;margin-left:auto";
  sep.textContent = "engine:";
  footer.appendChild(sep);

  for (const e of ["three", "aframe", "babylon"]) {
    const a = document.createElement("a");
    const params = new URLSearchParams(window.location.search);
    if (e === "three") params.delete("engine");
    else params.set("engine", e);
    const qs = params.toString();
    a.href = qs ? `?${qs}` : window.location.pathname;
    a.textContent = ENGINE_LABELS[e];
    a.title = ENGINE_TITLES[e];
    a.className = `spark-engine-link spark-engine-link-${e}`;
    a.style.cssText = [
      "color:" + (e === active ? "#fff" : "#9fd0ff"),
      "text-decoration:" + (e === active ? "underline" : "none"),
      "font-weight:" + (e === active ? "600" : "400"),
      "padding:2px 8px",
      "border-radius:4px",
      "background:" + (e === active ? "rgba(255,255,255,0.08)" : "transparent"),
    ].join(";");
    footer.appendChild(a);
  }

  // Hint for the active engine — clarifies the integration story without
  // burying it inside a hover tooltip on a small chip.
  const hint = document.createElement("span");
  hint.style.cssText = "opacity:0.7;font-style:italic";
  const hints = {
    three: "native host",
    aframe:
      "registerSparkAFrame · structural mock (real A-Frame bundles a different Three)",
    babylon: "SparkBabylonHost · texture bridge",
  };
  hint.textContent = "— " + hints[active];
  footer.appendChild(hint);

  document.body.appendChild(footer);
}
