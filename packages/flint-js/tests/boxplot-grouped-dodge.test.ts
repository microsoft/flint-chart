// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite, assembleECharts } from '../src';

/**
 * Regression: a boxplot with a color field subdividing a categorical axis must
 * dodge the boxes side-by-side (xOffset), not overlay them at the same x
 * position. Overlaid boxes hide whichever group is drawn first, so a grouped
 * boxplot looked like a single mis-coloured box per category.
 */

function makeGroupedBoxplotInput(
  categories: string[],
  groups: string[],
  axis: 'x' | 'y' = 'x',
) {
  let seed = 7;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x7fffffff;
  };
  const data: any[] = [];
  for (const c of categories) {
    for (const g of groups) {
      for (let i = 0; i < 20; i++) {
        data.push({ Category: c, Group: g, Score: Math.round(rnd() * 100) });
      }
    }
  }
  const catEnc = { field: 'Category' };
  const valEnc = { field: 'Score' };
  return {
    data: { values: data },
    semantic_types: { Category: 'Category', Group: 'Category', Score: 'Quantity' },
    chart_spec: {
      chartType: 'Boxplot',
      encodings:
        axis === 'x'
          ? { x: catEnc, y: valEnc, color: { field: 'Group' } }
          : { y: catEnc, x: valEnc, color: { field: 'Group' } },
      baseSize: { width: 500, height: 320 },
    },
  };
}

describe('grouped boxplot dodging', () => {
  it('adds an xOffset on the color field so boxes dodge on a categorical x-axis', () => {
    const spec = assembleVegaLite(
      makeGroupedBoxplotInput(['Electronics', 'Clothing', 'Food'], ['Male', 'Female']),
    ) as any;
    expect(spec.encoding?.xOffset?.field).toBe('Group');
    expect(spec.encoding?.color?.field).toBe('Group');
    expect(spec.encoding?.yOffset).toBeUndefined();
  });

  const sizeOf = (s: any) => (typeof s.mark === 'object' ? s.mark.size : undefined);
  const stepOf = (s: any) => Number(s.width?.step ?? s.height?.step);
  // Vega-Lite's position band scale reserves ~20% of each step as padding, so a
  // band's usable drawing width is ~80% of the step. The per-subgroup lane pitch
  // is therefore (step * 0.8) / subgroups — a box wider than this overlaps its
  // neighbour inside the same group.
  const lanePitch = (s: any, subgroups: number) => (stepOf(s) * 0.8) / subgroups;

  it('fills most of each per-subgroup lane without overlapping its neighbour', () => {
    // With colorActsAsGroup, `width:{step, for:'position'}` makes the step span a
    // whole category band that Vega-Lite subdivides into one lane per subgroup.
    // A dodged box must fill most of its lane pitch but stay within it, otherwise
    // adjacent boxes in a group overlap.
    const subgroups = 2;
    const grouped = assembleVegaLite(
      makeGroupedBoxplotInput(['Electronics', 'Clothing', 'Food'], ['Male', 'Female']),
    ) as any;
    const pitch = lanePitch(grouped, subgroups);
    expect(sizeOf(grouped) / pitch).toBeGreaterThanOrEqual(0.75);
    expect(sizeOf(grouped)).toBeLessThan(pitch);
  });

  it('shrinks the boxes as the subgroup count grows (chart stays compact)', () => {
    // The band step is budgeted across categories, so adding more color groups
    // must make each box thinner rather than ballooning the chart width.
    const two = assembleVegaLite(
      makeGroupedBoxplotInput(['A', 'B', 'C', 'D'], ['G1', 'G2']),
    ) as any;
    const four = assembleVegaLite(
      makeGroupedBoxplotInput(['A', 'B', 'C', 'D'], ['G1', 'G2', 'G3', 'G4']),
    ) as any;
    // Boxes get thinner with more subgroups.
    expect(sizeOf(four)).toBeLessThan(sizeOf(two));
    // The band step grows sub-linearly with subgroups (budgeted across
    // categories), so the chart stays compact instead of ballooning per lane.
    expect(stepOf(four)).toBeLessThan(stepOf(two) * 2);
    // Each sub-lane (and thus each box) shrinks as subgroups are added.
    expect(stepOf(four) / 4).toBeLessThan(stepOf(two) / 2);
    // Boxes never exceed their lane pitch (no within-group overlap) yet still
    // fill most of it at both subgroup counts.
    expect(sizeOf(two)).toBeLessThan(lanePitch(two, 2));
    expect(sizeOf(four)).toBeLessThan(lanePitch(four, 4));
    expect(sizeOf(two) / lanePitch(two, 2)).toBeGreaterThanOrEqual(0.75);
    expect(sizeOf(four) / lanePitch(four, 4)).toBeGreaterThanOrEqual(0.75);
  });

  it('uses yOffset when the categorical axis is y (horizontal boxplot)', () => {
    const spec = assembleVegaLite(
      makeGroupedBoxplotInput(['Electronics', 'Clothing', 'Food'], ['Male', 'Female'], 'y'),
    ) as any;
    expect(spec.encoding?.yOffset?.field).toBe('Group');
    expect(spec.encoding?.xOffset).toBeUndefined();
  });

  it('does not add an offset when there is no color field', () => {
    const spec = assembleVegaLite({
      data: { values: [{ Category: 'A', Score: 1 }, { Category: 'B', Score: 2 }] },
      semantic_types: { Category: 'Category', Score: 'Quantity' },
      chart_spec: {
        chartType: 'Boxplot',
        encodings: { x: { field: 'Category' }, y: { field: 'Score' } },
        baseSize: { width: 500, height: 320 },
      },
    } as any) as any;
    expect(spec.encoding?.xOffset).toBeUndefined();
    expect(spec.encoding?.yOffset).toBeUndefined();
  });
});

