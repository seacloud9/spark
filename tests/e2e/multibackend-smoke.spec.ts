import { expect, test } from "@playwright/test";

// Throwaway smoke test for examples/spark-multibackend/. Verifies that the
// page loads under each engine without page errors and that the engine
// link / scene select UI renders. Not part of the parity gate — delete
// once the example is stable.
test.describe.configure({ mode: "serial" });

const ENGINES = ["three", "aframe", "babylon"] as const;

for (const engine of ENGINES) {
  test(`multibackend playground loads on engine=${engine}`, async ({
    page,
  }) => {
    test.setTimeout(120_000);

    const errors: string[] = [];
    page.on("pageerror", (err) => {
      errors.push(err.message);
    });
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(`console.error: ${msg.text()}`);
      }
    });

    await page.goto(
      `/examples/spark-multibackend/?engine=${engine}&scene=axes`,
      { timeout: 60_000 },
    );

    // The meta div starts as "Loading…" and flips to a scene description
    // once the engine has mounted. Wait for that flip as the success
    // signal — different engines have different timing.
    await expect(page.locator("#meta")).not.toHaveText("Loading…", {
      timeout: 90_000,
    });
    const metaText = await page.locator("#meta").textContent();
    expect(metaText).toContain(`scene: axes`);

    // Engine link row should include all three engines, with the active
    // one underlined.
    await expect(
      page.locator(`#engineLinks a.active`),
    ).toHaveText(engine);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[multibackend ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}
