import assert from "node:assert";
import { createBabylonSparkLoadRequest } from "../src/backends/babylon/BabylonSparkAdapter.js";
import { normalizeSplatLoadOptions } from "../src/backends/loading.js";

const fileBytes = new Uint8Array([1, 2, 3]);
const load = normalizeSplatLoadOptions({
  url: "scene.spz",
  fileBytes,
  fileName: "scene.spz",
  maxSplats: 128,
});

assert.strictEqual(load.url, "scene.spz");
assert.strictEqual(load.fileBytes, fileBytes);
assert.strictEqual(load.fileName, "scene.spz");
assert.strictEqual(load.maxSplats, 128);

const babylonRequest = createBabylonSparkLoadRequest(load);
assert.deepStrictEqual(babylonRequest.load, load);
assert.notStrictEqual(babylonRequest.load, load);

console.log("Backend loading convention tests passed");
