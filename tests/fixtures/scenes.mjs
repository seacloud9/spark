// Shared scene catalogue for the parity snapshot fixtures.
// Three/A-Frame/Babylon fixtures all import this so a "scene" is defined
// once and rendered identically across the three backends.
//
// Each scene exposes:
//   - camera   : { position, lookAt, fov, near, far }
//   - clearColor: integer RGB used for the renderer's clear colour
//   - build()  : async function returning { root, splatCount }, where
//                root is a THREE.Object3D ready to add to scene and
//                splatCount is the total splat count across all
//                SplatMesh instances in the subtree.

import * as THREE from "three";
import {
  SplatEdit,
  SplatEditRgbaBlendMode,
  SplatEditSdf,
  SplatEditSdfType,
  SplatMesh,
  constructAxes,
  constructGrid,
  constructSpherePoints,
  dyno,
  modifiers,
} from "/src/index.ts";

const ASSET_BASE = "https://sparkjs.dev/assets";

// Locally-vendored test fixtures, served by the dev server from
// tests/fixtures/assets/. Scenes that target these names get the
// repo-local file instead of the sparkjs.dev CDN, which removes
// network latency and CDN flakiness from the parity gate for the
// most-used assets. Add files here as Phase F lands them.
const VENDORED_ASSETS = new Set([
  "butterfly.spz",
  "butterfly-ai.spz",
  "cat.spz",
  "fly.spz",
  "distant-igloo.spz",
  "fireplace.spz",
  "valley.spz",
  "robot-head.spz",
  "penguin.spz",
  // sutro.zip is 26 MB and the vite dev server hangs serving it for
  // long enough that the SOGS decode never completes inside the
  // network-scene timeout budget. Vendor it via a separate static
  // path in a follow-up commit (likely git LFS once the vendored
  // directory grows past ~100 MB).
]);

const VENDORED_MODELS = new Set(["rubberduck.glb"]);

function splatUrl(filename) {
  if (VENDORED_ASSETS.has(filename)) {
    return `/tests/fixtures/assets/${filename}`;
  }
  return `${ASSET_BASE}/splats/${filename}`;
}

function modelUrl(filename) {
  if (VENDORED_MODELS.has(filename)) {
    return `/tests/fixtures/assets/models/${filename}`;
  }
  return `${ASSET_BASE}/models/${filename}`;
}

async function buildUrlSplat({ url, position, quaternion, scale }) {
  const mesh = new SplatMesh({ url });
  if (position) {
    mesh.position.set(position[0], position[1], position[2]);
  }
  if (quaternion) {
    mesh.quaternion.set(
      quaternion[0],
      quaternion[1],
      quaternion[2],
      quaternion[3],
    );
  }
  if (scale !== undefined) {
    mesh.scale.setScalar(scale);
  }
  await mesh.initialized;
  return { root: mesh, splatCount: mesh.numSplats };
}

async function buildEnvMap() {
  // Mirrors the static initial-frame portion of examples/envmap:
  // fireplace.spz loaded twice (mirrored across the duck), rubberduck.glb
  // loaded from sparkjs.dev/assets/models/, and an environment map
  // rendered from the splat scene via SparkRenderer.renderEnvMap and
  // applied to the duck's materials with metalness=1, roughness=0.02.
  // The example animates the duck's rotation; we capture at rotation 0.
  // First scene in the matrix to exercise renderEnvMap + GLTFLoader
  // through the parity gate.
  const { GLTFLoader } = await import(
    "/node_modules/three/examples/jsm/loaders/GLTFLoader.js"
  );

  const url = `${splatUrl("fireplace.spz")}`;
  const background = new SplatMesh({ url });
  background.quaternion.set(1, 0, 0, 0);
  background.position.set(0.5, 0, -1);
  background.scale.setScalar(0.5);

  const background2 = new SplatMesh({ url });
  background2.quaternion.set(1, 0, 0, 0);
  background2.rotation.y = Math.PI;
  background2.position.set(-0.5, 0, 0);
  background2.scale.setScalar(0.5);

  await Promise.all([background.initialized, background2.initialized]);

  const gltf = await new GLTFLoader().loadAsync(
    `${modelUrl("rubberduck.glb")}`,
  );
  const duck = gltf.scene;
  duck.position.set(0, 0.45, -0.4);

  const group = new THREE.Group();
  group.add(background);
  group.add(background2);
  group.add(duck);

  return {
    root: group,
    splatCount: background.numSplats + background2.numSplats,
    async postInit({ scene, renderer }) {
      // Render a per-scene environment map from the splat backgrounds
      // (hiding the duck so it does not occlude itself) and apply it
      // to the duck's materials for metallic reflections.
      const { SparkRenderer } = await import("/src/index.ts");
      const offline = new SparkRenderer({ renderer });
      const envMap = await offline.renderEnvMap({
        scene,
        worldCenter: duck.position,
        hideObjects: [duck],
      });
      for (const child of duck.children) {
        if (child.material) {
          child.material.envMap = envMap;
          child.material.metalness = 1.0;
          child.material.roughness = 0.02;
        }
      }
    },
  };
}

async function buildDynamicLighting() {
  // Mirrors the static initial-frame portion of examples/dynamic-lighting:
  // fireplace.spz with three SDF-based light overlays composed through
  // SplatEdit + SplatEditSdf at three different blend modes. The
  // example animates the camera and flickers the light colours over
  // time; we capture the initial frame (camera at z=-2.5, base colours
  // before any sin() flicker). Tests SplatEdit + SplatEditSdf parity
  // across backends.
  const fireplace = new SplatMesh({
    url: `${splatUrl("fireplace.spz")}`,
  });
  fireplace.quaternion.set(1, 0, 0, 0);
  fireplace.position.set(0, -1, -10);

  const emberLayer = new SplatEdit({
    rgbaBlendMode: SplatEditRgbaBlendMode.ADD_RGBA,
    sdfSmooth: 0.1,
    softEdge: 0.8,
  });

  const lightingLayer = new SplatEdit({
    rgbaBlendMode: SplatEditRgbaBlendMode.ADD_RGBA,
    sdfSmooth: 0.1,
    softEdge: 1.4,
  });

  const ambientLayer = new SplatEdit({
    rgbaBlendMode: SplatEditRgbaBlendMode.DARKEN,
    sdfSmooth: 0.1,
    softEdge: 0.05,
  });

  function makeLight(layer, position, color, radius, opacity) {
    const light = new SplatEditSdf({
      type: SplatEditSdfType.SPHERE,
      color,
      radius,
      opacity,
    });
    light.position.copy(position);
    layer.add(light);
  }

  // Embers at the base of the fire.
  makeLight(
    emberLayer,
    new THREE.Vector3(0.5, -1.0, -10.5),
    new THREE.Color(1, 0.6, 0.4),
    0.75,
    1,
  );
  // Main fire light.
  makeLight(
    lightingLayer,
    new THREE.Vector3(0.3, -1.1, -10.6),
    new THREE.Color(1, 0.95, 0.2),
    1.6,
    0,
  );
  // Ambient room light.
  makeLight(
    ambientLayer,
    new THREE.Vector3(0, 1, -11),
    new THREE.Color(1, 0.8, 0.6),
    6,
    0.8,
  );

  await fireplace.initialized;

  const group = new THREE.Group();
  group.add(fireplace);
  group.add(emberLayer);
  group.add(lightingLayer);
  group.add(ambientLayer);
  return { root: group, splatCount: fireplace.numSplats };
}

