// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import {
  profileData,
  recommendChartTypes,
  recommendChartTypesDetailed,
  vlRecommendChartTypes,
  vlRecommendCharts,
  vlRecommendEncodings,
  ecRecommendChartTypes,
  cjsRecommendChartTypes,
} from '../src';

// ── The "Life Expectancy Gap" table from the handoff ──────────────────────
// Entity/Code are Country (geo place), Year is temporal, the diff is a measure.
const LIFE_EXP = (() => {
  const entities = [
    ['Afghanistan', 'AFG'],
    ['Albania', 'ALB'],
    ['Algeria', 'DZA'],
  ];
  const years = [1950, 1951, 1952];
  const rows: any[] = [];
  for (const [Entity, Code] of entities) {
    for (const Year of years) {
      rows.push({ Entity, Code, Year, LifeExpectancyDiffFM: 1.2 + rows.length * 0.03 });
    }
  }
  return rows;
})();
const LIFE_EXP_TYPES = {
  Entity: 'Country',
  Code: 'Country',
  Year: 'Year',
  LifeExpectancyDiffFM: 'Number',
};

describe('data profiling', () => {
  it('classifies fields into roles from semantic types', () => {
    const p = profileData(LIFE_EXP, LIFE_EXP_TYPES);
    expect(p.geoPlaces.map(f => f.name).sort()).toEqual(['Code', 'Entity']);
    expect(p.temporals.map(f => f.name)).toEqual(['Year']);
    expect(p.measures.map(f => f.name)).toEqual(['LifeExpectancyDiffFM']);
    expect(p.categoricals).toHaveLength(0);
    // geo places + the time field are all category-axis-capable dimensions.
    expect(p.dimensions.map(f => f.name).sort()).toEqual(['Code', 'Entity', 'Year']);
    expect(p.rowCount).toBe(9);
  });

  it('classifies latitude / longitude as coordinates, not measures', () => {
    const p = profileData(
      [{ lat: 40.7, lon: -74, mag: 5.1 }],
      { lat: 'Latitude', lon: 'Longitude', mag: 'Number' },
    );
    expect(p.latitudes.map(f => f.name)).toEqual(['lat']);
    expect(p.longitudes.map(f => f.name)).toEqual(['lon']);
    expect(p.measures.map(f => f.name)).toEqual(['mag']);
  });

  it('demotes id-like fields so they are not measures or categories', () => {
    const p = profileData(
      [{ user_id: 1, amount: 10 }],
      { user_id: 'ID', amount: 'Amount' },
    );
    expect(p.identifiers.map(f => f.name)).toEqual(['user_id']);
    expect(p.measures.map(f => f.name)).toEqual(['amount']);
  });
});

describe('recommendChartTypes — the headline geographic case', () => {
  it('ranks Choropleth first, then Line and Bar for country + time + measure', () => {
    const types = recommendChartTypes(LIFE_EXP, LIFE_EXP_TYPES);
    expect(types.slice(0, 3)).toEqual(['Choropleth', 'Line Chart', 'Bar Chart']);
  });

  it('exposes scores and reasons in the detailed form', () => {
    const detailed = recommendChartTypesDetailed(LIFE_EXP, LIFE_EXP_TYPES);
    expect(detailed[0].chartType).toBe('Choropleth');
    expect(detailed[0].score).toBeGreaterThan(detailed[1].score - 1); // sorted desc
    expect(detailed[0].reasons.join(' ')).toMatch(/geographic/i);
    // Monotonically non-increasing scores.
    for (let i = 1; i < detailed.length; i++) {
      expect(detailed[i - 1].score).toBeGreaterThanOrEqual(detailed[i].score);
    }
  });

  it('is deterministic across repeated calls', () => {
    const a = recommendChartTypes(LIFE_EXP, LIFE_EXP_TYPES);
    const b = recommendChartTypes(LIFE_EXP, LIFE_EXP_TYPES);
    expect(a).toEqual(b);
  });
});

