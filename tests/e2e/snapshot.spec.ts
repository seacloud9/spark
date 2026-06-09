import { mkdir } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const tmpDir = path.join(process.cwd(), "tmp");

test.beforeAll(async () => {
  await mkdir(tmpDir, { recursive: true });
});

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

  const canvas = page.locator("a-scene canvas");
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
