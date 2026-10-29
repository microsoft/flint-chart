// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, expect, it } from 'vitest';
import { assembleECharts, assembleVegaLite } from '../src';
import { assemblePlotly } from '../src/plotly';
import { resampleStops } from '../src/core/color-controls';

const ROWS = ['A', 'B', 'C'].flatMap((game, g) => ['2025-01', '2025-02', '2025-03'].map((period, p) => ({
  game, period, net: (g - 1) * 1000 + p * 300 - 400,
})));

function heatmap(color: Record<string, unknown>, opts: { theme?: string; semantic?: string | Record<string, unknown> } = {}) {
  return {
    data: { values: ROWS },
    semantic_types: { period: 'YearMonth', game: 'Category', net: opts.semantic ?? 'Profit' },
    chart_spec: { chartType: 'Heatmap', encodings: { x: 'period', y: 'game', color: { field: 'net', ...color } } },
    ...(opts.theme ? { theme_spec: opts.theme } : {}),
  } as any;
}

/** The colour scale of the drawn cells, wherever a theme layered the spec. */
function cellScale(vl: any): any {
  let found: any;
  const visit = (node: any) => {
    if (!node || typeof node !== 'object' || found) return;
    const mark = typeof node.mark === 'string' ? node.mark : node.mark?.type;
    if (node.encoding?.color?.scale && mark !== 'text') found = node.encoding.color.scale;
    for (const key of ['layer', 'vconcat', 'hconcat', 'concat']) for (const child of node[key] ?? []) visit(child);
    if (node.spec) visit(node.spec);
  };
  visit(vl);
  return found;
}

const warmth = (hex: string) => parseInt(hex.slice(1, 3), 16) - parseInt(hex.slice(5, 7), 16);

describe('polarity', () => {
  it('reads a signed measure as higher-is-better by default', () => {
    expect((assembleVegaLite(heatmap({})) as any).encoding.color.scale.scheme).toBe('redblue');
  });

  it('turns the scheme for a lower-is-better field', () => {
    const vl = assembleVegaLite(heatmap({}, { semantic: { semanticType: 'Profit', polarity: 'lower-is-better' } })) as any;
    expect(vl.encoding.color.scale.scheme).toBe('blueorange');
  });

  it('turns a house ramp so the warm end lands where the polarity puts it', () => {
    const better = cellScale(assembleVegaLite(heatmap({}, { theme: 'economist' }))).range;
    const worse = cellScale(assembleVegaLite(heatmap({}, { theme: 'economist', semantic: { semanticType: 'Profit', polarity: 'lower-is-better' } }))).range;
    // Higher-is-better: the low end (a loss) is the warm one.
    expect(warmth(better[0])).toBeGreaterThan(warmth(better[better.length - 1]));
    expect(worse).toEqual([...better].reverse());
  });
});

describe('colour controls on the encoding (Vega-Lite)', () => {
  it('takes explicit stops over the default scheme', () => {
    const scale = (assembleVegaLite(heatmap({ scheme: ['#c0392b', '#f2f2f2', '#2e75b6'] })) as any).encoding.color.scale;
    expect(scale.range).toEqual(['#c0392b', '#f2f2f2', '#2e75b6']);
    expect(scale.scheme).toBeUndefined();
  });

  it('wins over a theme ramp, continuous unless binned', () => {
    const scale = cellScale(assembleVegaLite(heatmap({ scheme: 'viridis' }, { theme: 'economist' })));
    expect(scale.scheme).toBe('viridis');
    expect(scale.range).toBeUndefined();
    expect(scale.type).toBeUndefined();
  });

  it('keeps a signed measure symmetric about its pivot under explicit stops', () => {
    const scale = (assembleVegaLite(heatmap({ scheme: ['#c0392b', '#f7f7f7', '#2e75b6'] })) as any).encoding.color.scale;
    expect(scale.domain[0]).toBe(-scale.domain[1]);
  });

  it('quantizes into the requested bins', () => {
    const vl = assembleVegaLite(heatmap({ scheme: ['#c0392b', '#f2f2f2', '#2e75b6'], bins: 4 })) as any;
    expect(vl.encoding.color.scale.type).toBe('quantize');
    expect(vl.encoding.color.scale.range).toHaveLength(4);
  });

  it('keeps a theme ramp but binned or continuous on request', () => {
    const binned = cellScale(assembleVegaLite(heatmap({ bins: 7 }, { theme: 'economist' })));
    expect(binned.type).toBe('quantize');
    expect(binned.range).toHaveLength(7);
    const smooth = cellScale(assembleVegaLite(heatmap({ bins: 0 }, { theme: 'economist' })));
    expect(smooth.type).toBeUndefined();
  });

  it('reverses and fixes the domain', () => {
    const scale = (assembleVegaLite(heatmap({ reverse: true, domain: [-2000, 2000] })) as any).encoding.color.scale;
    expect(scale.reverse).toBe(true);
    expect(scale.domain).toEqual([-2000, 2000]);
  });

  it('pivots on the chart-local mid', () => {
    const scale = (assembleVegaLite(heatmap({ mid: 500 })) as any).encoding.color.scale;
    expect(scale.domainMid).toBe(500);
  });

  it('binds colours to categories for this chart', () => {
    const vl = assembleVegaLite({
      data: { values: [{ team: 'Win', n: 3 }, { team: 'Loss', n: 2 }, { team: 'Draw', n: 1 }] },
      semantic_types: { team: 'Category', n: 'Count' },
      chart_spec: { chartType: 'Bar Chart', encodings: { x: 'team', y: 'n', color: { field: 'team', colors: { Win: '#2a9d8f', Loss: '#e76f51' } } } },
    } as any) as any;
    const scale = vl.encoding.color.scale;
    const inkOf = (value: string) => scale.range[scale.domain.indexOf(value)];
    expect(inkOf('Win')).toBe('#2a9d8f');
    expect(inkOf('Loss')).toBe('#e76f51');
  });
});

describe('colour controls on the other backends', () => {
  it('ECharts: bins and stops shape the visual map', () => {
    const ec = assembleECharts(heatmap({ scheme: ['#c0392b', '#f2f2f2', '#2e75b6'], bins: 4, domain: [-2000, 2000], reverse: true })) as any;
    const vm = Array.isArray(ec.visualMap) ? ec.visualMap[0] : ec.visualMap;
    expect(vm.type).toBe('piecewise');
    // Four bins edged at round values, the outer two open.
    expect(vm.pieces.map((p: any) => p.label)).toEqual(['< \u22121,000', '\u22121,000 \u2013 0', '0 \u2013 1,000', '\u2265 1,000']);
    expect(vm.pieces[0].color).toBe('#2e75b6');
    expect(vm.inRange.color).toHaveLength(4);
    expect(vm.inRange.color[0]).toBe('#2e75b6');
    expect([vm.min, vm.max]).toEqual([-2000, 2000]);
  });

  it('Plotly: stops become the colour scale', () => {
    const fig = assemblePlotly(heatmap({ scheme: ['#c0392b', '#2e75b6'], reverse: true })) as any;
    const trace = fig.data.find((t: any) => t.colorscale !== undefined);
    expect(trace.colorscale).toEqual([[0, '#c0392b'], [1, '#2e75b6']]);
    expect(trace.reversescale).toBe(true);
  });
});

describe('resampleStops', () => {
  it('spaces colours evenly along the ramp', () => {
    expect(resampleStops(['#000000', '#ffffff'], 3)).toEqual(['#000000', '#808080', '#ffffff']);
  });
});
