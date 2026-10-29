// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// The paper's running example (game × month × region, signed net new users) as a heatmap:
// several rows per cell, a quantized themed key, and a split by region.

import { describe, expect, it } from 'vitest';
import { compile } from 'vega-lite';
import { assembleECharts, assembleVegaLite } from '../src';
import { OMNI_VIZ_GAME_ORDER, OMNI_VIZ_ROWS } from '../src/test-data';

const GAMES = OMNI_VIZ_GAME_ORDER.slice(0, 8) as readonly string[];
const ROWS = OMNI_VIZ_ROWS
  .filter((r) => GAMES.includes(r.game))
  .map(({ period, game, newUsers, region }) => ({ period, game, newUsers, region }));

function heatmap(opts: { color?: Record<string, unknown>; theme?: string; facet?: boolean; semantic?: string } = {}) {
  return {
    data: { values: ROWS },
    semantic_types: { period: 'YearMonth', game: 'Category', newUsers: opts.semantic ?? 'Profit' },
    chart_spec: {
      chartType: 'Heatmap',
      encodings: {
        x: { field: 'period' },
        y: { field: 'game' },
        color: opts.color ?? { field: 'newUsers', aggregate: 'sum' },
        ...(opts.facet ? { column: { field: 'region' } } : {}),
      },
      baseSize: { width: 420, height: 240 },
    },
    ...(opts.theme ? { theme_spec: opts.theme } : {}),
  } as any;
}

function walk(node: any, visit: (n: any) => void): void {
  if (!node || typeof node !== 'object') return;
  visit(node);
  for (const value of Object.values(node)) walk(value, visit);
}

describe('several rows per heatmap cell', () => {
  it('sums an additive measure and warns', () => {
    const vl = assembleVegaLite(heatmap({ color: { field: 'newUsers' } })) as any;
    expect(vl.data.values).toHaveLength(96);
    expect(vl.encoding.color.field).toBe('newUsers_sum');
    expect(vl._warnings.map((w: any) => w.code)).toContain('implicit-aggregate');
  });

  it('averages a measure that does not add up', () => {
    const vl = assembleVegaLite(heatmap({ color: { field: 'newUsers' }, semantic: 'Temperature' })) as any;
    expect(vl.encoding.color.field).toBe('newUsers_average');
  });

  it('leaves an explicit aggregate alone, without a warning', () => {
    const vl = assembleVegaLite(heatmap()) as any;
    expect((vl._warnings ?? []).map((w: any) => w.code)).not.toContain('implicit-aggregate');
  });

  it('aggregates on the other backends too', () => {
    const ec = assembleECharts(heatmap({ color: { field: 'newUsers' } })) as any;
    expect(ec._warnings.map((w: any) => w.code)).toContain('implicit-aggregate');
  });
});

describe('aggregated titles', () => {
  it('names the operation and the field', () => {
    const vl = assembleVegaLite(heatmap()) as any;
    expect(vl.encoding.color.title).toBe('Sum of newUsers');
  });

  it('uses the display name', () => {
    const vl = assembleVegaLite({ ...heatmap(), field_display_names: { newUsers: 'Net new users' } }) as any;
    expect(vl.encoding.color.title).toBe('Sum of Net new users');
  });
});

describe('calendar dates read as UTC', () => {
  it('draws a whole run of months as equal cells named by the calendar', () => {
    const vl = assembleVegaLite(heatmap()) as any;
    expect(vl.encoding.x.type).toBe('ordinal');
    expect(vl.encoding.x.sort).toEqual([...new Set(ROWS.map((r) => r.period))].sort());
    expect(vl.config.axisX.labelExpr).toContain('"Jan"');
    expect(vl._options.find((o: any) => o.key === 'xAxisType')).toMatchObject({ applicable: true, value: 'nominal' });
  });

  it('describes each cell on its own month, west of UTC too', () => {
    const input = heatmap();
    input.chart_spec.chartProperties = { xAxisType: 'temporal' };
    const vl = assembleVegaLite(input) as any;
    expect(vl.encoding.x.scale.type).toBe('utc');
    const marks = JSON.stringify((compile(vl).spec as any).marks);
    const description = marks.slice(marks.indexOf('"description"'), marks.indexOf('"description"') + 300);
    expect(description).toContain('utcFormat');
    expect(description).not.toContain('timeFormat(');
  });
});

describe('quantized key under a theme', () => {
  it('runs long enough to print every bin edge', () => {
    const vl = assembleVegaLite(heatmap({ theme: 'economist' })) as any;
    expect(vl.encoding.color.scale.type).toBe('quantize');
    const bins = vl.encoding.color.scale.range.length;
    // Each of the edges needs room for a label like "−32,341" at the key's font.
    const perLabel = 7 * 0.55 * vl.config.legend.labelFontSize;
    expect(vl.config.legend.gradientLength).toBeGreaterThanOrEqual(bins * perLabel);
  });
});

describe('split by region', () => {
  it('keeps axis labels at the theme minimum or above', () => {
    const vl = assembleVegaLite(heatmap({ theme: 'economist', facet: true })) as any;
    const sizes: number[] = [];
    walk(vl, (n) => { if (typeof n.labelFontSize === 'number') sizes.push(n.labelFontSize); });
    expect(vl.config.axisX.labelFontSize).toBeGreaterThanOrEqual(8);
    expect(vl.config.axisY.labelFontSize).toBeGreaterThanOrEqual(8);
    expect(sizes.length).toBeGreaterThan(0);
  });
});
