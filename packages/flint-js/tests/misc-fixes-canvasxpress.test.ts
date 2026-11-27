// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleCanvasXpress } from '../src';
import { genDensityTests, genOncoprintTests } from '../src/test-data';
import type { TestCase } from '../src/test-data/types';

/**
 * A cluster of CanvasXpress template fixes:
 *   - density plots do NOT overlay the raw data points;
 *   - oncoprints never draw the continuous expression background heatmap.
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

describe('CanvasXpress Density — no data points', () => {
  it('does not overlay the raw data points', () => {
    const spec = assembleCanvasXpress(toInput(genDensityTests()[0])) as any;
    expect(spec.config.showHistogramDataPoints).toBeUndefined();
  });
});

describe('CanvasXpress Oncoprint — no heatmap', () => {
  it('never shows the expression background heatmap', () => {
    const spec = assembleCanvasXpress(toInput(genOncoprintTests()[0])) as any;
    expect(spec.config.showHeatmapOncoprint).toBe(false);
    // The base heatmap matrix is empty (all null) — glyph layers only.
    expect(spec.data.y.data.flat().every((v: any) => v === null)).toBe(true);
  });
});
