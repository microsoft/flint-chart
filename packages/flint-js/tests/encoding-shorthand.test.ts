// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite } from '../src';
import {
  coerceEncodingValue,
  normalizeEncodingShorthand,
} from '../src/core/static-series';

const DATA = [
  { weight: 1.6, mpg: 32, origin: 'JP' },
  { weight: 2.1, mpg: 27, origin: 'US' },
  { weight: 1.9, mpg: 29, origin: 'EU' },
];
function serializableSpec(spec: unknown): unknown {
  return JSON.parse(JSON.stringify(spec));
}

const SEMANTIC = { weight: 'Quantity', mpg: 'Quantity', origin: 'Country' };

describe('channel field shorthand', () => {
  it('coerceEncodingValue expands a bare string to { field }', () => {
    expect(coerceEncodingValue('weight')).toEqual({ field: 'weight' });
  });

  it('coerceEncodingValue expands strings inside an array (static series)', () => {
    expect(coerceEncodingValue(['sales', 'profit'])).toEqual([
      { field: 'sales' },
      { field: 'profit' },
    ]);
  });

  it('coerceEncodingValue passes through objects and mixed arrays unchanged', () => {
    expect(coerceEncodingValue({ field: 'mpg', type: 'quantitative' })).toEqual({
      field: 'mpg',
      type: 'quantitative',
    });
    expect(coerceEncodingValue([{ field: 'a' }, 'b'])).toEqual([
      { field: 'a' },
      { field: 'b' },
    ]);
  });

  it('normalizeEncodingShorthand mixes shorthand and full encodings', () => {
    expect(
      normalizeEncodingShorthand({ x: 'weight', y: { field: 'mpg' } }),
    ).toEqual({ x: { field: 'weight' }, y: { field: 'mpg' } });
  });

  it('produces an identical spec whether channels use shorthand or { field }', () => {
    const shorthand = assembleVegaLite({
      data: { values: DATA },
      semantic_types: SEMANTIC,
      chart_spec: {
        chartType: 'Scatter Plot',
        encodings: { x: 'weight', y: 'mpg', color: 'origin' },
        baseSize: { width: 400, height: 300 },
      },
    });

    const explicit = assembleVegaLite({
      data: { values: DATA },
      semantic_types: SEMANTIC,
      chart_spec: {
        chartType: 'Scatter Plot',
        encodings: {
          x: { field: 'weight' },
          y: { field: 'mpg' },
          color: { field: 'origin' },
        },
        baseSize: { width: 400, height: 300 },
      },
    });

    expect(serializableSpec(shorthand)).toEqual(serializableSpec(explicit));
  });

  it('supports shorthand strings inside a static-series array', () => {
    const data = [
      { month: 'Jan', sales: 10, profit: 4 },
      { month: 'Feb', sales: 12, profit: 5 },
    ];
    const shorthand = assembleVegaLite({
      data: { values: data },
      semantic_types: { month: 'Month', sales: 'Quantity', profit: 'Quantity' },
      chart_spec: {
        chartType: 'Line Chart',
        encodings: { x: 'month', y: ['sales', 'profit'] },
        baseSize: { width: 400, height: 300 },
      },
    });

    const explicit = assembleVegaLite({
      data: { values: data },
      semantic_types: { month: 'Month', sales: 'Quantity', profit: 'Quantity' },
      chart_spec: {
        chartType: 'Line Chart',
        encodings: {
          x: { field: 'month' },
          y: [{ field: 'sales' }, { field: 'profit' }],
        },
        baseSize: { width: 400, height: 300 },
      },
    });

    expect(serializableSpec(shorthand)).toEqual(serializableSpec(explicit));
  });
});
