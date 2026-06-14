import { encodeRgbaPng, flipPixels } from "../utils";
import type { SparkPngStillCapture } from "./types";

export function createPngStillCapture({
  pixels,
  width,
  height,
  flipY = false,
}: {
  pixels: Uint8Array;
  width: number;
  height: number;
  flipY?: boolean;
}): SparkPngStillCapture {
  return {
    mimeType: "image/png",
    width,
    height,
    data: encodeRgbaPng({
      pixels: flipY ? flipPixels(pixels.slice(), width, height) : pixels,
      width,
      height,
    }),
  };
}
