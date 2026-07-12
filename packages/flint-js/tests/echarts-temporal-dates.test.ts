// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleECharts } from '../src';

/**
 * Regression: ECharts uses a `time` axis for temporal fields, and its internal
 * time parser only accepts ISO-8601-like strings. Non-ISO date strings such as
 * `"Jan 1 2000"` (e.g. vega-datasets stocks.csv) failed to parse, so every point
 * was silently dropped and the chart rendered blank.
 *
 * The fix pre-converts temporal x-values to epoch milliseconds before handing
 * them to ECharts. These tests assert the series carries numeric timestamps for
 * human-readable date strings across the temporal-axis templates.
 */

const HUMAN_DATES = [
  { date: 'Jan 1 2000', price: 10 },
  { date: 'Feb 1 2000', price: 20 },
  { date: 'Mar 1 2000', price: 15 },
];

function assembleTemporal(chartType: string, extra: Record<string, string> = {}) {
  return assembleECharts({
    data: { values: HUMAN_DATES },
    semantic_types: { date: 'temporal', price: 'quantitative' },
    chart_spec: {
      chartType,
      encodings: { x: 'date', y: 'price', ...extra },
    },
  }) as any;
}

function firstSeriesData(ec: any): any[] {
  const s = (ec.series || []).find((ser: any) => Array.isArray(ser.data) && ser.data.length);
  return s?.data ?? [];
}

describe('ECharts temporal x-axis accepts non-ISO date strings', () => {
  for (const chartType of ['Line Chart', 'Area Chart']) {
    it(`${chartType}: converts "Jan 1 2000" style strings to epoch-ms`, () => {
      const ec = assembleTemporal(chartType);
      expect(ec.xAxis.type).toBe('time');

      const data = firstSeriesData(ec);
      expect(data.length).toBe(HUMAN_DATES.length);

      // Every x-coordinate must be a finite number (epoch ms), never a raw string.
      const expected = HUMAN_DATES.map((d) => new Date(d.date).getTime());
      const xs = data.map((pt: any) => (Array.isArray(pt) ? pt[0] : pt.value?.[0]));
      for (const x of xs) {
        expect(typeof x).toBe('number');
        expect(Number.isFinite(x)).toBe(true);
      }
      expect(xs).toEqual(expected);
    });
  }

  it('produces the same timestamps for ISO and human-readable inputs', () => {
    const human = firstSeriesData(assembleTemporal('Line Chart')).map((p: any) => p[0]);
    const iso = firstSeriesData(
      assembleECharts({
        data: {
          values: [
            { date: '2000-01-01', price: 10 },
            { date: '2000-02-01', price: 20 },
            { date: '2000-03-01', price: 15 },
          ],
        },
        semantic_types: { date: 'temporal', price: 'quantitative' },
        chart_spec: { chartType: 'Line Chart', encodings: { x: 'date', y: 'price' } },
      }) as any,
    ).map((p: any) => p[0]);
    expect(human).toEqual(iso);
  });
});
