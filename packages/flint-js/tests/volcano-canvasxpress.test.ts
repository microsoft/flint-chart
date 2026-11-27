// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleCanvasXpress } from '../src';
import { genVolcanoTests } from '../src/test-data';
import type { TestCase } from '../src/test-data/types';

/**
 * CanvasXpress Volcano. The cutoff guides used the 1-D `line`/`hline` decoration
 * form (`{value}`), which draws nothing on a Scatter2D, and no genes were labelled.
 * These assert the Scatter2D threshold-line form (`line` keyed by x/y) and the
 * significant-gene callouts.
 */
function toInput(tc: TestCase) {
  const encodings: Record<string, string> = {};
  for (const [channel, item] of Object.entries(tc.encodingMap)) {
    const field = tc.fields.find((f) => f.id === (item as any).fieldID);
    if (field) encodings[channel] = field.name;
  }
  const semantic_types: Record<string, string> = {};
  for (const [name, meta] of Object.entries(tc.metadata)) semantic_types[name] = meta.semanticType;
  return {
    data: { values: tc.data },
    semantic_types,
    chart_spec: { chartType: tc.chartType, encodings, baseSize: { width: 676, height: 436 } },
  } as any;
}

describe('CanvasXpress Volcano — cutoff lines & gene labels', () => {
  const spec = assembleCanvasXpress(toInput(genVolcanoTests()[0])) as any;

  it('draws the cutoff lines as Scatter2D x/y threshold lines', () => {
    const lines = spec.config.decorations.line;
    // Two vertical (x) fold-change cutoffs + one horizontal (y) p-value cutoff.
    expect(lines.filter((l: any) => l.x != null).map((l: any) => l.x).sort()).toEqual([-1, 1]);
    expect(lines.filter((l: any) => l.y != null)).toHaveLength(1);
    // None uses the 1-D `value` form (which would draw nothing).
    expect(lines.every((l: any) => l.value === undefined)).toBe(true);
  });

  it('labels the doubly-significant genes', () => {
    expect(spec.config.labelBy).toBe('gene');
    expect(spec.config.labelSelect).toEqual(['AND', ['Significance', '==', 'p-value and Log2FC']]);
    expect(spec.config.optimizeTextPosition).toBe(true);
    expect(spec.data.z.gene).toHaveLength(spec.data.y.vars.length);
  });

  it('classifies into the four EnhancedVolcano categories', () => {
    expect(spec.config.colorBy).toBe('Significance');
    const cats = spec.config.colorKey.Significance;
    expect(Object.keys(cats).sort()).toEqual(
      ['Log2FC', 'NS', 'p-value', 'p-value and Log2FC'].sort(),
    );
    const seen = new Set(spec.data.z.Significance);
    // All four categories are present in the real 500-gene dataset.
    expect(seen.has('p-value and Log2FC')).toBe(true);
    expect(seen.has('NS')).toBe(true);
    // 92 doubly-significant hits (matches the EnhancedVolcano reference).
    expect(spec.data.z.Significance.filter((c: string) => c === 'p-value and Log2FC')).toHaveLength(92);
  });
});
