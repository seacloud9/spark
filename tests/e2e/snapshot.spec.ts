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

const SCENES = ["axes", "grid", "sphere", "multi", "tinted"] as const;
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

    test(`composes side-by-side review image (${scene})`, async () => {
      const panels = await Promise.all([
        readFile(path.join(tmpDir, `three-${scene}.png`)),
        readFile(path.join(tmpDir, `aframe-${scene}.png`)),
        readFile(path.join(tmpDir, `babylon-${scene}.png`)),
      ]).then((bufs) => bufs.map((b) => PNG.sync.read(b)));

      const [first] = panels;
      const w = first.width;
      const h = first.height;
      for (const panel of panels) {
        expect(panel.width).toBe(w);
        expect(panel.height).toBe(h);
      }

      const gap = 16;
      const compositeWidth = w * panels.length + gap * (panels.length - 1);
      const composite = new PNG({ width: compositeWidth, height: h });
      // Fill gap columns with a near-black so the panels read as separate
      // images rather than one wide canvas.
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < compositeWidth; x++) {
          const i = (y * compositeWidth + x) * 4;
          composite.data[i] = 0x12;
          composite.data[i + 1] = 0x16;
          composite.data[i + 2] = 0x1d;
          composite.data[i + 3] = 0xff;
        }
      }
      for (let p = 0; p < panels.length; p++) {
        const panel = panels[p];
        const xOff = p * (w + gap);
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            const srcIdx = (y * w + x) * 4;
            const dstIdx = (y * compositeWidth + (x + xOff)) * 4;
            composite.data[dstIdx] = panel.data[srcIdx];
            composite.data[dstIdx + 1] = panel.data[srcIdx + 1];
            composite.data[dstIdx + 2] = panel.data[srcIdx + 2];
            composite.data[dstIdx + 3] = panel.data[srcIdx + 3];
          }
        }
      }

      await writeFile(
        path.join(tmpDir, `composite-${scene}.png`),
        PNG.sync.write(composite),
      );
    });
  });
}
