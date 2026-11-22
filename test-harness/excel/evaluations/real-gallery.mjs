#!/usr/bin/env node
// @ts-nocheck
/**
 * real-gallery.mjs — a gallery of native Excel charts drawn from real data.
 *
 * Sources:
 *   • every `real` case in flint-chart/test-data whose chart type the Excel
 *     backend draws natively;
 *   • real cases of other chart types re-expressed as an Excel-native type
 *     (a streamgraph's data as a stacked area, a heatmap's as lines, …);
 *   • a few cases authored here from public statistics, and daily 2023
 *     temperatures from site/public/data (NASA POWER / MERRA-2).
 *
 * Each chart is compiled with `assembleExcel` at the size the backend chooses
 * and rendered by the Office.js worker; a Flint reference (Vega-Lite, or
 * ECharts for its own families) is rendered beside it.
 *
 * Usage:
 *   node evaluations/real-gallery.mjs            # every case
 *   node evaluations/real-gallery.mjs pie        # cases whose id contains a substring
 *
 * Output: evaluations/out/real-gallery/{<id>.excel.png, <id>.ref.png,
 * <id>.artifact.json, summary.json, sheet-NN.png}.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderChart } from 'flint-chart-mcp/render';
import { assembleExcel, excelGetTemplateDef } from 'flint-chart/excel';
import { TEST_GENERATORS } from 'flint-chart/test-data';
import { renderExcelArtifact } from './render-client.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..', '..');
const outDir = join(here, 'out', 'real-gallery');
const tempDir = join(outDir, 'temp');
const scale = 2;
const filter = process.argv[2] ?? '';

const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);

function fromTestCase(testCase, overrides = {}) {
  const idToName = new Map(testCase.fields.map((field) => [field.id, field.name]));
  const encodings = {};
  for (const [channel, item] of Object.entries(testCase.encodingMap || {})) {
    if (!item?.fieldID) continue;
    const field = idToName.get(item.fieldID) ?? item.fieldID;
    const extra = Object.fromEntries(['type', 'aggregate', 'sortOrder', 'sortBy'].filter((key) => item[key] != null && item[key] !== '').map((key) => [key, item[key]]));
    encodings[channel] = Object.keys(extra).length ? { field, ...extra } : field;
  }
  const semanticTypes = {};
  for (const [field, meta] of Object.entries(testCase.metadata || {})) semanticTypes[field] = meta.semanticType;
  return {
    semantic_types: semanticTypes,
    chart_spec: {
      chartType: testCase.chartType,
      title: testCase.title,
      encodings,
      ...(testCase.chartProperties ? { chartProperties: testCase.chartProperties } : {}),
    },
    data: { values: testCase.data },
    ...overrides,
  };
}

function realCases() {
  const seen = new Set();
  const cases = [];
  for (const generate of Object.values(TEST_GENERATORS)) {
    let generated;
    try { generated = generate(); } catch { continue; }
    for (const testCase of generated) {
      if (!testCase.tags?.includes('real') || seen.has(testCase.title)) continue;
      seen.add(testCase.title);
      cases.push(testCase);
    }
  }
  return cases;
}

/** Real cases of chart types Excel cannot draw, re-expressed as an Excel-native chart of the same data. */
const RETARGET = {
  Streamgraph: (input) => ({ ...input, chart_spec: { ...input.chart_spec, chartType: 'Area Chart' } }),
  Heatmap: (input) => ({
    ...input,
    chart_spec: { ...input.chart_spec, chartType: 'Line Chart', encodings: { x: 'Month', y: 'Temp (°C)', color: 'City' } },
  }),
  'Bar Table': (input) => ({ ...input, chart_spec: { ...input.chart_spec, chartType: 'Bar Chart' } }),
  'Lollipop Chart': (input) => ({ ...input, chart_spec: { ...input.chart_spec, chartType: 'Bar Chart' } }),
  'Rose Chart': (input) => {
    const { x, y, theta, size, color } = input.chart_spec.encodings;
    const category = x ?? color;
    const value = y ?? theta ?? size;
    return { ...input, chart_spec: { ...input.chart_spec, chartType: 'Bar Chart', encodings: { x: category, y: value } } };
  },
  'Range Area Chart': (input) => ({
    ...input,
    semantic_types: { Month: 'Month', Temperature: 'Temperature', Measure: 'Category' },
    data: { values: input.data.values.flatMap((row) => [
      { Month: row.Month, Measure: 'Average high', Temperature: row.High },
      { Month: row.Month, Measure: 'Average low', Temperature: row.Low },
    ]) },
    chart_spec: { ...input.chart_spec, chartType: 'Line Chart', title: 'Seattle average monthly high and low (°F)', encodings: { x: 'Month', y: 'Temperature', color: 'Measure' } },
  }),
  'Ranged Dot Plot': (input) => ({
    ...input,
    semantic_types: { ...input.semantic_types, 'Life expectancy': 'Duration' },
    chart_spec: { ...input.chart_spec, chartType: 'Grouped Bar Chart', encodings: { x: 'Life expectancy', y: 'Country', group: 'Sex' } },
  }),
};

