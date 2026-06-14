import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "@playwright/test";

const tmpDir = path.join(process.cwd(), "tmp", "perf");
const reportPath = path.join(tmpDir, "render-fps.json");
const baselinePath = path.join(
  process.cwd(),
  "test",
  "perf",
  "regression-baseline.json",
);

const DEFAULT_SCENES = [
  "helloWorld",
  "glsl",
  "sogs",
  "splatShaderEffects",
] as const;
const DEFAULT_BACKENDS = [
  "three",
  "aframe",
  "babylon-texture",
  "babylon-native",
] as const;

const frames = readPositiveIntEnv("SPARK_PERF_FRAMES", 600);
const warmupFrames = readPositiveIntEnv("SPARK_PERF_WARMUP_FRAMES", 60);
const scenes = readCsvEnv("SPARK_PERF_SCENES", DEFAULT_SCENES);
const backends = readCsvEnv("SPARK_PERF_BACKENDS", DEFAULT_BACKENDS);
const updateBaseline = process.env.SPARK_PERF_UPDATE_BASELINE === "1";
const assertBaseline = process.env.SPARK_PERF_ASSERT_BASELINE === "1";
const allowPartialBaseline =
  process.env.SPARK_PERF_ALLOW_PARTIAL_BASELINE === "1";
let baselineUpdateAllowed = false;

type MetricName =
  | "rafIntervalMs"
  | "renderFrameMs"
  | "lastFrameMs"
  | "lastSortMs"
  | "lastAccumulateMs"
  | "lastTraverseMs"
  | "lastLodRaycastMs"
  | "lastBabylonReadbackMs";

const METRICS: MetricName[] = [
  "rafIntervalMs",
  "renderFrameMs",
  "lastFrameMs",
  "lastSortMs",
  "lastAccumulateMs",
  "lastTraverseMs",
  "lastLodRaycastMs",
  "lastBabylonReadbackMs",
];

const LAST_OBSERVED_METRICS = new Set<MetricName>([
  "lastSortMs",
  "lastAccumulateMs",
  "lastTraverseMs",
  "lastLodRaycastMs",
  "lastBabylonReadbackMs",
]);

const DROP_ZERO_METRICS = new Set<MetricName>([
  "lastSortMs",
  "lastTraverseMs",
  "lastLodRaycastMs",
  "lastBabylonReadbackMs",
]);

interface PerfMetrics {
  lastFrameMs: number;
  lastSortMs: number;
  lastAccumulateMs: number;
  lastTraverseMs: number;
  lastLodRaycastMs: number;
  lastBabylonReadbackMs: number;
}

interface FrameSample extends PerfMetrics {
  rafIntervalMs: number;
  renderFrameMs: number;
}

interface MetricSummary {
  samples: number;
  nonZeroSamples: number;
  changedSamples: number;
  min: number;
  p50: number;
  p95: number;
  p99: number;
  max: number;
  average: number;
}

interface BenchmarkResult {
  key: string;
  backend: string;
  scene: string;
  mode?: string;
  frames: number;
  warmupFrames: number;
  generatedAt: string;
  summaries: Partial<Record<MetricName, MetricSummary>>;
}

interface BaselineFile {
  version: 1;
  generatedAt: string | null;
  frames: number;
  warmupFrames: number;
  scenes: string[];
  backends: string[];
  isFullDefaultRun?: boolean;
  tolerance: {
    timeRatio: number;
  };
  results: Record<string, BenchmarkResult>;
}

const results: BenchmarkResult[] = [];
let baseline: BaselineFile;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  await mkdir(tmpDir, { recursive: true });
  baseline = JSON.parse(await readFile(baselinePath, "utf8")) as BaselineFile;
  if (updateBaseline && !allowPartialBaseline && !isFullDefaultRun()) {
    throw new Error(
      [
        "Refusing to update the perf baseline from a partial benchmark run.",
        "Run the full default benchmark, or set SPARK_PERF_ALLOW_PARTIAL_BASELINE=1 for an intentional subset baseline.",
      ].join(" "),
    );
  }
  baselineUpdateAllowed = updateBaseline;
});

