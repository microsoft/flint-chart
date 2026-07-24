#!/usr/bin/env node
// @ts-nocheck

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCanvas, loadImage } from '@napi-rs/canvas';
import { renderChart } from 'flint-chart-mcp/render';
import { assembleExcel } from 'flint-chart/excel';
import { TEST_GENERATORS } from 'flint-chart/test-data';
import { renderExcelArtifact } from './render-client.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const outDir = join(here, 'out', 'candlestick-audit');
const cases = [0, 1];

function loadEnvFile() {
  const envPath = join(root, '.env');
  if (!existsSync(envPath)) return false;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!match || process.env[match[1]] !== undefined) continue;
    process.env[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return true;
}

function toAssemblyInput(test) {
  const idToName = new Map(test.fields.map((field) => [field.id, field.name]));
  const encodings = {};
  for (const [channel, encoding] of Object.entries(test.encodingMap || {})) {
    if (encoding?.fieldID) encodings[channel] = idToName.get(encoding.fieldID) ?? encoding.fieldID;
  }
  return {
    data: { values: test.data },
    semantic_types: Object.fromEntries(Object.entries(test.metadata).map(([field, metadata]) => [field, metadata.semanticType])),
    chart_spec: {
      chartType: test.chartType,
      encodings,
      baseSize: { width: 640, height: 380 },
    },
  };
}

async function sideBySide(referenceBuffer, excelBuffer, outputPath) {
  const [reference, excel] = await Promise.all([loadImage(referenceBuffer), loadImage(excelBuffer)]);
  const labelHeight = 42;
  const gap = 20;
  const canvas = createCanvas(reference.width + excel.width + gap, Math.max(reference.height, excel.height) + labelHeight);
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#222222';
  context.font = 'bold 20px sans-serif';
  context.fillText('Canonical Vega-Lite', 12, 28);
  context.fillText('Native Excel StockOHLC', reference.width + gap + 12, 28);
  context.drawImage(reference, 0, labelHeight);
  context.drawImage(excel, reference.width + gap, labelHeight);
  writeFileSync(outputPath, canvas.toBuffer('image/png'));
}

async function reviewWithVlm(imagePaths) {
  const envLoaded = loadEnvFile();
  const azureEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
  const deployment = process.env.AZURE_OPENAI_DEPLOYMENT;
  const apiKey = process.env.AZURE_OPENAI_API_KEY;
  const directEndpoint = process.env.VLM_ENDPOINT;
  const model = process.env.VLM_MODEL;
  const directKey = process.env.VLM_API_KEY;
  if (!envLoaded || (!directEndpoint && !(azureEndpoint && deployment)) || (!apiKey && !directKey)) {
    return { status: 'SKIP', reason: 'No configured VLM endpoint and credential were found in workspace .env.' };
  }

  const endpoint = directEndpoint ?? `${azureEndpoint.replace(/\/$/, '')}/openai/deployments/${deployment}/chat/completions?api-version=${process.env.AZURE_OPENAI_API_VERSION ?? '2024-10-21'}`;
  const content = [{
    type: 'text',
    text: 'Review these side-by-side candlestick charts. Check for blank or clipped marks, incorrect OHLC encoding, broken date or price axes, unreadable labels, misleading geometry, overlap, and whether native Excel preserves the canonical financial reading. Return concise JSON with status PASS or FAIL, findings, and per-image notes.',
  }];
  for (const imagePath of imagePaths) {
    content.push({ type: 'image_url', image_url: { url: `data:image/png;base64,${readFileSync(imagePath).toString('base64')}` } });
  }
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'api-key': apiKey } : { Authorization: `Bearer ${directKey}` }),
    },
    body: JSON.stringify({ model, messages: [{ role: 'user', content }], max_tokens: 1200 }),
  });
  if (!response.ok) return { status: 'FAIL', reason: `VLM request failed with HTTP ${response.status}.` };
  const payload = await response.json();
  return { status: 'COMPLETE', review: payload.choices?.[0]?.message?.content ?? '' };
}

mkdirSync(outDir, { recursive: true });
const fixtures = TEST_GENERATORS['Candlestick Chart']();
const results = [];
const comparisons = [];

for (const fixtureIndex of cases) {
  const fixture = fixtures[fixtureIndex];
  const name = fixtureIndex === 0 ? 'basic-30-day' : 'advanced-90-day-dense';
  const referencePath = join(outDir, `${name}.vl.png`);
  const excelPath = join(outDir, `${name}.excel.png`);
  const comparisonPath = join(outDir, `${name}.comparison.png`);
  const result = { name, title: fixture.title, status: 'FAIL' };
  try {
    const input = toAssemblyInput(fixture);
    const reference = await renderChart(input, 'vegalite', { format: 'png', scale: 3 });
    writeFileSync(referencePath, reference.buffer);
    const spec = assembleExcel(input);
    spec.width = Math.max(640, Math.min(1600, Math.round(reference.width || 640)));
    spec.height = Math.max(380, Math.min(900, Math.round(reference.height || 380)));
    const excel = await renderExcelArtifact(spec);
    writeFileSync(excelPath, excel);
    await sideBySide(reference.buffer, excel, comparisonPath);
    Object.assign(result, {
      status: 'RENDERED',
      chartType: spec.chartType,
      range: `A1:E${spec.data.length}`,
      reference: referencePath,
      excel: excelPath,
      comparison: comparisonPath,
    });
    comparisons.push(comparisonPath);
  } catch (error) {
    result.error = String(error.message || error);
  }
  results.push(result);
}

const vlm = comparisons.length === cases.length
  ? await reviewWithVlm(comparisons)
  : { status: 'SKIP', reason: 'VLM review skipped because not all real-Excel cases rendered.' };
const summary = { generatedAt: new Date().toISOString(), cases: results, vlm };
writeFileSync(join(outDir, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
console.log(JSON.stringify(summary, null, 2));
process.exit(results.some((result) => result.status === 'FAIL') || vlm.status === 'FAIL' ? 1 : 0);