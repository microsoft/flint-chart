// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleCanvasXpress } from '../src';
import { genStreamgraphTests } from '../src/test-data';
import type { TestCase } from '../src/test-data/types';

/**
 * CanvasXpress Streamgraph. The engine rewrites `graphType: 'Streamgraph'` to
 * Scatter2D + scatterType 'stream', which reads LONG-format data (one `vars` row
 * per observation, `[xField, yField]` as `smps`, `[x, y]` per row, the group as a
 * per-variable `z` annotation + `colorBy`). The Area y-matrix shape rendered blank;
 * these assert the long shape and the x-axis numeric handling.
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
    chart_spec: { chartType: tc.chartType, encodings, baseSize: { width: 676, height: 436 } },
  } as any;
}

const byTitle = (tcs: TestCase[], title: string) => tcs.find((t) => t.title === title)!;

describe('CanvasXpress Streamgraph — long-format scatter shape', () => {
  const tc = byTitle(genStreamgraphTests(), 'T×Q +color(N,5) (200 pts)');
  const spec = assembleCanvasXpress(toInput(tc)) as any;

  it('emits Scatter2D-stream long data, not an area y-matrix', () => {
    expect(spec.config.graphType).toBe('Streamgraph');
    expect(spec.config.scatterType).toBe('stream');
    // smps are the TWO measured columns; one vars row per observation,
    // with the data and the group annotation all the same length.
    expect(spec.data.y.smps).toEqual(['Date', 'Value']);
    expect(spec.data.y.data[0]).toHaveLength(2);
    expect(spec.data.y.vars).toHaveLength(spec.data.y.data.length);
    expect(spec.data.z.Series).toHaveLength(spec.data.y.data.length);
  });

  it('groups the bands by the colour field via a per-variable z annotation', () => {
    expect(spec.config.colorBy).toBe('Series');
    expect(spec.config.xAxis).toEqual(['Date']);
    expect(spec.config.yAxis).toEqual(['Value']);
  });

  it('parses a temporal x to epoch with a time axis', () => {
    expect(spec.config.xAxisTime).toBe(true);
    // Every x is a finite epoch number.
    expect(spec.data.y.data.every((row: any[]) => Number.isFinite(row[0]))).toBe(true);
  });
});

describe('CanvasXpress Streamgraph — numeric (year) x', () => {
  const tc = byTitle(genStreamgraphTests(), 'World population by region, 1950–2020');
  const spec = assembleCanvasXpress(toInput(tc)) as any;

  it('keeps a numeric year axis as real numbers (no time axis)', () => {
    expect(spec.config.scatterType).toBe('stream');
    expect(spec.config.xAxisTime).toBeUndefined();
    // Years stay the literal numbers, not epoch.
    const xs = spec.data.y.data.map((r: any[]) => r[0]);
    expect(Math.min(...xs)).toBe(1950);
    expect(Math.max(...xs)).toBe(2020);
  });

  it('densifies the sparse 5-year data so the stream bands stay continuous', () => {
    // 25 raw rows (5 regions × 5 decades) would zero-pad the engine grid and
    // taper to nothing between points; densified to a fine per-group grid.
    expect(spec.data.y.data.length).toBeGreaterThan(tc.data.length);
    const perGroup = new Map<string, number>();
    for (const g of spec.data.z.Region) perGroup.set(g, (perGroup.get(g) ?? 0) + 1);
    // Every region gets the same dense grid (≥ 40 points, the continuity floor).
    for (const n of perGroup.values()) expect(n).toBeGreaterThanOrEqual(40);
  });
});

describe('Streamgraph gallery examples all assemble to a stream', () => {
  for (const tc of genStreamgraphTests()) {
    it(tc.title, () => {
      const spec = assembleCanvasXpress(toInput(tc)) as any;
      expect(spec.config.scatterType).toBe('stream');
      expect(spec.data.y.smps).toHaveLength(2);
      expect(spec.data.y.vars.length).toBeGreaterThan(0);
    });
  }
});
