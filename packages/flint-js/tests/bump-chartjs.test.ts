// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleChartjs, assembleECharts, assembleVegaLite, cjsGetTemplateDef } from '../src';

const RANK_DATA = [
  { season: 'S1', rank: 1, team: 'Ferrari' },
  { season: 'S2', rank: 3, team: 'Ferrari' },
  { season: 'S3', rank: 2, team: 'Ferrari' },
  { season: 'S1', rank: 2, team: 'McLaren' },
  { season: 'S2', rank: 1, team: 'McLaren' },
  { season: 'S3', rank: 3, team: 'McLaren' },
  { season: 'S1', rank: 3, team: 'RedBull' },
  { season: 'S2', rank: 2, team: 'RedBull' },
  { season: 'S3', rank: 1, team: 'RedBull' },
];

function rankInput() {
  return {
    data: { values: RANK_DATA },
    semantic_types: { season: 'Category', rank: 'Rank', team: 'Name' },
    chart_spec: {
      chartType: 'Bump Chart',
      encodings: { x: { field: 'season' }, y: { field: 'rank' }, color: { field: 'team' } },
      baseSize: { width: 420, height: 280 },
    },
  };
}

describe('Chart.js Bump Chart', () => {
  it('is registered in the Chart.js template registry', () => {
    expect(cjsGetTemplateDef('Bump Chart')).toBeDefined();
  });

  it('builds one line dataset per series over the shared category axis', () => {
    const config = assembleChartjs(rankInput()) as any;
    expect(config.type).toBe('line');
    expect(config.data.labels).toEqual(['S1', 'S2', 'S3']);
    expect(config.data.datasets).toHaveLength(3);
    expect(config.data.datasets.map((d: any) => d.label)).toEqual(['Ferrari', 'McLaren', 'RedBull']);
    expect(config.data.datasets[0].data).toEqual([1, 3, 2]);
    expect(config.options.plugins.legend.display).toBe(true);
  });

  it('reverses the rank axis so rank 1 sits on top, pinned to [1, maxRank]', () => {
    const config = assembleChartjs(rankInput()) as any;
    const y = config.options.scales.y;
    expect(y.reverse).toBe(true);
    expect(y.min).toBe(1);
    expect(y.max).toBe(3);
    expect(y.beginAtZero).toBeUndefined();
  });

  it('keeps a plain value axis when y is not rank-like', () => {
    const config = assembleChartjs({
      data: { values: RANK_DATA.map(d => ({ ...d, points: d.rank * 10 })) },
      semantic_types: { season: 'Category', points: 'Quantity', team: 'Name' },
      chart_spec: {
        chartType: 'Bump Chart',
        encodings: { x: { field: 'season' }, y: { field: 'points' }, color: { field: 'team' } },
        baseSize: { width: 420, height: 280 },
      },
    }) as any;
    expect(config.options.scales.y.reverse).toBeUndefined();
    expect(config.options.scales.y.min).toBeUndefined();
  });

  it('stays pure JSON for the discrete-x rank case (no live functions)', () => {
    const config = assembleChartjs(rankInput()) as any;
    const roundTripped = JSON.parse(JSON.stringify(config));
    expect(roundTripped).toEqual(config);
  });

  it('compiles the same input on all three backends', () => {
    const input = rankInput();
    expect(() => assembleVegaLite(input)).not.toThrow();
    expect(() => assembleECharts(input)).not.toThrow();
    expect(() => assembleChartjs(input)).not.toThrow();
  });
});
