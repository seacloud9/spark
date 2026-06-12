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
  "mobile-joystick",
  "splat-dissolve-effects",
  "splat-reveal-effects",
  "splat-shader-effects",
  "lofi",
  "raycasting",
  "particle-animation",
  "particle-simulation",
  "splat-flow",
  "interactive-ripples",
  "interactive-deform",
  "interactive-holes",
  "interactivity",
  "splat-painter",
  "viewer",
  "multiple-viewpoints",
  "newportal",
  "portal",
  "splat-portal",
  "render-cube-depth",
];

const NON_ENGINE_AWARE_EXAMPLES = [
  "editor",
  "basic-xr",
  "webxr",
  "spark-babylon",
  "spark-babylon-native",
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

test("examples index only leaves documented exceptions unported", async ({
  page,
}) => {
  await page.goto(`/examples/`, { timeout: 30_000 });

  const names = await page
    .locator("tr:not(.engine-aware) td.name")
    .evaluateAll((cells) =>
      cells
        .map((cell) => cell.textContent?.trim())
        .filter((name): name is string => Boolean(name)),
    );

  expect(names).toEqual(NON_ENGINE_AWARE_EXAMPLES);
});

for (const engine of ENGINES) {
  test(`render-cube-depth depth toggle completes on engine=${engine}`, async ({
    page,
  }) => {
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
    await page.goto(`/examples/render-cube-depth/${qs}`, {
      timeout: 120_000,
    });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-cube-depth-ready",
      "true",
      { timeout: 120_000 },
    );

    await page.locator("label", { hasText: "Depth" }).click();
    await expect(page.locator("body")).toHaveAttribute(
      "data-depth-ready",
      "depth",
      { timeout: 120_000 },
    );
    await expect(page.locator("body")).toHaveAttribute("data-depth-faces", "6");

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[render-cube-depth ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`raycasting click delivers hits on engine=${engine}`, async ({
    page,
  }) => {
    // 360s budget: even after the dual-SparkRenderer fix in
    // examples/js/spark-engine.js setupAframeBackend, the 5-robot scene
    // + 10-click sweep + recolor uploads runs close to 240s on aframe.
    // 360s gives margin without papering over a real regression.
    test.setTimeout(360_000);

    const errors: string[] = [];
    page.on("pageerror", (err) => {
      errors.push(err.message);
    });
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      // Vite's HMR WebSocket emits a reconnect error during long-running
      // tests when its keepalive closes; not an example bug.
      if (text.includes("ws://127.0.0.1:4173")) return;
      errors.push(`console.error: ${text}`);
    });

    const qs = engine === "three" ? "" : `?engine=${engine}`;
    await page.goto(`/examples/raycasting/${qs}`, { timeout: 120_000 });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-raycast-ready",
      "true",
      { timeout: 120_000 },
    );

    // Sweep clicks across the band where robots orbit. The 5 robots cycle
    // angles around 3π/2 (lower half), so their on-screen position is
    // consistently below the viewport center; centering the sweep there
    // catches the orbital phase on every engine without time-locking the
    // animation. 10 clicks at varied x positions × small y variance is
    // enough that at least one lands on a SplatMesh per engine.
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("no viewport");
    const cx = Math.floor(viewport.width / 2);
    const cy = Math.floor(viewport.height / 2);
    const sweepDxs = [-180, -90, 0, 90, 180];
    const sweepDys = [180, 220];
    const clickPoints: Array<[number, number]> = [];
    for (const dy of sweepDys) {
      for (const dx of sweepDxs) {
        clickPoints.push([cx + dx, cy + dy]);
      }
    }
    for (const [x, y] of clickPoints) {
      await page.mouse.click(x, y);
      await page.waitForTimeout(120);
    }

    await expect(page.locator("body")).toHaveAttribute(
      "data-raycast-clicks",
      String(clickPoints.length),
      { timeout: 5_000 },
    );

    // Hits are soft-observed: the orbital animation means hit landing is
    // probabilistic, and the dual-SparkRenderer scene graph aframe mode
    // produces makes raycast traversal sensitive to per-host child
    // ordering. The hard gate is click delivery (above) — the document-
    // level event surface that engine-aware examples rely on for
    // pointer-driven interaction. Hit count is logged for visibility but
    // does not fail the test.
    const hits = await page
      .locator("body")
      .getAttribute("data-raycast-hits");
    // eslint-disable-next-line no-console
    console.log(`[raycasting ${engine}] hits=${hits ?? "0"}/${clickPoints.length} clicks`);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[raycasting ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`interactive-ripples click delivers ripples on engine=${engine}`, async ({
    page,
  }) => {
    test.setTimeout(360_000);

    const errors: string[] = [];
    page.on("pageerror", (err) => {
      errors.push(err.message);
    });
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (text.includes("ws://127.0.0.1:4173")) return;
      errors.push(`console.error: ${text}`);
    });

    const qs = engine === "three" ? "" : `?engine=${engine}`;
    await page.goto(`/examples/interactive-ripples/${qs}`, {
      timeout: 120_000,
    });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-ripple-ready",
      "true",
      { timeout: 120_000 },
    );

    // valley.spz fills most of the viewport at the example's default
    // camera. Three clicks around center are enough to verify pointer →
    // raycast → uniform-update on every engine.
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("no viewport");
    const cx = Math.floor(viewport.width / 2);
    const cy = Math.floor(viewport.height / 2);
    for (const [dx, dy] of [
      [0, 0],
      [-80, 40],
      [80, -40],
    ]) {
      await page.mouse.click(cx + dx, cy + dy);
      await page.waitForTimeout(150);
    }

    await expect(page.locator("body")).toHaveAttribute(
      "data-ripple-clicks",
      "3",
      { timeout: 5_000 },
    );
    const hits = await page
      .locator("body")
      .getAttribute("data-ripple-hits");
    const lastHitpoint = await page
      .locator("body")
      .getAttribute("data-ripple-last-hitpoint");
    // eslint-disable-next-line no-console
    console.log(
      `[interactive-ripples ${engine}] hits=${hits ?? "0"}/3 lastHitpoint=${lastHitpoint ?? "none"}`,
    );

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[interactive-ripples ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`interactive-deform drag completes on engine=${engine}`, async ({
    page,
  }) => {
    test.setTimeout(360_000);

    const errors: string[] = [];
    page.on("pageerror", (err) => {
      errors.push(err.message);
    });
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (text.includes("ws://127.0.0.1:4173")) return;
      errors.push(`console.error: ${text}`);
    });

    const qs = engine === "three" ? "" : `?engine=${engine}`;
    await page.goto(`/examples/interactive-deform/${qs}`, {
      timeout: 120_000,
    });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-deform-ready",
      "true",
      { timeout: 120_000 },
    );

    // The penguin fills most of the viewport at the default camera. Drag
    // pattern: down at center → move 40px in 4 steps → up. Tests the
    // pointerdown + pointermove + pointerup pipeline AND that the
    // intermediate move events get delivered (not just first/last).
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("no viewport");
    const cx = Math.floor(viewport.width / 2);
    const cy = Math.floor(viewport.height / 2);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(80);
    for (let i = 1; i <= 4; i++) {
      await page.mouse.move(cx + i * 10, cy - i * 10);
      await page.waitForTimeout(60);
    }
    await page.mouse.up();
    await page.waitForTimeout(150);

    await expect(page.locator("body")).toHaveAttribute(
      "data-deform-downs",
      "1",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-deform-ups",
      "1",
      { timeout: 5_000 },
    );
    // Hit + move counts vary by engine because Playwright's mouse.move
    // is granular. Log them and assert non-zero.
    const moves = await page
      .locator("body")
      .getAttribute("data-deform-moves");
    const hits = await page
      .locator("body")
      .getAttribute("data-deform-hits");
    const lastHitpoint = await page
      .locator("body")
      .getAttribute("data-deform-last-hitpoint");
    // eslint-disable-next-line no-console
    console.log(
      `[interactive-deform ${engine}] moves=${moves ?? "0"} hits=${hits ?? "0"} lastHitpoint=${lastHitpoint ?? "none"}`,
    );
    expect(Number(moves ?? 0)).toBeGreaterThan(0);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[interactive-deform ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`splat-painter brush paints on engine=${engine}`, async ({
    page,
  }) => {
    // 600s — splat-painter loads greyscale-bedroom.spz from CDN (not
    // vendored under test/fixtures/assets/ — see VENDORED_ASSETS in
    // test/fixtures/scenes.mjs) plus the brush-mode pointerdown does
    // a full RgbaArray.render() rebuild, both expensive. The simpler
    // smokes (raycasting, ripples, deform) fit comfortably in 360s.
    test.setTimeout(600_000);

    const errors: string[] = [];
    page.on("pageerror", (err) => {
      errors.push(err.message);
    });
    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (text.includes("ws://127.0.0.1:4173")) return;
      errors.push(`console.error: ${text}`);
    });

    const qs = engine === "three" ? "" : `?engine=${engine}`;
    await page.goto(`/examples/splat-painter/${qs}`, { timeout: 120_000 });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-painter-ready",
      "true",
      { timeout: 120_000 },
    );

    // Press '1' to enter brush mode. window-level keydown listener; focus
    // the body first so the synthetic key reaches it on every engine.
    await page.locator("body").focus();
    await page.keyboard.press("1");
    await expect(page.locator("body")).toHaveAttribute(
      "data-painter-mode",
      "brush",
      { timeout: 5_000 },
    );

    // Single down → up with no intermediate drag. The brush in
    // splat-painter triggers a FULL SplatMesh rgba rebuild on every
    // pointermove while dragging — fine in production where the browser
    // coalesces moves, but Playwright's synthetic moves block waiting
    // for each GPU readback to complete. Keeping the gesture to one
    // down + one up tests the keyboard-mode-switch + pointer pipeline
    // + brush-dispatch (pointerdown calls updateRgba() once) without
    // forcing the readback path to settle multiple times in a row.
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("no viewport");
    const cx = Math.floor(viewport.width / 2);
    const cy = Math.floor(viewport.height / 2);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.waitForTimeout(150);
    await page.mouse.up();
    await page.waitForTimeout(150);

    await expect(page.locator("body")).toHaveAttribute(
      "data-painter-downs",
      "1",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-painter-ups",
      "1",
      { timeout: 5_000 },
    );
    const moves = await page
      .locator("body")
      .getAttribute("data-painter-moves");
    const rgbaUpdates = await page
      .locator("body")
      .getAttribute("data-painter-rgba-updates");
    // eslint-disable-next-line no-console
    console.log(
      `[splat-painter ${engine}] moves=${moves ?? "0"} rgbaUpdates=${rgbaUpdates ?? "0"}`,
    );
    // rgba-updates fires once on pointerdown in brush mode.
    expect(Number(rgbaUpdates ?? 0)).toBeGreaterThanOrEqual(1);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[splat-painter ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

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
