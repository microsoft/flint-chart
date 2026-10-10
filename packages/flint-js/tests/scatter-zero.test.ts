// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite, assembleECharts } from '../src';
import { genEChartsScatterTests } from '../src/test-data';
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

describe('Scatter Plot zero baseline — EC Basic Q×Q', () => {
  const tc = genEChartsScatterTests().find((t) => t.title.includes('Basic Q×Q'))!;

  it('defaults to data-fit axes (not forced zero) for far-from-zero Quantity fields', () => {
    const vl = assembleVegaLite(toInput(tc)) as any;
    const ec = assembleECharts(toInput(tc)) as any;

    expect(vl.encoding.x.scale.zero).toBe(false);
    expect(vl.encoding.y.scale.zero).toBe(false);
    expect(ec.xAxis.scale).toBe(true);
    expect(ec.yAxis.scale).toBe(true);
  });

  it('pads EC axes to the data range instead of anchoring at zero', () => {
    const ec = assembleECharts(toInput(tc)) as any;
    const weights = tc.data.map((r) => r.Weight as number);
    const heights = tc.data.map((r) => r.Height as number);
    const wMin = Math.min(...weights);
    const wMax = Math.max(...weights);
    const hMin = Math.min(...heights);
    const hMax = Math.max(...heights);

    expect(ec.xAxis.min).toBeGreaterThan(0);
    expect(ec.xAxis.min).toBeLessThan(wMin);
    expect(ec.xAxis.max).toBeGreaterThan(wMax);
    expect(ec.yAxis.min).toBeGreaterThan(0);
    expect(ec.yAxis.min).toBeLessThan(hMin);
    expect(ec.yAxis.max).toBeGreaterThan(hMax);
  });
});

describe('Line Chart zero baseline — quantitative index axis', () => {
  const input = {
    data: { values: [15, 30, 45, 60, 80].map((Age, i) => ({ Age, Hours: 4 + i })) },
    semantic_types: { Age: 'Quantity', Hours: 'Quantity' },
    chart_spec: { chartType: 'Line Chart', encodings: { x: 'Age', y: 'Hours' }, baseSize: { width: 560, height: 360 } },
  };

  it('fits the x index to the data but keeps the measure anchored at zero', () => {
    const vl = assembleVegaLite(input) as any;
    expect(vl.encoding.x.scale.zero).toBe(false);
    expect(vl.encoding.y.scale.zero).not.toBe(false);
  });
});
