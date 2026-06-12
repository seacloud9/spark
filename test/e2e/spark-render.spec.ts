import { expect, test } from "@playwright/test";

test("renders a deterministic SplatMesh through SparkRenderer", async ({
  page,
}) => {
  await page.goto("/test/fixtures/spark-render.html", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true", {
    timeout: 60_000,
  });

  const fixture = await page.evaluate(
    () =>
      (
        window as Window & {
          sparkRenderFixture: {
            activeSplats: number;
            meshSplats: number;
            litPixels: number;
            capture: {
              mimeType: string;
              width: number;
              height: number;
              signature: number[];
              bytes: number;
            };
          };
        }
      ).sparkRenderFixture,
  );

  expect(fixture.meshSplats).toBeGreaterThan(0);
  expect(fixture.activeSplats).toBeGreaterThan(0);
  expect(fixture.litPixels).toBeGreaterThan(0);
  expect(fixture.capture).toMatchObject({
    mimeType: "image/png",
    width: 96,
    height: 96,
  });
  expect(fixture.capture.signature).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(fixture.capture.bytes).toBeGreaterThan(0);
});
