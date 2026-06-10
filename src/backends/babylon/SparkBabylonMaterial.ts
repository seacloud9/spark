import type {
  Effect as BabylonEffect,
  Scene as BabylonScene,
  ShaderMaterial as BabylonShaderMaterial,
  IShaderMaterialOptions as BabylonShaderMaterialOptions,
} from "@babylonjs/core";
import { getShaders } from "../../shaders";
import {
  type BabylonShaderChunkHost,
  registerSparkBabylonShaderChunks,
} from "./SparkBabylonShaderChunks";

/**
 * Babylon constructors the material needs at runtime. Consumers pass these
 * in (typically by importing from "@babylonjs/core") so this module does not
 * become a hard runtime dependency on the babylon package — same pattern as
 * {@link BabylonLike} in `SparkBabylonHost.ts`.
 */
export interface BabylonMaterialHost extends BabylonShaderChunkHost {
  Effect: typeof BabylonEffect & {
    IncludesShadersStore: Record<string, string>;
    ShadersStore: Record<string, string>;
  };
  ShaderMaterial: new (
    name: string,
    scene: BabylonScene,
    shaderPath: string | { vertexSource: string; fragmentSource: string },
    options: Partial<BabylonShaderMaterialOptions>,
  ) => BabylonShaderMaterial;
}

export interface SparkBabylonMaterialOptions {
  babylon: BabylonMaterialHost;
  scene: BabylonScene;
  /**
   * Match Spark's premultiplied-alpha output. SparkRenderer defaults to
   * `premultipliedAlpha: true`; mirror that here so the fragment's
   * `PREMULTIPLIED_ALPHA` `#define` matches and the back-to-front composite
   * lines up with the texture-bridge baseline.
   * @default true
   */
  premultipliedAlpha?: boolean;
  /** Material name (default: "sparkSplat"). */
  name?: string;
}

/**
 * The list of uniforms the splat vertex/fragment expects, in the order
 * Babylon's `ShaderMaterial` should declare them. Anchored to the
 * inline uniform blocks in `src/shaders/splatVertex.glsl` and
 * `src/shaders/splatFragment.glsl` plus the implicit Three globals
 * (`projectionMatrix`, `isOrthographic`) that Three's ShaderMaterial
 * supplies automatically but Babylon does not.
 *
 * Per-frame sync of these from `SparkRenderer.uniforms.*` is wired in
 * `SparkBabylonMesh` (next Phase D step) so the material skeleton can
 * be reviewed as a self-contained shader-compile unit.
 */
export const SPARK_BABYLON_UNIFORMS = [
  // From SparkRenderer.makeUniforms() — see src/SparkRenderer.ts L623+.
  "renderSize",
  "near",
  "far",
  "renderToViewQuat",
  "renderToViewPos",
  "renderToViewBasis",
  "renderToViewOffset",
  "maxStdDev",
  "minPixelRadius",
  "maxPixelRadius",
  "minAlpha",
  "enable2DGS",
  "lodInflate",
  "preBlurAmount",
  "blurAmount",
  "focalDistance",
  "apertureAngle",
  "falloff",
  "clipXY",
  "focalAdjustment",
  "encodeLinear",
  "enableExtSplats",
  "enableCovSplats",
  "time",
  "deltaTime",
  "debugFlag",
  // Three.js supplies these automatically to ShaderMaterial; Babylon does not.
  // Drive them per-frame from the active Babylon camera in SparkBabylonMesh.
  "projectionMatrix",
  "isOrthographic",
] as const;

export const SPARK_BABYLON_SAMPLERS = [
  "ordering",
  "extSplats",
  "extSplats2",
] as const;

/**
 * Babylon-side counterpart of `SparkRenderer.material` (the Three.js
 * `ShaderMaterial` Spark uses on its `THREE.Mesh` subclass). This wraps
 * a `BABYLON.ShaderMaterial` compiled against the same splat vertex /
 * fragment source as Three, with the shader-chunk bridge in place so
 * `#include <splatDefines>` and the `logdepthbuf_pars_*` chunks resolve
 * inside Babylon's `Effect` preprocessor.
 *
 * This is the **Phase D skeleton** — it stands up the material, registers
 * the chunks, prepends `#version 300 es` and the optional
 * `PREMULTIPLIED_ALPHA` define, and declares the uniform/sampler/attribute
 * surface. Per-frame uniform + texture wiring from
 * `SparkRenderer.uniforms.*` lands in `SparkBabylonMesh` (next step).
 *
 * The texture-bridge MVP (`SparkBabylonHost` `mode: "texture"`, today's
 * default) keeps working unchanged. The native material path becomes
 * available via the host's forthcoming `mode: "native"` switch.
 */
export class SparkBabylonMaterial {
  readonly material: BabylonShaderMaterial;

  constructor(options: SparkBabylonMaterialOptions) {
    const B = options.babylon;
    const premultipliedAlpha = options.premultipliedAlpha ?? true;
    const name = options.name ?? "sparkSplat";

    registerSparkBabylonShaderChunks(B);

    const shaders = getShaders();
    const versionLine = "#version 300 es\n";
    const premultiplyDefine = premultipliedAlpha
      ? "#define PREMULTIPLIED_ALPHA\n"
      : "";

    // Three's ShaderMaterial prepends `#version 300 es` when
    // `glslVersion: THREE.GLSL3` is set; Babylon does not. Prepend it
    // explicitly so the `in/out/usampler2D/texelFetch` GLSL ES 3.00
    // surface compiles. The PREMULTIPLIED_ALPHA define mirrors Three's
    // `premultipliedAlpha: true` ShaderMaterial flag (toggled by the
    // `premultipliedAlpha` option on this class).
    const vertexSource = versionLine + premultiplyDefine + shaders.splatVertex;
    const fragmentSource =
      versionLine + premultiplyDefine + shaders.splatFragment;

    this.material = new B.ShaderMaterial(
      name,
      options.scene,
      { vertexSource, fragmentSource },
      {
        attributes: ["position"],
        uniforms: [...SPARK_BABYLON_UNIFORMS],
        samplers: [...SPARK_BABYLON_SAMPLERS],
        needAlphaBlending: true,
        needAlphaTesting: false,
      },
    );
  }

  dispose(): void {
    this.material.dispose();
  }
}
