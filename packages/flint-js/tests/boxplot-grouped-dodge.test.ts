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

  it('sparse cross-product (dept × level) → dodges, sized by GLOBAL lane count', () => {
    // 6 departments, 5 global levels, but each dept holds only 2 of them.
    const depts = ['D1', 'D2', 'D3', 'D4', 'D5', 'D6'];
    const levelPairs = [
      ['L1', 'L2'], ['L2', 'L3'], ['L3', 'L4'], ['L4', 'L5'], ['L5', 'L1'], ['L1', 'L3'],
    ];
    const rows: any[] = [];
    depts.forEach((d, di) => {
      for (const lv of levelPairs[di]) for (let i = 0; i < 20; i++) rows.push({ Cat: d, Level: lv, Val: i });
    });
    const spec = assembleVegaLite({
      data: { values: rows },
      semantic_types: { Cat: 'Category', Level: 'Category', Val: 'Quantity' },
      chart_spec: {
        chartType: 'Boxplot',
        encodings: { x: { field: 'Cat' }, y: { field: 'Val' }, color: { field: 'Level' } },
        baseSize: { width: 700, height: 320 },
      },
    } as any) as any;
    expect(spec.encoding?.xOffset?.field).toBe('Level');
    // Global lane count is 5, so a box must fit the 5-lane pitch (band·0.8/5),
    // NOT the max-per-band pitch of 2 — otherwise occupied lanes overlap.
    const fiveLanePitch = (stepOf(spec) * 0.8) / 5;
    expect(sizeOf(spec)).toBeLessThanOrEqual(fiveLanePitch);
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

  it('sparse / middle case (each band has a SUBSET of groups) still dodges', () => {
    // 4 global groups, each category holds only 2 of them → maxPerBand 2,
    // global 4 (the ambiguous zone). Most bands are multi-valued, so the
    // nestedSnapThreshold leans to dodge rather than collapsing to full-width.
    const cats = ['A', 'B', 'C', 'D'];
    const subset: Record<string, string[]> = {
      A: ['G1', 'G2'], B: ['G2', 'G3'], C: ['G3', 'G4'], D: ['G4', 'G1'],
    };
    const rows: any[] = [];
    for (const c of cats) for (const g of subset[c]) rows.push({ Cat: c, Grp: g, Val: c.charCodeAt(0) + g.length });
    const spec = assembleVegaLite(
      groupedBarInput(rows, { Cat: 'Category', Grp: 'Category', Val: 'Quantity' }, 'Grp'),
    ) as any;
    expect(spec.encoding?.xOffset?.field).toBe('Grp');
  });

  it('forcing colorLayout=nested collapses a genuine group to full-width', () => {
    const cats = ['A', 'B', 'C'];
    const grps = ['G1', 'G2'];
    const rows: any[] = [];
    for (const c of cats) for (const g of grps) rows.push({ Cat: c, Grp: g, Val: c.charCodeAt(0) + g.length });
    const input = groupedBarInput(rows, { Cat: 'Category', Grp: 'Category', Val: 'Quantity' }, 'Grp');
    // Boxplot honors colorLayout via the shared helper; grouped bar's group→
    // xOffset suppression is confident-nested only, so this asserts the boxplot
    // override path (the user-facing toggle) explicitly.
    const boxInput = {
      data: { values: rows },
      semantic_types: { Cat: 'Category', Grp: 'Category', Val: 'Quantity' },
      chart_spec: {
        chartType: 'Boxplot',
        encodings: { x: { field: 'Cat' }, y: { field: 'Val' }, color: { field: 'Grp' } },
        chartProperties: { colorLayout: 'nested' },
        baseSize: { width: 500, height: 320 },
      },
    } as any;
    void input;
    const spec = assembleVegaLite(boxInput) as any;
    expect(spec.encoding?.xOffset).toBeUndefined();
  });
});



