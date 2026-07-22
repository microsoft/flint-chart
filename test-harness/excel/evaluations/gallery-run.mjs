#!/usr/bin/env node
// @ts-nocheck
/**
 * gallery-run.mjs — render each gallery Flint input as BOTH:
 *   • the Vega-Lite reference PNG — via Flint's own `renderChart(input,
 *     'vegalite', …)`, and
 *   • the Excel PNG — via the LIBRARY backend `assembleExcel(input)` rendered
 *     through the Office.js worker.
 *
 * Flint's VL renderer also returns the layout width/height, which we use to
 * size the Excel chart — so high-cardinality charts get the same
 * cardinality-driven room Flint's layout computed.
 *
 * Requires the render server + Excel task pane running (`npm run server`).
 *
 * Usage:
 *   node gallery-run.mjs bar-chart          # one type
 *   node gallery-run.mjs all                # every type
 *   node gallery-run.mjs bar-chart 4        # first 4 cases
 */

import { existsSync, readdirSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderChart } from 'flint-chart-mcp/render';
import { assembleExcel } from 'flint-chart/excel';
import { renderExcelArtifact } from './render-client.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const GALLERY = join(here, 'inputs');
const OUT = join(here, 'out', 'gallery');
const SCALE = 3;
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));
const referenceBackendFor = (typeSlug) => ['funnel-chart', 'treemap', 'sunburst-chart'].includes(typeSlug) ? 'echarts' : 'vegalite';

async function runType(typeSlug, limit) {
  const dir = join(GALLERY, typeSlug);
  let files;
  try { files = readdirSync(dir).filter((f) => f.endsWith('.flint.json')).sort(); }
  catch { console.error(`no such gallery type: ${typeSlug}`); return []; }
  if (limit) files = files.slice(0, limit);
  const outDir = join(OUT, typeSlug);
  mkdirSync(outDir, { recursive: true });

  const results = [];
  for (const file of files) {
    const name = basename(file).replace(/\.flint\.json$/, '');
    const vlPath = join(outDir, `${name}.vl.png`);
    const excelPath = join(outDir, `${name}.excel.png`);
    rmSync(vlPath, { force: true });
    rmSync(excelPath, { force: true });
    const input = JSON.parse(readFileSync(join(dir, file), 'utf8'));
    const rec = { type: typeSlug, name, ok: false, skipped: false };
    try {
      // Flint reference rendering also provides the layout size used by Excel.
      const referenceBackend = referenceBackendFor(typeSlug);
      const vl = await renderChart(input, referenceBackend, { format: 'png', scale: SCALE });
      writeFileSync(vlPath, vl.buffer);
      rec.vlSize = `${vl.width}x${vl.height}`;
      rec.referenceBackend = referenceBackend;

      // Excel-equivalent via the LIBRARY backend, sized from Flint's layout
      let spec;
      try {
        spec = assembleExcel(input);
      } catch (error) {
        const message = String(error.message || error);
        if (!message.startsWith('Excel backend ')) throw error;
        rec.skipped = true;
        rec.skipReason = message;
        console.log(`  - ${typeSlug}/${name}: SKIP ${message}`);
        results.push(rec);
        continue;
      }
      if (vl.width) spec.width = clamp(vl.width, 320, 1600);
      if (vl.height) spec.height = clamp(vl.height, 220, 900);
      rec.excelType = spec.chartType;

      const excelPng = await renderExcelArtifact(spec, { scale: SCALE });
      writeFileSync(excelPath, excelPng);
      rec.ok = true;
      console.log(`  ✓ ${typeSlug}/${name} (${rec.excelType}, VL ${rec.vlSize})`);
    } catch (e) {
      rec.error = String(e.message || e);
      console.error(`  ✗ ${typeSlug}/${name}: ${rec.error}`);
    }
    results.push(rec);
  }
  return results;
}

const arg = process.argv[2] || 'all';
const limit = process.argv[3] ? Number(process.argv[3]) : undefined;
const types = arg === 'all'
  ? readdirSync(GALLERY).filter((d) => { try { return readdirSync(join(GALLERY, d)).length; } catch { return false; } })
  : [arg];

const all = [];
for (const t of types) all.push(...(await runType(t, limit)));
mkdirSync(OUT, { recursive: true });
const summaryPath = join(OUT, 'summary.json');
let summary = all;
if (arg !== 'all' && existsSync(summaryPath)) {
  const previous = JSON.parse(readFileSync(summaryPath, 'utf8'));
  const replacedCases = new Set(all.map((entry) => `${entry.type}/${entry.name}`));
  summary = [...previous.filter((entry) => !replacedCases.has(`${entry.type}/${entry.name}`)), ...all]
    .sort((a, b) => a.type.localeCompare(b.type) || a.name.localeCompare(b.name));
}
writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n');
const rendered = all.filter((r) => r.ok).length;
const skipped = all.filter((r) => r.skipped).length;
console.log(`\n${rendered}/${all.length} pairs rendered, ${skipped} skipped → out/gallery/ (summary: ${summary.length} cases)`);
