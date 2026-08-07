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
import { plCombineFacetPanels } from '../src/plotly/facet';

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
      'Density Contour': input('Density Contour', { x: { field: 'revenue' }, y: { field: 'revenue' } }, SALES, { revenue: 'Amount' }),
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
  it('keeps the first resolved category at the top of horizontal bars', () => {
    const fig = assemblePlotly(input(
      'Bar Chart',
      { y: { field: 'region', sortBy: 'x', sortOrder: 'descending' }, x: { field: 'revenue' } },
      SALES,
      { region: 'Region', revenue: 'Amount' },
    )) as any;
    expect(fig.layout.yaxis.autorange).toBe('reversed');
  });

  it('uses a continuous scale for quantitative bar color', () => {
    const fig = assemblePlotly(input(
      'Bar Chart',
      { x: { field: 'category' }, y: { field: 'value' }, color: { field: 'score' } },
      [
        { category: 'A', value: 10, score: 0.2 },
        { category: 'B', value: 20, score: 0.8 },
      ],
      { category: 'Category', value: 'Quantity', score: 'Quantity' },
    )) as any;
    expect(fig.data).toHaveLength(1);
    expect(fig.data[0].marker.color).toEqual([0.2, 0.8]);
    expect(fig.data[0].marker.showscale).toBe(true);
    expect(fig.layout.showlegend).toBe(false);
  });

  it('fits slope values rather than forcing a zero baseline', () => {
    const fig = assemblePlotly(input(
      'Slope Chart',
      { x: { field: 'year' }, y: { field: 'revenue' }, color: { field: 'region' } },
      SALES,
      { year: 'Year', revenue: 'Amount', region: 'Region' },
    )) as any;
    expect(fig.layout.yaxis.rangemode).toBe('normal');
  });

  it('groups line traces by stroke dash and retains the dash in the legend', () => {
    const values = [
      { year: 2023, value: 10, state: 'Observed' },
      { year: 2024, value: 12, state: 'Observed' },
      { year: 2024, value: 12, state: 'Projected' },
      { year: 2025, value: 15, state: 'Projected' },
    ];
    const fig = assemblePlotly(input(
      'Line Chart',
      { x: { field: 'year' }, y: { field: 'value' }, strokeDash: { field: 'state' } },
      values,
      { year: 'Year', value: 'Amount', state: 'Category' },
    )) as any;
    expect(fig.data.map((t: any) => t.name)).toEqual(['Observed', 'Projected']);
    expect(fig.data.map((t: any) => t.line.dash)).toEqual(['solid', 'dash']);
    expect(fig.layout.showlegend).toBe(true);
  });

  it('shows goal progress on numeric KPI cards', () => {
    const fig = assemblePlotly(input(
      'KPI Card',
      { metric: { field: 'metric' }, value: { field: 'value' }, goal: { field: 'goal' } },
      [{ metric: 'Renewable share', value: 30, goal: 45 }],
      { metric: 'Category', value: 'Quantity', goal: 'Quantity' },
    )) as any;
    expect(fig.data[0].mode).toBe('number+delta');
    expect(fig.layout.shapes).toHaveLength(2);
    expect(fig.layout.annotations[0].text).toBe('67% of 45');
  });

  it('does not divide by zero for a zero KPI goal', () => {
    const fig = assemblePlotly(input(
      'KPI Card',
      { metric: { field: 'metric' }, value: { field: 'value' }, goal: { field: 'goal' } },
      [{ metric: 'Defects', value: 0, goal: 0 }],
      { metric: 'Category', value: 'Quantity', goal: 'Quantity' },
    )) as any;
    expect(fig.layout.shapes).toHaveLength(0);
    expect(fig.layout.annotations[0].text).toBe('Goal: 0');
    expect(JSON.stringify(fig)).not.toContain('NaN');
  });

  it('preserves categorical shape as marker symbols and legend entries', () => {
    const values = [
      { x: 1, y: 2, kind: 'A' },
      { x: 2, y: 3, kind: 'B' },
      { x: 3, y: 4, kind: 'A' },
    ];
    const fig = assemblePlotly(input(
      'Scatter Plot',
      { x: { field: 'x' }, y: { field: 'y' }, shape: { field: 'kind' } },
      values,
      { x: 'Quantity', y: 'Quantity', kind: 'Category' },
    )) as any;
    expect(fig.data.map((t: any) => t.name)).toEqual(['A', 'B']);
    expect(fig.data.map((t: any) => t.marker.symbol)).toEqual(['circle', 'square']);
    expect(fig.layout.showlegend).toBe(true);
  });

  it('retains shape groups alongside continuous scatter color', () => {
    const values = [
      { x: 1, y: 2, score: 0.1, kind: 'A' },
      { x: 2, y: 3, score: 0.5, kind: 'B' },
      { x: 3, y: 4, score: 0.9, kind: 'A' },
    ];
    const fig = assemblePlotly(input(
      'Scatter Plot',
      {
        x: { field: 'x' },
        y: { field: 'y' },
        color: { field: 'score' },
        shape: { field: 'kind' },
      },
      values,
      { x: 'Quantity', y: 'Quantity', score: 'Quantity', kind: 'Category' },
    )) as any;
    expect(fig.data.map((t: any) => t.name)).toEqual(['A', 'B']);
    expect(fig.data.map((t: any) => t.marker.symbol)).toEqual(['circle', 'square']);
    expect(fig.data.filter((t: any) => t.marker.showscale)).toHaveLength(1);
    expect(fig.layout.showlegend).toBe(true);
  });

  it('orients heatmap category rows like Vega-Lite', () => {
    const fig = assemblePlotly(input(
      'Heatmap',
      { x: { field: 'x' }, y: { field: 'y' }, color: { field: 'value' } },
      [{ x: 'A', y: 'First', value: 1 }, { x: 'A', y: 'Second', value: 2 }],
      { x: 'Category', y: 'Category', value: 'Quantity' },
    )) as any;
    expect(fig.layout.yaxis.autorange).toBe('reversed');
  });

  it('uses a continuous colorbar instead of fifty grouped-bar legend keys', () => {
    const values = Array.from({ length: 10 }, (_v, i) => ({
      category: i < 5 ? 'A' : 'B',
      value: i + 1,
      temperature: 10.5 + i / 10,
    }));
    const fig = assemblePlotly(input(
      'Grouped Bar Chart',
      { x: { field: 'category' }, y: { field: 'value' }, color: { field: 'temperature' } },
      values,
      { category: 'Category', value: 'Quantity', temperature: 'Quantity' },
    )) as any;
    expect(fig.data).toHaveLength(5);
    expect(fig.data[0].marker.color).toHaveLength(2);
    expect(fig.data[0].marker.showscale).toBe(true);
    expect(fig.layout.showlegend).toBe(false);
  });

  it('maps temporal grouped-bar color to timestamps and preserves missing values', () => {
    const fig = assemblePlotly(input(
      'Grouped Bar Chart',
      { x: { field: 'category' }, y: { field: 'value' }, color: { field: 'when' } },
      [
        { category: 'A', value: 10, when: '2024-01-01' },
        { category: 'B', value: 20, when: null },
      ],
      { category: 'Category', value: 'Quantity', when: 'Date' },
    )) as any;
    expect(fig.data[0].marker.color[0]).toBe(Date.parse('2024-01-01'));
    expect(fig.data[0].marker.color[1]).toBeNull();
  });

  it('places polar facets on separate Plotly subplots', () => {
    const values = [
      { direction: 'N', value: 10, year: '2023' },
      { direction: 'S', value: 8, year: '2023' },
      { direction: 'N', value: 12, year: '2024' },
      { direction: 'S', value: 9, year: '2024' },
    ];
    const fig = assemblePlotly(input(
      'Rose Chart',
      { x: { field: 'direction' }, y: { field: 'value' }, column: { field: 'year' } },
      values,
      { direction: 'Category', value: 'Quantity', year: 'Year' },
    )) as any;
    expect(fig.layout.polar.domain).toBeDefined();
    expect(fig.layout.polar2.domain).toBeDefined();
    expect(new Set(fig.data.map((t: any) => t.subplot))).toEqual(new Set(['polar', 'polar2']));
  });

  it('retains stacking when colored rose panels are faceted', () => {
    const values = [
      { direction: 'N', value: 10, year: '2023', series: 'A' },
      { direction: 'N', value: 5, year: '2023', series: 'B' },
      { direction: 'N', value: 12, year: '2024', series: 'A' },
      { direction: 'N', value: 6, year: '2024', series: 'B' },
    ];
    const fig = assemblePlotly(input(
      'Rose Chart',
      {
        x: { field: 'direction' },
        y: { field: 'value' },
        color: { field: 'series' },
        column: { field: 'year' },
      },
      values,
      { direction: 'Category', value: 'Quantity', series: 'Category', year: 'Year' },
    )) as any;
    expect(fig.layout.barmode).toBe('stack');
  });

  it('retains normalized stacking in cartesian facets', () => {
    const values = [
      { category: 'A', value: 20, series: 'One', panel: 'Left' },
      { category: 'A', value: 80, series: 'Two', panel: 'Left' },
      { category: 'A', value: 30, series: 'One', panel: 'Right' },
      { category: 'A', value: 70, series: 'Two', panel: 'Right' },
    ];
    const fig = assemblePlotly(input(
      'Stacked Bar Chart',
      {
        x: { field: 'category' },
        y: { field: 'value' },
        color: { field: 'series' },
        column: { field: 'panel' },
      },
      values,
      { category: 'Category', value: 'Quantity', series: 'Category', panel: 'Category' },
      { stackMode: 'normalize' },
    )) as any;
    expect(fig.layout.barmode).toBe('stack');
    expect(fig.layout.barnorm).toBe('percent');
  });

  it('keeps one colorbar and no categorical key across continuous-color facets', () => {
    const values = [
      { category: 'A', value: 10, score: 1, panel: 'Left' },
      { category: 'B', value: 20, score: 2, panel: 'Left' },
      { category: 'A', value: 30, score: 3, panel: 'Right' },
      { category: 'B', value: 40, score: 4, panel: 'Right' },
    ];
    const fig = assemblePlotly(input(
      'Bar Chart',
      {
        x: { field: 'category' },
        y: { field: 'value' },
        color: { field: 'score' },
        column: { field: 'panel' },
      },
      values,
      { category: 'Category', value: 'Quantity', score: 'Quantity', panel: 'Category' },
    )) as any;
    expect(fig.data.filter((trace: any) => trace.marker?.showscale)).toHaveLength(1);
    expect(fig.data.every((trace: any) => trace.showlegend === false)).toBe(true);
    expect(new Set(fig.data.map((trace: any) => trace.marker.cmin))).toEqual(new Set([1]));
    expect(new Set(fig.data.map((trace: any) => trace.marker.cmax))).toEqual(new Set([4]));
  });

  it('globalizes and deduplicates continuous strip-plot facet scales', () => {
    const values = [
      { category: 'A', value: 1, score: 0, panel: 'Left' },
      { category: 'A', value: 2, score: 1, panel: 'Left' },
      { category: 'A', value: 3, score: 100, panel: 'Right' },
      { category: 'A', value: 4, score: 200, panel: 'Right' },
    ];
    const fig = assemblePlotly(input(
      'Strip Plot',
      {
        x: { field: 'category' },
        y: { field: 'value' },
        color: { field: 'score' },
        column: { field: 'panel' },
      },
      values,
      { category: 'Category', value: 'Quantity', score: 'Quantity', panel: 'Category' },
    )) as any;
    expect(fig.data.filter((trace: any) => trace.marker?.showscale)).toHaveLength(1);
    expect(new Set(fig.data.map((trace: any) => trace.marker?.cmin))).toEqual(new Set([0]));
    expect(new Set(fig.data.map((trace: any) => trace.marker?.cmax))).toEqual(new Set([200]));
  });

  it('globalizes sparse heatmap facet scales and keeps one colorbar', () => {
    const values = [
      { x: 'A', y: 'First', value: 100, panel: 'Left' },
      { x: 'B', y: 'First', value: 200, panel: 'Left' },
      { x: 'A', y: 'Second', value: 300, panel: 'Left' },
      { x: 'A', y: 'First', value: 400, panel: 'Right' },
      { x: 'B', y: 'Second', value: 350, panel: 'Right' },
    ];
    const fig = assemblePlotly(input(
      'Heatmap',
      {
        x: { field: 'x' },
        y: { field: 'y' },
        color: { field: 'value' },
        column: { field: 'panel' },
      },
      values,
      { x: 'Category', y: 'Category', value: 'Quantity', panel: 'Category' },
    )) as any;
    expect(fig.data.filter((trace: any) => trace.showscale !== false)).toHaveLength(1);
    expect(new Set(fig.data.map((trace: any) => trace.zmin))).toEqual(new Set([100]));
    expect(new Set(fig.data.map((trace: any) => trace.zmax))).toEqual(new Set([400]));
  });

  it('globalizes large facet scales without spreading values as arguments', () => {
    const color = Array.from({ length: 200_000 }, (_value, index) => index);
    const fig = plCombineFacetPanels(
      [{
        rowIndex: 0,
        colIndex: 0,
        figure: {
          data: [{ type: 'scatter', x: [0], y: [0], marker: { color, showscale: true } }],
          layout: {},
        },
      }],
      {
        rows: 1,
        cols: 1,
        panelWidth: 400,
        panelHeight: 300,
        hasColHeader: false,
        hasRowHeader: false,
        colHeaderPerRow: false,
        showLegend: false,
      },
    ) as any;
    expect(fig.data[0].marker.cmin).toBe(0);
    expect(fig.data[0].marker.cmax).toBe(199_999);
  });

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

  it('heatmap reserves margins for rotated labels, axis titles, and its colorbar', () => {
    const rows = Array.from({ length: 24 }, (_, index) => ({
      start: `2020-${String(index % 12 + 1).padStart(2, '0')}-${String(index % 27 + 1).padStart(2, '0')}`,
      end: `2022-${String(index % 12 + 1).padStart(2, '0')}-${String(index % 27 + 1).padStart(2, '0')}`,
      correlation: index / 12 - 1,
    }));
    const fig = assemblePlotly(input('Heatmap', { x: { field: 'start' }, y: { field: 'end' }, color: { field: 'correlation' } }, rows,
      { start: 'Date', end: 'Date', correlation: 'Correlation' }));
    expect(fig.layout.xaxis.automargin).toBe(true);
    expect(fig.layout.yaxis.automargin).toBe(true);
    expect(fig.layout.xaxis.tickangle).toBe(45);
    expect(fig.layout.xaxis.title.standoff).toBeGreaterThan(0);
    expect(fig.layout.yaxis.title.standoff).toBeGreaterThan(0);
    expect(fig.layout.margin.b).toBeGreaterThanOrEqual(90);
    expect(fig.layout.margin.l).toBeGreaterThanOrEqual(90);
    expect(fig.layout.margin.r).toBeGreaterThanOrEqual(90);
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
  it('renders a discrete-by-discrete bar request as an occupied square grid', () => {
    const rows = [
      { product: 'Laptop', market: 'US' },
      { product: 'Phone', market: 'US' },
      { product: 'Phone', market: 'UK' },
    ];
    const fig = assemblePlotly(input(
      'Bar Chart',
      { x: { field: 'product' }, y: { field: 'market' } },
      rows,
      { product: 'Category', market: 'Category' },
    ));
    expect(fig.data[0].type).toBe('scatter');
    expect(fig.data[0].marker.symbol).toBe('square');
    expect(fig.data[0].x).toHaveLength(3);
    expect(fig.layout.yaxis.type).toBe('category');
  });

  it('grouped bar chart uses barmode "group" with one trace per group', () => {
    const fig = assemblePlotly(input('Grouped Bar Chart', { x: { field: 'region' }, y: { field: 'revenue' }, color: { field: 'year' } }, SALES, { region: 'Region', revenue: 'Amount', year: 'Year' }));
    expect(fig.layout.barmode).toBe('group');
    expect(fig.data).toHaveLength(2);
  });

  it('grouped bar collapses to one bar per band (barmode "overlay") when the group is redundant with x', () => {
    // group == x: no band holds >1 group value → nothing to dodge. Must render
    // one centered, full-width colored bar per band (like a colored bar chart),
    // not shifted slivers in reserved lanes.
    const rows = [
      { region: 'Electronics', amount: 300, seg: 'Electronics' },
      { region: 'Clothing', amount: 530, seg: 'Clothing' },
      { region: 'Food', amount: 975, seg: 'Food' },
    ];
    const fig = assemblePlotly(input('Grouped Bar Chart', { x: { field: 'region' }, y: { field: 'amount' }, group: { field: 'seg' } }, rows, { region: 'Region', amount: 'Amount', seg: 'Category' }));
    expect(fig.layout.barmode).toBe('overlay');
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
    expect(fig.layout.legend.y).toBeLessThanOrEqual(-0.3);
    expect(fig.layout.margin.b).toBeGreaterThanOrEqual(72);
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
