import type { SparkSplatLoadOptions } from "../loading";
import { createThreeSplatMeshFromLoadOptions } from "../three/ThreeLoading";
import type { SparkBackendCapabilities } from "../types";

export const aframeSparkCapabilities: SparkBackendCapabilities = {
  sceneTraversal: true,
  pngStillCapture: true,
  glesConformance: true,
};

export function createAFrameThreeSplatMesh(options: SparkSplatLoadOptions) {
  return createThreeSplatMeshFromLoadOptions(options);
}
