import type {
  Constants as BabylonConstants,
  RawTexture as BabylonRawTexture,
  RawTexture2DArray as BabylonRawTexture2DArray,
  Scene as BabylonScene,
  Texture as BabylonTexture,
} from "@babylonjs/core";
import type * as THREE from "three";
import type { SparkRenderer } from "../../SparkRenderer";

/**
 * Babylon constructors the texture bridge needs at runtime. Consumers
 * pass these in from `@babylonjs/core` so this module stays runtime-
 * neutral on the babylon package.
 */
export interface BabylonTextureBridgeHost {
  RawTexture: typeof BabylonRawTexture & {
    CreateRGBAStorageTexture?: unknown;
  };
  RawTexture2DArray: typeof BabylonRawTexture2DArray;
  Constants: Pick<
    typeof BabylonConstants,
    | "ALPHA_COMBINE"
    | "ALPHA_PREMULTIPLIED"
    | "TEXTUREFORMAT_RGBA_INTEGER"
    | "TEXTURETYPE_UNSIGNED_INTEGER"
    | "TEXTURE_NEAREST_SAMPLINGMODE"
  >;
  Texture: { NEAREST_SAMPLINGMODE: number };
  Engine: { TEXTUREFORMAT_RGBA_INTEGER: number };
}

export interface SparkBabylonTextureBridgeOptions {
  babylon: BabylonTextureBridgeHost;
  scene: BabylonScene;
  /**
   * SparkRenderer whose accumulator and ordering textures are mirrored
   * onto the Babylon side each frame. The bridge does not own the
   * SparkRenderer — it just reads from it.
   */
  sparkRenderer: SparkRenderer;
}

interface ExtSplatsTextureState {
  texture: BabylonRawTexture2DArray;
  width: number;
  height: number;
  depth: number;
  /**
   * Flat scratch buffer reused each frame to hold all layers of one
   * texture-array slice before `update()`-ing the Babylon-side mirror.
   * Sized to `width * height * depth * 4` (RGBA32UI = 4 uint32 per
   * pixel). Reallocated only when the upstream Spark target grows.
   */
  scratch: Uint32Array;
}

interface OrderingTextureState {
  texture: BabylonRawTexture;
  width: number;
  height: number;
  /**
   * Flat scratch buffer reused each frame to hold the readback of the
   * Three ordering DataTexture from the GPU. Sized to
   * `width * height * 4` (RGBA32UI = 4 uint32 per pixel). Reallocated
   * only when the upstream Spark ordering texture grows.
   */
  scratch: Uint32Array;
}

/**
 * Cross-context texture bridge for the Babylon native splat material.
 *
 * The splat shader reads three integer samplers each frame:
 * - `ordering` — `usampler2D`, RGBA32UI, sized `4096 × rows`. Lives on
 *   the Three side as `spark.orderingTexture` (a `THREE.DataTexture`
 *   whose backing `Uint32Array` IS the CPU-side source of truth — Spark
 *   uploads from it via `needsUpdate = true` each frame). The Babylon
 *   side just mirrors the same `Uint32Array` into a `RawTexture` of
 *   matching integer format.
 * - `extSplats`, `extSplats2` — `usampler2DArray`, RGBA32UI, sized
 *   `width × height × depth`. Live on the Three side as the two color
 *   attachments of a `WebGLArrayRenderTarget` (Spark's MRT splat
 *   generator output). These are GPU-only — there is no CPU-side
 *   buffer. The bridge calls `threeRenderer.readRenderTargetPixels`
 *   per layer per MRT slot to pull the pixels back, packs them into
 *   a flat `Uint32Array`, then `update()`s a Babylon
 *   `RawTexture2DArray` mirror.
 *
 * Cost: for typical scenes (≤4M splats, depth=1) the per-frame readback
 * is roughly `2 × width × height × 16` bytes — for a 2048×74 hello-world
 * spz that is ~5 MB / frame, which the JIT path handles inside a
 * Babylon render-loop tick on commodity hardware. For larger scenes
 * (multi-layer, full 2048³ texture) the readback dominates frame time;
 * Phase D Option B (shared GL context via `THREE.WebGLRenderer({
 * context: engine._gl })`) eliminates this cost and is the planned
 * follow-up once multi-pass Tier 6 scenes need it.
 *
 * Spark grows its accumulator on demand. When `width/height/depth` of
 * the upstream Spark target change between frames, the bridge re-
 * creates the Babylon-side mirror with new dimensions (Babylon's
 * `RawTexture.update` requires same-size input). Scratch buffers grow
 * with the mirror.
 */
export class SparkBabylonTextureBridge {
  private readonly babylon: BabylonTextureBridgeHost;
  private readonly scene: BabylonScene;
  private readonly sparkRenderer: SparkRenderer;

  private ordering: OrderingTextureState | null = null;
  private extSplats: ExtSplatsTextureState | null = null;
  private extSplats2: ExtSplatsTextureState | null = null;

  constructor(options: SparkBabylonTextureBridgeOptions) {
    this.babylon = options.babylon;
    this.scene = options.scene;
    this.sparkRenderer = options.sparkRenderer;
  }

