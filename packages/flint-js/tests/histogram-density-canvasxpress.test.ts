// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleCanvasXpress } from '../src';
import { genHistogramTests, genDensityTests } from '../src/test-data';
import type { TestCase } from '../src/test-data/types';

/**
 * CanvasXpress single-variable distributions with a colour/facet group. The
 * Histogram and Density templates used to ignore the colour channel entirely, so
 * a gender/group split collapsed into one undifferentiated distribution. These
 * assert that a bound colour rides as a per-variable `z` annotation and splits the
 * distribution (stacked bars for a histogram; layered filled curves for a density).
 */

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
      baseSize: { width: 676, height: 436 },
      ...(tc.chartProperties ? { chartProperties: tc.chartProperties } : {}),
    },
  } as any;
}

const byTitle = (tcs: TestCase[], title: string) => tcs.find((t) => t.title === title)!;

describe('CanvasXpress Histogram — colour split', () => {
  it('splits (stacks) the histogram by the colour group', () => {
    const tc = byTitle(genHistogramTests(), 'Histogram + Color (gender split)');
    const spec = assembleCanvasXpress(toInput(tc)) as any;
    expect(spec.config.showHistogram).toBe('Gender');
    expect(spec.config.histogramType).toBe('stacked');
    expect(spec.config.colorBy).toBe('Gender');
    expect(spec.config.showLegend).toBe(true);
    expect(spec.data.z.Gender).toHaveLength(tc.data.length);
  });

  it('keeps a plain histogram (showHistogram:true, no legend) with no colour', () => {
    const tc = byTitle(genHistogramTests(), 'Normal distribution (100 points)');
    const spec = assembleCanvasXpress(toInput(tc)) as any;
    expect(spec.config.showHistogram).toBe(true);
    expect(spec.config.showLegend).toBe(false);
    expect(spec.data.z).toBeUndefined();
  });
});

describe('CanvasXpress Density — colour + facet', () => {
  it('layers one filled curve per colour group via colorBy', () => {
    const tc = byTitle(genDensityTests(), 'Grouped Density (3 groups, 450 pts)');
    const spec = assembleCanvasXpress(toInput(tc)) as any;
    expect(spec.config.graphType).toBe('Density');
    expect(spec.config.colorBy).toBe('Group');
    expect(spec.config.showLegend).toBe(true);
    expect(spec.data.z.Group).toHaveLength(tc.data.length);
  });

  it('facets the colour-split curves into one panel per column value', () => {
    const tc = byTitle(genDensityTests(), 'Color + Column Facet (2 sites)');
    const spec = assembleCanvasXpress(toInput(tc)) as any;
    expect(spec.config.colorBy).toBe('Batch');
    expect(spec.config.segregateVariablesBy).toEqual(['Site']);
    expect(spec.data.z.Batch).toHaveLength(tc.data.length);
    expect(spec.data.z.Site).toHaveLength(tc.data.length);
  });
});
