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

const SCENES = [
  "axes",
  "grid",
  "sphere",
  "multi",
  "tinted",
  "helloWorld",
  "multipleSplats",
  "debugColor",
  "viewer",
  "depthOfField",
  "sogs",
  "extSplats",
  "nonLod",
  "glsl",
  "dynamicLighting",
  "splatDissolve",
  "animatedWarp",
  "envMap",
] as const;
type SceneName = (typeof SCENES)[number];

// Scenes that fetch splat files from the network need much higher
// timeouts than the procedural scenes. The default Playwright test
// timeout is 30 s; URL-loaded splats from the sparkjs.dev CDN take
// 5-20 s on first hit (cold cache) on top of the usual setup cost.
const NETWORK_SCENES = new Set<SceneName>([
  "helloWorld",
  "multipleSplats",
  "debugColor",
  "viewer",
  "depthOfField",
  "sogs",
  "extSplats",
  "nonLod",
  "glsl",
  "dynamicLighting",
  "splatDissolve",
  "animatedWarp",
  "envMap",
]);

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
      if (NETWORK_SCENES.has(scene)) {
        test.setTimeout(240_000);
      }
      await page.goto(`/tests/fixtures/snapshot-three.html?scene=${scene}`, {
        timeout: NETWORK_SCENES.has(scene) ? 120_000 : 30_000,
      });
      await expect(page.locator("body")).toHaveAttribute("data-ready", "true", {
        timeout: NETWORK_SCENES.has(scene) ? 180_000 : 60_000,
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
      if (NETWORK_SCENES.has(scene)) {
        test.setTimeout(240_000);
      }
      await page.goto(`/tests/fixtures/snapshot-aframe.html?scene=${scene}`, {
        timeout: NETWORK_SCENES.has(scene) ? 120_000 : 30_000,
      });
      await expect(page.locator("body")).toHaveAttribute("data-ready", "true", {
        timeout: NETWORK_SCENES.has(scene) ? 180_000 : 60_000,
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
      // Babylon's texture-bridge path adds CPU readPixels per frame and
      // the vite cold-cache prebundle of @babylonjs/core can take 30+s
      // before any network fetch starts. Heavy URL scenes (SOGS .zip,
      // ExtSplats float32) push render time well past the 60s default.
      test.setTimeout(NETWORK_SCENES.has(scene) ? 540_000 : 180_000);
      await page.goto(`/tests/fixtures/snapshot-babylon.html?scene=${scene}`, {
        timeout: NETWORK_SCENES.has(scene) ? 240_000 : 90_000,
      });
      await expect(page.locator("body")).toHaveAttribute("data-ready", "true", {
        timeout: NETWORK_SCENES.has(scene) ? 360_000 : 60_000,
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

test("renders the full parity mosaic", async () => {
  // One wide review image with every scene x backend in a (scenes) x 3 grid:
  // rows are scenes in the SCENES order, columns are three / aframe / babylon.
  // Reviewers see the entire parity state in one PNG without flipping between
  // 15 separate files.
  const backends = ["three", "aframe", "babylon"] as const;
  const cells: PNG[][] = [];
  for (const scene of SCENES) {
    const row: PNG[] = [];
    for (const backend of backends) {
      const buf = await readFile(path.join(tmpDir, `${backend}-${scene}.png`));
      row.push(PNG.sync.read(buf));
    }
    cells.push(row);
  }

  const w = cells[0][0].width;
  const h = cells[0][0].height;
  for (const row of cells) {
    for (const cell of row) {
      expect(cell.width).toBe(w);
      expect(cell.height).toBe(h);
    }
  }

  const gap = 16;
  const cols = backends.length;
  const rows = SCENES.length;
  const mosaicWidth = cols * w + (cols - 1) * gap;
  const mosaicHeight = rows * h + (rows - 1) * gap;
  const mosaic = new PNG({ width: mosaicWidth, height: mosaicHeight });
  for (let i = 0; i < mosaic.data.length; i += 4) {
    mosaic.data[i] = 0x12;
    mosaic.data[i + 1] = 0x16;
    mosaic.data[i + 2] = 0x1d;
    mosaic.data[i + 3] = 0xff;
  }

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cell = cells[r][c];
      const xOff = c * (w + gap);
      const yOff = r * (h + gap);
      for (let y = 0; y < h; y++) {
        const srcRow = y * w * 4;
        const dstRow = (y + yOff) * mosaicWidth * 4 + xOff * 4;
        mosaic.data.set(cell.data.subarray(srcRow, srcRow + w * 4), dstRow);
      }
    }
  }

  await writeFile(
    path.join(tmpDir, "parity-mosaic.png"),
    PNG.sync.write(mosaic),
  );
});

test("writes parity-summary.json", async () => {
  // Machine-readable summary of every pairwise diff in the matrix. CI uploads
  // this alongside tmp/ so dashboards / status checks can read pixel counts
  // without having to re-decode PNGs.
  interface ScenePairResult {
    diff: number;
    ratio: number;
  }
  interface SceneEntry {
    width: number;
    height: number;
    pixels: number;
    threeVsAFrame: ScenePairResult;
    threeVsBabylon: ScenePairResult;
  }
  const summary: {
    generatedAt: string;
    sceneCount: number;
    pixelmatchThreshold: number;
    scenes: Record<string, SceneEntry>;
  } = {
    generatedAt: new Date().toISOString(),
    sceneCount: SCENES.length,
    pixelmatchThreshold: 0.1,
    scenes: {},
  };

  for (const scene of SCENES) {
    const three = PNG.sync.read(
      await readFile(path.join(tmpDir, `three-${scene}.png`)),
    );
    const aframe = PNG.sync.read(
      await readFile(path.join(tmpDir, `aframe-${scene}.png`)),
    );
    const babylon = PNG.sync.read(
      await readFile(path.join(tmpDir, `babylon-${scene}.png`)),
    );
    const total = three.width * three.height;
    const diffAF = pixelmatch(
      three.data,
      aframe.data,
      null,
      three.width,
      three.height,
      { threshold: 0.1 },
    );
    const diffBA = pixelmatch(
      three.data,
      babylon.data,
      null,
      three.width,
      three.height,
      { threshold: 0.1 },
    );
    summary.scenes[scene] = {
      width: three.width,
      height: three.height,
      pixels: total,
      threeVsAFrame: { diff: diffAF, ratio: diffAF / total },
      threeVsBabylon: { diff: diffBA, ratio: diffBA / total },
    };
  }

  await writeFile(
    path.join(tmpDir, "parity-summary.json"),
    `${JSON.stringify(summary, null, 2)}\n`,
  );
});
