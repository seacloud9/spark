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
  SplatMesh,
  constructAxes,
  constructGrid,
  constructSpherePoints,
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
