import * as THREE from "three";
import type { SparkBackendKind, SparkHostSceneAdapter } from "../types";

export function getThreeRenderCamera(
  renderer: THREE.WebGLRenderer,
  fallback: THREE.Camera,
): THREE.Camera {
  if (renderer.xr.isPresenting) {
    const xrCamera = renderer.xr.getCamera();
    if (xrCamera) {
      return xrCamera;
    }
  }
  return fallback;
}

export function fillThreeDrawingBufferSize(
  renderer: THREE.WebGLRenderer,
  out: THREE.Vector2,
): THREE.Vector2 {
  renderer.getDrawingBufferSize(out);
  if (renderer.xr.isPresenting && out.x === 1 && out.y === 1) {
    // Apple Vision Pro returns 1x1 while presenting; use the XR baseLayer.
    const baseLayer = renderer.xr.getSession()?.renderState.baseLayer;
    if (baseLayer) {
      out.set(baseLayer.framebufferWidth, baseLayer.framebufferHeight);
    }
  }
  return out;
}

export interface ThreeHostSceneAdapterOptions {
  scene: THREE.Scene;
  camera: THREE.Camera | (() => THREE.Camera | null);
  renderer: THREE.WebGLRenderer;
}

export class ThreeHostSceneAdapter
  implements SparkHostSceneAdapter<THREE.Object3D, THREE.Camera, THREE.Scene>
{
  readonly backend: SparkBackendKind = "three";

  private readonly scene: THREE.Scene;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly cameraSource: () => THREE.Camera | null;
  private readonly sizeBuffer = new THREE.Vector2();

  constructor(options: ThreeHostSceneAdapterOptions) {
    this.scene = options.scene;
    this.renderer = options.renderer;
    this.cameraSource =
      typeof options.camera === "function"
        ? options.camera
        : () => options.camera as THREE.Camera;
  }

  getScene(): THREE.Scene {
    return this.scene;
  }

  getActiveCamera(): THREE.Camera | null {
    return this.cameraSource();
  }

  getRenderCamera(): THREE.Camera | null {
    const fallback = this.cameraSource();
    if (fallback == null) {
      return this.renderer.xr.isPresenting
        ? (this.renderer.xr.getCamera() ?? null)
        : null;
    }
    return getThreeRenderCamera(this.renderer, fallback);
  }

  getDrawingBufferSize(): { width: number; height: number } {
    fillThreeDrawingBufferSize(this.renderer, this.sizeBuffer);
    return { width: this.sizeBuffer.x, height: this.sizeBuffer.y };
  }

  isXrPresenting(): boolean {
    return this.renderer.xr.isPresenting;
  }

  traverseAll(visitor: (node: THREE.Object3D) => void): void {
    this.scene.traverse(visitor);
  }

  traverseVisible(visitor: (node: THREE.Object3D) => void): void {
    this.scene.traverseVisible(visitor);
  }
}
