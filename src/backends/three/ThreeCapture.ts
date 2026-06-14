import * as THREE from "three";
import { createPngStillCapture } from "../capture";
import { probeGlesConformance } from "../gles";
import type {
  SparkGlesConformanceReport,
  SparkPngStillCapture,
} from "../types";

export function captureThreeRendererPng({
  renderer,
  target,
  width,
  height,
}: {
  renderer: THREE.WebGLRenderer;
  target?: THREE.WebGLRenderTarget;
  width?: number;
  height?: number;
}): SparkPngStillCapture {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());
  const captureWidth = width ?? target?.width ?? size.x;
  const captureHeight = height ?? target?.height ?? size.y;
  const pixels = new Uint8Array(captureWidth * captureHeight * 4);

  if (target) {
    renderer.readRenderTargetPixels(
      target,
      0,
      0,
      captureWidth,
      captureHeight,
      pixels,
    );
  } else {
    const gl = renderer.getContext();
    gl.readPixels(
      0,
      0,
      captureWidth,
      captureHeight,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixels,
    );
  }

  return createPngStillCapture({
    pixels,
    width: captureWidth,
    height: captureHeight,
    flipY: true,
  });
}

export function probeThreeRendererGlesConformance(
  renderer: THREE.WebGLRenderer,
): SparkGlesConformanceReport {
  return probeGlesConformance({ backend: "three", gl: renderer.getContext() });
}