async function buildSplatReveal() {
  // Inverse of splat-dissolve-effects: a custom dyno objectModifier on
  // butterfly.spz that fades each splat in over time from opacity 0
  // toward its native opacity, where every splat's reveal start time
  // is hash-driven so the wings reveal in a soft cloudy pattern. At a
  // fixed time = 1.2 the butterfly is mid-reveal — perimeter splats
  // visible, inner splats still faded. Demonstrates the Tier 5 reveal
  // pattern without porting splat-reveal-effects' 5-effect branching.
  const mesh = new SplatMesh({ url: `${splatUrl("butterfly.spz")}` });
  mesh.quaternion.set(1, 0, 0, 0);
  mesh.position.set(0, 0, -1.5);

  const animateT = dyno.dynoFloat(1.2);

  mesh.objectModifier = dyno.dynoBlock(
    { gsplat: dyno.Gsplat },
    { gsplat: dyno.Gsplat },
    ({ gsplat }) => {
      const d = new dyno.Dyno({
        inTypes: { gsplat: dyno.Gsplat, t: "float" },
        outTypes: { gsplat: dyno.Gsplat },
        globals: () => [
          dyno.unindent(`
            vec3 hash(vec3 p) {
              return fract(sin(p*314.159)*43758.5453);
            }
          `),
        ],
        statements: ({ inputs, outputs }) =>
          dyno.unindentLines(`
            ${outputs.gsplat} = ${inputs.gsplat};
            vec3 h = hash(${inputs.gsplat}.center);
            float startTime = h.x * 2.0;
            float fadeIn = clamp(${inputs.t} - startTime, 0.0, 1.0);
            ${outputs.gsplat}.rgba.w *= fadeIn;
          `),
      });
      const next = d.apply({ gsplat, t: animateT }).gsplat;
      return { gsplat: next };
    },
  );
  mesh.updateGenerator();

  await mesh.initialized;
  return { root: mesh, splatCount: mesh.numSplats };
}

async function buildSplatDissolve() {
  // Mirrors examples/splat-dissolve-effects: fly.spz with a dyno
  // objectModifier that hash-drives a per-splat dissolve over time —
  // each splat has its own start time, oscillates white, drifts along a
  // hash-derived direction, fades out. The example pumps animateT from
  // a setAnimationLoop wall clock; the parity scene pins animateT to
  // a deterministic 5.0 so the captured frame is reproducible. Mid-
  // dissolve frame shows the partial drift / fade effect.
  const fly = new SplatMesh({ url: `${splatUrl("fly.spz")}` });
  fly.quaternion.set(1, 0, 0, 0);
  fly.position.set(0, 0, -0.5);

  const animateT = dyno.dynoFloat(5.0);

  fly.objectModifier = dyno.dynoBlock(
    { gsplat: dyno.Gsplat },
    { gsplat: dyno.Gsplat },
    ({ gsplat }) => {
      const d = new dyno.Dyno({
        inTypes: { gsplat: dyno.Gsplat, t: "float" },
        outTypes: { gsplat: dyno.Gsplat },
        globals: () => [
          dyno.unindent(`
            vec3 hash(vec3 p) {
              return fract(sin(p*123.456)*123.456);
            }
          `),
        ],
        statements: ({ inputs, outputs }) =>
          dyno.unindentLines(`
            ${outputs.gsplat} = ${inputs.gsplat};
            vec3 localPos = ${inputs.gsplat}.center;
            vec3 hashVal = hash(localPos);
            float startTime = hashVal.x * 100.0;
            float shouldOscillate = step(startTime, ${inputs.t});
            float oscillation = sin(${inputs.t} * 2.0 + hashVal.y * 6.28) * 0.5 + 0.5;
            vec4 whiteColor = vec4(1.0, 1.0, 1.0, 1.0);
            vec3 moveDirection = normalize(vec3(
              1.0,
              (hashVal.y - 0.5) * 0.9,
              (hashVal.z - 0.5) * 0.9
            ));
            float randomSpeed = fract(sin(dot(${inputs.gsplat}.center, vec3(12., 78., 45.))) * 43758.);
            float moveAmount = ${inputs.t} * 0.1 * randomSpeed * shouldOscillate;
            ${outputs.gsplat}.center = ${inputs.gsplat}.center + moveDirection * moveAmount;
            ${outputs.gsplat}.rgba = mix(${inputs.gsplat}.rgba,
              mix(${inputs.gsplat}.rgba, whiteColor, oscillation),
              shouldOscillate);
            ${outputs.gsplat}.rgba.w *= mix(1.0, 1.0 - clamp(moveAmount / 2.0, 0.0, 1.0), shouldOscillate);
          `),
      });
      const next = d.apply({ gsplat, t: animateT }).gsplat;
      return { gsplat: next };
    },
  );
  fly.updateGenerator();

  await fly.initialized;
  return { root: fly, splatCount: fly.numSplats };
}

