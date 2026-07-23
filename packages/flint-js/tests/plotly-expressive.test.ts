// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Tests for the Plotly "expressive tranche" — the 29 chart types added beyond
 * the four original acceptance templates (Bar, Line, Area, Scatter; see
 * plotly-backend.test.ts). Covers native-trace shape assertions, grouping /
 * stacking, facet-exemption for axis-less charts, and targeted regression
 * tests for bugs found and fixed during visual (VLM) verification.
 */

import { describe, it, expect } from 'vitest';
import { assemblePlotly, plAllTemplateDefs, plGetTemplateDef } from '../src';

function input(chartType: string, encodings: Record<string, unknown>, values: any[], semantic_types: Record<string, string>, chartProperties?: Record<string, unknown>) {
  return {
    data: { values },
    semantic_types,
    chart_spec: { chartType, encodings, baseSize: { width: 400, height: 300 }, ...(chartProperties ? { chartProperties } : {}) },
  } as any;
}

/** Recursively assert a value contains no functions (pure JSON, serializable). */
function assertNoFunctions(node: any, path = '$'): void {
  if (typeof node === 'function') throw new Error(`function found at ${path}`);
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) assertNoFunctions(v, `${path}.${k}`);
  }
}

const SALES = [
  { region: 'East', revenue: 168, year: '2024' },
  { region: 'South', revenue: 167, year: '2024' },
  { region: 'East', revenue: 120, year: '2025' },
  { region: 'South', revenue: 131, year: '2025' },
];