  /**
   * Mirror this frame's Three-side ordering + accumulator textures
   * onto the Babylon-side `RawTexture` + `RawTexture2DArray`s. Safe to
   * call before any splats have been generated — when Spark's
   * accumulator target is still null, the bridge keeps its mirrors at
   * the empty 1×1 placeholder and the splat shader's `enableExtSplats`
   * guard short-circuits the per-splat decode.
   */
  syncOnce(): void {
    this.syncOrdering();
    this.syncExtSplats();
  }

  /**
   * Babylon-side mirrors, ready to plug into a `SparkBabylonMaterial`
   * via `setTexture("ordering" | "extSplats" | "extSplats2", ...)`.
   * Each getter returns `null` until the first `syncOnce()` allocates
   * the mirror; the host's `attach` path ensures sync is called before
   * the first render so the material always sees real bindings.
   */
  get orderingTexture(): BabylonTexture | null {
    return this.ordering?.texture ?? null;
  }
  get extSplatsTexture(): BabylonTexture | null {
    return this.extSplats?.texture ?? null;
  }
  get extSplats2Texture(): BabylonTexture | null {
    return this.extSplats2?.texture ?? null;
  }

  private syncOrdering(): void {
    const orderingTex = this.sparkRenderer.orderingTexture;
    if (!orderingTex) {
      return;
    }
    const width = orderingTex.image.width;
    const height = orderingTex.image.height;
    const pixelCount = width * height * 4;

    // The Three.DataTexture's `image.data` Uint32Array is the buffer
    // Spark used when it FIRST constructed the texture; SparkRenderer
    // subsequently writes updated sort results directly to the GPU via
    // `gl.texSubImage2D` (SparkRenderer.ts L1080-1097) without
    // refreshing this CPU mirror. Reading `image.data` therefore gets
    // a stale first-frame snapshot. Read straight from the GPU
    // instead, mirroring the extSplats GPU-readback path.
    let scratch: Uint32Array;
    if (
      this.ordering &&
      this.ordering.width === width &&
      this.ordering.height === height
    ) {
      scratch = this.ordering.scratch;
    } else {
      scratch = new Uint32Array(pixelCount);
    }
    this.gpuReadOrderingTexture(orderingTex, width, height, scratch);

    const B = this.babylon;
    if (
      !this.ordering ||
      this.ordering.width !== width ||
      this.ordering.height !== height
    ) {
      this.ordering?.texture.dispose();
      const texture = new B.RawTexture(
        scratch,
        width,
        height,
        B.Engine.TEXTUREFORMAT_RGBA_INTEGER,
        this.scene,
        false,
        false,
        B.Texture.NEAREST_SAMPLINGMODE,
        B.Constants.TEXTURETYPE_UNSIGNED_INTEGER,
      );
      this.ordering = { texture, width, height, scratch };
    } else {
      this.ordering.texture.update(scratch);
    }
  }

