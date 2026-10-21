// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite } from '../src';

/**
 * Regression: dodging over years. A run of `Year` values stays temporal by
 * semantics, but bar and box templates force the x axis to bands. The dodge
 * must still subdivide each year, not each measure value: planning and laning
 * by the y field put bars that share a value in one lane group and collapsed
 * the rest to zero width.
 */

const years = Array.from({ length: 12 }, (_, i) => String(2010 + i));

function yearInput(
  chartType: string,
  seriesChannel: 'group' | 'color',
  rows: { x: string; series: string; y: number }[],
  chartProperties?: Record<string, unknown>,
) {
  return {
    data: { values: rows },
    semantic_types: { x: 'Year', y: 'Quantity', series: 'Category' },
    chart_spec: {
      chartType,
      encodings: { x: { field: 'x' }, y: { field: 'y' }, [seriesChannel]: { field: 'series' } },
      baseSize: { width: 500, height: 320 },
      ...(chartProperties ? { chartProperties } : {}),
    },
  };
}

/** Two of four series per year, so a local dodge differs from a global one. */
function sparseRows(perPair = 1) {
  const series = ['a', 'b', 'c', 'd'];
  return years.flatMap((x, i) => [series[i % 4], series[(i + 1) % 4]].flatMap((s, j) =>
    Array.from({ length: perPair }, (_, k) => ({ x, series: s, y: 1 + ((i * 3 + j * 2 + k * 5) % 20) }))));
}

const laneGroupbys = (spec: any) =>
  (spec.transform ?? [])
    .filter((t: any) => t.window?.some((w: any) => w.as === '__laneIdx') || t.joinaggregate?.some((j: any) => j.as === '__localCount'))
    .map((t: any) => t.groupby);

const dodgeOption = (spec: any) => spec._options.find((o: any) => o.key === 'dodge');

describe('grouped bar over years', () => {
  it('dodges every year by its series when each year has every series', () => {
    const rows = years.flatMap((x, i) =>
      ['before', 'after', 'p95'].map((series, j) => ({ x, series, y: 1 + ((i * 3 + j * 2) % 20) })));
    const spec = assembleVegaLite(yearInput('Grouped Bar Chart', 'group', rows)) as any;

    expect(laneGroupbys(spec)).toEqual([]);
    expect(spec.encoding.xOffset).toMatchObject({ field: 'series', type: 'nominal' });
    expect(dodgeOption(spec).applicable).toBe(false);
  });

  it('lanes a local dodge within each year', () => {
    const spec = assembleVegaLite(yearInput('Grouped Bar Chart', 'group', sparseRows(), { dodge: 'local' })) as any;

    expect(laneGroupbys(spec)).toEqual([['x'], ['x']]);
    expect(spec.encoding.xOffset.field).toBe('__off');
  });
});

describe('boxplot over years', () => {
  it('offers the dodge choice when years hold different series', () => {
    const spec = assembleVegaLite(yearInput('Boxplot', 'color', sparseRows(8))) as any;

    expect(dodgeOption(spec)).toMatchObject({ applicable: true, value: 'local' });
  });
});
