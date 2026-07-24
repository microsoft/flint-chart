// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Tests for the four Plotly "registry gap" chart types closed in this pass:
 * Map, Choropleth, Sparkline, Bar Table.
 *
 * Map/Choropleth share their region-resolution gazetteer with the Vega-Lite
 * backend (`chart-types/geo.ts`) but render through Plotly's own native geo
 * traces (`scattergeo` / `choropleth`) rather than a fetched/joined TopoJSON.
 * Sparkline/Bar Table are composite, self-contained Plotly figures (their own
 * multi-axis-pair grid + paper-anchored annotations) that opt out of the
 * generic column/row facet combiner via `selfManagesFacets`.
 */

import { describe, it, expect } from 'vitest';
import { assemblePlotly, plGetTemplateDef, plAllTemplateDefs } from '../src';

function input(chartType: string, encodings: Record<string, unknown>, values: any[], semantic_types: Record<string, string>, chartProperties?: Record<string, unknown>) {
  return {
    data: { values },
    semantic_types,
    chart_spec: { chartType, encodings, baseSize: { width: 480, height: 320 }, ...(chartProperties ? { chartProperties } : {}) },
  } as any;
}

/** Recursively assert a value contains no functions (pure JSON, serializable). */
function assertNoFunctions(node: any, path = '$'): void {
  if (typeof node === 'function') throw new Error(`function found at ${path}`);
  if (node && typeof node === 'object') {
    for (const [k, v] of Object.entries(node)) assertNoFunctions(v, `${path}.${k}`);
  }
}

function assertSerializable(fig: any): void {
  assertNoFunctions(fig);
  expect(JSON.parse(JSON.stringify(fig))).toEqual(fig);
}

