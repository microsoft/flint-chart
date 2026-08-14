// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assemblePlotly, assembleVegaLite } from '../src';
import { genLineTests } from '../src/test-data';
import type { TestCase } from '../src/test-data/types';

function toInput(tc: TestCase) {
  const encodings: Record<string, string> = {};
  for (const [channel, item] of Object.entries(tc.encodingMap)) {
    const field = tc.fields.find((f) => f.id === (item as any).fieldID);
    if (field) encodings[channel] = field.name;
  }
  const semantic_types: Record<string, string> = {};
  for (const [name, meta] of Object.entries(tc.metadata)) {
    semantic_types[name] = meta.semanticType;
  }
  return {
    data: { values: tc.data },
    semantic_types,
    chart_spec: {
      chartType: tc.chartType,
      encodings,
      baseSize: { width: 560, height: 360 },
    },
  };
}

describe('Vega-Lite Line Chart — continuous color', () => {
  const cases = genLineTests();

  it('uses a neutral line layer plus colored points for O×Q + color(Q)', () => {
    const tc = cases.find((t) => t.description === 'Ordinal + continuous color gradient')!;
    const spec = assembleVegaLite(toInput(tc)) as any;

    expect(spec.layer).toHaveLength(2);
    expect(spec.layer[0].mark.type).toBe('line');
    expect(spec.layer[0].mark.color).toBe('#cccccc');
    expect(spec.layer[0].encoding.color).toBeUndefined();
    expect(spec.layer[0].encoding.x.field).toBe('Stage');
    expect(spec.layer[0].encoding.y.field).toBe('Value');

    expect(spec.layer[1].mark.type).toBe('point');
    expect(spec.layer[1].encoding.color.field).toBe('ColorVal');
    expect(spec.layer[1].encoding.color.type).toBe('quantitative');
  });

  describe('Plotly Line Chart — continuous color', () => {
    const cases = genLineTests();

    it('uses one neutral path plus color-scaled secondary points', () => {
      const tc = cases.find((t) => t.description === 'Continuous color gradient on time series')!;
      const fig = assemblePlotly(toInput(tc)) as any;

      expect(fig.data).toHaveLength(2);
      expect(fig.data[0].mode).toBe('lines');
      expect(fig.data[0].x).toHaveLength(tc.data.length);
      expect(fig.data[0].showlegend).toBe(false);
      expect(fig.data[1].mode).toBe('markers');
      expect(fig.data[1].marker.color).toHaveLength(tc.data.length);
      expect(fig.data[1].marker.showscale).toBe(true);
      expect(fig.data[1]._markerRole).toBe('secondary');
      expect(fig.layout.showlegend).toBe(false);
    });

    it('retains dash groups alongside a continuous color scale', () => {
      const input = {
        data: {
          values: [
            { x: 1, y: 10, score: 0.1, state: 'Actual' },
            { x: 2, y: 12, score: 0.2, state: 'Actual' },
            { x: 2, y: 12, score: 0.2, state: 'Forecast' },
            { x: 3, y: 15, score: 0.9, state: 'Forecast' },
          ],
        },
        semantic_types: { x: 'Quantity', y: 'Quantity', score: 'Quantity', state: 'Category' },
        chart_spec: {
          chartType: 'Line Chart',
          encodings: { x: 'x', y: 'y', color: 'score', strokeDash: 'state' },
          baseSize: { width: 500, height: 300 },
        },
      };
      const fig = assemblePlotly(input as any) as any;
      expect(fig.data.filter((t: any) => t.mode === 'lines').map((t: any) => t.line.dash))
        .toEqual(['solid', 'dash']);
      expect(fig.data.filter((t: any) => t.mode === 'markers')).toHaveLength(2);
      expect(fig.data.filter((t: any) => t.marker?.showscale)).toHaveLength(1);
      expect(fig.layout.showlegend).toBe(true);
    });
  });

  it('uses a neutral line layer plus colored points for T×Q + color(Q)', () => {
    const tc = cases.find((t) => t.description === 'Continuous color gradient on time series')!;
    const spec = assembleVegaLite(toInput(tc)) as any;

    expect(spec.layer).toHaveLength(2);
    expect(spec.layer[0].encoding.color).toBeUndefined();
    expect(spec.layer[1].encoding.color.field).toBe('ColorVal');
  });

  it('keeps a single line mark for discrete color series', () => {
    const tc = cases.find((t) => t.description === '4 series × 50 dates — smooth random walks')!;
    const spec = assembleVegaLite(toInput(tc)) as any;

    expect(spec.mark).toBe('line');
    expect(spec.layer).toBeUndefined();
    expect(spec.encoding.color.field).toBeDefined();
  });
});
