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

const SCENES = ["axes", "grid", "sphere", "multi"] as const;
type SceneName = (typeof SCENES)[number];

interface BackendSnapshotMeta {
  backend: string;
  scene: string;
  meshSplats?: number;
  activeSplats?: number;
  isPlaceholder?: boolean;
}

async function diffParityPng(opts: {
  baseline: string;
  candidate: string;
  diffOut: string;
  label: string;
  tolerance: number;
}): Promise<void> {
  const baselineBuf = await readFile(path.join(tmpDir, opts.baseline));
  const candidateBuf = await readFile(path.join(tmpDir, opts.candidate));
  const baseline = PNG.sync.read(baselineBuf);
  const candidate = PNG.sync.read(candidateBuf);

  expect(candidate.width).toBe(baseline.width);
  expect(candidate.height).toBe(baseline.height);

  const diff = new PNG({ width: baseline.width, height: baseline.height });
  const numDiff = pixelmatch(
    baseline.data,
    candidate.data,
    diff.data,
    baseline.width,
    baseline.height,
    { threshold: 0.1 },
  );

  await writeFile(path.join(tmpDir, opts.diffOut), PNG.sync.write(diff));

  const total = baseline.width * baseline.height;
  const ratio = numDiff / total;
  // eslint-disable-next-line no-console
  console.log(
    `[parity] ${opts.label}: ${numDiff} / ${total} pixels differ (${(ratio * 100).toFixed(4)}%)`,
  );
  expect(ratio).toBeLessThan(opts.tolerance);
}

for (const scene of SCENES) {
  test.describe(`scene: ${scene}`, () => {
    test(`captures three-${scene}.png`, async ({ page }) => {
      await page.goto(`/tests/fixtures/snapshot-three.html?scene=${scene}`);
      await expect(page.locator("body")).toHaveAttribute("data-ready", "true", {
        timeout: 60_000,
      });
      await page
        .locator("#view")
        .screenshot({ path: path.join(tmpDir, `three-${scene}.png`) });
      const meta = await page.evaluate(
        () =>
          (
            window as Window & {
              sparkSnapshotReady: BackendSnapshotMeta;
            }
          ).sparkSnapshotReady,
      );
      expect(meta.backend).toBe("three");
      expect(meta.scene).toBe(scene);
      expect(meta.meshSplats).toBeGreaterThan(0);
      expect(meta.activeSplats).toBeGreaterThan(0);
    });

    test(`captures aframe-${scene}.png`, async ({ page }) => {
      await page.goto(`/tests/fixtures/snapshot-aframe.html?scene=${scene}`);
      await expect(page.locator("body")).toHaveAttribute("data-ready", "true", {
        timeout: 60_000,
      });
      await page
        .locator("#view")
        .screenshot({ path: path.join(tmpDir, `aframe-${scene}.png`) });
      const meta = await page.evaluate(
        () =>
          (
            window as Window & {
              sparkAFrameSnapshotReady: BackendSnapshotMeta;
            }
          ).sparkAFrameSnapshotReady,
      );
      expect(meta.backend).toBe("aframe");
      expect(meta.scene).toBe(scene);
      expect(meta.meshSplats).toBeGreaterThan(0);
      expect(meta.activeSplats).toBeGreaterThan(0);
    });

    test(`captures babylon-${scene}.png`, async ({ page }) => {
      test.setTimeout(180_000);
      await page.goto(`/tests/fixtures/snapshot-babylon.html?scene=${scene}`, {
        timeout: 90_000,
      });
      await expect(page.locator("body")).toHaveAttribute("data-ready", "true", {
        timeout: 60_000,
      });
      await page
        .locator("#view")
        .screenshot({ path: path.join(tmpDir, `babylon-${scene}.png`) });
      const meta = await page.evaluate(
        () =>
          (
            window as Window & {
              sparkBabylonSnapshotReady: BackendSnapshotMeta;
            }
          ).sparkBabylonSnapshotReady,
      );
      expect(meta.backend).toBe("babylon");
      expect(meta.scene).toBe(scene);
      expect(meta.meshSplats).toBeGreaterThan(0);
      expect(meta.activeSplats).toBeGreaterThan(0);
      expect(meta.isPlaceholder).toBe(false);
    });

    test(`Three vs A-Frame parity (${scene})`, async () => {
      await diffParityPng({
        baseline: `three-${scene}.png`,
        candidate: `aframe-${scene}.png`,
        diffOut: `parity-aframe-${scene}.png`,
        label: `three vs aframe / ${scene}`,
        tolerance: 0.01,
      });
    });

    test(`Three vs Babylon parity (${scene})`, async () => {
      await diffParityPng({
        baseline: `three-${scene}.png`,
        candidate: `babylon-${scene}.png`,
        diffOut: `parity-babylon-${scene}.png`,
        label: `three vs babylon / ${scene}`,
        tolerance: 0.05,
      });
    });
  });
}
