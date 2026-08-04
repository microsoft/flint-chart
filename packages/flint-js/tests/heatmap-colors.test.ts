// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it } from 'vitest';
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
    expect(spec.layer).toHaveLength(4);
    expect(spec.layer[0].transform[0].filter).toContain('isValid(datum["value"])');
    expect(spec.layer[1].mark).toMatchObject({
      type: 'rect',
      color: '#8c8c8c',
      opacity: 0.32,
    });
    expect(spec.layer[3].encoding.text).toEqual({ value: '—' });
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