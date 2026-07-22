// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assemblePlotly, plGetTemplateDef, plAllTemplateDefs } from '../src';
import { genPlotlyCoreTests, genPlotlyFacetTests } from '../src/test-data';

const SALES = [
  { region: 'East', revenue: 168 },
  { region: 'South', revenue: 167 },
  { region: 'North', revenue: 145 },
];

const GROUPED = [
  { region: 'East', revenue: 168, year: '2024' },
  { region: 'South', revenue: 167, year: '2024' },
  { region: 'East', revenue: 120, year: '2025' },
  { region: 'South', revenue: 131, year: '2025' },
];

const CARS = [
  { weight: 1.6, mpg: 32, origin: 'JP' },
  { weight: 2.1, mpg: 27, origin: 'US' },
  { weight: 1.9, mpg: 29, origin: 'EU' },
];

const MONTHLY = [
  { month: '2025-01', value: 12 },
  { month: '2025-02', value: 18 },
  { month: '2025-03', value: 15 },
];

function input(chartType: string, encodings: Record<string, unknown>, values: any[], semantic_types: Record<string, string>, chartProperties?: Record<string, unknown>) {
  return {
    data: { values },
    semantic_types,
    chart_spec: { chartType, encodings, baseSize: { width: 400, height: 300 }, ...(chartProperties ? { chartProperties } : {}) },
  } as any;
}

/** Recursively assert a value contains no functions (pure JSON). */
function assertNoFunctions(node: any, path = '$'): void {
  if (typeof node === 'function') {
    throw new Error(`function found at ${path}`);
  }
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) {
      assertNoFunctions(v, `${path}.${k}`);
    }
  }
}

