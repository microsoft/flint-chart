// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * The `facetColumns` chart property: an interactive control that overrides the
 * auto-computed number of facet columns for a column-wrapped facet. It is a
 * LAYOUT-level option (read raw off chart_spec.chartProperties, honored by
 * every backend's assembler via effectiveOptions.facetColumns) rather than a
 * per-template mark property.
 */

import { describe, it, expect } from 'vitest';
import { assembleVegaLite, assemblePlotly, getChartOptions } from '../src';

const REGIONS = ['N', 'S', 'E', 'W', 'C', 'Co', 'NE', 'SW'];
const MONTHS = ['Jan', 'Feb', 'Mar'];

function facetedRows() {
  const rows: any[] = [];
  for (const r of REGIONS) for (const m of MONTHS) rows.push({ Region: r, Month: m, Sales: 50 });
  return rows;
}

function makeInput(facetColumns?: number) {
  return {
    data: { values: facetedRows() },
    semantic_types: { Region: 'Category', Month: 'Category', Sales: 'Quantity' },
    chart_spec: {
      chartType: 'Bar Chart',
      encodings: { x: 'Month', y: 'Sales', column: 'Region' },
      baseSize: { width: 600, height: 400 },
      ...(facetColumns != null ? { chartProperties: { facetColumns } } : {}),
    },
  } as any;
}

/** Count the distinct facet-column positions in a Plotly figure's xaxis domains. */
function plotlyColumnCount(spec: any): number {
  const lefts = Object.keys(spec.layout)
    .filter((k) => /^xaxis/.test(k))
    .map((k) => spec.layout[k].domain?.[0])
    .filter((v: any) => v != null)
    .map((v: number) => +v.toFixed(3));
  return new Set(lefts).size;
}

describe('facetColumns property', () => {
  it('surfaces as a getChartOptions control for a column-wrapped facet', () => {
    const opt = getChartOptions(makeInput()).find((o) => o.key === 'facetColumns');
    expect(opt).toBeTruthy();
    expect(opt!.applicable).toBe(true);
    expect((opt as any).type).toBe('continuous');
    expect((opt as any).min).toBe(1);
    expect((opt as any).max).toBe(REGIONS.length);
    // Default (no override) seeds from the auto grid — all 8 fit in one row.
    expect(opt!.value).toBe(REGIONS.length);
  });

  it('is NOT offered without a column facet', () => {
    const noFacet = {
      data: { values: [{ Month: 'Jan', Sales: 1 }, { Month: 'Feb', Sales: 2 }] },
      semantic_types: { Month: 'Category', Sales: 'Quantity' },
      chart_spec: { chartType: 'Bar Chart', encodings: { x: 'Month', y: 'Sales' } },
    } as any;
    expect(getChartOptions(noFacet).find((o) => o.key === 'facetColumns')).toBeUndefined();
  });

  it('overrides the Vega-Lite facet column count', () => {
    const auto = assembleVegaLite(makeInput()) as any;
    expect(auto.encoding.facet.columns).toBe(REGIONS.length); // one row

    expect((assembleVegaLite(makeInput(2)) as any).encoding.facet.columns).toBe(2);
    expect((assembleVegaLite(makeInput(3)) as any).encoding.facet.columns).toBe(3);
    // Clamped to the distinct column count.
    expect((assembleVegaLite(makeInput(99)) as any).encoding.facet.columns).toBe(REGIONS.length);
  });

  it('overrides the Plotly facet grid column count (canvas grows with rows)', () => {
    expect(plotlyColumnCount(assemblePlotly(makeInput()))).toBe(REGIONS.length);
    expect(plotlyColumnCount(assemblePlotly(makeInput(2)))).toBe(2);
    expect(plotlyColumnCount(assemblePlotly(makeInput(3)))).toBe(3);
  });
});
