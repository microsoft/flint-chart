// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { compile } from 'vega-lite';
import { assembleVegaLite, assembleECharts, assembleChartjs, THEME_PRESETS } from '../src';
import { addVegaLiteInteractions } from '../src/vegalite/interactions/compile';
import {
  genConnectedScatterTests,
  genEChartsConnectedScatterTests,
  genChartJsConnectedScatterTests,
} from '../src/test-data';
import type { TestCase } from '../src/test-data/types';

/**
 * Connected Scatter Plot on the Vega-Lite, ECharts and Chart.js backends.
 *
 * A connected scatter plots points in 2-D (x, y both quantitative) and joins
 * them with a STRAIGHT line in a defined order (the `order` / sequence field),
 * tracing a trajectory. These tests assert the invariants that make a chart a
 * connected scatter on each backend:
 *   - points are shown AND a connecting line is present;
 *   - the line is straight (linear interpolation / smooth:false / tension:0);
 *   - the connection follows the order field, NOT the x value
 *     (order encoding present / data sorted by order, not by x);
 *   - both position axes are quantitative;
 *   - multi-series (color) produces one trajectory per series.
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
      baseSize: { width: 560, height: 360 },
      ...(tc.chartProperties ? { chartProperties: tc.chartProperties } : {}),
    },
  };
}

const byTitle = (tcs: TestCase[], title: string) =>
  tcs.find((t) => t.title === title)!;

const BASIC = 'Unemployment vs Inflation over 10 years (basic)';
const MULTI = 'GDP growth vs Inflation × 3 countries + Color (trajectories)';
const TEMPORAL = 'Share price vs Volume over 12 dates (temporal order)';
const LOOP = 'Self-crossing sensor loop × 24 steps (figure-eight)';
const DETAIL = 'Drift vs Noise × 4 sensors + Detail (no legend)';

describe('Vega-Lite Connected Scatter', () => {
  const cases = genConnectedScatterTests();
  const spec = assembleVegaLite(toInput(byTitle(cases, BASIC))) as any;

  it('draws a straight line with points at every observation', () => {
    expect(spec.mark.type).toBe('line');
    expect(spec.mark.point).toBe(true);
    // Straight segments — never monotone / smooth for a connected scatter.
    expect(spec.mark.interpolate).toBe('linear');
  });

  it('puts x and y on quantitative axes', () => {
    expect(spec.encoding.x.type).toBe('quantitative');
    expect(spec.encoding.y.type).toBe('quantitative');
  });

  it('connects in the order of the sequence field, not the x value', () => {
    // The order encoding must reference the sequence field (Year), and it must
    // be sortable (temporal or quantitative) so the line follows the path.
    expect(spec.encoding.order).toBeDefined();
    expect(spec.encoding.order.field).toBe('Year');
    expect(['quantitative', 'temporal']).toContain(spec.encoding.order.type);
    // The line is NOT ordered by x.
    expect(spec.encoding.order.field).not.toBe(spec.encoding.x.field);
  });

  it('orders by a temporal field when the sequence is a date', () => {
    const tspec = assembleVegaLite(toInput(byTitle(cases, TEMPORAL))) as any;
    expect(tspec.encoding.order.field).toBe('Date');
    expect(tspec.encoding.order.type).toBe('temporal');
  });

  it('produces one trajectory per series via color (multi-series)', () => {
    const mspec = assembleVegaLite(toInput(byTitle(cases, MULTI))) as any;
    expect(mspec.encoding.color.field).toBe('Country');
    expect(mspec.encoding.color.type).toBe('nominal');
    // Order still drives connection within each colored trajectory.
    expect(mspec.encoding.order.field).toBe('Year');
  });

  it('groups by detail without a color legend', () => {
    const dspec = assembleVegaLite(toInput(byTitle(cases, DETAIL))) as any;
    expect(dspec.encoding.detail?.field).toBe('Sensor');
    expect(dspec.encoding.color).toBeUndefined();
    expect(dspec.encoding.order.field).toBe('Step');
    expect(dspec.mark.interpolate).toBe('linear');
  });

  it('draws each reading once when the live view splits the dots off the line', () => {
    // Cartoon sets the house's line dots in config.line.point; the split line must not draw them again.
    const themed = assembleVegaLite({ ...toInput(byTitle(cases, BASIC)), theme_spec: THEME_PRESETS.cartoon.spec } as any) as any;
    addVegaLiteInteractions(themed, [], true);
    const symbols: unknown[] = [];
    const walk = (marks: any[] = []) => marks.forEach((m) => {
      if (m.type === 'symbol') symbols.push(m);
      walk(m.marks);
    });
    walk((compile(themed).spec as any).marks);
    expect(symbols).toHaveLength(1);
  });
});

describe('ECharts Connected Scatter', () => {
  const cases = genEChartsConnectedScatterTests();
  const option = assembleECharts(toInput(byTitle(cases, BASIC))) as any;

  it('uses value axes for both x and y', () => {
    expect(option.xAxis.type).toBe('value');
    expect(option.yAxis.type).toBe('value');
  });

  it('draws a single straight line series with visible symbols', () => {
    expect(option.series.length).toBe(1);
    const s = option.series[0];
    expect(s.type).toBe('line');
    // Straight segments — never smooth.
    expect(s.smooth).toBe(false);
    expect(s.showSymbol).toBe(true);
    expect(s.symbolSize).toBeGreaterThan(0);
    // One [x, y] point per observation (10 yearly points).
    expect(s.data).toHaveLength(10);
  });

  it('sorts series points by the order field, not by x', () => {
    // The basic case's x (Unemployment Rate) is NOT monotonic, but the order
    // field (Year) is ascending. After sorting by Year the points must NOT be
    // sorted by x — confirming the line follows the trajectory.
    const xs = option.series[0].data.map((p: number[]) => p[0]);
    const sortedByX = [...xs].sort((a, b) => a - b);
    expect(xs).not.toEqual(sortedByX);
    // And the data follows Year order: the known unemployment sequence.
    expect(xs[0]).toBeCloseTo(6.2);
    expect(xs[xs.length - 1]).toBeCloseTo(3.7);
  });

  it('builds one straight line series per color group (multi-series)', () => {
    const opt = assembleECharts(toInput(byTitle(cases, MULTI))) as any;
    expect(opt.series.length).toBe(3);
    for (const s of opt.series) {
      expect(s.type).toBe('line');
      expect(s.smooth).toBe(false);
      expect(s.data).toHaveLength(8);
    }
    expect(opt.legend?.data).toHaveLength(3);
  });

  it('orders a temporal sequence chronologically', () => {
    const opt = assembleECharts(toInput(byTitle(cases, TEMPORAL))) as any;
    const ys = opt.series[0].data.map((p: number[]) => p[1]);
    // Share Price in date order starts at 142 and ends at 192.
    expect(ys[0]).toBeCloseTo(142);
    expect(ys[ys.length - 1]).toBeCloseTo(192);
  });

  it('a looping path stays unsorted in x (self-crossing trajectory)', () => {
    const opt = assembleECharts(toInput(byTitle(cases, LOOP))) as any;
    const xs = opt.series[0].data.map((p: number[]) => p[0]);
    const sortedByX = [...xs].sort((a, b) => a - b);
    expect(xs).not.toEqual(sortedByX);
  });
});

describe('Chart.js Connected Scatter', () => {
  const cases = genChartJsConnectedScatterTests();
  const config = assembleChartjs(toInput(byTitle(cases, BASIC))) as any;

  it('uses a scatter chart with linear x and y axes', () => {
    expect(config.type).toBe('scatter');
    expect(config.options.scales.x.type).toBe('linear');
    expect(config.options.scales.y.type).toBe('linear');
  });

  it('draws a straight connecting line with visible points', () => {
    expect(config.data.datasets.length).toBe(1);
    const d = config.data.datasets[0];
    // showLine + tension 0 → straight connecting segments over the scatter.
    expect(d.showLine).toBe(true);
    expect(d.tension).toBe(0);
    expect(d.pointRadius).toBeGreaterThan(0);
    expect(d.data).toHaveLength(10);
    // Points are {x, y} objects.
    expect(d.data[0]).toHaveProperty('x');
    expect(d.data[0]).toHaveProperty('y');
  });

  it('pre-sorts dataset points by the order field, not by x', () => {
    const xs = config.data.datasets[0].data.map((p: any) => p.x);
    const sortedByX = [...xs].sort((a, b) => a - b);
    expect(xs).not.toEqual(sortedByX);
    expect(xs[0]).toBeCloseTo(6.2);
    expect(xs[xs.length - 1]).toBeCloseTo(3.7);
  });

  it('builds one straight dataset per color group (multi-series)', () => {
    const cfg = assembleChartjs(toInput(byTitle(cases, MULTI))) as any;
    expect(cfg.data.datasets.length).toBe(3);
    for (const d of cfg.data.datasets) {
      expect(d.showLine).toBe(true);
      expect(d.tension).toBe(0);
      expect(d.data).toHaveLength(8);
    }
    expect(cfg.options.plugins.legend.display).toBe(true);
  });

  it('a looping path stays unsorted in x (self-crossing trajectory)', () => {
    const cfg = assembleChartjs(toInput(byTitle(cases, LOOP))) as any;
    const xs = cfg.data.datasets[0].data.map((p: any) => p.x);
    const sortedByX = [...xs].sort((a, b) => a - b);
    expect(xs).not.toEqual(sortedByX);
  });
});

describe('Connected Scatter gallery examples compile', () => {
  for (const tc of genConnectedScatterTests()) {
    it(`Vega-Lite: ${tc.title}`, () => {
      const spec = assembleVegaLite(toInput(tc)) as any;
      const ok = !!spec.mark || !!spec.facet || !!spec.spec || !!spec.layer;
      expect(ok).toBe(true);
    });
  }
  for (const tc of genEChartsConnectedScatterTests()) {
    it(`ECharts: ${tc.title}`, () => {
      const option = assembleECharts(toInput(tc)) as any;
      expect(option.series?.length).toBeGreaterThan(0);
      expect(option.xAxis?.type).toBe('value');
      expect(option.yAxis?.type).toBe('value');
    });
  }
  for (const tc of genChartJsConnectedScatterTests()) {
    it(`Chart.js: ${tc.title}`, () => {
      const config = assembleChartjs(toInput(tc)) as any;
      expect(config.type).toBe('scatter');
      expect(config.data?.datasets?.length).toBeGreaterThan(0);
      for (const d of config.data.datasets) expect(d.showLine).toBe(true);
    });
  }
});
