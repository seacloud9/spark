import { expect, test } from "@playwright/test";

test("captures deterministic PNG metadata and probes WebGL2 limits", async ({
  page,
}) => {
  await page.goto("/test/fixtures/capture-gles.html");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true");

  const fixture = await page.evaluate(
    () =>
      (
        window as Window & {
          sparkFixture: {
            capture: {
              mimeType: string;
              width: number;
              height: number;
              signature: number[];
              bytes: number;
            };
            threeCapture: {
              mimeType: string;
              width: number;
              height: number;
              signature: number[];
              bytes: number;
            };
            conformance: {
              backend: string;
              webglVersion: number;
              limits: Record<string, number>;
            };
            threeConformance: {
              backend: string;
              webglVersion: number;
              limits: Record<string, number>;
            };
          };
        }
      ).sparkFixture,
  );

  expect(fixture.capture).toMatchObject({
    mimeType: "image/png",
    width: 2,
    height: 2,
  });
  expect(fixture.capture.signature).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  expect(fixture.capture.bytes).toBeGreaterThan(0);

  expect(fixture.threeCapture).toMatchObject({
    mimeType: "image/png",
    width: 4,
    height: 4,
  });
  expect(fixture.threeCapture.signature).toEqual([
    137, 80, 78, 71, 13, 10, 26, 10,
  ]);
  expect(fixture.threeCapture.bytes).toBeGreaterThan(0);

  expect(fixture.conformance.backend).toBe("three");
  expect(fixture.conformance.webglVersion).toBe(2);
  expect(fixture.conformance.limits.MAX_TEXTURE_SIZE).toBeGreaterThanOrEqual(
    2048,
  );
  expect(fixture.threeConformance.backend).toBe("three");
  expect(fixture.threeConformance.webglVersion).toBe(2);
});
