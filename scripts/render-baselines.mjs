// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { performance } from 'node:perf_hooks';
import v8 from 'node:v8';

let assembleForBackend;
let staticFixture;
let renderChart;

const scriptPath = fileURLToPath(import.meta.url);
const RENDER_CASES = [
  { id: 'render:vegalite:svg', kind: 'render', backend: 'vegalite', format: 'svg' },
  { id: 'render:vegalite:png', kind: 'render', backend: 'vegalite', format: 'png' },
  { id: 'render:echarts:svg', kind: 'render', backend: 'echarts', format: 'svg' },
  { id: 'render:echarts:png', kind: 'render', backend: 'echarts', format: 'png' },
  { id: 'render:chartjs:png', kind: 'render', backend: 'chartjs', format: 'png' },
];
const COMPILER_CASES = ['vegalite', 'echarts', 'chartjs'].map((backend) => ({
  id: `compiler:${backend}`,
  kind: 'compiler',
  backend,
  format: 'spec',
}));
const CASES = [...COMPILER_CASES, ...RENDER_CASES];

export function parseArgs(argv) {
  const options = { samples: 5, output: undefined, worker: undefined };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      return { help: true };
    }
    if (arg === '--samples') {
      options.samples = Number(argv[++i]);
      if (!Number.isInteger(options.samples) || options.samples < 3) {
        throw new Error('--samples must be an integer of at least 3');
      }
      continue;
    }
    if (arg.startsWith('--samples=')) {
      options.samples = Number(arg.slice('--samples='.length));
      if (!Number.isInteger(options.samples) || options.samples < 3) {
        throw new Error('--samples must be an integer of at least 3');
      }
      continue;
    }
    if (arg === '--out') {
      options.output = argv[++i];
      if (!options.output) throw new Error('--out requires a path');
      continue;
    }
    if (arg.startsWith('--out=')) {
      options.output = arg.slice('--out='.length);
      if (!options.output) throw new Error('--out requires a path');
      continue;
    }
    if (arg === '--worker') {
      options.worker = argv[++i];
      if (!options.worker) throw new Error('--worker requires a case id');
      continue;
    }
    throw new Error(`Unknown option: ${arg}`);
  }
  return options;
}

function memorySnapshot() {
  const { rss, heapTotal, heapUsed, external, arrayBuffers } = process.memoryUsage();
  return { rss, heapTotal, heapUsed, external, arrayBuffers };
}

function memoryDelta(before, after) {
  return Object.fromEntries(
    Object.keys(before).map((key) => [key, after[key] - before[key]]),
  );
}

export function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const sum = sorted.reduce((total, value) => total + value, 0);
  const percentile = (p) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
  return {
    count: values.length,
    min: sorted[0],
    median: percentile(0.5),
    mean: sum / values.length,
    p95: percentile(0.95),
    max: sorted.at(-1),
  };
}

function summarizeSamples(samples) {
  const successful = samples.filter((sample) => sample.status === 'ok');
  if (successful.length === 0) return null;
  const memoryKeys = Object.keys(successful[0].memory.delta);
  return {
    elapsedMs: summarize(successful.map((sample) => sample.elapsedMs)),
    memoryDeltaBytes: Object.fromEntries(
      memoryKeys.map((key) => [
        key,
        summarize(successful.map((sample) => sample.memory.delta[key])),
      ]),
    ),
  };
}

function fixtureInfo() {
  const input = staticFixture;
  const rows = input.data.values;
  const serialized = JSON.stringify(input);
  return {
    name: 'STATIC_SERIES_LINE_BASIC',
    source: 'packages/flint-js/src/test-data/static-series-tests.ts',
    chartType: input.chart_spec.chartType,
    rows: rows.length,
    columns: Object.keys(rows[0] ?? {}).length,
    fields: Object.keys(rows[0] ?? {}),
    serializedBytes: Buffer.byteLength(serialized),
    baseSize: input.chart_spec.baseSize ?? null,
  };
}

