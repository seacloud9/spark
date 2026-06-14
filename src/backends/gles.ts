import type { SparkBackendKind, SparkGlesConformanceReport } from "./types";

export interface SparkGlesConformanceRequirement {
  name: string;
  parameter: number;
  minimum: number;
}

export const SPARK_GLES_REQUIRED_LIMITS: SparkGlesConformanceRequirement[] = [
  { name: "MAX_TEXTURE_SIZE", parameter: 0x0d33, minimum: 2048 },
  { name: "MAX_RENDERBUFFER_SIZE", parameter: 0x84e8, minimum: 2048 },
  { name: "MAX_ARRAY_TEXTURE_LAYERS", parameter: 0x88ff, minimum: 1 },
];

export const SPARK_GLES_OPTIONAL_EXTENSIONS = ["EXT_color_buffer_float"];

export function probeGlesConformance({
  backend,
  gl,
  requiredLimits = SPARK_GLES_REQUIRED_LIMITS,
  optionalExtensions = SPARK_GLES_OPTIONAL_EXTENSIONS,
}: {
  backend: SparkBackendKind;
  gl: WebGLRenderingContext | WebGL2RenderingContext;
  requiredLimits?: SparkGlesConformanceRequirement[];
  optionalExtensions?: string[];
}): SparkGlesConformanceReport {
  const webglVersion = isWebGl2(gl) ? 2 : 1;
  const limits: Record<string, number> = {};
  const requiredExtensions: Record<string, boolean> = {};
  const issues: string[] = [];

  if (webglVersion !== 2) {
    issues.push("Spark requires WebGL2 / GLES 3 class rendering support.");
  }

  for (const requirement of requiredLimits) {
    const value = Number(gl.getParameter(requirement.parameter) ?? 0);
    limits[requirement.name] = value;
    if (value < requirement.minimum) {
      issues.push(
        `${requirement.name} is ${value}; expected at least ${requirement.minimum}.`,
      );
    }
  }

  for (const extension of optionalExtensions) {
    const supported = gl.getExtension(extension) != null;
    requiredExtensions[extension] = supported;
  }

  return {
    backend,
    webglVersion,
    isConformant: issues.length === 0,
    requiredExtensions,
    limits,
    issues,
  };
}

function isWebGl2(
  gl: WebGLRenderingContext | WebGL2RenderingContext,
): gl is WebGL2RenderingContext {
  return typeof WebGL2RenderingContext !== "undefined"
    ? gl instanceof WebGL2RenderingContext
    : "texStorage3D" in gl;
}
