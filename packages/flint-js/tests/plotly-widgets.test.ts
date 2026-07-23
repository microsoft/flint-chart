// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Regression coverage for Plotly dynamic-widget (chartProperties + encoding
 * action) support. Many controls surfaced in the options bar (Sort, corner
 * radius, stack mode, log scale, include-zero) previously did nothing on the
 * Plotly backend because the templates never read/applied them, or the
 * encoding actions weren't declared (so applyEncodingOverrides ignored them),
 * or the raw encodings lacked resolved types (so Sort couldn't find the measure).
 */

import { describe, it, expect } from 'vitest';
import { assemblePlotly } from '../src';

const CATS = [{ Cat: 'A', Val: 30 }, { Cat: 'B', Val: 90 }, { Cat: 'C', Val: 50 }];
const CAT_TYPES = { Cat: 'Category', Val: 'Quantity' } as const;

function bandOrder(spec: any): string[] {
  return spec.layout.xaxis?.categoryarray ?? spec.layout.yaxis?.categoryarray ?? [];
}

describe('Plotly Sort encoding action', () => {
  for (const chartType of ['Bar Chart', 'Stacked Bar Chart', 'Grouped Bar Chart', 'Lollipop Chart']) {
    it(`reorders ${chartType} categories by value`, () => {
      const mk = (sort?: string) => assemblePlotly({
        data: { values: CATS },
        semantic_types: CAT_TYPES,
        chart_spec: {
          chartType, encodings: { x: 'Cat', y: 'Val' },
          ...(sort ? { chartProperties: { sort } } : {}),
        },
      } as any);
      expect(bandOrder(mk())).toEqual(['A', 'B', 'C']);
      expect(bandOrder(mk('value-desc'))).toEqual(['B', 'C', 'A']);
      expect(bandOrder(mk('value-asc'))).toEqual(['A', 'C', 'B']);
    });
  }

  it('sorts a HORIZONTAL bar by value too', () => {
    const s = assemblePlotly({
      data: { values: CATS }, semantic_types: CAT_TYPES,
      chart_spec: { chartType: 'Bar Chart', encodings: { y: 'Cat', x: 'Val' }, chartProperties: { sort: 'value-desc' } },
    } as any);
    expect(s.layout.yaxis.categoryarray).toEqual(['B', 'C', 'A']);
  });
});

describe('Plotly bar cornerRadius', () => {
  it('applies marker.cornerradius when set (and omits it at 0)', () => {
    const at = (cr?: number) => assemblePlotly({
      data: { values: CATS }, semantic_types: CAT_TYPES,
      chart_spec: { chartType: 'Bar Chart', encodings: { x: 'Cat', y: 'Val' }, ...(cr != null ? { chartProperties: { cornerRadius: cr } } : {}) },
    } as any).data[0].marker.cornerradius;
    expect(at()).toBeUndefined();
    expect(at(10)).toBe(10);
  });
});

describe('Plotly stackMode', () => {
  const S = [
    { Cat: 'A', Val: 30, Grp: 'x' }, { Cat: 'A', Val: 20, Grp: 'y' },
    { Cat: 'B', Val: 50, Grp: 'x' }, { Cat: 'B', Val: 40, Grp: 'y' },
  ];
  const T = { Cat: 'Category', Val: 'Quantity', Grp: 'Category' } as const;

  it('normalizes a stacked bar to 100% (barnorm percent)', () => {
    const s = assemblePlotly({
      data: { values: S }, semantic_types: T,
      chart_spec: { chartType: 'Stacked Bar Chart', encodings: { x: 'Cat', y: 'Val', color: 'Grp' }, chartProperties: { stackMode: 'normalize' } },
    } as any);
    expect(s.layout.barnorm).toBe('percent');
  });

  it('normalizes / layers a stacked area (groupnorm / no stackgroup)', () => {
    const mk = (mode?: string) => assemblePlotly({
      data: { values: S.map((r) => ({ Month: r.Cat, ...r })) }, semantic_types: { ...T, Month: 'Month' },
      chart_spec: { chartType: 'Area Chart', encodings: { x: 'Month', y: 'Val', color: 'Grp' }, ...(mode ? { chartProperties: { stackMode: mode } } : {}) },
    } as any);
    expect(mk('normalize').data[0].groupnorm).toBe('percent');
    expect(mk('normalize').data[0].stackgroup).toBe('one');
    expect(mk('layered').data[0].stackgroup).toBeUndefined();
  });
});

describe('Plotly waterfall value labels', () => {
  const WF = [
    { D: 'Engineering', V: 120 }, { D: 'Sales', V: -45 }, { D: 'Marketing', V: -80 },
    { D: 'Operations', V: 35 }, { D: 'HR', V: -20 }, { D: 'Finance', V: 15 }, { D: 'Support', V: -30 },
  ];
  const T = { D: 'Category', V: 'Quantity' } as const;

  it('pads the y-range and disables axis clipping so outside labels are not cropped', () => {
    const withLabels = assemblePlotly({
      data: { values: WF }, semantic_types: T,
      chart_spec: { chartType: 'Waterfall Chart', encodings: { x: 'D', y: 'V' }, chartProperties: { showTextLabels: true } },
    } as any);
    // Running-total envelope is [-5, 120]; padded by 15% → below -5 and above 120.
    expect(withLabels.layout.yaxis.range[0]).toBeLessThan(-5);
    expect(withLabels.layout.yaxis.range[1]).toBeGreaterThan(120);
    expect(withLabels.data[0].cliponaxis).toBe(false);
  });

  it('does not pin a range or clip setting when labels are off', () => {
    const noLabels = assemblePlotly({
      data: { values: WF }, semantic_types: T,
      chart_spec: { chartType: 'Waterfall Chart', encodings: { x: 'D', y: 'V' } },
    } as any);
    expect(noLabels.layout.yaxis.range).toBeUndefined();
    expect(noLabels.data[0].cliponaxis).toBeUndefined();
  });
});

describe('Plotly cross-cutting axis properties', () => {
  const PTS = [
    { X: 1, Y: 5 }, { X: 10, Y: 50 }, { X: 100, Y: 500 },
    { X: 1000, Y: 5000 }, { X: 5, Y: 20 }, { X: 50, Y: 200 },
  ];
  const T = { X: 'Quantity', Y: 'Quantity' } as const;

  it('applies log scale to both axes', () => {
    const s = assemblePlotly({
      data: { values: PTS }, semantic_types: T,
      chart_spec: { chartType: 'Scatter Plot', encodings: { x: 'X', y: 'Y' }, chartProperties: { logScale_x: true, logScale_y: true } },
    } as any);
    expect(s.layout.xaxis.type).toBe('log');
    expect(s.layout.yaxis.type).toBe('log');
  });

  it('applies include-zero (rangemode tozero) and never on a category axis', () => {
    const s = assemblePlotly({
      data: { values: PTS }, semantic_types: T,
      chart_spec: { chartType: 'Scatter Plot', encodings: { x: 'X', y: 'Y' }, chartProperties: { includeZero_y: true } },
    } as any);
    expect(s.layout.yaxis.rangemode).toBe('tozero');
  });
});
