#!/usr/bin/env node
/**
 * One-off shots for microsoft/flint-chart#98. Not part of the test suite.
 * Usage: node scripts/issue-98-slope-shots.mjs
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import { assembleECharts } from '../packages/flint-js/dist/echarts/index.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'docs/figs');

const assembled = assembleECharts({
  data: {
    values: [
      { period: '2024', team: 'Alpha', nps: 32 },
      { period: '2025', team: 'Alpha', nps: 48 },
      { period: '2024', team: 'Beta', nps: 41 },
      { period: '2025', team: 'Beta', nps: 39 },
      { period: '2024', team: 'Gamma', nps: 28 },
      { period: '2025', team: 'Gamma', nps: 52 },
      { period: '2024', team: 'Delta', nps: 55 },
      { period: '2025', team: 'Delta', nps: 61 },
    ],
  },
  semantic_types: { period: 'Year', team: 'Name', nps: 'Score' },
  chart_spec: {
    chartType: 'Slope Chart',
    encodings: {
      x: { field: 'period' },
      y: { field: 'nps' },
      color: { field: 'team' },
    },
    baseSize: { width: 420, height: 280 },
  },
});

const { _width: designW, _height: designH, _warnings, _dataLength, _pivot, ...option } =
  assembled;
void _warnings;
void _dataLength;
void _pivot;

const cloneOpt = (o) =>
  JSON.parse(JSON.stringify(o, (_k, v) => (typeof v === 'function' ? undefined : v)));
const before = cloneOpt(option);
const gutter = designW - (option.grid?.right ?? 112);
before.legend = { ...before.legend, left: gutter };
delete before.legend.right;
if (Array.isArray(before.graphic)) {
  before.graphic = before.graphic.map((g) => {
    if (g?.type === 'text' && g.style?.fontWeight === 'bold') {
      const { right: _r, ...rest } = g;
      void _r;
      return { ...rest, left: gutter };
    }
    return g;
  });
}

const payload = { after: cloneOpt(option), before, designW, designH };

const html = `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <style>html,body{margin:0;background:#fff}#c{background:#fff}</style>
</head>
<body>
  <div id="c"></div>
  <script type="module">
    import * as echarts from '/echarts.js';
    window.__echarts = echarts;
    window.__payload = ${JSON.stringify(payload)};
    window.__ready = true;
  </script>
</body>
</html>`;

mkdirSync(outDir, { recursive: true });
const htmlPath = join(outDir, '.issue-98-host.html');
writeFileSync(htmlPath, html);

const echartsFile = join(root, 'node_modules/echarts/dist/echarts.esm.min.js');
const server = createServer((req, res) => {
  if (req.url === '/echarts.js') {
    res.writeHead(200, { 'content-type': 'text/javascript' });
    res.end(readFileSync(echartsFile));
    return;
  }
  res.writeHead(200, { 'content-type': 'text/html' });
  res.end(html);
});

await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const { port } = server.address();
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser = await puppeteer.launch({
  executablePath: chrome,
  headless: true,
  args: ['--hide-scrollbars'],
});
const page = await browser.newPage();
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__ready === true);

async function shot(name, width, which) {
  await page.setViewport({ width, height: designH, deviceScaleFactor: 2 });
  await page.evaluate(
    async ({ width: w, height, which: key }) => {
      const echarts = window.__echarts;
      const payload = window.__payload;
      const el = document.getElementById('c');
      el.style.width = `${w}px`;
      el.style.height = `${height}px`;
      echarts.dispose(el);
      const chart = echarts.init(el, undefined, { renderer: 'canvas', width: w, height });
      const opt = { ...payload[key], animation: false };
      chart.setOption(opt, { notMerge: true });
      if (w !== payload.designW) chart.resize({ width: w, height });
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await new Promise((r) => setTimeout(r, 50));
    },
    { width, height: designH, which },
  );
  const path = join(outDir, name);
  await page.screenshot({ path, type: 'png', clip: { x: 0, y: 0, width, height: designH } });
  console.log('wrote', path);
}

await shot('issue-98-slope-534.png', designW, 'after');
await shot('issue-98-slope-800.png', 800, 'after');
await shot('issue-98-slope-800-before.png', 800, 'before');

await browser.close();
server.close();
try {
  const { unlinkSync } = await import('node:fs');
  unlinkSync(htmlPath);
} catch {
  /* ignore */
}
