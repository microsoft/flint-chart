# Usage: python3 bench.py <flint-pkg-parent-dir> <label> <N> <reps>
import gc, hashlib, json, platform, resource, sys, time, tracemalloc
root, label, n, reps = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4])
sys.path.insert(0, root)
from flint.core.filter_overflow import filter_overflow  # noqa: E402
cats = [f"cat-{i:06d}" for i in range(n)]
data = [{"Category": c, "Value": (i * 7919) % 1000} for i, c in enumerate(cats)]
order = list(reversed(cats))
order[3:3] = ["missing-a", order[0]]
order.append("missing-b")
sort_by = json.dumps(order)
def call():
    return filter_overflow(
        {"x": {"field": "Category", "type": "nominal", "semanticAnnotation": {"semanticType": "Category"}},
         "y": {"field": "Value", "type": "quantitative", "semanticAnnotation": {"semanticType": "Quantity"}}},
        {"axisFlags": {"x": {"banded": True}}},
        {"x": {"field": "Category", "sortBy": sort_by}, "y": {"field": "Value"}},
        data, {"maxValues": {"x": 25}}, {"bar"})
first = call()
digest = hashlib.sha256(json.dumps(first, sort_keys=True, default=str).encode()).hexdigest()
call()
times = []
for _ in range(reps):
    gc.collect()
    t0 = time.perf_counter_ns(); call(); times.append((time.perf_counter_ns() - t0) / 1e6)
gc.collect()
tracemalloc.start()
base = tracemalloc.get_traced_memory()[0]
tracemalloc.reset_peak()
call()
peak = tracemalloc.get_traced_memory()[1] - base
tracemalloc.stop()
s = sorted(times)
print(json.dumps({"lang": "py", "label": label, "N": n, "reps": reps, "python": platform.python_version(),
                  "digest": digest, "orderedLen": len(first["viewports"][0]["orderedValues"]),
                  "kept": len(first["truncations"][0]["keptValues"]), "medianMs": s[len(s)//2], "minMs": s[0],
                  "times": times, "tracemallocPeakBytes": peak,
                  "maxRssKiB": resource.getrusage(resource.RUSAGE_SELF).ru_maxrss}))
