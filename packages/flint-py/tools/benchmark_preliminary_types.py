#!/usr/bin/env python3
"""Benchmark preliminary type resolution; run under the shared perf-measure flock.

Run from the repository root with the Python package installed. --compare-fixtures
compares all shared fixture outputs against the baseline instead of benchmarking.
The baseline sources are loaded directly from git, without changing the checkout.
"""
import argparse
import copy
import gc
import hashlib
import importlib.metadata
import json
import platform
import statistics
import subprocess
import sys
import time
import tracemalloc
import types
from pathlib import Path

import flint.core.resolve_semantics as current_semantics
from flint.vegalite.assemble import assemble_vegalite


BASELINE = "a794557384adcc3293a77043f6b9aff1c33d152c"
ROOT = Path(__file__).resolve().parents[3]


def baseline_module(name, path):
    source = subprocess.check_output(
        ["git", "show", f"{BASELINE}:{path}"], cwd=ROOT,
    )
    module = types.ModuleType(name)
    module.__package__ = name.rpartition(".")[0]
    exec(compile(source, f"{BASELINE}:{path}", "exec"), module.__dict__)
    return module, hashlib.sha256(source).hexdigest()


baseline, baseline_assemble_hash = baseline_module(
    "flint.vegalite._baseline_assemble", "packages/flint-py/flint/vegalite/assemble.py",
)
semantics, baseline_semantics_hash = baseline_module(
    "flint.core._baseline_resolve_semantics", "packages/flint-py/flint/core/resolve_semantics.py",
)
baseline.resolve_channel_semantics = semantics.resolve_channel_semantics
baseline.convert_temporal_data = semantics.convert_temporal_data
functions = {"baseline": baseline.assemble_vegalite, "change": assemble_vegalite}


def fixture(n):
    return {
        "data": {"values": [
            {"x": i % 997 + 0.25, "y": (i * 13) % 991 + 0.5,
             "group": f"group-{i % 20}", "unusedYear": 2000 + i % 24}
            for i in range(n)
        ]},
        "semantic_types": {"x": "Quantity", "y": "Quantity", "group": "Category", "unusedYear": "Year"},
        "chart_spec": {
            "chartType": "Scatter Plot",
            "encodings": {"x": "x", "y": "y", "color": "group"},
            "baseSize": {"width": 600, "height": 400},
        },
    }


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":")).encode()).hexdigest()


def compare_fixtures():
    def result(fn, doc):
        try:
            return ("value", fn(copy.deepcopy(doc)))
        except Exception as exc:
            return ("exception", type(exc).__name__, str(exc))

    different = []
    count = 0
    for path in sorted((ROOT / "shared/test-data").glob("*/input.json")):
        if not (path.parent / "expected.json").exists():
            continue
        doc = json.loads(path.read_text())["input"]
        if result(functions["baseline"], doc) != result(functions["change"], doc):
            different.append(path.parent.name)
        count += 1
    print(json.dumps({"fixtures": count, "different": different}, indent=2))
    if different or not count:
        raise SystemExit(1)


def benchmark():
    results = {
        "python": sys.version, "platform": platform.platform(),
        "python_dateutil": importlib.metadata.version("python-dateutil"),
        "baseline_revision": BASELINE,
        "change_revision": subprocess.check_output(["git", "rev-parse", "HEAD"], cwd=ROOT, text=True).strip(),
        "baseline_assemble_sha256": baseline_assemble_hash,
        "baseline_semantics_sha256": baseline_semantics_hash,
        "change_assemble_sha256": hashlib.sha256(Path(assemble_vegalite.__code__.co_filename).read_bytes()).hexdigest(),
        "change_semantics_sha256": hashlib.sha256(Path(current_semantics.__file__).read_bytes()).hexdigest(),
        "fixtures": {},
    }
    for n in (1000, 10000):
        doc = fixture(n)
        fixture_hash = digest(doc)
        expected = functions["baseline"](doc)
        assert expected == functions["change"](doc)
        samples = []
        for round_no in range(3):
            order = ("baseline", "change") if round_no % 2 == 0 else ("change", "baseline")
            for label in order:
                func = functions[label]
                gc.collect()
                started = time.perf_counter()
                result = func(doc)
                elapsed = time.perf_counter() - started
                assert result == expected
                del result
                gc.collect()
                tracemalloc.start()
                result = func(doc)
                _, peak = tracemalloc.get_traced_memory()
                tracemalloc.stop()
                assert result == expected
                samples.append({"round": round_no + 1, "version": label, "seconds": elapsed, "peak_bytes": peak})
        results["fixtures"][str(n)] = {
            "fixture_sha256": fixture_hash, "output_sha256": digest(expected), "samples": samples,
            "median_seconds": {
                label: statistics.median(s["seconds"] for s in samples if s["version"] == label)
                for label in functions
            },
            "median_peak_bytes": {
                label: statistics.median(s["peak_bytes"] for s in samples if s["version"] == label)
                for label in functions
            },
        }
    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--compare-fixtures", action="store_true")
    args = parser.parse_args()
    compare_fixtures() if args.compare_fixtures else benchmark()
