import { expect, test } from "@playwright/test";

// Smoke test for the engine-aware examples flow:
//   examples/index.html → real index with 3 engine links per example.
//   examples/<name>/index.html → reads ?engine= via spark-engine.js.
test.describe.configure({ mode: "serial" });

const ENGINES = ["three", "aframe", "babylon"] as const;
const ENGINE_AWARE_EXAMPLES = [
  "hello-world",
  "debug-color",
  "depth-of-field",
  "glsl",
  "extsplats",
  "multiple-splats",
  "nonlod",
  "procedural-splats",
  "dynamic-lighting",
  "envmap",
  "lod",
  "lod-on-demand",
  "multi-lod",
  "sogs",
  "streaming-lod",
  "splat-transitions",
];

test("examples index shows engine-aware bullet for every ported example", async ({
  page,
}) => {
  await page.goto(`/examples/`, { timeout: 30_000 });
  for (const name of ENGINE_AWARE_EXAMPLES) {
    // Locate by exact td.name text rather than tr substring — "extsplats"
    // is a case-insensitive substring of "textSplats" inside other rows'
    // descriptions, so a hasText filter over-matches.
    const row = page
      .locator(`tr.engine-aware`)
      .filter({ has: page.locator("td.name", { hasText: new RegExp(`^${name}$`) }) });
    await expect(row).toHaveCount(1);
    await expect(
      row.locator(`td.engines a.aframe`),
    ).toHaveAttribute("href", `./${name}/?engine=aframe`);
    await expect(
      row.locator(`td.engines a.babylon`),
    ).toHaveAttribute("href", `./${name}/?engine=babylon`);
  }
});

for (const name of ENGINE_AWARE_EXAMPLES) {
  for (const engine of ENGINES) {
    test(`${name} loads on engine=${engine}`, async ({ page }) => {
      test.setTimeout(240_000);

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
      await page.goto(`/examples/${name}/${qs}`, {
        timeout: 120_000,
      });

      // spark-engine.js mounts a switcher overlay after the chosen
      // backend finishes setup. Wait for that as the success signal.
      await expect(page.locator("#spark-engine-switcher")).toBeVisible({
        timeout: 120_000,
      });

      // Footer must offer all three engine links + a back-to-examples
      // link on every page, with the correct hrefs regardless of which
      // engine is currently active. Catches any future regression where
      // the helper accidentally hides a link or breaks href construction.
      const footer = page.locator("#spark-engine-switcher");
      await expect(footer.locator("a[href='../']")).toHaveCount(1);
      await expect(
        footer.locator("a.spark-engine-link-three"),
      ).toHaveAttribute("href", `/examples/${name}/`);
      await expect(
        footer.locator("a.spark-engine-link-aframe"),
      ).toHaveAttribute("href", "?engine=aframe");
      await expect(
        footer.locator("a.spark-engine-link-babylon"),
      ).toHaveAttribute("href", "?engine=babylon");

      if (errors.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`[${name} ${engine}] errors:`, errors);
      }
      expect(errors).toEqual([]);
    });
  }
}
