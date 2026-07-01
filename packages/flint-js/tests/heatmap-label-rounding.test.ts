// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleECharts } from '../src';

/**
 * Regression: ECharts heatmap cell labels previously rendered the raw color
 * value at full floating-point precision (e.g. `30.46666700000002`) and, when
 * cells were narrow, string-SLICED it into gibberish. Noisy aggregates produced
 * long, overlapping, illegible labels.
 *
 * The fix always rounds the label to a sensible number of decimals that fits the
 * cell, falling back to an integer, and hides the label only if even that
 * overflows.
 */

function makeHeatmap(size: { width: number; height: number }, n = 5) {
  const rows = Array.from({ length: n }, (_, i) => `r${i}`);
  const cols = Array.from({ length: n }, (_, i) => `c${i}`);
  const values: any[] = [];
  let seed = 3;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (const r of rows) for (const c of cols) values.push({ row: r, col: c, val: rnd() * 30 + 0.46666700000002 });
  return assembleECharts({
    data: { values },
    semantic_types: { row: 'nominal', col: 'nominal', val: 'quantitative' },
    chart_spec: {
      chartType: 'Heatmap',
      encodings: { x: 'col', y: 'row', color: 'val' },
      baseSize: size,
    },
  }) as any;
}

function heatLabel(ec: any) {
  return (ec.series || []).find((s: any) => s.type === 'heatmap')?.label;
}

describe('ECharts heatmap labels are rounded, never full-precision floats', () => {
  it('rounds noisy float values to short, legible strings', () => {
    const ec = makeHeatmap({ width: 900, height: 700 });
    const label = heatLabel(ec);
    expect(label?.show).toBe(true);
    expect(typeof label.formatter).toBe('function');

    const noisy = label.formatter({ data: [0, 0, 30.46666700000002] });
    expect(noisy).toBe('30.5');
    // The raw, unrounded string must never leak through.
    expect(noisy).not.toContain('30.46666');

    const small = label.formatter({ data: [0, 0, 0.46666700000002] });
    expect(small).toBe('0.47');

    // Integers stay clean.
    expect(label.formatter({ data: [0, 0, 12] })).toBe('12');
  });

  it('never emits a label longer than a few characters', () => {
    const ec = makeHeatmap({ width: 500, height: 400 }, 6);
    const label = heatLabel(ec);
    if (label?.show && typeof label.formatter === 'function') {
      for (const v of [30.46666700000002, 0.46666700000002, 1234.5678, 7]) {
        const out = label.formatter({ data: [0, 0, v] });
        expect(out.length).toBeLessThanOrEqual(6);
      }
    }
  });
});