export function verifyRenderResult(result, testCase) {
  if (result.backend !== testCase.backend || result.format !== testCase.format) {
    throw new Error(
      `Unexpected render identity: got ${result.backend}/${result.format}, expected ${testCase.backend}/${testCase.format}`,
    );
  }
  const expectedMimeType = testCase.format === 'png' ? 'image/png' : 'image/svg+xml';
  if (result.mimeType !== expectedMimeType) {
    throw new Error(`Unexpected MIME type: got ${result.mimeType}, expected ${expectedMimeType}`);
  }
  if (!Number.isFinite(result.width) || result.width <= 0 ||
      !Number.isFinite(result.height) || result.height <= 0) {
    throw new Error(`Renderer returned invalid dimensions: ${result.width}x${result.height}`);
  }

  if (testCase.format === 'png') {
    const buffer = result.buffer;
    if (!Buffer.isBuffer(buffer) ||
        !buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
      throw new Error('Renderer did not return a valid PNG signature');
    }
    const pixelWidth = buffer.readUInt32BE(16);
    const pixelHeight = buffer.readUInt32BE(20);
    if (pixelWidth !== result.width || pixelHeight !== result.height) {
      throw new Error(
        `PNG header dimensions ${pixelWidth}x${pixelHeight} do not match reported ${result.width}x${result.height}`,
      );
    }
    return {
      mimeType: result.mimeType,
      width: result.width,
      height: result.height,
      artifactBytes: buffer.length,
      warnings: result.warnings.map(({ code, message }) => ({ code, message })),
    };
  }

  if (typeof result.svg !== 'string' || !/<svg(?:\s|>)/i.test(result.svg)) {
    throw new Error('Renderer did not return SVG markup');
  }
  const rootTag = result.svg.match(/<svg\b[^>]*>/i)?.[0];
  const svgWidth = rootTag?.match(/\bwidth="([^"]+)"/i)?.[1];
  const svgHeight = rootTag?.match(/\bheight="([^"]+)"/i)?.[1];
  if (Number.parseFloat(svgWidth) !== result.width ||
      Number.parseFloat(svgHeight) !== result.height) {
    throw new Error(
      `SVG root dimensions ${svgWidth ?? 'missing'}x${svgHeight ?? 'missing'} do not match reported ${result.width}x${result.height}`,
    );
  }
  return {
    mimeType: result.mimeType,
    width: result.width,
    height: result.height,
    artifactBytes: Buffer.byteLength(result.svg),
    warnings: result.warnings.map(({ code, message }) => ({ code, message })),
  };
}

function summarizeCompilerResult(result, testCase) {
  if (!result.spec || typeof result.spec !== 'object' || !Array.isArray(result.warnings)) {
    throw new Error(`Compiler returned an invalid result for ${testCase.backend}`);
  }
  const width = result.width ?? result.spec._width ?? result.spec.width ?? null;
  const height = result.height ?? result.spec._height ?? result.spec.height ?? null;
  return {
    backend: testCase.backend,
    format: 'spec',
    width,
    height,
    specKeys: Object.keys(result.spec).length,
    warnings: result.warnings.length,
  };
}

async function executeCase(testCase, input) {
  if (testCase.kind === 'compiler') {
    return assembleForBackend(testCase.backend, input);
  }

  return renderChart(input, testCase.backend, {
    format: testCase.format,
    scale: 1,
    background: '#ffffff',
    disableFileReference: true,
  });
}