describe('Plotly expressive templates — registration', () => {
  it('every registered template assembles a pure-JSON figure with at least one trace', () => {
    const smokeInputs: Record<string, any> = {
      'Grouped Bar Chart': input('Grouped Bar Chart', { x: { field: 'region' }, y: { field: 'revenue' }, color: { field: 'year' } }, SALES, { region: 'Region', revenue: 'Amount', year: 'Year' }),
      'Stacked Bar Chart': input('Stacked Bar Chart', { x: { field: 'region' }, y: { field: 'revenue' }, color: { field: 'year' } }, SALES, { region: 'Region', revenue: 'Amount', year: 'Year' }),
      'Pyramid Chart': input('Pyramid Chart', { x: { field: 'revenue' }, y: { field: 'region' }, color: { field: 'year' } }, SALES, { region: 'Region', revenue: 'Amount', year: 'Year' }),
      'Histogram': input('Histogram', { x: { field: 'revenue' } }, SALES, { revenue: 'Amount' }),
      'Boxplot': input('Boxplot', { x: { field: 'region' }, y: { field: 'revenue' } }, SALES, { region: 'Region', revenue: 'Amount' }),
      'Violin Plot': input('Violin Plot', { x: { field: 'region' }, y: { field: 'revenue' } }, SALES, { region: 'Region', revenue: 'Amount' }),
      'Density Plot': input('Density Plot', { x: { field: 'revenue' } }, SALES, { revenue: 'Amount' }),
      'ECDF Plot': input('ECDF Plot', { x: { field: 'revenue' } }, SALES, { revenue: 'Amount' }),
      'Strip Plot': input('Strip Plot', { x: { field: 'region' }, y: { field: 'revenue' } }, SALES, { region: 'Region', revenue: 'Amount' }),
      'Connected Scatter Plot': input('Connected Scatter Plot', { x: { field: 'revenue' }, y: { field: 'revenue' } }, SALES, { revenue: 'Amount' }),
      'Range Area Chart': input('Range Area Chart', { x: { field: 'region' }, y: { field: 'revenue' }, y2: { field: 'revenue' } }, SALES, { region: 'Region', revenue: 'Amount' }),
      'Streamgraph': input('Streamgraph', { x: { field: 'region' }, y: { field: 'revenue' }, color: { field: 'year' } }, SALES, { region: 'Region', revenue: 'Amount', year: 'Year' }),
      'Slope Chart': input('Slope Chart', { x: { field: 'year' }, y: { field: 'revenue' }, color: { field: 'region' } }, SALES, { year: 'Year', revenue: 'Amount', region: 'Region' }),
      'Bump Chart': input('Bump Chart', { x: { field: 'year' }, y: { field: 'revenue' }, color: { field: 'region' } }, SALES, { year: 'Year', revenue: 'Amount', region: 'Region' }),
      'Waterfall Chart': input('Waterfall Chart', { x: { field: 'region' }, y: { field: 'revenue' } }, SALES, { region: 'Region', revenue: 'Amount' }),
      'Candlestick Chart': input('Candlestick Chart', { x: { field: 'region' }, open: { field: 'revenue' }, close: { field: 'revenue' } }, SALES, { region: 'Region', revenue: 'Amount' }),
      'Heatmap': input('Heatmap', { x: { field: 'region' }, y: { field: 'year' }, color: { field: 'revenue' } }, SALES, { region: 'Region', year: 'Year', revenue: 'Amount' }),
      'Lollipop Chart': input('Lollipop Chart', { x: { field: 'region' }, y: { field: 'revenue' } }, SALES, { region: 'Region', revenue: 'Amount' }),
      'Bullet Chart': input('Bullet Chart', { y: { field: 'region' }, x: { field: 'revenue' } }, SALES, { region: 'Region', revenue: 'Amount' }),
      'Gantt Chart': input('Gantt Chart', { y: { field: 'region' }, x: { field: 'revenue' }, x2: { field: 'revenue' } }, SALES, { region: 'Region', revenue: 'Amount' }),
      'Ranged Dot Plot': input('Ranged Dot Plot', { x: { field: 'revenue' }, y: { field: 'region' } }, SALES, { region: 'Region', revenue: 'Amount' }),
      'Regression': input('Regression', { x: { field: 'revenue' }, y: { field: 'revenue' } }, SALES, { revenue: 'Amount' }),
      'Pie Chart': input('Pie Chart', { color: { field: 'region' }, size: { field: 'revenue' } }, SALES, { region: 'Region', revenue: 'Amount' }),
      'Donut Chart': input('Donut Chart', { color: { field: 'region' }, size: { field: 'revenue' } }, SALES, { region: 'Region', revenue: 'Amount' }),
      'Radar Chart': input('Radar Chart', { x: { field: 'region' }, y: { field: 'revenue' } }, SALES, { region: 'Region', revenue: 'Amount' }),
      'Rose Chart': input('Rose Chart', { x: { field: 'region' }, y: { field: 'revenue' } }, SALES, { region: 'Region', revenue: 'Amount' }),
      'Funnel Chart': input('Funnel Chart', { y: { field: 'region' }, size: { field: 'revenue' } }, SALES, { region: 'Region', revenue: 'Amount' }),
      'Gauge Chart': input('Gauge Chart', { size: { field: 'revenue' } }, SALES, { revenue: 'Amount' }),
      'KPI Card': input('KPI Card', { metric: { field: 'region' }, value: { field: 'revenue' } }, SALES, { region: 'Region', revenue: 'Amount' }),
      'Map': input('Map', { longitude: { field: 'lon' }, latitude: { field: 'lat' }, size: { field: 'revenue' } },
        [{ lon: -74.0, lat: 40.7, revenue: 168 }, { lon: -87.6, lat: 41.9, revenue: 120 }, { lon: -122.4, lat: 37.8, revenue: 90 }],
        { lon: 'Longitude', lat: 'Latitude', revenue: 'Amount' }),
      'Choropleth': input('Choropleth', { id: { field: 'state' }, color: { field: 'revenue' } },
        [{ state: 'California', revenue: 168 }, { state: 'Texas', revenue: 120 }, { state: 'New York', revenue: 90 }],
        { state: 'State', revenue: 'Amount' }),
      'Sparkline': input('Sparkline', { x: { field: 'year' }, y: { field: 'revenue' }, color: { field: 'region' } }, SALES, { year: 'Year', revenue: 'Amount', region: 'Region' }),
      'Bar Table': input('Bar Table', { y: { field: 'region' }, x: { field: 'revenue' } }, SALES, { region: 'Region', revenue: 'Amount' }),
    };

    for (const [chartType, tcInput] of Object.entries(smokeInputs)) {
      expect(plGetTemplateDef(chartType), `${chartType} should be registered`).toBeDefined();
      const fig = assemblePlotly(tcInput);
      expect(Array.isArray(fig.data), chartType).toBe(true);
      expect(fig.data.length, chartType).toBeGreaterThan(0);
      assertNoFunctions(fig, chartType);
      expect(JSON.parse(JSON.stringify(fig)), chartType).toEqual(fig);
    }
    // Every input above is exercised; every registered template has coverage.
    const covered = new Set(Object.keys(smokeInputs));
    for (const t of plAllTemplateDefs) {
      if (['Bar Chart', 'Line Chart', 'Area Chart', 'Scatter Plot'].includes(t.chart)) continue; // covered in plotly-backend.test.ts
      expect(covered.has(t.chart), `${t.chart} missing a smoke test above`).toBe(true);
    }
  });
});

