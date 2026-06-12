import { SparkControls, SplatMesh, dyno } from "@sparkjsdev/spark";
import * as THREE from "three";
import { getAssetFileURL } from "/examples/js/get-asset-url.js";
import { setupSparkExample } from "/examples/js/spark-engine.js";

const env = await setupSparkExample({
  cameraConfig: {
    fov: 50,
    near: 0.01,
    far: 2000,
    position: [0, 0, 3],
    lookAt: [0, 0, 0],
  },
  clearColor: 0x000000,
});

const controls = new SparkControls({ canvas: env.canvas });
controls.fpsMovement.enable = true;
controls.pointerControls.enable = true;

function passthroughDyno(timeUniform, hitpointUniform) {
  return dyno.dynoBlock(
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
}

const timeUniform = dyno.dynoFloat(0.0);
const hitpointUniform = dyno.dynoVec3(new THREE.Vector3(0, 0, 1000));

const splatURL = await getAssetFileURL("valley.spz");
const valley = new SplatMesh({ url: splatURL });
await valley.initialized;

valley.rotateX(Math.PI);

valley.objectModifier = passthroughDyno(timeUniform, hitpointUniform);
valley.updateGenerator();

env.add(valley);

const raycaster = new THREE.Raycaster();
raycaster.params.Points = { threshold: 1.0 };

let timeCounter = 0;

// Interaction smoke gates: clicks/hits counters + last hitpoint expose
// the pointer → raycast → uniform-update pipeline to Playwright. The
// hard gate the smoke test enforces is data-ripple-clicks (delivery),
// matching the raycasting / render-cube-depth template.
let clickCount = 0;
let hitCount = 0;

valley.initialized.then(() => {
  document.body.dataset.rippleReady = "true";
});

// Click events bind to env.canvas (the visible top-of-DOM canvas) so the
// raycast works regardless of whether we're on Three's renderer canvas or
// Babylon's engine canvas.
env.canvas.addEventListener("pointerdown", (event) => {
  clickCount += 1;
  document.body.dataset.rippleClicks = String(clickCount);

  const rect = env.canvas.getBoundingClientRect();
  const ndc = new THREE.Vector2(
    ((event.clientX - rect.left) / rect.width) * 2 - 1,
    -((event.clientY - rect.top) / rect.height) * 2 + 1,
  );
  raycaster.setFromCamera(ndc, env.camera);
  const hits = raycaster.intersectObject(valley, false);
  const hit = hits?.length ? hits[0] : null;

  if (!hit) {
    return;
  }

  const localPoint = valley.worldToLocal(hit.point.clone());
  hitpointUniform.value.copy(localPoint);
  timeCounter = 0;

  hitCount += 1;
  document.body.dataset.rippleHits = String(hitCount);
  document.body.dataset.rippleLastHitpoint = `${localPoint.x.toFixed(3)},${localPoint.y.toFixed(3)},${localPoint.z.toFixed(3)}`;
});

env.run(() => {
  timeCounter += 0.016;
  timeUniform.value = timeCounter;
  valley.updateVersion();
  controls.update(env.camera);
});