  /**
   * Read the current contents of Spark's ordering DataTexture from the
   * GPU via a private framebuffer. Mirrors the extSplats path but uses
   * `framebufferTexture2D` (regular 2D texture) instead of
   * `framebufferTextureLayer` (texture array layer).
   */
  private gpuReadOrderingTexture(
    orderingTex: THREE.DataTexture,
    width: number,
    height: number,
    scratch: Uint32Array,
  ): void {
    const threeRenderer = this.sparkRenderer.renderer;
    const gl = threeRenderer.getContext() as WebGL2RenderingContext;
    const texProps = threeRenderer.properties.get(orderingTex) as
      | { __webglTexture?: WebGLTexture }
      | undefined;
    const webglTexture = texProps?.__webglTexture;
    if (!webglTexture) {
      return;
    }

    const prevReadFb = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
    if (!this.readFramebuffer) {
      this.readFramebuffer = gl.createFramebuffer();
    }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.readFramebuffer);
    gl.framebufferTexture2D(
      gl.READ_FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      webglTexture,
      0,
    );
    gl.readPixels(
      0,
      0,
      width,
      height,
      gl.RGBA_INTEGER,
      gl.UNSIGNED_INT,
      scratch,
    );
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prevReadFb);
  }

  private syncExtSplats(): void {
    const target = this.sparkRenderer.display.target;
    if (!target) {
      return;
    }
    const width = target.width;
    const height = target.height;
    const depth = target.depth;
    this.extSplats = this.syncExtSplatsLayer(
      this.extSplats,
      target,
      width,
      height,
      depth,
      0,
    );
    if (this.sparkRenderer.display.extSplats) {
      // extSplats mode: target.textures = [packed, target2, target3];
      // SparkRenderer binds extSplats=packedSlot0, extSplats2=slot1.
      // Mirror that here by reading the second integer slot too.
      this.extSplats2 = this.syncExtSplatsLayer(
        this.extSplats2,
        target,
        width,
        height,
        depth,
        1,
      );
    } else {
      // !extSplats mode (default): target.textures = [packed, target3]
      // where target3 is an aux RGBA8 texture the shader ignores in this
      // branch. SparkRenderer binds the same packed texture to both
      // extSplats and extSplats2 samplers. Mirror by reusing the slot-0
      // mirror as the slot-1 mirror so `setTexture("extSplats2", ...)`
      // points at valid integer data instead of garbage / an aux RGBA8
      // mirror that fails to upload as RGBA32UI.
      if (this.extSplats2 && this.extSplats2 !== this.extSplats) {
        this.extSplats2.texture.dispose();
      }
      this.extSplats2 = this.extSplats;
    }
  }

  private syncExtSplatsLayer(
    state: ExtSplatsTextureState | null,
    target: THREE.WebGLArrayRenderTarget,
    width: number,
    height: number,
    depth: number,
    textureIndex: 0 | 1,
  ): ExtSplatsTextureState {
    const layerPixelCount = width * height * 4; // RGBA32UI = 4 uint32 per pixel
    const totalPixelCount = layerPixelCount * depth;

    let scratch: Uint32Array;
    if (
      state &&
      state.width === width &&
      state.height === height &&
      state.depth === depth
    ) {
      scratch = state.scratch;
    } else {
      scratch = new Uint32Array(totalPixelCount);
    }

    // Three's `readRenderTargetPixels` only allows RGBA/UnsignedByte
    // (see WebGLRenderer.js — it errors and returns for any other
    // format). Spark's accumulator targets are RGBAIntegerFormat /
    // UnsignedIntType (RGBA32UI). Bypass the wrapper and call
    // `gl.readPixels` directly against a private framebuffer with the
    // right COLOR_ATTACHMENT + texture-array layer bound.
    this.gpuReadRenderTargetLayer(
      target,
      textureIndex,
      width,
      height,
      depth,
      scratch,
      layerPixelCount,
    );

    const B = this.babylon;
    if (
      !state ||
      state.width !== width ||
      state.height !== height ||
      state.depth !== depth
    ) {
      state?.texture.dispose();
      const texture = new B.RawTexture2DArray(
        scratch,
        width,
        height,
        depth,
        B.Engine.TEXTUREFORMAT_RGBA_INTEGER,
        this.scene,
        false,
        false,
        B.Texture.NEAREST_SAMPLINGMODE,
        B.Constants.TEXTURETYPE_UNSIGNED_INTEGER,
      );
      return { texture, width, height, depth, scratch };
    }
    state.texture.update(scratch);
    return state;
  }

  private readFramebuffer: WebGLFramebuffer | null = null;

  private gpuReadRenderTargetLayer(
    target: THREE.WebGLArrayRenderTarget,
    textureIndex: 0 | 1,
    width: number,
    height: number,
    depth: number,
    scratch: Uint32Array,
    layerPixelCount: number,
  ): void {
    const threeRenderer = this.sparkRenderer.renderer;
    const gl = threeRenderer.getContext() as WebGL2RenderingContext;

    // Force Three to allocate the GL textures + framebuffer for the
    // target if it hasn't already — `properties.get(threeTexture)` only
    // returns the WebGL object after Three uses it. Spark has already
    // rendered into the target this frame so the GL texture should
    // exist; this `get` is then a cheap lookup.
    const threeTexture = target.textures[textureIndex];
    if (!threeTexture) {
      return;
    }
    const texProps = threeRenderer.properties.get(threeTexture) as
      | { __webglTexture?: WebGLTexture }
      | undefined;
    const webglTexture = texProps?.__webglTexture;
    if (!webglTexture) {
      return;
    }

    const prevReadFb = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING);
    if (!this.readFramebuffer) {
      this.readFramebuffer = gl.createFramebuffer();
    }
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, this.readFramebuffer);

    for (let layer = 0; layer < depth; layer++) {
      gl.framebufferTextureLayer(
        gl.READ_FRAMEBUFFER,
        gl.COLOR_ATTACHMENT0,
        webglTexture,
        0,
        layer,
      );
      const layerView = new Uint32Array(
        scratch.buffer,
        scratch.byteOffset + layer * layerPixelCount * 4,
        layerPixelCount,
      );
      gl.readPixels(
        0,
        0,
        width,
        height,
        gl.RGBA_INTEGER,
        gl.UNSIGNED_INT,
        layerView,
      );
    }

    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, prevReadFb);
  }

  dispose(): void {
    this.ordering?.texture.dispose();
    this.ordering = null;
    // In !extSplats mode extSplats2 may alias extSplats — dispose only
    // once.
    const seen = new Set<unknown>();
    if (this.extSplats) {
      this.extSplats.texture.dispose();
      seen.add(this.extSplats);
    }
    if (this.extSplats2 && !seen.has(this.extSplats2)) {
      this.extSplats2.texture.dispose();
    }
    this.extSplats = null;
    this.extSplats2 = null;
    if (this.readFramebuffer) {
      const gl =
        this.sparkRenderer.renderer.getContext() as WebGL2RenderingContext;
      gl.deleteFramebuffer(this.readFramebuffer);
      this.readFramebuffer = null;
    }
  }
}
