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

  const url = `${ASSET_BASE}/splats/fireplace.spz`;
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
    `${ASSET_BASE}/models/rubberduck.glb`,
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
    url: `${ASSET_BASE}/splats/fireplace.spz`,
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

async function buildSplatDissolve() {
  // Mirrors examples/splat-dissolve-effects: fly.spz with a dyno
  // objectModifier that hash-drives a per-splat dissolve over time —
  // each splat has its own start time, oscillates white, drifts along a
  // hash-derived direction, fades out. The example pumps animateT from
  // a setAnimationLoop wall clock; the parity scene pins animateT to
  // a deterministic 5.0 so the captured frame is reproducible. Mid-
  // dissolve frame shows the partial drift / fade effect.
  const fly = new SplatMesh({ url: `${ASSET_BASE}/splats/fly.spz` });
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
  const mesh = new SplatMesh({ url: `${ASSET_BASE}/splats/butterfly.spz` });
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
  const mesh = new SplatMesh({ url: `${ASSET_BASE}/splats/butterfly.spz` });
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

  const url = `${ASSET_BASE}/splats/butterfly-ai.spz`;
  const left = makeButterfly(url, [-1, 0, -1.5]);
  const middle = makeButterfly(url, [0, 0, -1.5]);
  const right = makeButterfly(url, [1, 0, -1.5]);

  await Promise.all([
    left.initialized,
    middle.initialized,
    right.initialized,
  ]);

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
  const url = `${ASSET_BASE}/splats/distant-igloo.spz`;

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
    url: `${ASSET_BASE}/splats/butterfly.spz`,
  });
  butterfly.quaternion.set(1, 0, 0, 0);
  butterfly.scale.setScalar(0.5);
  butterfly.position.set(-0.5, 0, -1.5);

  const butterfly2 = new SplatMesh({
    url: `${ASSET_BASE}/splats/butterfly-ai.spz`,
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
    url: `${ASSET_BASE}/splats/butterfly-ai.spz`,
  });
  butterfly.quaternion.set(1, 0, 0, 0);
  butterfly.position.set(-1.0, 0.6, 0);

  const cat = new SplatMesh({ url: `${ASSET_BASE}/splats/cat.spz` });
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
        url: `${ASSET_BASE}/splats/butterfly.spz`,
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
        url: `${ASSET_BASE}/splats/butterfly.spz`,
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
        url: `${ASSET_BASE}/splats/valley.spz`,
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
        url: `${ASSET_BASE}/splats/sutro.zip`,
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