/**
 * Regression: a boxplot whose `color` is redundant/nested with its categorical
 * axis (`color == x`, or a 1:1 different-field pair) must NOT dodge — every box
 * fills its whole band. Previously the template dodged by the global distinct
 * color count, collapsing each box to ~1/N of the band. Genuine second
 * dimensions (including sparse cross-products) must still dodge, sized by the
 * global lane count.
 */
describe('boxplot color redundant with axis (no dodge)', () => {
  const sizeOf = (s: any) => (typeof s.mark === 'object' ? s.mark.size : undefined);
  const stepOf = (s: any) => Number(s.width?.step ?? s.height?.step);

  function boxplotInput(rows: any[], types: Record<string, string>, color?: string) {
    const encodings: any = { x: { field: 'Cat' }, y: { field: 'Val' } };
    if (color) encodings.color = { field: color };
    return {
      data: { values: rows },
      semantic_types: types,
      chart_spec: { chartType: 'Boxplot', encodings, baseSize: { width: 500, height: 320 } },
    } as any;
  }

  it('color == x → no offset, full-width boxes', () => {
    const cats = ['G', 'PG', 'PG-13', 'R', 'Other', 'Unknown'];
    const rows: any[] = [];
    for (const c of cats) for (let i = 0; i < 20; i++) rows.push({ Cat: c, Val: i + (c.length * 3) });
    const spec = assembleVegaLite(
      boxplotInput(rows, { Cat: 'Category', Val: 'Quantity' }, 'Cat'),
    ) as any;
    expect(spec.encoding?.xOffset).toBeUndefined();
    expect(spec.encoding?.yOffset).toBeUndefined();
    // Full-width box (~band·0.7), not a ~band/6 sliver.
    expect(sizeOf(spec)).toBeGreaterThan(stepOf(spec) * 0.5);
  });

  it('1:1 different field (code ↔ name) → no offset, full-width boxes', () => {
    const pairs = [['US', 'United States'], ['CA', 'Canada'], ['MX', 'Mexico'], ['BR', 'Brazil']];
    const rows: any[] = [];
    for (const [code, name] of pairs) for (let i = 0; i < 20; i++) rows.push({ Cat: code, Name: name, Val: i });
    const spec = assembleVegaLite({
      data: { values: rows },
      semantic_types: { Cat: 'Category', Name: 'Category', Val: 'Quantity' },
      chart_spec: {
        chartType: 'Boxplot',
        encodings: { x: { field: 'Cat' }, y: { field: 'Val' }, color: { field: 'Name' } },
        baseSize: { width: 500, height: 320 },
      },
    } as any) as any;
    expect(spec.encoding?.xOffset).toBeUndefined();
    expect(sizeOf(spec)).toBeGreaterThan(stepOf(spec) * 0.5);
  });

  it('sparse cross-product (dept × level) → auto: local (compact, centered)', () => {
    // 6 departments, 5 global levels, but each dept holds only 2 of them.
    const depts = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'];
    const levelPairs = [
      ['L1', 'L2'], ['L2', 'L3'], ['L3', 'L4'], ['L4', 'L5'], ['L5', 'L1'], ['L1', 'L3'],
    ];
    const rows: any[] = [];
    depts.forEach((d, di) => {
      for (const lv of levelPairs[di]) for (let i = 0; i < 20; i++) rows.push({ Cat: d, Level: lv, Val: i });
    });
    const input = {
      data: { values: rows },
      semantic_types: { Cat: 'Category', Level: 'Category', Val: 'Quantity' },
      chart_spec: {
        chartType: 'Boxplot',
        encodings: { x: { field: 'Cat' }, y: { field: 'Val' }, color: { field: 'Level' } },
        baseSize: { width: 700, height: 320 },
      } as any,
    };
    // Auto → local: centered quantitative offset + the computed transforms.
    const local = assembleVegaLite(input as any) as any;
    const boxLayer = local.layer?.find((layer: any) => layer.mark?.type === 'boxplot');
    const separatorLayer = local.layer?.find((layer: any) => layer.mark?.type === 'rule');
    expect(boxLayer?.encoding?.xOffset?.field).toBe('__off');
    expect(boxLayer?.transform?.some((t: any) => t.as === '__off')).toBe(true);
    expect(separatorLayer?.mark?.strokeDash).toEqual([4, 4]);
    expect(separatorLayer?.encoding?.x?.bandPosition).toBe(1);
    expect(separatorLayer?.encoding?.x?.axis).not.toBeNull();
    expect(separatorLayer?.data?.values).toHaveLength(depts.length - 1);

    // Forced global → the fixed per-color lane grid, sized to the 5 global lanes.
    input.chart_spec.chartProperties = { dodge: 'global' };
    const global = assembleVegaLite(input as any) as any;
    expect(global.encoding?.xOffset?.field).toBe('Level');
    expect(global.encoding?.x?.axis?.tickBand).toBeUndefined();
    const fiveLanePitch = (stepOf(global) * 0.8) / 5;
    expect(sizeOf(global)).toBeLessThanOrEqual(fiveLanePitch);
  });
});