test.afterAll(async () => {
  const report = {
    version: 1,
    generatedAt: new Date().toISOString(),
    frames,
    warmupFrames,
    scenes,
    backends,
    isFullDefaultRun: isFullDefaultRun(),
    results: Object.fromEntries(results.map((result) => [result.key, result])),
  };
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);

  if (baselineUpdateAllowed) {
    const nextBaseline: BaselineFile = {
      version: 1,
      generatedAt: report.generatedAt,
      frames,
      warmupFrames,
      scenes,
      backends,
      isFullDefaultRun: report.isFullDefaultRun,
      tolerance: baseline.tolerance,
      results: report.results,
    };
    await writeFile(baselinePath, `${JSON.stringify(nextBaseline, null, 2)}\n`);
  }
});

for (const scene of scenes) {
  for (const backend of backends) {
    test(`${backend} ${scene} frame benchmark`, async ({ page }) => {
      test.setTimeout(backend.startsWith("babylon") ? 540_000 : 360_000);

      const route = fixtureRoute(backend, scene);
      await page.goto(route, { timeout: 90_000 });
      await expect(page.locator("body")).toHaveAttribute("data-ready", "true", {
        timeout: 360_000,
      });

      const raw = await page.evaluate(
        async ({ frames, warmupFrames }) => {
          type WindowWithBenchmark = Window & {
            spark?: { perfMetrics: PerfMetrics };
            sparkPerfBenchmark?: {
              backend: string;
              scene: string;
              mode?: string;
              renderFrame: () => Promise<PerfMetrics>;
            };
          };

          const benchmark = (window as WindowWithBenchmark).sparkPerfBenchmark;
          const spark = (window as WindowWithBenchmark).spark;
          if (!benchmark || !spark) {
            throw new Error("snapshot fixture did not expose spark benchmark");
          }

          const samples: FrameSample[] = [];
          let previousRafMs = await nextAnimationFrame();
          for (let i = 0; i < warmupFrames + frames; i++) {
            const rafMs = await nextAnimationFrame();
            const rafIntervalMs = rafMs - previousRafMs;
            previousRafMs = rafMs;

            const renderStart = performance.now();
            const perfMetrics = await benchmark.renderFrame();
            const renderFrameMs = performance.now() - renderStart;

            if (i >= warmupFrames) {
              samples.push({
                rafIntervalMs,
                renderFrameMs,
                ...perfMetrics,
              });
            }
          }

          return {
            backend: benchmark.backend,
            scene: benchmark.scene,
            mode: benchmark.mode,
            samples,
          };

          function nextAnimationFrame(): Promise<number> {
            return new Promise((resolve) => requestAnimationFrame(resolve));
          }
        },
        { frames, warmupFrames },
      );

      const key = `${backend}/${scene}`;
      const result: BenchmarkResult = {
        key,
        backend: raw.backend,
        scene: raw.scene,
        mode: raw.mode,
        frames,
        warmupFrames,
        generatedAt: new Date().toISOString(),
        summaries: Object.fromEntries(
          METRICS.map((metric) => [
            metric,
            summarizeMetric(raw.samples, metric, {
              dropZero: DROP_ZERO_METRICS.has(metric),
              changedOnly: LAST_OBSERVED_METRICS.has(metric),
            }),
          ]).filter(([, summary]) => summary !== null),
        ) as Partial<Record<MetricName, MetricSummary>>,
      };
      results.push(result);

      await test.info().attach(`${key}.json`, {
        body: JSON.stringify(result, null, 2),
        contentType: "application/json",
      });

      logResultSummary(result);
      compareBaseline(result);
    });
  }
}

function fixtureRoute(backend: string, scene: string): string {
  if (backend === "three") {
    return `/test/fixtures/snapshot-three.html?scene=${scene}`;
  }
  if (backend === "aframe") {
    return `/test/fixtures/snapshot-aframe.html?scene=${scene}`;
  }
  if (backend === "babylon-texture") {
    return `/test/fixtures/snapshot-babylon.html?scene=${scene}`;
  }
  if (backend === "babylon-native") {
    return `/test/fixtures/snapshot-babylon.html?scene=${scene}&mode=native`;
  }
  throw new Error(`Unknown perf backend: ${backend}`);
}

