import type { SparkSplatLoadOptions } from "../loading";
import type { SparkBackendCapabilities } from "../types";

export const babylonSparkCapabilities: SparkBackendCapabilities = {
  sceneTraversal: false,
  pngStillCapture: false,
  glesConformance: false,
};

export interface BabylonSparkLoadRequest {
  load: SparkSplatLoadOptions;
}

export function createBabylonSparkLoadRequest(
  load: SparkSplatLoadOptions,
): BabylonSparkLoadRequest {
  return { load: { ...load } };
}
