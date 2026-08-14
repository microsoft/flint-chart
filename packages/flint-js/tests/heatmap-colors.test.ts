// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it } from 'vitest';
import { compile } from 'vega-lite';
import { assembleECharts, assembleExcel, assembleVegaLite } from '../src';

const HEATMAP_DATA = [
  { day: 'Mon', hour: '09:00', value: 1 },
  { day: 'Mon', hour: '10:00', value: 4 },
  { day: 'Tue', hour: '09:00', value: 2 },
  { day: 'Tue', hour: '10:00', value: 7 },
];

function heatmapInput(chartProperties?: Record<string, unknown>) {
  return {
    data: { values: HEATMAP_DATA },
    semantic_types: { day: 'Category', hour: 'Category', value: 'Count' },
    chart_spec: {
      chartType: 'Heatmap',
      encodings: {
        x: { field: 'day' },
        y: { field: 'hour' },
        color: { field: 'value' },
      },
      ...(chartProperties ? { chartProperties } : {}),
    },
  };
}

const DIVERGING_DATA = [
  { team: 'A', month: 'Jan', delta: -0.6 },
  { team: 'A', month: 'Feb', delta: 0.4 },
  { team: 'B', month: 'Jan', delta: 0.8 },
  { team: 'B', month: 'Feb', delta: -0.2 },
];

function divergingHeatmapInput() {
  return {
    data: { values: DIVERGING_DATA },
    semantic_types: { team: 'Category', month: 'Month', delta: 'Correlation' },
    chart_spec: {
      chartType: 'Heatmap',
      encodings: {
        x: { field: 'team' },
        y: { field: 'month' },
        color: { field: 'delta' },
      },
    },
  };
}

describe('heatmap color defaults', () => {
  it('rejects heatmaps because Office.js has no native heatmap chart type', () => {
    expect(() => assembleExcel(heatmapInput())).toThrow(
      'Excel backend does not support chart type "Heatmap" as a native Office.js chart.',
    );
  });

  it('also rejects diverging heatmaps rather than emulating a color scale', () => {
    expect(() => assembleExcel(divergingHeatmapInput())).toThrow(
      'Excel backend does not support chart type "Heatmap" as a native Office.js chart.',
    );
  });

  it('uses blues for non-diverging Vega-Lite heatmaps by default', () => {
    const spec = assembleVegaLite(heatmapInput()) as any;

    expect(spec.encoding.color.scale.scheme).toBe('blues');
  });

  it('preserves explicit color scheme overrides from chartProperties', () => {
    const spec = assembleVegaLite(heatmapInput({ colorScheme: 'viridis' })) as any;

    expect(spec.encoding.color.scale.scheme).toBe('viridis');
  });

  it('keeps diverging Vega-Lite heatmaps centered', () => {
    const spec = assembleVegaLite(divergingHeatmapInput()) as any;

    expect(spec.encoding.color.scale.scheme).toBe('redblue');
    expect(spec.encoding.color.scale.domainMid).toBe(0);
  });

  it('renders null values as intentional no-data cells', () => {
    const input = heatmapInput({ showValueLabels: true }) as any;
    input.data.values[0].value = null;

    const spec = assembleVegaLite(input) as any;
    expect(spec.encoding).toBeUndefined();
    expect(spec.layer).toHaveLength(2);
    expect(spec.layer[0].encoding.color.condition).toMatchObject({
      value: '#8c8c8c',
    });
    expect(spec.layer[0].encoding.opacity.condition).toMatchObject({
      value: 0.32,
    });
    expect(spec.layer[1].mark.clip).toBe(true);
    expect(spec.layer[1].encoding.text.condition).toMatchObject({ value: '—' });
  });

  it('keeps temporal heatmap axes continuous after transposing them', () => {
    const input = {
      data: {
        values: [
          { month: '2025-01-01', food: 'Apples', value: 1 },
          { month: '2025-02-01', food: 'Apples', value: 2 },
          { month: '2025-01-01', food: 'Eggs', value: 3 },
          { month: '2025-02-01', food: 'Eggs', value: null },
        ],
      },
      semantic_types: { month: 'YearMonth', food: 'Category', value: 'Count' },
      chart_spec: {
        chartType: 'Heatmap',
        encodings: { x: 'month', y: 'food', color: 'value' },
        chartProperties: {
          arrange: 'flip:x-y',
          showValueLabels: true,
        },
      },
    } as any;

    const spec = assembleVegaLite(input) as any;
    expect(spec.layer[0].encoding.x).toMatchObject({ field: 'food', type: 'nominal' });
    expect(spec.layer[0].encoding.y).toMatchObject({ field: 'month', type: 'temporal' });
    expect(spec.layer[0].encoding.y.scale.domain).toHaveLength(2);
    expect(spec.layer[1].encoding.y.scale.domain)
      .toEqual(spec.layer[0].encoding.y.scale.domain);
  });

  it('infers a numeric year field as temporal when semantic types are missing', () => {
    const values = Array.from({ length: 19 }, (_, index) => ({
      year: 2006 + index,
      item: 'Bananas, per lb.',
      monthly_volatility: 11.27 - index / 10,
    }));

    const spec = assembleVegaLite({
      data: { values },
      semantic_types: {},
      chart_spec: {
        chartType: 'Heatmap',
        encodings: {
          x: { field: 'year' },
          y: { field: 'item' },
          color: { field: 'monthly_volatility', scheme: 'oranges' },
        },
        baseSize: { width: 400, height: 300 },
        canvasSize: { width: 600, height: 450 },
        chartProperties: {},
      },
      options: { addTooltips: true },
    } as any) as any;

    expect(spec.encoding.x.type).toBe('temporal');
    expect(spec.encoding.x.axis?.format).toBeUndefined();
    expect(spec.data.values.map((row: any) => row.year)).toEqual(
      values.map(row => String(row.year)),
    );

    const compiled = compile(spec).spec as any;
    const xScale = compiled.scales.find((scale: any) => scale.name === 'x');
    expect(xScale.type).toBe('time');
  });

  it('does not zero-expand an explicit cell domain on an untyped quantitative axis', () => {
    const values = Array.from({ length: 19 }, (_, index) => ({
      position: 2006 + index,
      item: 'Bananas, per lb.',
      value: 11.27 - index / 10,
    }));
    const spec = assembleVegaLite({
      data: { values },
      semantic_types: {},
      chart_spec: {
        chartType: 'Heatmap',
        encodings: { x: 'position', y: 'item', color: 'value' },
      },
    } as any) as any;

    expect(spec.encoding.x).toMatchObject({
      type: 'quantitative',
      scale: { zero: false, nice: false, domain: [2005.5, 2024.5] },
    });

    const compiled = compile(spec).spec as any;
    const xScale = compiled.scales.find((scale: any) => scale.name === 'x');
    expect(xScale).toMatchObject({
      type: 'linear',
      domain: [2005.5, 2024.5],
      nice: false,
      zero: false,
    });
  });

  it('retains two true temporal axes for a dense 2,400-cell time heatmap', () => {
    const values = [];
    for (let x = 0; x < 60; x += 1) {
      for (let y = 0; y < 40; y += 1) {
        values.push({
          xDate: new Date(Date.UTC(2018, 0, 1 + x * 27)).toISOString().slice(0, 10),
          yDate: new Date(Date.UTC(2020, 0, 1 + y * 27)).toISOString().slice(0, 10),
          value: (x + y) % 100,
        });
      }
    }

    const spec = assembleVegaLite({
      data: { values },
      semantic_types: { xDate: 'Date', yDate: 'Date', value: 'Quantity' },
      chart_spec: {
        chartType: 'Heatmap',
        encodings: {
          x: { field: 'xDate' },
          y: { field: 'yDate' },
          color: 'value',
        },
        baseSize: { width: 400, height: 300 },
      },
    } as any) as any;

    expect(spec.encoding.x.type).toBe('temporal');
    expect(spec.encoding.y.type).toBe('temporal');
    expect(spec.mark).toMatchObject({ type: 'rect' });
    expect(spec.mark.width).toBeGreaterThan(0);
    expect(spec.mark.height).toBeGreaterThan(0);
    expect(spec._width).toBeLessThanOrEqual(500);
    expect(spec._height).toBeLessThanOrEqual(400);
    expect(spec.config.axisX.labelFontSize).toBeLessThanOrEqual(8);
    expect(spec.config.axisY.labelFontSize).toBeLessThanOrEqual(8);
  });

  it('uses light-to-dark blues for ECharts heatmaps by default', () => {
    const option = assembleECharts(heatmapInput()) as any;
    const colors = option.visualMap.inRange.color;

    expect(colors[0]).toBe('#f7fbff');
    expect(colors[colors.length - 1]).toBe('#08519c');
    expect(option.color).toBeUndefined();
    expect(option.series[0].itemStyle?.color).toBeUndefined();
  });
});

