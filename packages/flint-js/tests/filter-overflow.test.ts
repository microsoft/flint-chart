// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it } from 'vitest';
import { applyCategoryViewports, filterOverflow, resolveCategoryViewport } from '../src/core/filter-overflow';
import type { ChannelSemantics, ChartEncoding } from '../src/core/types';

const budgets = { maxValues: { x: 3 } };
const marks = new Set(['bar']);
const annotation = { semanticType: 'Category' };

function keptCategories(
  data: Array<{ Category: string; Value: number }>,
  categorySemantics: Omit<ChannelSemantics, 'semanticAnnotation'>,
  categoryEncoding: ChartEncoding,
): string[] {
  const result = filterOverflow(
    {
      x: { semanticAnnotation: annotation, ...categorySemantics },
      y: { field: 'Value', type: 'quantitative', semanticAnnotation: { semanticType: 'Quantity' } },
    },
    { axisFlags: { x: { banded: true } } },
    {
      x: categoryEncoding,
      y: { field: 'Value' },
    },
    data,
    budgets,
    marks,
  );
  return result.truncations[0].keptValues as string[];
}

describe('overflow category selection', () => {
  it('preserves encounter order when no sort is selected', () => {
    const data = [
      { Category: 'Delta', Value: 100 },
      { Category: 'Alpha', Value: 1 },
      { Category: 'Charlie', Value: 80 },
      { Category: 'Bravo', Value: 50 },
    ];

    expect(keptCategories(
      data,
      { field: 'Category', type: 'nominal' },
      { field: 'Category' },
    )).toEqual(['Delta', 'Alpha', 'Charlie']);
  });

  it('uses canonical semantic order when available', () => {
    const data = [
      { Category: 'Mar', Value: 100 },
      { Category: 'Jan', Value: 1 },
      { Category: 'Apr', Value: 80 },
      { Category: 'Feb', Value: 50 },
    ];

    expect(keptCategories(
      data,
      { field: 'Category', type: 'ordinal', ordinalSortOrder: ['Jan', 'Feb', 'Mar', 'Apr'] },
      { field: 'Category' },
    )).toEqual(['Jan', 'Feb', 'Mar']);
  });

  it('uses an explicitly selected value sort', () => {
    const data = [
      { Category: 'Delta', Value: 100 },
      { Category: 'Alpha', Value: 1 },
      { Category: 'Charlie', Value: 80 },
      { Category: 'Bravo', Value: 50 },
    ];

    expect(keptCategories(
      data,
      { field: 'Category', type: 'nominal' },
      { field: 'Category', sortBy: 'y', sortOrder: 'descending' },
    )).toEqual(['Delta', 'Charlie', 'Bravo']);
  });

  it('retains the complete ordered domain for an interactive viewport', () => {
    const data = [
      { Category: 'Delta', Value: 100 },
      { Category: 'Alpha', Value: 1 },
      { Category: 'Charlie', Value: 80 },
      { Category: 'Bravo', Value: 50 },
    ];

    const result = filterOverflow(
      {
        x: { field: 'Category', type: 'nominal', semanticAnnotation: annotation },
        y: { field: 'Value', type: 'quantitative', semanticAnnotation: { semanticType: 'Quantity' } },
      },
      { axisFlags: { x: { banded: true } } },
      {
        x: { field: 'Category', sortBy: 'y', sortOrder: 'descending' },
        y: { field: 'Value' },
      },
      data,
      budgets,
      marks,
    );

    expect(result.viewports).toEqual([{
      channel: 'x',
      field: 'Category',
      orderedValues: ['Delta', 'Charlie', 'Bravo', 'Alpha'],
      visibleCount: 3,
      totalCount: 4,
    }]);
    expect(resolveCategoryViewport(result.viewports[0], 99)).toEqual({
      start: 1,
      end: 4,
      values: ['Charlie', 'Bravo', 'Alpha'],
    });
    expect(applyCategoryViewports(data, result.viewports, { x: 1 }))
      .toEqual([data[1], data[2], data[3]]);
  });
});
