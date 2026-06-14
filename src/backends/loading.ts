import type { PackedSplats } from "../PackedSplats";
import type { SplatMeshOptions } from "../SplatMesh";
import type { SplatFileType } from "../defines";

export interface SparkSplatLoadOptions {
  url?: string;
  fileBytes?: Uint8Array | ArrayBuffer;
  fileType?: SplatFileType;
  fileName?: string;
  stream?: ReadableStream;
  streamLength?: number;
  packedSplats?: PackedSplats;
  maxSplats?: number;
  constructSplats?: SplatMeshOptions["constructSplats"];
  onProgress?: SplatMeshOptions["onProgress"];
}

export function normalizeSplatLoadOptions(
  options: SparkSplatLoadOptions,
): SparkSplatLoadOptions {
  return { ...options };
}
