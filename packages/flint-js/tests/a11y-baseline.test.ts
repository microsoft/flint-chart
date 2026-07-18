// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite, assembleECharts, assembleChartjs } from '../src';
import { buildChartDescription } from '../src/core/a11y-description';

const DATA = [
  { region: 'East', revenue: 168 },
  { region: 'South', revenue: 167 },
  { region: 'North', revenue: 145 },
];

const BAR_INPUT = {
  data: { values: DATA },
  semantic_types: { region: 'Region', revenue: { semanticType: 'Price', unit: 'USD' } },
  chart_spec: {
    chartType: 'Bar Chart',
    encodings: { x: { field: 'region' }, y: { field: 'revenue' } },
    baseSize: { width: 400, height: 300 },
  },
};

const GROUPED_LINE_INPUT = {
  data: {
    values: [
      { month: '2025-01', team: 'A', score: 0.42 },
      { month: '2025-02', team: 'A', score: 0.51 },
      { month: '2025-01', team: 'B', score: 0.77 },
      { month: '2025-02', team: 'B', score: 0.69 },
    ],
  },
  semantic_types: {
    month: 'YearMonth',
    team: 'Name',
    score: { semanticType: 'Percentage', intrinsicDomain: [0, 1] as [number, number] },
  },
  chart_spec: {
    chartType: 'Line Chart',
    encodings: { x: { field: 'month' }, y: { field: 'score' }, color: { field: 'team' } },
    baseSize: { width: 400, height: 300 },
  },
};

describe('a11y baseline: generated descriptions', () => {
  it('describes structure and statistics, nothing interpretive', () => {
    const spec = assembleVegaLite(BAR_INPUT) as any;
    expect(spec.description).toBe(
      'Bar Chart of revenue (USD) by region. 3 categories. Range 145–168.',
    );
  });

  it('mentions the series field and count for grouped charts', () => {
    const spec = assembleVegaLite(GROUPED_LINE_INPUT) as any;
    expect(spec.description).toContain('grouped by team');
    expect(spec.description).toContain('2 series.');
  });

  it('respects field_display_names', () => {
    const spec = assembleVegaLite({
      ...BAR_INPUT,
      field_display_names: { revenue: 'Revenue', region: 'Sales Region' },
    }) as any;
    expect(spec.description).toContain('Revenue (USD) by Sales Region');
  });

  it('is deterministic', () => {
    const a = assembleVegaLite(BAR_INPUT) as any;
    const b = assembleVegaLite(BAR_INPUT) as any;
    expect(a.description).toBe(b.description);
  });
});

describe('a11y baseline: backend surfaces', () => {
  it('Vega-Lite gets a top-level description', () => {
    const spec = assembleVegaLite(BAR_INPUT) as any;
    expect(typeof spec.description).toBe('string');
    expect(spec.description.length).toBeGreaterThan(0);
  });

  it('ECharts enables aria with a label description by default, without decal', () => {
    const option = assembleECharts(BAR_INPUT) as any;
    expect(option.aria?.enabled).toBe(true);
    expect(typeof option.aria?.label?.description).toBe('string');
    expect(option.aria?.decal).toBeUndefined();
  });

  it('ECharts adds decal patterns only when a11yDecal is opted in', () => {
    const option = assembleECharts({ ...BAR_INPUT, options: { a11yDecal: true } }) as any;
    expect(option.aria?.decal?.show).toBe(true);
  });

  it('Chart.js carries the description as _a11y metadata', () => {
    const config = assembleChartjs(BAR_INPUT) as any;
    expect(typeof config._a11y?.description).toBe('string');
    expect(config._a11y.description).toContain('Bar Chart of revenue (USD)');
  });

  it('keeps compiled outputs JSON-pure', () => {
    const vl = assembleVegaLite(BAR_INPUT) as any;
    const ec = assembleECharts(BAR_INPUT) as any;
    expect(JSON.parse(JSON.stringify(vl.description))).toEqual(vl.description);
    expect(JSON.parse(JSON.stringify(ec.aria))).toEqual(ec.aria);
  });
});

describe('a11y baseline: generator unit behavior', () => {
  it('omits statistics it cannot compute', () => {
    const desc = buildChartDescription({
      chartType: 'Scatter Plot',
      channelSemantics: {},
      table: [],
    });
    expect(desc).toBe('Scatter Plot.');
  });

  it('formats large ranges compactly', () => {
    const desc = buildChartDescription({
      chartType: 'Bar Chart',
      channelSemantics: {
        x: { field: 'k', semanticAnnotation: { semanticType: 'Category' }, type: 'nominal' } as any,
        y: { field: 'v', semanticAnnotation: { semanticType: 'Amount' }, type: 'quantitative' } as any,
      },
      table: [
        { k: 'a', v: 1_200_000 },
        { k: 'b', v: 3_400_000 },
      ],
    });
    expect(desc).toContain('Range 1.2M–3.4M.');
  });
});
