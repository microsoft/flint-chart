#!/usr/bin/env node
// @ts-nocheck  (consumes loosely-typed gallery TestCase objects)
/**
 * gen-gallery-inputs.mjs — export real Flint gallery examples as Flint inputs.
 *
 * Pulls curated TestCases from `flint-chart/test-data` (the fixtures the website
 * gallery renders) and converts each to a flat ChartAssemblyInput, grouped into
 * per-chart-type subfolders under inputs/. Primary-axis cardinality is
 * encoded in the filename so we can target low/high cardinality.
 *
 * Usage:
 *   node gen-gallery-inputs.mjs
 *   node gen-gallery-inputs.mjs radar-chart
 */

import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TEST_GENERATORS } from 'flint-chart/test-data';

const here = dirname(fileURLToPath(import.meta.url));
const OUT = join(here, 'inputs');

const MAJOR_TYPES = [
  'Bar Chart', 'Grouped Bar Chart', 'Stacked Bar Chart', 'Line Chart',
  'Pyramid Chart', 'Area Chart', 'Scatter Plot', 'Pie Chart', 'Donut Chart', 'Histogram', 'Heatmap',
  'Boxplot', 'Radar Chart', 'Waterfall Chart', 'Funnel Chart', 'Treemap', 'Sunburst Chart',
  'Connected Scatter Plot', 'Candlestick Chart',
];

const GENERATOR_KEYS = {
  'Funnel Chart': 'ECharts: Funnel',
  'Treemap': 'ECharts: Treemap',
  'Sunburst Chart': 'ECharts: Sunburst',
};

const DEFAULT_CANVAS = { width: 560, height: 360 };
const OVERRIDE_KEYS = ['type', 'aggregate', 'sortOrder', 'sortBy', 'scheme'];
const collapse = (e) => (e.field == null ? e : OVERRIDE_KEYS.some((k) => e[k] != null && e[k] !== '') ? e : e.field);

function toAssemblyInput(t, canvas = DEFAULT_CANVAS) {
  const idToName = new Map(t.fields.map((f) => [f.id, f.name]));
  const encodings = {};
  for (const [channel, e] of Object.entries(t.encodingMap || {})) {
    if (!e?.fieldID) continue;
    const field = idToName.get(e.fieldID) ?? e.fieldID;
    encodings[channel] = collapse({
      field, type: e.dtype, aggregate: e.aggregate, sortOrder: e.sortOrder, sortBy: e.sortBy, scheme: e.scheme,
    });
  }
  const semantic_types = {};
  for (const [k, m] of Object.entries(t.metadata || {})) semantic_types[k] = m.semanticType;
  return {
    semantic_types,
    chart_spec: { chartType: t.chartType, encodings, baseSize: canvas, ...(t.chartProperties ? { chartProperties: t.chartProperties } : {}) },
    ...(t.assembleOptions ? { options: t.assembleOptions } : {}),
    ...(t.semanticAnnotations ? { semantic_annotations: t.semanticAnnotations } : {}),
    data: { values: t.data },
  };
}

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function primaryCardinality(t) {
  const enc = t.encodingMap?.x ?? t.encodingMap?.y;
  const f = enc?.fieldID ? t.fields.find((x) => x.id === enc.fieldID) : null;
  if (!f) return 0;
  const seen = new Set();
  for (const row of t.data || []) seen.add(row[f.name]);
  return seen.size;
}

const familyFilter = process.argv[2];
const selectedTypes = familyFilter
  ? MAJOR_TYPES.filter((type) => slug(type) === familyFilter)
  : MAJOR_TYPES;
if (familyFilter && selectedTypes.length === 0) {
  throw new Error(`Unknown gallery family "${familyFilter}".`);
}
if (familyFilter) rmSync(join(OUT, familyFilter), { recursive: true, force: true });
else rmSync(OUT, { recursive: true, force: true });
let total = 0;
for (const type of selectedTypes) {
  const gen = TEST_GENERATORS[GENERATOR_KEYS[type] ?? type];
  if (!gen) { console.warn(`(no generator for ${type})`); continue; }
  const dir = join(OUT, slug(type));
  mkdirSync(dir, { recursive: true });
  let n = 0;
  gen().forEach((t, i) => {
    if (t.encodingMap?.column?.fieldID || t.encodingMap?.row?.fieldID) return; // skip facets
    const card = primaryCardinality(t);
    writeFileSync(join(dir, `${String(i).padStart(2, '0')}-card${card}.flint.json`), JSON.stringify(toAssemblyInput(t), null, 2) + '\n');
    total += 1; n += 1;
  });
  console.log(`${type}: ${n} inputs`);
}
console.log(`\nwrote ${total} gallery inputs under evaluations/inputs/`);
