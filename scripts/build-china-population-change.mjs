// Builds the China population-change map: a 2010→2020 table at province, prefecture and county
// level, and one TopoJSON with the three levels' boundaries. They join on `Key`, the level and the
// national administrative code (`county:429004`): a county that is its own prefecture shares its code.
//
// Run: node scripts/build-china-population-change.mjs        (writes site/public/map-data/)
//      node scripts/build-china-population-change.mjs --check (fails if the outputs are stale)

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { csvParse } from 'd3-dsv';
import wellknown from 'wellknown';
import { topology } from 'topojson-server';
import { merge, feature, quantize } from 'topojson-client';
import { presimplify, quantile, simplify } from 'topojson-simplify';

const revision = '0ba0f1efae092f4aa6569ef38e53b3bb4d2f0087';
const sourceRoot = `https://raw.githubusercontent.com/leiii/census/${revision}/`;
const cache = new URL('../audit-out/china-census/', import.meta.url);
const tableOutput = new URL('../site/public/map-data/china-population-change.json', import.meta.url);
const mapOutput = new URL('../site/public/map-data/china-population-change.topojson', import.meta.url);
/** Share of the finest detail kept: enough for a county to keep its shape at the county zoom. */
const KEEP = 0.06;
const round = (value, digits = 1) => Number(value.toFixed(digits));