/**
 * A pivot is a question, not a fact about the numbers. The same temperatures
 * split at freezing if we are asking what ices over, and somewhere near room
 * temperature if we are asking where is pleasant to live; nothing in the data
 * distinguishes the two, so the author says which.
 */
const CITY_TEMPS = [
  { city: 'Singapore', month: 'Jan', temp: 26 },
  { city: 'Singapore', month: 'Jul', temp: 27 },
  { city: 'Moscow', month: 'Jan', temp: -9 },
  { city: 'Moscow', month: 'Jul', temp: 19 },
];

function tempHeatmapInput(annotation: Record<string, unknown>) {
  return {
    data: { values: CITY_TEMPS },
    semantic_types: {
      city: 'Category',
      month: 'Month',
      temp: { semanticType: 'Quantity', ...annotation },
    },
    chart_spec: {
      chartType: 'Heatmap',
      encodings: {
        x: { field: 'month' },
        y: { field: 'city' },
        color: { field: 'temp' },
      },
    },
  } as any;
}

describe('what a diverging colour scale pivots on', () => {
  it('pivots on the value the author names, not on zero', () => {
    const spec = assembleVegaLite(tempHeatmapInput({ divergingMidpoint: 18 })) as any;

    expect(spec.encoding.color.scale.domainMid).toBe(18);
    // Symmetric about the pivot, or a degree above reads differently from a
    // degree below: 18 - (-9) = 27 is the longer reach, so both arms take it.
    expect(spec.encoding.color.scale.domain).toEqual([-9, 45]);
  });

  it('splits on the named value even when every reading is on one side of it', () => {
    const warm = CITY_TEMPS.filter(r => r.temp > 0);
    const spec = assembleVegaLite({
      ...tempHeatmapInput({ divergingMidpoint: 18 }),
      data: { values: warm },
    }) as any;

    expect(spec.encoding.color.scale.domainMid).toBe(18);
  });

  it('falls back to zero when the author names nothing', () => {
    const spec = assembleVegaLite(tempHeatmapInput({})) as any;

    expect(spec.encoding.color.scale.domainMid).toBe(0);
  });

  it('warms the high end of a measure whose sign carries no loss', () => {
    const spec = assembleVegaLite(tempHeatmapInput({})) as any;

    expect(spec.encoding.color.scale.scheme).toBe('blueorange');
  });
});