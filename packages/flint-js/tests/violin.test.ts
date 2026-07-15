// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite } from '../src';
import { genViolinTests } from '../src/test-data';
import type { TestCase } from '../src/test-data/types';

/**
 * Violin Plot on the Vega-Lite backend.
 *
 * A violin plot draws, per category, a MIRRORED kernel-density curve: the
 * measure sits on the shared continuous (value) axis and the density is
 * reflected about a center line so the WIDTH encodes how many observations fall
 * near each value. These tests assert the invariants that make a chart a violin:
 *   - a `density` transform keyed on the MEASURE field, grouped by the category
 *     (plus every facet/color field, else VL drops them);
 *   - the area is mirrored (`x = density`, `x.stack === "center"`);
 *   - the measure is on the synthetic `value` axis, titled with the measure;
 *   - the density (width) axis hides its labels/ticks (meaningless numbers);
 *   - ONE violin per category (the category occupies the column/wrap facet);
 *   - the shared density extent is padded past the data so violins taper (not
 *     clipped) and may span negatives;
 *   - the `bandwidth` property feeds the density transform when set.
 * Plus a sweep asserting every bundled gallery example compiles.
 */

/** Convert a gallery TestCase into the assembler input shape. */
function toInput(tc: TestCase, extra?: Record<string, unknown>) {
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
    chart_spec: {
      chartType: tc.chartType,
      encodings,
      baseSize: { width: 560, height: 360 },
      ...(tc.chartProperties ? { chartProperties: tc.chartProperties } : {}),
      ...(extra ?? {}),
    },
  };
}

const byTitle = (tcs: TestCase[], title: string) =>
  tcs.find((t) => t.title === title)!;

/** The per-category facet definition lives at `facet` (no row) or `column` (with row). */
const catFacet = (spec: any) => spec.encoding?.facet ?? spec.encoding?.column;

const distinctCount = (rows: any[], field: string) =>
  new Set(rows.map((r) => String(r[field]))).size;

const BASIC = 'Exam scores by class (basic)';
const ROW = 'Reaction time by treatment, faceted by site (row)';
const BIMODAL = 'Bimodal sensor readings by machine';
const NEG = 'Daily returns by asset (crosses zero)';
const HIGHCARD = 'Grades across 6 subjects (higher cardinality)';
const SINGLE = 'Single distribution — adult height (one violin)';
const COLOR = 'Penguin body mass by species (color = category)';

describe('Vega-Lite Violin Plot', () => {
  const cases = genViolinTests();
  const basic = byTitle(cases, BASIC);
  const spec = assembleVegaLite(toInput(basic)) as any;

  it('uses a horizontal area mark (the mirrored density ribbon)', () => {
    expect(spec.mark.type).toBe('area');
    expect(spec.mark.orient).toBe('horizontal');
  });

  it('draws a density transform keyed on the MEASURE, grouped by the category', () => {
    const t = spec.transform[0];
    // The measure (y field) is what the KDE is computed over.
    expect(t.density).toBe('Score');
    expect(t.groupby).toContain('Class');
    // The transform emits the canonical value/density columns.
    expect(t.as).toEqual(['value', 'density']);
  });

  it('mirrors the density about a center line (the violin)', () => {
    expect(spec.encoding.x.field).toBe('density');
    expect(spec.encoding.x.type).toBe('quantitative');
    expect(spec.encoding.x.stack).toBe('center');
    // No imputation/title on the width axis.
    expect(spec.encoding.x.impute).toBeNull();
    expect(spec.encoding.x.title).toBeNull();
  });

  it('hides the density (width) axis labels and ticks (meaningless numbers)', () => {
    expect(spec.encoding.x.axis.labels).toBe(false);
    expect(spec.encoding.x.axis.ticks).toBe(false);
    expect(spec.encoding.x.axis.grid).toBe(false);
  });

  it('puts the measure on the shared continuous value axis, titled with the measure', () => {
    expect(spec.encoding.y.field).toBe('value');
    expect(spec.encoding.y.type).toBe('quantitative');
    expect(spec.encoding.y.title).toBe('Score');
  });

  it('renders ONE violin per category — the category occupies the facet', () => {
    const facet = catFacet(spec);
    expect(facet.field).toBe('Class');
    // Wrap facet declares an explicit column count = number of categories.
    const n = distinctCount(basic.data, 'Class');
    expect(facet.columns).toBe(n);
    // No user-facing column channel survives (it is consumed internally).
    expect(spec.encoding.row ?? null).toBeNull();
  });

  it('pads the shared density extent past the data so violins taper (not clipped)', () => {
    const t = spec.transform[0];
    const vals = basic.data.map((r: any) => r['Score']);
    const dmin = Math.min(...vals), dmax = Math.max(...vals);
    expect(t.extent[0]).toBeLessThan(dmin);
    expect(t.extent[1]).toBeGreaterThan(dmax);
  });

  it('feeds the bandwidth property into the density transform as a relative multiplier', () => {
    const withHalf = assembleVegaLite(
      toInput(basic, { chartProperties: { bandwidth: 0.5 } }),
    ) as any;
    const withOne = assembleVegaLite(
      toInput(basic, { chartProperties: { bandwidth: 1 } }),
    ) as any;
    // The slider is a relative multiplier of the data-derived base bandwidth
    // (not an absolute width), so it must scale linearly: 1.0 ≈ 2 × 0.5.
    expect(withHalf.transform[0].bandwidth).toBeGreaterThan(0);
    expect(withOne.transform[0].bandwidth).toBeCloseTo(withHalf.transform[0].bandwidth * 2, 6);
    // No bandwidth key when the property is at its auto (0) default.
    expect(spec.transform[0].bandwidth).toBeUndefined();
  });

  it('keeps the violins on a shared value axis (comparable, never resolved independently)', () => {
    // Each violin shares the same density extent (one transform, one extent).
    expect(Array.isArray(spec.transform[0].extent)).toBe(true);
    // The value axis is NOT pinned to zero (the synthetic `value` field skips the
    // zero-baseline heuristic), so distributions fit their own range.
    expect(spec.encoding.y.scale?.zero ?? undefined).not.toBe(true);
  });
});