async function sourceFile(path) {
  const name = path.split('/').at(-1);
  const destination = new URL(name, cache);
  try {
    return await readFile(destination, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  const response = await fetch(`${sourceRoot}${path}`);
  assert.ok(response.ok, `Download failed: ${response.status} ${path}`);
  const text = await response.text();
  await mkdir(cache, { recursive: true });
  await writeFile(destination, text);
  return text;
}

/** Twice a ring's signed area in longitude/latitude: positive when it runs counter-clockwise. */
function ringArea(ring) {
  let area = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) area += (ring[j][0] - ring[i][0]) * (ring[j][1] + ring[i][1]);
  return area;
}

/**
 * Wind a polygon the way d3's spherical geometry reads it: outer rings clockwise, holes
 * counter-clockwise. WKT and GeoJSON wind the other way, which d3 reads as the whole globe
 * but the region, so a map would fit the world and fill the sphere.
 */
function rewind(geometry) {
  const polygon = (rings) => rings.map((ring, index) => {
    const clockwise = ringArea(ring) < 0;
    return (index === 0) === clockwise ? ring : [...ring].reverse();
  });
  if (geometry.type === 'Polygon') return { ...geometry, coordinates: polygon(geometry.coordinates) };
  if (geometry.type === 'MultiPolygon') return { ...geometry, coordinates: geometry.coordinates.map(polygon) };
  return geometry;
}

function number(value) {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

const text = await sourceFile('data/census/census_county_2010-2020_v1.csv');
const license = await sourceFile('LICENSE');
const source = csvParse(text.replace(/^\uFEFF/, ''));
for (const column of ['county', 'county_code', 'city', 'city_code', 'province', 'province_code', 'popu_2010', 'popu_2020', 'coord']) {
  assert.ok(source.columns.includes(column), `Missing source field: ${column}`);
}

const excluded = { outsideMainland: 0, missingGeometry: 0 };
/** Every mainland county with a boundary; those without both counts are drawn as no data. */
const counties = [];
for (const row of source) {
  if (!/^\d{6}$/.test(row.province_code) || Number(row.province_code) >= 710000) {
    excluded.outsideMainland++;
    continue;
  }
  const parsed = wellknown.parse(row.coord);
  const geometry = parsed && rewind(parsed);
  if (!geometry) {
    excluded.missingGeometry++;
    continue;
  }
  counties.push({
    id: row.county_code,
    name: row.county,
    province: row.province,
    provinceId: row.province_code,
    prefecture: row.city,
    prefectureId: row.city_code,
    pop2010: number(row.popu_2010),
    pop2020: number(row.popu_2020),
    geometry,
  });
}
const counted = counties.filter((county) => county.pop2010 !== null && county.pop2020 !== null);

// --- Boundaries ------------------------------------------------------------------------------
// One topology for the counties, so a prefecture and a province are the merge of their counties'
// shapes and share their arcs: the three levels line up exactly as the zoom swaps them.
const countyTopology = topology({
  counties: {
    type: 'FeatureCollection',
    features: counties.map((county) => ({
      type: 'Feature', id: `county:${county.id}`, properties: { name: county.name }, geometry: county.geometry,
    })),
  },
}, 1e6);
const geometries = countyTopology.objects.counties.geometries;
const merged = (key, name, level) => {
  const groups = new Map();
  counties.forEach((county, index) => {
    const group = groups.get(county[key]) ?? { name: county[name], members: [] };
    group.members.push(geometries[index]);
    groups.set(county[key], group);
  });
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([id, { name: groupName, members }]) => ({
    type: 'Feature', id: `${level}:${id}`, properties: { name: groupName }, geometry: merge(countyTopology, members),
  }));
};
const levels = Object.fromEntries(Object.entries({
  provinces: merged('provinceId', 'province', 'province'),
  prefectures: merged('prefectureId', 'prefecture', 'prefecture'),
  counties: feature(countyTopology, countyTopology.objects.counties).features,
}).map(([name, features]) => [name, features.map((f) => ({ ...f, geometry: rewind(f.geometry) }))]));
const combined = topology(Object.fromEntries(Object.entries(levels)
  .map(([name, features]) => [name, { type: 'FeatureCollection', features }])), 1e5);
const weighted = presimplify(combined);
// Simplifying hands back absolute coordinates; quantizing again keeps the file to integers.
const simplified = quantize(simplify(weighted, quantile(weighted, 1 - KEEP)), 1e5);
const mapJson = `${JSON.stringify(simplified)}\n`;

// --- Table -----------------------------------------------------------------------------------
function summarize(members, level, id, name) {
  const pop2010 = members.reduce((sum, county) => sum + county.pop2010, 0);
  const pop2020 = members.reduce((sum, county) => sum + county.pop2020, 0);
  return {
    Key: `${level}:${id}`,
    Code: id,
    Place: name,
    Province: members[0].province,
    Prefecture: level === 'province' ? '' : members[0].prefecture,
    Level: level,
    Pop2010: pop2010,
    Pop2020: pop2020,
    Change: round(pop2020 / pop2010 - 1, 3),
    Counties: members.length,
    CountiesShrinking: members.filter((county) => county.pop2020 < county.pop2010).length,
  };
}
function aggregate(key, name, level) {
  const groups = new Map();
  for (const county of counted) groups.set(county[key], [...(groups.get(county[key]) ?? []), county]);
  return [...groups].sort(([a], [b]) => a.localeCompare(b))
    .map(([id, members]) => summarize(members, level, id, members[0][name]));
}
const rows = [
  ...aggregate('provinceId', 'province', 'province'),
  ...aggregate('prefectureId', 'prefecture', 'prefecture'),
  ...[...counted].sort((a, b) => a.id.localeCompare(b.id)).map((county) => summarize([county], 'county', county.id, county.name)),
];

// --- Checks ----------------------------------------------------------------------------------
for (const level of ['province', 'prefecture', 'county']) {
  const members = rows.filter((row) => row.Level === level);
  assert.equal(new Set(members.map((row) => row.Key)).size, members.length, `${level}: duplicate codes`);
  assert.equal(members.reduce((sum, row) => sum + row.Counties, 0), counted.length, `${level}: county count`);
  assert.equal(members.reduce((sum, row) => sum + row.Pop2020, 0), counted.reduce((sum, c) => sum + c.pop2020, 0));
}
for (const [name, object] of Object.entries(simplified.objects)) {
  for (const f of feature(simplified, object).features) {
    const outers = f.geometry.type === 'Polygon' ? [f.geometry.coordinates[0]]
      : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates.map((p) => p[0]) : [];
    for (const ring of outers) assert.ok(ringArea(ring) <= 0, `${name} ${f.id}: an outer ring runs counter-clockwise`);
  }
}
const featureIds = new Set(Object.values(simplified.objects).flatMap((object) => object.geometries.map((g) => String(g.id))));
for (const row of rows) assert.ok(featureIds.has(row.Key), `${row.Key}: no boundary`);

const shrinking = counted.filter((county) => county.pop2020 < county.pop2010).length;
const national = rows.filter((row) => row.Level === 'province');
const result = {
  metadata: {
    source: 'Lei Dong et al., China Census: 2010 census yearbook and 2020 local census bulletins, matched to 2020 boundaries.',
    url: 'https://github.com/leiii/census',
    revision,
    sourceSha256: createHash('sha256').update(text).digest('hex'),
    citation: 'Dong, Lei; Du, Rui; Liu, Yu (2022). Mapping Evolving Population Geography in China.',
    license,
    years: [2010, 2020],
    counts: Object.fromEntries(['province', 'prefecture', 'county'].map((level) => [level, rows.filter((row) => row.Level === level).length])),
    countiesWithoutBothCounts: counties.length - counted.length,
    countiesShrinking: shrinking,
    nationalChangePct: round((national.reduce((s, r) => s + r.Pop2020, 0) / national.reduce((s, r) => s + r.Pop2010, 0) - 1) * 100),
    excluded,
    aggregation: 'Province and prefecture counts sum the counties with both a 2010 and a 2020 count, not official full-region totals. Units merged by the source to keep boundaries comparable appear as one county. A few changes reflect boundary transfers the source could not adjust (Harbin\'s Pingfang and Xiangfang districts).',
  },
  rows,
};
const tableJson = `${JSON.stringify(result)}\n`;
console.log(JSON.stringify({
  ...result.metadata, license: 'MIT',
  tableBytes: Buffer.byteLength(tableJson), tableGzip: gzipSync(tableJson).length,
  mapBytes: Buffer.byteLength(mapJson), mapGzip: gzipSync(mapJson).length,
}, null, 2));
if (process.argv.includes('--check')) {
  assert.equal(await readFile(tableOutput, 'utf8'), tableJson, 'The table is stale');
  assert.equal(await readFile(mapOutput, 'utf8'), mapJson, 'The map is stale');
} else {
  await writeFile(tableOutput, tableJson);
  await writeFile(mapOutput, mapJson);
  console.log(`Saved ${tableOutput.pathname} and ${mapOutput.pathname}`);
}