describe('Plotly gap charts — registration', () => {
  it('Map, Choropleth, Sparkline, Bar Table are registered', () => {
    for (const chart of ['Map', 'Choropleth', 'Sparkline', 'Bar Table']) {
      expect(plGetTemplateDef(chart), chart).toBeDefined();
    }
    const charts = plAllTemplateDefs.map(t => t.chart);
    expect(new Set(charts).size).toBe(charts.length); // no duplicate registrations
  });

  it('Sparkline and Bar Table opt out of the generic facet combiner', () => {
    expect(plGetTemplateDef('Sparkline')?.selfManagesFacets).toBe(true);
    expect(plGetTemplateDef('Bar Table')?.selfManagesFacets).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Map (bubble)
// ---------------------------------------------------------------------------

const US_CITIES = [
  { city: 'New York', lon: -74.01, lat: 40.71, pop: 18.9 },
  { city: 'Chicago', lon: -87.63, lat: 41.88, pop: 9.3 },
  { city: 'Denver', lon: -104.99, lat: 39.74, pop: 2.9 },
];
const WORLD_CITIES = [
  { city: 'Tokyo', lon: 139.69, lat: 35.68, pop: 37.4 },
  { city: 'Paris', lon: 2.35, lat: 48.86, pop: 11.1 },
  { city: 'Sydney', lon: 151.21, lat: -33.87, pop: 5.3 },
];

describe('Plotly Map', () => {
  it('uses a native scattergeo trace and infers a US scope from in-bounds lon/lat', () => {
    const fig = assemblePlotly(input('Map', { longitude: { field: 'lon' }, latitude: { field: 'lat' }, size: { field: 'pop' }, color: { field: 'pop' } },
      US_CITIES, { city: 'City', lon: 'Longitude', lat: 'Latitude', pop: 'Quantity' }));
    expect(fig.data[0].type).toBe('scattergeo');
    expect(fig.layout.geo.scope).toBe('usa');
    expect(fig.data[0].lon).toEqual(US_CITIES.map(r => r.lon));
    assertSerializable(fig);
  });

  it('infers a World scope when a point falls outside the US bounding box', () => {
    const fig = assemblePlotly(input('Map', { longitude: { field: 'lon' }, latitude: { field: 'lat' }, size: { field: 'pop' } },
      WORLD_CITIES, { city: 'City', lon: 'Longitude', lat: 'Latitude', pop: 'Quantity' }));
    expect(fig.layout.geo.scope).toBe('world');
  });

  it('an explicit `region` property overrides inference', () => {
    const fig = assemblePlotly(input('Map', { longitude: { field: 'lon' }, latitude: { field: 'lat' } },
      US_CITIES, { lon: 'Longitude', lat: 'Latitude' }, { region: 'world' }));
    expect(fig.layout.geo.scope).toBe('world');
  });

  it('quantitative color uses a continuous colorscale (Viridis), not a per-value legend', () => {
    const fig = assemblePlotly(input('Map', { longitude: { field: 'lon' }, latitude: { field: 'lat' }, color: { field: 'pop' } },
      US_CITIES, { lon: 'Longitude', lat: 'Latitude', pop: 'Quantity' }));
    expect(fig.data).toHaveLength(1);
    expect(fig.data[0].marker.showscale).toBe(true);
    expect(fig.layout.showlegend).toBe(false);
  });

  it('nominal color groups into one trace per value with a legend', () => {
    const rows = US_CITIES.map((r, i) => ({ ...r, region: i === 2 ? 'West' : 'East' }));
    const fig = assemblePlotly(input('Map', { longitude: { field: 'lon' }, latitude: { field: 'lat' }, color: { field: 'region' } },
      rows, { lon: 'Longitude', lat: 'Latitude', region: 'Category' }));
    expect(fig.data.length).toBe(2);
    expect(fig.layout.showlegend).toBe(true);
    expect(fig.data.map((d: any) => d.name).sort()).toEqual(['East', 'West']);
  });

  it('bubble diameters scale with `size` (sqrt/area-truth, not linear)', () => {
    const rows = [{ lon: -74, lat: 40, v: 1 }, { lon: -87, lat: 41, v: 100 }];
    const fig = assemblePlotly(input('Map', { longitude: { field: 'lon' }, latitude: { field: 'lat' }, size: { field: 'v' } },
      rows, { lon: 'Longitude', lat: 'Latitude', v: 'Quantity' }));
    const [d0, d1] = fig.data[0].marker.size;
    // sqrt(100)/sqrt(1) = 10, so the diameter ratio should be well under 100/1.
    expect(d1 / d0).toBeGreaterThan(1);
    expect(d1 / d0).toBeLessThan(10);
  });
});

// ---------------------------------------------------------------------------
// Choropleth
// ---------------------------------------------------------------------------

describe('Plotly Choropleth', () => {
  it('uses a native choropleth trace with USPS codes + USA-states locationmode for US states', () => {
    const rows = [{ state: 'California', pop: 39.5 }, { state: 'Texas', pop: 29.1 }, { state: 'NY', pop: 20.2 }];
    const fig = assemblePlotly(input('Choropleth', { id: { field: 'state' }, color: { field: 'pop' } },
      rows, { state: 'State', pop: 'Quantity' }));
    expect(fig.data[0].type).toBe('choropleth');
    expect(fig.data[0].locationmode).toBe('USA-states');
    expect(fig.data[0].locations).toEqual(['CA', 'TX', 'NY']);
    expect(fig.layout.geo.scope).toBe('usa');
    assertSerializable(fig);
  });

  it('uses ISO-3 codes + ISO-3 locationmode for world countries', () => {
    const rows = [{ country: 'China', pop: 1410 }, { country: 'USA', pop: 339 }, { country: 'FR', pop: 68 }];
    const fig = assemblePlotly(input('Choropleth', { id: { field: 'country' }, color: { field: 'pop' } },
      rows, { country: 'Country', pop: 'Quantity' }));
    expect(fig.data[0].locationmode).toBe('ISO-3');
    expect(fig.data[0].locations).toEqual(['CHN', 'USA', 'FRA']);
    expect(fig.layout.geo.scope).toBe('world');
  });

  it('disambiguates a colliding name ("Georgia") by the id field\'s semantic type', () => {
    const usRows = [{ place: 'Georgia', pop: 10.7 }];
    const usFig = assemblePlotly(input('Choropleth', { id: { field: 'place' }, color: { field: 'pop' } }, usRows, { place: 'State', pop: 'Quantity' }));
    expect(usFig.data[0].locationmode).toBe('USA-states');
    expect(usFig.data[0].locations).toEqual(['GA']); // Georgia (US state)

    const countryRows = [{ place: 'Georgia', pop: 3.7 }];
    const worldFig = assemblePlotly(input('Choropleth', { id: { field: 'place' }, color: { field: 'pop' } }, countryRows, { place: 'Country', pop: 'Quantity' }));
    expect(worldFig.data[0].locationmode).toBe('ISO-3');
    expect(worldFig.data[0].locations).toEqual(['GEO']); // Georgia (the country)
  });

  it('uses an explicit light-to-dark sequential colorscale (not Plotly\'s inverted stock "Blues")', () => {
    const rows = [{ state: 'California', pop: 39.5 }, { state: 'Texas', pop: 29.1 }];
    const fig = assemblePlotly(input('Choropleth', { id: { field: 'state' }, color: { field: 'pop' } }, rows, { state: 'State', pop: 'Quantity' }));
    const scale = fig.data[0].colorscale;
    expect(Array.isArray(scale)).toBe(true); // an explicit stop array, not the string 'Blues'
    expect(scale[0][0]).toBe(0);
    expect(scale[scale.length - 1][0]).toBe(1);
  });

  it('rows that fail to resolve to a code are dropped, not left as invalid locations', () => {
    const rows = [{ state: 'California', pop: 39.5 }, { state: 'Not A Real Place', pop: 1 }];
    const fig = assemblePlotly(input('Choropleth', { id: { field: 'state' }, color: { field: 'pop' } }, rows, { state: 'State', pop: 'Quantity' }));
    expect(fig.data[0].locations).toEqual(['CA']);
  });
});

// ---------------------------------------------------------------------------
// Sparkline
// ---------------------------------------------------------------------------

const SPARK_ROWS = [
  { month: '2025-01', value: 10, metric: 'Electronics' },
  { month: '2025-02', value: 14, metric: 'Electronics' },
  { month: '2025-03', value: 12, metric: 'Electronics' },
  { month: '2025-01', value: 30, metric: 'Clothing' },
  { month: '2025-02', value: 28, metric: 'Clothing' },
  { month: '2025-03', value: 34, metric: 'Clothing' },
];

describe('Plotly Sparkline', () => {
  it('one strip (own hidden axis pair) per series, colored by the `color` field', () => {
    const fig = assemblePlotly(input('Sparkline', { x: { field: 'month' }, y: { field: 'value' }, color: { field: 'metric' } },
      SPARK_ROWS, { month: 'Date', value: 'Quantity', metric: 'Category' }));
    // 2 series x (1 line + 1 mean reference line) = 4 traces.
    expect(fig.data.filter((d: any) => d.mode === 'lines' && d.line.dash == null)).toHaveLength(2);
    expect(fig.layout.xaxis.visible).toBe(false);
    expect(fig.layout.yaxis.visible).toBe(false);
    expect(fig.layout.xaxis2.visible).toBe(false);
    // Category name + aggregate value annotations, one pair per series, plus 3 column headers.
    const seriesNameAnn = fig.layout.annotations.filter((a: any) => a.text === 'Electronics' || a.text === 'Clothing');
    expect(seriesNameAnn.length).toBe(2);
    assertSerializable(fig);
  });

  it('is monochrome (no per-series hue) when only `detail` is bound', () => {
    const fig = assemblePlotly(input('Sparkline', { x: { field: 'month' }, y: { field: 'value' }, detail: { field: 'metric' } },
      SPARK_ROWS, { month: 'Date', value: 'Quantity', metric: 'Category' }));
    const lineTraces = fig.data.filter((d: any) => d.mode === 'lines' && d.line.dash == null);
    expect(lineTraces).toHaveLength(2);
    for (const t of lineTraces) expect(t.line.color).toBe('#555');
  });

  it('baseline: "zero" draws a reference line at 0, "none" omits it', () => {
    const zeroFig = assemblePlotly(input('Sparkline', { x: { field: 'month' }, y: { field: 'value' }, color: { field: 'metric' } },
      SPARK_ROWS, { month: 'Date', value: 'Quantity', metric: 'Category' }, { baseline: 'zero' }));
    const dashed = zeroFig.data.filter((d: any) => d.line?.dash === 'dot');
    expect(dashed.length).toBe(2);
    expect(dashed.every((d: any) => d.y[0] === 0 && d.y[1] === 0)).toBe(true);

    const noneFig = assemblePlotly(input('Sparkline', { x: { field: 'month' }, y: { field: 'value' }, color: { field: 'metric' } },
      SPARK_ROWS, { month: 'Date', value: 'Quantity', metric: 'Category' }, { baseline: 'none' }));
    expect(noneFig.data.filter((d: any) => d.line?.dash === 'dot')).toHaveLength(0);
  });

  it('a single (unseriesed) sparkline renders one strip with no series column', () => {
    const rows = SPARK_ROWS.filter(r => r.metric === 'Electronics').map(({ month, value }) => ({ month, value }));
    const fig = assemblePlotly(input('Sparkline', { x: { field: 'month' }, y: { field: 'value' } }, rows, { month: 'Date', value: 'Quantity' }));
    expect(fig.data.filter((d: any) => d.mode === 'lines' && d.line.dash == null)).toHaveLength(1);
  });

  it('does nothing destructive with an incidental column binding (self-managed facets)', () => {
    // Sparkline doesn't declare `column` in its channels, but the pipeline
    // resolves whatever encodings are supplied — this must not crash or be
    // silently pre-split by the generic facet combiner.
    const fig = assemblePlotly(input('Sparkline',
      { x: { field: 'month' }, y: { field: 'value' }, color: { field: 'metric' }, column: { field: 'metric' } },
      SPARK_ROWS, { month: 'Date', value: 'Quantity', metric: 'Category' }));
    expect(fig._facet).toBeUndefined();
    expect(Array.isArray(fig.data)).toBe(true);
    expect(fig.data.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// Bar Table
// ---------------------------------------------------------------------------

const RANKED_ROWS = [
  { category: 'Electronics', value: 331200 },
  { category: 'Bicycles', value: 89800 },
  { category: 'Perfume', value: 57700 },
  { category: 'Apparel', value: 48200 },
  { category: 'Furniture', value: 32100 },
];

describe('Plotly Bar Table', () => {
  it('one horizontal bar trace, ranked by value, when there is no color field', () => {
    const fig = assemblePlotly(input('Bar Table', { y: { field: 'category' }, x: { field: 'value' } }, RANKED_ROWS, { category: 'Category', value: 'Amount' }));
    expect(fig.data).toHaveLength(1);
    expect(fig.data[0].type).toBe('bar');
    expect(fig.data[0].orientation).toBe('h');
    expect(fig.data[0].y).toEqual(['Electronics', 'Bicycles', 'Perfume', 'Apparel', 'Furniture']); // sorted descending
    assertSerializable(fig);
  });

  it('Top-N rollup buckets the tail into a single "Others (+N)" row', () => {
    const fig = assemblePlotly(input('Bar Table', { y: { field: 'category' }, x: { field: 'value' } },
      RANKED_ROWS, { category: 'Category', value: 'Amount' }, { maxRows: 3 }));
    expect(fig.data[0].y).toEqual(['Electronics', 'Bicycles', 'Others (+3)']);
  });

  it('maxRows: 0 disables the Top-N rollup', () => {
    const fig = assemblePlotly(input('Bar Table', { y: { field: 'category' }, x: { field: 'value' } },
      RANKED_ROWS, { category: 'Category', value: 'Amount' }, { maxRows: 0 }));
    expect(fig.data[0].y).toHaveLength(5);
  });

  it('showPercent adds a "%" annotation column', () => {
    const withoutPct = assemblePlotly(input('Bar Table', { y: { field: 'category' }, x: { field: 'value' } }, RANKED_ROWS, { category: 'Category', value: 'Amount' }));
    const withPct = assemblePlotly(input('Bar Table', { y: { field: 'category' }, x: { field: 'value' } }, RANKED_ROWS, { category: 'Category', value: 'Amount' }, { showPercent: true }));
    expect(withPct.layout.annotations.some((a: any) => /%$/.test(a.text))).toBe(true);
    expect(withoutPct.layout.annotations.some((a: any) => /%$/.test(a.text))).toBe(false);
  });

  it('a mixed-sign measure uses a diverging (not sequential) gradient', () => {
    const rows = [{ dept: 'Engineering', variance: 120 }, { dept: 'Sales', variance: -45 }, { dept: 'HR', variance: -20 }];
    const fig = assemblePlotly(input('Bar Table', { y: { field: 'dept' }, x: { field: 'variance' } }, rows, { dept: 'Category', variance: 'Quantity' }));
    const colors = new Set(fig.data[0].marker.color);
    expect(colors.size).toBeGreaterThan(1); // gradient, not a flat color
  });

  it('a color field stacks one trace per group with a legend', () => {
    const rows = [
      { sku: 'Home', region: 'East', revenue: 100 }, { sku: 'Home', region: 'West', revenue: 80 },
      { sku: 'Garden', region: 'East', revenue: 60 }, { sku: 'Garden', region: 'West', revenue: 40 },
    ];
    const fig = assemblePlotly(input('Bar Table', { y: { field: 'sku' }, x: { field: 'revenue' }, color: { field: 'region' } }, rows, { sku: 'Category', revenue: 'Amount', region: 'Category' }));
    expect(fig.layout.barmode).toBe('stack');
    expect(fig.layout.showlegend).toBe(true);
    expect(new Set(fig.data.map((d: any) => d.name))).toEqual(new Set(['East', 'West']));
  });

  it('column facets lay out independent per-cell axis pairs, correctly anchored to each other', () => {
    const rows = [
      { agency: 'SpaceX', type: 'private', launches: 65 }, { agency: 'ULA', type: 'private', launches: 12 },
      { agency: 'RVSN', type: 'state', launches: 40 }, { agency: 'NASA', type: 'state', launches: 20 },
    ];
    const fig = assemblePlotly(input('Bar Table', { y: { field: 'agency' }, x: { field: 'launches' }, column: { field: 'type' } },
      rows, { agency: 'Category', launches: 'Amount', type: 'Category' }));
    // Regression test: each per-cell yaxis must anchor to ITS OWN xaxis (not
    // all default to the same one), else every cell's category tick labels
    // draw at the same horizontal position and visually collide (see
    // bar-table.ts's docstring / the anchor fix in this pass).
    expect(fig.layout.yaxis.anchor).toBe('x');
    expect(fig.layout.yaxis2.anchor).toBe('x2');
    expect(fig.layout.xaxis.anchor).toBe('y');
    expect(fig.layout.xaxis2.anchor).toBe('y2');
    // Two distinct, non-overlapping horizontal domains (side-by-side cells).
    const [x0a, x1a] = fig.layout.xaxis.domain;
    const [x0b] = fig.layout.xaxis2.domain;
    expect(x1a).toBeLessThanOrEqual(x0b);
    void x0a;
  });

  it('does not crash and produces pure-JSON output on a single-row table', () => {
    const fig = assemblePlotly(input('Bar Table', { y: { field: 'region' }, x: { field: 'revenue' } }, [{ region: 'APAC', revenue: 4250000 }], { region: 'Region', revenue: 'Amount' }));
    expect(fig.data).toHaveLength(1);
    expect(fig._height).toBeGreaterThanOrEqual(70);
    assertSerializable(fig);
  });

  it('very small (sub-1) values are not rounded away to "0"', () => {
    const rows = [{ sensor: 'A', reading: 0.0023 }, { sensor: 'B', reading: 0.0011 }];
    const fig = assemblePlotly(input('Bar Table', { y: { field: 'sensor' }, x: { field: 'reading' } }, rows, { sensor: 'Category', reading: 'Quantity' }));
    const valueAnn = fig.layout.annotations.filter((a: any) => /^0\.\d+$/.test(a.text));
    expect(valueAnn.length).toBe(2);
  });
});
