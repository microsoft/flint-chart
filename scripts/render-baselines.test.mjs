// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  collectWorkerResult,
  parseArgs,
  summarize,
  verifyRenderResult,
} from './render-baselines.mjs';

describe('render benchmark helpers', () => {
  it('requires at least three warm samples', () => {
    assert.equal(parseArgs([]).samples, 5);
    assert.equal(parseArgs(['--samples', '3']).samples, 3);
    assert.throws(() => parseArgs(['--samples', '2']), /at least 3/);
    assert.throws(() => parseArgs(['--samples', 'abc']), /at least 3/);
  });

  it('summarizes individual timing samples', () => {
    assert.deepEqual(summarize([9, 1, 5]), {
      count: 3,
      min: 1,
      median: 5,
      mean: 5,
      p95: 9,
      max: 9,
    });
  });

  it('accepts a PNG only when signature and dimensions match', () => {
    const png = Buffer.alloc(24);
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
    png.writeUInt32BE(12, 16);
    png.writeUInt32BE(8, 20);
    const testCase = { backend: 'chartjs', format: 'png' };
    const result = {
      backend: 'chartjs',
      format: 'png',
      mimeType: 'image/png',
      width: 12,
      height: 8,
      buffer: png,
      warnings: [],
    };
    assert.equal(verifyRenderResult(result, testCase).artifactBytes, png.length);
    assert.throws(
      () => verifyRenderResult({ ...result, width: 13 }, testCase),
      /do not match reported/,
    );
    assert.throws(
      () => verifyRenderResult({ ...result, buffer: Buffer.alloc(24) }, testCase),
      /PNG signature/,
    );
  });

  it('accepts SVG only when root dimensions match the render result', () => {
    const testCase = { backend: 'echarts', format: 'svg' };
    const result = {
      backend: 'echarts',
      format: 'svg',
      mimeType: 'image/svg+xml',
      width: 12,
      height: 8,
      svg: '<svg width="12" height="8"></svg>',
      warnings: [],
    };
    assert.equal(verifyRenderResult(result, testCase).artifactBytes, result.svg.length);
    assert.throws(
      () => verifyRenderResult({ ...result, svg: '<svg width="12" height="9"></svg>' }, testCase),
      /do not match reported/,
    );
  });

  it('preserves completed samples and records an in-flight timeout as an error', () => {
    const coldSample = {
      phase: 'cold-first-operation-in-fresh-process',
      index: 1,
      status: 'ok',
      elapsedMs: 10,
      memory: { delta: {} },
      output: { width: 10, height: 8 },
    };
    const result = collectWorkerResult({
      status: null,
      signal: 'SIGKILL',
      error: Object.assign(new Error('spawnSync timed out'), { code: 'ETIMEDOUT' }),
      stdout: `${JSON.stringify({ event: 'cold', sample: coldSample })}\n`,
      stderr: '',
    }, 3);
    assert.deepEqual(result.cold, coldSample);
    assert.equal(result.warmup.status, 'error');
    assert.equal(result.warmup.error.name, 'WorkerTimeout');
    assert.equal(result.warmSamples[0].status, 'not-run');
    assert.equal(result.warmSamples.length, 3);
  });
});
