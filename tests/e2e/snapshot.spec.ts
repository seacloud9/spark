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
