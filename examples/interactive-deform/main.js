import { SplatMesh, dyno } from "@sparkjsdev/spark";
import { GUI } from "lil-gui";
import * as THREE from "three";
import { getAssetFileURL } from "/examples/js/get-asset-url.js";
import { setupSparkExample } from "/examples/js/spark-engine.js";

const env = await setupSparkExample({
  cameraConfig: {
    fov: 60,
    near: 0.1,
    far: 1000,
    position: [0, 3, 5.5],
    lookAt: [0, 1, 0],
  },
});
const camera = env.camera;

let rotationAngle = 0;
let zoomDistance = 5.5;
const minZoom = 1;
const maxZoom = 20;
const rotationSpeed = 0.02;
const zoomSpeed = 0.1;

const keys = {};
window.addEventListener("keydown", (event) => {
  keys[event.key.toLowerCase()] = true;
});
window.addEventListener("keyup", (event) => {
  keys[event.key.toLowerCase()] = false;
});

// Dyno uniforms for drag and bounce effects
const dragPoint = dyno.dynoVec3(new THREE.Vector3(0, 0, 0));
const dragDisplacement = dyno.dynoVec3(new THREE.Vector3(0, 0, 0));
const dragRadius = dyno.dynoFloat(0.5);
const dragActive = dyno.dynoFloat(0.0);
const bounceTime = dyno.dynoFloat(0.0);
const bounceBaseDisplacement = dyno.dynoVec3(new THREE.Vector3(0, 0, 0));
const dragIntensity = dyno.dynoFloat(5.0);
const bounceAmount = dyno.dynoFloat(0.5);
const bounceSpeed = dyno.dynoFloat(0.5);
let isBouncing = false;

const gui = new GUI();
const guiParams = {
  intensity: dragIntensity.value,
  radius: 0.5,
  bounceAmount: 0.5,
  bounceSpeed: 0.5,
};
gui
  .add(guiParams, "intensity", 0, 10.0, 0.1)
  .name("Deformation Strength")
  .onChange((value) => {
    dragIntensity.value = value;
    if (splatMesh) {
      splatMesh.updateVersion();
    }
  });
gui
  .add(guiParams, "radius", 0.25, 1.0, 0.1)
  .name("Drag Radius")
  .onChange((value) => {
    dragRadius.value = value;
    if (splatMesh) {
      splatMesh.updateVersion();
    }
  });
gui
  .add(guiParams, "bounceAmount", 0, 1.0, 0.1)
  .name("Bounce Strength")
  .onChange((value) => {
    bounceAmount.value = value;
    if (splatMesh) {
      splatMesh.updateVersion();
    }
  });
gui
  .add(guiParams, "bounceSpeed", 0, 1.0, 0.01)
  .name("Bounce Speed")
  .onChange((value) => {
    bounceSpeed.value = value;
    if (splatMesh) {
      splatMesh.updateVersion();
    }
  });

let isDragging = false;
let dragStartPoint = null;
let currentDragPoint = null;
const raycaster = new THREE.Raycaster();
raycaster.params.Points = { threshold: 0.5 };