/**
 * ECharts parity: `color == x` must render a SINGLE boxplot series (not one
 * series per color), which also avoids the degenerate [0,0,0,0,0] zero-boxes a
 * per-color series would draw in every empty (category, color) cell.
 */
describe('ECharts boxplot color redundant with axis', () => {
  it('color == x → one boxplot series, no zero-box data', () => {
    const cats = ['G', 'PG', 'PG-13', 'R', 'Other', 'Unknown'];
    const rows: any[] = [];
    for (const c of cats) for (let i = 0; i < 20; i++) rows.push({ Cat: c, Val: i + c.length });
    const option = assembleECharts({
      data: { values: rows },
      semantic_types: { Cat: 'Category', Val: 'Quantity' },
      chart_spec: {
        chartType: 'Boxplot',
        encodings: { x: { field: 'Cat' }, y: { field: 'Val' }, color: { field: 'Cat' } },
        baseSize: { width: 500, height: 320 },
      },
    } as any) as any;
    const boxSeries = (option.series || []).filter((s: any) => s.type === 'boxplot');
    expect(boxSeries.length).toBe(1);
    // No degenerate all-zero five-number summaries.
    for (const s of boxSeries) {
      for (const d of s.data as any[]) {
        if (Array.isArray(d)) expect(d.every((v: number) => v === 0)).toBe(false);
      }
    }
  });
});