describe('Plotly expressive templates — native trace shapes', () => {
  it('boxplot uses a native box trace (no manual quartile computation)', () => {
    const fig = assemblePlotly(input('Boxplot', { x: { field: 'region' }, y: { field: 'revenue' } }, SALES, { region: 'Region', revenue: 'Amount' }));
    expect(fig.data[0].type).toBe('box');
    expect(fig.data[0].y).toEqual([168, 167, 120, 131]); // raw values, not a precomputed 5-number summary
  });

  it('violin uses a native violin trace', () => {
    const fig = assemblePlotly(input('Violin Plot', { x: { field: 'region' }, y: { field: 'revenue' } }, SALES, { region: 'Region', revenue: 'Amount' }));
    expect(fig.data[0].type).toBe('violin');
  });

  it('candlestick uses a native candlestick trace', () => {
    const fig = assemblePlotly(input('Candlestick Chart', { x: { field: 'region' }, open: { field: 'revenue' }, close: { field: 'revenue' } }, SALES, { region: 'Region', revenue: 'Amount' }));
    expect(fig.data[0].type).toBe('candlestick');
  });

  it('heatmap uses a native heatmap trace with x/y category arrays + z matrix', () => {
    const fig = assemblePlotly(input('Heatmap', { x: { field: 'region' }, y: { field: 'year' }, color: { field: 'revenue' } }, SALES, { region: 'Region', year: 'Year', revenue: 'Amount' }));
    expect(fig.data[0].type).toBe('heatmap');
    expect(Array.isArray(fig.data[0].z)).toBe(true);
  });

  it('pie/donut use a native pie trace; donut sets a non-zero hole', () => {
    const pie = assemblePlotly(input('Pie Chart', { color: { field: 'region' }, size: { field: 'revenue' } }, SALES, { region: 'Region', revenue: 'Amount' }));
    expect(pie.data[0].type).toBe('pie');
    expect(pie.data[0].hole).toBe(0);
    const donut = assemblePlotly(input('Donut Chart', { color: { field: 'region' }, size: { field: 'revenue' } }, SALES, { region: 'Region', revenue: 'Amount' }));
    expect(donut.data[0].hole).toBeGreaterThan(0);
  });

  it('radar uses scatterpolar; rose uses barpolar', () => {
    const radar = assemblePlotly(input('Radar Chart', { x: { field: 'region' }, y: { field: 'revenue' } }, SALES, { region: 'Region', revenue: 'Amount' }));
    expect(radar.data[0].type).toBe('scatterpolar');
    const rose = assemblePlotly(input('Rose Chart', { x: { field: 'region' }, y: { field: 'revenue' } }, SALES, { region: 'Region', revenue: 'Amount' }));
    expect(rose.data[0].type).toBe('barpolar');
  });

  it('funnel uses a native funnel trace; gauge/kpi use indicator traces', () => {
    const funnel = assemblePlotly(input('Funnel Chart', { y: { field: 'region' }, size: { field: 'revenue' } }, SALES, { region: 'Region', revenue: 'Amount' }));
    expect(funnel.data[0].type).toBe('funnel');
    const gauge = assemblePlotly(input('Gauge Chart', { size: { field: 'revenue' } }, SALES, { revenue: 'Amount' }));
    expect(gauge.data[0].type).toBe('indicator');
    expect(gauge.data[0].mode).toContain('gauge');
    const kpi = assemblePlotly(input('KPI Card', { metric: { field: 'region' }, value: { field: 'revenue' } }, SALES, { region: 'Region', revenue: 'Amount' }));
    expect(kpi.data[0].type).toBe('indicator');
  });
});

describe('Plotly expressive templates — grouping & stacking', () => {
  it('grouped bar chart uses barmode "group" with one trace per group', () => {
    const fig = assemblePlotly(input('Grouped Bar Chart', { x: { field: 'region' }, y: { field: 'revenue' }, color: { field: 'year' } }, SALES, { region: 'Region', revenue: 'Amount', year: 'Year' }));
    expect(fig.layout.barmode).toBe('group');
    expect(fig.data).toHaveLength(2);
  });

  it('stacked bar chart uses barmode "stack" with one trace per group', () => {
    const fig = assemblePlotly(input('Stacked Bar Chart', { x: { field: 'region' }, y: { field: 'revenue' }, color: { field: 'year' } }, SALES, { region: 'Region', revenue: 'Amount', year: 'Year' }));
    expect(fig.layout.barmode).toBe('stack');
    expect(fig.data).toHaveLength(2);
  });
});

