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

  it('uses light-to-dark blues for ECharts heatmaps by default', () => {
    const option = assembleECharts(heatmapInput()) as any;
    const colors = option.visualMap.inRange.color;

    expect(colors[0]).toBe('#f7fbff');
    expect(colors[colors.length - 1]).toBe('#08519c');
    expect(option.color).toBeUndefined();
    expect(option.series[0].itemStyle?.color).toBeUndefined();
  });
});