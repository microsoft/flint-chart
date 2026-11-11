// Usage: node --expose-gc bench.mjs <bundle.mjs> <label> <N> <reps>
import { createHash } from 'node:crypto';
import v8 from 'node:v8';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const [bundle, label, nArg, repsArg] = process.argv.slice(2);
const { filterOverflow } = await import(pathToFileURL(resolve(bundle)).href);
const N = Number(nArg), reps = Number(repsArg);
const cats = Array.from({ length: N }, (_, i) => `cat-${String(i).padStart(6, '0')}`);
const data = cats.map((Category, i) => ({ Category, Value: (i * 7919) % 1000 }));
// Explicit order: reversed categories, plus missing entries and duplicates.
const order = [...cats].reverse();
order.splice(3, 0, 'missing-a', order[0]);
order.push('missing-b');
const sortBy = JSON.stringify(order);
const call = () => filterOverflow(
  {
    x: { field: 'Category', type: 'nominal', semanticAnnotation: { semanticType: 'Category' } },
    y: { field: 'Value', type: 'quantitative', semanticAnnotation: { semanticType: 'Quantity' } },
  },
  { axisFlags: { x: { banded: true } } },
  { x: { field: 'Category', sortBy }, y: { field: 'Value' } },
  data,
  { maxValues: { x: 25 } },
  new Set(['bar']),
);
const first = call();
const digest = createHash('sha256').update(JSON.stringify(first)).digest('hex');
for (let i = 0; i < 2; i++) call();
const times = [], allocs = [];
for (let i = 0; i < reps; i++) {
  globalThis.gc();
  const a0 = v8.getHeapStatistics().total_allocated_bytes;
  const t0 = process.hrtime.bigint();
  call();
  const t1 = process.hrtime.bigint();
  allocs.push(v8.getHeapStatistics().total_allocated_bytes - a0);
  times.push(Number(t1 - t0) / 1e6);
}
const med = a => [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)];
console.log(JSON.stringify({
  lang: 'js', label, N, reps, node: process.version, digest,
  orderedLen: first.viewports[0]?.orderedValues.length, kept: first.truncations[0]?.keptValues.length,
  medianMs: med(times), minMs: Math.min(...times), times,
  medianAllocBytes: med(allocs), allocs, maxRssKiB: process.resourceUsage().maxRSS,
}));