function createDragBounceDynoshader() {
  return dyno.dynoBlock(
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
          
          // Calculate influence based on distance from drag point
          float distToDrag = distance(originalPos, ${inputs.dragPoint});
          float dragInfluence = 1.0 - smoothstep(0.0, ${inputs.dragRadius}*2., distToDrag);
          float time = ${inputs.bounceTime};

          // Apply drag deformation
          if (${inputs.dragActive} > 0.5 && ${inputs.dragRadius} > 0.0) {
            vec3 dragOffset = ${inputs.dragDisplacement} * dragInfluence * ${inputs.dragIntensity} * 50.0;
            originalPos += dragOffset;
          }
          
          // Apply elastic bounce effect
          float bounceFrequency = 1.0 + ${inputs.bounceSpeed} * 8.0;
          vec3 bounceOffset = ${inputs.bounceBaseDisplacement} * dragInfluence * ${inputs.dragIntensity} * 50.0;
          originalPos += bounceOffset * cos(time*bounceFrequency) * exp(-time*2.0*(1.0-${inputs.bounceAmount}*.9));

          ${outputs.gsplat}.center = originalPos;
        `),
      });

      return {
        gsplat: shader.apply({
          gsplat,
          dragPoint: dragPoint,
          dragDisplacement: dragDisplacement,
          dragRadius: dragRadius,
          dragActive: dragActive,
          bounceTime: bounceTime,
          bounceBaseDisplacement: bounceBaseDisplacement,
          dragIntensity: dragIntensity,
          bounceAmount: bounceAmount,
          bounceSpeed: bounceSpeed,
        }).gsplat,
      };
    },
  );
}

let splatMesh = null;

async function loadSplat() {
  const splatURL = await getAssetFileURL("penguin.spz");
  splatMesh = new SplatMesh({ url: splatURL });
  splatMesh.quaternion.set(1, 0, 0, 0);
  splatMesh.position.set(0, 0, 0);
  env.add(splatMesh);

  await splatMesh.initialized;

  splatMesh.worldModifier = createDragBounceDynoshader();
  splatMesh.updateGenerator();

  // Interaction smoke gate: lets Playwright wait until the penguin is
  // clickable. Same pattern as raycasting / interactive-ripples.
  document.body.dataset.deformReady = "true";
}

loadSplat().catch((error) => {
  console.error("Error loading splat:", error);
});

// Convert mouse coordinates to normalized device coordinates.
// Uses env.canvas (the visible top-of-DOM canvas) so coords are accurate
// across engines — env.renderer.domElement is offscreen in babylon mode.
function getMouseNDC(event) {
  const rect = env.canvas.getBoundingClientRect();
  return new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
}

// Raycast to find intersection point on splat
function getHitPoint(ndc) {
  if (!splatMesh) return null;
  raycaster.setFromCamera(ndc, camera);
  const hits = raycaster.intersectObject(splatMesh, false);
  if (hits && hits.length > 0) {
    return hits[0].point.clone();
  }
  return null;
}

let dragStartNDC = null;
let dragScale = 1.0;

// Interaction smoke counters. Same dataset-flag template as
// raycasting / interactive-ripples / render-cube-depth.
let downCount = 0;
let moveCount = 0;
let upCount = 0;
let hitCount = 0;

env.canvas.addEventListener("pointerdown", (event) => {
  downCount += 1;
  document.body.dataset.deformDowns = String(downCount);

  if (!splatMesh) return;

  const ndc = getMouseNDC(event);
  const hitPoint = getHitPoint(ndc);

  if (hitPoint) {
    isDragging = true;
    dragStartNDC = ndc.clone();
    dragStartPoint = hitPoint.clone();
    currentDragPoint = hitPoint.clone();

    // Calculate scale factor for screen-to-world conversion
    const distanceToCamera = camera.position.distanceTo(hitPoint);
    const fov = camera.fov * (Math.PI / 180);
    const screenHeight = 2.0 * Math.tan(fov / 2.0) * distanceToCamera;
    dragScale = screenHeight / window.innerHeight;

    dragPoint.value.copy(hitPoint);
    dragActive.value = 1.0;
    dragRadius.value = guiParams.radius;
    dragDisplacement.value.set(0, 0, 0);

    bounceTime.value = -1.0;
    bounceBaseDisplacement.value.set(0, 0, 0);
    isBouncing = false;

    hitCount += 1;
    document.body.dataset.deformHits = String(hitCount);
    document.body.dataset.deformLastHitpoint = `${hitPoint.x.toFixed(3)},${hitPoint.y.toFixed(3)},${hitPoint.z.toFixed(3)}`;
  }
});

env.canvas.addEventListener("pointermove", (event) => {
  moveCount += 1;
  document.body.dataset.deformMoves = String(moveCount);

  if (!isDragging || !splatMesh || !dragStartPoint || !dragStartNDC) return;

  const ndc = getMouseNDC(event);

  // Convert screen space movement to world space
  const mouseDelta = new THREE.Vector2(
    (ndc.x - dragStartNDC.x) * dragScale,
    (ndc.y - dragStartNDC.y) * dragScale,
  );

  const cameraRight = new THREE.Vector3();
  const cameraUp = new THREE.Vector3();
  camera.getWorldDirection(new THREE.Vector3());
  cameraRight.setFromMatrixColumn(camera.matrixWorld, 0).normalize();
  cameraUp.setFromMatrixColumn(camera.matrixWorld, 1).normalize();

  const worldDisplacement = new THREE.Vector3()
    .addScaledVector(cameraRight, mouseDelta.x)
    .addScaledVector(cameraUp, mouseDelta.y);

  currentDragPoint = dragStartPoint.clone().add(worldDisplacement);
  dragDisplacement.value.copy(worldDisplacement);
});

env.canvas.addEventListener("pointerup", (event) => {
  upCount += 1;
  document.body.dataset.deformUps = String(upCount);

  if (!isDragging) return;

  isDragging = false;

  // Start bounce animation with final displacement
  if (currentDragPoint && dragStartPoint) {
    const finalDisplacement = currentDragPoint.clone().sub(dragStartPoint);
    bounceBaseDisplacement.value.copy(dragDisplacement.value);
    bounceTime.value = 0.0;
    isBouncing = true;
  }

  dragActive.value = 0.0;
  dragDisplacement.value.set(0, 0, 0);
  dragStartNDC = null;
});

env.run(() => {
  if (isBouncing) {
    bounceTime.value += 0.1;
    if (splatMesh) {
      splatMesh.updateVersion();
    }
  }

  if (keys.a) rotationAngle -= rotationSpeed;
  if (keys.d) rotationAngle += rotationSpeed;
  if (keys.w) zoomDistance = Math.max(minZoom, zoomDistance - zoomSpeed);
  if (keys.s) zoomDistance = Math.min(maxZoom, zoomDistance + zoomSpeed);

  camera.position.x = Math.sin(rotationAngle) * zoomDistance;
  camera.position.z = Math.cos(rotationAngle) * zoomDistance;
  camera.position.y = 3;
  camera.lookAt(0, 1.5, 0);

  if (splatMesh) {
    splatMesh.updateVersion();
  }
});
