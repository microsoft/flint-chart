"""Compare a git-show baseline with the current converter.

Run from the repository root:
  mkdir -p loops
  git show BASE:packages/flint-py/flint/core/resolve_semantics.py > loops/temporal-baseline.py
  flock LOCK env PYTHONPATH=packages/flint-py python packages/flint-py/tools/benchmark_temporal_columns.py loops/temporal-baseline.py --baseline-ref BASE

Each sample times one call without tracemalloc, then measures a separate call's
peak allocations. Validation and fixture construction happen outside samples.
"""

import argparse
import copy
import gc
import hashlib
import importlib.util
import json
import platform
import sys
import time
import tracemalloc
from pathlib import Path

from flint.core import resolve_semantics


def load_baseline(path):
    spec = importlib.util.spec_from_file_location("flint.core._temporal_baseline", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module.convert_temporal_data


def fixtures():
    numeric = [{f"column_{j}": i + j for j in range(20)} for i in range(10_000)]
    shared = {"children": [1, 2]}
    mixed = [
        {
            **{f"column_{j}": i + j for j in range(16)},
            "calendar_year": 2000 + i % 20,
            "decade": 1990 + 10 * (i % 3),
            "timestamp": 1_700_000_000 + i,
            "date": f"2020-01-{i % 28 + 1:02d}",
            "nested": shared,
            "alias": shared,
        }
        for i in range(10_000)
    ]
    mixed[-1] = mixed[0]
    return {
        "wide_numeric": (numeric, {}),
        "mixed_temporal": (mixed, {"decade": "Decade", "timestamp": "Timestamp"}),
    }


def validate(baseline, changed, name, data, semantics):
    original = copy.deepcopy(data)
    before = baseline(data, semantics)
    after = changed(data, semantics)
    assert before == after and data == original
    if name == "wide_numeric":
        assert before is data and after is data
    else:
        for result in (before, after):
            assert result is not data and result[0] is result[-1]
            assert result[0]["nested"] is result[0]["alias"] is result[1]["nested"]
            assert result[0]["nested"] is not data[0]["nested"]
        assert data[0]["calendar_year"] == 2000


def sample(fn, data, semantics):
    gc.collect()
    start = time.perf_counter_ns()
    result = fn(data, semantics)
    elapsed_ns = time.perf_counter_ns() - start
    del result
    gc.collect()
    tracemalloc.start()
    result = fn(data, semantics)
    _, peak = tracemalloc.get_traced_memory()
    tracemalloc.stop()
    del result
    return {"elapsed_ns": elapsed_ns, "peak_bytes": peak}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("baseline", type=Path)
    parser.add_argument("--baseline-ref", required=True, help="Git commit used to extract baseline")
    parser.add_argument("--rounds", type=int, default=3)
    args = parser.parse_args()
    if args.rounds < 3:
        parser.error("at least three interleaved rounds are required")
    baseline = load_baseline(args.baseline)
    changed = resolve_semantics.convert_temporal_data
    cases = fixtures()
    report = {
        "python": sys.version,
        "platform": platform.platform(),
        "baseline_ref": args.baseline_ref,
        "baseline_sha256": hashlib.sha256(args.baseline.read_bytes()).hexdigest(),
        "changed_sha256": hashlib.sha256(Path(resolve_semantics.__file__).read_bytes()).hexdigest(),
        "fixtures": {},
        "rounds": [],
    }
    for name, (data, semantics) in cases.items():
        validate(baseline, changed, name, data, semantics)
        payload = json.dumps([data, semantics], sort_keys=True, separators=(",", ":")).encode()
        report["fixtures"][name] = {
            "rows": len(data),
            "first_row_keys": list(data[0]),
            "json_sha256": hashlib.sha256(payload).hexdigest(),
            "semantics": semantics,
            "aliases": "last row is first; nested and alias share one object across rows"
            if name == "mixed_temporal" else "none",
        }
    for round_index in range(args.rounds):
        order = (("baseline", baseline), ("changed", changed))
        if round_index % 2:
            order = tuple(reversed(order))
        for name, (data, semantics) in cases.items():
            for label, fn in order:
                report["rounds"].append({
                    "round": round_index + 1,
                    "fixture": name,
                    "implementation": label,
                    **sample(fn, data, semantics),
                })
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
