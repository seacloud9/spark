import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";
import pixelmatch from "pixelmatch";
import { PNG } from "pngjs";

const tmpDir = path.join(process.cwd(), "tmp");

test.beforeAll(async () => {
  await mkdir(tmpDir, { recursive: true });
});

test.describe.configure({ mode: "serial" });

test("captures a Three backend render to tmp/three-axes.png", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/snapshot-three.html");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");

  const canvas = page.locator("#view");
  await canvas.screenshot({
    path: path.join(tmpDir, "three-axes.png"),
    omitBackground: false,
  });

  const meta = await page.evaluate(
    () =>
      (
        window as Window & {
          sparkSnapshotReady: {
            backend: string;
            meshSplats: number;
            activeSplats: number;
          };
        }
      ).sparkSnapshotReady,
  );
  expect(meta.backend).toBe("three");
  expect(meta.meshSplats).toBeGreaterThan(0);
  expect(meta.activeSplats).toBeGreaterThan(0);
});

test("captures an A-Frame backend render to tmp/aframe-axes.png", async ({
  page,
}) => {
  await page.goto("/tests/fixtures/snapshot-aframe.html");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true", {
    timeout: 30_000,
  });

  const canvas = page.locator("#view");
  await canvas.screenshot({
    path: path.join(tmpDir, "aframe-axes.png"),
    omitBackground: false,
  });

  const meta = await page.evaluate(
    () =>
      (
        window as Window & {
          sparkAFrameSnapshotReady: {
            backend: string;
            meshSplats: number;
            activeSplats: number;
          };
        }
      ).sparkAFrameSnapshotReady,
  );
  expect(meta.backend).toBe("aframe");
  expect(meta.meshSplats).toBeGreaterThan(0);
  expect(meta.activeSplats).toBeGreaterThan(0);
});

test("captures a BabylonJS Spark splat render to tmp/babylon-axes.png", async ({
  page,
}) => {
  // Babylon is a large bundle; vite's first prebundle pass on CI/cold-cache
  // can take 30+s. The texture-bridge fixture also does extra work
  // (Spark internal render + readPixels + Babylon Layer composite per
  // frame), so bump both timeouts.
  test.setTimeout(180_000);
  await page.goto("/tests/fixtures/snapshot-babylon.html", { timeout: 90_000 });
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true", {
    timeout: 30_000,
  });

  const canvas = page.locator("#view");
  await canvas.screenshot({
    path: path.join(tmpDir, "babylon-axes.png"),
    omitBackground: false,
  });

  const meta = await page.evaluate(
    () =>
      (
        window as Window & {
          sparkBabylonSnapshotReady: {
            backend: string;
            engineVersion: string;
            meshSplats: number;
            activeSplats: number;
            framesRendered: number;
            isPlaceholder: boolean;
          };
        }
      ).sparkBabylonSnapshotReady,
  );
  expect(meta.backend).toBe("babylon");
  expect(meta.meshSplats).toBeGreaterThan(0);
  expect(meta.activeSplats).toBeGreaterThan(0);
  expect(meta.framesRendered).toBeGreaterThanOrEqual(1);
  expect(meta.isPlaceholder).toBe(false);
});

test("Three vs A-Frame parity diff is within tolerance", async () => {
  const threeBuf = await readFile(path.join(tmpDir, "three-axes.png"));
  const aframeBuf = await readFile(path.join(tmpDir, "aframe-axes.png"));
  const three = PNG.sync.read(threeBuf);
  const aframe = PNG.sync.read(aframeBuf);

  expect(aframe.width).toBe(three.width);
  expect(aframe.height).toBe(three.height);

  const diff = new PNG({ width: three.width, height: three.height });
  const numDiff = pixelmatch(
    three.data,
    aframe.data,
    diff.data,
    three.width,
    three.height,
    { threshold: 0.1 },
  );

  await writeFile(
    path.join(tmpDir, "parity-three-vs-aframe.png"),
    PNG.sync.write(diff),
  );

  const total = three.width * three.height;
  const ratio = numDiff / total;
  console.log(
    `[parity] three vs aframe: ${numDiff} / ${total} pixels differ (${(ratio * 100).toFixed(4)}%)`,
  );
  // The A-Frame fixture exercises the same Three render pipeline as the
  // Three fixture via registerSparkAFrame, so parity should be tight.
  // 1% tolerance covers any timing/sort jitter between the two captures.
  expect(ratio).toBeLessThan(0.01);
});

test("Three vs Babylon parity diff is within tolerance", async () => {
  const threeBuf = await readFile(path.join(tmpDir, "three-axes.png"));
  const babylonBuf = await readFile(path.join(tmpDir, "babylon-axes.png"));
  const three = PNG.sync.read(threeBuf);
  const babylon = PNG.sync.read(babylonBuf);

  expect(babylon.width).toBe(three.width);
  expect(babylon.height).toBe(three.height);

  const diff = new PNG({ width: three.width, height: three.height });
  const numDiff = pixelmatch(
    three.data,
    babylon.data,
    diff.data,
    three.width,
    three.height,
    { threshold: 0.1 },
  );

  await writeFile(
    path.join(tmpDir, "parity-three-vs-babylon.png"),
    PNG.sync.write(diff),
  );

  const total = three.width * three.height;
  const ratio = numDiff / total;
  console.log(
    `[parity] three vs babylon: ${numDiff} / ${total} pixels differ (${(ratio * 100).toFixed(4)}%)`,
  );
  // Babylon path goes: Three offscreen render → readPixels → RawTexture →
  // Babylon Layer composite. The CPU round-trip and Babylon's sRGB/linear
  // texture handling can drift a few percent vs the direct Three render.
  // 5% tolerance keeps the gate honest while accepting expected drift.
  expect(ratio).toBeLessThan(0.05);
});
