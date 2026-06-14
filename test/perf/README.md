# Spark Render Perf Benchmarks

This folder is benchmark infrastructure, not an optimization gate. Use it to
collect speed data while feature work continues; hard budgets stay deferred
until the feature list is complete and runner variance is understood.

## Quick Smoke

```bash
pnpm run test:perf:smoke
```

## Full Default Benchmark

```bash
pnpm run test:perf
```

Defaults:

- scenes: `helloWorld`, `glsl`, `sogs`, `splatShaderEffects`
- backends: `three`, `aframe`, `babylon-texture`, `babylon-native`
- frames: `600`
- warmup frames: `60`
- report: `tmp/perf/render-fps.json`

The report and baseline include their selected scenes, backends, frame counts,
and whether they came from the full default benchmark.

Each test also prints a compact terminal summary with p50 / p95 / sample-count
for RAF interval, render-frame wall time, Spark frame timing, sort, accumulate,
and Babylon readback. The JSON report remains the source of truth for review.

## Baselines

`regression-baseline.json` starts empty on purpose. To write a reviewed local
baseline:

```bash
SPARK_PERF_UPDATE_BASELINE=1 pnpm run test:perf
```

Baseline updates refuse partial runs by default so a quick smoke cannot
accidentally overwrite the real baseline. To intentionally write a subset:

```bash
SPARK_PERF_ALLOW_PARTIAL_BASELINE=1 \
SPARK_PERF_UPDATE_BASELINE=1 \
SPARK_PERF_SCENES=axes \
SPARK_PERF_BACKENDS=three \
SPARK_PERF_FRAMES=30 \
pnpm run test:perf
```

To turn baseline drift into a failure later:

```bash
SPARK_PERF_ASSERT_BASELINE=1 pnpm run test:perf
```

Assert mode also fails when a benchmark case has no committed baseline entry.

Last-observed work-item metrics summarize changed nonzero samples so stale
values from throttled producers are not counted once per frame.
