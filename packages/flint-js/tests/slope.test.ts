// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite, assembleECharts, assembleChartjs } from '../src';
import {
  genSlopeTests,
  genEChartsSlopeTests,
  genChartJsSlopeTests,
} from '../src/test-data';
import type { TestCase } from '../src/test-data/types';

/**
 * Slope Chart (slopegraph) on the Vega-Lite, ECharts and Chart.js backends.
 *
 * A slopegraph draws one straight line per category connecting that category's
 * value at exactly TWO periods, with a point at each end; the read is the slope
 * (direction of change) and the crossovers between categories. These tests
 * assert the invariants that make a chart a slopegraph on each backend:
 *   - exactly two x positions (the two periods);
 *   - one line / series / dataset per category;
 *   - straight segments (linear interpolation, never smoothed);
 *   - points shown at both ends;
 *   - the period axis is discrete and the value axis quantitative.
 * Plus a sweep asserting every bundled gallery example compiles per backend.
 */

/** Convert a gallery TestCase into the assembler input shape. */
function toInput(tc: TestCase) {
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
      baseSize: { width: 500, height: 300 },
      ...(tc.chartProperties ? { chartProperties: tc.chartProperties } : {}),
    },
  };
}

const byTitle = (tcs: TestCase[], title: string) =>
  tcs.find((t) => t.title === title)!;

describe('Vega-Lite Slope chart', () => {
  const cases = genSlopeTests();
  const basic = byTitle(cases, 'Two periods × 5 products + Color (basic)');
  const spec = assembleVegaLite(toInput(basic)) as any;

  it('draws a straight line with points at both ends', () => {
    expect(spec.mark.type).toBe('line');
    expect(spec.mark.point).toBe(true);
    // Straight segments — never monotone / smooth for a slopegraph.
    expect(spec.mark.interpolate).toBe('linear');
  });

  it('renders the period axis as a discrete band with exactly two positions', () => {
    expect(['ordinal', 'nominal']).toContain(spec.encoding.x.type);
    expect(Array.isArray(spec.encoding.x.sort)).toBe(true);
    expect(spec.encoding.x.sort).toHaveLength(2);
  });

  it('puts value on a quantitative y-axis and one line per category via color', () => {
    expect(spec.encoding.y.type).toBe('quantitative');
    expect(spec.encoding.color.type).toBe('nominal');
    expect(spec.encoding.color.field).toBe('Product');
  });

  it('orders temporal (year) periods left → right as a discrete two-band axis', () => {
    const temporal = byTitle(
      cases,
      'Temporal years × 8 companies + Color (crossings)',
    );
    const tspec = assembleVegaLite(toInput(temporal)) as any;
    expect(['ordinal', 'nominal']).toContain(tspec.encoding.x.type);
    expect(tspec.encoding.x.sort).toEqual(['2018', '2023']);
  });

  it('lets the value axis span negatives for zero-crossing data', () => {
    const neg = byTitle(
      cases,
      'Two periods × 6 regions + Color (zero-crossing values)',
    );
    const nspec = assembleVegaLite(toInput(neg)) as any;
    expect(nspec.encoding.y.type).toBe('quantitative');
    expect(nspec.encoding.x.sort).toEqual(['Q1', 'Q4']);
  });

  it('facets into small multiples with a column encoding', () => {
    const facet = byTitle(
      cases,
      'Two periods × 4 products + Color, faceted by Segment',
    );
    const fspec = assembleVegaLite(toInput(facet)) as any;
    // A column encoding surfaces as a Vega-Lite facet (encoding.facet /
    // encoding.column) or a facet/spec wrapper depending on layout.
    const hasFacet =
      !!fspec.encoding?.facet ||
      !!fspec.encoding?.column ||
      !!fspec.facet ||
      !!fspec.spec?.encoding;
    expect(hasFacet).toBe(true);
    // The slope marks survive faceting: still a straight line with points.
    expect(fspec.mark?.type ?? fspec.spec?.mark?.type).toBe('line');
    expect(fspec.mark?.interpolate ?? fspec.spec?.mark?.interpolate).toBe(
      'linear',
    );
  });
});

