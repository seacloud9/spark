import type {
  Color4 as BabylonColor4,
  Layer as BabylonLayer,
  RawTexture as BabylonRawTexture,
  Scene as BabylonScene,
  Texture as BabylonTexture,
} from "@babylonjs/core";
import * as THREE from "three";
import { SparkRenderer, type SparkRendererOptions } from "../../SparkRenderer";
import { SparkBabylonMaterial } from "./SparkBabylonMaterial";
import { type BabylonMeshHost, SparkBabylonMesh } from "./SparkBabylonMesh";

export {
  registerSparkBabylonShaderChunks,
  type BabylonShaderChunkHost,
} from "./SparkBabylonShaderChunks";
export {
  SparkBabylonMaterial,
  type BabylonMaterialHost,
  type SparkBabylonMaterialOptions,
  SPARK_BABYLON_UNIFORMS,
  SPARK_BABYLON_SAMPLERS,
} from "./SparkBabylonMaterial";
export {
  SparkBabylonMesh,
  type BabylonMeshHost,
  type SparkBabylonMeshOptions,
} from "./SparkBabylonMesh";
export {
  SparkBabylonTextureBridge,
  type BabylonTextureBridgeHost,
  type SparkBabylonTextureBridgeOptions,
} from "./SparkBabylonTextureBridge";

/**
 * The Babylon entry points we need at runtime. Consumers pass these in
 * (typically by importing from "@babylonjs/core" themselves) so this file
 * does not become a hard runtime dependency on the babylon package.
 */
export interface BabylonLike {
  RawTexture: typeof BabylonRawTexture;
  Layer: typeof BabylonLayer;
  Engine: { TEXTUREFORMAT_RGBA: number };
  Texture: { NEAREST_SAMPLINGMODE: number };
  Color4: typeof BabylonColor4;
}

export type SparkBabylonHostMode = "texture" | "native";

export interface SparkBabylonHostOptions {
  babylon: BabylonLike;
  scene: BabylonScene;
  width: number;
  height: number;
  sparkRendererOptions?: Omit<SparkRendererOptions, "renderer">;
  /** RGB integer for the Three internal renderer clear colour (default 0x10151c). */
  clearColor?: number;
  /**
   * Rendering mode:
   * - `"texture"` (default): MVP texture-bridge. Spark renders to an
   *   offscreen Three canvas, the framebuffer is read back via
   *   `gl.readPixels`, and Babylon composites the result as a background
   *   `Layer`. Works everywhere; cannot let Babylon meshes occlude the
   *   splats.
   * - `"native"`: Phase D native material. Spark still runs on the
   *   internal Three triple, but its accumulator output textures
   *   (`ordering`, `extSplats`, `extSplats2`) are transferred per frame
   *   into a Babylon `ShaderMaterial` on a real `Mesh` inside Babylon's
   *   render pass — Babylon depth-sorts the splat mesh against the
   *   rest of the scene. Requires the host's `babylon` parameter to
   *   include the additional native-mode constructors (`ShaderMaterial`,
   *   `Mesh`, `VertexData`, `Matrix`, `Effect`, `RawTexture2DArray`,
   *   `Constants`); see {@link BabylonMeshHost}.
   *
   * @default "texture"
   */
  mode?: SparkBabylonHostMode;
  /**
   * Native-mode-only: the full Babylon constructor surface
   * ({@link BabylonMeshHost}) needed to build the native material,
   * mesh, and texture bridge. The host falls back to `babylon` for
   * texture-mode if this is omitted.
   *
   * Why a separate field rather than widening `babylon`: keeps the
   * texture-mode call site identical to the MVP, so consumers do not
   * have to import the extra Babylon symbols (`Effect`, `Mesh`,
   * `VertexData`, `RawTexture2DArray`, etc.) unless they opt in to
   * native mode.
   */
  babylonNative?: BabylonMeshHost;
}

export interface SparkBabylonCameraOptions {
  position: [number, number, number];
  lookAt?: [number, number, number];
  fov?: number;
  near?: number;
  far?: number;
}

/**
 * MVP Babylon host for Spark splats via a texture bridge.
 *
 * Architecture:
 *
 *   Babylon Scene
 *     └── background Layer
 *         └── RawTexture (1024x768 RGBA, updated each frame)
 *             ←─ readPixels(internal Three canvas)
 *                  ←─ Three.WebGLRenderer.render(threeScene, threeCamera)
 *                       ←─ SparkRenderer + SplatMesh on threeScene
 *
 * Each Babylon frame, `renderOnce()` drives Spark through one update +
 * render against the host's internal Three offscreen canvas, copies the
 * RGBA pixels back via WebGL `readPixels`, and pushes them to the
 * Babylon `RawTexture`. Babylon's render loop then composites the
 * texture as a fullscreen background `Layer`, so the visible Babylon
 * canvas ends up holding the splat image.
 *
 * This is not a full Babylon Spark backend — it does not let Babylon
 * meshes occlude or depth-sort against splats, and it costs a CPU-side
 * round-trip per frame. Those concerns are addressed in subsequent
 * iterations (custom Spark Babylon material). The point of this MVP is
 * to establish a real Babylon parity baseline for the per-backend
 * snapshot matrix described in AGENTS.md "Backend Visual Parity Goal".
 */
export class SparkBabylonHost {
  readonly mode: SparkBabylonHostMode;
  readonly threeRenderer: THREE.WebGLRenderer;
  readonly threeScene: THREE.Scene;
  readonly threeCamera: THREE.PerspectiveCamera;
  readonly sparkRenderer: SparkRenderer;

