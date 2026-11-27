// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleCanvasXpress } from '../src';
import { genBoxplotTests, genViolinTests } from '../src/test-data';
import type { TestCase } from '../src/test-data/types';

/**
 * CanvasXpress grouped distributions (Boxplot / Violin). The template used to set
 * `groupingFactors: [groupField]` and only `colorBy` for a second category, so:
 *   - a colour sub-group collapsed into ONE merged box per band (dodge lost);
 *   - a faceted Violin degraded to boxplots (the engine computes the per-panel
 *     density only when the segregated facet is also a grouping factor).
 * These assert the grouping-factor shape that fixes both.
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

describe('CanvasXpress Boxplot — colour dodge', () => {
  it('adds a genuine colour sub-group as a second grouping factor (one box per pair)', () => {
    const tc = byTitle(genBoxplotTests(), 'Nominal × Quant + Color (4 groups × 2)');
    const spec = assembleCanvasXpress(toInput(tc)) as any;
    expect(spec.config.groupingFactors).toEqual(['Group', 'Gender']);
    expect(spec.config.colorBy).toBe('Gender');
    expect(spec.config.showLegend).toBe(true);
  });

  it('does NOT double-group a redundant colour (colour == x)', () => {
    const tc = byTitle(genBoxplotTests(), 'Color == X (redundant color)');
    const spec = assembleCanvasXpress(toInput(tc)) as any;
    expect(spec.config.groupingFactors).toEqual(['Rating']);
  });

  it('dodges compactly for an explicit global/local request (engine has no aligned grid)', () => {
    const global = byTitle(genBoxplotTests(), 'Dodge = Global (aligned)');
    const local = byTitle(genBoxplotTests(), 'Dodge = Local (compact)');
    const gSpec = assembleCanvasXpress(toInput(global)) as any;
    const lSpec = assembleCanvasXpress(toInput(local)) as any;
    // Both become a (Department, Level) dodge — CanvasXpress dodge is always compact.
    expect(gSpec.config.groupingFactors).toEqual(['Department', 'Level']);
    expect(lSpec.config.groupingFactors).toEqual(['Department', 'Level']);
  });
});

describe('CanvasXpress Violin — facet + dodge', () => {
  it('makes the facet a grouping factor so panels keep the violin shape', () => {
    const tc = byTitle(genViolinTests(), 'Reaction time by treatment, faceted by site (row)');
    const spec = assembleCanvasXpress(toInput(tc)) as any;
    expect(spec.config.graphType).toBe('Violin');
    expect(spec.config.groupingFactors).toEqual(['Treatment', 'Site']);
    expect(spec.config.segregateSamplesBy).toEqual(['Site']);
  });

  it('dodges a split violin by a second grouping factor', () => {
    const tc = byTitle(genViolinTests(), 'Salary by department and level (3 groups, grid)');
    const spec = assembleCanvasXpress(toInput(tc)) as any;
    expect(spec.config.graphType).toBe('Violin');
    expect(spec.config.groupingFactors).toEqual(['Department', 'Level']);
    expect(spec.config.colorBy).toBe('Level');
  });
});
