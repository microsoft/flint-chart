#!/usr/bin/env node
// @ts-nocheck
/**
 * export-workbook.mjs — package the real-data gallery as one shareable .xlsx.
 *
 * Reads the artifacts written by real-gallery.mjs, asks the Office.js worker
 * to draw each as a native Excel chart on its own sheet (beside its data),
 * adds an overview sheet linking every chart with its source, and saves the
 * workbook Excel exports.
 *
 * Usage:
 *   node evaluations/real-gallery.mjs          # render the gallery first
 *   node evaluations/export-workbook.mjs [out.xlsx]
 */

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { request } from 'node:https';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const galleryDir = join(here, 'out', 'real-gallery');
const outPath = resolve(process.argv[2] ?? join(galleryDir, 'flint-excel-gallery.xlsx'));
const SERVER = 'https://localhost:3000';
const CA = join(homedir(), '.office-addin-dev-certs', 'ca.crt');

function call(path, body) {
  return new Promise((resolveCall, reject) => {
    const req = request(`${SERVER}${path}`, {
      method: body ? 'POST' : 'GET',
      headers: body ? { 'Content-Type': 'application/json' } : {},
      ca: existsSync(CA) ? readFileSync(CA) : undefined,
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolveCall({ status: response.statusCode, text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

/** A sheet name Excel accepts: at most 31 characters, none of []:*?/\, unique. */
function sheetNames(titles) {
  const used = new Set();
  return titles.map((title, index) => {
    const prefix = `${String(index + 1).padStart(2, '0')} `;
    const clean = title.replace(/[[\]:*?/\\'’]/g, '').replace(/\s+—\s+.*/, '').replace(/\s+/g, ' ').trim();
    let name = `${prefix}${clean}`.slice(0, 31).trim();
    while (used.has(name)) name = `${name.slice(0, 29)}~${used.size}`;
    used.add(name);
    return name;
  });
}

async function main() {
  const summary = JSON.parse(readFileSync(join(galleryDir, 'summary.json'), 'utf8')).filter((entry) => entry.ok);
  if (summary.length === 0) throw new Error('No rendered gallery charts; run real-gallery.mjs first.');
  const names = sheetNames(summary.map((entry) => entry.title));
  const sheets = summary.map((entry, index) => ({
    name: names[index],
    artifact: JSON.parse(readFileSync(join(galleryDir, `${entry.id}.artifact.json`), 'utf8')),
  }));
  const overview = {
    sheetName: 'Overview',
    title: 'Flint → Excel: native charts from real data',
    notes: [
      `Each sheet holds a native, editable Excel chart compiled by flint-chart's Excel backend (assembleExcel), beside the data it draws. Generated ${new Date().toISOString().slice(0, 10)}.`,
      'Size, axes, date ticks, number formats and bar spacing come from Flint\'s layout; colours and fonts are Excel\'s own. Click a sheet name to open it.',
    ],
    header: ['Sheet', 'Chart', 'Flint chart type', 'Excel chart type', 'Size (pt)', 'Data source'],
    rows: summary.map((entry, index) => [names[index], entry.title, entry.chartType, entry.excelType, entry.size, entry.source ?? '']),
  };

  const health = JSON.parse((await call('/health')).text);
  if (!health.worker_ready) throw new Error('Excel task pane is not connected; open the Flint Render add-in first.');
  const enqueued = await call('/enqueue-workbook', { sheets, overview });
  if (enqueued.status !== 200) throw new Error(`Worker rejected the workbook (${enqueued.status}): ${enqueued.text}`);
  const { id } = JSON.parse(enqueued.text);
  console.log(`building a workbook of ${sheets.length} charts (job ${id})…`);

  const deadline = Date.now() + 15 * 60_000;
  while (Date.now() < deadline) {
    const result = await call(`/result?id=${id}`);
    if (result.status === 200) {
      const payload = JSON.parse(result.text);
      if (payload.error) throw new Error(payload.error);
      writeFileSync(outPath, Buffer.from(payload.fileBase64, 'base64'));
      console.log(`wrote ${outPath}`);
      return;
    }
    await new Promise((wake) => setTimeout(wake, 1000));
  }
  throw new Error('Timed out waiting for the workbook.');
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