async function buildAnimatedWarp() {
  // Mirrors the animated portion of examples/glsl: butterfly.spz with a
  // dyno worldModifier that warps each splat's centre by warpRadial.
  // The example drives the warp via `animateT.value = time / 1000` in
  // the animation loop; we set animateT to a deterministic 1.5 here so
  // the captured frame is reproducible. Tests that dyno-uniform-driven
  // animation is bit-perfect across backends at a fixed time.
  const mesh = new SplatMesh({ url: `${splatUrl("butterfly.spz")}` });
  mesh.quaternion.set(1, 0, 0, 0);
  mesh.position.set(0, 0, -1.5);

  const animateT = dyno.dynoFloat(1.5);

  mesh.objectModifier = dyno.dynoBlock(
    { gsplat: dyno.Gsplat },
    { gsplat: dyno.Gsplat },
    ({ gsplat }) => {
      const d = new dyno.Dyno({
        inTypes: { gsplat: dyno.Gsplat, t: "float" },
        outTypes: { gsplat: dyno.Gsplat },
        globals: () => [
          dyno.unindent(`
            float warpRadial(float r, float t) {
              return r * (1.0 + 0.1 * sin(r * 15.0 + t * 3.0));
            }
            vec3 warp(vec3 pos, float t) {
              float r = length(pos);
              float newR = warpRadial(r, t);
              return pos * (newR / r);
            }
          `),
        ],
        statements: ({ inputs, outputs }) =>
          dyno.unindentLines(`
            ${outputs.gsplat} = ${inputs.gsplat};
            ${outputs.gsplat}.center = warp(${inputs.gsplat}.center, ${inputs.t});
          `),
      });
      const next = d.apply({ gsplat, t: animateT }).gsplat;
      return { gsplat: next };
    },
  );
  mesh.updateGenerator();

  await mesh.initialized;
  return { root: mesh, splatCount: mesh.numSplats };
}

async function buildGlsl() {
  // Mirrors the static portion of examples/glsl: butterfly.spz with a
  // worldModifier that injects raw GLSL into the Spark shader. The
  // waveRgb function tints each splat's RGB by sin/cos of its world-
  // space centre. The example also wires a time-driven animateT to a
  // separate DynoBlock for animated motion; we drop that here because
  // parity is measured at a single static frame. Tests the dyno raw-
  // GLSL injection path (dyno.Dyno with globals + statements) across
  // backends.
  const mesh = new SplatMesh({ url: `${splatUrl("butterfly.spz")}` });
  mesh.quaternion.set(1, 0, 0, 0);
  mesh.position.set(0, 0, -1.5);

  mesh.worldModifier = new dyno.Dyno({
    inTypes: { gsplat: dyno.Gsplat },
    outTypes: { gsplat: dyno.Gsplat },
    globals: () => [
      dyno.unindent(`
        vec3 waveRgb(vec3 pos) {
          return vec3(
            0.6 + 0.4 * sin(pos.x * 56.0),
            0.6 + 0.4 * sin(pos.y * 78.0),
            0.6 + 0.4 * cos(pos.z * 90.0)
          );
        }
      `),
    ],
    statements: ({ inputs, outputs }) =>
      dyno.unindentLines(`
        ${outputs.gsplat} = ${inputs.gsplat};
        ${outputs.gsplat}.rgba.rgb *= waveRgb(${inputs.gsplat}.center);
      `),
  });

  await mesh.initialized;
  return { root: mesh, splatCount: mesh.numSplats };
}

async function buildNonLod() {
  // Mirrors examples/nonlod: butterfly-ai.spz loaded three times side by
  // side, each with a dyno shader-graph objectModifier that multiplies
  // per-splat RGB by debugColorHue(index >> 12). The result is a per-
  // splat-index hue overlay on each butterfly. This is the first scene
  // in the matrix that exercises the dyno (shader-graph) modifier
  // pipeline — distinct from the simpler modifiers namespace path
  // covered by debugColor.
  const splatColoring = dyno.dynoBool(true);

  function makeSplatIndexColoring() {
    return dyno.dynoBlock(
      { gsplat: dyno.Gsplat },
      { gsplat: dyno.Gsplat },
      ({ gsplat }) => {
        let { index, rgb } = dyno.splitGsplat(gsplat).outputs;
        const debugRgb = dyno.debugColorHue(
          dyno.shr(index, dyno.dynoConst("int", 12)),
        );
        rgb = dyno.select(splatColoring, dyno.mul(debugRgb, rgb), rgb);
        return { gsplat: dyno.combineGsplat({ gsplat, rgb }) };
      },
    );
  }

  function makeButterfly(url, position) {
    const splats = new SplatMesh({ url });
    splats.objectModifiers = [makeSplatIndexColoring()];
    splats.updateGenerator();
    splats.quaternion.set(1, 0, 0, 0);
    splats.position.set(position[0], position[1], position[2]);
    return splats;
  }

  const url = `${splatUrl("butterfly-ai.spz")}`;
  const left = makeButterfly(url, [-1, 0, -1.5]);
  const middle = makeButterfly(url, [0, 0, -1.5]);
  const right = makeButterfly(url, [1, 0, -1.5]);

  await Promise.all([left.initialized, middle.initialized, right.initialized]);

  const group = new THREE.Group();
  group.add(left);
  group.add(middle);
  group.add(right);
  return {
    root: group,
    splatCount: left.numSplats + middle.numSplats + right.numSplats,
  };
}

async function buildExtSplats() {
  // Mirrors examples/extsplats. Loads distant-igloo.spz twice — once with
  // the default PackedSplats float16 position precision and once with
  // extSplats: true (float32). Both meshes live in a Group that is
  // translated to z=1000, where float16's 1/1000 relative precision
  // produces visible quantization on the non-extSplats copy. The
  // example bobs the group in y over time; we capture at the static
  // group.position = (0, 0, 1000) (sin(0) = 0).
  const url = `${splatUrl("distant-igloo.spz")}`;

  const standard = new SplatMesh({ url, extSplats: false });
  standard.position.set(0, -1.5, 0);

  const extended = new SplatMesh({ url, extSplats: true });
  extended.position.set(0, 1.5, 0);

  await Promise.all([standard.initialized, extended.initialized]);

  const group = new THREE.Group();
  group.position.set(0, 0, 1000);
  group.add(standard);
  group.add(extended);
  return {
    root: group,
    splatCount: standard.numSplats + extended.numSplats,
  };
}

