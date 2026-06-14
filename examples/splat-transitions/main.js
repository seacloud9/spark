import { GUI } from "lil-gui";
import * as THREE from "three";
import { setupSparkExample } from "../js/spark-engine.js";

// Pre-existing <canvas id="canvas"> from index.html — pass it through
// the engine helper so all three hosts mount onto the same DOM node.
const canvas = document.getElementById("canvas");

const env = await setupSparkExample({
  canvas,
  cameraConfig: {
    fov: 50,
    near: 0.01,
    far: 2000,
    position: [0, 3, 8],
    lookAt: [0, 0, 0],
  },
  clearColor: 0x000000,
});

// GUI
const gui = new GUI();
const params = { Effect: "Spherical" };
const queryParams = new URLSearchParams(window.location.search);
const skipInitialEffect = queryParams.get("testSkipInitialEffect") === "1";
const effectFiles = {
  Spherical: () => import("./effects/spheric.js"),
  Explosion: () => import("./effects/explosion.js"),
  Flow: () => import("./effects/flow.js"),
  Morph: () => import("./effects/morph.js"),
};

let active = null; // { api, group }
let last = 0;
let effectFolder = null; // GUI folder for current effect
let switchCounter = 0; // guards concurrent effect switches
let completedSwitchCount = 0;
let frameCount = 0;
let activeUpdateCount = 0;

async function switchEffect(name) {
  const myToken = ++switchCounter;
  const loading = document.getElementById("loading");
  document.body.dataset.splatTransitionsReady = "loading";
  document.body.dataset.splatTransitionsRequested = name;
  loading.textContent = `Loading ${name}...`;
  loading.style.display = "block";

  // Dispose previous
  if (active) {
    try {
      active.api.dispose?.();
    } catch {}
    if (active.group) env.scene.remove(active.group);
    active = null;
  }

  // Destroy previous GUI folder to avoid accumulation
  if (effectFolder) {
    try {
      effectFolder.destroy();
    } catch {}
    effectFolder = null;
  }

  const loader = effectFiles[name];
  if (!loader) return;
  const preChildren = new Set(env.scene.children);
  const mod = await loader();
  if (myToken !== switchCounter) {
    // A newer switch started; ignore this one
    return;
  }

  // Effects modules receive THREE + the scene-graph triple. Under aframe
  // / babylon these resolve to the same Three triple the Spark host
  // owns, so each effect's mesh-add path lands in the scene that gets
  // composited / rendered without any per-engine branching inside the
  // effect itself.
  const context = {
    THREE,
    scene: env.scene,
    camera: env.camera,
    renderer: env.renderer,
    spark: env.spark,
  };
  const api = await mod.init(context);
  if (myToken !== switchCounter) {
    try {
      api.dispose?.();
    } catch {}
    // Remove any children added during this init
    for (const child of [...env.scene.children]) {
      if (!preChildren.has(child)) env.scene.remove(child);
    }
    return;
  }

  if (api.group) env.add(api.group);
  active = { api, group: api.group };
  completedSwitchCount += 1;
  document.body.dataset.splatTransitionsReady = "true";
  document.body.dataset.splatTransitionsActive = name;
  document.body.dataset.splatTransitionsSwitches = String(completedSwitchCount);
  document.body.dataset.splatTransitionsChildren = String(
    api.group?.children?.length ?? 0,
  );
  document.body.dataset.splatTransitionsHasUpdate = String(
    typeof api.update === "function",
  );

  // Setup a per-effect GUI folder if exposed
  if (api.setupGUI) {
    effectFolder = gui.addFolder(name);
    api.setupGUI(effectFolder);
  }

  loading.style.display = "none";

  // Give focus back to the canvas so keyboard controls work immediately
  try {
    env.renderer.domElement.focus();
  } catch {}
}

gui.add(params, "Effect", Object.keys(effectFiles)).onChange(switchEffect);
window.sparkSplatTransitions = { switchEffect };

// Animation loop — env.run handles the per-host setAnimationLoop /
// runRenderLoop and feeds (time, deltaTime) into the closure.
env.run((timeMs) => {
  frameCount += 1;
  document.body.dataset.splatTransitionsFrames = String(frameCount);
  const t = timeMs * 0.001;
  const dt = t - (last || t);
  last = t;

  if (active?.api?.update) {
    activeUpdateCount += 1;
    document.body.dataset.splatTransitionsUpdates = String(activeUpdateCount);
    active.api.update(dt, t);
  }
});

// Kickoff
if (skipInitialEffect) {
  document.body.dataset.splatTransitionsReady = "idle";
  document.body.dataset.splatTransitionsActive = "";
} else {
  switchEffect(params.Effect);
}
