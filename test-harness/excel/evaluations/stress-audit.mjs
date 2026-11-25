#!/usr/bin/env node
// @ts-nocheck
/**
 * stress-audit.mjs — date and layout edge cases for the Excel backend.
 *
 * Unlike gallery-run.mjs, the Excel chart is rendered at the size
 * `assembleExcel` itself chooses (no Vega-Lite size override), so the audit
 * covers what a library caller actually gets.
 *
 * Usage:
 *   node evaluations/stress-audit.mjs            # every case
 *   node evaluations/stress-audit.mjs date-      # cases whose name starts with a prefix
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderChart } from 'flint-chart-mcp/render';
import { assembleExcel } from 'flint-chart/excel';
import { renderExcelArtifact } from './render-client.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'out', 'stress-audit');
const tempDir = join(outDir, 'temp');
const scale = 2;
const prefix = process.argv[2] ?? '';

const utcDay = (y, m, d, h = 0) => new Date(Date.UTC(y, m, d, h));
const isoDate = (date) => date.toISOString().slice(0, 10);
const wave = (i, k = 1) => Math.round(100 + 40 * Math.sin(i / (3 * k)) + i * 1.5);

function input(chartType, values, semanticTypes, encodings, extra = {}) {
  return {
    data: { values },
    semantic_types: semanticTypes,
    chart_spec: { chartType, encodings, ...extra },
  };
}

const series = (names, count, row) => names.flatMap((name, s) => Array.from({ length: count }, (_v, i) => row(name, s, i)));

const CASES = [
  // ── Dates ────────────────────────────────────────────────────────────
  ['date-daily-30', 'Line · 30 daily points', input('Line Chart',
    Array.from({ length: 30 }, (_v, i) => ({ Date: isoDate(utcDay(2024, 0, 1 + i)), Visits: wave(i) })),
    { Date: 'Date', Visits: 'Count' }, { x: 'Date', y: 'Visits' })],
  ['date-daily-3y', 'Line · 3 years of daily points', input('Line Chart',
    Array.from({ length: 365 * 3 }, (_v, i) => ({ Date: isoDate(utcDay(2021, 0, 1 + i)), Price: wave(i, 20) })),
    { Date: 'Date', Price: 'Price' }, { x: 'Date', y: 'Price' })],
  ['date-monthly-5y', 'Line · 60 months × 3 series', input('Line Chart',
    series(['North', 'South', 'West'], 60, (name, s, i) => ({ Month: `${2019 + Math.floor(i / 12)}-${String(i % 12 + 1).padStart(2, '0')}`, Region: name, Revenue: wave(i, 2) * (s + 1) * 1000 })),
    { Month: 'YearMonth', Region: 'Category', Revenue: 'Amount' }, { x: 'Month', y: 'Revenue', color: 'Region' })],
  ['date-year-number', 'Line · numeric Year 1960–2023', input('Line Chart',
    Array.from({ length: 64 }, (_v, i) => ({ Year: 1960 + i, Population: 3.0e9 + i * 7.5e7 })),
    { Year: 'Year', Population: 'Population' }, { x: 'Year', y: 'Population' })],
  ['date-year-bars', 'Bar · 12 years', input('Bar Chart',
    Array.from({ length: 12 }, (_v, i) => ({ Year: String(2012 + i), Sales: wave(i) })),
    { Year: 'Year', Sales: 'Amount' }, { x: 'Year', y: 'Sales' })],
  ['date-monthly-bars', 'Bar · 24 months', input('Bar Chart',
    Array.from({ length: 24 }, (_v, i) => ({ Month: isoDate(utcDay(2023, i, 1)), Orders: wave(i) })),
    { Month: 'YearMonth', Orders: 'Count' }, { x: 'Month', y: 'Orders' })],
  ['date-monthly-stacked', 'Stacked bar · 12 months × 3', input('Stacked Bar Chart',
    series(['A', 'B', 'C'], 12, (name, s, i) => ({ Month: isoDate(utcDay(2024, i, 1)), Product: name, Units: wave(i + s * 4) })),
    { Month: 'YearMonth', Product: 'Category', Units: 'Count' }, { x: 'Month', y: 'Units', color: 'Product' })],
  ['date-hourly', 'Line · 48 hourly points', input('Line Chart',
    Array.from({ length: 48 }, (_v, i) => ({ Time: utcDay(2024, 4, 1, i).toISOString().slice(0, 19), Temperature: Math.round(18 + 6 * Math.sin((i - 9) / 3.8)) })),
    { Time: 'DateTime', Temperature: 'Temperature' }, { x: 'Time', y: 'Temperature' })],
  ['date-hourly-bars', 'Bar · 24 hourly points', input('Bar Chart',
    Array.from({ length: 24 }, (_v, i) => ({ Time: utcDay(2024, 4, 1, i).toISOString().slice(0, 19), Calls: wave(i) })),
    { Time: 'DateTime', Calls: 'Count' }, { x: 'Time', y: 'Calls' })],
  ['date-irregular', 'Line · irregular dates, unsorted rows', input('Line Chart',
    [['2024-03-15', 8], ['2024-01-02', 5], ['2024-06-30', 12], ['2024-02-10', 6], ['2024-09-01', 9], ['2024-12-24', 15]].map(([Date, Value]) => ({ Date, Value })),
    { Date: 'Date', Value: 'Quantity' }, { x: 'Date', y: 'Value' })],
  ['date-area-quarterly', 'Area · quarterly dates × 2', input('Area Chart',
    series(['Hardware', 'Software'], 16, (name, s, i) => ({ Quarter: isoDate(utcDay(2020, i * 3, 1)), Segment: name, Revenue: wave(i) * (s + 1) })),
    { Quarter: 'YearQuarter', Segment: 'Category', Revenue: 'Amount' }, { x: 'Quarter', y: 'Revenue', color: 'Segment' })],
  ['date-scatter', 'Scatter · date x', input('Scatter Plot',
    Array.from({ length: 40 }, (_v, i) => ({ Date: isoDate(utcDay(2024, 0, 1 + i * 9)), Price: wave(i) })),
    { Date: 'Date', Price: 'Price' }, { x: 'Date', y: 'Price' })],
  ['date-us-strings', 'Line · "Jan 5, 2024" spellings', input('Line Chart',
    Array.from({ length: 10 }, (_v, i) => ({ Day: utcDay(2024, 0, 5 + i * 7).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }), Value: wave(i) })),
    { Day: 'Date', Value: 'Quantity' }, { x: 'Day', y: 'Value' })],
  ['date-month-names', 'Bar · month names (ordinal)', input('Bar Chart',
    ['Mar', 'Jan', 'Feb', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map((Month, i) => ({ Month, Rainfall: 40 + ((i * 37) % 60) })),
    { Month: 'Month', Rainfall: 'Quantity' }, { x: 'Month', y: 'Rainfall' })],

  // ── Values ───────────────────────────────────────────────────────────
  ['value-offset-line', 'Line · values far from zero', input('Line Chart',
    Array.from({ length: 20 }, (_v, i) => ({ Year: String(2000 + i), Index: 1012.4 + Math.sin(i / 2) * 6 + i * 0.4 })),
    { Year: 'Year', Index: 'Score' }, { x: 'Year', y: 'Index' })],
  ['value-negative-bars', 'Bar · negative values', input('Bar Chart',
    ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta'].map((Team, i) => ({ Team, Change: [12, -8, 5, -15, 3, -2][i] })),
    { Team: 'Category', Change: 'Percentage' }, { x: 'Team', y: 'Change' })],
  ['value-millions', 'Bar · millions currency', input('Bar Chart',
    ['Seattle', 'Austin', 'Boston', 'Denver', 'Miami'].map((City, i) => ({ City, Revenue: [12.5e6, 8.2e6, 15.1e6, 4.3e6, 9.9e6][i] })),
    { City: 'Category', Revenue: 'Amount' }, { x: 'City', y: 'Revenue' })],
  ['value-percent', 'Line · fraction percentages', input('Line Chart',
    Array.from({ length: 12 }, (_v, i) => ({ Month: isoDate(utcDay(2024, i, 1)), Rate: 0.02 + i * 0.004 })),
    { Month: 'YearMonth', Rate: 'Percentage' }, { x: 'Month', y: 'Rate' })],

  // ── Layout ───────────────────────────────────────────────────────────
  ['layout-long-labels', 'Bar · long category names', input('Bar Chart',
    ['Customer onboarding and activation', 'Billing and invoicing disputes', 'Product quality complaints', 'Shipping delays and lost parcels', 'Account security and passwords', 'Feature requests'].map((Topic, i) => ({ Topic, Tickets: [320, 210, 180, 150, 95, 60][i] })),
    { Topic: 'Category', Tickets: 'Count' }, { x: 'Topic', y: 'Tickets' })],
  ['layout-horizontal-40', 'Horizontal bar · 40 categories', input('Bar Chart',
    Array.from({ length: 40 }, (_v, i) => ({ Country: `Country ${String.fromCharCode(65 + (i % 26))}${i >= 26 ? 2 : ''}`, GDP: 50 + ((i * 53) % 400) })),
    { Country: 'Country', GDP: 'Amount' }, { x: 'GDP', y: 'Country' })],
  ['layout-columns-60', 'Column · 60 categories', input('Bar Chart',
    Array.from({ length: 60 }, (_v, i) => ({ Product: `SKU-${1000 + i}`, Units: 40 + ((i * 37) % 180) })),
    { Product: 'Category', Units: 'Count' }, { x: 'Product', y: 'Units' })],
  ['layout-grouped-12x4', 'Grouped bar · 12 × 4', input('Grouped Bar Chart',
    series(['2021', '2022', '2023', '2024'], 12, (name, s, i) => ({ Department: `Dept ${i + 1}`, Year: name, Budget: 50 + ((i * 31 + s * 17) % 90) })),
    { Department: 'Category', Year: 'Category', Budget: 'Amount' }, { x: 'Department', y: 'Budget', group: 'Year' })],
  ['layout-small-canvas', 'Line · 3 series on 260×180', input('Line Chart',
    series(['A', 'B', 'C'], 24, (name, s, i) => ({ Month: isoDate(utcDay(2023, i, 1)), Series: name, Value: wave(i + s * 5) })),
    { Month: 'YearMonth', Series: 'Category', Value: 'Quantity' }, { x: 'Month', y: 'Value', color: 'Series' }, { baseSize: { width: 260, height: 180 } })],
  ['layout-many-series', 'Line · 16 series legend', input('Line Chart',
    series(Array.from({ length: 16 }, (_v, s) => `Region ${s + 1}`), 20, (name, s, i) => ({ Week: isoDate(utcDay(2024, 0, 1 + i * 7)), Region: name, Sales: wave(i + s * 3) + s * 10 })),
    { Week: 'Date', Region: 'Category', Sales: 'Amount' }, { x: 'Week', y: 'Sales', color: 'Region' })],
  ['layout-long-title', 'Bar · long title', input('Bar Chart',
    ['A', 'B', 'C', 'D'].map((Group, i) => ({ Group, Score: [3.2, 4.1, 2.7, 3.9][i] })),
    { Group: 'Category', Score: 'Score' }, { x: 'Group', y: 'Score' },
    { title: 'Average customer satisfaction score by service tier across all regions in fiscal year 2024' })],
];

function runMagick(args) {
  execFileSync('magick', args, { stdio: 'pipe' });
}

async function main() {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(tempDir, { recursive: true });
  const selected = CASES.filter(([name]) => name.startsWith(prefix));
  const results = [];
  for (const [name, label, chartInput] of selected) {
    const record = { name, label };
    try {
      const reference = await renderChart(chartInput, 'vegalite', { format: 'png', scale });
      writeFileSync(join(outDir, `${name}.vl.png`), reference.buffer);
      record.vlSize = `${reference.width}x${reference.height}`;
      let spec;
      try {
        spec = assembleExcel(chartInput);
      } catch (error) {
        record.skipped = String(error.message || error);
        console.log(`  - ${name}: SKIP ${record.skipped}`);
        results.push(record);
        continue;
      }
      record.excelType = spec.chartType;
      record.excelSize = `${spec.width}x${spec.height}`;
      record.categoryAxis = spec.categoryAxis;
      record.valueAxis = spec.valueAxis;
      writeFileSync(join(outDir, `${name}.artifact.json`), JSON.stringify(spec, null, 2));
      const png = await renderExcelArtifact(spec, { scale });
      writeFileSync(join(outDir, `${name}.excel.png`), png);
      record.ok = true;
      console.log(`  ✓ ${name} (${spec.chartType}, Excel ${record.excelSize}, VL ${record.vlSize})`);
    } catch (error) {
      record.error = String(error.message || error);
      console.log(`  ✗ ${name}: ${record.error}`);
    }
    results.push(record);
  }
  writeFileSync(join(outDir, 'summary.json'), JSON.stringify(results, null, 2));

  const rendered = results.filter((result) => result.ok);
  for (let page = 0; page * 3 < rendered.length; page += 1) {
    const rows = [];
    for (const result of rendered.slice(page * 3, page * 3 + 3)) {
      const caption = join(tempDir, `${result.name}-label.png`);
      const reference = join(tempDir, `${result.name}-vl.png`);
      const excel = join(tempDir, `${result.name}-excel.png`);
      const row = join(tempDir, `${result.name}-row.png`);
      runMagick(['-size', '260x560', '-background', 'white', '-fill', 'black', '-font', 'Helvetica', '-pointsize', '18', '-gravity', 'center',
        `caption:${result.name}\n${result.label}\nVL ${result.vlSize}\nExcel ${result.excelSize}`, caption]);
      runMagick([join(outDir, `${result.name}.vl.png`), '-resize', '860x540', '-background', 'white', '-gravity', 'center', '-extent', '880x560', reference]);
      runMagick([join(outDir, `${result.name}.excel.png`), '-resize', '860x540', '-background', 'white', '-gravity', 'center', '-extent', '880x560', excel]);
      runMagick([caption, reference, excel, '+append', row]);
      rows.push(row);
    }
    runMagick([...rows, '-append', join(outDir, `sheet-${String(page + 1).padStart(2, '0')}.png`)]);
  }
  rmSync(tempDir, { recursive: true, force: true });
  console.log(`\n${rendered.length}/${selected.length} rendered → ${outDir}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