function weatherCases() {
  const weather = JSON.parse(readFileSync(join(repo, 'site', 'public', 'data', 'timebox-weather-2023.json'), 'utf8'));
  const cities = weather.cities.slice(0, 4);
  const daily = cities.flatMap((city) => weather.dates.map((date, index) => ({ Date: date, City: city.name, 'Temperature (°C)': city.temperature[index] })));
  const monthly = [];
  for (const city of weather.cities) {
    const sums = new Map();
    weather.dates.forEach((date, index) => {
      const month = `${date.slice(0, 7)}-01`;
      const entry = sums.get(month) ?? { sum: 0, count: 0 };
      entry.sum += city.temperature[index];
      entry.count += 1;
      sums.set(month, entry);
    });
    for (const [month, { sum, count }] of sums) monthly.push({ Month: month, City: city.name, 'Mean temperature (°C)': Math.round((sum / count) * 10) / 10 });
  }
  const firstCity = weather.cities[0];
  return [
    {
      id: 'daily-temperature-2023',
      source: 'NASA POWER / MERRA-2 daily mean 2 m temperature, 2023',
      input: {
        data: { values: daily },
        semantic_types: { Date: 'Date', City: 'City', 'Temperature (°C)': 'Temperature' },
        chart_spec: { chartType: 'Line Chart', title: `Daily mean temperature, 2023 — ${cities.map((city) => city.name).join(', ')}`, encodings: { x: 'Date', y: 'Temperature (°C)', color: 'City' } },
      },
    },
    {
      id: 'monthly-temperature-columns',
      source: 'NASA POWER / MERRA-2 (monthly means of daily values), 2023',
      input: {
        data: { values: monthly.filter((row) => row.City === firstCity.name) },
        semantic_types: { Month: 'YearMonth', City: 'City', 'Mean temperature (°C)': 'Temperature' },
        chart_spec: { chartType: 'Bar Chart', title: `${firstCity.name} monthly mean temperature, 2023`, encodings: { x: 'Month', y: 'Mean temperature (°C)' } },
      },
    },
  ];
}

/** Cases authored from published statistics, for Excel families the test data does not cover. */
const AUTHORED = [
  {
    id: 'world-population-treemap',
    source: 'UN World Population Prospects 2022, 2023 estimates (millions)',
    input: {
      data: { values: [['Asia', 4753], ['Africa', 1460], ['Europe', 742], ['Latin America & Caribbean', 664], ['Northern America', 377], ['Oceania', 45]].map(([Region, Population]) => ({ Region, Population })) },
      semantic_types: { Region: 'Category', Population: 'Population' },
      chart_spec: { chartType: 'Treemap', title: 'World population by region, 2023 (millions)', encodings: { color: 'Region', size: 'Population' } },
    },
  },
  {
    id: 'population-sunburst',
    source: 'UN World Population Prospects 2022, 2023 estimates (millions)',
    input: {
      data: { values: [
        ['Asia', 'India', 1428], ['Asia', 'China', 1425], ['Asia', 'Indonesia', 278], ['Asia', 'Pakistan', 240],
        ['Africa', 'Nigeria', 224], ['Africa', 'Ethiopia', 127], ['Africa', 'Egypt', 113],
        ['Americas', 'United States', 340], ['Americas', 'Brazil', 216], ['Americas', 'Mexico', 128],
        ['Europe', 'Russia', 144], ['Europe', 'Germany', 83],
      ].map(([Continent, Country, Population]) => ({ Continent, Country, Population })) },
      semantic_types: { Continent: 'Category', Country: 'Country', Population: 'Population' },
      chart_spec: { chartType: 'Sunburst Chart', title: 'Most populous countries by continent, 2023 (millions)', encodings: { color: 'Continent', group: 'Country', size: 'Population' } },
    },
  },
  {
    id: 'education-funnel',
    source: 'US Census Bureau, Educational Attainment in the US: 2022 (CB23-TPS.21); cumulative from the published shares of adults 25+',
    input: {
      data: { values: [['High school or more', 91], ['Some college or more', 63], ["Associate's or more", 48], ["Bachelor's or more", 38], ['Advanced degree', 14]].map(([Level, Share]) => ({ Level, Share })) },
      semantic_types: { Level: 'Category', Share: 'Quantity' },
      chart_spec: { chartType: 'Funnel Chart', title: 'US adults 25+ by educational attainment, 2022 (%)', encodings: { y: 'Level', size: 'Share' } },
    },
  },
];

