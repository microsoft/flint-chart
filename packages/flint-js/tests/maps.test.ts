// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite } from '../src';
import { resolveCountry, resolveCountryCode, resolveUsState } from '../src/chart-types/geo';

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

/** The unit drawing the regions: the map itself, or the layer whose colour comes from a field (a world map dots its disputed borders over it). */
const regionsOf = (spec: any): any => (Array.isArray(spec?.layer) ? spec.layer.find((layer: any) => layer.encoding?.color?.field) : spec);

function buildChoropleth(
  rows: Row[],
  idField: string,
  valueField: string,
  /** Omitted to let the chart infer the region from the values alone. */
  semanticType?: string,
  region?: 'auto' | 'us' | 'world',
): ChoroplethResult {
  const spec = assembleVegaLite({
    data: { values: rows },
    semantic_types: { ...(semanticType ? { [idField]: semanticType } : {}), [valueField]: 'Quantity' },
    chart_spec: {
      chartType: 'Choropleth',
      encodings: { id: idField, color: valueField },
      baseSize: { width: 500, height: 300 },
      ...(region ? { chartProperties: { region } } : {}),
    },
  }) as any;

  const joined = new Map<any, any>();
  const values = regionsOf(spec)?.transform?.find((transform: any) => transform.lookup)?.from?.data?.values ?? [];
  for (const r of values) joined.set(r[idField], r.__geo_id);

  return {
    spec,
    feature: regionsOf(spec)?.data?.format?.feature,
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
    expect(r.projection).toBe('identity');
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
    expect(r.projection).toBe('identity');
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
    expect(auto.projection).toBe('identity');
  });

  it('colors the geoshape by the measure and keeps the TopoJSON as base data', () => {
    const rows = [
      { state: 'California', pop: 39.5 },
      { state: 'Texas', pop: 29.1 },
    ];
    const regions = regionsOf(buildChoropleth(rows, 'state', 'pop', 'State').spec);

    expect(regions.data?.url).toContain('counties-albers-10m');
    expect(regions.mark?.type).toBe('geoshape');
    expect(regions.encoding?.color?.field).toBe('pop');
    expect(regions.transform?.find((transform: any) => transform.lookup)?.lookup).toBe('id');
    expect(regions.transform?.find((transform: any) => transform.lookup)?.from?.key).toBe('__geo_id');
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

    expect(regionsOf(spec).encoding.color.scale).toMatchObject({
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
    expect(resolveUsState('Calif.')).toBe(6);
    expect(resolveUsState('Wash.')).toBe(53);
    expect(resolveUsState('N. Carolina')).toBe(37);
    expect(resolveUsState('S. Dakota')).toBe(46);
    expect(resolveUsState('California, USA')).toBe(6);
    expect(resolveUsState('Washington State')).toBe(53);
    // Two spellings of one state join as one region.
    expect([...r.joined.values()].sort((a, b) => a - b)).toEqual([6, 37, 46, 53]);
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
    expect(resolveCountry('Holland')).toBe(528);
    expect(resolveCountry('S. Korea')).toBe(410);
    expect(resolveCountry('Korea, Rep.')).toBe(410);
    expect(resolveCountry('Côte d’Ivoire')).toBe(384);
    expect(resolveCountry('Türkiye')).toBe(792);
    // Two spellings of one country join as one region.
    expect([...r.joined.values()].sort((a, b) => a - b)).toEqual([384, 410, 528, 792]);
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

describe('Choropleth level', () => {
  const rows = [
    { FIPS: 1079, County: 'Lawrence, AL', Value: 0.23 },
    { FIPS: 6037, County: 'Los Angeles, CA', Value: -0.5 },
  ];
  const build = (chartProperties: Record<string, unknown>) => assembleVegaLite({
    data: { values: rows },
    semantic_types: { FIPS: 'Category', County: 'Category', Value: 'Quantity' },
    chart_spec: {
      chartType: 'Choropleth',
      encodings: { id: 'FIPS', color: 'Value', detail: 'County' },
      chartProperties,
    },
  } as any) as any;

  it('draws counties from the same pre-projected US atlas and passes numeric FIPS ids through', () => {
    const spec = build({ region: 'us', level: 'county' });
    const regions = regionsOf(spec);
    expect(regions.data.url).toContain('counties-albers-10m');
    expect(regions.data.format.feature).toBe('counties');
    expect(spec.projection.type).toBe('identity');
    expect(regions.mark.strokeWidth).toBe(0.2);
    const joined = regions.transform.find((transform: any) => transform.lookup).from.data.values;
    expect(joined.map((row: any) => row.__geo_id)).toEqual([1079, 6037]);
  });

  it('keeps the state layer by default and on the world map', () => {
    expect(regionsOf(build({ region: 'us' })).data.format.feature).toBe('states');
    expect(regionsOf(build({ region: 'world', level: 'county' })).data.format.feature).toBe('countries');
  });
});

describe('choropleth scope from numeric ids', () => {
  const scope = (ids: number[], semanticType = 'Category') =>
    buildChoropleth(ids.map((id, i) => ({ id, v: i })), 'id', 'v', semanticType).feature;

  it('draws ISO 3166 numeric country codes on the world map', () => {
    // Afghanistan 4, India 356, United States 840: a world dataset keyed by map_id.
    expect(scope([4, 356, 840])).toBe('countries');
    expect(scope([8, 12, 36, 104])).toBe('countries');
  });

  it('keeps FIPS state codes, territories included, on the US map', () => {
    expect(scope([6, 36, 48])).toBe('states');
    expect(scope([6, 72, 78])).toBe('states');
  });
});

describe('the country gazetteer covers the world map', () => {
  /** Every country feature id in Vega's world-110m.json (its -99 shapes are disputed areas with no ISO code). */
  const WORLD_110M_IDS = [4, 8, 10, 12, 24, 31, 32, 36, 40, 44, 50, 51, 56, 64, 68, 70, 72, 76, 84, 90, 96, 100, 104, 108, 112, 116, 120, 124, 140, 144, 148, 152, 156, 158, 170, 178, 180, 188, 191, 192, 196, 203, 204, 208, 214, 218, 222, 226, 231, 232, 233, 238, 242, 246, 250, 260, 262, 266, 268, 270, 275, 276, 288, 300, 304, 320, 324, 328, 332, 340, 348, 352, 356, 360, 364, 368, 372, 376, 380, 384, 388, 392, 398, 400, 404, 408, 410, 414, 417, 418, 422, 426, 428, 430, 434, 440, 442, 450, 454, 458, 466, 478, 484, 496, 498, 499, 504, 508, 512, 516, 524, 528, 540, 548, 554, 558, 562, 566, 578, 586, 591, 598, 600, 604, 608, 616, 620, 624, 626, 630, 634, 642, 643, 646, 682, 686, 688, 694, 703, 704, 705, 706, 710, 716, 724, 728, 729, 732, 740, 748, 752, 756, 760, 762, 764, 768, 780, 784, 788, 792, 795, 800, 804, 807, 818, 826, 834, 840, 854, 858, 860, 862, 887, 894];

  it('resolves every map country from its ISO alpha-3 code', () => {
    const missing = WORLD_110M_IDS.filter((id) => {
      const a3 = resolveCountryCode(id);
      return !a3 || resolveCountry(a3) !== id;
    });
    expect(missing).toEqual([]);
  });

  it('reads the names Our World in Data and the UN use', () => {
    const cases: Record<string, number> = {
      Albania: 8, Botswana: 72, Namibia: 516, Greenland: 304, Kyrgyzstan: 417, 'South Sudan': 728,
      Congo: 178, 'Democratic Republic of Congo': 180, 'East Timor': 626, Eswatini: 748, Swaziland: 748,
      'North Macedonia': 807, 'Bosnia and Herzegovina': 70, 'Papua New Guinea': 598, Palestine: 275,
      'Guinea-Bissau': 624, Guinea: 324, 'Equatorial Guinea': 226, Gambia: 270, "Cote d'Ivoire": 384,
    };
    for (const [name, id] of Object.entries(cases)) expect(resolveCountry(name), name).toBe(id);
  });

  it('keeps state data on the US map despite a total or a stray foreign row', () => {
    const rows = ['California', 'Texas', 'New York', 'United States'].map((name, v) => ({ name, v }));
    expect(buildChoropleth(rows, 'name', 'v').feature).toBe('states');
    expect(buildChoropleth([...rows, { name: 'Canada', v: 9 }], 'name', 'v').feature).toBe('states');
    // Mostly countries stay on the world map.
    expect(buildChoropleth(['France', 'Germany', 'Georgia'].map((name, v) => ({ name, v })), 'name', 'v').feature).toBe('countries');
  });

  it('still keeps colliding US state codes on the US map', () => {
    const rows = ['AL', 'GA', 'MD', 'ME', 'NC', 'SC'].map((st, v) => ({ st, v }));
    expect(buildChoropleth(rows, 'st', 'v').feature).toBe('states');
  });
});

describe('a colour key formats its numbers like an axis would', () => {
  it('labels a ramp of percentage changes as percentages', () => {
    const spec: any = assembleVegaLite({
      data: { values: [{ Country: 'Norway', Change: -0.2 }, { Country: 'Brazil', Change: 0.1 }] },
      // The stated domain tells a fraction from percentage points, as it does for an axis.
      semantic_types: { Country: 'Country', Change: { semanticType: 'PercentageChange', intrinsicDomain: [-1, 1] } },
      chart_spec: { chartType: 'Choropleth', encodings: { id: 'Country', color: 'Change' }, chartProperties: { region: 'world' } },
    } as any);
    const legend = regionsOf(spec).encoding.color.legend;
    expect(legend.format ?? legend.labelExpr).toMatch(/%/);
  });

  it('leaves a key on a plain count alone', () => {
    const spec: any = assembleVegaLite({
      data: { values: [{ State: 'CA', N: 3 }, { State: 'TX', N: 5 }] },
      semantic_types: { State: 'State', N: 'Count' },
      chart_spec: { chartType: 'Choropleth', encodings: { id: 'State', color: 'N' } },
    } as any);
    expect(regionsOf(spec).encoding.color.legend?.format ?? '').not.toMatch(/%/);
  });
});
