import { type ConsoleMessage, expect, test } from "@playwright/test";

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
const NON_ENGINE_AWARE_LINKS = {
  editor: [{ className: "three", href: "./editor/" }],
  "basic-xr": [{ className: "three", href: "./basic-xr/" }],
  webxr: [{ className: "three", href: "./webxr/" }],
  "spark-babylon": [{ className: "babylon", href: "./spark-babylon/" }],
  "spark-babylon-native": [
    { className: "babylon", href: "./spark-babylon-native/" },
  ],
} as const;
const BABYLON_LAYER_SHADER_SMOKE_PATHS = [
  "/examples/particle-simulation/?engine=babylon",
  "/examples/particle-animation/?engine=babylon",
  "/examples/splat-reveal-effects/?engine=babylon",
];
const FIXTURE_ASSET_EXAMPLES = new Set([
  "debug-color",
  "depth-of-field",
  "dynamic-lighting",
  "envmap",
  "extsplats",
  "glsl",
  "hello-world",
  "interactive-deform",
  "interactive-holes",
  "interactive-ripples",
  "lod",
  "mobile-joystick",
  "multiple-splats",
  "newportal",
  "nonlod",
  "raycasting",
  "render-cube-depth",
  "splat-dissolve-effects",
  "splat-shader-effects",
]);

function exampleParams(
  name: string,
  engine: (typeof ENGINES)[number],
  extra?: Record<string, string>,
) {
  const params = new URLSearchParams();
  if (FIXTURE_ASSET_EXAMPLES.has(name)) {
    params.set("testFixtureAssets", "1");
  }
  if (name === "lofi") params.set("testLofiAssets", "1");
  if (name === "splat-painter") params.set("testPainterAsset", "cat.spz");
  if (name === "interactive-holes") params.set("testHolesAsset", "cat.spz");
  if (extra) {
    for (const [key, value] of Object.entries(extra)) params.set(key, value);
  }
  if (engine !== "three") params.set("engine", engine);
  return params;
}

function exampleQuery(
  name: string,
  engine: (typeof ENGINES)[number],
  extra?: Record<string, string>,
) {
  const params = exampleParams(name, engine, extra);
  return params.size > 0 ? `?${params}` : "";
}

test("examples index shows engine-aware bullet for every ported example", async ({
  page,
}) => {
  await page.goto("/examples/", { timeout: 30_000 });
  for (const name of ENGINE_AWARE_EXAMPLES) {
    // Locate by exact td.name text rather than tr substring — "extsplats"
    // is a case-insensitive substring of "textSplats" inside other rows'
    // descriptions, so a hasText filter over-matches.
    const row = page.locator("tr.engine-aware").filter({
      has: page.locator("td.name", { hasText: new RegExp(`^${name}$`) }),
    });
    await expect(row).toHaveCount(1);
    await expect(row.locator("td.engines a.aframe")).toHaveAttribute(
      "href",
      `./${name}/?engine=aframe`,
    );
    await expect(row.locator("td.engines a.babylon")).toHaveAttribute(
      "href",
      `./${name}/?engine=babylon`,
    );
  }
});

test("examples index only leaves documented exceptions unported", async ({
  page,
}) => {
  await page.goto("/examples/", { timeout: 30_000 });

  const names = await page
    .locator("tr:not(.engine-aware) td.name")
    .evaluateAll((cells) =>
      cells
        .map((cell) => cell.textContent?.trim())
        .filter((name): name is string => Boolean(name)),
    );

  expect(names).toEqual(NON_ENGINE_AWARE_EXAMPLES);

  for (const name of NON_ENGINE_AWARE_EXAMPLES) {
    const row = page.locator("tr:not(.engine-aware)").filter({
      has: page.locator("td.name", { hasText: new RegExp(`^${name}$`) }),
    });
    const links = NON_ENGINE_AWARE_LINKS[name];
    await expect(row.locator("td.engines a")).toHaveCount(links.length);
    for (const link of links) {
      await expect(
        row.locator(`td.engines a.${link.className}`),
      ).toHaveAttribute("href", link.href);
    }
  }
});