function referenceBackend(chartType) {
  return ['Funnel Chart', 'Treemap', 'Sunburst Chart'].includes(chartType) ? 'echarts' : 'vegalite';
}

function collectCases() {
  const cases = [];
  for (const testCase of realCases()) {
    const base = fromTestCase(testCase);
    const retarget = RETARGET[testCase.chartType];
    if (excelGetTemplateDef(testCase.chartType)) {
      cases.push({ id: slug(testCase.title), source: testCase.description, input: base });
    } else if (retarget) {
      cases.push({ id: slug(testCase.title), source: `${testCase.description} (drawn as an Excel-native chart; Flint draws it as a ${testCase.chartType})`, input: retarget(base) });
    }
  }
  return [...cases, ...weatherCases(), ...AUTHORED];
}

function runMagick(args) {
  execFileSync('magick', args, { stdio: 'pipe' });
}

async function main() {
  if (!filter) rmSync(outDir, { recursive: true, force: true });
  mkdirSync(tempDir, { recursive: true });
  const cases = collectCases().filter((item) => item.id.includes(filter));
  const results = [];
  for (const item of cases) {
    const record = { id: item.id, title: item.input.chart_spec.title, chartType: item.input.chart_spec.chartType, source: item.source };
    try {
      writeFileSync(join(outDir, `${item.id}.input.json`), JSON.stringify(item.input, null, 2));
      const backend = referenceBackend(record.chartType);
      try {
        const reference = await renderChart(item.input, backend, { format: 'png', scale });
        writeFileSync(join(outDir, `${item.id}.ref.png`), reference.buffer);
        record.reference = backend;
      } catch (error) {
        record.referenceError = String(error.message || error);
      }
      const spec = assembleExcel(item.input);
      record.excelType = spec.chartType;
      record.size = `${spec.width}x${spec.height}`;
      writeFileSync(join(outDir, `${item.id}.artifact.json`), JSON.stringify(spec, null, 2));
      writeFileSync(join(outDir, `${item.id}.excel.png`), await renderExcelArtifact(spec, { scale }));
      record.ok = true;
      console.log(`  ✓ ${item.id} (${record.chartType} → ${spec.chartType}, ${record.size})`);
    } catch (error) {
      record.error = String(error.message || error);
      console.log(`  ✗ ${item.id}: ${record.error}`);
    }
    results.push(record);
  }
  writeFileSync(join(outDir, filter ? `summary.${slug(filter)}.json` : 'summary.json'), JSON.stringify(results, null, 2));

  const rendered = results.filter((result) => result.ok);
  for (let page = 0; page * 3 < rendered.length; page += 1) {
    const rows = [];
    for (const result of rendered.slice(page * 3, page * 3 + 3)) {
      const caption = join(tempDir, `${result.id}-caption.png`);
      const reference = join(tempDir, `${result.id}-ref.png`);
      const excel = join(tempDir, `${result.id}-excel.png`);
      const row = join(tempDir, `${result.id}-row.png`);
      runMagick(['-size', '260x560', '-background', 'white', '-fill', 'black', '-font', 'Helvetica', '-pointsize', '17', '-gravity', 'center',
        `caption:${result.id}\n${result.chartType} → ${result.excelType}\nExcel ${result.size}`, caption]);
      if (result.reference) {
        runMagick([join(outDir, `${result.id}.ref.png`), '-resize', '860x540', '-background', 'white', '-gravity', 'center', '-extent', '880x560', reference]);
      } else {
        runMagick(['-size', '880x560', '-background', 'white', '-fill', 'gray', '-gravity', 'center', 'label:no Flint reference', reference]);
      }
      runMagick([join(outDir, `${result.id}.excel.png`), '-resize', '860x540', '-background', 'white', '-gravity', 'center', '-extent', '880x560', excel]);
      runMagick([caption, reference, excel, '+append', row]);
      rows.push(row);
    }
    runMagick([...rows, '-append', join(outDir, `sheet-${String(page + 1).padStart(2, '0')}${filter ? `-${slug(filter)}` : ''}.png`)]);
  }
  rmSync(tempDir, { recursive: true, force: true });
  console.log(`\n${rendered.length}/${cases.length} rendered → ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