describe('ECharts Slope chart', () => {
  const cases = genEChartsSlopeTests();
  const basic = byTitle(cases, 'Two periods × 5 products + Color (basic)');
  const option = assembleECharts(toInput(basic)) as any;

  it('uses a category x-axis with exactly two positions', () => {
    expect(option.xAxis.type).toBe('category');
    expect(option.xAxis.data).toHaveLength(2);
  });

  it('draws one straight line series per category, points shown', () => {
    expect(option.series.length).toBe(5);
    for (const s of option.series) {
      expect(s.type).toBe('line');
      // Straight segments — never smooth for a slopegraph.
      expect(s.smooth).toBe(false);
      expect(s.showSymbol).toBe(true);
      expect(s.symbolSize).toBeGreaterThan(0);
      // Exactly two values, one per period.
      expect(s.data).toHaveLength(2);
    }
  });

  it('positions value on a value y-axis', () => {
    expect(option.yAxis.type).toBe('value');
  });

  it('anchors the color legend from the right so chart.resize() keeps the gutter', () => {
    // Design-canvas `left` (e.g. 422 of 534) overlaps the plot once the host
    // is wider than `_width`. `right` is the inset to the legend box edge.
    expect(option.legend.right).toBe(16);
    expect(option.legend.left).toBeUndefined();
    expect(option.legend.orient).toBe('vertical');
    expect(option.grid.right).toBeGreaterThan(option.legend.right);
    const title = (option.graphic ?? []).find(
      (g: { type?: string; style?: { fontWeight?: string } }) =>
        g.type === 'text' && g.style?.fontWeight === 'bold',
    );
    expect(title?.right).toBe(16);
    expect(title?.left).toBeUndefined();
  });

  it('orders temporal year periods as two ordered categories', () => {
    const temporal = byTitle(
      cases,
      'Temporal years × 8 companies + Color (crossings)',
    );
    const opt = assembleECharts(toInput(temporal)) as any;
    expect(opt.xAxis.data).toEqual(['2018', '2023']);
    expect(opt.series.length).toBe(8);
  });
});

describe('Chart.js Slope chart', () => {
  const cases = genChartJsSlopeTests();
  const basic = byTitle(cases, 'Two periods × 5 products + Color (basic)');
  const config = assembleChartjs(toInput(basic)) as any;

  it('uses a category x-axis with exactly two labels', () => {
    expect(config.type).toBe('line');
    expect(config.options.scales.x.type).toBe('category');
    expect(config.data.labels).toHaveLength(2);
  });

  it('draws one straight dataset per category with visible points', () => {
    expect(config.data.datasets.length).toBe(5);
    for (const d of config.data.datasets) {
      // Straight segments + visible end points.
      expect(d.tension).toBe(0);
      expect(d.pointRadius).toBeGreaterThan(0);
      expect(d.fill).toBe(false);
      // Exactly two values, one per period.
      expect(d.data).toHaveLength(2);
    }
  });

  it('insets the two period bands so end points are not clipped', () => {
    expect(config.options.scales.x.offset).toBe(true);
  });

  it('orders temporal year periods as two ordered labels', () => {
    const temporal = byTitle(
      cases,
      'Temporal years × 8 companies + Color (crossings)',
    );
    const cfg = assembleChartjs(toInput(temporal)) as any;
    expect(cfg.data.labels).toEqual(['2018', '2023']);
    expect(cfg.data.datasets.length).toBe(8);
  });
});

describe('Slope detail channel (group without color legend)', () => {
  const detail = byTitle(
    genSlopeTests(),
    'Two periods × 6 units + Detail (no legend)',
  );

  it('Vega-Lite groups one line per category via the detail channel', () => {
    const spec = assembleVegaLite(toInput(detail)) as any;
    expect(spec.encoding.detail?.field).toBe('Unit');
    // No color legend for a detail-grouped slopegraph.
    expect(spec.encoding.color).toBeUndefined();
    expect(spec.mark.interpolate).toBe('linear');
  });

  it('ECharts builds one straight line series per category from detail', () => {
    const option = assembleECharts(toInput(detail)) as any;
    expect(option.series.length).toBe(6);
    for (const s of option.series) {
      expect(s.type).toBe('line');
      expect(s.smooth).toBe(false);
      expect(s.data).toHaveLength(2);
    }
  });

  it('Chart.js builds one straight dataset per category from detail', () => {
    const config = assembleChartjs(toInput(detail)) as any;
    expect(config.data.datasets.length).toBe(6);
    for (const d of config.data.datasets) {
      expect(d.tension).toBe(0);
      expect(d.data).toHaveLength(2);
    }
  });
});

describe('Slope gallery examples compile', () => {
  for (const tc of genSlopeTests()) {
    it(`Vega-Lite: ${tc.title}`, () => {
      const spec = assembleVegaLite(toInput(tc)) as any;
      // Either a single mark spec or a faceted wrapper.
      const ok = !!spec.mark || !!spec.facet || !!spec.spec;
      expect(ok).toBe(true);
    });
  }
  for (const tc of genEChartsSlopeTests()) {
    it(`ECharts: ${tc.title}`, () => {
      const option = assembleECharts(toInput(tc)) as any;
      expect(option.series?.length).toBeGreaterThan(0);
      expect(option.xAxis?.data).toHaveLength(2);
    });
  }
  for (const tc of genChartJsSlopeTests()) {
    it(`Chart.js: ${tc.title}`, () => {
      const config = assembleChartjs(toInput(tc)) as any;
      expect(config.type).toBe('line');
      expect(config.data?.datasets?.length).toBeGreaterThan(0);
      expect(config.data?.labels).toHaveLength(2);
    });
  }
});