describe('Vega-Lite Violin Plot — shapes & cardinalities', () => {
  const cases = genViolinTests();

  it('resolves the strongly bimodal case (two humps survive the KDE)', () => {
    const s = assembleVegaLite(toInput(byTitle(cases, BIMODAL))) as any;
    expect(s.transform[0].density).toBe('Pressure (psi)');
    expect(s.transform[0].groupby).toContain('Machine');
    // Extent must extend well beyond the data so the wide bimodal group tapers.
    const vals = byTitle(cases, BIMODAL).data.map((r: any) => r['Pressure (psi)']);
    const dmin = Math.min(...vals), dmax = Math.max(...vals);
    const pad = Math.min(dmin - s.transform[0].extent[0], s.transform[0].extent[1] - dmax);
    // Padding is more than a trivial 5% of range (it scales with the KDE bandwidth).
    expect(pad).toBeGreaterThan((dmax - dmin) * 0.05);
  });

  it('lets a violin span negative values (crosses zero)', () => {
    const s = assembleVegaLite(toInput(byTitle(cases, NEG))) as any;
    expect(s.encoding.y.field).toBe('value');
    expect(s.encoding.y.title).toBe('Daily Return %');
    // The padded extent reaches below zero for the negative-spanning data.
    expect(s.transform[0].extent[0]).toBeLessThan(0);
  });

  it('adds an OUTER row facet without losing the per-category panels', () => {
    const s = assembleVegaLite(toInput(byTitle(cases, ROW))) as any;
    // Category in the column facet, the outer field in the row facet.
    expect(s.encoding.column.field).toBe('Treatment');
    expect(s.encoding.row.field).toBe('Site');
    // The density transform must group by BOTH so VL keeps the row field.
    expect(s.transform[0].groupby).toEqual(
      expect.arrayContaining(['Treatment', 'Site']),
    );
  });

  it('handles higher-cardinality categories (6 violins, one per subject)', () => {
    const tc = byTitle(cases, HIGHCARD);
    const s = assembleVegaLite(toInput(tc)) as any;
    const facet = catFacet(s);
    expect(facet.field).toBe('Subject');
    expect(facet.columns).toBe(distinctCount(tc.data, 'Subject'));
    expect(facet.columns).toBeGreaterThanOrEqual(6);
  });

  it('renders a single violin for a one-category dataset', () => {
    const tc = byTitle(cases, SINGLE);
    const s = assembleVegaLite(toInput(tc)) as any;
    const facet = catFacet(s);
    expect(facet.field).toBe('Cohort');
    expect(distinctCount(tc.data, 'Cohort')).toBe(1);
    expect(facet.columns).toBe(1);
  });

  it('colors by an explicit category field and drops the redundant legend', () => {
    const s = assembleVegaLite(toInput(byTitle(cases, COLOR))) as any;
    expect(s.encoding.color.field).toBe('Species');
    // color === category → legend is suppressed (the facet headers already label).
    expect(s.encoding.color.legend).toBeNull();
    expect(s.transform[0].groupby).toContain('Species');
  });
});