describe('ECharts sparse grouped boxplot', () => {
  const sparseInput = (dodge: 'global' | 'local') => {
    const groups: Record<string, string[]> = {
      A: ['G1', 'G2'], B: ['G2'], C: ['G3', 'G4'], D: ['G4', 'G1'],
    };
    const rows: any[] = [];
    for (const [category, presentGroups] of Object.entries(groups)) {
      for (const group of presentGroups) {
        for (let index = 0; index < 8; index++) {
          rows.push({ Category: category, Group: group, Score: index === 7 ? 100 : index + 1 });
        }
      }
    }
    return {
      data: { values: rows },
      semantic_types: { Category: 'Category', Group: 'Category', Score: 'Quantity' },
      chart_spec: {
        chartType: 'Boxplot',
        encodings: { x: 'Category', y: 'Score', color: 'Group' },
        chartProperties: { dodge },
        baseSize: { width: 500, height: 320 },
      },
    } as any;
  };

  it.each(['global', 'local'] as const)('uses ECharts missing-value sentinels for %s dodge gaps', (dodge) => {
    const option = assembleECharts(sparseInput(dodge)) as any;
    const cells = option.series
      .filter((series: any) => series.type === 'boxplot')
      .flatMap((series: any) => series.data);

    expect(cells).toContain('-');
    expect(cells).not.toContain(null);
  });

  it('offsets global outliers onto their boxplot lane', () => {
    const option = assembleECharts(sparseInput('global')) as any;
    const outliers = option.series.find((series: any) => series.name === 'G1 (points)');
    expect(outliers?.type).toBe('custom');

    const api = {
      value: (index: number) => [0, 100][index],
      coord: ([category, value]: number[]) => [category * 100 + 50, 300 - value],
      size: () => [100, 0],
      visual: () => '#5470c6',
    };
    const rendered = outliers.renderItem({}, api);
    expect(rendered.shape.cx).toBeLessThan(50);
    expect(rendered.shape.cy).toBe(200);
  });

  it('adds dashed category separators only for local dodge', () => {
    const local = assembleECharts(sparseInput('local')) as any;
    const separators = local.series.find((series: any) => series.name === '__groupSeparators');
    expect(separators?.type).toBe('custom');
    expect(separators.data).toHaveLength(local.xAxis.data.length - 1);

    const rendered = separators.renderItem(
      { coordSys: { x: 10, y: 20, width: 400, height: 200 } },
      {
        value: () => 0,
        coord: ([category]: number[]) => [50 + category * 100, 100],
      },
    );
    expect(rendered.shape).toEqual({ x1: 100, y1: 20, x2: 100, y2: 220 });
    expect(rendered.style.lineDash).toEqual([4, 4]);

    const global = assembleECharts(sparseInput('global')) as any;
    expect(global.series.some((series: any) => series.name === '__groupSeparators')).toBe(false);
  });
});

/**
 * Grouped bar generalization: a `group` field that is redundant/nested with the
 * categorical axis (group == x, or a 1:1 pair) must NOT dodge — otherwise every
 * bar collapses to ~1/N of its band. Genuine grouped bars are untouched.
 */
