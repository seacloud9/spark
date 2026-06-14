import type * as THREE from "three";
import { SplatEdit } from "../../SplatEdit";
import { SplatGenerator } from "../../SplatGenerator";

export interface ThreeSparkSceneQuery {
  allGenerators: SplatGenerator[];
  visibleGenerators: SplatGenerator[];
  globalEdits: SplatEdit[];
}

export function canCameraSeeObject({
  camera,
  object,
}: {
  camera: THREE.Camera;
  object: THREE.Object3D;
}) {
  return !camera.layers || camera.layers.test(object.layers);
}

export function collectThreeSparkScene({
  scene,
  camera,
  isSplatMesh,
}: {
  scene: THREE.Scene;
  camera: THREE.Camera;
  isSplatMesh: (object: THREE.Object3D) => boolean;
}): ThreeSparkSceneQuery {
  const allGenerators: SplatGenerator[] = [];
  scene.traverse((node) => {
    if (
      node instanceof SplatGenerator &&
      canCameraSeeObject({ camera, object: node })
    ) {
      allGenerators.push(node);
    }
  });

  const globalEditsSet = new Set<SplatEdit>();
  scene.traverseVisible((node) => {
    if (node instanceof SplatEdit && isGlobalEdit({ node, isSplatMesh })) {
      globalEditsSet.add(node);
    }
  });

  const visibleGenerators: SplatGenerator[] = [];
  scene.traverseVisible((node) => {
    if (
      node instanceof SplatGenerator &&
      canCameraSeeObject({ camera, object: node })
    ) {
      visibleGenerators.push(node);
    }
  });

  return {
    allGenerators,
    visibleGenerators,
    globalEdits: Array.from(globalEditsSet),
  };
}

function isGlobalEdit({
  node,
  isSplatMesh,
}: {
  node: SplatEdit;
  isSplatMesh: (object: THREE.Object3D) => boolean;
}) {
  let ancestor = node.parent;
  while (ancestor != null && !isSplatMesh(ancestor)) {
    ancestor = ancestor.parent;
  }
  return ancestor == null;
}