async function buildDebugColor() {
  // Mirrors examples/debug-color: two URL-loaded butterflies with
  // different debug-colour modifiers. The left butterfly uses
  // setWorldNormalColor (RGB = world-space normals); the right one
  // uses setDepthColor (greyscale depth ramp). Exercises the public
  // modifiers namespace through the parity gate.
  const butterfly = new SplatMesh({
    url: `${splatUrl("butterfly.spz")}`,
  });
  butterfly.quaternion.set(1, 0, 0, 0);
  butterfly.scale.setScalar(0.5);
  butterfly.position.set(-0.5, 0, -1.5);

  const butterfly2 = new SplatMesh({
    url: `${splatUrl("butterfly-ai.spz")}`,
  });
  butterfly2.quaternion.set(1, 0, 0, 0);
  butterfly2.position.set(0.5, 0, -1.5);

  await Promise.all([butterfly.initialized, butterfly2.initialized]);

  modifiers.setWorldNormalColor(butterfly);
  modifiers.setDepthColor(butterfly2, 1, 2, true);

  const group = new THREE.Group();
  group.add(butterfly);
  group.add(butterfly2);
  return {
    root: group,
    splatCount: butterfly.numSplats + butterfly2.numSplats,
  };
}

async function buildMultipleSplats() {
  // Mirrors examples/multiple-splats at a fixed frame (no orbit): two
  // separately-loaded splat files in one Group. Tests cross-mesh sort
  // across two URL-loaded SplatMesh instances with different scales and
  // quaternions.
  const butterfly = new SplatMesh({
    url: `${splatUrl("butterfly-ai.spz")}`,
  });
  butterfly.quaternion.set(1, 0, 0, 0);
  butterfly.position.set(-1.0, 0.6, 0);

  const cat = new SplatMesh({ url: `${splatUrl("cat.spz")}` });
  cat.quaternion.set(1, 0, 0, 0);
  cat.scale.setScalar(0.5);
  cat.position.set(0.6, -0.4, 0);

  await Promise.all([butterfly.initialized, cat.initialized]);

  const group = new THREE.Group();
  group.add(butterfly);
  group.add(cat);
  return {
    root: group,
    splatCount: butterfly.numSplats + cat.numSplats,
  };
}

async function buildTinted() {
  // A white-splat grid uniformly tinted via SplatMesh.recolor. The grid
  // is built with `color: new THREE.Color(1, 1, 1)` so the per-splat
  // colour is pure white; the recolour multiplier then drives the
  // visible hue. This demonstrates Spark's recolour modifier (different
  // from per-splat colour) and exercises the worldModifier pipeline
  // across backends.
  const mesh = new SplatMesh({
    constructSplats: (splats) => {
      constructGrid({
        splats,
        extents: new THREE.Box3(
          new THREE.Vector3(-0.7, -0.7, -0.7),
          new THREE.Vector3(0.7, 0.7, 0.7),
        ),
        stepSize: 0.35,
        pointRadius: 0.04,
        pointShadowScale: 1.6,
        color: new THREE.Color(1, 1, 1),
      });
    },
  });
  mesh.recolor = new THREE.Color(0.95, 0.42, 0.75);
  await mesh.initialized;
  return { root: mesh, splatCount: mesh.numSplats };
}

// Re-export THREE so fixtures get the same module instance.
export { THREE };

async function buildSingle(makeMesh) {
  const mesh = makeMesh();
  await mesh.initialized;
  return { root: mesh, splatCount: mesh.numSplats };
}

async function buildMultiMesh() {
  const sphere = new SplatMesh({
    constructSplats: (splats) => {
      constructSpherePoints({
        splats,
        radius: 0.55,
        maxDepth: 2,
        pointRadius: 0.04,
        pointThickness: 0.006,
        color: (color, point) =>
          color.setRGB(
            0.4 + 0.6 * point.x,
            0.4 + 0.6 * point.y,
            0.4 + 0.6 * point.z,
          ),
      });
    },
  });
  sphere.position.set(-0.6, 0, 0);

  const axes = new SplatMesh({
    constructSplats: (splats) => {
      constructAxes({
        splats,
        scale: 0.55,
        axisRadius: 0.025,
        axisShadowScale: 1.6,
      });
    },
  });
  axes.position.set(0.65, 0, 0.4);

  await Promise.all([sphere.initialized, axes.initialized]);

  const group = new THREE.Group();
  group.add(sphere);
  group.add(axes);
  return {
    root: group,
    splatCount: sphere.numSplats + axes.numSplats,
  };
}

