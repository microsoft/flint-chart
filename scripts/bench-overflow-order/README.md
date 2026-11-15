# Explicit-order overflow benchmark (#161)

Measures exported `filterOverflow` (JS) and `filter_overflow` (Python) when an
explicit JSON `sortBy` category order is used with `maxValues.x = 25`.

Fixture (generated in `bench.mjs` / `bench.py`): N distinct categories `cat-000000…`,
one row each; `sortBy` lists them reversed, with one duplicate entry and two
missing categories. Sizes 1k / 5k / 10k.

## Reproduce

```bash
npm ci
scripts/bench-overflow-order/run.sh a794557384adcc3293a77043f6b9aff1c33d152c 3
# quick smoke: SIZES=1000 scripts/bench-overflow-order/run.sh a794557 1
```

`run.sh` extracts the baseline sources with `git archive`, bundles both sides of
`filter-overflow.ts` with esbuild, and alternates baseline/change order every
round. Each case runs in its own process; JS takes 15 timed calls after warm-up and
Python takes 7. Output is written to the git-ignored `experiments/bench-overflow-order/`.

## Metrics

- `medianMs`: median wall time of one call (`process.hrtime.bigint` /
  `time.perf_counter_ns`), with a forced GC before each call.
- `digest`: SHA-256 of the JSON-serialized result (rows, warnings, truncations,
  viewports). Baseline and change must match.
- `medianAllocBytes` (JS): delta of `v8.getHeapStatistics().total_allocated_bytes`
  around one call. Node documents this as "total allocated bytes since the Isolate
  creation" (Node ≥ 24; V8 14.6 in Node 26). It is a cumulative counter, not
  sampling and not a used-heap delta. It is **approximate**: it is updated at
  allocation-buffer granularity, excludes ArrayBuffer backing stores, and shows
  ~0.3–0.6 MB of offset on a no-op after `gc()` (`results/alloc-probe.txt`).
  Compare only the baseline/change difference.
- `tracemallocPeakBytes` (Python): `tracemalloc` peak traced allocation above the
  starting point during one call, from a separate untimed call.
- `maxRssKiB`: process peak RSS from `getrusage`; this includes runtime startup.

## Recorded results (`results/`)

Node v26.12.1, Python 3.12.3, esbuild 0.28.1, Linux x86_64, 2 vCPU, 3 interleaved
rounds. See `results/summary.txt` and the raw rows in `results/results.jsonl`.