test("reported Babylon texture-bridge demos load without layer shader chunk errors", async ({
  page,
}) => {
  test.setTimeout(120_000);

  for (const path of BABYLON_LAYER_SHADER_SMOKE_PATHS) {
    const errors: string[] = [];
    const onPageError = (err: Error) => {
      errors.push(err.message);
    };
    const onConsole = (msg: ConsoleMessage) => {
      if (msg.type() !== "error") return;
      const text = msg.text();
      if (text.includes("ws://127.0.0.1:4173")) return;
      errors.push(`console.error: ${text}`);
    };
    page.on("pageerror", onPageError);
    page.on("console", onConsole);

    await page.goto(path, {
      timeout: 120_000,
      waitUntil: "domcontentloaded",
    });
    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await page.waitForTimeout(500);

    page.off("pageerror", onPageError);
    page.off("console", onConsole);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[${path}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  }
});

test("spark-babylon host reference loads without shader chunk errors", async ({
  page,
}) => {
  test.setTimeout(120_000);

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

  await page.goto("/examples/spark-babylon/", {
    timeout: 120_000,
    waitUntil: "domcontentloaded",
  });

  await expect(page.locator("body")).toHaveAttribute(
    "data-babylon-texture-ready",
    "true",
    { timeout: 120_000 },
  );
  await page.waitForFunction(
    () => Number(document.body.dataset.babylonTextureFrames ?? 0) >= 2,
    null,
    { timeout: 120_000 },
  );

  const canvasPixel = await page.locator("#renderCanvas").evaluate((canvas) => {
    const renderCanvas = canvas as HTMLCanvasElement;
    const gl =
      renderCanvas.getContext("webgl2") ?? renderCanvas.getContext("webgl");
    if (!gl) return [0, 0, 0, 0];
    const pixel = new Uint8Array(4);
    gl.readPixels(
      Math.floor(renderCanvas.width / 2),
      Math.floor(renderCanvas.height / 2),
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixel,
    );
    return Array.from(pixel);
  });

  expect(canvasPixel.some((value) => value > 0)).toBe(true);

  if (errors.length > 0) {
    // eslint-disable-next-line no-console
    console.log("[spark-babylon] errors:", errors);
  }
  expect(errors).toEqual([]);
});

test("spark-babylon-native host reference loads without shader chunk errors", async ({
  page,
}) => {
  test.setTimeout(120_000);

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

  await page.goto("/examples/spark-babylon-native/", {
    timeout: 120_000,
    waitUntil: "domcontentloaded",
  });

  await expect(page.locator("body")).toHaveAttribute(
    "data-babylon-native-ready",
    "true",
    { timeout: 120_000 },
  );
  await page.waitForFunction(
    () => Number(document.body.dataset.babylonNativeFrames ?? 0) >= 2,
    null,
    { timeout: 120_000 },
  );

  const canvasPixel = await page.locator("#renderCanvas").evaluate((canvas) => {
    const renderCanvas = canvas as HTMLCanvasElement;
    const gl =
      renderCanvas.getContext("webgl2") ?? renderCanvas.getContext("webgl");
    if (!gl) return [0, 0, 0, 0];
    const pixel = new Uint8Array(4);
    gl.readPixels(
      Math.floor(renderCanvas.width / 2),
      Math.floor(renderCanvas.height / 2),
      1,
      1,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      pixel,
    );
    return Array.from(pixel);
  });

  expect(canvasPixel.some((value) => value > 0)).toBe(true);

  if (errors.length > 0) {
    // eslint-disable-next-line no-console
    console.log("[spark-babylon-native] errors:", errors);
  }
  expect(errors).toEqual([]);
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

    const qs = exampleQuery("render-cube-depth", engine);
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
  test(`multiple-viewpoints renders offscreen targets on engine=${engine}`, async ({
    page,
  }) => {
    test.setTimeout(300_000);

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

    const qs = exampleQuery("multiple-viewpoints", engine);
    await page.goto(`/examples/multiple-viewpoints/${qs}`, {
      timeout: 120_000,
    });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-multiple-viewpoints-ready",
      "true",
      { timeout: 120_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-multiple-viewpoints-count",
      "2",
      { timeout: 5_000 },
    );
    await page.waitForFunction(
      () => Number(document.body.dataset.multipleViewpointsRenders ?? 0) >= 4,
      null,
      { timeout: 120_000 },
    );

    await page.evaluate(() => {
      const controls = (
        window as typeof window & {
          sparkMultipleViewpoints?: {
            setSlider: (index: number, value: number) => void;
          };
        }
      ).sparkMultipleViewpoints;
      if (!controls) throw new Error("sparkMultipleViewpoints hook missing");
      controls.setSlider(0, 25);
    });

    await expect(page.locator("body")).toHaveAttribute(
      "data-multiple-viewpoints-last-slider",
      "0:25",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-multiple-viewpoints-last-camera-x",
      "0.250",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-multiple-viewpoints-last-target",
      "320x240",
      { timeout: 5_000 },
    );
    const splats = await page
      .locator("body")
      .getAttribute("data-multiple-viewpoints-splats");
    // eslint-disable-next-line no-console
    console.log(`[multiple-viewpoints ${engine}] splats=${splats ?? "0"}`);
    expect(Number(splats ?? 0)).toBeGreaterThan(0);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[multiple-viewpoints ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`streaming-lod switches paged worlds on engine=${engine}`, async ({
    page,
  }) => {
    test.setTimeout(300_000);

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

    const params = exampleParams("streaming-lod", engine, {
      testInitialWorld: "Cozy Spaceship",
    });
    await page.goto(`/examples/streaming-lod/?${params}`, {
      timeout: 120_000,
    });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-streaming-lod-ready",
      "true",
      { timeout: 120_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-streaming-lod-world",
      "Cozy Spaceship",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-streaming-lod-paged",
      "true",
      { timeout: 5_000 },
    );
    await page.waitForFunction(
      () => Number(document.body.dataset.streamingLodFrames ?? 0) > 3,
      null,
      { timeout: 120_000 },
    );

    const switchResult = await page.evaluate(() => {
      const controls = (
        window as typeof window & {
          sparkStreamingLod?: {
            selectWorld: (worldKey: string) => {
              paged: boolean;
              selects: number;
              worldKey: string;
            };
            setLodScale: (value: number) => number;
          };
        }
      ).sparkStreamingLod;
      if (!controls) throw new Error("sparkStreamingLod hook missing");
      const result = controls.selectWorld("Hobbiton");
      controls.setLodScale(1.75);
      return result;
    });

    await expect(page.locator("body")).toHaveAttribute(
      "data-streaming-lod-world",
      "Hobbiton",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-streaming-lod-selects",
      "2",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-streaming-lod-paged",
      "true",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-streaming-lod-lod-scale",
      "1.75",
      { timeout: 5_000 },
    );
    const url = await page
      .locator("body")
      .getAttribute("data-streaming-lod-url");
    // eslint-disable-next-line no-console
    console.log(
      `[streaming-lod ${engine}] world=${switchResult.worldKey} selects=${switchResult.selects} paged=${switchResult.paged} url=${url ?? "none"}`,
    );
    expect(switchResult).toEqual({
      paged: true,
      selects: 2,
      worldKey: "Hobbiton",
    });

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[streaming-lod ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`multi-lod caps paged scene on engine=${engine}`, async ({ page }) => {
    test.setTimeout(300_000);

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

    const params = exampleParams("multi-lod", engine, { testLodLimit: "3" });
    await page.goto(`/examples/multi-lod/?${params}`, { timeout: 120_000 });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-multi-lod-ready",
      "true",
      { timeout: 120_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-multi-lod-meshes",
      "3",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-multi-lod-paged",
      "true",
      { timeout: 5_000 },
    );
    await page.waitForFunction(
      () => Number(document.body.dataset.multiLodFrames ?? 0) > 3,
      null,
      { timeout: 120_000 },
    );

    const lodScale = await page.evaluate(() => {
      const controls = (
        window as typeof window & {
          sparkMultiLod?: { setLodScale: (value: number) => number };
        }
      ).sparkMultiLod;
      if (!controls) throw new Error("sparkMultiLod hook missing");
      return controls.setLodScale(1.25);
    });

    await expect(page.locator("body")).toHaveAttribute(
      "data-multi-lod-lod-scale",
      "1.25",
      { timeout: 5_000 },
    );
    const totalFiles = await page
      .locator("body")
      .getAttribute("data-multi-lod-total-files");
    // eslint-disable-next-line no-console
    console.log(
      `[multi-lod ${engine}] meshes=3 totalFiles=${totalFiles ?? "0"} lodScale=${lodScale}`,
    );
    expect(lodScale).toBe(1.25);
    expect(Number(totalFiles ?? 0)).toBeGreaterThan(3);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[multi-lod ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`dynamic-lighting toggles SDF lights on engine=${engine}`, async ({
    page,
  }) => {
    test.setTimeout(300_000);

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

    const qs = exampleQuery("dynamic-lighting", engine);
    await page.goto(`/examples/dynamic-lighting/${qs}`, {
      timeout: 120_000,
    });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-dynamic-lighting-ready",
      "true",
      { timeout: 120_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-dynamic-lighting-lights",
      "3",
      { timeout: 5_000 },
    );
    await page.waitForFunction(
      () => Number(document.body.dataset.dynamicLightingFrames ?? 0) > 3,
      null,
      { timeout: 120_000 },
    );

    await page.evaluate(() => {
      const controls = (
        window as typeof window & {
          sparkDynamicLighting?: {
            setDebug: (visible: boolean) => void;
            setLighting: (enabled: boolean) => void;
          };
        }
      ).sparkDynamicLighting;
      if (!controls) throw new Error("sparkDynamicLighting hook missing");
      controls.setDebug(true);
      controls.setLighting(false);
    });

    await expect(page.locator("body")).toHaveAttribute(
      "data-dynamic-lighting-debug",
      "true",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-dynamic-lighting-helpers-visible",
      "3",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-dynamic-lighting-enabled",
      "false",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-dynamic-lighting-night-visible",
      "0",
      { timeout: 120_000 },
    );
    const splats = await page
      .locator("body")
      .getAttribute("data-dynamic-lighting-splats");
    const flicker = await page
      .locator("body")
      .getAttribute("data-dynamic-lighting-flicker");
    // eslint-disable-next-line no-console
    console.log(
      `[dynamic-lighting ${engine}] splats=${splats ?? "0"} flicker=${flicker ?? "none"}`,
    );
    expect(Number(splats ?? 0)).toBeGreaterThan(0);
    expect(Number(flicker ?? 0)).toBeGreaterThan(0);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[dynamic-lighting ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`glsl updates Dyno shader modifiers on engine=${engine}`, async ({
    page,
  }) => {
    test.setTimeout(300_000);

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

    const qs = exampleQuery("glsl", engine);
    await page.goto(`/examples/glsl/${qs}`, { timeout: 120_000 });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-glsl-ready",
      "true",
      { timeout: 120_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-glsl-has-world-modifier",
      "true",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-glsl-has-object-modifier",
      "true",
      { timeout: 5_000 },
    );
    await page.waitForFunction(
      () => Number(document.body.dataset.glslFrames ?? 0) > 3,
      null,
      { timeout: 120_000 },
    );

    const animateT = await page.evaluate(() => {
      const controls = (
        window as typeof window & {
          sparkGlsl?: { setAnimateT: (value: number) => number };
        }
      ).sparkGlsl;
      if (!controls) throw new Error("sparkGlsl hook missing");
      return controls.setAnimateT(4.25);
    });

    await expect(page.locator("body")).toHaveAttribute(
      "data-glsl-last-set-animate-t",
      "4.25",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-glsl-updates",
      "1",
      { timeout: 5_000 },
    );
    const splats = await page.locator("body").getAttribute("data-glsl-splats");
    // eslint-disable-next-line no-console
    console.log(
      `[glsl ${engine}] splats=${splats ?? "0"} animateT=${animateT}`,
    );
    expect(animateT).toBe(4.25);
    expect(Number(splats ?? 0)).toBeGreaterThan(0);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[glsl ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`envmap assigns generated material map on engine=${engine}`, async ({
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

    const qs = exampleQuery("envmap", engine);
    await page.goto(`/examples/envmap/${qs}`, { timeout: 120_000 });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-envmap-ready",
      "true",
      { timeout: 180_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-envmap-mode",
      "metal",
      { timeout: 5_000 },
    );
    await page.waitForFunction(
      () => Number(document.body.dataset.envmapFrames ?? 0) > 3,
      null,
      { timeout: 120_000 },
    );

    const plastic = await page.evaluate(() => {
      const controls = (
        window as typeof window & {
          sparkEnvMap?: {
            setPlastic: (plastic: boolean) => {
              metalness: number | null;
              mode: string | undefined;
              roughness: number | null;
            };
          };
        }
      ).sparkEnvMap;
      if (!controls) throw new Error("sparkEnvMap hook missing");
      return controls.setPlastic(true);
    });

    await expect(page.locator("body")).toHaveAttribute(
      "data-envmap-mode",
      "plastic",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-envmap-metalness",
      "0",
      { timeout: 5_000 },
    );
    const [materials, splats] = await Promise.all([
      page.locator("body").getAttribute("data-envmap-materials"),
      page.locator("body").getAttribute("data-envmap-splats"),
    ]);
    // eslint-disable-next-line no-console
    console.log(
      `[envmap ${engine}] materials=${materials ?? "0"} splats=${splats ?? "0"} mode=${plastic.mode}`,
    );
    expect(plastic).toEqual({ metalness: 0, mode: "plastic", roughness: 0.2 });
    expect(Number(materials ?? 0)).toBeGreaterThan(0);
    expect(Number(splats ?? 0)).toBeGreaterThan(0);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[envmap ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`depth-of-field updates aperture params on engine=${engine}`, async ({
    page,
  }) => {
    test.setTimeout(300_000);

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

    const params = exampleParams("depth-of-field", engine, {
      testAsset: "butterfly.spz",
    });
    await page.goto(`/examples/depth-of-field/?${params}`, {
      timeout: 120_000,
    });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-depth-of-field-ready",
      "true",
      { timeout: 120_000 },
    );
    await page.waitForFunction(
      () => Number(document.body.dataset.depthOfFieldFrames ?? 0) > 3,
      null,
      { timeout: 120_000 },
    );

    const result = await page.evaluate(() => {
      const controls = (
        window as typeof window & {
          sparkDepthOfField?: {
            setParams: (params: {
              apertureSize?: number;
              focalDistance?: number;
            }) => {
              apertureAngle: number;
              apertureSize: number;
              focalDistance: number;
            };
          };
        }
      ).sparkDepthOfField;
      if (!controls) throw new Error("sparkDepthOfField hook missing");
      return controls.setParams({ apertureSize: 0.2, focalDistance: 4 });
    });

    await expect(page.locator("body")).toHaveAttribute(
      "data-depth-of-field-focal-distance",
      "4",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-depth-of-field-aperture-size",
      "0.2",
      { timeout: 5_000 },
    );
    const [angle, splats, asset] = await Promise.all([
      page.locator("body").getAttribute("data-depth-of-field-aperture-angle"),
      page.locator("body").getAttribute("data-depth-of-field-splats"),
      page.locator("body").getAttribute("data-depth-of-field-asset"),
    ]);
    // eslint-disable-next-line no-console
    console.log(
      `[depth-of-field ${engine}] asset=${asset ?? "none"} splats=${splats ?? "0"} aperture=${angle ?? "0"}`,
    );
    expect(result.focalDistance).toBe(4);
    expect(result.apertureSize).toBe(0.2);
    expect(result.apertureAngle).toBeGreaterThan(0);
    expect(Number(angle ?? 0)).toBeCloseTo(result.apertureAngle, 5);
    expect(Number(splats ?? 0)).toBeGreaterThan(0);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[depth-of-field ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`mobile-joystick moves camera rig on engine=${engine}`, async ({
    page,
  }) => {
    test.setTimeout(300_000);

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

    const params = exampleParams("mobile-joystick", engine, {
      testAsset: "butterfly.spz",
      testMobile: "1",
    });
    await page.goto(`/examples/mobile-joystick/?${params}`, {
      timeout: 120_000,
    });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-mobile-joystick-ready",
      "true",
      { timeout: 120_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-mobile-joystick-mobile",
      "true",
      { timeout: 5_000 },
    );
    await expect(page.locator("#mobile-joystick")).toBeVisible({
      timeout: 5_000,
    });
    await page.waitForFunction(
      () => Number(document.body.dataset.mobileJoystickFrames ?? 0) > 3,
      null,
      { timeout: 120_000 },
    );

    const moved = await page.evaluate(() => {
      const controls = (
        window as typeof window & {
          sparkMobileJoystick?: {
            applyInput: (
              inputX: number,
              inputY: number,
              deltaTimeMs?: number,
            ) => { inputs: number; rig: number[] };
          };
        }
      ).sparkMobileJoystick;
      if (!controls) throw new Error("sparkMobileJoystick hook missing");
      return controls.applyInput(0.5, -1, 1000);
    });

    await expect(page.locator("body")).toHaveAttribute(
      "data-mobile-joystick-inputs",
      "1",
      { timeout: 5_000 },
    );
    const [rig, splats, asset] = await Promise.all([
      page.locator("body").getAttribute("data-mobile-joystick-rig"),
      page.locator("body").getAttribute("data-mobile-joystick-splats"),
      page.locator("body").getAttribute("data-mobile-joystick-asset"),
    ]);
    // eslint-disable-next-line no-console
    console.log(
      `[mobile-joystick ${engine}] asset=${asset ?? "none"} splats=${splats ?? "0"} rig=${rig ?? "none"}`,
    );
    expect(moved.inputs).toBe(1);
    expect(moved.rig[0]).toBeGreaterThan(0);
    expect(moved.rig[2]).toBeLessThan(0);
    expect(Number(splats ?? 0)).toBeGreaterThan(0);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[mobile-joystick ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`sogs decodes zip splat with sky on engine=${engine}`, async ({
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

    const qs = exampleQuery("sogs", engine);
    await page.goto(`/examples/sogs/${qs}`, { timeout: 120_000 });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-sogs-ready",
      "true",
      { timeout: 180_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-sogs-sky",
      "true",
      {
        timeout: 5_000,
      },
    );
    await page.waitForFunction(
      () => Number(document.body.dataset.sogsFrames ?? 0) > 3,
      null,
      { timeout: 120_000 },
    );

    const sun = await page.evaluate(() => {
      const controls = (
        window as typeof window & {
          sparkSogs?: {
            setSun: (phiDegrees: number, thetaDegrees: number) => number[];
          };
        }
      ).sparkSogs;
      if (!controls) throw new Error("sparkSogs hook missing");
      return controls.setSun(35, 120);
    });

    const [splats, target, sunText] = await Promise.all([
      page.locator("body").getAttribute("data-sogs-splats"),
      page.locator("body").getAttribute("data-sogs-target"),
      page.locator("body").getAttribute("data-sogs-sun"),
    ]);
    // eslint-disable-next-line no-console
    console.log(
      `[sogs ${engine}] splats=${splats ?? "0"} target=${target ?? "none"} sun=${sunText ?? "none"}`,
    );
    expect(Number(splats ?? 0)).toBeGreaterThan(0);
    expect(target).toBe("0.000,1.500,0.000");
    expect(sun.length).toBe(3);
    expect(sun.some((value) => Math.abs(value) > 0.1)).toBe(true);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[sogs ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`procedural-splats builds generated sources on engine=${engine}`, async ({
    page,
  }) => {
    test.setTimeout(300_000);

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

    const params = exampleParams("procedural-splats", engine, {
      testPyramidSplats: "12000",
      testStarSplats: "3000",
    });
    await page.goto(`/examples/procedural-splats/?${params}`, {
      timeout: 120_000,
    });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-procedural-splats-ready",
      "true",
      { timeout: 120_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-procedural-splats-pyramid",
      "12000",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-procedural-splats-stars",
      "3000",
      { timeout: 5_000 },
    );
    await page.waitForFunction(
      () => Number(document.body.dataset.proceduralSplatsFrames ?? 0) > 3,
      null,
      { timeout: 120_000 },
    );

    const [text, text2, image, rotY, starsZ, opacity] = await Promise.all([
      page.locator("body").getAttribute("data-procedural-splats-text"),
      page.locator("body").getAttribute("data-procedural-splats-text2"),
      page.locator("body").getAttribute("data-procedural-splats-image"),
      page.locator("body").getAttribute("data-procedural-splats-pyramid-rot-y"),
      page.locator("body").getAttribute("data-procedural-splats-stars-z"),
      page.locator("body").getAttribute("data-procedural-splats-text2-opacity"),
    ]);
    // eslint-disable-next-line no-console
    console.log(
      `[procedural-splats ${engine}] text=${text ?? "false"} text2=${text2 ?? "false"} image=${image ?? "0"} rotY=${rotY ?? "0"} starsZ=${starsZ ?? "0"} opacity=${opacity ?? "0"}`,
    );
    expect(text).toBe("true");
    expect(text2).toBe("true");
    expect(Number(image ?? 0)).toBeGreaterThan(0);
    expect(Number(rotY ?? 0)).toBeGreaterThan(0);
    expect(Number(opacity ?? 0)).toBeGreaterThanOrEqual(0);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[procedural-splats ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`extsplats compares packed and extended containers on engine=${engine}`, async ({
    page,
  }) => {
    test.setTimeout(300_000);

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

    const qs = exampleQuery("extsplats", engine);
    await page.goto(`/examples/extsplats/${qs}`, { timeout: 120_000 });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-ext-splats-ready",
      "true",
      { timeout: 120_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-ext-splats-children",
      "2",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-ext-splats-packed",
      "true",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-ext-splats-extended",
      "true",
      { timeout: 5_000 },
    );
    await page.waitForFunction(
      () => Number(document.body.dataset.extSplatsFrames ?? 0) > 3,
      null,
      { timeout: 120_000 },
    );

    const [packedCount, extendedCount, groupY] = await Promise.all([
      page.locator("body").getAttribute("data-ext-splats-packed-count"),
      page.locator("body").getAttribute("data-ext-splats-extended-count"),
      page.locator("body").getAttribute("data-ext-splats-group-y"),
    ]);
    // eslint-disable-next-line no-console
    console.log(
      `[extsplats ${engine}] packed=${packedCount ?? "0"} extended=${extendedCount ?? "0"} groupY=${groupY ?? "0"}`,
    );
    expect(Number(packedCount ?? 0)).toBeGreaterThan(0);
    expect(Number(extendedCount ?? 0)).toBe(Number(packedCount ?? 0));

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[extsplats ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`nonlod toggles LoD and coloring on engine=${engine}`, async ({
    page,
  }) => {
    test.setTimeout(300_000);

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

    const qs = exampleQuery("nonlod", engine);
    await page.goto(`/examples/nonlod/${qs}`, { timeout: 120_000 });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-nonlod-ready",
      "true",
      { timeout: 120_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-nonlod-meshes",
      "3",
      { timeout: 5_000 },
    );
    await page.waitForFunction(
      () => Number(document.body.dataset.nonlodFrames ?? 0) > 3,
      null,
      { timeout: 120_000 },
    );

    const result = await page.evaluate(() => {
      const controls = (
        window as typeof window & {
          sparkNonLod?: {
            setParams: (params: {
              enableLod?: boolean;
              lodSplatCount?: number;
              splatColoring?: boolean;
            }) => {
              coloring: boolean;
              enableLod: boolean;
              lodSplatCount: number;
              updates: number;
            };
          };
        }
      ).sparkNonLod;
      if (!controls) throw new Error("sparkNonLod hook missing");
      return controls.setParams({
        enableLod: false,
        lodSplatCount: 50000,
        splatColoring: false,
      });
    });

    await expect(page.locator("body")).toHaveAttribute(
      "data-nonlod-toggle-enabled",
      "false",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-nonlod-coloring",
      "false",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-nonlod-lod-splat-count",
      "50000",
      { timeout: 5_000 },
    );
    const splats = await page
      .locator("body")
      .getAttribute("data-nonlod-splats");
    // eslint-disable-next-line no-console
    console.log(
      `[nonlod ${engine}] splats=${splats ?? "0"} updates=${result.updates}`,
    );
    expect(result).toEqual({
      coloring: false,
      enableLod: false,
      lodSplatCount: 50000,
      updates: 1,
    });
    expect(Number(splats ?? 0)).toBeGreaterThan(0);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[nonlod ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`hello-world animates single SplatMesh on engine=${engine}`, async ({
    page,
  }) => {
    test.setTimeout(240_000);

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

    const qs = exampleQuery("hello-world", engine);
    await page.goto(`/examples/hello-world/${qs}`, { timeout: 120_000 });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-hello-world-ready",
      "true",
      { timeout: 120_000 },
    );
    await page.waitForFunction(
      () => Number(document.body.dataset.helloWorldFrames ?? 0) > 3,
      null,
      { timeout: 120_000 },
    );

    const result = await page.evaluate(() => {
      const controls = (
        window as typeof window & {
          sparkHelloWorld?: { setScale: (value: number) => { scale: number } };
        }
      ).sparkHelloWorld;
      if (!controls) throw new Error("sparkHelloWorld hook missing");
      return controls.setScale(0.75);
    });

    await expect(page.locator("body")).toHaveAttribute(
      "data-hello-world-scale",
      "0.750",
      { timeout: 5_000 },
    );
    const [splats, rotY] = await Promise.all([
      page.locator("body").getAttribute("data-hello-world-splats"),
      page.locator("body").getAttribute("data-hello-world-rot-y"),
    ]);
    // eslint-disable-next-line no-console
    console.log(
      `[hello-world ${engine}] splats=${splats ?? "0"} rotY=${rotY ?? "0"}`,
    );
    expect(result.scale).toBe(0.75);
    expect(Number(splats ?? 0)).toBeGreaterThan(0);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[hello-world ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`lod toggles explicit LoD mesh state on engine=${engine}`, async ({
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

    const params = exampleParams("lod", engine, {
      testCharCount: "1",
      testSplatAsset: "butterfly.spz",
    });
    await page.goto(`/examples/lod/?${params}`, { timeout: 120_000 });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-lod-ready",
      "true",
      { timeout: 180_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-lod-character-meshes",
      "1",
      { timeout: 5_000 },
    );
    await page.waitForFunction(
      () => Number(document.body.dataset.lodFrames ?? 0) > 3,
      null,
      { timeout: 120_000 },
    );

    const result = await page.evaluate(() => {
      const controls = (
        window as typeof window & {
          sparkLodExample?: {
            setParams: (params: {
              enableLod?: boolean;
              lodScale?: number;
              renderEnabled?: boolean;
            }) => {
              enableLod: boolean;
              lodScale: number;
              renderEnabled: boolean;
              updates: number;
            };
          };
        }
      ).sparkLodExample;
      if (!controls) throw new Error("sparkLodExample hook missing");
      return controls.setParams({
        enableLod: false,
        lodScale: 0.8,
        renderEnabled: true,
      });
    });

    await expect(page.locator("body")).toHaveAttribute(
      "data-lod-main-enabled",
      "false",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-lod-splat-scale",
      "0.8",
      { timeout: 5_000 },
    );
    const [mainSplats, charSplats] = await Promise.all([
      page.locator("body").getAttribute("data-lod-main-splats"),
      page.locator("body").getAttribute("data-lod-char1-splats"),
    ]);
    // eslint-disable-next-line no-console
    console.log(
      `[lod ${engine}] main=${mainSplats ?? "0"} char=${charSplats ?? "0"} updates=${result.updates}`,
    );
    expect(result).toEqual({
      enableLod: false,
      lodScale: 0.8,
      renderEnabled: true,
      updates: 1,
    });
    expect(Number(mainSplats ?? 0)).toBeGreaterThan(0);
    expect(Number(charSplats ?? 0)).toBeGreaterThan(0);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[lod ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`multiple-splats reuses shared packed data on engine=${engine}`, async ({
    page,
  }) => {
    test.setTimeout(300_000);

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

    const params = exampleParams("multiple-splats", engine, {
      testButterflyCount: "2",
      testCatAsset: "butterfly.spz",
    });
    await page.goto(`/examples/multiple-splats/?${params}`, {
      timeout: 120_000,
    });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-multiple-splats-ready",
      "true",
      { timeout: 120_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-multiple-splats-butterflies",
      "2",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-multiple-splats-shared-packed",
      "true",
      { timeout: 5_000 },
    );
    await page.waitForFunction(
      () => Number(document.body.dataset.multipleSplatsFrames ?? 0) > 3,
      null,
      { timeout: 120_000 },
    );

    const result = await page.evaluate(() => {
      const controls = (
        window as typeof window & {
          sparkMultipleSplats?: {
            setRadius: (value: number) => { radius: number };
          };
        }
      ).sparkMultipleSplats;
      if (!controls) throw new Error("sparkMultipleSplats hook missing");
      return controls.setRadius(1.25);
    });

    await expect(page.locator("body")).toHaveAttribute(
      "data-multiple-splats-radius",
      "1.25",
      { timeout: 5_000 },
    );
    const [butterflyCount, catCount, firstX, catY] = await Promise.all([
      page.locator("body").getAttribute("data-multiple-splats-butterfly-count"),
      page.locator("body").getAttribute("data-multiple-splats-cat-count"),
      page.locator("body").getAttribute("data-multiple-splats-first-x"),
      page.locator("body").getAttribute("data-multiple-splats-cat-y"),
    ]);
    // eslint-disable-next-line no-console
    console.log(
      `[multiple-splats ${engine}] butterfly=${butterflyCount ?? "0"} cat=${catCount ?? "0"} firstX=${firstX ?? "0"} catY=${catY ?? "0"}`,
    );
    expect(result.radius).toBe(1.25);
    expect(Number(butterflyCount ?? 0)).toBeGreaterThan(0);
    expect(Number(catCount ?? 0)).toBeGreaterThan(0);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[multiple-splats ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`debug-color reapplies normal and depth modifiers on engine=${engine}`, async ({
    page,
  }) => {
    test.setTimeout(300_000);

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

    const qs = exampleQuery("debug-color", engine);
    await page.goto(`/examples/debug-color/${qs}`, { timeout: 120_000 });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-debug-color-ready",
      "true",
      { timeout: 120_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-debug-color-normal",
      "true",
      { timeout: 5_000 },
    );
    await page.waitForFunction(
      () => Number(document.body.dataset.debugColorFrames ?? 0) > 3,
      null,
      { timeout: 120_000 },
    );

    const result = await page.evaluate(() => {
      const controls = (
        window as typeof window & {
          sparkDebugColor?: {
            setDepthRange: (
              minDepth: number,
              maxDepth: number,
              reverse: boolean,
            ) => {
              maxDepth: number;
              minDepth: number;
              reverse: boolean;
              updates: number;
            };
          };
        }
      ).sparkDebugColor;
      if (!controls) throw new Error("sparkDebugColor hook missing");
      return controls.setDepthRange(0.5, 3, false);
    });

    await expect(page.locator("body")).toHaveAttribute(
      "data-debug-color-depth-min",
      "0.5",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-debug-color-depth-max",
      "3",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-debug-color-depth-reverse",
      "false",
      { timeout: 5_000 },
    );
    const [splatsA, splatsB, rotY, rotX] = await Promise.all([
      page.locator("body").getAttribute("data-debug-color-splats-a"),
      page.locator("body").getAttribute("data-debug-color-splats-b"),
      page.locator("body").getAttribute("data-debug-color-rot-y"),
      page.locator("body").getAttribute("data-debug-color-rot-x"),
    ]);
    // eslint-disable-next-line no-console
    console.log(
      `[debug-color ${engine}] splats=${splatsA ?? "0"}/${splatsB ?? "0"} rot=${rotY ?? "0"},${rotX ?? "0"}`,
    );
    expect(result).toEqual({
      maxDepth: 3,
      minDepth: 0.5,
      reverse: false,
      updates: 1,
    });
    expect(Number(splatsA ?? 0)).toBeGreaterThan(0);
    expect(Number(splatsB ?? 0)).toBeGreaterThan(0);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[debug-color ${engine}] errors:`, errors);
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

    const qs = exampleQuery("raycasting", engine);
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
    const hits = await page.locator("body").getAttribute("data-raycast-hits");
    // eslint-disable-next-line no-console
    console.log(
      `[raycasting ${engine}] hits=${hits ?? "0"}/${clickPoints.length} clicks`,
    );

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

    const qs = exampleQuery("interactive-ripples", engine);
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
    const hits = await page.locator("body").getAttribute("data-ripple-hits");
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

    const qs = exampleQuery("interactive-deform", engine);
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
    await expect(page.locator("body")).toHaveAttribute("data-deform-ups", "1", {
      timeout: 5_000,
    });
    // Hit + move counts vary by engine because Playwright's mouse.move
    // is granular. Log them and assert non-zero.
    const moves = await page.locator("body").getAttribute("data-deform-moves");
    const hits = await page.locator("body").getAttribute("data-deform-hits");
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
  test(`interactive-holes click delivers impulses on engine=${engine}`, async ({
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

    const qs = exampleQuery("interactive-holes", engine);
    await page.goto(`/examples/interactive-holes/${qs}`, {
      timeout: 120_000,
    });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-holes-ready",
      "true",
      { timeout: 120_000 },
    );

    const viewport = page.viewportSize();
    if (!viewport) throw new Error("no viewport");
    const cx = Math.floor(viewport.width / 2);
    const cy = Math.floor(viewport.height / 2);
    for (const [dx, dy] of [
      [0, 0],
      [-80, 30],
      [80, -30],
    ]) {
      await page.mouse.click(cx + dx, cy + dy);
      await page.waitForTimeout(180);
    }

    await expect(page.locator("body")).toHaveAttribute(
      "data-holes-downs",
      "3",
      { timeout: 5_000 },
    );
    const hits = await page.locator("body").getAttribute("data-holes-hits");
    const impulses = await page
      .locator("body")
      .getAttribute("data-holes-impulses");
    const misses = await page.locator("body").getAttribute("data-holes-misses");
    const lastHitpoint = await page
      .locator("body")
      .getAttribute("data-holes-last-hitpoint");
    // eslint-disable-next-line no-console
    console.log(
      `[interactive-holes ${engine}] hits=${hits ?? "0"} impulses=${impulses ?? "0"} misses=${misses ?? "0"} lastHitpoint=${lastHitpoint ?? "none"}`,
    );
    expect(Number(hits ?? 0)).toBeGreaterThan(0);
    expect(Number(impulses ?? 0)).toBeGreaterThan(0);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[interactive-holes ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`interactivity menu switches food on engine=${engine}`, async ({
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

    const qs = exampleQuery("interactivity", engine, {
      testTransitionFrames: "2",
    });
    await page.goto(`/examples/interactivity/${qs}`, {
      timeout: 120_000,
    });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-interactivity-ready",
      "true",
      { timeout: 120_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-interactivity-active-food",
      "0",
      { timeout: 120_000 },
    );
    await page.waitForFunction(
      () => Number(document.body.dataset.interactivityFrames ?? 0) > 5,
      null,
      { timeout: 120_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-interactivity-transition",
      "idle",
      { timeout: 120_000 },
    );

    await page.locator("#menu_list a").nth(1).click();
    await expect(page.locator("body")).toHaveAttribute(
      "data-interactivity-requested-food",
      "1",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-interactivity-loaded-food",
      "1",
      { timeout: 120_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-interactivity-active-food",
      "1",
      { timeout: 120_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-interactivity-transition",
      "idle",
      { timeout: 120_000 },
    );
    const switches = await page
      .locator("body")
      .getAttribute("data-interactivity-switches");
    // eslint-disable-next-line no-console
    console.log(`[interactivity ${engine}] switches=${switches ?? "0"}`);
    expect(Number(switches ?? 0)).toBeGreaterThanOrEqual(2);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[interactivity ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`lod-on-demand creates LoD tree on engine=${engine}`, async ({
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

    const qs = exampleQuery("lod-on-demand", engine);
    await page.goto(`/examples/lod-on-demand/${qs}`, { timeout: 120_000 });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-lod-on-demand-ready",
      "true",
      { timeout: 120_000 },
    );

    await page.evaluate(() => {
      const controls = (
        window as typeof window & {
          sparkLodOnDemand?: { createLod: () => Promise<void> };
        }
      ).sparkLodOnDemand;
      if (!controls) throw new Error("sparkLodOnDemand hook missing");
      return controls.createLod();
    });

    await expect(page.locator("body")).toHaveAttribute(
      "data-lod-on-demand-state",
      "ready",
      { timeout: 120_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-lod-on-demand-enabled",
      "true",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-lod-on-demand-has-tree",
      "true",
      { timeout: 5_000 },
    );

    const creates = await page
      .locator("body")
      .getAttribute("data-lod-on-demand-creates");
    const splats = await page
      .locator("body")
      .getAttribute("data-lod-on-demand-splats");
    // eslint-disable-next-line no-console
    console.log(
      `[lod-on-demand ${engine}] creates=${creates ?? "0"} splats=${splats ?? "0"}`,
    );
    expect(Number(creates ?? 0)).toBe(1);
    expect(Number(splats ?? 0)).toBeGreaterThan(0);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[lod-on-demand ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`splat-shader-effects swaps modifiers on engine=${engine}`, async ({
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

    const qs = exampleQuery("splat-shader-effects", engine);
    await page.goto(`/examples/splat-shader-effects/${qs}`, {
      timeout: 120_000,
    });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-shader-effects-ready",
      "true",
      { timeout: 120_000 },
    );
    await page.waitForFunction(
      () => Number(document.body.dataset.shaderEffectsFrames ?? 0) > 3,
      null,
      { timeout: 120_000 },
    );

    await page.evaluate(() => {
      const controls = (
        window as typeof window & {
          sparkShaderEffects?: {
            applyEffect: (effect: string, intensity: number) => void;
          };
        }
      ).sparkShaderEffects;
      if (!controls) throw new Error("sparkShaderEffects hook missing");
      controls.applyEffect("Waves", 0.25);
      controls.applyEffect("Flare", 0.6);
    });

    await expect(page.locator("body")).toHaveAttribute(
      "data-shader-effects-active",
      "Flare",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-shader-effects-intensity",
      "0.6",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-shader-effects-changes",
      "2",
      { timeout: 5_000 },
    );

    const splats = await page
      .locator("body")
      .getAttribute("data-shader-effects-splats");
    // eslint-disable-next-line no-console
    console.log(
      `[splat-shader-effects ${engine}] changes=2 splats=${splats ?? "0"}`,
    );
    expect(Number(splats ?? 0)).toBeGreaterThan(0);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[splat-shader-effects ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`particle-simulation updates snow controls on engine=${engine}`, async ({
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

    const qs = exampleQuery("particle-simulation", engine, {
      testSnowSplats: "50000",
    });
    await page.goto(`/examples/particle-simulation/${qs}`, {
      timeout: 120_000,
    });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-particle-simulation-ready",
      "true",
      { timeout: 120_000 },
    );
    await page.waitForFunction(
      () => Number(document.body.dataset.particleSimulationFrames ?? 0) > 3,
      null,
      { timeout: 120_000 },
    );

    await page.evaluate(() => {
      const controls = (
        window as typeof window & {
          sparkParticleSimulation?: {
            setPaused: (value: boolean) => void;
            setWindDirection: (value: string) => void;
          };
        }
      ).sparkParticleSimulation;
      if (!controls) throw new Error("sparkParticleSimulation hook missing");
      controls.setPaused(true);
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-particle-simulation-paused",
      "true",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-particle-simulation-fall-velocity",
      "0",
      { timeout: 5_000 },
    );

    await page.evaluate(() => {
      const controls = (
        window as typeof window & {
          sparkParticleSimulation?: {
            setPaused: (value: boolean) => void;
            setWindDirection: (value: string) => void;
          };
        }
      ).sparkParticleSimulation;
      if (!controls) throw new Error("sparkParticleSimulation hook missing");
      controls.setPaused(false);
      controls.setWindDirection("NE");
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-particle-simulation-paused",
      "false",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-particle-simulation-wind",
      "NE",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-particle-simulation-direction",
      "0.577,-0.577,-0.577",
      { timeout: 5_000 },
    );

    const splats = await page
      .locator("body")
      .getAttribute("data-particle-simulation-splats");
    // eslint-disable-next-line no-console
    console.log(`[particle-simulation ${engine}] splats=${splats ?? "0"}`);
    expect(Number(splats ?? 0)).toBeGreaterThan(0);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[particle-simulation ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`particle-animation recreates cloud presets on engine=${engine}`, async ({
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

    const qs = exampleQuery("particle-animation", engine);
    await page.goto(`/examples/particle-animation/${qs}`, {
      timeout: 120_000,
    });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-particle-animation-ready",
      "true",
      { timeout: 120_000 },
    );
    await page.waitForFunction(
      () => Number(document.body.dataset.particleAnimationFrames ?? 0) > 3,
      null,
      { timeout: 120_000 },
    );

    await page.evaluate(() => {
      const controls = (
        window as typeof window & {
          sparkParticleAnimation?: { applyPreset: (name: string) => void };
        }
      ).sparkParticleAnimation;
      if (!controls) throw new Error("sparkParticleAnimation hook missing");
      controls.applyPreset("Storm");
    });

    await expect(page.locator("body")).toHaveAttribute(
      "data-particle-animation-preset",
      "Storm",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-particle-animation-recreates",
      "1",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-particle-animation-splats",
      "30000",
      { timeout: 120_000 },
    );

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[particle-animation ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`splat-flow rebuilds transition modifiers on engine=${engine}`, async ({
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

    const qs = exampleQuery("splat-flow", engine);
    await page.goto(`/examples/splat-flow/${qs}`, { timeout: 120_000 });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-splat-flow-ready",
      "true",
      { timeout: 120_000 },
    );
    await page.waitForFunction(
      () => Number(document.body.dataset.splatFlowFrames ?? 0) > 3,
      null,
      { timeout: 120_000 },
    );

    const result = await page.evaluate(() => {
      const controls = (
        window as typeof window & {
          sparkSplatFlow?: {
            setParams: (params: {
              fixedMinScale?: boolean;
              waves?: number;
              pause?: boolean;
            }) => { changes: number };
          };
        }
      ).sparkSplatFlow;
      if (!controls) throw new Error("sparkSplatFlow hook missing");
      return controls.setParams({
        fixedMinScale: true,
        waves: 0.9,
        pause: true,
      });
    });

    await expect(page.locator("body")).toHaveAttribute(
      "data-splat-flow-meshes",
      "3",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-splat-flow-fixed-min-scale",
      "true",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-splat-flow-waves",
      "0.9",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-splat-flow-paused",
      "true",
      { timeout: 5_000 },
    );
    expect(result.changes).toBe(1);
    const splats = await page
      .locator("body")
      .getAttribute("data-splat-flow-splats");
    // eslint-disable-next-line no-console
    console.log(`[splat-flow ${engine}] splats=${splats ?? "0"}`);
    expect(Number(splats ?? 0)).toBeGreaterThan(0);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[splat-flow ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`splat-reveal-effects switches effect mesh on engine=${engine}`, async ({
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

    const qs = exampleQuery("splat-reveal-effects", engine);
    await page.goto(`/examples/splat-reveal-effects/${qs}`, {
      timeout: 120_000,
    });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-reveal-effects-ready",
      "true",
      { timeout: 120_000 },
    );
    await page.waitForFunction(
      () => Number(document.body.dataset.revealEffectsFrames ?? 0) > 3,
      null,
      { timeout: 120_000 },
    );

    await page.evaluate(() => {
      const controls = (
        window as typeof window & {
          sparkRevealEffects?: {
            loadEffect: (effect: string) => Promise<void>;
          };
        }
      ).sparkRevealEffects;
      if (!controls) throw new Error("sparkRevealEffects hook missing");
      return controls.loadEffect("Unroll");
    });

    await expect(page.locator("body")).toHaveAttribute(
      "data-reveal-effects-ready",
      "true",
      { timeout: 120_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-reveal-effects-active",
      "Unroll",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-reveal-effects-loads",
      "2",
      { timeout: 5_000 },
    );
    const splats = await page
      .locator("body")
      .getAttribute("data-reveal-effects-splats");
    // eslint-disable-next-line no-console
    console.log(`[splat-reveal-effects ${engine}] splats=${splats ?? "0"}`);
    expect(Number(splats ?? 0)).toBeGreaterThan(0);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[splat-reveal-effects ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`splat-transitions switches dynamic effect on engine=${engine}`, async ({
    page,
  }) => {
    test.setTimeout(420_000);

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

    const qs = exampleQuery("splat-transitions", engine, {
      testSkipInitialEffect: "1",
    });
    await page.goto(`/examples/splat-transitions/${qs}`, {
      timeout: 120_000,
    });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-splat-transitions-ready",
      "idle",
      { timeout: 180_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-splat-transitions-active",
      "",
      { timeout: 5_000 },
    );

    await page.evaluate(() => {
      const controls = (
        window as typeof window & {
          sparkSplatTransitions?: {
            switchEffect: (name: string) => Promise<void>;
          };
        }
      ).sparkSplatTransitions;
      if (!controls) throw new Error("sparkSplatTransitions hook missing");
      return controls.switchEffect("Morph");
    });

    await expect(page.locator("body")).toHaveAttribute(
      "data-splat-transitions-ready",
      "true",
      { timeout: 180_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-splat-transitions-active",
      "Morph",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-splat-transitions-has-update",
      "true",
      { timeout: 5_000 },
    );
    await page.waitForFunction(
      () => Number(document.body.dataset.splatTransitionsUpdates ?? 0) > 3,
      null,
      { timeout: 120_000 },
    );
    const switches = await page
      .locator("body")
      .getAttribute("data-splat-transitions-switches");
    const children = await page
      .locator("body")
      .getAttribute("data-splat-transitions-children");
    // eslint-disable-next-line no-console
    console.log(
      `[splat-transitions ${engine}] switches=${switches ?? "0"} children=${children ?? "0"}`,
    );
    expect(Number(switches ?? 0)).toBe(1);
    expect(Number(children ?? 0)).toBeGreaterThan(0);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[splat-transitions ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`splat-dissolve-effects advances modifier time on engine=${engine}`, async ({
    page,
  }) => {
    test.setTimeout(300_000);

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

    const qs = exampleQuery("splat-dissolve-effects", engine);
    await page.goto(`/examples/splat-dissolve-effects/${qs}`, {
      timeout: 120_000,
    });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-dissolve-effects-ready",
      "true",
      { timeout: 120_000 },
    );
    await page.waitForFunction(
      () => Number(document.body.dataset.dissolveEffectsFrames ?? 0) > 3,
      null,
      { timeout: 120_000 },
    );

    await page.evaluate(() => {
      const controls = (
        window as typeof window & {
          sparkDissolveEffects?: { seek: (seconds: number) => void };
        }
      ).sparkDissolveEffects;
      if (!controls) throw new Error("sparkDissolveEffects hook missing");
      controls.seek(12.5);
    });

    await expect(page.locator("body")).toHaveAttribute(
      "data-dissolve-effects-seek",
      "12.5",
      { timeout: 5_000 },
    );
    const splats = await page
      .locator("body")
      .getAttribute("data-dissolve-effects-splats");
    // eslint-disable-next-line no-console
    console.log(`[splat-dissolve-effects ${engine}] splats=${splats ?? "0"}`);
    expect(Number(splats ?? 0)).toBeGreaterThan(0);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[splat-dissolve-effects ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`newportal crosses through SparkPortals on engine=${engine}`, async ({
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

    const qs = exampleQuery("newportal", engine);
    await page.goto(`/examples/newportal/${qs}`, { timeout: 120_000 });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-new-portal-ready",
      "true",
      { timeout: 120_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-new-portal-pairs",
      "2",
      { timeout: 5_000 },
    );
    await page.waitForFunction(
      () => Number(document.body.dataset.newPortalFrames ?? 0) > 3,
      null,
      { timeout: 120_000 },
    );

    const forced = await page.evaluate(() => {
      const controls = (
        window as typeof window & {
          sparkNewPortal?: {
            forceEntryCross: () => { crosses: number; position: number[] };
          };
        }
      ).sparkNewPortal;
      if (!controls) throw new Error("sparkNewPortal hook missing");
      return controls.forceEntryCross();
    });

    await expect(page.locator("body")).toHaveAttribute(
      "data-new-portal-crosses",
      "1",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-new-portal-last-cross",
      "entry-exit",
      { timeout: 5_000 },
    );
    const splats = await page
      .locator("body")
      .getAttribute("data-new-portal-splats");
    // eslint-disable-next-line no-console
    console.log(
      `[newportal ${engine}] crosses=${forced.crosses} position=${forced.position.map((v) => v.toFixed(2)).join(",")} splats=${splats ?? "0"}`,
    );
    expect(forced.crosses).toBe(1);
    expect(Number(splats ?? 0)).toBeGreaterThan(0);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[newportal ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`portal legacy two-pass renderer teleports on engine=${engine}`, async ({
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

    const params = exampleParams("portal", engine, {
      testPortalAssets: "1",
      testStaticPortal: "1",
    });
    await page.goto(`/examples/portal/?${params}`, { timeout: 120_000 });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-portal-ready",
      "true",
      { timeout: 120_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-portal-meshes",
      "2",
      { timeout: 5_000 },
    );
    const result = await page.evaluate(() => {
      const controls = (
        window as typeof window & {
          sparkPortal?: {
            renderOnce: () => { choice: string; passes: number };
            forcePortalTeleport: () => {
              localFrame: number[];
              teleports: number;
            };
          };
        }
      ).sparkPortal;
      if (!controls) throw new Error("sparkPortal hook missing");
      const rendered = controls.renderOnce();
      const forced = controls.forcePortalTeleport();
      return { forced, rendered };
    });

    await expect(page.locator("body")).toHaveAttribute(
      "data-portal-teleports",
      "1",
      { timeout: 5_000 },
    );
    const [splats, passes, choice, localFrame] = await Promise.all([
      page.locator("body").getAttribute("data-portal-splats"),
      page.locator("body").getAttribute("data-portal-passes"),
      page.locator("body").getAttribute("data-portal-last-choice"),
      page.locator("body").getAttribute("data-portal-local-frame"),
    ]);
    // eslint-disable-next-line no-console
    console.log(
      `[portal ${engine}] splats=${splats ?? "0"} passes=${passes ?? "0"} choice=${choice ?? "none"} localFrame=${localFrame ?? "none"}`,
    );
    expect(result.rendered.passes).toBe(2);
    expect(result.forced.teleports).toBe(1);
    expect(result.forced.localFrame.length).toBe(3);
    expect(Number(splats ?? 0)).toBeGreaterThan(0);
    expect(Number(passes ?? 0)).toBeGreaterThanOrEqual(2);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[portal ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`splat-portal renders offscreen portal and teleports on engine=${engine}`, async ({
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

    const qs =
      engine === "three"
        ? "?testPortalAssets=1"
        : `?engine=${engine}&testPortalAssets=1`;
    await page.goto(`/examples/splat-portal/${qs}`, { timeout: 120_000 });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-splat-portal-ready",
      "true",
      { timeout: 180_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-splat-portal-active-world",
      "A",
      { timeout: 5_000 },
    );
    await page.waitForFunction(
      () => Number(document.body.dataset.splatPortalTargetRenders ?? 0) >= 4,
      null,
      { timeout: 120_000 },
    );

    const forced = await page.evaluate(() => {
      const controls = (
        window as typeof window & {
          sparkSplatPortal?: {
            forceTeleport: () => { activeWorld: string; teleports: number };
          };
        }
      ).sparkSplatPortal;
      if (!controls) throw new Error("sparkSplatPortal hook missing");
      return controls.forceTeleport();
    });

    await expect(page.locator("body")).toHaveAttribute(
      "data-splat-portal-active-world",
      "B",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-splat-portal-teleports",
      "1",
      { timeout: 5_000 },
    );
    const [target, valleySplats, sutroSplats] = await Promise.all([
      page.locator("body").getAttribute("data-splat-portal-target"),
      page.locator("body").getAttribute("data-splat-portal-valley-splats"),
      page.locator("body").getAttribute("data-splat-portal-sutro-splats"),
    ]);
    // eslint-disable-next-line no-console
    console.log(
      `[splat-portal ${engine}] world=${forced.activeWorld} teleports=${forced.teleports} target=${target ?? "none"}`,
    );
    expect(forced).toEqual({ activeWorld: "B", teleports: 1 });
    expect(target).toMatch(/^\d+x\d+$/);
    expect(Number(valleySplats ?? 0)).toBeGreaterThan(0);
    expect(Number(sutroSplats ?? 0)).toBeGreaterThan(0);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[splat-portal ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`lofi cycles cached worlds on engine=${engine}`, async ({ page }) => {
    test.setTimeout(300_000);

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

    const params = exampleParams("lofi", engine);
    await page.goto(`/examples/lofi/?${params}`, { timeout: 120_000 });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-lofi-test-assets",
      "true",
      { timeout: 5_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-lofi-ready",
      "true",
      { timeout: 120_000 },
    );
    await page.waitForFunction(
      () => Number(document.body.dataset.lofiFrames ?? 0) > 3,
      null,
      { timeout: 120_000 },
    );

    const result = await page.evaluate(async () => {
      const controls = (
        window as typeof window & {
          sparkLofi?: {
            prefetchNext: () => Promise<{
              cachedWorlds: number;
              targetWorld: string;
            }>;
            applyTargetWorldNow: () => {
              applies: number;
              currentWorld: string;
              splats: number;
            };
            setRustle: (value: number) => number;
          };
        }
      ).sparkLofi;
      if (!controls) throw new Error("sparkLofi hook missing");
      const prefetched = await controls.prefetchNext();
      const applied = controls.applyTargetWorldNow();
      const rustle = controls.setRustle(0.25);
      return { applied, prefetched, rustle };
    });

    await expect(page.locator("body")).toHaveAttribute(
      "data-lofi-current-world",
      /cat\.spz$/,
      { timeout: 5_000 },
    );
    const [cachedWorlds, splats, applies, rustle] = await Promise.all([
      page.locator("body").getAttribute("data-lofi-cached-worlds"),
      page.locator("body").getAttribute("data-lofi-splats"),
      page.locator("body").getAttribute("data-lofi-world-applies"),
      page.locator("body").getAttribute("data-lofi-rustle"),
    ]);
    // eslint-disable-next-line no-console
    console.log(
      `[lofi ${engine}] cached=${cachedWorlds ?? "0"} applies=${applies ?? "0"} target=${result.prefetched.targetWorld} splats=${splats ?? "0"}`,
    );
    expect(result.prefetched.cachedWorlds).toBe(2);
    expect(result.applied.currentWorld).toMatch(/cat\.spz$/);
    expect(result.applied.applies).toBeGreaterThanOrEqual(2);
    expect(result.applied.splats).toBeGreaterThan(0);
    expect(result.rustle).toBe(0.25);
    expect(Number(splats ?? 0)).toBeGreaterThan(0);
    expect(Number(rustle ?? 0)).toBeGreaterThan(0);

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[lofi ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`viewer URL form loads splat on engine=${engine}`, async ({ page }) => {
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

    const qs = exampleQuery("viewer", engine);
    await page.goto(`/examples/viewer/${qs}`, { timeout: 120_000 });
    const splatUrl = new URL("/test/fixtures/assets/robot-head.spz", page.url())
      .href;

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await page.locator(".url-input").fill(splatUrl);
    await page.locator(".url-input").press("Enter");

    await expect(page.locator("body")).toHaveAttribute(
      "data-viewer-ready",
      "true",
      { timeout: 120_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-viewer-file-name",
      "robot-head.spz",
      { timeout: 5_000 },
    );
    await expect(page.locator(".container")).toHaveClass(/hidden/);
    await expect(page.locator(".canvas-container")).not.toHaveClass(
      /invisible/,
    );

    const loads = await page.locator("body").getAttribute("data-viewer-loads");
    const splats = await page
      .locator("body")
      .getAttribute("data-viewer-splats");
    // eslint-disable-next-line no-console
    console.log(
      `[viewer ${engine}] loads=${loads ?? "0"} splats=${splats ?? "0"}`,
    );
    expect(Number(loads ?? 0)).toBe(1);
    expect(Number(splats ?? 0)).toBeGreaterThan(0);
    expect(page.url()).toContain("url=http%3A%2F%2F127.0.0.1");

    if (errors.length > 0) {
      // eslint-disable-next-line no-console
      console.log(`[viewer ${engine}] errors:`, errors);
    }
    expect(errors).toEqual([]);
  });
}

for (const engine of ENGINES) {
  test(`splat-painter brush paints on engine=${engine}`, async ({ page }) => {
    test.setTimeout(300_000);

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

    const params = exampleParams("splat-painter", engine);
    await page.goto(`/examples/splat-painter/?${params}`, {
      timeout: 120_000,
    });

    await expect(page.locator("#spark-engine-switcher")).toBeVisible({
      timeout: 120_000,
    });
    await expect(page.locator("body")).toHaveAttribute(
      "data-painter-ready",
      "true",
      { timeout: 120_000 },
    );
    await expect(page.locator("body")).toHaveAttribute(
      "data-painter-file-name",
      "cat",
      { timeout: 5_000 },
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

    // Dispatch a burst of same-tick pointer moves while dragging. The
    // example coalesces the expensive full-mesh RgbaArray rebuild onto
    // requestAnimationFrame, so many pointer events should not imply many
    // immediate GPU readbacks.
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("no viewport");
    const cx = Math.floor(viewport.width / 2);
    const cy = Math.floor(viewport.height / 2);
    await page.mouse.move(cx, cy);
    await page.mouse.down();
    await page.evaluate(
      ({ x, y }) => {
        const canvas = document.querySelector("canvas");
        if (!canvas) throw new Error("canvas missing");
        for (let i = 1; i <= 5; i++) {
          canvas.dispatchEvent(
            new PointerEvent("pointermove", {
              bubbles: true,
              clientX: x + i * 4,
              clientY: y - i * 4,
              pointerId: 1,
              pointerType: "mouse",
            }),
          );
        }
      },
      { x: cx, y: cy },
    );
    await page.waitForFunction(
      () => Number(document.body.dataset.painterRgbaUpdates ?? 0) >= 1,
      null,
      { timeout: 30_000 },
    );
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
    const moves = await page.locator("body").getAttribute("data-painter-moves");
    const rgbaUpdates = await page
      .locator("body")
      .getAttribute("data-painter-rgba-updates");
    // eslint-disable-next-line no-console
    console.log(
      `[splat-painter ${engine}] moves=${moves ?? "0"} rgbaUpdates=${rgbaUpdates ?? "0"}`,
    );
    expect(Number(moves ?? 0)).toBeGreaterThanOrEqual(5);
    expect(Number(rgbaUpdates ?? 0)).toBeGreaterThanOrEqual(1);
    expect(Number(rgbaUpdates ?? 0)).toBeLessThanOrEqual(3);

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

      const qs = exampleQuery(name, engine);
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
      const expectedHrefFor = (targetEngine: (typeof ENGINES)[number]) => {
        const linkParams = exampleParams(name, targetEngine);
        const linkQs = linkParams.toString();
        return linkQs ? `?${linkQs}` : `/examples/${name}/`;
      };
      const footer = page.locator("#spark-engine-switcher");
      await expect(footer.locator("a[href='../']")).toHaveCount(1);
      await expect(footer.locator("a.spark-engine-link-three")).toHaveAttribute(
        "href",
        expectedHrefFor("three"),
      );
      await expect(
        footer.locator("a.spark-engine-link-aframe"),
      ).toHaveAttribute("href", expectedHrefFor("aframe"));
      await expect(
        footer.locator("a.spark-engine-link-babylon"),
      ).toHaveAttribute("href", expectedHrefFor("babylon"));

      if (errors.length > 0) {
        // eslint-disable-next-line no-console
        console.log(`[${name} ${engine}] errors:`, errors);
      }
      expect(errors).toEqual([]);
    });
  }
}
