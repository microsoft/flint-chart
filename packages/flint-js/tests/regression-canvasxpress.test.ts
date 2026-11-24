// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleCanvasXpress } from '../src';
import { genRegressionTests } from '../src/test-data';
import type { TestCase } from '../src/test-data/types';

/**
 * CanvasXpress Regression. The template used to hardcode `showRegressionFit: true`
 * (a straight line) and ignore both the requested method and the colour channel, so
 * a quadratic/log/exp/power case drew a line and a colour-grouped case drew one
 * global fit. These assert the method → fit mapping and the per-group / facet shapes.
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
const cfg = (title: string) => assembleCanvasXpress(toInput(byTitle(genRegressionTests(), title))).config as any;

describe('CanvasXpress Regression — fit method', () => {
  it('draws a linear fit by default (line + equation + band)', () => {
    const c = cfg('Basic regression (40 pts)');
    expect(c.showRegressionFit).toBe(true);
    expect(c.decorations).toBeUndefined();
  });

  it('maps quadratic → a 2nd-degree polynomial decoration curve', () => {
    const c = cfg('Quadratic regression (60 pts)');
    expect(c.showRegressionFit).toBeUndefined();
    expect(Object.keys(c.decorations)).toEqual(['polynomial']);
    expect(c.regressionOrder).toBe(2);
    expect(c.showDecorations).toBe(true);
  });

  it('maps an order-4 poly request to the right degree', () => {
    const c = cfg('Poly regression (3 groups, order 4)');
    expect(Object.keys(c.decorations)).toEqual(['polynomial']);
    expect(c.regressionOrder).toBe(4);
  });

  it('maps log / exp / power to their decoration keys', () => {
    expect(Object.keys(cfg('Logarithmic regression (50 pts)').decorations)).toEqual(['logarithmic']);
    expect(Object.keys(cfg('Exponential regression (45 pts)').decorations)).toEqual(['exponential']);
    expect(Object.keys(cfg('Power regression + Color (2 groups)').decorations)).toEqual(['power']);
  });
});

describe('CanvasXpress Regression — colour, size, facet', () => {
  it('fits one linear line PER colour group (annotation name, not true)', () => {
    const c = cfg('Regression + Color (2 groups)');
    expect(c.showRegressionFit).toBe('Gender');
    expect(c.colorBy).toBe('Gender');
    expect(c.showLegend).toBe(true);
  });

  it('scales points by a size channel', () => {
    const c = cfg('Regression + Color (3 groups) + Size');
    expect(c.sizeBy).toBe('Weight');
    expect(c.showRegressionFit).toBe('Tier');
  });

  it('facets the fit into one panel per column value', () => {
    const c = cfg("Anscombe's Quartet — same stats, different shapes");
    expect(c.segregateVariablesBy).toEqual(['Dataset']);
    expect(c.showRegressionFit).toBe(true);
  });
});
