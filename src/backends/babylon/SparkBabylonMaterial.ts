import type {
  Constants as BabylonConstants,
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
  Constants: Pick<
    typeof BabylonConstants,
    | "ALPHA_COMBINE"
    | "TEXTUREFORMAT_RGBA_INTEGER"
    | "TEXTURETYPE_UNSIGNED_INTEGER"
    | "TEXTURE_NEAREST_SAMPLINGMODE"
  >;
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

    // Three's ShaderMaterial auto-injects three things Babylon does not:
    //   1. `#version 300 es` (Three sets this from `glslVersion: GLSL3`).
    //   2. `in vec3 position;` — the standard mesh attribute.
    //   3. `uniform mat4 projectionMatrix;` + the rest of Three's
    //      automatic camera uniforms (we only reference projectionMatrix
    //      and the isOrthographic boolean that Three derives from the
    //      camera type — Spark's mesh code drives both manually from
    //      the Three camera each frame, so they are passed as user
    //      uniforms here).
    // Babylon's GLSL ES 3.00 compiler also requires explicit precision
    // for every sampler-with-precision-implication type. The shader
    // file declares `precision highp usampler2DArray` but Babylon's
    // preprocessor still flags `usampler2D ordering` and `sampler2D`
    // (logdepthbuf includes) without their own precision lines.
    const vertexPreamble = `${versionLine}${premultiplyDefine}precision highp usampler2D;
precision highp sampler2D;
in vec3 position;
uniform mat4 projectionMatrix;
uniform bool isOrthographic;
`;
    const fragmentPreamble = `${versionLine}${premultiplyDefine}precision highp sampler2D;
`;
    const vertexSource = vertexPreamble + shaders.splatVertex;
    const fragmentSource = fragmentPreamble + shaders.splatFragment;

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
    // Match Spark's Three ShaderMaterial defaults:
    // - depthTest: true (Babylon default — leave alone)
    // - depthWrite: false (Spark splats are transparent — first-draw
    //   would otherwise lock the depth and cull later back-to-front
    //   splats; Babylon defaults to true so we disable explicitly)
    // - side: DoubleSide / backFaceCulling: false (Spark's quad faces
    //   either way depending on per-instance rotation)
    // - alphaMode: ALPHA_COMBINE matches Three's standard transparent
    //   blend; the splat fragment emits `vec4(rgb*a, a)` (premultiplied)
    //   when PREMULTIPLIED_ALPHA is defined, which composites correctly
    //   under either ALPHA_COMBINE or ALPHA_PREMULTIPLIED on Babylon
    //   because the source factor on the premultiplied output already
    //   bakes the alpha multiply. ALPHA_COMBINE is the safe default
    //   since it matches what Three's transparent ShaderMaterial uses.
    // - alpha < 1 forces Babylon's `needAlphaBlendingForMesh` heuristic
    //   to keep the blend path on even if the `needAlphaBlending`
    //   constructor flag is ignored on some pipelines.
    this.material.disableDepthWrite = true;
    this.material.backFaceCulling = false;
    this.material.alphaMode = B.Constants.ALPHA_COMBINE;
    this.material.alpha = 0.999;
  }

  dispose(): void {
    this.material.dispose();
  }
}
