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
the warm phase and must be at least three. Each case records one cold first-use
sample and the requested number of warm samples. `--help` lists the runner
options.

The fixed fixture is the existing `STATIC_SERIES_LINE_BASIC` test-data fixture.
It benchmarks `assembleForBackend` for Vega-Lite, ECharts, and Chart.js, then
the MCP renderer for Vega-Lite and ECharts (SVG and PNG) and Chart.js (PNG).
Chart.js SVG is reported as an explicit skip because that renderer has no SVG
engine.

## Reading the result

The JSON records the source commit and dirty state, Node/V8 and OS/CPU
identities, fixture shape and serialized size, case/backend/format, output
dimensions and bytes when rendered, every individual sample, and min/median/
mean/p95/max summaries. Each case runs in its own Node worker, which performs
one cold first operation, one excluded warm-up, then the requested warm
samples in sequence. Module loading is outside each operation's timer. The
worker is forcibly terminated after 15 seconds; completed records are retained,
the in-flight operation is an error sample, and unfinished work is reported as
not run. Isolating one case per worker bounds stuck native renderers and lets
the OS reclaim their process resources before the next case. The compiler
cases use the same cold/warm protocol for consistency.

For each sample, `memory.before` and `memory.after` are snapshots of
`process.memoryUsage()` (`rss`, `heapTotal`, `heapUsed`, `external`, and
`arrayBuffers`); `memory.delta` is their difference. These are point-in-time
process snapshots, not allocation totals, retained-size measurements, or peak
memory. Garbage collection is not forced. Timings use `performance.now()`.
Failed attempts remain in the result with their error; a failed case makes the
runner exit nonzero. A renderer result is counted only after its artifact type,
signature/markup, and dimensions have been checked. The renderers finalize or
dispose Vega, ECharts, and Chart.js instances in `finally` blocks, including
when a render attempt throws.

Raw records are intended for paired local or CI-runner comparisons made with
the same Node version, hardware, fixture, and command. Do not compare unlike
machines as if they were controlled measurements, infer allocation volume
from snapshot deltas, or treat this informational baseline as a CI gate.

`artifacts/perf/render-baseline-node26-local.json` is a checked-in example
record, not a hosted-CI result. It was captured on the local Node 26 / two-CPU
host. The normal full build hit a V8 heap OOM during the JavaScript package's
declaration build on that host; runtime bundles were built without declaration
generation to exercise the runner. CI uses Node 20/22, and this local result
does not establish a hosted build issue. Reproduce the full build behavior on
the supported CI Node versions before drawing conclusions about CI.
