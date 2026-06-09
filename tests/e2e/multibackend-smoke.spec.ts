import { expect, test } from "@playwright/test";

// Smoke test for the engine-aware examples flow:
//   examples/index.html → real index with 3 engine links per example.
//   examples/hello-world/index.html → reads ?engine= via spark-engine.js.
test.describe.configure({ mode: "serial" });

const ENGINES = ["three", "aframe", "babylon"] as const;

test("examples index lists hello-world with all three engine links", async ({
  page,
}) => {
  await page.goto(`/examples/`, { timeout: 30_000 });
  // The first <tbody> row should be hello-world with 3 engine links.
  const helloRow = page.locator("tr.engine-aware").first();
  await expect(helloRow.locator("td.name")).toContainText("hello-world");
  await expect(helloRow.locator("td.engines a.three")).toHaveAttribute(
    "href",
    "./hello-world/",
  );
  await expect(helloRow.locator("td.engines a.aframe")).toHaveAttribute(
    "href",
    "./hello-world/?engine=aframe",
  );
  await expect(helloRow.locator("td.engines a.babylon")).toHaveAttribute(
    "href",
    "./hello-world/?engine=babylon",
  );
});

for (const engine of ENGINES) {
  test(`hello-world loads on engine=${engine}`, async ({ page }) => {
    test.setTimeout(180_000);

    const errors: string[] = [];
    page.on("pageerror", (err) => {
      errors.push(err.message);
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(`console.error: ${msg.text()}`);
      }
    });

    const qs = engine === "three" ? "" : `?engine=${engine}`;
    await page.goto(`/examples/hello-world/${qs}`, {
      timeout: 90_000,
    });

    // The engine switcher overlay should appear after spark-engine.js
    // mounts the chosen backend. Wait for it as the success signal.
    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 90_000,
    });

    // Active engine in the switcher matches the URL.
    const activeText = await page
      .locator("#spark-engine-switcher a")
      .filter({
        has: page.locator("text=" + engine),
      })
      .first()
      .textContent();
    expect(activeText?.trim()).toBe(engine);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[hello-world ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}
