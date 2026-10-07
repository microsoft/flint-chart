import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';

const year = 2023;
const cities = [
  ['Seattle', -122.3321, 47.6062],
  ['New York', -74.006, 40.7128],
  ['Los Angeles', -118.2437, 34.0522],
  ['Chicago', -87.6298, 41.8781],
  ['Mexico City', -99.1332, 19.4326],
  ['London', -0.1276, 51.5072],
  ['Helsinki', 24.9384, 60.1699],
  ['Dubai', 55.2708, 25.2048],
  ['Beijing', 116.4074, 39.9042],
  ['Tokyo', 139.6917, 35.6895],
  ['Singapore', 103.8198, 1.3521],
  ['Sydney', 151.2093, -33.8688],
];
const cache = new URL('../audit-out/timebox-weather/', import.meta.url);
const output = new URL('../site/public/data/timebox-weather-2023.json', import.meta.url);
const dates = [];
for (let date = Date.UTC(year, 0, 1); date < Date.UTC(year + 1, 0, 1); date += 86400000) {
  dates.push(new Date(date).toISOString().slice(0, 10));
}

await mkdir(cache, { recursive: true });
async function loadCity([name, longitude, latitude]) {
  const url = new URL('https://power.larc.nasa.gov/api/temporal/daily/point');
  url.search = new URLSearchParams({
    parameters: 'T2M', community: 'SB', longitude: String(longitude), latitude: String(latitude),
    start: `${year}0101`, end: `${year}1231`, format: 'JSON', 'time-standard': 'LST',
  }).toString();
  const file = new URL(`${name.toLowerCase().replaceAll(' ', '-')}.json`, cache);
  let text;
  try {
    text = await readFile(file, 'utf8');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    const response = await fetch(url, { signal: AbortSignal.timeout(120000) });
    assert(response.ok, `${name}: NASA POWER returned HTTP ${response.status}`);
    text = await response.text();
  }
  const source = JSON.parse(text);
  const values = source.properties?.parameter?.T2M;
  assert.equal(Object.keys(values ?? {}).length, dates.length, `${name}: incomplete year`);
  const temperature = dates.map(date => {
    const value = values[date.replaceAll('-', '')];
    assert(typeof value === 'number' && Number.isFinite(value)
      && value !== source.header.fill_value && value > -80 && value < 60, `${name}: missing/invalid temperature on ${date}`);
    return value;
  });
  await writeFile(file, text);
  console.log(`${name}: ${temperature.length} daily values`);
  return { name, longitude, latitude, sourceUrl: url.href, temperature };
}

const series = [];
for (let start = 0; start < cities.length; start += 3) {
  series.push(...await Promise.all(cities.slice(start, start + 3).map(loadCity)));
}
const dataset = {
  metadata: {
    year, parameter: 'T2M', measure: 'Daily mean 2 m air temperature', unit: 'C',
    source: 'NASA POWER / MERRA-2', sourceUrl: 'https://power.larc.nasa.gov/docs/services/api/temporal/daily/',
    timeStandard: 'Local Solar Time', cityCount: series.length, daysPerCity: dates.length,
    note: 'Gridded reanalysis at city coordinates, not weather-station observations. Daily means do not establish all-day temperature bounds.',
  },
  dates,
  cities: series,
};
const text = `${JSON.stringify(dataset)}\n`;
if (process.argv.includes('--check')) {
  assert.deepEqual(JSON.parse(await readFile(output, 'utf8')), dataset);
} else {
  await mkdir(new URL('.', output), { recursive: true });
  await writeFile(output, text);
}
console.log(JSON.stringify({ cities: series.length, days: dates.length, samples: series.length * dates.length,
  bytes: Buffer.byteLength(text), gzipBytes: gzipSync(text).length, checked: process.argv.includes('--check') }));