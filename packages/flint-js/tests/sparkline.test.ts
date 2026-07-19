// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite } from '../src';
import { genSparklineTests } from '../src/test-data';
import type { TestCase } from '../src/test-data/types';

/**
 * Sparkline — a bar-table-style 3×N grid of chrome-less line strips.
 *
 * The chart is a manual `hconcat` of three faceted columns:
 *   1. Category — the series name (text);
 *   2. Trend    — the line plus an optional dashed reference rule;
 *   3. Average  — the per-series central tendency (text; "Median" if asked).
 *
 * Invariants asserted here:
 *   - the spec is an `hconcat` of exactly three panels, each carrying its own
 *     top-level `title` so the column headers align on one row;
 *   - every panel facets on the same series field, with the same row order, so
 *     the N rows line up across columns;
 *   - x and y axes are fully suppressed and no color legend is shown;
 *   - the curve (interpolate) and baseline (mean/zero/median/none) properties
 *     are honored, with the dashed rule living inside the Trend panel;
 *   - more series → shorter strips (tight vertical packing), never taller.
 */

/** Convert a gallery TestCase into the assembler input shape. */
function toInput(tc: TestCase, extraProps?: Record<string, any>) {
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
      baseSize: { width: 480, height: 360 },
      ...((tc.chartProperties || extraProps)
        ? { chartProperties: { ...(tc.chartProperties ?? {}), ...(extraProps ?? {}) } }
        : {}),
    },
  };
}

const byTitle = (tcs: TestCase[], title: string) =>
  tcs.find((t) => t.title === title)!;

// ── Grid accessors ─────────────────────────────────────────────────────────
const panels = (spec: any) => spec.hconcat as any[];
const catPanel = (spec: any) => panels(spec)[0];
const trendPanel = (spec: any) => panels(spec)[1];
const avgPanel = (spec: any) => panels(spec)[2];
const trendLayers = (spec: any) => trendPanel(spec).spec.layer as any[];
const trendLine = (spec: any) => trendLayers(spec)[0];

