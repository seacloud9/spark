import type {
  Color4 as BabylonColor4,
  Layer as BabylonLayer,
  RawTexture as BabylonRawTexture,
  Scene as BabylonScene,
  Texture as BabylonTexture,
} from "@babylonjs/core";
import * as THREE from "three";
import { SparkRenderer, type SparkRendererOptions } from "../../SparkRenderer";

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

export interface SparkBabylonHostOptions {
  babylon: BabylonLike;
  scene: BabylonScene;
  width: number;
  height: number;
  sparkRendererOptions?: Omit<SparkRendererOptions, "renderer">;
  /** RGB integer for the Three internal renderer clear colour (default 0x10151c). */
  clearColor?: number;
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
  readonly threeRenderer: THREE.WebGLRenderer;
  readonly threeScene: THREE.Scene;
  readonly threeCamera: THREE.PerspectiveCamera;
  readonly sparkRenderer: SparkRenderer;

  private readonly width: number;
  private readonly height: number;
  private readonly pixels: Uint8Array;
  private readonly texture: BabylonRawTexture;
  private readonly layer: BabylonLayer;
  private readonly hostCanvas: HTMLCanvasElement;

  constructor(options: SparkBabylonHostOptions) {
    const B = options.babylon;
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
   * texture. Call this in your Babylon `onBeforeRenderObservable` or
   * before each `scene.render()` to keep the displayed image current.
   */
  async renderOnce(): Promise<void> {
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
      this.pixels,
    );
    this.texture.update(this.pixels);
  }

  dispose(): void {
    this.layer.dispose();
    this.texture.dispose();
    this.threeRenderer.dispose();
  }
}