function summarizeMetric(
  samples: FrameSample[],
  metric: MetricName,
  opts: { dropZero: boolean; changedOnly: boolean },
): MetricSummary | null {
  const allValues = samples.map((sample) => sample[metric]);
  const changedValues = allValues.filter(
    (value, index) => index === 0 || value !== allValues[index - 1],
  );
  const candidateValues = opts.changedOnly ? changedValues : allValues;
  const values = opts.dropZero
    ? candidateValues.filter((value) => value > 0)
    : candidateValues.filter((value) => Number.isFinite(value));
  if (values.length === 0) {
    return null;
  }

  values.sort((a, b) => a - b);
  const total = values.reduce((sum, value) => sum + value, 0);
  return {
    samples: values.length,
    nonZeroSamples: allValues.filter((value) => value > 0).length,
    changedSamples: changedValues.filter((value) => Number.isFinite(value))
      .length,
    min: values[0],
    p50: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    p99: percentile(values, 0.99),
    max: values[values.length - 1],
    average: total / values.length,
  };
}

function percentile(sortedValues: number[], percentileValue: number): number {
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.ceil(sortedValues.length * percentileValue) - 1),
  );
  return sortedValues[index];
}

function compareBaseline(result: BenchmarkResult): void {
  const expected = baseline.results[result.key];
  if (!expected) {
    const message = [
      `[perf] ${result.key}: no committed baseline yet`,
      "Run SPARK_PERF_UPDATE_BASELINE=1 pnpm run test:perf after reviewing a full benchmark.",
    ].join(". ");
    if (assertBaseline) {
      expect.soft(expected, message).toBeDefined();
    } else {
      // eslint-disable-next-line no-console
      console.log(message);
    }
    return;
  }

  const tolerance = baseline.tolerance.timeRatio;
  const failures: string[] = [];
  for (const metric of METRICS) {
    const currentMetric = result.summaries[metric];
    const expectedMetric = expected.summaries[metric];
    if (!currentMetric || !expectedMetric) {
      continue;
    }
    const allowed = expectedMetric.p50 * (1 + tolerance);
    if (currentMetric.p50 > allowed) {
      failures.push(
        `${metric} p50 ${currentMetric.p50.toFixed(2)}ms > ${allowed.toFixed(2)}ms baseline budget`,
      );
    }
  }

  if (failures.length === 0) {
    return;
  }

  const message = [
    `[perf] ${result.key} exceeded committed baseline:`,
    ...failures.map((failure) => `  - ${failure}`),
    `Update ${path.relative(process.cwd(), baselinePath)} with SPARK_PERF_UPDATE_BASELINE=1 after review.`,
  ].join("\n");

  if (assertBaseline) {
    expect.soft(failures, message).toEqual([]);
  } else {
    // eslint-disable-next-line no-console
    console.warn(message);
  }
}

function logResultSummary(result: BenchmarkResult): void {
  const summary = [
    `raf ${formatSummary(result.summaries.rafIntervalMs)}`,
    `render ${formatSummary(result.summaries.renderFrameMs)}`,
    `frame ${formatSummary(result.summaries.lastFrameMs)}`,
    `sort ${formatSummary(result.summaries.lastSortMs)}`,
    `accum ${formatSummary(result.summaries.lastAccumulateMs)}`,
    `readback ${formatSummary(result.summaries.lastBabylonReadbackMs)}`,
  ].join(" | ");

  // eslint-disable-next-line no-console
  console.log(`[perf] ${result.key}: ${summary}`);
}

function formatSummary(summary?: MetricSummary): string {
  if (!summary) {
    return "n/a";
  }
  return `p50=${formatMs(summary.p50)} p95=${formatMs(summary.p95)} n=${summary.samples}`;
}

function formatMs(value: number): string {
  return `${value.toFixed(value < 10 ? 2 : 1)}ms`;
}

function readPositiveIntEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const value = Number.parseInt(raw, 10);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readCsvEnv<T extends readonly string[]>(
  name: string,
  fallback: T,
): string[] {
  const raw = process.env[name];
  if (!raw) {
    return [...fallback];
  }
  return raw
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function isFullDefaultRun(): boolean {
  return (
    frames === 600 &&
    warmupFrames === 60 &&
    sameValues(scenes, DEFAULT_SCENES) &&
    sameValues(backends, DEFAULT_BACKENDS)
  );
}

function sameValues(actual: readonly string[], expected: readonly string[]) {
  return (
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}