describe('Vega-Lite Sparkline', () => {
  const cases = genSparklineTests();
  const MULTI = '8×T (36 pts/series)';

  it('builds a 3-column grid: Category | Trend | Average', () => {
    const spec = assembleVegaLite(toInput(byTitle(cases, MULTI))) as any;
    expect(panels(spec)).toHaveLength(3);
    expect(catPanel(spec).title.text).toBe('Metric');
    expect(trendPanel(spec).title.text).toBe('Value');
    expect(avgPanel(spec).title.text).toBe('Average');
  });

  it('facets every panel on the same series field and row order', () => {
    const spec = assembleVegaLite(toInput(byTitle(cases, MULTI))) as any;
    const rows = panels(spec).map((p) => p.facet.row);
    for (const row of rows) {
      expect(row.field).toBe('Metric');
      expect(row.header).toBeNull();
      expect(row.sort).toHaveLength(8);
    }
    // All three columns share the identical row order.
    expect(rows[1].sort).toEqual(rows[0].sort);
    expect(rows[2].sort).toEqual(rows[0].sort);
  });

  it('removes both position axes entirely (axis: null)', () => {
    const spec = assembleVegaLite(toInput(byTitle(cases, MULTI))) as any;
    const enc = trendLine(spec).encoding;
    expect(enc.x.axis).toBeNull();
    expect(enc.y.axis).toBeNull();
  });

  it('shows no color legend', () => {
    const spec = assembleVegaLite(toInput(byTitle(cases, MULTI))) as any;
    expect(trendLine(spec).encoding.color.legend).toBeNull();
    expect(avgPanel(spec).spec.encoding.color.legend).toBeNull();
    expect(spec.encoding?.color).toBeUndefined();
  });

  it('colors the line and value by series hue when bound to color', () => {
    const spec = assembleVegaLite(toInput(byTitle(cases, MULTI))) as any;
    expect(trendLine(spec).encoding.color.field).toBe('Metric');
    expect(avgPanel(spec).spec.encoding.color.field).toBe('Metric');
  });

  it('always self-scales each strip and does not expose a Y-scale option', () => {
    const auto = assembleVegaLite(toInput(byTitle(cases, MULTI))) as any;
    expect(trendPanel(auto).resolve?.scale?.y).toBe('independent');
    expect(auto._options).not.toContainEqual(expect.objectContaining({ key: 'independentYAxis' }));

    const legacyOverride = assembleVegaLite(toInput(byTitle(cases, MULTI), { independentYAxis: false })) as any;
    expect(trendPanel(legacyOverride).resolve?.scale?.y).toBe('independent');
  });

  it('honors the interpolate (curve) property', () => {
    const spec = assembleVegaLite(toInput(byTitle(cases, MULTI), { interpolate: 'monotone' })) as any;
    expect(trendLine(spec).mark).toMatchObject({ type: 'line', interpolate: 'monotone' });
  });

  it('adds a dashed mean reference rule by default and supports baseline options', () => {
    const tc = byTitle(cases, MULTI);

    const on = assembleVegaLite(toInput(tc)) as any;
    expect(trendLayers(on)).toHaveLength(2);
    expect(trendLayers(on)[1].mark).toMatchObject({ type: 'rule', strokeDash: [3, 2] });
    expect(trendLayers(on)[1].encoding.y).toMatchObject({ aggregate: 'mean' });
    expect(avgPanel(on).title.text).toBe('Average');

    const median = assembleVegaLite(toInput(tc, { baseline: 'median' })) as any;
    expect(trendLayers(median)[1].encoding.y).toMatchObject({ aggregate: 'median' });
    expect(avgPanel(median).title.text).toBe('Median');

    const zero = assembleVegaLite(toInput(tc, { baseline: 'zero' })) as any;
    expect(trendLayers(zero)).toHaveLength(2);
    expect(trendLayers(zero)[1].encoding.y).toMatchObject({ datum: 0 });

    const off = assembleVegaLite(toInput(tc, { baseline: 'none' })) as any;
    expect(trendLayers(off)).toHaveLength(1);
  });

  it('renders the category name and the average value as text columns', () => {
    const spec = assembleVegaLite(toInput(byTitle(cases, MULTI))) as any;
    expect(catPanel(spec).spec.mark).toMatchObject({ type: 'text', align: 'left' });
    expect(catPanel(spec).spec.encoding.text.field).toBe('Metric');
    expect(avgPanel(spec).spec.mark).toMatchObject({ type: 'text', align: 'right' });
    expect(avgPanel(spec).spec.encoding.text).toMatchObject({ field: 'flintSparkAvg', format: '.3~s' });
  });

  it('preserves semantic currency formatting in the average column', () => {
    const spec = assembleVegaLite({
      data: {
        values: [
          { month: '2025-01-01', item: 'Bananas', price: 0.59 },
          { month: '2025-02-01', item: 'Bananas', price: 0.61 },
        ],
      },
      semantic_types: {
        month: 'YearMonth',
        item: 'Category',
        price: { semanticType: 'Price', unit: 'USD' },
      },
      chart_spec: {
        chartType: 'Sparkline',
        encodings: { x: 'month', y: 'price', color: 'item' },
        baseSize: { width: 480, height: 360 },
      },
    }) as any;

    expect(avgPanel(spec).spec.transform).toContainEqual({
      calculate: "'$' + format(datum.flintSparkAvg, ',.2f')",
      as: 'flintSparkAvgFormatted',
    });
    expect(avgPanel(spec).spec.encoding.text).toEqual({
      field: 'flintSparkAvgFormatted',
      type: 'nominal',
    });
  });

  it('uses a compact base sparkline width by default and honors a tuned width', () => {
    const tc = byTitle(cases, MULTI);
    const auto = assembleVegaLite(toInput(tc)) as any;
    const tuned = assembleVegaLite(toInput(tc, { trendWidth: 120 })) as any;
    expect(tuned.hconcat[1].spec.width).toBe(120);
    // Default is a compact base width (≤ 240), not a full-canvas stretch.
    expect(auto.hconcat[1].spec.width).toBeGreaterThan(120);
    expect(auto.hconcat[1].spec.width).toBeLessThanOrEqual(240);
  });

  it('drops the per-panel view border (box)', () => {
    const spec = assembleVegaLite(toInput(byTitle(cases, MULTI))) as any;
    expect(spec.config?.view?.stroke).toBeNull();
  });

  it('renders a single-row grid for a single-series case', () => {
    const spec = assembleVegaLite(toInput(byTitle(cases, '1×T (30 pts/series)'))) as any;
    expect(panels(spec)).toHaveLength(3);
    expect(trendPanel(spec).facet.row.sort).toHaveLength(1);
    expect(trendLine(spec).encoding.x.axis).toBeNull();
    expect(trendLine(spec).encoding.y.axis).toBeNull();
  });

  it('packs more series into shorter strips without growing each row', () => {
    const small = assembleVegaLite(toInput(byTitle(cases, '3×T (24 pts/series)'))) as any;
    const big = assembleVegaLite(toInput(byTitle(cases, '15×T (48 pts/series)'))) as any;
    const smallH = trendPanel(small).spec.height;
    const bigH = trendPanel(big).spec.height;
    // More series ⇒ strips get shorter (or stay), never taller, and stay bounded.
    expect(bigH).toBeLessThanOrEqual(smallH);
    expect(bigH).toBeLessThanOrEqual(64);
  });

  it('every bundled sparkline example compiles into a 3-column grid', () => {
    for (const tc of cases) {
      const spec = assembleVegaLite(toInput(tc)) as any;
      expect(spec).toBeDefined();
      expect(spec.hconcat).toHaveLength(3);
    }
  });
});