describe('recommendChartTypes — other data shapes', () => {
  const first = (data: any[], types: Record<string, string>) =>
    recommendChartTypes(data, types)[0];

  it('picks Line Chart for a time series', () => {
    expect(first(
      [{ date: '2020-01-01', sales: 3 }, { date: '2020-02-01', sales: 5 }],
      { date: 'Date', sales: 'Amount' },
    )).toBe('Line Chart');
  });

  it('picks Bar Chart for a single category + measure', () => {
    const types = recommendChartTypes(
      [{ region: 'A', sales: 3 }, { region: 'B', sales: 5 }, { region: 'C', sales: 2 }, { region: 'D', sales: 4 }],
      { region: 'Category', sales: 'Amount' },
    );
    expect(types[0]).toBe('Bar Chart');
    expect(types).toContain('Pie Chart'); // few categories, one row each → part-to-whole
  });

  it('picks Scatter Plot for two measures', () => {
    expect(first(
      [{ height: 1, weight: 2 }, { height: 3, weight: 4 }],
      { height: 'Number', weight: 'Number' },
    )).toBe('Scatter Plot');
  });

  it('picks Histogram for a lone measure', () => {
    expect(first([{ v: 1 }, { v: 2 }, { v: 3 }], { v: 'Number' })).toBe('Histogram');
  });

  it('picks Map for latitude + longitude', () => {
    expect(first(
      [{ lat: 40.7, lon: -74, mag: 5 }, { lat: 34, lon: -118, mag: 4 }],
      { lat: 'Latitude', lon: 'Longitude', mag: 'Number' },
    )).toBe('Map');
  });
});

describe('recommendChartTypes — options', () => {
  it('filters to supportedTypes, preserving rank order', () => {
    const types = recommendChartTypes(LIFE_EXP, LIFE_EXP_TYPES, {
      supportedTypes: ['Bar Chart', 'Line Chart'],
    });
    expect(types).toEqual(['Line Chart', 'Bar Chart']);
  });

  it('caps the number of suggestions with max', () => {
    expect(recommendChartTypes(LIFE_EXP, LIFE_EXP_TYPES, { max: 2 }))
      .toEqual(['Choropleth', 'Line Chart']);
  });
});

describe('backend wrappers', () => {
  it('vlRecommendChartTypes restricts to Vega-Lite types and keeps Choropleth first', () => {
    const types = vlRecommendChartTypes(LIFE_EXP, LIFE_EXP_TYPES);
    expect(types[0]).toBe('Choropleth');
  });

  it('ecRecommendChartTypes / cjsRecommendChartTypes only return their own catalog', () => {
    // ECharts and Chart.js have no Choropleth/Map template, so those geographic
    // types must be filtered out even though the data is geographic.
    const ec = ecRecommendChartTypes(LIFE_EXP, LIFE_EXP_TYPES);
    const cjs = cjsRecommendChartTypes(LIFE_EXP, LIFE_EXP_TYPES);
    expect(ec).not.toContain('Choropleth');
    expect(ec).not.toContain('Map');
    expect(ec.length).toBeGreaterThan(0);
    expect(cjs).not.toContain('Choropleth');
    expect(cjs.length).toBeGreaterThan(0);
  });

  it('vlRecommendCharts pairs each type with fillable encodings (one step)', () => {
    const charts = vlRecommendCharts(LIFE_EXP, LIFE_EXP_TYPES);
    // Every returned chart is renderable (non-empty encodings).
    for (const c of charts) {
      expect(Object.keys(c.encodings).length).toBeGreaterThan(0);
    }
    // The top pick is a Choropleth with the region on `id` and the measure on `color`.
    const choropleth = charts.find(c => c.chartType === 'Choropleth')!;
    expect(choropleth).toBeDefined();
    expect(['Entity', 'Code']).toContain(choropleth.encodings.id);
    expect(choropleth.encodings.color).toBe('LifeExpectancyDiffFM');
  });
});

describe('encoding recommendation is deterministic and quality-aware', () => {
  it('vlRecommendEncodings returns the same result on repeated calls', () => {
    const runs = Array.from({ length: 5 }, () =>
      vlRecommendEncodings('Line Chart', LIFE_EXP, LIFE_EXP_TYPES),
    );
    for (const r of runs) expect(r).toEqual(runs[0]);
    // Time on x, measure on y, a country as the series.
    expect(runs[0].x).toBe('Year');
    expect(runs[0].y).toBe('LifeExpectancyDiffFM');
    expect(['Entity', 'Code']).toContain(runs[0].color);
  });

  it('prefers the lowest-cardinality field for the color/series channel', () => {
    // `label` (12 unique) makes every (label, series) pair unique, so both
    // `tier` (2) and `group` (4) are valid grouping fields. The recommender
    // must choose the smaller one for a more readable legend.
    const rows = Array.from({ length: 12 }, (_, i) => ({
      label: `L${i}`,
      tier: i % 2 === 0 ? 'lo' : 'hi',
      grp: `g${i % 4}`,
      val: i,
    }));
    const enc = vlRecommendEncodings('Grouped Bar Chart', rows, {
      label: 'Category', tier: 'Category', grp: 'Category', val: 'Amount',
    });
    expect(enc.x).toBe('label');
    expect(enc.y).toBe('val');
    // Grouped bars dodge by the `group` channel; the series is the 2-value field.
    expect(enc.group).toBe('tier');
  });
});
