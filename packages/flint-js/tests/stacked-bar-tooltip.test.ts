// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it } from 'vitest';
import { compile } from 'vega-lite';
import { assembleVegaLite } from '../src';

function compiledTooltips(node: any): any[] {
  if (!node || typeof node !== 'object') return [];
  const current = node.encode?.update?.tooltip ? [node.encode.update.tooltip] : [];
  return [
    ...current,
    ...Object.values(node).flatMap((value) => compiledTooltips(value)),
  ];
}

describe('Stacked Bar Chart tooltips', () => {
  it('shows authored fields and display names without generated stack-order fields', () => {
    const spec = assembleVegaLite({
      data: {
        values: [
          { country: 'France', share: 65, source: 'Nuclear' },
          { country: 'France', share: 27, source: 'Renewables' },
          { country: 'China', share: 62, source: 'Fossil' },
        ],
      },
      semantic_types: { country: 'Country', share: 'Quantity', source: 'Category' },
      chart_spec: {
        chartType: 'Stacked Bar Chart',
        encodings: { x: 'country', y: 'share', color: 'source' },
      },
      field_display_names: {
        country: 'Country',
        share: 'Energy share',
        source: 'Source',
      },
    } as never) as any;

    expect(spec.encoding.tooltip).toEqual([
      { field: 'country', type: 'nominal', title: 'Country' },
      { field: 'share', type: 'quantitative', title: 'Energy share' },
      { field: 'source', type: 'nominal', title: 'Source' },
    ]);
    expect(JSON.stringify(spec.encoding.tooltip)).not.toContain('sort_index');

    const tooltips = compiledTooltips(compile(spec).spec);
    expect(tooltips.length).toBeGreaterThan(0);
    expect(JSON.stringify(tooltips)).toContain('Energy share');
    expect(JSON.stringify(tooltips)).not.toContain('sort_index');
  });
});