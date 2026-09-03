// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite } from '../src';

/**
 * Name-based map creation.
 *
 * The generic `Choropleth` chart type takes a region key on the `id` channel
 * and a measure on `color`. Real datasets identify regions by *name*
 * ("California", "United States") or by a familiar code (USPS "CA", ISO "US" /
 * "USA"), never by the raw numeric TopoJSON feature ids. These tests feed names
 * and codes and assert the template's gazetteer resolves them to the correct
 * `us-10m.json` (FIPS) / `world-110m.json` (ISO numeric) feature ids, and that
 * the US-vs-World frame is auto-detected (preferring the US).
 */

type Row = Record<string, any>;

interface ChoroplethResult {
  spec: any;
  feature: string | undefined;
  projection: string | undefined;
  /** region key (as supplied on the `id` channel) → resolved __geo_id */
  joined: Map<any, any>;
}

function buildChoropleth(
  rows: Row[],
  idField: string,
  valueField: string,
  semanticType: string,
  region?: 'auto' | 'us' | 'world',
): ChoroplethResult {
  const spec = assembleVegaLite({
    data: { values: rows },
    semantic_types: { [idField]: semanticType, [valueField]: 'Quantity' },
    chart_spec: {
      chartType: 'Choropleth',
      encodings: { id: idField, color: valueField },
      baseSize: { width: 500, height: 300 },
      ...(region ? { chartProperties: { region } } : {}),
    },
  }) as any;

  const joined = new Map<any, any>();
  const values = spec?.transform?.[0]?.from?.data?.values ?? [];
  for (const r of values) joined.set(r[idField], r.__geo_id);

  return {
    spec,
    feature: spec?.data?.format?.feature,
    projection: spec?.projection?.type,
    joined,
  };
}

describe('choropleth maps from names', () => {
  it('resolves US state names to FIPS feature ids and auto-detects a US frame', () => {
    const rows = [
      { state: 'California', pop: 39.5 },
      { state: 'Texas', pop: 29.1 },
      { state: 'New York', pop: 20.2 },
      { state: 'District of Columbia', pop: 0.69 },
    ];
    const r = buildChoropleth(rows, 'state', 'pop', 'State');

    expect(r.feature).toBe('states');
    expect(r.projection).toBe('albersUsa');
    expect(r.joined.get('California')).toBe(6);
    expect(r.joined.get('Texas')).toBe(48);
    expect(r.joined.get('New York')).toBe(36);
    expect(r.joined.get('District of Columbia')).toBe(11);
  });

  it('resolves USPS state codes (case-insensitive) to the same FIPS ids', () => {
    const rows = [
      { st: 'CA', pop: 39.5 },
      { st: 'tx', pop: 29.1 },
      { st: 'NY', pop: 20.2 },
    ];
    const r = buildChoropleth(rows, 'st', 'pop', 'State');

    expect(r.feature).toBe('states');
    expect(r.projection).toBe('albersUsa');
    expect(r.joined.get('CA')).toBe(6);
    expect(r.joined.get('tx')).toBe(48);
    expect(r.joined.get('NY')).toBe(36);
  });

  it('resolves country names to ISO numeric feature ids and auto-detects a world frame', () => {
    const rows = [
      { country: 'China', pop: 1410 },
      { country: 'United States', pop: 339 },
      { country: 'Brazil', pop: 216 },
      { country: 'Germany', pop: 84 },
    ];
    const r = buildChoropleth(rows, 'country', 'pop', 'Country');

    expect(r.feature).toBe('countries');
    expect(r.projection).toBe('equalEarth');
    expect(r.joined.get('China')).toBe(156);
    expect(r.joined.get('United States')).toBe(840);
    expect(r.joined.get('Brazil')).toBe(76);
    expect(r.joined.get('Germany')).toBe(276);
  });

  it('resolves ISO alpha-2 / alpha-3 codes and common country aliases', () => {
    const rows = [
      { code: 'CN', pop: 1410 },   // alpha-2
      { code: 'USA', pop: 339 },   // alpha-3
      { code: 'UK', pop: 67 },     // alias → United Kingdom
      { code: 'DRC', pop: 102 },   // alias → DR Congo
    ];
    const r = buildChoropleth(rows, 'code', 'pop', 'Country');

    expect(r.feature).toBe('countries');
    expect(r.joined.get('CN')).toBe(156);
    expect(r.joined.get('USA')).toBe(840);
    expect(r.joined.get('UK')).toBe(826);
    expect(r.joined.get('DRC')).toBe(180);
  });

  it('honors an explicit region override over name-based inference', () => {
    const usNames = [
      { state: 'California', pop: 39.5 },
      { state: 'Texas', pop: 29.1 },
    ];
    // Forcing 'world' switches the base map even though the names are US states.
    const forced = buildChoropleth(usNames, 'state', 'pop', 'State', 'world');
    expect(forced.feature).toBe('countries');
    expect(forced.projection).toBe('equalEarth');

    // 'auto' on the same data resolves back to the US frame.
    const auto = buildChoropleth(usNames, 'state', 'pop', 'State', 'auto');
    expect(auto.feature).toBe('states');
    expect(auto.projection).toBe('albersUsa');
  });

  it('colors the geoshape by the measure and keeps the TopoJSON as base data', () => {
    const rows = [
      { state: 'California', pop: 39.5 },
      { state: 'Texas', pop: 29.1 },
    ];
    const { spec } = buildChoropleth(rows, 'state', 'pop', 'State');

    expect(spec.data?.url).toContain('us-10m.json');
    expect(spec.mark?.type).toBe('geoshape');
    expect(spec.encoding?.color?.field).toBe('pop');
    expect(spec.transform?.[0]?.lookup).toBe('id');
    expect(spec.transform?.[0]?.from?.key).toBe('__geo_id');
  });

  it('keeps a declared quantitative color domain stable and centered', () => {
    const spec = assembleVegaLite({
      data: { values: [{ state: 'CA', margin: 30 }, { state: 'TX', margin: -14 }] },
      semantic_types: {
        state: 'State',
        margin: { semanticType: 'Quantity', intrinsicDomain: [-100, 100] },
      },
      chart_spec: {
        chartType: 'Choropleth',
        encodings: { id: 'state', color: { field: 'margin', scheme: 'redblue' } },
      },
    }) as any;

    expect(spec.encoding.color.scale).toMatchObject({
      domain: [-100, 100],
      clamp: true,
      scheme: 'redblue',
    });
  });
});

