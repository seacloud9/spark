import * as THREE from "three";
import { getShaders } from "../../shaders";

/**
 * Structural surface for the Babylon side of the shader-chunk bridge.
 *
 * Babylon's ShaderMaterial resolves `#include<name>` directives against
 * `BABYLON.Effect.IncludesShadersStore`. SparkBabylonMaterial (Phase D)
 * lifts Spark's `#include <splatDefines>` and Three's
 * `#include <logdepthbuf_pars_vertex/fragment>` directives onto that store
 * so the same splat shader source compiles inside Babylon's render pass.
 *
 * Consumers pass `BABYLON` in (typically by importing from
 * "@babylonjs/core") so this file does not become a hard runtime
 * dependency on the babylon package — same pattern as
 * {@link AFrameLike} in `SparkAFrameIntegration.ts`.
 */
export interface BabylonShaderChunkHost {
  Effect: { IncludesShadersStore: Record<string, string> };
}

/**
 * Mirror Spark's shader chunks onto Babylon's
 * `Effect.IncludesShadersStore` so SparkBabylonMaterial's
 * `#include <splatDefines>` and the Three `logdepthbuf_pars_*` chunks
 * resolve when Babylon's `Effect` compiler walks the splat shader.
 *
 * Mirrors the {@link bridgeShaderChunks} pattern used for A-Frame:
 *
 * 1. Force-register Spark's splatDefines onto Spark's `THREE.ShaderChunk`
 *    via {@link getShaders}.
 * 2. Copy every string-valued entry of `THREE.ShaderChunk` onto Babylon's
 *    includes store, leaving existing Babylon entries untouched.
 *
 * Idempotent — calling twice is a no-op past the first pass. Safe to call
 * once on first `SparkBabylonMaterial` construction.
 */
export function registerSparkBabylonShaderChunks(
  babylon: BabylonShaderChunkHost,
): void {
  getShaders();
  const store = babylon.Effect.IncludesShadersStore;
  for (const [name, value] of Object.entries(THREE.ShaderChunk)) {
    if (typeof value === "string" && store[name] === undefined) {
      store[name] = value;
    }
  }
}
