// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import {
  assembleVegaLite,
  assembleECharts,
  assembleChartjs,
  assemblePlotly,
} from '../src';

const DATA = [
  { weight: 1.6, mpg: 32, origin: 'JP' },
  { weight: 2.1, mpg: 27, origin: 'US' },
  { weight: 1.9, mpg: 29, origin: 'EU' },
];

const INPUT = {
  data: { values: DATA },
  semantic_types: { weight: 'Quantity', mpg: 'Quantity', origin: 'Country' },
  chart_spec: {
    chartType: 'Scatter Plot',
    encodings: {
      x: { field: 'weight' },
      y: { field: 'mpg' },
      color: { field: 'origin' },
    },
    baseSize: { width: 400, height: 300 },
  },
};

describe('public API smoke', () => {
  it('assembleVegaLite returns a Vega-Lite spec', () => {
    const spec = assembleVegaLite(INPUT) as any;
    expect(spec).toBeDefined();
    expect(spec.$schema ?? spec.encoding ?? spec.layer ?? spec.mark).toBeDefined();
  });

  it('assembleECharts returns an option object', () => {
    const option = assembleECharts(INPUT) as any;
    expect(option).toBeDefined();
    expect(typeof option).toBe('object');
  });

  it('assembleChartjs returns a config object', () => {
    const config = assembleChartjs(INPUT) as any;
    expect(config).toBeDefined();
    expect(config.type ?? config.data ?? config.options).toBeDefined();
  });

  it('assemblePlotly returns a figure object', () => {
    const figure = assemblePlotly(INPUT) as any;
    expect(figure).toBeDefined();
    expect(Array.isArray(figure.data)).toBe(true);
    expect(figure.layout).toBeDefined();
  });

  it('line chart with quantitative color uses a line layer plus colored points', () => {
    const spec = assembleVegaLite({
      data: {
        values: [
          { Date: '2019-12-31', Value: 117, ColorVal: 2.4 },
          { Date: '2020-02-05', Value: 109, ColorVal: 1.9 },
        ],
      },
      semantic_types: { Date: 'Date', Value: 'Quantity', ColorVal: 'Quantity' },
      chart_spec: {
        chartType: 'Line Chart',
        encodings: {
          x: { field: 'Date' },
          y: { field: 'Value' },
          color: { field: 'ColorVal' },
        },
        baseSize: { width: 480, height: 320 },
      },
    }) as any;

    expect(spec.layer).toHaveLength(2);
    expect(spec.layer[0].mark.type).toBe('line');
    expect(spec.layer[0].encoding.x?.field).toBe('Date');
    expect(spec.layer[0].encoding.y?.field).toBe('Value');
    expect(spec.layer[1].encoding.color?.field).toBe('ColorVal');
    expect(spec.layer[1].encoding.color?.type).toBe('quantitative');
  });

  it('line chart preserves the interpolate chart property', () => {
    const spec = assembleVegaLite({
      data: {
        values: [
          { Date: '2026-02', Value: 12 },
          { Date: '2026-03', Value: 18 },
          { Date: '2026-04', Value: 15 },
        ],
      },
      semantic_types: { Date: 'YearMonth', Value: 'Quantity' },
      chart_spec: {
        chartType: 'Line Chart',
        encodings: {
          x: { field: 'Date' },
          y: { field: 'Value' },
        },
        chartProperties: { interpolate: 'monotone' },
      },
    }) as any;

    expect(spec.mark).toMatchObject({ type: 'line', interpolate: 'monotone' });
  });

  it('chart.js line with quantitative color uses separate datasets per color value', () => {
    const config = assembleChartjs({
      data: {
        values: [
          { Date: '2019-12-31', Value: 117, ColorVal: 2.4 },
          { Date: '2020-02-05', Value: 109, ColorVal: 9.5 },
        ],
      },
      semantic_types: { Date: 'Date', Value: 'Quantity', ColorVal: 'Quantity' },
      chart_spec: {
        chartType: 'Line Chart',
        encodings: {
          x: { field: 'Date' },
          y: { field: 'Value' },
          color: { field: 'ColorVal' },
        },
        baseSize: { width: 480, height: 320 },
      },
    }) as any;

    expect(config.data.datasets).toHaveLength(2);
    expect(config.data.datasets[0].data).toHaveLength(1);
    expect(config.data.datasets[1].data).toHaveLength(1);
  });

  it('aggregate encodings compute the derived field from raw rows (count/sum/average/mean)', () => {
    const makeBar = (aggregate: 'count' | 'sum' | 'average' | 'mean') =>
      assembleVegaLite({
        data: {
          // Raw, un-aggregated rows: method A has times [1, 3], method B has [2, 4].
          values: [
            { method: 'A', time: 1 },
            { method: 'A', time: 3 },
            { method: 'B', time: 2 },
            { method: 'B', time: 4 },
          ],
        },
        semantic_types: { method: 'Category', time: 'Quantity' },
        chart_spec: {
          chartType: 'Bar Chart',
          encodings: {
            x: { field: 'method' },
            y: { field: 'time', aggregate },
          },
        },
      }) as any;

    // The encoding points at the derived column (`${field}_${aggregate}`; count
    // uses `_count`) and the type is quantitative.
    expect(makeBar('sum').encoding.y.field).toBe('time_sum');
    expect(makeBar('average').encoding.y.field).toBe('time_average');
    expect(makeBar('mean').encoding.y.field).toBe('time_mean');
    expect(makeBar('count').encoding.y.field).toBe('_count');
    for (const agg of ['sum', 'average', 'mean', 'count'] as const) {
      expect(makeBar(agg).encoding.y.type).toBe('quantitative');
    }

    // Flint actually computes the aggregation: rows collapse to one per group
    // (method A, method B) with the correct derived values.
    const rowsFor = (agg: 'count' | 'sum' | 'average' | 'mean', col: string) =>
      (makeBar(agg).data.values as any[])
        .sort((a, b) => String(a.method).localeCompare(String(b.method)))
        .map(r => r[col]);

    expect(rowsFor('sum', 'time_sum')).toEqual([4, 6]);        // A: 1+3, B: 2+4
    expect(rowsFor('average', 'time_average')).toEqual([2, 3]); // A: mean(1,3), B: mean(2,4)
    expect(rowsFor('mean', 'time_mean')).toEqual([2, 3]);       // synonym of average
    expect(rowsFor('count', '_count')).toEqual([2, 2]);         // 2 rows per group
  });
});
