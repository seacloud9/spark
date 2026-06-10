import type {
  Matrix as BabylonMatrix,
  Mesh as BabylonMesh,
  Scene as BabylonScene,
  VertexData as BabylonVertexData,
  Observer,
} from "@babylonjs/core";
import type * as THREE from "three";
import type { SparkRenderer } from "../../SparkRenderer";
import type {
  BabylonMaterialHost,
  SparkBabylonMaterial,
} from "./SparkBabylonMaterial";
import {
  type BabylonTextureBridgeHost,
  SparkBabylonTextureBridge,
} from "./SparkBabylonTextureBridge";

/**
 * Babylon constructors the mesh needs at runtime. Extends
 * {@link BabylonMaterialHost} so the mesh can be constructed against a
 * single host object shared with its material.
 */
export interface BabylonMeshHost
  extends BabylonMaterialHost,
    BabylonTextureBridgeHost {
  Mesh: new (name: string, scene: BabylonScene) => BabylonMesh;
  VertexData: new () => BabylonVertexData;
  Matrix: {
    Identity(): BabylonMatrix;
    FromArray(array: ArrayLike<number>): BabylonMatrix;
  };
}

export interface SparkBabylonMeshOptions {
  babylon: BabylonMeshHost;
  scene: BabylonScene;
  /**
   * The SparkRenderer driving the splats. Lives on the Three side
   * (Spark's pipeline runs internally on a Three offscreen renderer
   * even in Babylon native mode — see PHASE-D-DESIGN.md "Option A").
   * The mesh consumes its per-frame uniform values and accumulator
   * textures.
   */
  sparkRenderer: SparkRenderer;
  /** Three scene driving spark.update each frame. */
  threeScene: THREE.Scene;
  /**
   * Three camera driving spark.update each frame. Its projection matrix
   * is mirrored into the Babylon material's `projectionMatrix` uniform
   * so the per-splat math (clipCenter, ndcOffset, focal) lines up with
   * the camera Spark just sorted against.
   */
  threeCamera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
  /**
   * SparkBabylonMaterial whose uniforms get driven each frame. Must
   * already be constructed against the same Babylon scene.
   */
  material: SparkBabylonMaterial;
  /** Mesh name (default: "sparkSplatMesh"). */
  name?: string;
}

const QUAD_POSITIONS = new Float32Array([
  -1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0,
]);
const QUAD_INDICES = new Uint32Array([0, 1, 2, 0, 2, 3]);
const IDENTITY_MATRIX_ROW = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/**
 * Build a Float32Array of `count` identity 4x4 matrices, packed contiguously.
 * Babylon's thin-instance API requires one matrix per instance in the
 * matrix buffer even when the shader does not use it — `thinInstanceCount`
 * is clamped to `matrixBuffer.length / 16`. Spark's vertex shader writes
 * `gl_Position` entirely from accumulator + uniform data, so the matrix
 * values themselves are inert; only the buffer size matters.
 */
function identityMatrixBuffer(count: number): Float32Array {
  const buf = new Float32Array(count * 16);
  for (let i = 0; i < count; i++) {
    buf.set(IDENTITY_MATRIX_ROW, i * 16);
  }
  return buf;
}

/**
 * Babylon-side counterpart of `SparkRenderer` (Spark's `THREE.Mesh`
 * subclass on Three). Owns a `BABYLON.Mesh` with the same quad geometry
 * Spark uses (`SplatGeometry` — 4 vertices, 2 triangles, instance-
 * driven), backed by a `SparkBabylonMaterial`. Per-frame, drives
 * `spark.update()` against the Three scene/camera, copies every
 * `SparkRenderer.uniforms.*` value into the material via the matching
 * `setFloat / setVector* / setMatrix* / setInt` setter, and updates
 * `thinInstanceCount` to `spark.activeSplats` so Babylon's draw call
 * issues the right number of instances.
 *
 * **Phase D step 3 — uniform sync only.** The three accumulator-output
 * samplers (`ordering`, `extSplats`, `extSplats2`) remain unbound; the
 * shader's `texelFetch` returns zeroed packed data and the splat-decode
 * paths early-return on `all(equal(scales, vec3(0.0)))`. The mesh will
 * draw zero splats until the cross-context texture bridge lands in
 * Phase D step 4. The pipeline IS connected end to end — spark.update
 * fires each Babylon frame, all uniforms sync, draw call issues — this
 * commit is the smoke surface for that wiring.
 *
 * Notes on Three ↔ Babylon mapping decisions:
 * - `IVector{2,3,4}Like` is structural in Babylon, so Three's
 *   `Vector2/3/4` flow straight through `setVector*` without copies.
 * - Babylon's ShaderMaterial has no `setBool`; GLSL `uniform bool` maps
 *   to int 0/1 on the GPU, so `setInt(name, v ? 1 : 0)` is the right
 *   wire for every boolean uniform.
 * - `THREE.Quaternion` has the same `(x,y,z,w)` layout as Babylon's
 *   `IVector4Like`, so `setVector4` is the right shape for
 *   `renderToViewQuat`.
 * - `THREE.Matrix3.elements` is a `Float32Array` in column-major,
 *   matching Babylon's `setMatrix3x3` contract.
 * - `projectionMatrix` is driven from the Three camera (not the
 *   Babylon camera): Spark's per-splat math projects with this
 *   matrix, and the splats were already sorted against the Three
 *   camera by `spark.update`. The host (Phase D step 5) keeps the
 *   Babylon camera and the Three camera in sync so the rendered
 *   output composites correctly.
 */
