import assert from "node:assert";
import * as THREE from "three";
import { SplatEdit } from "../src/SplatEdit.js";
import { SplatGenerator } from "../src/SplatGenerator.js";
import { collectThreeSparkScene } from "../src/backends/three/ThreeSceneQuery.js";

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera();
camera.layers.set(0);

const visibleGenerator = new SplatGenerator({ numSplats: 1 });
scene.add(visibleGenerator);

const hiddenGenerator = new SplatGenerator({ numSplats: 2 });
hiddenGenerator.visible = false;
scene.add(hiddenGenerator);

const otherLayerGenerator = new SplatGenerator({ numSplats: 3 });
otherLayerGenerator.layers.set(1);
scene.add(otherLayerGenerator);

const globalEdit = new SplatEdit();
scene.add(globalEdit);

const hiddenGlobalEdit = new SplatEdit();
hiddenGlobalEdit.visible = false;
scene.add(hiddenGlobalEdit);

const meshParent = new THREE.Object3D();
const localEdit = new SplatEdit();
meshParent.add(localEdit);
scene.add(meshParent);

const query = collectThreeSparkScene({
  scene,
  camera,
  isSplatMesh: (object) => object === meshParent,
});

assert.deepStrictEqual(
  query.allGenerators,
  [visibleGenerator, hiddenGenerator],
  "allGenerators should include camera-visible layers, even hidden objects",
);
assert.deepStrictEqual(
  query.visibleGenerators,
  [visibleGenerator],
  "visibleGenerators should include only visible objects on camera-visible layers",
);
assert.deepStrictEqual(
  query.globalEdits,
  [globalEdit],
  "globalEdits should include visible SplatEdit objects outside SplatMesh ancestors",
);

console.log("ThreeSceneQuery tests passed");
