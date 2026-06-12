import assert from "node:assert";
import {
  SPARK_GLES_OPTIONAL_EXTENSIONS,
  SPARK_GLES_REQUIRED_LIMITS,
  probeGlesConformance,
} from "../src/backends/gles.js";

const passingGl = {
  texStorage3D() {},
  getParameter(parameter: number) {
    const requirement = SPARK_GLES_REQUIRED_LIMITS.find(
      (item) => item.parameter === parameter,
    );
    return requirement?.minimum ?? 0;
  },
  getExtension(name: string) {
    return SPARK_GLES_OPTIONAL_EXTENSIONS.includes(name) ? {} : null;
  },
} as WebGL2RenderingContext;

const passing = probeGlesConformance({ backend: "three", gl: passingGl });
assert.strictEqual(passing.webglVersion, 2);
assert.strictEqual(passing.isConformant, true);
assert.strictEqual(passing.issues.length, 0);

const failingGl = {
  getParameter() {
    return 1;
  },
  getExtension() {
    return null;
  },
} as unknown as WebGLRenderingContext;

const failing = probeGlesConformance({ backend: "three", gl: failingGl });
assert.strictEqual(failing.webglVersion, 1);
assert.strictEqual(failing.isConformant, false);
assert.ok(failing.issues.length > 0);

console.log("GLES conformance tests passed");