  /** Native-mode only: the Babylon mesh that draws splats inside Babylon's render pass. */
  readonly nativeMesh: SparkBabylonMesh | null = null;
  /** Native-mode only: the Babylon ShaderMaterial wrapping Spark's splat vertex/fragment. */
  readonly nativeMaterial: SparkBabylonMaterial | null = null;

  private readonly width: number;
  private readonly height: number;
  /** Texture-mode only. Null in native mode. */
  private readonly pixels: Uint8Array | null = null;
  /** Texture-mode only. Null in native mode. */
  private readonly texture: BabylonRawTexture | null = null;
  /** Texture-mode only. Null in native mode. */
  private readonly layer: BabylonLayer | null = null;
  private readonly hostCanvas: HTMLCanvasElement;

  constructor(options: SparkBabylonHostOptions) {
    this.mode = options.mode ?? "texture";
    this.width = options.width;
    this.height = options.height;

    this.hostCanvas = document.createElement("canvas");
    this.hostCanvas.width = this.width;
    this.hostCanvas.height = this.height;

    this.threeRenderer = new THREE.WebGLRenderer({
      canvas: this.hostCanvas,
      antialias: false,
      preserveDrawingBuffer: true,
    });
    this.threeRenderer.setSize(this.width, this.height, false);
    this.threeRenderer.setClearColor(options.clearColor ?? 0x10151c, 1);

    this.threeScene = new THREE.Scene();
    this.threeCamera = new THREE.PerspectiveCamera(
      45,
      this.width / this.height,
      0.01,
      10,
    );

    this.sparkRenderer = new SparkRenderer({
      renderer: this.threeRenderer,
      ...(options.sparkRendererOptions ?? {}),
    });
    this.threeScene.add(this.sparkRenderer);

    if (this.mode === "native") {
      const BN = options.babylonNative;
      if (!BN) {
        throw new Error(
          'SparkBabylonHost: mode "native" requires the `babylonNative` option ' +
            "(see BabylonMeshHost — pass the Babylon constructor surface from " +
            "@babylonjs/core).",
        );
      }
      this.nativeMaterial = new SparkBabylonMaterial({
        babylon: BN,
        scene: options.scene,
      });
      this.nativeMesh = new SparkBabylonMesh({
        babylon: BN,
        scene: options.scene,
        sparkRenderer: this.sparkRenderer,
        threeScene: this.threeScene,
        threeCamera: this.threeCamera,
        material: this.nativeMaterial,
      });
      return;
    }

    const B = options.babylon;
    this.pixels = new Uint8Array(this.width * this.height * 4);
    this.texture = new B.RawTexture(
      this.pixels,
      this.width,
      this.height,
      B.Engine.TEXTUREFORMAT_RGBA,
      options.scene,
      false,
      false,
      B.Texture.NEAREST_SAMPLINGMODE,
    );

    this.layer = new B.Layer(
      "spark-babylon-host",
      null,
      options.scene,
      true,
      new B.Color4(1, 1, 1, 1),
    );
    this.layer.texture = this.texture as unknown as BabylonTexture;
  }

  setCamera(opts: SparkBabylonCameraOptions): void {
    this.threeCamera.position.set(
      opts.position[0],
      opts.position[1],
      opts.position[2],
    );
    const lookAt = opts.lookAt ?? [0, 0, 0];
    this.threeCamera.lookAt(lookAt[0], lookAt[1], lookAt[2]);
    if (opts.fov !== undefined) {
      this.threeCamera.fov = opts.fov;
    }
    if (opts.near !== undefined) {
      this.threeCamera.near = opts.near;
    }
    if (opts.far !== undefined) {
      this.threeCamera.far = opts.far;
    }
    this.threeCamera.updateProjectionMatrix();
  }

  add(node: THREE.Object3D): void {
    this.threeScene.add(node);
  }

  remove(node: THREE.Object3D): void {
    this.threeScene.remove(node);
  }

  /**
   * Drive one Spark render and push the resulting pixels to the Babylon
   * texture (texture mode) or to the Babylon-side material samplers
   * (native mode). Call this in your Babylon `onBeforeRenderObservable`
   * or before each `scene.render()` to keep the displayed image current.
   */
  async renderOnce(): Promise<void> {
    if (this.mode === "native") {
      // Native mode: SparkBabylonMesh.syncOnce drives spark.update,
      // copies every uniform into the material, mirrors the ordering +
      // accumulator textures via the cross-context bridge, and sets
      // thinInstanceCount. Babylon's regular render loop then draws
      // the mesh inside the scene's pass — no readPixels.
      // biome-ignore lint/style/noNonNullAssertion: nativeMesh is non-null when mode === "native"
      await this.nativeMesh!.syncOnce();
      return;
    }

    await this.sparkRenderer.update({
      scene: this.threeScene,
      camera: this.threeCamera,
    });
    this.threeRenderer.render(this.threeScene, this.threeCamera);

    const gl = this.threeRenderer.getContext() as WebGL2RenderingContext;
    gl.bindBuffer(gl.PIXEL_PACK_BUFFER, null);
    gl.readPixels(
      0,
      0,
      this.width,
      this.height,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      // biome-ignore lint/style/noNonNullAssertion: pixels is non-null when mode === "texture"
      this.pixels!,
    );
    // biome-ignore lint/style/noNonNullAssertion: texture is non-null when mode === "texture"
    this.texture!.update(this.pixels!);
  }

  dispose(): void {
    if (this.mode === "native") {
      this.nativeMesh?.dispose();
      this.nativeMaterial?.dispose();
    } else {
      this.layer?.dispose();
      this.texture?.dispose();
    }
    this.threeRenderer.dispose();
  }
}
