import { type Page, expect, test } from "@playwright/test";

function collectUnexpectedConsole(page: Page) {
  const messages: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (
      text.includes("[vite]") ||
      text.includes("GPU stall") ||
      text.includes("Babylon.js")
    ) {
      return;
    }
    messages.push(`${message.type()}: ${text}`);
  });
  page.on("pageerror", (error) => {
    messages.push(`pageerror: ${error.message}`);
  });
  return messages;
}

test("renders through the built dist bundle used by examples", async ({
  page,
}) => {
  const messages = collectUnexpectedConsole(page);

  await page.goto("/test/fixtures/dist-three-render.html");
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true", {
    timeout: 60_000,
  });

  const fixture = await page.evaluate(
    () =>
      (
        window as Window & {
          sparkDistRenderFixture: {
            activeSplats: number;
            meshSplats: number;
            litPixels: number;
          };
        }
      ).sparkDistRenderFixture,
  );

  expect(messages).toEqual([]);
  expect(fixture.meshSplats).toBeGreaterThan(0);
  expect(fixture.activeSplats).toBeGreaterThan(0);
  expect(fixture.litPixels).toBeGreaterThan(0);
});

test("keeps Three dist rendering after visiting the Babylon host", async ({
  page,
}) => {
  test.setTimeout(180_000);
  const messages = collectUnexpectedConsole(page);

  await page.goto("/test/fixtures/snapshot-babylon.html?scene=axes", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true", {
    timeout: 120_000,
  });
  const babylonMeta = await page.evaluate(
    () =>
      (
        window as Window & {
          sparkBabylonSnapshotReady: {
            activeSplats: number;
            meshSplats: number;
          };
        }
      ).sparkBabylonSnapshotReady,
  );
  expect(babylonMeta.meshSplats).toBeGreaterThan(0);
  expect(babylonMeta.activeSplats).toBeGreaterThan(0);

  await page.goto("/test/fixtures/dist-three-render.html", {
    waitUntil: "domcontentloaded",
  });
  await expect(page.locator("body")).toHaveAttribute("data-ready", "true", {
    timeout: 60_000,
  });
  const threeMeta = await page.evaluate(
    () =>
      (
        window as Window & {
          sparkDistRenderFixture: {
            activeSplats: number;
            meshSplats: number;
            litPixels: number;
          };
        }
      ).sparkDistRenderFixture,
  );
  expect(threeMeta.meshSplats).toBeGreaterThan(0);
  expect(threeMeta.activeSplats).toBeGreaterThan(0);
  expect(threeMeta.litPixels).toBeGreaterThan(0);
  expect(messages).toEqual([]);
});