// Tier 5 splat-shader-effects scene builder. Lifts the example's full
// 5-effect shader bundle (Electronic / Meditation / Waves /
// Disintegrate / Flare) onto cat.spz and returns a scene config with
// the requested effectType integer uniform. `intensity` is pinned to
// 0.8 (the example's default GUI slider position) and `t` is pinned
// to 0 (animation frame zero) so the gen-pass output is deterministic
// across runs and backends.
//
// Used by both `splatShaderEffects` (effectType=5 Disintegrate, the
// example's default) and `splatShaderEffectsFlare` (effectType=4) to
// validate the integer-dispatch path lands at parity across multiple
// branches of the same shader bundle (one captures the disintegrate
// branch, the other the flare branch — both run the same globals()
// helper bundle but pick different effect code at gen time).
function buildSplatShaderEffectsScene(effectType) {
  return {
    camera: {
      position: [0, 0, 0],
      lookAt: [0, 0, -1],
      fov: 60,
      near: 0.1,
      far: 10,
    },
    clearColor: 0x000000,
    build: async () => {
      const cat = new SplatMesh({ url: splatUrl("cat.spz") });
      await cat.initialized;
      cat.quaternion.set(1, 0, 0, 0);
      cat.position.set(0, 0, -1.5);
      cat.scale.set(0.5, 0.5, 0.5);
      cat.objectModifier = dyno.dynoBlock(
        { gsplat: dyno.Gsplat },
        { gsplat: dyno.Gsplat },
        ({ gsplat }) => {
          const d = new dyno.Dyno({
            inTypes: {
              gsplat: dyno.Gsplat,
              t: "float",
              effectType: "int",
              intensity: "float",
            },
            outTypes: { gsplat: dyno.Gsplat },
            globals: () => [
              dyno.unindent(`
                vec3 hash(vec3 p) {
                  return fract(sin(p*123.456)*123.456);
                }

                mat2 rot(float a) {
                  float s = sin(a), c = cos(a);
                  return mat2(c, -s, s, c);
                }

                vec3 headMovement(vec3 pos, float t) {
                  pos.xy *= rot(smoothstep(-1., -2., pos.y) * .2 * sin(t*2.));
                  return pos;
                }

                vec3 breathAnimation(vec3 pos, float t) {
                  float b = sin(t*1.5);
                  pos.yz *= rot(smoothstep(-1., -3., pos.y) * .15 * -b);
                  pos.z += .3;
                  pos.y += 1.2;
                  pos *= 1. + exp(-3. * length(pos)) * b;
                  pos.z -= .3;
                  pos.y -= 1.2;
                  return pos;
                }

                vec4 fractal1(vec3 pos, float t, float intensity) {
                  float m = 100.;
                  vec3 p = pos * .1;
                  p.y += .5;
                  for (int i = 0; i < 8; i++) {
                    p = abs(p) / clamp(abs(p.x * p.y), 0.3, 3.) - 1.;
                    p.xy *= rot(radians(90.));
                    if (i > 1) m = min(m, length(p.xy) + step(.3, fract(p.z * .5 + t * .5 + float(i) * .2)));
                  }
                  m = step(m, 0.5) * 1.3 * intensity;
                  return vec4(-pos.y * .3, 0.5, 0.7, .3) * intensity + m;
                }

                vec4 fractal2(vec3 center, vec3 scales, vec4 rgba, float t, float intensity) {
                  vec3 pos = center;
                  float splatSize = length(scales);
                  float pattern = exp(-50. * splatSize);
                  vec3 p = pos * .65;
                  pos.y += 2.;
                  float c = 0.;
                  float l, l2 = length(p);
                  float m = 100.;

                  for (int i = 0; i < 10; i++) {
                    p.xyz = abs(p.xyz) / dot(p.xyz, p.xyz) - .8;
                    l = length(p.xyz);
                    c += exp(-1. * abs(l - l2) * (1. + sin(t * 1.5 + pos.y)));
                    l2 = length(p.xyz);
                    m = min(m, length(p.xyz));
                  }

                  c = smoothstep(0.3, 0.5, m + sin(t * 1.5 + pos.y * .5)) + c * .1;
                  return vec4(vec3(length(rgba.rgb)) * vec3(c, c*c, c*c*c) * intensity,
                            rgba.a * exp(-20. * splatSize) * m * intensity);
                }

                vec4 sin3D(vec3 p, float t) {
                  float m = exp(-2. * length(sin(p * 5. + t * 3.))) * 5.;
                  return vec4(m) + .3;
                }

                vec4 disintegrate(vec3 pos, float t, float intensity) {
                  vec3 p = pos + (hash(pos) * 2. - 1.) * intensity;
                  float tt = smoothstep(-1., 0.5, -sin(t + -pos.y * .5));
                  p.xz *= rot(tt * 2. + p.y * 2. * tt);
                  return vec4(mix(p, pos, tt), tt);
                }

                vec4 flare(vec3 pos, float t) {
                  vec3 p = vec3(0., -1.5, 0.);
                  float tt = smoothstep(-1., .5, sin(t + hash(pos).x));
                  tt = tt * tt;
                  p.x += sin(t * 2.) * tt;
                  p.z += sin(t * 2.) * tt;
                  p.y += sin(t) * tt;
                  return vec4(mix(pos, p, tt), tt);
                }
              `),
            ],
            statements: ({ inputs, outputs }) =>
              dyno.unindentLines(`
                ${outputs.gsplat} = ${inputs.gsplat};

                vec3 localPos = ${inputs.gsplat}.center;
                vec3 splatScales = ${inputs.gsplat}.scales;
                vec4 splatColor = ${inputs.gsplat}.rgba;

                if (${inputs.effectType} == 1) {
                  ${outputs.gsplat}.center = headMovement(localPos, ${inputs.t});
                  vec4 effect1 = fractal1(localPos, ${inputs.t}, ${inputs.intensity});
                  ${outputs.gsplat}.rgba.rgba = mix(splatColor, splatColor*effect1, ${inputs.intensity});
                }
                else if (${inputs.effectType} == 2) {
                  vec4 effectColor = fractal2(localPos, splatScales, splatColor, ${inputs.t}, ${inputs.intensity});
                  ${outputs.gsplat}.rgba.rgba = mix(splatColor, effectColor, ${inputs.intensity});
                  ${outputs.gsplat}.center = breathAnimation(localPos, ${inputs.t});
                }
                else if (${inputs.effectType} == 3) {
                  vec4 effect = sin3D(localPos, ${inputs.t});
                  ${outputs.gsplat}.rgba.rgba = mix(splatColor, splatColor*effect, ${inputs.intensity});
                  vec3 pos = localPos;
                  pos.y += 1.;
                  pos *= (1. + effect.x * .05 * ${inputs.intensity});
                  pos.y -= 1.;
                  ${outputs.gsplat}.center = pos;
                }
                else if (${inputs.effectType} == 5) {
                  vec4 e = disintegrate(localPos, ${inputs.t}, ${inputs.intensity});
                  ${outputs.gsplat}.center = e.xyz;
                  ${outputs.gsplat}.scales = mix(vec3(.01, .01, .01), ${inputs.gsplat}.scales, e.w);
                }
                else if (${inputs.effectType} == 4) {
                  vec4 e = flare(localPos, ${inputs.t});
                  ${outputs.gsplat}.center = e.xyz;
                  ${outputs.gsplat}.rgba.rgb = mix(splatColor.rgb, vec3(1.), abs(e.w));
                  ${outputs.gsplat}.rgba.a = mix(splatColor.a, 0.3, abs(e.w));
                }
              `),
          });
          return {
            gsplat: d.apply({
              gsplat,
              t: dyno.dynoFloat(0),
              effectType: dyno.dynoInt(effectType),
              intensity: dyno.dynoFloat(0.8),
            }).gsplat,
          };
        },
      );
      cat.updateGenerator();
      return { root: cat, splatCount: cat.numSplats };
    },
  };
}