async function measure(testCase, index, phase) {
  const input = structuredClone(staticFixture);
  const before = memorySnapshot();
  const started = performance.now();
  let elapsedMs;
  let after;
  try {
    const result = await executeCase(testCase, input);
    elapsedMs = performance.now() - started;
    after = memorySnapshot();
    const output = testCase.kind === 'compiler'
      ? summarizeCompilerResult(result, testCase)
      : verifyRenderResult(result, testCase);
    return {
      phase,
      index,
      status: 'ok',
      elapsedMs,
      memory: { before, after, delta: memoryDelta(before, after) },
      output,
    };
  } catch (error) {
    elapsedMs ??= performance.now() - started;
    after ??= memorySnapshot();
    return {
      phase,
      index,
      status: 'error',
      elapsedMs,
      memory: { before, after, delta: memoryDelta(before, after) },
      error: {
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

function gitMetadata() {
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' });
  const status = spawnSync('git', ['status', '--porcelain'], { encoding: 'utf8' });
  if (revision.status !== 0 || status.status !== 0) {
    throw new Error('Could not read the source revision and worktree state from git');
  }
  return {
    revision: revision.stdout.trim(),
    dirty: status.stdout.trim().length > 0,
  };
}

function environmentMetadata() {
  return {
    node: process.version,
    v8: process.versions.v8,
    platform: process.platform,
    architecture: process.arch,
    osRelease: os.release(),
    cpuModel: os.cpus()[0]?.model ?? 'unknown',
    cpuCount: os.cpus().length,
    availableParallelism: os.availableParallelism?.() ?? os.cpus().length,
    totalMemoryBytes: os.totalmem(),
    v8HeapLimitBytes: v8.getHeapStatistics().heap_size_limit,
    execArgv: process.execArgv,
    nodeOptions: process.env.NODE_OPTIONS ?? null,
  };
}

async function runWorker(caseId) {
  const testCase = CASES.find(({ id }) => id === caseId);
  if (!testCase) throw new Error(`Unknown benchmark worker case: ${caseId}`);
  const sample = await measure(testCase, 1, 'cold-first-operation-in-fresh-process');
  process.stdout.write(`${JSON.stringify(sample)}\n`);
  if (sample.status !== 'ok') process.exitCode = 1;
}

function runColdSample(testCase, index) {
  const child = spawnSync(process.execPath, [...process.execArgv, scriptPath, '--worker', testCase.id], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024,
  });
  if (child.status === 0) {
    try {
      return { ...JSON.parse(child.stdout), index };
    } catch (error) {
      return {
        phase: 'cold-first-operation-in-fresh-process',
        index,
        status: 'error',
        error: {
          name: 'WorkerProtocolError',
          message: `Worker returned invalid JSON: ${error.message}; stderr: ${child.stderr.trim()}`,
        },
      };
    }
  }
  let workerSample;
  try {
    workerSample = JSON.parse(child.stdout);
  } catch {
    workerSample = undefined;
  }
  return workerSample?.status === 'error'
    ? { ...workerSample, index }
    : {
        phase: 'cold-first-operation-in-fresh-process',
        index,
        status: 'error',
        error: {
          name: 'WorkerProcessError',
          message: `Worker exited ${child.status ?? child.signal}: ${child.error?.message || child.stderr.trim() || child.stdout.trim() || 'no diagnostic output'}`,
        },
      };
}

async function runBenchmark({ samples, output }) {
  const startedAt = new Date().toISOString();
  const testCases = [
    ...CASES,
    {
      id: 'render:chartjs:svg',
      kind: 'render',
      backend: 'chartjs',
      format: 'svg',
      status: 'skipped',
      reason: 'The in-process MCP Chart.js renderer supports PNG only; it has no SVG engine.',
    },
  ];
  const cases = [];

  for (const testCase of testCases) {
    if (testCase.status === 'skipped') {
      cases.push({
        id: testCase.id,
        kind: testCase.kind,
        backend: testCase.backend,
        format: testCase.format,
        status: 'skipped',
        reason: testCase.reason,
      });
      continue;
    }

    const coldSamples = [];
    for (let i = 1; i <= samples; i++) coldSamples.push(runColdSample(testCase, i));

    const warmup = await measure(testCase, 0, 'warmup-excluded');
    const warmSamples = [];
    for (let i = 1; i <= samples; i++) {
      warmSamples.push(await measure(testCase, i, 'warm'));
    }
    const errors = [...coldSamples, ...warmSamples].filter((sample) => sample.status !== 'ok');
    if (warmup.status !== 'ok') errors.push(warmup);
    const firstSuccessfulOutput = warmSamples.find((sample) => sample.output)?.output;
    cases.push({
      id: testCase.id,
      kind: testCase.kind,
      backend: testCase.backend,
      format: testCase.format,
      dimensions: firstSuccessfulOutput
        ? { width: firstSuccessfulOutput.width, height: firstSuccessfulOutput.height }
        : null,
      status: errors.length === 0 && warmup.status === 'ok' ? 'ok' : 'error',
      cold: {
        definition: 'One measured first operation in each fresh Node process, after module loading.',
        samples: coldSamples,
        summary: summarizeSamples(coldSamples),
      },
      warm: {
        definition: 'Sequential operations in this process after one excluded warm-up operation.',
        warmup,
        samples: warmSamples,
        summary: summarizeSamples(warmSamples),
      },
      errors,
    });
  }

  const result = {
    schemaVersion: 1,
    startedAt,
    completedAt: new Date().toISOString(),
    source: gitMetadata(),
    invocation: {
      argv: process.argv.slice(1),
      workingDirectory: process.cwd(),
    },
    environment: environmentMetadata(),
    fixture: fixtureInfo(),
    configuration: {
      requestedSamplesPerPhase: samples,
      warmupOperationsPerCase: 1,
      outputFormat: 'JSON',
      memoryDefinition: 'process.memoryUsage snapshots before and after each operation; deltas are not allocation totals or peak memory.',
      memoryFields: ['rss', 'heapTotal', 'heapUsed', 'external', 'arrayBuffers'],
      gcForced: false,
    },
    cases,
  };
  const serialized = `${JSON.stringify(result, null, 2)}\n`;
  if (output) {
    const outputPath = resolve(output);
    mkdirSync(dirname(outputPath), { recursive: true });
    writeFileSync(outputPath, serialized, { flag: 'wx' });
    process.stdout.write(`Wrote benchmark records to ${outputPath}\n`);
  } else {
    process.stdout.write(serialized);
  }
  return cases.some((testCase) => testCase.status === 'error') ? 1 : 0;
}

function printHelp() {
  process.stdout.write(
    'Usage: npm run benchmark:render -- [--samples N] [--out FILE]\n' +
      '  --samples N  Cold and warm samples per case (minimum 3, default 5)\n' +
      '  --out FILE   Write a new JSON result file; existing files are not overwritten\n' +
      '  -h, --help   Show this help\n',
  );
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return 0;
  }
  const [{ assembleForBackend: compiler }, { STATIC_SERIES_LINE_BASIC }, renderer] = await Promise.all([
    import('flint-chart'),
    import('flint-chart/test-data'),
    import('../packages/flint-mcp/dist/render/index.js'),
  ]);
  assembleForBackend = compiler;
  staticFixture = STATIC_SERIES_LINE_BASIC;
  renderChart = renderer.renderChart;
  if (options.worker) {
    await runWorker(options.worker);
    return process.exitCode ?? 0;
  }
  return runBenchmark(options);
}

if (process.argv[1] && resolve(process.argv[1]) === scriptPath) {
  main().then((exitCode) => {
    process.exitCode = exitCode;
  }).catch((error) => {
    process.stderr.write(`Render benchmark failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
