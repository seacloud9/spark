import { SplatMesh } from "../../SplatMesh";
import {
  type SparkSplatLoadOptions,
  normalizeSplatLoadOptions,
} from "../loading";

export function createThreeSplatMeshFromLoadOptions(
  options: SparkSplatLoadOptions,
): SplatMesh {
  return new SplatMesh(normalizeSplatLoadOptions(options));
}