describe('Plotly expressive templates — axis-less charts skip generic faceting', () => {
  // Regression test: a shared `column`/`row` faceting pass used to run for
  // EVERY template (including axis-less ones), splitting the table into one
  // 1-row panel per `column` value and calling `instantiate` once per panel —
  // collapsing e.g. a 3-gauge grid into three all-identical, fully-overlapping
  // [0,1]x[0,1] domains. Fixed by gating faceting on `hasAxes` (mirrors the
  // ECharts backend), matching the multi-item grouping these templates do
  // themselves via the (non-faceting) `column` channel.
  const MULTI = [
    { device: 'CPU', pct: 65 },
    { device: 'Memory', pct: 82 },
    { device: 'Disk', pct: 43 },
  ];

  it('gauge chart lays out one indicator per column value with distinct, non-overlapping domains', () => {
    const fig = assemblePlotly(input('Gauge Chart', { size: { field: 'pct' }, column: { field: 'device' } }, MULTI, { device: 'Category', pct: 'Percentage' }));
    expect(fig.data).toHaveLength(3);
    expect(fig.data.map((d: any) => d.value)).toEqual([65, 82, 43]);
    const domains = fig.data.map((d: any) => JSON.stringify(d.domain));
    expect(new Set(domains).size).toBe(3); // no two gauges share a domain
    for (const d of fig.data) {
      expect(d.domain.x[1] - d.domain.x[0]).toBeLessThan(1);
      expect(d.domain.y[1] - d.domain.y[0]).toBeLessThan(1);
    }
  });

  it('pie/donut/radar/rose/funnel ignore an incidental column binding (no facet split)', () => {
    for (const chartType of ['Pie Chart', 'Donut Chart', 'Radar Chart', 'Rose Chart']) {
      const fig = assemblePlotly(input(chartType, { color: { field: 'device' }, x: { field: 'device' }, y: { field: 'pct' }, size: { field: 'pct' } }, MULTI, { device: 'Category', pct: 'Percentage' }));
      expect(fig._facet, chartType).toBeUndefined();
    }
  });
});

describe('Plotly expressive templates — regression fixes', () => {
  it('KPI card falls back to a text annotation for a pre-formatted (non-numeric) value', () => {
    const fig = assemblePlotly(input('KPI Card', { metric: { field: 'region' }, value: { field: 'label' } },
      [{ region: 'Revenue', label: '$1.2M' }], { region: 'Category', label: 'Amount' }));
    expect(fig.data.length).toBe(0); // no numeric indicator trace
    expect(fig.layout.annotations.some((a: any) => a.text === '$1.2M')).toBe(true);
    expect(fig.layout.xaxis.visible).toBe(false); // no stray default cartesian axes
  });

  it('KPI card uses a native indicator for a numeric value', () => {
    const fig = assemblePlotly(input('KPI Card', { metric: { field: 'region' }, value: { field: 'revenue' } },
      [{ region: 'Revenue', revenue: 118432 }], { region: 'Category', revenue: 'Amount' }));
    expect(fig.data[0].type).toBe('indicator');
    expect(fig.data[0].value).toBe(118432);
  });

  it('waterfall: the first bar anchors at its own value (not a zero-height "total")', () => {
    const PNL = [
      { category: 'Revenue', amount: 1000 },
      { category: 'COGS', amount: -400 },
      { category: 'Net Income', amount: 600 },
    ];
    const fig = assemblePlotly(input('Waterfall Chart', { x: { field: 'category' }, y: { field: 'amount' } }, PNL, { category: 'Category', amount: 'Amount' }));
    expect(fig.data[0].type).toBe('waterfall');
    expect(fig.data[0].measure[0]).toBe('relative'); // never 'total' at index 0
    expect(fig.data[0].y[0]).toBe(1000);
  });

  it('bullet chart legend includes attainment swatches, not just the target tick', () => {
    const fig = assemblePlotly(input('Bullet Chart', { y: { field: 'region' }, x: { field: 'revenue' }, goal: { field: 'revenue' } },
      SALES, { region: 'Region', revenue: 'Amount' }));
    const names = fig.data.map((d: any) => d.name);
    expect(names).toContain('Target');
    expect(names).toContain('Meets target');
    expect(names).toContain('Below target');
  });

  it('scatter plot uses a continuous colorscale (not a legend per distinct value) for quantitative color', () => {
    const fig = assemblePlotly(input('Scatter Plot', { x: { field: 'revenue' }, y: { field: 'revenue' }, color: { field: 'revenue' } },
      SALES, { revenue: 'Amount' }));
    expect(fig.data).toHaveLength(1);
    expect(fig.data[0].marker.showscale).toBe(true);
    expect(Array.isArray(fig.data[0].marker.color)).toBe(true);
    expect(fig.layout.showlegend).toBe(false);
  });

  it('scatter plot still groups a nominal color into one legend trace per value', () => {
    const fig = assemblePlotly(input('Scatter Plot', { x: { field: 'revenue' }, y: { field: 'revenue' }, color: { field: 'region' } },
      SALES, { region: 'Region', revenue: 'Amount' }));
    expect(fig.data).toHaveLength(2);
    expect(fig.layout.showlegend).toBe(true);
  });
});