export class SparkBabylonMesh {
  readonly mesh: BabylonMesh;

  private readonly sparkRenderer: SparkRenderer;
  private readonly threeScene: THREE.Scene;
  private readonly threeCamera:
    | THREE.PerspectiveCamera
    | THREE.OrthographicCamera;
  private readonly material: SparkBabylonMaterial;
  private readonly textureBridge: SparkBabylonTextureBridge;
  private readonly projectionMatrixScratch: BabylonMatrix;

  private observer: Observer<BabylonScene> | null = null;
  private matrixBufferCapacity = 0;

  constructor(options: SparkBabylonMeshOptions) {
    const B = options.babylon;
    this.sparkRenderer = options.sparkRenderer;
    this.threeScene = options.threeScene;
    this.threeCamera = options.threeCamera;
    this.material = options.material;
    this.textureBridge = new SparkBabylonTextureBridge({
      babylon: B,
      scene: options.scene,
      sparkRenderer: options.sparkRenderer,
    });

    this.mesh = new B.Mesh(options.name ?? "sparkSplatMesh", options.scene);

    const vertexData = new B.VertexData();
    vertexData.positions = QUAD_POSITIONS;
    vertexData.indices = QUAD_INDICES;
    vertexData.applyToMesh(this.mesh, false);

    // Matrix buffer sized to the active instance count each frame.
    // Babylon clamps `thinInstanceCount` to `matrixBuffer.length / 16`
    // even when the vertex shader does not use the matrix attribute,
    // so the buffer must grow as `spark.activeSplats` grows.
    // `ensureInstanceCapacity` reallocates with identity matrices when
    // the count exceeds current capacity; the values themselves are
    // unused (Spark's shader writes gl_Position entirely from
    // accumulator + uniform data). Start with a small placeholder so
    // the first attach call has a valid buffer to work with.
    this.ensureInstanceCapacity(1);
    this.mesh.thinInstanceCount = 0;

    this.mesh.material = this.material.material;
    // Spark's splat shader culls per-instance via the early returns in
    // the vertex shader; Babylon frustum culling would cull the parent
    // quad based on its tiny bounds and skip the draw entirely.
    this.mesh.alwaysSelectAsActiveMesh = true;

    this.projectionMatrixScratch = B.Matrix.Identity();
  }

  /**
   * Attach this mesh's per-frame sync to a Babylon scene's
   * `onBeforeRenderObservable`. The host (Phase D step 5) wires this
   * for native mode; tests can call it directly.
   */
  attach(scene: BabylonScene): void {
    this.detach();
    this.observer = scene.onBeforeRenderObservable.add(() => {
      void this.syncOnce();
    });
  }

  detach(): void {
    if (this.observer) {
      this.observer.remove();
      this.observer = null;
    }
  }

  /**
   * Drive one Spark update + uniform/instance-count sync. Async because
   * SparkRenderer's update returns a Promise (LoD fetch settle). The
   * texture-bridge MVP's `renderOnce` is similarly async.
   *
   * Splat sampler textures (`ordering`, `extSplats`, `extSplats2`)
   * remain unbound — see class docstring. Phase D step 4 lands the
   * cross-context texture bridge.
   */
  async syncOnce(): Promise<void> {
    await this.sparkRenderer.update({
      scene: this.threeScene,
      camera: this.threeCamera,
    });
    // Native mode never calls `threeRenderer.render(scene, camera)` —
    // Babylon owns the visible draw pass. That means:
    //   1. SparkRenderer.onBeforeRender (the hook Three fires per
    //      render that populates renderToView{Quat,Pos,Basis} from
    //      the camera matrix, renderSize, near/far, and every other
    //      per-frame uniform) NEVER FIRES. Without this every uniform
    //      stays at its makeUniforms default — the splat shader sees
    //      renderToViewPos = (0,0,0) and projects every splat behind
    //      the camera. Invoke it manually here.
    //   2. SparkRenderer's `driveSort` (SparkRenderer.ts L548) expects
    //      `renderer.properties.get(orderingTexture).__webglTexture`
    //      to exist on its second-and-later sort, which Three only
    //      lazily allocates when the texture is bound during a render.
    //      Force the upload via `initTexture`.
    // Both calls are no-ops in texture mode (which IS rendering through
    // Three), so they can stay here for the shared host path.
    this.sparkRenderer.onBeforeRender(
      this.sparkRenderer.renderer,
      this.threeScene,
      this.threeCamera,
    );
    if (this.sparkRenderer.orderingTexture) {
      this.sparkRenderer.renderer.initTexture(
        this.sparkRenderer.orderingTexture,
      );
    }
    // Mirror the Three-side ordering + accumulator textures onto the
    // Babylon-side material samplers. See SparkBabylonTextureBridge
    // for the Three→Babylon transfer details (GPU readback via private
    // framebuffer for both ordering and the MRT extSplats pair).
    this.textureBridge.syncOnce();
    this.bindBridgeTextures();
    this.syncUniforms();
    const activeSplats = this.sparkRenderer.activeSplats;
    this.ensureInstanceCapacity(activeSplats);
    this.mesh.thinInstanceCount = activeSplats;
  }