describe('choropleth lookup robustness', () => {
  it('uses the id field semantic type to disambiguate colliding codes/names', () => {
    // "CA", "IN" and "Georgia" all exist in BOTH namespaces. The declared
    // semantic type — not value inference — decides which map and resolver win.
    const codes = [{ region: 'CA', v: 1 }, { region: 'IN', v: 2 }, { region: 'Georgia', v: 3 }];

    const asStates = buildChoropleth(codes, 'region', 'v', 'State');
    expect(asStates.feature).toBe('states');
    expect(asStates.joined.get('CA')).toBe(6);       // California
    expect(asStates.joined.get('IN')).toBe(18);      // Indiana
    expect(asStates.joined.get('Georgia')).toBe(13); // Georgia (US state)

    const asCountries = buildChoropleth(codes, 'region', 'v', 'Country');
    expect(asCountries.feature).toBe('countries');
    expect(asCountries.joined.get('CA')).toBe(124);      // Canada
    expect(asCountries.joined.get('IN')).toBe(356);      // India
    expect(asCountries.joined.get('Georgia')).toBe(268); // Georgia (country)
  });

  it('keeps a State-typed dataset on the US map even when a value is unresolvable', () => {
    // Value inference alone flips to world on the first miss; the semantic type
    // pins the scope so the resolvable USPS codes still join correctly.
    const rows = [
      { st: 'CA', v: 1 },
      { st: '???', v: 2 },  // garbage — would otherwise flip the frame
      { st: 'NY', v: 3 },
    ];
    const r = buildChoropleth(rows, 'st', 'v', 'State');
    expect(r.feature).toBe('states');
    expect(r.joined.get('CA')).toBe(6);
    expect(r.joined.get('NY')).toBe(36);
  });

  it('resolves AP-style abbreviations, directional and qualified state forms', () => {
    const rows = [
      { s: 'Calif.', v: 1 },            // AP abbreviation
      { s: 'Wash.', v: 2 },
      { s: 'N. Carolina', v: 3 },       // directional shorthand
      { s: 'S. Dakota', v: 4 },
      { s: 'California, USA', v: 5 },    // qualified
      { s: 'Washington State', v: 6 },
    ];
    const r = buildChoropleth(rows, 's', 'v', 'State');
    expect(r.feature).toBe('states');
    expect(r.joined.get('Calif.')).toBe(6);
    expect(r.joined.get('Wash.')).toBe(53);
    expect(r.joined.get('N. Carolina')).toBe(37);
    expect(r.joined.get('S. Dakota')).toBe(46);
    expect(r.joined.get('California, USA')).toBe(6);
    expect(r.joined.get('Washington State')).toBe(53);
  });

  it('resolves country aliases, alternate forms and accented names', () => {
    const rows = [
      { c: 'Holland', v: 1 },            // → Netherlands
      { c: 'S. Korea', v: 2 },           // → South Korea
      { c: 'Korea, Rep.', v: 3 },        // → South Korea
      { c: 'Côte d’Ivoire', v: 4 },      // accented → Ivory Coast
      { c: 'Türkiye', v: 5 },            // → Turkey
    ];
    const r = buildChoropleth(rows, 'c', 'v', 'Country');
    expect(r.feature).toBe('countries');
    expect(r.joined.get('Holland')).toBe(528);
    expect(r.joined.get('S. Korea')).toBe(410);
    expect(r.joined.get('Korea, Rep.')).toBe(410);
    expect(r.joined.get('Côte d’Ivoire')).toBe(384);
    expect(r.joined.get('Türkiye')).toBe(792);
  });

  it('resolves the expanded set of countries verified against world-110m', () => {
    const rows = [
      { c: 'Georgia', v: 1 }, { c: 'Nepal', v: 2 }, { c: 'Cuba', v: 3 },
      { c: 'Qatar', v: 4 }, { c: 'Croatia', v: 5 }, { c: 'Taiwan', v: 6 },
    ];
    const r = buildChoropleth(rows, 'c', 'v', 'Country');
    expect(r.joined.get('Georgia')).toBe(268);
    expect(r.joined.get('Nepal')).toBe(524);
    expect(r.joined.get('Cuba')).toBe(192);
    expect(r.joined.get('Qatar')).toBe(634);
    expect(r.joined.get('Croatia')).toBe(191);
    expect(r.joined.get('Taiwan')).toBe(158);
  });
});