export const SCENES = {
  axes: {
    camera: {
      position: [0.9, 0.7, 1.9],
      lookAt: [0, 0, 0],
      fov: 45,
      near: 0.01,
      far: 10,
    },
    clearColor: 0x10151c,
    build: () =>
      buildSingle(
        () =>
          new SplatMesh({
            constructSplats: (splats) => {
              constructAxes({
                splats,
                scale: 0.45,
                axisRadius: 0.025,
                axisShadowScale: 1.5,
              });
            },
          }),
      ),
  },
  grid: {
    camera: {
      position: [2.9, 2.2, 4.0],
      lookAt: [0, 0, 0],
      fov: 45,
      near: 0.01,
      far: 20,
    },
    clearColor: 0x080c12,
    build: () =>
      buildSingle(
        () =>
          new SplatMesh({
            constructSplats: (splats) => {
              constructGrid({
                splats,
                extents: new THREE.Box3(
                  new THREE.Vector3(-1, -1, -1),
                  new THREE.Vector3(1, 1, 1),
                ),
                stepSize: 0.4,
                pointRadius: 0.04,
                pointShadowScale: 1.6,
              });
            },
          }),
      ),
  },
  sphere: {
    camera: {
      position: [0.05, 0.4, 2.6],
      lookAt: [0, 0, 0],
      fov: 45,
      near: 0.01,
      far: 10,
    },
    clearColor: 0x0c1018,
    build: () =>
      buildSingle(
        () =>
          new SplatMesh({
            constructSplats: (splats) => {
              constructSpherePoints({
                splats,
                radius: 1.0,
                maxDepth: 3,
                pointRadius: 0.035,
                pointThickness: 0.006,
                color: (color, point) =>
                  color.setRGB(
                    0.5 + 0.5 * point.x,
                    0.5 + 0.5 * point.y,
                    0.5 + 0.5 * point.z,
                  ),
              });
            },
          }),
      ),
  },
  multi: {
    camera: {
      position: [0.4, 0.5, 2.5],
      lookAt: [0, 0, 0],
      fov: 50,
      near: 0.01,
      far: 10,
    },
    clearColor: 0x0a0e16,
    build: buildMultiMesh,
  },
  tinted: {
    camera: {
      position: [2.4, 1.8, 3.4],
      lookAt: [0, 0, 0],
      fov: 45,
      near: 0.01,
      far: 20,
    },
    clearColor: 0x080a14,
    build: buildTinted,
  },
  helloWorld: {
    // Mirrors examples/hello-world: butterfly.spz from sparkjs.dev CDN,
    // camera at origin looking down -Z, splat at z=-3. Establishes the
    // URL-loaded splat parity pattern — a network failure or a backend
    // that mishandles URL loading now fails the gate.
    camera: {
      position: [0, 0, 0],
      lookAt: [0, 0, -1],
      fov: 60,
      near: 0.1,
      far: 100,
    },
    clearColor: 0x000000,
    build: () =>
      buildUrlSplat({
        url: `${splatUrl("butterfly.spz")}`,
        position: [0, 0, -3],
        quaternion: [1, 0, 0, 0],
      }),
  },
  multipleSplats: {
    camera: {
      position: [0, 0, 4],
      lookAt: [0, 0, 0],
      fov: 50,
      near: 0.1,
      far: 100,
    },
    clearColor: 0x101820,
    build: buildMultipleSplats,
  },
  debugColor: {
    // Mirrors examples/debug-color: butterfly with setWorldNormalColor
    // on the left, butterfly-ai with setDepthColor on the right. White
    // clear so the depth-colour ramp reads clearly against the back.
    camera: {
      position: [0, 0, 0],
      lookAt: [0, 0, -1],
      fov: 60,
      near: 0.1,
      far: 1000,
    },
    clearColor: 0xffffff,
    build: buildDebugColor,
  },
  viewer: {
    // Mirrors examples/viewer with butterfly.spz: a single URL-loaded
    // splat at the default viewer framing (origin camera, splat at z=-2).
    camera: {
      position: [0, 0, 0],
      lookAt: [0, 0, -1],
      fov: 75,
      near: 0.01,
      far: 1000,
    },
    clearColor: 0x101218,
    build: () =>
      buildUrlSplat({
        url: `${splatUrl("butterfly.spz")}`,
        position: [0, 0, -2],
        quaternion: [1, 0, 0, 0],
      }),
  },
  depthOfField: {
    // Mirrors examples/depth-of-field: valley.spz with the SparkRenderer
    // configured for depth-of-field (apertureAngle = 0.02 rad, focal
    // distance 5.0). The sparkOverrides field is merged into the
    // SparkRenderer construction call across all three backend fixtures.
    camera: {
      position: [0, 0, 0],
      lookAt: [0, 0, -1],
      fov: 60,
      near: 0.1,
      far: 1000,
    },
    clearColor: 0x000000,
    sparkOverrides: {
      apertureAngle: 0.02,
      focalDistance: 5.0,
    },
    build: () =>
      buildUrlSplat({
        url: `${splatUrl("valley.spz")}`,
        position: [0, 0, -5],
        quaternion: [1, 0, 0, 0],
        scale: 0.5,
      }),
  },
  sogs: {
    // Mirrors examples/sogs: sutro.zip (a SOGS-format splat package)
    // loaded through SplatMesh's URL path. Exercises the SOGS reader and
    // unpackPcSogsZip code path through the parity gate — which is also
    // where 26e5f36 fixed the fflate Uint8Array → ArrayBuffer conversion.
    // The example overlays a Three.js Sky helper; the parity scene drops
    // it because Sky is a Three-only addon and the parity gate measures
    // Spark splat rendering, not Three.js sky shading.
    camera: {
      position: [0, 1.5, -1.2],
      lookAt: [0, 1.5, 0],
      fov: 60,
      near: 0.01,
      far: 1000,
    },
    clearColor: 0x202830,
    build: () =>
      buildUrlSplat({
        url: `${splatUrl("sutro.zip")}`,
        quaternion: [1, 0, 0, 0],
      }),
  },
  extSplats: {
    // Mirrors examples/extsplats: distant-igloo.spz at z=1000, loaded
    // twice — once with extSplats:false (float16 positions, visible
    // quantization at 1/1000 relative precision) and once with
    // extSplats:true (float32 positions, clean). The example's camera
    // is at origin and the animation orbits via SparkControls; we frame
    // statically from z=997 looking toward (0, 0, 1000) so both meshes
    // (at y=±1.5, z=1000) sit in front of the camera. Tests the
    // ExtSplats render path across backends.
    camera: {
      position: [0, 0, 997],
      lookAt: [0, 0, 1000],
      fov: 75,
      near: 0.01,
      far: 2000,
    },
    clearColor: 0x080a14,
    build: buildExtSplats,
  },
  nonLod: {
    // Mirrors examples/nonlod: three butterfly-ai.spz instances with a
    // dyno objectModifier that mixes a per-splat-index hue ramp into
    // the per-splat colour. lodSplatCount is capped at 100K matching
    // the example so individual splats are visible. First scene in
    // the matrix to exercise the dyno shader-graph modifier path.
    camera: {
      position: [0, 0, 0],
      lookAt: [0, 0, -1],
      fov: 75,
      near: 0.01,
      far: 1000,
    },
    clearColor: 0x101218,
    sparkOverrides: { lodSplatCount: 100000 },
    build: buildNonLod,
  },
  glsl: {
    // Mirrors the static portion of examples/glsl: butterfly.spz with
    // a worldModifier dyno.Dyno that injects raw GLSL (waveRgb tint
    // based on world-space splat centre). First scene in the matrix
    // to exercise dyno.Dyno + dyno.unindent / unindentLines for raw-
    // GLSL injection.
    camera: {
      position: [0, 0, 0],
      lookAt: [0, 0, -1],
      fov: 60,
      near: 0.1,
      far: 1000,
    },
    clearColor: 0x000000,
    build: buildGlsl,
  },
  dynamicLighting: {
    // Mirrors the initial-frame portion of examples/dynamic-lighting:
    // fireplace.spz lit by three SDF sphere lights in two ADD_RGBA
    // SplatEdit layers + one DARKEN layer. First scene in the matrix
    // to exercise the SplatEdit / SplatEditSdf pipeline. Camera at
    // (0, 0, -2.5) matches the example's initial position before the
    // animation loop's sin() camera bob.
    camera: {
      position: [0, 0, -2.5],
      lookAt: [0, 0, -10],
      fov: 60,
      near: 0.1,
      far: 100,
    },
    clearColor: 0x000000,
    build: buildDynamicLighting,
  },
  splatDissolve: {
    // Mirrors examples/splat-dissolve-effects: fly.spz mid-dissolve at
    // a deterministic animateT = 5.0. Tests dyno hash-driven per-splat
    // dissolve + oscillation + drift + fade through the parity gate.
    camera: {
      position: [0, 0, 1],
      lookAt: [0, 0, -0.5],
      fov: 60,
      near: 0.1,
      far: 1000,
    },
    clearColor: 0x000000,
    time: 5.0,
    build: buildSplatDissolve,
  },
  splatReveal: {
    // Inverse of splatDissolve: butterfly with a fade-in reveal
    // modifier. Custom dyno (not a direct port of splat-reveal-effects
    // because that example switches 5 different effects across 5
    // different splat files; the parity gate measures one effect at
    // a time). At time = 1.2 the butterfly is mid-reveal.
    camera: {
      position: [0, 0, 0],
      lookAt: [0, 0, -1],
      fov: 60,
      near: 0.1,
      far: 1000,
    },
    clearColor: 0x000000,
    time: 1.2,
    build: buildSplatReveal,
  },
  animatedWarp: {
    // Mirrors the animated portion of examples/glsl with a fixed
    // animateT = 1.5. Also sets sceneCfg.time so SparkRenderer's
    // internal time uniform is deterministic for any downstream code
    // path that reads it (DoF jitter, sort fade-in, etc.). First scene
    // in the matrix that exercises Phase B's fixed-time fixture
    // plumbing.
    camera: {
      position: [0, 0, 0],
      lookAt: [0, 0, -1],
      fov: 60,
      near: 0.1,
      far: 1000,
    },
    clearColor: 0x000000,
    time: 1.5,
    build: buildAnimatedWarp,
  },
  envMap: {
    // Mirrors examples/envmap: fireplace.spz mirrored backgrounds with
    // a chrome rubberduck.glb in the centre reflecting the splat scene
    // via renderEnvMap. Camera at y=0.5 looking down -Z. Tests the
    // SparkRenderer.renderEnvMap path + the new postInit hook that
    // lets a scene config access the SparkRenderer after construction.
    camera: {
      position: [0, 0.5, 0],
      lookAt: [0, 0.5, -1],
      fov: 75,
      near: 0.1,
      far: 1000,
    },
    clearColor: 0x1b2037,
    build: buildEnvMap,
  },
  splatShaderEffects: buildSplatShaderEffectsScene(5),
  splatShaderEffectsFlare: buildSplatShaderEffectsScene(4),
  splatShaderEffectsElectronic: buildSplatShaderEffectsScene(1),
  splatShaderEffectsMeditation: buildSplatShaderEffectsScene(2),
  splatShaderEffectsWaves: buildSplatShaderEffectsScene(3),
  interactiveDeform: {
    // Mirrors the static initial-frame of examples/interactive-deform/ —
    // penguin.spz under the dragBounce dyno modifier with
    // `dragActive = 0` (which gates the entire drag-displacement
    // branch via the `if (dragActive > 0.5)` runtime check) and
    // `bounceBaseDisplacement = (0,0,0)` (which zeroes the elastic
    // bounce offset regardless of time / dragRadius). The modifier
    // runs through every backend's gen pass but produces byte-
    // identical output to a pure passthrough.
    camera: {
      position: [0, 3, 5.5],
      lookAt: [0, 1, 0],
      fov: 60,
      near: 0.1,
      far: 1000,
    },
    clearColor: 0x000000,
    build: async () => {
      const penguin = new SplatMesh({ url: splatUrl("penguin.spz") });
      await penguin.initialized;
      penguin.quaternion.set(1, 0, 0, 0);

      // Lift the example's dragBounce shader as-is. `inputs` carry
      // the 8 control uniforms; with the initial-state values below,
      // both displacement branches collapse to zero so the splat
      // centers exit the modifier unchanged.
      const dragPoint = dyno.dynoVec3(new THREE.Vector3(0, 0, 0));
      const dragDisplacement = dyno.dynoVec3(new THREE.Vector3(0, 0, 0));
      const dragRadius = dyno.dynoFloat(0.5);
      const dragActive = dyno.dynoFloat(0.0);
      const bounceTime = dyno.dynoFloat(0.0);
      const bounceBaseDisplacement = dyno.dynoVec3(new THREE.Vector3(0, 0, 0));
      const dragIntensity = dyno.dynoFloat(5.0);
      const bounceAmount = dyno.dynoFloat(0.5);
      const bounceSpeed = dyno.dynoFloat(0.5);

      penguin.worldModifier = dyno.dynoBlock(
        { gsplat: dyno.Gsplat },
        { gsplat: dyno.Gsplat },
        ({ gsplat }) => {
          const shader = new dyno.Dyno({
            inTypes: {
              gsplat: dyno.Gsplat,
              dragPoint: "vec3",
              dragDisplacement: "vec3",
              dragRadius: "float",
              dragActive: "float",
              bounceTime: "float",
              bounceBaseDisplacement: "vec3",
              dragIntensity: "float",
              bounceAmount: "float",
              bounceSpeed: "float",
            },
            outTypes: { gsplat: dyno.Gsplat },
            statements: ({ inputs, outputs }) =>
              dyno.unindentLines(`
                ${outputs.gsplat} = ${inputs.gsplat};
                vec3 originalPos = ${inputs.gsplat}.center;

                float distToDrag = distance(originalPos, ${inputs.dragPoint});
                float dragInfluence = 1.0 - smoothstep(0.0, ${inputs.dragRadius}*2., distToDrag);
                float time = ${inputs.bounceTime};

                if (${inputs.dragActive} > 0.5 && ${inputs.dragRadius} > 0.0) {
                  vec3 dragOffset = ${inputs.dragDisplacement} * dragInfluence * ${inputs.dragIntensity} * 50.0;
                  originalPos += dragOffset;
                }

                float bounceFrequency = 1.0 + ${inputs.bounceSpeed} * 8.0;
                vec3 bounceOffset = ${inputs.bounceBaseDisplacement} * dragInfluence * ${inputs.dragIntensity} * 50.0;
                originalPos += bounceOffset * cos(time*bounceFrequency) * exp(-time*2.0*(1.0-${inputs.bounceAmount}*.9));

                ${outputs.gsplat}.center = originalPos;
              `),
          });
          return {
            gsplat: shader.apply({
              gsplat,
              dragPoint,
              dragDisplacement,
              dragRadius,
              dragActive,
              bounceTime,
              bounceBaseDisplacement,
              dragIntensity,
              bounceAmount,
              bounceSpeed,
            }).gsplat,
          };
        },
      );
      penguin.updateGenerator();
      return { root: penguin, splatCount: penguin.numSplats };
    },
  },
  interactiveRipples: {
    // Mirrors the static initial-frame of examples/interactive-ripples/ —
    // valley.spz under a shockwave dyno modifier whose `hitpoint`
    // uniform sits far away (z=1000) so the smoothstep gate
    // `smoothstep(time*2, 0, distance)` evaluates to 0 for every
    // splat: edge0=time*2 > edge1=0, distance≥998 > edge0, so the
    // displacement multiplier is 0 and the modifier is a pure
    // passthrough at the captured frame. Time is held at 0.001 (small
    // but nonzero) to exercise the time-driven shader path without
    // letting any ripple amplitude leak through.
    camera: {
      position: [0, 0, 3],
      lookAt: [0, 0, 0],
      fov: 50,
      near: 0.01,
      far: 2000,
    },
    clearColor: 0x000000,
    time: 0.001,
    build: async () => {
      const valley = new SplatMesh({ url: splatUrl("valley.spz") });
      await valley.initialized;
      valley.rotateX(Math.PI);

      // Lift the example's shockwave dyno block — same shader source
      // so the gen-pass code path is byte-identical to what the
      // example produces. The `time` input is driven from spark.time
      // via dyno.dynoFloat(); the host wires sceneCfg.time onto
      // spark.time before the first sort.
      const hitpointUniform = dyno.dynoVec3(new THREE.Vector3(0, 0, 1000));
      const timeUniform = dyno.dynoFloat(0.001);
      valley.objectModifier = dyno.dynoBlock(
        { gsplat: dyno.Gsplat },
        { gsplat: dyno.Gsplat },
        ({ gsplat }) => {
          const shader = new dyno.Dyno({
            inTypes: {
              gsplat: dyno.Gsplat,
              time: "float",
              hitpoint: "vec3",
            },
            outTypes: { gsplat: dyno.Gsplat },
            globals: () => [
              dyno.unindent(`
                vec3 shockwave(vec3 center, float t, vec3 hitpoint) {
                  vec3 direction = center - hitpoint;
                  float distance = length(direction);
                  center += normalize(direction)*sin(t*4.-distance*5.)*exp(-t)*smoothstep(t*2.,0.,distance)*.5;
                  return center;
                }
                vec4 shockwaveColor(vec4 rgba, vec3 center, float t, vec3 hitpoint) {
                  vec3 direction = center - hitpoint;
                  float distance = length(direction);
                  float wave = sin(t*4.-distance*5.)*exp(-t*.7)*smoothstep(t*2.,0.,distance);
                  float brightness = pow(abs(wave),3.) * 10.;
                  rgba.rgb += brightness;
                  return rgba;
                }
              `),
            ],
            statements: ({ inputs, outputs }) =>
              dyno.unindentLines(`
                ${outputs.gsplat} = ${inputs.gsplat};
                ${outputs.gsplat}.center = shockwave(${inputs.gsplat}.center, ${inputs.time}, ${inputs.hitpoint});
                ${outputs.gsplat}.rgba = shockwaveColor(${inputs.gsplat}.rgba, ${inputs.gsplat}.center, ${inputs.time}, ${inputs.hitpoint});
              `),
          });
          return {
            gsplat: shader.apply({
              gsplat,
              time: timeUniform,
              hitpoint: hitpointUniform,
            }).gsplat,
          };
        },
      );
      valley.updateGenerator();
      return { root: valley, splatCount: valley.numSplats };
    },
  },
  raycasting: {
    // Mirrors the static initial-frame of examples/raycasting/ — five
    // robot-head.spz instances at z=0..4 with rotation.x = PI (flip so
    // the head faces the camera) and a small scale. The example's
    // interactive part (click → highlight) does not fire during the
    // snapshot, so the captured frame is parity-able across backends.
    // First Tier 7 scene to land in the matrix.
    camera: {
      position: [0, -0.25, -1.5],
      lookAt: [0, -0.15, 0],
      fov: 50,
      near: 0.1,
      far: 10,
    },
    clearColor: 0x000000,
    build: async () => {
      const url = splatUrl("robot-head.spz");
      const root = new THREE.Group();
      let splatCount = 0;
      for (let i = 0; i < 5; i++) {
        const robot = new SplatMesh({ url });
        robot.rotation.x = Math.PI;
        robot.scale.setScalar(0.2);
        robot.position.set(0, 0, i);
        await robot.initialized;
        root.add(robot);
        splatCount += robot.numSplats;
      }
      return { root, splatCount };
    },
  },
};

export function getSceneName() {
  const params = new URLSearchParams(window.location.search);
  return params.get("scene") || "axes";
}

export function getScene(name) {
  const scene = SCENES[name];
  if (!scene) {
    throw new Error(`Unknown scene: ${name}`);
  }
  return scene;
}
