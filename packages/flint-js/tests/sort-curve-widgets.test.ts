// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Regression: ECharts / Chart.js Sort encoding action (gallery Sort control).
 * Parity with packages/flint-js/tests/plotly-widgets.test.ts.
 */

import { describe, it, expect } from 'vitest';
import { assembleECharts, assembleChartjs, assemblePlotly, assembleVegaLite } from '../src';
import { validateChart, validateChartInput } from '../src/validate';
import { compile } from 'vega-lite';
import { parse, View } from 'vega';

const CATS = [{ Cat: 'A', Val: 30 }, { Cat: 'B', Val: 90 }, { Cat: 'C', Val: 50 }];
const CAT_TYPES = { Cat: 'Category', Val: 'Quantity' } as const;

describe('Vega-Lite explicit category sorting', () => {
  const input = (sort: Record<string, unknown>) => ({
    data: { values: [
      { month: 'Mar', month_number: 3, value: 102 },
      { month: 'Jan', month_number: 1, value: 100 },
      { month: 'Feb', month_number: 2, value: 101 },
    ] },
    semantic_types: { month: 'Month', value: 'Quantity' },
    chart_spec: {
      chartType: 'Line Chart',
      encodings: { x: { field: 'month', type: 'ordinal' as const, ...sort }, y: 'value' },
    },
  });

  it.each([
    { sort: { sortBy: 'month_number' }, expected: ['Jan', 'Feb', 'Mar'] },
    { sort: { sortBy: 'month_number', sortOrder: 'ascending' }, expected: ['Jan', 'Feb', 'Mar'] },
    { sort: { sortBy: 'month_number', sortOrder: 'descending' }, expected: ['Mar', 'Feb', 'Jan'] },
    { sort: { sortOrder: 'ascending' }, expected: ['Jan', 'Feb', 'Mar'] },
    { sort: { sortOrder: 'descending' }, expected: ['Mar', 'Feb', 'Jan'] },
    { sort: { sortBy: 'month', sortOrder: 'ascending' }, expected: ['Feb', 'Jan', 'Mar'] },
    { sort: { sortBy: 'x', sortOrder: 'ascending' }, expected: ['Feb', 'Jan', 'Mar'] },
    { sort: { sortBy: 'y' }, expected: ['Mar', 'Feb', 'Jan'] },
    { sort: { sortBy: '["Mar","Jan","Feb"]' }, expected: ['Mar', 'Jan', 'Feb'] },
    { sort: { sortBy: '["Mar","Jan","Feb"]', sortOrder: 'descending' }, expected: ['Feb', 'Jan', 'Mar'] },
  ])('renders the requested category order for $sort', async ({ sort, expected }) => {
    const chart = input(sort);
    expect(validateChart(chart, 'vegalite').valid).toBe(true);
    const view = new View(parse(compile(assembleVegaLite(chart)).spec), { renderer: 'none' });
    try {
      await view.runAsync();
      expect(view.scale('x').domain()).toEqual(expected);
    } finally {
      view.finalize();
    }
  });

  const renderedDomain = async (spec: any) => {
    const view = new View(parse(compile(spec).spec), { renderer: 'none' });
    try {
      await view.runAsync();
      return view.scale('x').domain();
    } finally {
      view.finalize();
    }
  };
  const sortWarnings = (spec: any) => (spec._warnings ?? []).filter((warning: any) => warning.code === 'invalid_sort');

  it.each(['missing_field', '{"field":"month_number"}', '[invalid', '[null]', '42', '', 'color', null, 42])('rejects invalid Month sorting: %s', async sortBy => {
    const chart = input({ sortBy, sortOrder: 'ascending' });
    const result = validateChart(chart, 'vegalite');
    expect(result.valid).toBe(false);
    expect(result.errors.some(error => /sortBy/.test(error.message) && /field|channel|array/.test(error.message))).toBe(true);
    expect(() => validateChartInput(chart, 'vegalite')).toThrow(/sortBy/);
    const spec = assembleVegaLite(chart);
    expect(await renderedDomain(spec)).toEqual(['Jan', 'Feb', 'Mar']);
    expect(sortWarnings(spec)).toEqual([expect.objectContaining({
      channel: 'x',
      message: expect.stringMatching(/^encodings\.x\.sortBy .+; using default order\.$/),
    })]);
  });

  it('reports a missing sort field by name', () => {
    const spec = assembleVegaLite(input({ sortBy: 'total_tokens' }));
    expect(sortWarnings(spec)[0].message).toBe('encodings.x.sortBy "total_tokens" is not a data field; using default order.');
  });

  it('keeps the valid values of a partially invalid category array', async () => {
    const chart = input({ sortBy: '["Mar",null,"Jan"]' });
    expect(validateChart(chart, 'vegalite').valid).toBe(false);
    expect(() => validateChartInput(chart, 'vegalite')).toThrow(/sortBy/);
    const spec = assembleVegaLite(chart);
    expect(await renderedDomain(spec)).toEqual(['Mar', 'Jan', 'Feb']);
    expect(sortWarnings(spec)[0].message).toMatch(/contains 1 invalid category value/);
  });

  it('treats an unsupported sort direction as unset during assembly', async () => {
    const chart = input({ sortOrder: 'sideways' });
    expect(() => validateChartInput(chart, 'vegalite')).toThrow(/sortOrder.*ascending.*descending/);
    const spec = assembleVegaLite(chart);
    expect(await renderedDomain(spec)).toEqual(['Jan', 'Feb', 'Mar']);
    expect(sortWarnings(spec)[0].message).toBe('encodings.x.sortOrder "sideways" must be "ascending" or "descending"; ignoring it.');
  });

  it.each(['echarts', 'chartjs', 'plotly'] as const)('reports unsupported field sorting for %s', backend => {
    expect(() => validateChartInput(input({ sortBy: 'month_number' }), backend)).toThrow(/sortBy.*raw field-name sorting.*not supported.*channel/);
  });

  it.each([
    ['echarts', assembleECharts],
    ['chartjs', assembleChartjs],
    ['plotly', assemblePlotly],
  ] as const)('falls back to the default order for unsupported sorts on %s', (backend, assemble) => {
    for (const sortBy of ['month_number', 'missing_field']) {
      const spec = assemble(input({ sortBy, sortOrder: 'descending' }) as any) as any;
      expect(sortWarnings(spec)).toHaveLength(1);
      expect(sortWarnings(spec)[0].message).toMatch(sortBy === 'month_number' ? /raw data field/ : /not a data field/);
      if (backend !== 'plotly') {
        expect(backend === 'echarts' ? ecBandOrder(spec) : cjsBandOrder(spec)).toEqual(['Jan', 'Feb', 'Mar']);
      }
    }
  });
});

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