describe('Vega-Lite Violin Plot — grouped by a colour sub-group', () => {
  function groupedInput(subgroups: string[]) {
    const cats = ['Eng', 'Sales', 'HR'];
    const rows: any[] = [];
    let s = 1;
    const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    cats.forEach((c, ci) => subgroups.forEach((g, gi) => {
      for (let i = 0; i < 30; i++) {
        rows.push({ Dept: c, Shift: g, Salary: Math.round(40000 + ci * 15000 + gi * 9000 + rnd() * 50000) });
      }
    }));
    return {
      data: { values: rows },
      semantic_types: { Dept: 'Category', Shift: 'Category', Salary: 'Amount' },
      chart_spec: {
        chartType: 'Violin Plot',
        encodings: { x: 'Dept', y: 'Salary', color: 'Shift' },
        baseSize: { width: 620, height: 380 },
      },
    };
  }

  it('keeps a 2-value sub-group as a split violin (one panel per category)', () => {
    const s = assembleVegaLite(groupedInput(['Day', 'Night'])) as any;
    // Split: still the per-category wrap facet, colour = sub-group, no row grid.
    expect(s.encoding.facet?.field).toBe('Dept');
    expect(s.encoding.row ?? null).toBeNull();
    expect(s.encoding.color.field).toBe('Shift');
    // The centre-stacked mirror seats the two sub-groups on either half.
    expect(s.encoding.x.stack).toBe('center');
  });

  it('lays out a 3+ value sub-group as an independent-violin grid (category × sub-group)', () => {
    const s = assembleVegaLite(groupedInput(['Day', 'Night', 'Swing'])) as any;
    expect(s.encoding.column?.field).toBe('Dept');
    expect(s.encoding.row?.field).toBe('Shift');
    // Density keyed per (category, sub-group) so each grid cell is its own shape.
    expect(s.transform[0].groupby).toEqual(
      expect.arrayContaining(['Dept', 'Shift']),
    );
    // Colour legend suppressed — the row headers already label the sub-group.
    expect(s.encoding.color.legend).toBeNull();
  });

  it('does NOT grid a redundant (1:1) colour — stays one violin per category', () => {
    const cats = ['A', 'B', 'C', 'D'];
    const rows: any[] = [];
    let s2 = 5;
    const rnd = () => { s2 = (s2 * 1103515245 + 12345) & 0x7fffffff; return s2 / 0x7fffffff; };
    cats.forEach((c, ci) => {
      for (let i = 0; i < 30; i++) rows.push({ Dept: c, Tag: `${c}_t`, Salary: Math.round(40000 + ci * 12000 + rnd() * 40000) });
    });
    const s = assembleVegaLite({
      data: { values: rows },
      semantic_types: { Dept: 'Category', Tag: 'Category', Salary: 'Amount' },
      chart_spec: {
        chartType: 'Violin Plot',
        encodings: { x: 'Dept', y: 'Salary', color: 'Tag' },
        baseSize: { width: 560, height: 360 },
      },
    }) as any;
    // 1:1 colour ⇒ no dodge: per-category wrap facet, no row grid.
    expect(s.encoding.facet?.field).toBe('Dept');
    expect(s.encoding.row ?? null).toBeNull();
  });
});

describe('Violin Plot gallery examples compile', () => {
  for (const tc of genViolinTests()) {
    it(`Vega-Lite: ${tc.title}`, () => {
      const s = assembleVegaLite(toInput(tc)) as any;
      // A violin: area mark + density transform + mirrored width axis.
      expect(s.mark?.type).toBe('area');
      expect(s.transform?.[0]?.density).toBeTruthy();
      expect(s.encoding?.x?.stack).toBe('center');
      // One violin per category via a facet (wrap `facet` or `column`).
      expect(catFacet(s)?.field).toBeTruthy();
    });
  }
});
