// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import type { ChartAssemblyInput } from 'flint-chart';
import { buildPanelModel, setProperty, withTheme } from '../ui/src/options.js';

/** A two-series line chart — the shape the NYT house puts points on. */
const lines: ChartAssemblyInput = {
  data: {
    values: [
      { month: '2024-01-01', sales: 3, region: 'North' },
      { month: '2024-02-01', sales: 5, region: 'North' },
      { month: '2024-03-01', sales: 4, region: 'North' },
      { month: '2024-01-01', sales: 2, region: 'South' },
      { month: '2024-02-01', sales: 6, region: 'South' },
      { month: '2024-03-01', sales: 7, region: 'South' },
    ],
  },
  semantic_types: { month: 'Date', sales: 'Quantity', region: 'Category' },
  chart_spec: {
    chartType: 'Line Chart',
    encodings: { x: { field: 'month' }, y: { field: 'sales' }, color: { field: 'region' } },
    title: 'Sales by region',
  },
};

function optionValue(input: ChartAssemblyInput, key: string): unknown {
  return buildPanelModel(input).properties.find((option) => option.key === key)?.value;
}

describe('house defaults reach the options bar', () => {
  it('shows the house\'s own value for a property nobody has set', () => {
    expect(optionValue(lines, 'showPoints')).toBe(false);
    expect(optionValue(withTheme(lines, 'nyt'), 'showPoints')).toBe(true);
  });

  it('keeps a value that disagrees with the house it was set under', () => {
    const nyt = withTheme(lines, 'nyt');
    const off = setProperty(nyt, 'showPoints', false);
    // Said against a house that wanted points — a decision, and it survives.
    expect(optionValue(withTheme(off, 'economist'), 'showPoints')).toBe(false);
  });

  it('lets go of a value that only echoed the house it was set under', () => {
    // Toggled on and back off under flint: the result says nothing flint had
    // not already said, so it must not outrank the next house.
    const fiddled = setProperty(lines, 'showPoints', false);
    expect(optionValue(fiddled, 'showPoints')).toBe(false);
    expect(optionValue(withTheme(fiddled, 'nyt'), 'showPoints')).toBe(true);
  });

  it('does not disturb properties the reader never touched', () => {
    const themed = withTheme(setProperty(lines, 'interpolate', 'monotone'), 'nyt');
    expect(optionValue(themed, 'interpolate')).toBe('monotone');
    expect(optionValue(themed, 'showPoints')).toBe(true);
  });

  it('leaves the input alone', () => {
    const before = JSON.stringify(lines);
    withTheme(setProperty(lines, 'showPoints', false), 'nyt');
    expect(JSON.stringify(lines)).toBe(before);
  });
});
