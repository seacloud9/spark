import assert from "node:assert";
import { createPngStillCapture } from "../src/backends/capture.js";
import { encodeRgbaPng, flipPixels } from "../src/utils.js";

const red = [255, 0, 0, 255];
const green = [0, 255, 0, 255];
const blue = [0, 0, 255, 255];
const white = [255, 255, 255, 255];
const pixels = new Uint8Array([...red, ...green, ...blue, ...white]);

assert.deepStrictEqual(
  Array.from(flipPixels(pixels.slice(), 2, 2)),
  [...blue, ...white, ...red, ...green],
  "flipPixels should vertically flip RGBA rows",
);

const png = encodeRgbaPng({ pixels, width: 2, height: 2 });
assert.deepStrictEqual(
  Array.from(png.subarray(0, 8)),
  [137, 80, 78, 71, 13, 10, 26, 10],
  "encodeRgbaPng should write a PNG signature",
);

const capture = createPngStillCapture({ pixels, width: 2, height: 2 });
assert.strictEqual(capture.mimeType, "image/png");
assert.strictEqual(capture.width, 2);
assert.strictEqual(capture.height, 2);
assert.deepStrictEqual(capture.data, png);

console.log("Capture tests passed");
