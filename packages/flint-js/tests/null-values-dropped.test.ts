// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleECharts, assembleChartjs } from '../src';

/**
 * Regression: `Number(null)` is `0`, so rows with a missing (null / empty)
 * numeric measurement were silently coerced to 0 instead of being dropped. This
 * injected phantom data points at the origin:
 *   - ECharts boxplot: a spurious value of 0 pulled the whisker/box to 0 and
 *     added a bogus outlier at 0.
 *   - Chart.js bubble: a bubble drawn at (0, 0) for every incomplete row.
 *
 * The fix drops null/empty cells before numeric coercion.
 */

describe('ECharts boxplot drops null values instead of coercing to 0', () => {
  const values = [
    { grp: 'A', v: 10 },
    { grp: 'A', v: 12 },
    { grp: 'A', v: 11 },
    { grp: 'A', v: null },
    { grp: 'A', v: '' },
    { grp: 'A', v: 13 },
    { grp: 'A', v: 9 },
  ];

  it('computes the five-number summary from real values only', () => {
    const ec = assembleECharts({
      data: { values },
      semantic_types: { grp: 'nominal', v: 'quantitative' },
      chart_spec: { chartType: 'Boxplot', encodings: { x: 'grp', y: 'v' } },
    }) as any;

    const box = (ec.series || []).find((s: any) => s.type === 'boxplot');
    expect(box).toBeTruthy();
    const [min, , , , max] = box.data[0];
    // Min must be the real minimum (9), not 0 from a coerced null.
    expect(min).toBe(9);
    expect(max).toBe(13);
    expect(min).toBeGreaterThan(0);
  });

  it('does not create a phantom outlier at 0', () => {
    const ec = assembleECharts({
      data: {
        values: [
          { grp: 'A', v: 50 },
          { grp: 'A', v: 51 },
          { grp: 'A', v: 52 },
          { grp: 'A', v: 53 },
          { grp: 'A', v: null },
          { grp: 'A', v: 54 },
        ],
      },
      semantic_types: { grp: 'nominal', v: 'quantitative' },
      chart_spec: { chartType: 'Boxplot', encodings: { x: 'grp', y: 'v' } },
    }) as any;

    const outliers = (ec.series || []).find((s: any) => s.type === 'scatter');
    const outlierYs: number[] = (outliers?.data ?? []).map((d: any) => d[1]);
    expect(outlierYs).not.toContain(0);
  });
});

describe('Chart.js bubble drops rows with missing x/y instead of plotting (0,0)', () => {
  it('omits null-x and null-y points', () => {
    const cj = assembleChartjs({
      data: {
        values: [
          { x: 1, y: 2, s: 5 },
          { x: null, y: 3, s: 6 },
          { x: 4, y: null, s: 7 },
          { x: '', y: 8, s: 9 },
          { x: 5, y: 6, s: 8 },
        ],
      },
      semantic_types: { x: 'quantitative', y: 'quantitative', s: 'quantitative' },
      chart_spec: { chartType: 'Bubble Chart', encodings: { x: 'x', y: 'y', size: 's' } },
    }) as any;

    const data = cj.data.datasets[0].data;
    // Only the two fully-specified rows survive.
    expect(data.length).toBe(2);
    for (const pt of data) {
      expect(Number.isFinite(pt.x)).toBe(true);
      expect(Number.isFinite(pt.y)).toBe(true);
    }
    // No phantom bubble at the origin.
    expect(data.some((p: any) => p.x === 0 && p.y === 0)).toBe(false);
  });
});
