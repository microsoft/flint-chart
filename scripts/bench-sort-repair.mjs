import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { Session } from 'node:inspector';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { build } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const source = 'packages/flint-js/src/core/resolve-semantics.ts';
const revision = (ref) => execFileSync('git', ['rev-parse', ref], { cwd: root, encoding: 'utf8' }).trim();
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const sampledBytes = (node) => node.selfSize + (node.children ?? []).reduce((sum, child) => sum + sampledBytes(child), 0);

async function worker(bundle) {
  const { repairEncodingSorts } = await import(pathToFileURL(bundle));
  const results = [];
  for (const count of [1_000, 100_000]) {
    const data = Array.from({ length: count }, (_, row) => Object.fromEntries(
      Array.from({ length: 10 }, (_, column) => [`f${column}`, row + column]),
    ));
    for (const mode of ['none', 'channel', 'field']) {
      const encodings = {
        x: { field: 'f0', ...(mode === 'none' ? {} : { sortBy: mode === 'channel' ? 'y' : 'f9' }) },
        y: { field: 'f1' },
      };
      const run = () => repairEncodingSorts(encodings, data);
      for (let i = 0; i < 5; i++) run();
      const times = [];
      for (let i = 0; i < 7; i++) {
        const start = performance.now();
        run();
        times.push(performance.now() - start);
      }
      global.gc();
      const session = new Session();
      session.connect();
      const post = promisify(session.post.bind(session));
      let allocation;
      try {
        await post('HeapProfiler.startSampling', {
          samplingInterval: 32768,
          includeObjectsCollectedByMajorGC: true,
          includeObjectsCollectedByMinorGC: true,
        });
        for (let i = 0; i < 5; i++) run();
        allocation = sampledBytes((await post('HeapProfiler.stopSampling')).profile.head) / 5;
      } finally {
        session.disconnect();
      }
      const output = run();
      assert.deepEqual(output, { encodings, warnings: [] });
      results.push({
        rows: count, fields: 10, mode, timesMs: times, medianMs: median(times),
        sampledAllocatedBytesPerCall: allocation,
        outputHash: createHash('sha256').update(JSON.stringify(output)).digest('hex'),
      });
    }
  }
  return results;
}

if (process.argv[2] === '--worker') {
  console.log(JSON.stringify(await worker(process.argv[3])));
} else {
  const baseline = process.argv[2] ?? 'origin/main';
  const baselineRevision = revision(baseline);
  const directory = await mkdtemp(join(tmpdir(), 'flint-sort-repair-'));
  try {
    const bundles = {};
    for (const variant of ['baseline', 'change']) {
      const result = await build({
        absWorkingDir: root, entryPoints: [source], bundle: true, platform: 'node',
        format: 'esm', write: false,
        plugins: variant === 'baseline' ? [{
          name: 'baseline-source',
          setup(builder) {
            builder.onLoad({ filter: /[/\\]core[/\\]resolve-semantics\.ts$/ }, () => ({
              contents: execFileSync('git', ['show', `${baselineRevision}:${source}`], { cwd: root, encoding: 'utf8' }),
              loader: 'ts',
            }));
          },
        }] : [],
      });
      bundles[variant] = join(directory, `${variant}.mjs`);
      await writeFile(bundles[variant], result.outputFiles[0].text);
    }
    const rounds = [];
    for (let round = 0; round < 3; round++) {
      const measurements = {};
      const order = round % 2 ? ['change', 'baseline'] : ['baseline', 'change'];
      for (const variant of order) {
        measurements[variant] = JSON.parse(execFileSync(process.execPath, [
          '--expose-gc', fileURLToPath(import.meta.url), '--worker', bundles[variant],
        ], { cwd: root, encoding: 'utf8', maxBuffer: 1024 * 1024 }));
      }
      assert.deepEqual(
        measurements.baseline.map(({ outputHash }) => outputHash),
        measurements.change.map(({ outputHash }) => outputHash),
      );
      rounds.push({ round: round + 1, order, ...measurements });
    }
    console.log(JSON.stringify({
      baselineRevision, changeRevision: revision('HEAD'),
      workingTreeDiff: execFileSync('git', ['diff', '--', source], { cwd: root, encoding: 'utf8' }),
      node: process.version, platform: process.platform, arch: process.arch,
      metrics: {
        timing: 'Seven post-warmup calls per fixture, without heap sampling enabled.',
        allocation: 'V8 sampled allocated bytes per call across five separate calls; 32 KiB sampling interval, including collected objects. An estimate, not exact bytes or retained heap; small allocations may sample as zero.',
        isolation: 'Fresh subprocess per variant per round; three interleaved rounds. Serialize externally to avoid concurrent benchmark load.',
      },
      rounds,
    }, null, 2));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
