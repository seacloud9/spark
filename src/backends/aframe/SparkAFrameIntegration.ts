import * as THREE from "three";
import { SparkRenderer, type SparkRendererOptions } from "../../SparkRenderer";
import { SplatMesh, type SplatMeshOptions } from "../../SplatMesh";
import { getShaders } from "../../shaders";

// Minimal structural surface of the A-Frame globals we touch. We intentionally
// do not import "aframe" as a dependency — consumers bring their own AFRAME
// (CDN, npm, or otherwise) and pass it in. This keeps Spark engine-neutral and
// avoids a Three.js-identity collision with A-Frame's bundled Three.
export interface AFrameLike {
  registerSystem(name: string, def: object): void;
  registerComponent(name: string, def: object): void;
  THREE?: { ShaderChunk?: Record<string, string> };
}

/**
 * Mirror Spark's shader chunks onto another Three.js namespace's ShaderChunk
 * table. When A-Frame ships its own bundled Three (the common CDN case) it
 * is a different runtime namespace from the one Spark imports against, so
 * SparkRenderer's `#include <splatDefines>` would fail to resolve when the
 * A-Frame renderer compiles the material. This is a no-op when both
 * namespaces are the same.
 */
function bridgeShaderChunks(target: Record<string, string> | undefined): void {
  if (!target) {
    return;
  }
  getShaders(); // force-register Spark's splatDefines on Spark's THREE
  for (const [name, value] of Object.entries(THREE.ShaderChunk)) {
    if (target[name] === undefined && typeof value === "string") {
      target[name] = value;
    }
  }
}

interface AFrameSceneEl {
  renderer: THREE.WebGLRenderer;
  object3D: THREE.Scene;
}

interface AFrameSystemContext {
  el: AFrameSceneEl;
}

interface AFrameEntityEl {
  object3D: THREE.Object3D;
  sceneEl: AFrameSceneEl;
  setObject3D(id: string, obj: THREE.Object3D): void;
  removeObject3D(id: string): void;
}

interface AFrameSplatComponentContext {
  el: AFrameEntityEl;
  data: SparkSplatSchemaData;
}

export interface SparkSplatSchemaData {
  src: string;
}

export interface RegisterSparkAFrameOptions {
  systemName?: string;
  componentName?: string;
  sparkRendererOptions?: Omit<SparkRendererOptions, "renderer">;
  splatMeshOptionsFromSrc?: (src: string) => SplatMeshOptions;
}

/**
 * Register Spark's A-Frame system and component on the supplied AFRAME global.
 *
 * The system attaches a {@link SparkRenderer} to the a-scene's root Three.js
 * scene once the scene is loaded. The component creates a {@link SplatMesh} per
 * entity from a URL schema field and mounts it via `setObject3D`.
 *
 * A-Frame ships its own copy of Three.js. To avoid two THREE namespaces in one
 * page, this integration uses the renderer and scene that A-Frame already
 * created on the a-scene element; it never constructs its own Three.js
 * `WebGLRenderer` or `Scene`. SparkRenderer (a `THREE.Mesh` subclass from
 * Spark's Three) is mounted onto A-Frame's `THREE.Scene`; the parent array
 * stores any `Object3D`-shaped node regardless of constructor identity, so the
 * cross-namespace mount is structurally safe for static splat rendering.
 */
export function registerSparkAFrame(
  aframe: AFrameLike,
  options: RegisterSparkAFrameOptions = {},
): void {
  const systemName = options.systemName ?? "spark";
  const componentName = options.componentName ?? "spark-splat";
  const rendererOptions = options.sparkRendererOptions ?? {};
  const loadOptionsFromSrc =
    options.splatMeshOptionsFromSrc ??
    ((src: string): SplatMeshOptions => ({ url: src }));

  bridgeShaderChunks(aframe.THREE?.ShaderChunk);

  aframe.registerSystem(systemName, {
    init(this: AFrameSystemContext & { spark?: SparkRenderer }) {
      const sceneEl = this.el;
      const attach = () => {
        if (this.spark) {
          return;
        }
        const renderer = sceneEl.renderer;
        if (!renderer) {
          return;
        }
        const spark = new SparkRenderer({
          renderer,
          ...rendererOptions,
        });
        sceneEl.object3D.add(spark);
        this.spark = spark;
      };
      // a-scene may already be loaded by the time we register; try both paths.
      attach();
      (sceneEl as unknown as EventTarget).addEventListener?.(
        "loaded",
        attach as EventListener,
      );
    },
    remove(this: { spark?: SparkRenderer }) {
      if (this.spark) {
        this.spark.parent?.remove(this.spark);
        this.spark = undefined;
      }
    },
  });

  aframe.registerComponent(componentName, {
    schema: { src: { type: "string", default: "" } },
    async init(
      this: AFrameSplatComponentContext & { mesh?: SplatMesh },
    ): Promise<void> {
      const src = this.data.src;
      if (!src) {
        return;
      }
      const mesh = new SplatMesh(loadOptionsFromSrc(src));
      await mesh.initialized;
      this.mesh = mesh;
      this.el.setObject3D(componentName, mesh);
    },
    update(
      this: AFrameSplatComponentContext & { mesh?: SplatMesh },
      oldData: Partial<SparkSplatSchemaData>,
    ): void {
      const previousSrc = oldData?.src;
      if (
        previousSrc === undefined ||
        previousSrc === this.data.src ||
        !this.mesh
      ) {
        return;
      }
      this.el.removeObject3D(componentName);
      this.mesh = undefined;
      if (!this.data.src) {
        return;
      }
      const next = new SplatMesh(loadOptionsFromSrc(this.data.src));
      next.initialized.then(() => {
        this.mesh = next;
        this.el.setObject3D(componentName, next);
      });
    },
    remove(this: AFrameSplatComponentContext & { mesh?: SplatMesh }): void {
      if (this.mesh) {
        this.el.removeObject3D(componentName);
        this.mesh = undefined;
      }
    },
  });
}
