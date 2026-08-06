// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleChartjs, assembleECharts, assembleVegaLite, cjsGetTemplateDef } from '../src';

const DATA = [
  { region: 'East', revenue: 168 },
  { region: 'South', revenue: 167 },
  { region: 'North', revenue: 145 },
];

const GROUPED_DATA = [
  { region: 'East', revenue: 168, year: '2024' },
  { region: 'South', revenue: 167, year: '2024' },
  { region: 'East', revenue: 120, year: '2025' },
  { region: 'South', revenue: 131, year: '2025' },
];

function verticalInput(chartProperties?: Record<string, unknown>) {
  return {
    data: { values: DATA },
    semantic_types: { region: 'Region', revenue: 'Amount' },
    chart_spec: {
      chartType: 'Lollipop Chart',
      encodings: { x: { field: 'region' }, y: { field: 'revenue' } },
      baseSize: { width: 400, height: 300 },
      ...(chartProperties ? { chartProperties } : {}),
    },
  };
}

describe('Chart.js Lollipop Chart', () => {
  it('is registered in the Chart.js template registry', () => {
    expect(cjsGetTemplateDef('Lollipop Chart')).toBeDefined();
  });

  it('builds a thin bar stem plus a point-only line dataset', () => {
    const config = assembleChartjs(verticalInput()) as any;
    expect(config.type).toBe('bar');
    expect(config.data.labels).toEqual(['East', 'South', 'North']);

    const [stem, dots] = config.data.datasets;
    expect(stem.type).toBe('bar');
    expect(stem.barThickness).toBe(1.5);
    expect(stem.data).toEqual([168, 167, 145]);

    expect(dots.type).toBe('line');
    expect(dots.showLine).toBe(false);
    expect(dots.pointRadius).toBe(5); // dotSize default 80 → 10px diameter
    expect(dots.data).toEqual([168, 167, 145]);
  });

  it('anchors the value axis at zero (stems grow from 0)', () => {
    const config = assembleChartjs(verticalInput()) as any;
    expect(config.options.scales.y.beginAtZero).toBe(true);
  });

  it('transposes to indexAxis "y" when the category is on y', () => {
    const config = assembleChartjs({
      data: { values: DATA },
      semantic_types: { region: 'Region', revenue: 'Amount' },
      chart_spec: {
        chartType: 'Lollipop Chart',
        encodings: { x: { field: 'revenue' }, y: { field: 'region' } },
        baseSize: { width: 400, height: 300 },
      },
    }) as any;
    expect(config.options.indexAxis).toBe('y');
    expect(config.options.scales.x.type).toBe('linear');
    expect(config.data.labels).toEqual(['East', 'South', 'North']);
  });

  it('adds one dot dataset per color group and shows the legend', () => {
    const config = assembleChartjs({
      data: { values: GROUPED_DATA },
      semantic_types: { region: 'Region', revenue: 'Amount', year: 'Year' },
      chart_spec: {
        chartType: 'Lollipop Chart',
        encodings: { x: { field: 'region' }, y: { field: 'revenue' }, color: { field: 'year' } },
        baseSize: { width: 400, height: 300 },
      },
    }) as any;

    expect(config.data.datasets).toHaveLength(3); // stem + 2 groups
    expect(config.data.datasets.slice(1).map((d: any) => d.label)).toEqual(['2024', '2025']);
    expect(config.options.plugins.legend.display).toBe(true);
  });

  it('keeps the stem out of legend and tooltip', () => {
    const config = assembleChartjs(verticalInput()) as any;
    const stem = config.data.datasets[0];
    const { legend, tooltip } = config.options.plugins;
    expect(legend.labels.filter({ text: stem.label })).toBe(false);
    expect(tooltip.filter({ dataset: { label: stem.label } })).toBe(false);
    expect(tooltip.filter({ dataset: { label: 'revenue' } })).toBe(true);
  });

  it('maps the dotSize property onto the point radius', () => {
    const small = assembleChartjs(verticalInput({ dotSize: 20 })) as any;
    const large = assembleChartjs(verticalInput({ dotSize: 300 })) as any;
    expect(small.data.datasets[1].pointRadius).toBeLessThan(5);
    expect(large.data.datasets[1].pointRadius).toBeGreaterThan(5);
    expect(large.data.datasets[1].pointRadius).toBeLessThanOrEqual(8); // 16px diameter cap
  });

  it('compiles the same input on all three backends', () => {
    const input = verticalInput();
    expect(() => assembleVegaLite(input)).not.toThrow();
    expect(() => assembleECharts(input)).not.toThrow();
    expect(() => assembleChartjs(input)).not.toThrow();
  });
});
