// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Regression: ECharts / Chart.js Sort encoding action (gallery Sort control).
 * Parity with packages/flint-js/tests/plotly-widgets.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { assembleECharts, assembleChartjs } from '../src';

const CATS = [{ Cat: 'A', Val: 30 }, { Cat: 'B', Val: 90 }, { Cat: 'C', Val: 50 }];
const CAT_TYPES = { Cat: 'Category', Val: 'Quantity' } as const;

function ecBandOrder(spec: any): string[] {
  const cat = [spec.xAxis, spec.yAxis].find((ax) => ax?.type === 'category');
  return cat?.data ?? [];
}

function cjsBandOrder(spec: any): string[] {
  return spec.data?.labels ?? [];
}

describe('ECharts Sort encoding action', () => {
  for (const chartType of ['Bar Chart', 'Stacked Bar Chart', 'Grouped Bar Chart', 'Lollipop Chart']) {
    it(`reorders ${chartType} categories by value`, () => {
      const mk = (sort?: string) => assembleECharts({
        data: { values: CATS },
        semantic_types: CAT_TYPES,
        chart_spec: {
          chartType, encodings: { x: 'Cat', y: 'Val' },
          ...(sort ? { chartProperties: { sort } } : {}),
        },
      } as any);
      expect(ecBandOrder(mk())).toEqual(['A', 'B', 'C']);
      expect(ecBandOrder(mk('value-desc'))).toEqual(['B', 'C', 'A']);
      expect(ecBandOrder(mk('value-asc'))).toEqual(['A', 'C', 'B']);
    });
  }
});

describe('Chart.js Sort encoding action', () => {
  for (const chartType of ['Bar Chart', 'Stacked Bar Chart', 'Grouped Bar Chart']) {
    it(`reorders ${chartType} categories by value`, () => {
      const mk = (sort?: string) => assembleChartjs({
        data: { values: CATS },
        semantic_types: CAT_TYPES,
        chart_spec: {
          chartType, encodings: { x: 'Cat', y: 'Val' },
          ...(sort ? { chartProperties: { sort } } : {}),
        },
      } as any);
      expect(cjsBandOrder(mk())).toEqual(['A', 'B', 'C']);
      expect(cjsBandOrder(mk('value-desc'))).toEqual(['B', 'C', 'A']);
      expect(cjsBandOrder(mk('value-asc'))).toEqual(['A', 'C', 'B']);
    });
  }
});

describe('Line Curve interpolate (non-VL)', () => {
  it('ECharts applies monotone smooth', () => {
    const data = [
      { t: 1, v: 2 }, { t: 2, v: 5 }, { t: 3, v: 3 },
    ];
    const option = assembleECharts({
      data: { values: data },
      semantic_types: { t: 'Quantity', v: 'Quantity' },
      chart_spec: {
        chartType: 'Line Chart',
        encodings: { x: 't', y: 'v' },
        chartProperties: { interpolate: 'monotone' },
      },
    } as any);
    expect(option.series?.some((s: any) => s.smooth === true)).toBe(true);
  });

  it('Chart.js applies monotone tension', () => {
    const data = [
      { t: 1, v: 2 }, { t: 2, v: 5 }, { t: 3, v: 3 },
    ];
    const config = assembleChartjs({
      data: { values: data },
      semantic_types: { t: 'Quantity', v: 'Quantity' },
      chart_spec: {
        chartType: 'Line Chart',
        encodings: { x: 't', y: 'v' },
        chartProperties: { interpolate: 'monotone' },
      },
    } as any);
    expect(config.data.datasets[0].tension).toBe(0.4);
  });

  it('ECharts keeps basis (not dropped by normalize)', () => {
    const data = [
      { t: 1, v: 2 }, { t: 2, v: 5 }, { t: 3, v: 3 },
    ];
    const option = assembleECharts({
      data: { values: data },
      semantic_types: { t: 'Quantity', v: 'Quantity' },
      chart_spec: {
        chartType: 'Line Chart',
        encodings: { x: 't', y: 'v' },
        chartProperties: { interpolate: 'basis' },
      },
    } as any);
    expect(option.series?.some((s: any) => s.smooth === true)).toBe(true);
    expect(option._warnings?.some((w: any) => w.code === 'invalid-option-value')).toBeFalsy();
  });
});
