import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { csvParse } from 'd3-dsv';
import wellknown from 'wellknown';
import pointOnFeature from '@turf/point-on-feature';

const revision = '0ba0f1efae092f4aa6569ef38e53b3bb4d2f0087';
const sourceRoot = `https://raw.githubusercontent.com/leiii/census/${revision}/`;
const cache = new URL('../audit-out/china-census/', import.meta.url);
const output = new URL('../site/public/map-data/china-census-2020.json', import.meta.url);
const round = (value, digits = 3) => Number(value.toFixed(digits));

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

function number(value) {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function summarize(rows, level, id, place) {
  const population = rows.reduce((sum, row) => sum + row.population, 0);
  const known = rows.filter(row => row.age65 !== null);
  const coveredPopulation = known.reduce((sum, row) => sum + row.population, 0);
  return {
    Id: id,
    Place: place,
    Province: rows[0].province,
    Prefecture: level === 'province' ? '' : rows[0].prefecture,
    Level: level,
    Lon: round(rows.reduce((sum, row) => sum + row.lon * row.population, 0) / population, 4),
    Lat: round(rows.reduce((sum, row) => sum + row.lat * row.population, 0) / population, 4),
    PopulationM: round(population / 1e6, 6),
    Age65Pct: coveredPopulation > 0
      ? round(known.reduce((sum, row) => sum + row.age65 * row.population, 0) / coveredPopulation)
      : null,
    AgeCoveragePct: round(coveredPopulation / population * 100),
    CountyCount: rows.length,
  };
}

function aggregate(counties, key, name, level) {
  const groups = new Map();
  for (const row of counties) {
    const members = groups.get(row[key]) ?? [];
    members.push(row);
    groups.set(row[key], members);
  }
  return [...groups].sort(([first], [second]) => first.localeCompare(second))
    .map(([id, rows]) => summarize(rows, level, id, rows[0][name]));
}

function verify(rows, counties) {
  for (const level of ['province', 'prefecture', 'county']) {
    const members = rows.filter(row => row.Level === level);
    assert.equal(new Set(members.map(row => row.Id)).size, members.length, `${level}: duplicate IDs`);
    assert.equal(members.reduce((sum, row) => sum + row.CountyCount, 0), counties.length);
    const population = members.reduce((sum, row) => sum + Math.round(row.PopulationM * 1e6), 0);
    assert.equal(population, counties.reduce((sum, row) => sum + row.population, 0), `${level}: population mismatch`);
    for (const row of members) {
      assert.ok(row.Lon >= 70 && row.Lon <= 140 && row.Lat >= 10 && row.Lat <= 60, `${row.Id}: invalid point`);
      assert.ok(row.AgeCoveragePct >= 0 && row.AgeCoveragePct <= 100);
      assert.ok(row.Age65Pct === null || (row.Age65Pct >= 0 && row.Age65Pct <= 100));
      assert.equal(row.Age65Pct === null, row.AgeCoveragePct === 0);
    }
  }
  const sample = [
    { population: 100, age65: 10, province: 'sample', prefecture: 'sample', lon: 100, lat: 30 },
    { population: 300, age65: 30, province: 'sample', prefecture: 'sample', lon: 100, lat: 30 },
    { population: 100, age65: null, province: 'sample', prefecture: 'sample', lon: 100, lat: 30 },
  ];
  const weighted = summarize(sample, 'province', 'sample', 'sample');
  assert.equal(weighted.Age65Pct, 25);
  assert.equal(weighted.AgeCoveragePct, 80);
}

const text = await sourceFile('data/census/census_county_2010-2020_v1.csv');
const license = await sourceFile('LICENSE');
const source = csvParse(text);
for (const column of ['county', 'county_code', 'city', 'city_code', 'province', 'province_code', 'popu_2020', 'age_65_2020', 'coord']) {
  assert.ok(source.columns.includes(column), `Missing source field: ${column}`);
}
const excluded = { outsideMainland: 0, missingPopulation: 0, missingGeometry: 0 };
const counties = [];
for (const row of source) {
  if (!/^\d{6}$/.test(row.province_code) || Number(row.province_code) >= 710000) {
    excluded.outsideMainland++;
    continue;
  }
  const population = number(row.popu_2020);
  if (population === null || population <= 0) {
    excluded.missingPopulation++;
    continue;
  }
  const geometry = wellknown.parse(row.coord);
  if (!geometry) {
    excluded.missingGeometry++;
    continue;
  }
  const [lon, lat] = pointOnFeature({ type: 'Feature', properties: {}, geometry }).geometry.coordinates;
  const age65 = number(row.age_65_2020);
  counties.push({
    id: row.county_code,
    place: row.county,
    province: row.province,
    provinceId: row.province_code,
    prefecture: row.city,
    prefectureId: row.city_code,
    population,
    age65: age65 !== null && age65 >= 0 && age65 <= 100 ? age65 : null,
    lon, lat,
  });
}
const rows = [
  ...aggregate(counties, 'provinceId', 'province', 'province'),
  ...aggregate(counties, 'prefectureId', 'prefecture', 'prefecture'),
  ...counties.sort((first, second) => first.id.localeCompare(second.id))
    .map(row => summarize([row], 'county', row.id, row.place)),
];
verify(rows, counties);
const counts = Object.fromEntries(['province', 'prefecture', 'county'].map(level => [level, rows.filter(row => row.Level === level).length]));
const result = {
  metadata: {
    source: 'Lei Dong et al., China Census, 2020 local census bulletins; matched administrative units.',
    url: 'https://github.com/leiii/census',
    revision,
    sourceSha256: createHash('sha256').update(text).digest('hex'),
    citation: 'Dong, Lei; Du, Rui; Liu, Yu (2022). Mapping Evolving Population Geography in China.',
    license,
    year: 2020,
    counts,
    sourceRows: source.length,
    excluded,
    missingAgeCounties: counties.filter(row => row.age65 === null).length,
    aggregation: 'Province and prefecture populations sum included county populations, not official full-region totals. Age 65+ shares are population-weighted over counties reporting that measure; coverage is their share of included population. Missing age shares remain null. Points represent supplied boundary polygons; aggregate points are population-weighted means of county points.',
  },
  rows,
};
const json = `${JSON.stringify(result)}\n`;
console.log(JSON.stringify({ ...result.metadata, license: 'MIT', bytes: Buffer.byteLength(json), gzipBytes: gzipSync(json).length }, null, 2));
if (process.argv.includes('--check')) {
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), result, 'Generated data are stale');
} else {
  await writeFile(output, json);
  console.log(`Saved ${output.pathname}`);
}