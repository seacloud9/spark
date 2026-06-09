export type SparkBackendKind = "three" | "aframe" | "babylon";

export interface SparkBackendCapabilities {
  sceneTraversal: boolean;
  pngStillCapture: boolean;
  glesConformance: boolean;
}

export interface SparkPngStillCapture {
  mimeType: "image/png";
  width: number;
  height: number;
  data: Uint8Array;
}

export interface SparkGlesConformanceReport {
  backend: SparkBackendKind;
  webglVersion: 1 | 2;
  isConformant: boolean;
  requiredExtensions: Record<string, boolean>;
  limits: Record<string, number>;
  issues: string[];
}

export interface SparkFrameContext {
  nowSec: number;
  deltaSec: number;
  viewportWidth: number;
  viewportHeight: number;
  xrPresenting: boolean;
}

export interface SparkHostSceneAdapter<
  NodeHandle = unknown,
  CameraHandle = unknown,
  SceneHandle = unknown,
> {
  readonly backend: SparkBackendKind;
  getScene(): SceneHandle;
  getActiveCamera(): CameraHandle | null;
  getRenderCamera(): CameraHandle | null;
  getDrawingBufferSize(): { width: number; height: number };
  isXrPresenting(): boolean;
  traverseAll(visitor: (node: NodeHandle) => void): void;
  traverseVisible(visitor: (node: NodeHandle) => void): void;
}
