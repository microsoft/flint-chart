// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assemblePlotly, plGetTemplateDef, plAllTemplateDefs } from '../src';

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

  it('drops unsupported facet channels with a warning instead of throwing', () => {
    const fig = assemblePlotly(input('Bar Chart', { x: { field: 'region' }, y: { field: 'revenue' }, column: { field: 'year' } }, GROUPED, { region: 'Region', revenue: 'Amount', year: 'Year' }));
    expect(fig.data[0].type).toBe('bar');
    expect(fig._warnings?.some((w: any) => /column/.test(w.message))).toBe(true);
  });

  it('figures are pure JSON for all four templates', () => {
    const figures = [
      assemblePlotly(input('Bar Chart', { x: { field: 'region' }, y: { field: 'revenue' } }, SALES, { region: 'Region', revenue: 'Amount' })),
      assemblePlotly(input('Line Chart', { x: { field: 'month' }, y: { field: 'value' } }, MONTHLY, { month: 'YearMonth', value: 'Amount' })),
      assemblePlotly(input('Area Chart', { x: { field: 'region' }, y: { field: 'revenue' }, color: { field: 'year' } }, GROUPED, { region: 'Region', revenue: 'Amount', year: 'Year' })),
      assemblePlotly(input('Scatter Plot', { x: { field: 'weight' }, y: { field: 'mpg' } }, CARS, { weight: 'Quantity', mpg: 'Quantity' })),
    ];
    for (const fig of figures) {
      assertNoFunctions(fig);
      expect(JSON.parse(JSON.stringify(fig))).toEqual(fig);
    }
  });
});