  private ensureInstanceCapacity(count: number): void {
    if (count <= this.matrixBufferCapacity) {
      return;
    }
    // Double the capacity on growth to amortize the realloc cost across
    // multiple frames during the first-load splat ramp-up.
    const nextCapacity = Math.max(count, this.matrixBufferCapacity * 2, 1);
    this.mesh.thinInstanceSetBuffer(
      "matrix",
      identityMatrixBuffer(nextCapacity),
      16,
      true,
    );
    this.matrixBufferCapacity = nextCapacity;
  }

  private bindBridgeTextures(): void {
    const m = this.material.material;
    const ordering = this.textureBridge.orderingTexture;
    const extSplats = this.textureBridge.extSplatsTexture;
    const extSplats2 = this.textureBridge.extSplats2Texture;
    if (ordering) {
      m.setTexture("ordering", ordering);
    }
    if (extSplats) {
      m.setTexture("extSplats", extSplats);
    }
    if (extSplats2) {
      m.setTexture("extSplats2", extSplats2);
    }
  }

  private syncUniforms(): void {
    const spark = this.sparkRenderer;
    const u = spark.uniforms;
    const m = this.material.material;

    m.setVector2("renderSize", u.renderSize.value);
    m.setFloat("near", u.near.value);
    m.setFloat("far", u.far.value);
    // renderToViewQuat is a THREE.Quaternion with (x,y,z,w) — same
    // structural shape Babylon's setVector4 accepts.
    m.setVector4("renderToViewQuat", u.renderToViewQuat.value);
    m.setVector3("renderToViewPos", u.renderToViewPos.value);
    m.setMatrix3x3("renderToViewBasis", u.renderToViewBasis.value.elements);
    m.setVector3("renderToViewOffset", u.renderToViewOffset.value);
    m.setFloat("maxStdDev", u.maxStdDev.value);
    m.setFloat("minPixelRadius", u.minPixelRadius.value);
    m.setFloat("maxPixelRadius", u.maxPixelRadius.value);
    m.setFloat("minAlpha", u.minAlpha.value);
    m.setInt("enable2DGS", u.enable2DGS.value ? 1 : 0);
    m.setInt("lodInflate", u.lodInflate.value ? 1 : 0);
    m.setFloat("preBlurAmount", u.preBlurAmount.value);
    m.setFloat("blurAmount", u.blurAmount.value);
    m.setFloat("focalDistance", u.focalDistance.value);
    m.setFloat("apertureAngle", u.apertureAngle.value);
    m.setFloat("falloff", u.falloff.value);
    m.setFloat("clipXY", u.clipXY.value);
    m.setFloat("focalAdjustment", u.focalAdjustment.value);
    m.setInt("encodeLinear", u.encodeLinear.value ? 1 : 0);
    m.setInt("enableExtSplats", u.enableExtSplats.value ? 1 : 0);
    m.setInt("enableCovSplats", u.enableCovSplats.value ? 1 : 0);
    m.setFloat("time", u.time.value);
    m.setFloat("deltaTime", u.deltaTime.value);
    m.setInt("debugFlag", u.debugFlag.value ? 1 : 0);

    // Three's ShaderMaterial supplies projectionMatrix automatically.
    // Babylon does not; copy it from the Three camera (the camera
    // Spark just sorted against) so the per-splat clip/NDC math
    // lines up.
    this.threeCamera.updateProjectionMatrix();
    this.projectionMatrixScratch.fromArray(
      this.threeCamera.projectionMatrix.elements,
    );
    m.setMatrix("projectionMatrix", this.projectionMatrixScratch);

    // isOrthographic is implied by camera type — Three's
    // OrthographicCamera vs PerspectiveCamera. The boolean uniform
    // (used in splatVertex for the Jacobian branch) needs to track
    // which camera Spark sorted against.
    const isOrtho =
      (this.threeCamera as THREE.OrthographicCamera).isOrthographicCamera ===
      true;
    m.setInt("isOrthographic", isOrtho ? 1 : 0);
  }

  dispose(): void {
    this.detach();
    this.textureBridge.dispose();
    this.mesh.dispose();
  }
}
