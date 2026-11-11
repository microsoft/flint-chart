#!/usr/bin/env bash
# Interleaved baseline/change benchmark for explicit-order overflow (#161).
# Usage: scripts/bench-overflow-order/run.sh [BASELINE_REV] [ROUNDS]
#   BASELINE_REV defaults to a794557 (pre-change); the "change" side is the current working tree.
#   Set SIZES="1000" for a quick smoke run.
#   Set BENCH_LOCK=/path/to/lockfile to serialize each child process with flock.
#   Output goes to experiments/bench-overflow-order/ (git-ignored).
set -euo pipefail
ROOT=$(git rev-parse --show-toplevel)
HERE="$ROOT/scripts/bench-overflow-order"
REV=${1:-a794557384adcc3293a77043f6b9aff1c33d152c}
ROUNDS=${2:-3}
SIZES=${SIZES:-1000 5000 10000}
OUT="$ROOT/experiments/bench-overflow-order"
rm -rf "$OUT" && mkdir -p "$OUT/baseline-src"
git -C "$ROOT" archive "$REV" packages/flint-js/src packages/flint-py/flint | tar -x -C "$OUT/baseline-src"
ESBUILD="$ROOT/node_modules/.bin/esbuild"
"$ESBUILD" "$OUT/baseline-src/packages/flint-js/src/core/filter-overflow.ts" --bundle --format=esm --platform=node --outfile="$OUT/baseline.mjs" --log-level=warning
"$ESBUILD" "$ROOT/packages/flint-js/src/core/filter-overflow.ts" --bundle --format=esm --platform=node --outfile="$OUT/change.mjs" --log-level=warning
run() { if [[ -n ${BENCH_LOCK:-} ]]; then flock "$BENCH_LOCK" "$@"; else "$@"; fi; }
{
  echo "baseline_rev=$(git -C "$ROOT" rev-parse "$REV")"
  echo "change_head=$(git -C "$ROOT" rev-parse HEAD) dirty=$(git -C "$ROOT" status --porcelain -- packages | wc -l)"
  echo "node=$(node --version) python=$(python3 --version) esbuild=$("$ESBUILD" --version)"
  echo "os=$(uname -srm) cpus=$(nproc)"
} > "$OUT/env.txt"
RESULTS="$OUT/results.jsonl"; : > "$RESULTS"
for round in $(seq 1 "$ROUNDS"); do
  if (( round % 2 )); then order="baseline change"; else order="change baseline"; fi
  for n in $SIZES; do
    for label in $order; do
      js=$(run node --expose-gc "$HERE/bench.mjs" "$OUT/$label.mjs" "$label" "$n" 15)
      if [[ $label == baseline ]]; then pyroot="$OUT/baseline-src/packages/flint-py"; else pyroot="$ROOT/packages/flint-py"; fi
      py=$(run python3 "$HERE/bench.py" "$pyroot" "$label" "$n" 7)
      echo "${js%\}},\"round\":$round}" >> "$RESULTS"
      echo "${py%\}},\"round\":$round}" >> "$RESULTS"
    done
  done
done
python3 "$HERE/summarize.py" "$RESULTS" | tee "$OUT/summary.txt"
