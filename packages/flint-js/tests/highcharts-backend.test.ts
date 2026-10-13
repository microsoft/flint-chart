// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleHighcharts, hcGetTemplateDef, hcAllTemplateDefs } from '../src';
import { validateChart } from '../src/validate';

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

function input(
  chartType: string,
  encodings: Record<string, unknown>,
  values: any[],
  semanticTypes: Record<string, string>,
  chartProperties?: Record<string, unknown>,
) {
  return {
    data: { values },
    semantic_types: semanticTypes,
    chart_spec: {
      chartType,
      encodings,
      baseSize: { width: 400, height: 300 },
      ...(chartProperties ? { chartProperties } : {}),
    },
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

describe('Highcharts backend', () => {
  it('registers the acceptance templates', () => {
    const charts = hcAllTemplateDefs.map(t => t.chart).sort();
    expect(charts).toEqual([...new Set(charts)]);
    for (const acceptance of ['Area Chart', 'Bar Chart', 'Line Chart', 'Scatter Plot']) {
      expect(charts).toContain(acceptance);
    }
  });

  it('assembles a Bar Chart with categories and a single series', () => {
    const option = assembleHighcharts(input(
      'Bar Chart',
      { x: 'region', y: 'revenue' },
      SALES,
      { region: 'Category', revenue: 'Quantity' },
    )) as any;

    expect(option.chart.type).toBe('column');
    // 'Category' semantic type → ordinal channel → alphabetical category order
    expect(option.xAxis.categories).toEqual(['North', 'East', 'South']);
    expect(option.series).toHaveLength(1);
    expect(option.series[0].data).toEqual([145, 168, 167]);
    expect(option.yAxis.title.text).toBe('revenue');
    expect(option._width).toBeGreaterThan(0);
    expect(option._height).toBeGreaterThan(0);
    assertNoFunctions(option);
  });

  it('assembles a horizontal Bar Chart when y is the category', () => {
    const option = assembleHighcharts(input(
      'Bar Chart',
      { x: 'revenue', y: 'region' },
      SALES,
      { region: 'Category', revenue: 'Quantity' },
    )) as any;

    expect(option.chart.type).toBe('bar');
    expect(option.yAxis.categories).toEqual(['North', 'East', 'South']);
    expect(option.xAxis.title.text).toBe('revenue');
  });

  it('assembles a Stacked Bar Chart with one series per color', () => {
    const option = assembleHighcharts(input(
      'Stacked Bar Chart',
      { x: 'region', y: 'revenue', color: 'year' },
      GROUPED,
      { region: 'Category', revenue: 'Quantity', year: 'Category' },
    )) as any;

    expect(option.chart.type).toBe('column');
    expect(option.plotOptions.series.stacking).toBe('normal');
    expect(option.series).toHaveLength(2);
    expect(option.series.map((s: any) => s.name).sort()).toEqual(['2024', '2025']);
  });

  it('assembles a Grouped Bar Chart with side-by-side series', () => {
    const option = assembleHighcharts(input(
      'Grouped Bar Chart',
      { x: 'region', y: 'revenue', group: 'year' },
      GROUPED,
      { region: 'Category', revenue: 'Quantity', year: 'Category' },
    )) as any;

    expect(option.chart.type).toBe('column');
    expect(option.series).toHaveLength(2);
    expect(option.xAxis.categories).toEqual(['East', 'South']);
  });

  it('assembles a Line Chart with a category axis', () => {
    const option = assembleHighcharts(input(
      'Line Chart',
      { x: 'month', y: 'value' },
      MONTHLY,
      { month: 'Category', value: 'Quantity' },
    )) as any;

    expect(option.chart.type).toBe('line');
    expect(option.xAxis.categories).toEqual(['2025-01', '2025-02', '2025-03']);
    expect(option.series[0].data).toEqual([12, 18, 15]);
  });

  it('assembles a Line Chart with a datetime axis for temporal x', () => {
    const option = assembleHighcharts(input(
      'Line Chart',
      { x: 'month', y: 'value' },
      MONTHLY,
      { month: 'Date', value: 'Quantity' },
    )) as any;

    expect(option.xAxis.type).toBe('datetime');
    expect(option.series[0].data.length).toBe(3);
    // [timestamp, value] pairs
    expect(option.series[0].data[0]).toHaveLength(2);
    expect(typeof option.series[0].data[0][0]).toBe('number');
  });

  it('assembles an Area Chart', () => {
    const option = assembleHighcharts(input(
      'Area Chart',
      { x: 'month', y: 'value' },
      MONTHLY,
      { month: 'Category', value: 'Quantity' },
    )) as any;

    expect(option.chart.type).toBe('area');
    expect(option.series[0].data).toEqual([12, 18, 15]);
  });

  it('assembles a Scatter Plot with [x, y] pairs', () => {
    const option = assembleHighcharts(input(
      'Scatter Plot',
      { x: 'weight', y: 'mpg' },
      CARS,
      { weight: 'Quantity', mpg: 'Quantity' },
    )) as any;

    expect(option.chart.type).toBe('scatter');
    expect(option.series[0].data).toEqual([
      [1.6, 32],
      [2.1, 27],
      [1.9, 29],
    ]);
  });

  it('assembles a Scatter Plot with one series per color', () => {
    const option = assembleHighcharts(input(
      'Scatter Plot',
      { x: 'weight', y: 'mpg', color: 'origin' },
      CARS,
      { weight: 'Quantity', mpg: 'Quantity', origin: 'Country' },
    )) as any;

    expect(option.series).toHaveLength(3);
    expect(option.series.map((s: any) => s.name).sort()).toEqual(['EU', 'JP', 'US']);
  });

  it('assembles a Pie Chart with one slice per category', () => {
    const option = assembleHighcharts(input(
      'Pie Chart',
      { color: 'region', size: 'revenue' },
      SALES,
      { region: 'Category', revenue: 'Quantity' },
    )) as any;

    expect(option.chart.type).toBe('pie');
    expect(option.series[0].data).toEqual([
      { name: 'East', y: 168 },
      { name: 'South', y: 167 },
      { name: 'North', y: 145 },
    ]);
  });

  it('assembles a Doughnut Chart with innerSize', () => {
    const option = assembleHighcharts(input(
      'Doughnut Chart',
      { color: 'region', size: 'revenue' },
      SALES,
      { region: 'Category', revenue: 'Quantity' },
    )) as any;

    expect(option.chart.type).toBe('pie');
    expect(option.plotOptions.pie.innerSize).toBe('50%');
  });

  it('assembles a Histogram with computed bins', () => {
    const values = Array.from({ length: 50 }, (_, i) => ({ v: i }));
    const option = assembleHighcharts(input(
      'Histogram',
      { x: 'v' },
      values,
      { v: 'Quantity' },
      { binCount: 10 },
    )) as any;

    expect(option.chart.type).toBe('column');
    expect(option.series[0].data).toHaveLength(10);
    expect(option.series[0].data.reduce((a: number, b: number) => a + b, 0)).toBe(50);
  });

  it('assembles a Radar Chart with polar axes', () => {
    const data = [
      { metric: 'Speed', entity: 'A', value: 80 },
      { metric: 'Cost', entity: 'A', value: 20 },
      { metric: 'Speed', entity: 'B', value: 100 },
      { metric: 'Cost', entity: 'B', value: 40 },
    ];
    const option = assembleHighcharts(input(
      'Radar Chart',
      { x: 'metric', y: 'value', color: 'entity' },
      data,
      { metric: 'Category', value: 'Quantity', entity: 'Category' },
    )) as any;

    expect(option.chart.polar).toBe(true);
    expect(option.xAxis.categories).toEqual(['Speed', 'Cost']);
    expect(option.series).toHaveLength(2);
    expect(option.series[0].type).toBe('line');
  });

  it('assembles a Heatmap with a colorAxis and [x, y, value] data', () => {
    const data = [
      { Category: 'A', Group: 'X' },
      { Category: 'A', Group: 'Y' },
      { Category: 'B', Group: 'X' },
    ];
    const option = assembleHighcharts(input(
      'Heatmap',
      { x: 'Category', y: 'Group' },
      data,
      { Category: 'Category', Group: 'Category' },
    )) as any;

    expect(option.chart.type).toBe('heatmap');
    expect(option.xAxis.categories).toEqual(['A', 'B']);
    expect(option.yAxis.categories).toEqual(['X', 'Y']);
    expect(option.series[0].data).toContainEqual([0, 0, 1]);
    expect(option.colorAxis).toBeDefined();
  });

  it('falls back to a Heatmap when both bar axes are discrete', () => {
    const data = [
      { Category: 'A', Group: 'X' },
      { Category: 'B', Group: 'Y' },
    ];
    const option = assembleHighcharts(input(
      'Bar Chart',
      { x: 'Category', y: 'Group' },
      data,
      { Category: 'Category', Group: 'Category' },
    )) as any;

    expect(option.chart.type).toBe('heatmap');
  });

  it('assembles a Waterfall Chart with floating cumulative bars', () => {
    const data = [
      { Step: 'Start', Value: 100 },
      { Step: 'Up', Value: 50 },
      { Step: 'Down', Value: -30 },
    ];
    const option = assembleHighcharts(input(
      'Waterfall Chart',
      { x: 'Step', y: 'Value' },
      data,
      { Step: 'Category', Value: 'Quantity' },
    )) as any;

    expect(option.series[0].type).toBe('waterfall');
    expect(option.xAxis.categories).toEqual(['Start', 'Up', 'Down']);
    expect(option.series[0].data[0].isSum).toBe(true);
    expect(option.series[0].data[0].y).toBe(100);
    expect(option.series[0].data[1].y).toBe(50);
    expect(option.series[0].data[2].y).toBe(-30);
  });

  it('assembles a Sunburst Chart with a hierarchical tree', () => {
    const data = [
      { Region: 'Americas', Country: 'USA', Revenue: 20 },
      { Region: 'Americas', Country: 'Canada', Revenue: 15 },
      { Region: 'Europe', Country: 'France', Revenue: 30 },
    ];
    const option = assembleHighcharts(input(
      'Sunburst Chart',
      { color: 'Region', group: 'Country', size: 'Revenue' },
      data,
      { Region: 'Category', Country: 'Country', Revenue: 'Amount' },
    )) as any;

    expect(option.series[0].type).toBe('sunburst');
    const points = option.series[0].data;
    expect(points.find((p: any) => p.id === 'Americas').value).toBe(35);
    expect(points.find((p: any) => p.id === 'Americas·USA').parent).toBe('Americas');
  });

  it('applies a categorical palette to the top-level colors array', () => {
    const option = assembleHighcharts(input(
      'Bar Chart',
      { x: 'region', y: 'revenue', color: 'year' },
      GROUPED,
      { region: 'Category', revenue: 'Quantity', year: 'Category' },
    )) as any;

    expect(Array.isArray(option.colors)).toBe(true);
    expect(option.colors.length).toBeGreaterThanOrEqual(2);
  });

  it('emits a _facet config for faceted inputs', () => {
    const option = assembleHighcharts(input(
      'Bar Chart',
      { x: 'region', y: 'revenue', column: 'year' },
      GROUPED,
      { region: 'Category', revenue: 'Quantity', year: 'Category' },
    )) as any;

    expect(option._facet).toBe(true);
    expect(option._facetPanels.length).toBeGreaterThanOrEqual(1);
    expect(option._facetPanels[0][0].option.chart.type).toBe('column');
  });

  it('validates through the shared validate module', () => {
    const result = validateChart(input(
      'Bar Chart',
      { x: 'region', y: 'revenue' },
      SALES,
      { region: 'Category', revenue: 'Quantity' },
    ), 'highcharts');

    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.computedSize?.width).toBeGreaterThan(0);
  });

  it('throws on an unknown chart type', () => {
    expect(() => assembleHighcharts(input(
      'Nope Chart',
      { x: 'region', y: 'revenue' },
      SALES,
      { region: 'Category', revenue: 'Quantity' },
    ))).toThrow('Unknown Highcharts chart type');
  });

  it('exposes template lookup helpers', () => {
    expect(hcGetTemplateDef('Bar Chart')?.chart).toBe('Bar Chart');
    expect(hcGetTemplateDef('Nope')).toBeUndefined();
    expect(hcGetTemplateDef('Bar Chart')?.channels).toContain('x');
  });
});
