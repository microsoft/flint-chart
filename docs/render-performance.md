# Reproducible render performance baseline

This opt-in runner records repeatable timings for the Flint compiler assembly
and the supported in-process MCP renderers. It does not participate in normal
builds, tests, or CI, and it makes no performance threshold or speedup claim.

## Run

Use the repository's supported Node version (CI currently uses Node 20/22) and
an otherwise idle machine. Install dependencies and build both packages once:

```sh
npm ci
npm run build
npm run benchmark:render -- --samples 5 --out artifacts/perf/render-baseline.json
```

The output path must not already exist. Use another path for each run. The
runner needs the built `flint-chart` and `flint-chart-mcp` package outputs; it
does not launch a server, browser, or external renderer. `--samples` applies to
both phases and must be at least three. `--help` lists the runner options.

The fixed fixture is the existing `STATIC_SERIES_LINE_BASIC` test-data fixture.
It benchmarks `assembleForBackend` for Vega-Lite, ECharts, and Chart.js, then
the MCP renderer for Vega-Lite and ECharts (SVG and PNG) and Chart.js (PNG).
Chart.js SVG is reported as an explicit skip because that renderer has no SVG
engine.

## Reading the result

The JSON records the source commit and dirty state, Node/V8 and OS/CPU
identities, fixture shape and serialized size, case/backend/format, output
dimensions and bytes when rendered, every individual sample, and min/median/
mean/p95/max summaries. Cold samples run one first operation per fresh Node
process (module loading is outside the timer); warm samples run sequentially
in the benchmark process after one excluded warm-up operation. The compiler
cases use the same cold/warm protocol for consistency.

For each sample, `memory.before` and `memory.after` are snapshots of
`process.memoryUsage()` (`rss`, `heapTotal`, `heapUsed`, `external`, and
`arrayBuffers`); `memory.delta` is their difference. These are point-in-time
process snapshots, not allocation totals, retained-size measurements, or peak
memory. Garbage collection is not forced. Timings use `performance.now()`.
Failed attempts remain in the result with their error; a failed case makes the
runner exit nonzero. A renderer result is counted only after its artifact type,
signature/markup, and dimensions have been checked.

Raw records are intended for paired local or CI-runner comparisons made with
the same Node version, hardware, fixture, and command. Do not compare unlike
machines as if they were controlled measurements, infer allocation volume
from snapshot deltas, or treat this informational baseline as a CI gate.
