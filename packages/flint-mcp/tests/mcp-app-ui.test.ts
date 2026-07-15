// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it } from 'vitest';
import type { ChartAssemblyInput } from 'flint-chart';

import { setBaseSize, setCompatibleChartType } from '../ui/src/options.js';
import { compileFlintVegaLite, validateFlintChart } from '../ui/src/render.js';

const barChart: ChartAssemblyInput = {
  data: {
    values: [
      { region: 'North', revenue: 120 },
      { region: 'South', revenue: 90 },
    ],
  },
  semantic_types: { region: 'Nominal', revenue: 'Quantity' },
  chart_spec: {
    chartType: 'Bar Chart',
    encodings: { x: { field: 'region' }, y: { field: 'revenue' } },
  },
};

describe('Flint MCP App helpers', () => {
  it('adapts encodings through Flint template metadata when switching to pie', () => {
    const pie = setCompatibleChartType(barChart, 'Pie Chart');

    expect(pie.chart_spec.chartType).toBe('Pie Chart');
    expect(pie.chart_spec.encodings).toEqual({
      color: { field: 'region' },
      size: { field: 'revenue' },
    });
  });

  it('updates authored dimensions without changing the input', () => {
    const resized = setBaseSize(barChart, 'width', 480);

    expect(resized.chart_spec.baseSize).toEqual({ width: 480, height: 240 });
    expect(barChart.chart_spec.baseSize).toBeUndefined();
  });

  it('validates and compiles a public Vega-Lite output with Flint', () => {
    const validation = validateFlintChart(barChart);
    const compiled = compileFlintVegaLite(barChart);

    expect(validation.valid).toBe(true);
    expect(compiled.spec).not.toHaveProperty('_warnings');
    expect(compiled.spec).toHaveProperty('mark');
    expect(compiled.computedSize).toEqual(expect.objectContaining({ width: expect.any(Number) }));
  });
});
