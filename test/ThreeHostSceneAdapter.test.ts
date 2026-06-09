import assert from "node:assert";
import * as THREE from "three";
import { ThreeHostSceneAdapter } from "../src/backends/three/ThreeHostSceneAdapter.js";

let isPresenting = false;
let drawingBufferSize = { x: 800, y: 600 };
let session: {
  renderState: {
    baseLayer: { framebufferWidth: number; framebufferHeight: number } | null;
  };
} | null = null;
const xrCamera = new THREE.PerspectiveCamera();

const stubRenderer = {
  xr: {
    get isPresenting() {
      return isPresenting;
    },
    getCamera() {
      return xrCamera;
    },
    getSession() {
      return session;
    },
  },
  getDrawingBufferSize(target: THREE.Vector2) {
    target.set(drawingBufferSize.x, drawingBufferSize.y);
    return target;
  },
} as unknown as THREE.WebGLRenderer;

const scene = new THREE.Scene();
const visibleNode = new THREE.Object3D();
const hiddenNode = new THREE.Object3D();
hiddenNode.visible = false;
scene.add(visibleNode);
scene.add(hiddenNode);

const camera = new THREE.PerspectiveCamera();
const adapter = new ThreeHostSceneAdapter({
  scene,
  camera,
  renderer: stubRenderer,
});

assert.strictEqual(adapter.backend, "three");
assert.strictEqual(adapter.getScene(), scene);
assert.strictEqual(adapter.getActiveCamera(), camera);
assert.strictEqual(adapter.isXrPresenting(), false);
assert.strictEqual(
  adapter.getRenderCamera(),
  camera,
  "getRenderCamera returns the active camera when XR is not presenting",
);
assert.deepStrictEqual(adapter.getDrawingBufferSize(), {
  width: 800,
  height: 600,
});

const allSeen: THREE.Object3D[] = [];
adapter.traverseAll((node) => allSeen.push(node));
assert.ok(
  allSeen.includes(visibleNode) && allSeen.includes(hiddenNode),
  "traverseAll should visit hidden nodes",
);

const visibleSeen: THREE.Object3D[] = [];
adapter.traverseVisible((node) => visibleSeen.push(node));
assert.ok(
  visibleSeen.includes(visibleNode),
  "traverseVisible should visit visible nodes",
);
assert.ok(
  !visibleSeen.includes(hiddenNode),
  "traverseVisible should skip hidden nodes",
);

isPresenting = true;
assert.strictEqual(adapter.isXrPresenting(), true);
assert.strictEqual(
  adapter.getRenderCamera(),
  xrCamera,
  "getRenderCamera should substitute the XR camera while presenting",
);

drawingBufferSize = { x: 1, y: 1 };
session = {
  renderState: {
    baseLayer: { framebufferWidth: 2880, framebufferHeight: 2880 },
  },
};
assert.deepStrictEqual(
  adapter.getDrawingBufferSize(),
  { width: 2880, height: 2880 },
  "Apple Vision Pro 1x1 fallback should read framebuffer dims from XR baseLayer",
);

session = { renderState: { baseLayer: null } };
assert.deepStrictEqual(
  adapter.getDrawingBufferSize(),
  { width: 1, height: 1 },
  "Without a baseLayer the raw drawing buffer size is returned",
);

isPresenting = false;
drawingBufferSize = { x: 800, y: 600 };

let dynamicCamera: THREE.Camera | null = null;
const dynamicAdapter = new ThreeHostSceneAdapter({
  scene,
  camera: () => dynamicCamera,
  renderer: stubRenderer,
});
assert.strictEqual(dynamicAdapter.getActiveCamera(), null);
const swapped = new THREE.PerspectiveCamera();
dynamicCamera = swapped;
assert.strictEqual(
  dynamicAdapter.getActiveCamera(),
  swapped,
  "Function-valued camera source should be re-evaluated each call",
);

console.log("ThreeHostSceneAdapter tests passed");
