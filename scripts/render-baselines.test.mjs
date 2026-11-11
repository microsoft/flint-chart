// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { parseArgs, summarize, verifyRenderResult } from './render-baselines.mjs';

describe('render benchmark helpers', () => {
  it('requires at least three cold and warm samples', () => {
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
});
