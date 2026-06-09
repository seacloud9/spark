// Shared scene catalogue for the parity snapshot fixtures.
// Three/A-Frame/Babylon fixtures all import this so a "scene" is defined
// once and rendered identically across the three backends.

import * as THREE from "three";
import {
  constructAxes,
  constructGrid,
  constructSpherePoints,
  SplatMesh,
} from "/src/index.ts";

// Re-export THREE so fixtures get the same module instance.
export { THREE };

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