describe('Plotly backend', () => {
  it('registers exactly the four acceptance templates', () => {
    expect(plAllTemplateDefs.map(t => t.chart).sort()).toEqual(
      ['Area Chart', 'Bar Chart', 'Line Chart', 'Scatter Plot'],
    );
    expect(plGetTemplateDef('Bar Chart')).toBeDefined();
  });

  it('throws on an unregistered chart type', () => {
    expect(() =>
      assemblePlotly(input('Heatmap', { x: { field: 'region' }, y: { field: 'revenue' } }, SALES, { region: 'Region', revenue: 'Amount' })),
    ).toThrow(/Unknown Plotly chart type/);
  });

  it('bar: builds a bar trace with category order and zero baseline', () => {
    const fig = assemblePlotly(input('Bar Chart', { x: { field: 'region' }, y: { field: 'revenue' } }, SALES, { region: 'Region', revenue: 'Amount' }));
    expect(fig.data).toHaveLength(1);
    expect(fig.data[0].type).toBe('bar');
    expect(fig.data[0].x).toEqual(['East', 'South', 'North']);
    expect(fig.data[0].y).toEqual([168, 167, 145]);
    expect(fig.layout.xaxis.type).toBe('category');
    expect(fig.layout.yaxis.rangemode).toBe('tozero');
    expect(fig.layout.width).toBeGreaterThan(0);
    expect(fig.layout.height).toBeGreaterThan(0);
  });

  it('bar: transposes to horizontal when the category is on y', () => {
    const fig = assemblePlotly(input('Bar Chart', { x: { field: 'revenue' }, y: { field: 'region' } }, SALES, { region: 'Region', revenue: 'Amount' }));
    expect(fig.data[0].orientation).toBe('h');
    expect(fig.data[0].y).toEqual(['East', 'South', 'North']);
    expect(fig.layout.xaxis.rangemode).toBe('tozero');
  });

  it('line: one trace per color group with legend on', () => {
    const fig = assemblePlotly(input('Line Chart', { x: { field: 'region' }, y: { field: 'revenue' }, color: { field: 'year' } }, GROUPED, { region: 'Region', revenue: 'Amount', year: 'Year' }));
    expect(fig.data).toHaveLength(2);
    expect(fig.data.map((t: any) => t.name)).toEqual(['2024', '2025']);
    expect(fig.data[0].mode).toBe('lines');
    expect(fig.layout.showlegend).toBe(true);
  });

  it('line: temporal x uses a native date axis with ISO values', () => {
    const fig = assemblePlotly(input('Line Chart', { x: { field: 'month' }, y: { field: 'value' } }, MONTHLY, { month: 'YearMonth', value: 'Amount' }));
    expect(fig.layout.xaxis.type).toBe('date');
    expect(typeof fig.data[0].x[0]).toBe('string');
    expect(fig.data[0].x[0]).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('area: stacked color groups use stackgroup; single series fills to zero', () => {
    const grouped = assemblePlotly(input('Area Chart', { x: { field: 'region' }, y: { field: 'revenue' }, color: { field: 'year' } }, GROUPED, { region: 'Region', revenue: 'Amount', year: 'Year' }));
    expect(grouped.data.every((t: any) => t.stackgroup === 'one')).toBe(true);

    const single = assemblePlotly(input('Area Chart', { x: { field: 'region' }, y: { field: 'revenue' } }, SALES, { region: 'Region', revenue: 'Amount' }));
    expect(single.data[0].fill).toBe('tozeroy');
  });

  it('scatter: markers mode, per-group traces, no forced zero for open measures', () => {
    const fig = assemblePlotly(input('Scatter Plot', { x: { field: 'weight' }, y: { field: 'mpg' }, color: { field: 'origin' } }, CARS, { weight: 'Quantity', mpg: 'Quantity', origin: 'Country' }));
    expect(fig.data).toHaveLength(3);
    expect(fig.data[0].mode).toBe('markers');
    expect(fig.data[0].marker.size).toBeGreaterThan(0);
  });

  it('column facet: one axis pair per panel, shared nice y-range, headers', () => {
    const fig = assemblePlotly(input('Bar Chart', { x: { field: 'region' }, y: { field: 'revenue' }, column: { field: 'year' } }, GROUPED, { region: 'Region', revenue: 'Amount', year: 'Year' }));
    expect(fig._facet).toBe(true);
    expect(fig._facetCols).toBe(2);
    expect(fig.layout.xaxis2).toBeDefined();
    expect(fig.layout.yaxis2).toBeDefined();
    expect(fig.layout.yaxis.range).toEqual(fig.layout.yaxis2.range);
    expect(fig.layout.yaxis.range[0]).toBe(0); // Amount forces zero into the shared domain
    expect(fig.layout.yaxis2.showticklabels).toBe(false); // leftmost-only y labels
    const headerTexts = fig.layout.annotations.map((a: any) => a.text);
    expect(headerTexts).toContain('2024');
    expect(headerTexts).toContain('2025');
    expect(fig.data.every((t: any) => t.xaxis && t.yaxis)).toBe(true);
  });

  it('row facet: stacked panels with rotated row headers', () => {
    const fig = assemblePlotly(input('Line Chart', { x: { field: 'region' }, y: { field: 'revenue' }, row: { field: 'year' } }, GROUPED, { region: 'Region', revenue: 'Amount', year: 'Year' }));
    expect(fig._facet).toBe(true);
    expect(fig._facetRows).toBe(2);
    expect(fig._facetCols).toBe(1);
    const rowHeaders = fig.layout.annotations.filter((a: any) => a.textangle === 90);
    expect(rowHeaders.map((a: any) => a.text)).toEqual(['2024', '2025']);
    // x title only on the bottom row
    expect(fig.layout.xaxis.title).toBeUndefined();
    expect(fig.layout.xaxis2.title).toBeDefined();
  });

  it('column+row facet: full grid with one axis pair per cell', () => {
    const CELLS = [
      { v: 1, w: 10, a: 'A', b: 'X' }, { v: 2, w: 20, a: 'B', b: 'X' },
      { v: 3, w: 30, a: 'A', b: 'Y' }, { v: 4, w: 40, a: 'B', b: 'Y' },
    ];
    const fig = assemblePlotly(input('Scatter Plot', { x: { field: 'v' }, y: { field: 'w' }, column: { field: 'a' }, row: { field: 'b' } }, CELLS, { v: 'Quantity', w: 'Quantity', a: 'Category', b: 'Category' }));
    expect(fig._facetRows).toBe(2);
    expect(fig._facetCols).toBe(2);
    expect(fig.layout.xaxis4).toBeDefined();
    expect(fig.layout.yaxis4).toBeDefined();
  });

  it('facet legend is deduped across panels via legendgroup', () => {
    const fig = assemblePlotly(input('Line Chart', { x: { field: 'region' }, y: { field: 'revenue' }, color: { field: 'year' }, column: { field: 'year' } }, GROUPED, { region: 'Region', revenue: 'Amount', year: 'Year' }));
    const shown = fig.data.filter((t: any) => t.showlegend);
    const names = new Set(fig.data.map((t: any) => t.name));
    expect(shown.length).toBe(names.size);
    expect(fig.data.every((t: any) => t.legendgroup === t.name)).toBe(true);
  });

  it('diverging vs categorical semantics pick different scheme families', () => {
    const TEMP = [
      { city: 'Oslo', temp: -6 }, { city: 'Rome', temp: 14 }, { city: 'Cairo', temp: 24 },
    ];
    const diverging = assemblePlotly(input('Bar Chart', { x: { field: 'city' }, y: { field: 'temp' }, color: { field: 'temp' } }, TEMP, { city: 'City', temp: 'Temperature' }));
    const categorical = assemblePlotly(input('Scatter Plot', { x: { field: 'weight' }, y: { field: 'mpg' }, color: { field: 'origin' } }, CARS, { weight: 'Quantity', mpg: 'Quantity', origin: 'Country' }));
    // Categorical grouping draws from the plotly10 qualitative palette…
    expect(categorical.data[0].marker.color).toBe('#636efa');
    // …while a diverging measure on color routes to the RdBu ramp.
    expect(diverging.data[0].marker.color).toBe('#b2182b');
  });

  it('every dedicated generator case assembles cleanly', () => {
    for (const tc of [...genPlotlyCoreTests(), ...genPlotlyFacetTests()]) {
      const encodings = Object.fromEntries(
        Object.entries(tc.encodingMap).map(([ch, e]: [string, any]) => [ch, { field: e.fieldID }]),
      );
      const semantic_types = Object.fromEntries(
        Object.entries(tc.metadata).map(([f, m]: [string, any]) => [f, m.semanticType]),
      );
      const fig = assemblePlotly({
        data: { values: tc.data },
        semantic_types,
        chart_spec: { chartType: tc.chartType, encodings },
      } as any);
      expect(Array.isArray(fig.data), tc.title).toBe(true);
      expect(fig.data.length, tc.title).toBeGreaterThan(0);
    }
  });

  it('figures are pure JSON for all four templates', () => {
    const figures = [
      assemblePlotly(input('Bar Chart', { x: { field: 'region' }, y: { field: 'revenue' } }, SALES, { region: 'Region', revenue: 'Amount' })),
      assemblePlotly(input('Line Chart', { x: { field: 'month' }, y: { field: 'value' } }, MONTHLY, { month: 'YearMonth', value: 'Amount' })),
      assemblePlotly(input('Area Chart', { x: { field: 'region' }, y: { field: 'revenue' }, color: { field: 'year' } }, GROUPED, { region: 'Region', revenue: 'Amount', year: 'Year' })),
      assemblePlotly(input('Scatter Plot', { x: { field: 'weight' }, y: { field: 'mpg' } }, CARS, { weight: 'Quantity', mpg: 'Quantity' })),
      assemblePlotly(input('Bar Chart', { x: { field: 'region' }, y: { field: 'revenue' }, column: { field: 'year' } }, GROUPED, { region: 'Region', revenue: 'Amount', year: 'Year' })),
    ];
    for (const fig of figures) {
      assertNoFunctions(fig);
      expect(JSON.parse(JSON.stringify(fig))).toEqual(fig);
    }
  });
});