describe('grouped bar group redundant with axis (no dodge)', () => {
  function groupedBarInput(rows: any[], types: Record<string, string>, group: string) {
    return {
      data: { values: rows },
      semantic_types: types,
      chart_spec: {
        chartType: 'Grouped Bar Chart',
        encodings: { x: { field: 'Cat' }, y: { field: 'Val' }, group: { field: group } },
        baseSize: { width: 500, height: 320 },
      },
    } as any;
  }

  it('group == x → no xOffset dodge', () => {
    const cats = ['A', 'B', 'C', 'D'];
    const rows = cats.map((c, i) => ({ Cat: c, Val: (i + 1) * 10 }));
    const spec = assembleVegaLite(
      groupedBarInput(rows, { Cat: 'Category', Val: 'Quantity' }, 'Cat'),
    ) as any;
    expect(spec.encoding?.xOffset).toBeUndefined();
    expect(spec.encoding?.yOffset).toBeUndefined();
  });

  it('1:1 different field group → no xOffset dodge', () => {
    const pairs = [['A', 'Alpha'], ['B', 'Beta'], ['C', 'Gamma']];
    const rows = pairs.map(([c, g], i) => ({ Cat: c, Grp: g, Val: (i + 1) * 5 }));
    const spec = assembleVegaLite(
      groupedBarInput(rows, { Cat: 'Category', Grp: 'Category', Val: 'Quantity' }, 'Grp'),
    ) as any;
    expect(spec.encoding?.xOffset).toBeUndefined();
  });

  it('genuine group (x × group cross-product) still dodges', () => {
    const cats = ['A', 'B', 'C'];
    const grps = ['G1', 'G2'];
    const rows: any[] = [];
    for (const c of cats) for (const g of grps) rows.push({ Cat: c, Grp: g, Val: c.charCodeAt(0) + g.length });
    const spec = assembleVegaLite(
      groupedBarInput(rows, { Cat: 'Category', Grp: 'Category', Val: 'Quantity' }, 'Grp'),
    ) as any;
    expect(spec.encoding?.xOffset?.field).toBe('Grp');
  });

  it('sparse / middle case (each band has a SUBSET of groups) → local (compact) dodge', () => {
    // 4 global groups, each category holds only 2 of them → maxPerBand 2,
    // global 4 (sparse). Auto → local: a compact per-band lane index rather
    // than the full global grid.
    const cats = ['A', 'B', 'C', 'D'];
    const subset: Record<string, string[]> = {
      A: ['G1', 'G2'], B: ['G2', 'G3'], C: ['G3', 'G4'], D: ['G4', 'G1'],
    };
    const rows: any[] = [];
    for (const c of cats) for (const g of subset[c]) rows.push({ Cat: c, Grp: g, Val: c.charCodeAt(0) + g.length });
    const spec = assembleVegaLite(
      groupedBarInput(rows, { Cat: 'Category', Grp: 'Category', Val: 'Quantity' }, 'Grp'),
    ) as any;
    // Local dodge → centered per-band quantitative offset + the window/calc
    // transforms that compute it.
    expect(spec.encoding?.xOffset?.field).toBe('__off');
    expect(spec.transform?.some((t: any) => t.window?.[0]?.as === '__laneIdx')).toBe(true);
    expect(spec.transform?.some((t: any) => t.as === '__off')).toBe(true);
  });

  it('sparse grouped bar forced to global keeps the group field offset', () => {
    const cats = ['A', 'B', 'C', 'D'];
    const subset: Record<string, string[]> = {
      A: ['G1', 'G2'], B: ['G2', 'G3'], C: ['G3', 'G4'], D: ['G4', 'G1'],
    };
    const rows: any[] = [];
    for (const c of cats) for (const g of subset[c]) rows.push({ Cat: c, Grp: g, Val: c.charCodeAt(0) + g.length });
    const input = groupedBarInput(rows, { Cat: 'Category', Grp: 'Category', Val: 'Quantity' }, 'Grp');
    input.chart_spec.chartProperties = { dodge: 'global' };
    const spec = assembleVegaLite(input) as any;
    expect(spec.encoding?.xOffset?.field).toBe('Grp');
  });

  it('local dodge with one value per band auto-resolves to one-per-band (no offset)', () => {
    // Grp is 1:1 with Cat → maxPerBand 1. Even when the user explicitly asks for
    // `local`, there is nothing to subdivide, so it must collapse to full-width
    // (no xOffset) rather than render a lone left-aligned sliver. (`none` is not
    // a user-facing option — one-per-band is reached automatically.)
    const pairs = [['A', 'Alpha'], ['B', 'Beta'], ['C', 'Gamma']];
    const rows = pairs.map(([c, g], i) => ({ Cat: c, Grp: g, Val: (i + 1) * 5 }));
    const boxInput = {
      data: { values: rows },
      semantic_types: { Cat: 'Category', Grp: 'Category', Val: 'Quantity' },
      chart_spec: {
        chartType: 'Boxplot',
        encodings: { x: { field: 'Cat' }, y: { field: 'Val' }, color: { field: 'Grp' } },
        chartProperties: { dodge: 'local' },
        baseSize: { width: 500, height: 320 },
      },
    } as any;
    const spec = assembleVegaLite(boxInput) as any;
    expect(spec.encoding?.xOffset).toBeUndefined();
  });
});



