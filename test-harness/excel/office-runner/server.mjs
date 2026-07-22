#!/usr/bin/env node
// @ts-check
/**
 * server.mjs — local HTTPS render server for the Office.js add-in harness.
 *
 * Pattern: Excel + the sideloaded task pane stay open and act as a rendering
 * worker. The task pane long-polls this server for jobs, runs Office.js to
 * build a chart and calls `chart.getImage()`, then POSTs the Base64 PNG back.
 * The CLI enqueues jobs and waits for the resulting PNG file.
 *
 *   Terminal A:  npm run server                       # start server (once)
 *                # open Excel, load the "Flint Render" add-in task pane (once)
 *   Terminal B:  npm run render -- artifact.json evaluations/out/chart.png
 *
 * HTTPS is mandatory for Office add-ins. Uses the office-addin-dev-certs CA
 * (run `npx office-addin-dev-certs install` once).
 */

import https from 'node:https';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, dirname, resolve, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { execFileSync } from 'node:child_process';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = 3000;
const flintJsRoot = resolve(here, '../../../packages/flint-js');
const excelBackendBundle = join(flintJsRoot, 'dist/excel/index.js');

/** In-memory job queue + results. */
/** @type {Array<{ id: number, artifact: any, renderOptions: any, enqueuedAt: number }>} */
const queue = [];
const results = new Map(); // id -> { name, pngBase64 }
let nextId = 1;
let workerSeen = false; // has the task pane ever contacted us?
const JOB_TTL_MS = 120_000;
const BLOCKED_CHART_TYPES = new Map([
  ['pareto', 'Native Pareto rendering is disabled because Excel for Mac exits while creating the chart.'],
]);

/** @type {Record<string, string>} */
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

function loadDevCerts() {
  // office-addin-dev-certs writes to ~/.office-addin-dev-certs
  const base = join(homedir(), '.office-addin-dev-certs');
  const key = join(base, 'localhost.key');
  const cert = join(base, 'localhost.crt');
  const ca = join(base, 'ca.crt');
  if (!existsSync(key) || !existsSync(cert)) {
    console.error(
      'Dev certs not found. Run:  npx office-addin-dev-certs install\n' +
        `Expected key/cert under ${base}`,
    );
    process.exit(1);
  }
  return {
    key: readFileSync(key),
    cert: readFileSync(cert),
    ca: existsSync(ca) ? readFileSync(ca) : undefined,
  };
}

/**
 * @param {import('http').ServerResponse} res
 * @param {number} status
 * @param {string | Buffer} body
 * @param {string} [contentType]
 */
function send(res, status, body, contentType = 'application/json') {
  res.writeHead(status, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
  });
  res.end(body);
}

/** @param {import('http').IncomingMessage} req */
async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString('utf8');
}

async function startServer() {
  execFileSync('npm', ['run', 'build', '--prefix', flintJsRoot], { stdio: 'inherit' });
  const creds = loadDevCerts();
  const server = https.createServer(creds, async (req, res) => {
    const url = new URL(req.url ?? '/', `https://localhost:${PORT}`);
    const path = url.pathname;

    if (req.method === 'OPTIONS') return send(res, 204, '');

    // --- code version (for the pane's auto-reload) ---
    if (req.method === 'GET' && path === '/version') {
      let v = 0;
      for (const f of ['officejs/taskpane.js', 'officejs/taskpane.html']) {
        try { v = Math.max(v, statSync(join(here, f)).mtimeMs); } catch { /* ignore */ }
      }
      try { v = Math.max(v, statSync(excelBackendBundle).mtimeMs); } catch { /* ignore */ }
      return send(res, 200, JSON.stringify({ version: Math.round(v) }));
    }

    // --- task pane announces itself on load ---
    if (req.method === 'POST' && path === '/ready') {
      const body = await readBody(req).catch(() => '');
      console.log(`[worker] task pane connected: ${body || '(no info)'}`);
      workerSeen = true;
      return send(res, 200, JSON.stringify({ ok: true }));
    }

    // --- static files (task pane) ---
    if (req.method === 'GET' && (path === '/' || path === '/taskpane.html')) {
      const html = await readFile(join(here, 'officejs', 'taskpane.html'));
      return send(res, 200, html, MIME['.html']);
    }
    if (req.method === 'GET' && path === '/flint-excel-backend.js') {
      return send(res, 200, await readFile(excelBackendBundle), MIME['.js']);
    }
    if (req.method === 'GET' && path.startsWith('/officejs/')) {
      const file = join(here, path.replace(/^\//, ''));
      if (existsSync(file)) {
        return send(res, 200, await readFile(file), MIME[extname(file)] ?? 'text/plain');
      }
      return send(res, 404, 'not found', 'text/plain');
    }

    // --- worker long-poll for next job ---
    if (req.method === 'GET' && path === '/next-job') {
      if (!workerSeen) {
        workerSeen = true;
        console.log('[worker] task pane is polling for jobs');
      }
      const now = Date.now();
      while (queue.length > 0 && now - (queue[0].enqueuedAt ?? 0) > JOB_TTL_MS) {
        const expired = queue.shift();
        console.log(`[job ${expired?.id}] discarded after queue timeout`);
      }
      const job = queue.shift();
      if (!job) return send(res, 204, '');
      console.log(`[job ${job.id}] dispatched to task pane (${job.artifact.chartType})`);
      return send(res, 200, JSON.stringify(job));
    }

    // --- worker posts a rendered PNG ---
    if (req.method === 'POST' && path === '/result') {
      const body = JSON.parse(await readBody(req));
      results.set(body.id, {
        name: body.name,
        pngBase64: body.pngBase64,
        inspection: body.inspection,
        error: body.error,
      });
      if (body.error) console.log(`[job ${body.id}] ERROR from task pane: ${body.error}`);
      else console.log(`[job ${body.id}] received PNG (${(body.pngBase64 || '').length} b64 chars)`);
      return send(res, 200, JSON.stringify({ ok: true }));
    }

    // --- CLI enqueues a job ---
    if (req.method === 'POST' && path === '/enqueue') {
      const payload = JSON.parse(await readBody(req));
      if (!payload || typeof payload !== 'object' || !payload.artifact) {
        return send(res, 400, JSON.stringify({ error: 'Expected { artifact, renderOptions? }.' }));
      }
      const artifact = payload.artifact;
      if (artifact.schema !== 'flint.excel.chart/v1' || artifact.kind !== 'chart') {
        return send(res, 422, JSON.stringify({ error: 'Expected a flint.excel.chart/v1 chart artifact.' }));
      }
      const renderOptions = {
        scale: payload.renderOptions?.scale ?? 3,
        cleanWorksheet: payload.renderOptions?.cleanWorksheet ?? true,
        inspectNativeChart: payload.renderOptions?.inspectNativeChart ?? false,
      };
      const blockedReason = BLOCKED_CHART_TYPES.get(String(artifact.chartType ?? '').toLowerCase());
      if (blockedReason) {
        return send(res, 422, JSON.stringify({ error: blockedReason }));
      }
      const id = nextId++;
      queue.push({ id, artifact, renderOptions, enqueuedAt: Date.now() });
      return send(res, 200, JSON.stringify({ id }));
    }

    // --- CLI cancels an abandoned queued job ---
    if (req.method === 'POST' && path === '/cancel') {
      const id = Number(url.searchParams.get('id'));
      const index = queue.findIndex((job) => job.id === id);
      if (index >= 0) queue.splice(index, 1);
      results.delete(id);
      return send(res, 200, JSON.stringify({ cancelled: index >= 0 }));
    }

    // --- CLI polls for a result ---
    if (req.method === 'GET' && path === '/result') {
      const id = Number(url.searchParams.get('id'));
      const r = results.get(id);
      if (!r) return send(res, 204, '');
      results.delete(id);
      return send(res, 200, JSON.stringify(r));
    }

    return send(res, 404, JSON.stringify({ error: 'not found' }));
  });

  server.listen(PORT, () => {
    console.log(`Flint Office.js render server: https://localhost:${PORT}`);
    console.log('Open Excel and load the "Flint Render" add-in task pane, then enqueue jobs.');
  });
}

/** CLI: enqueue an artifact against a running server and wait for the PNG.
 *  @param {string} artifactFile
 *  @param {string} outPath */
async function renderViaServer(artifactFile, outPath) {
  const artifact = JSON.parse(readFileSync(artifactFile, 'utf8'));
  const base = `https://localhost:${PORT}`;

  const enq = await fetch(`${base}/enqueue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ artifact }),
  }).catch((e) => {
    throw new Error(`server not reachable at ${base} (start it first): ${e.message}`);
  });
  if (!enq.ok) throw new Error(`server rejected artifact with HTTP ${enq.status}: ${await enq.text()}`);
  const { id } = /** @type {{ id: number }} */ (await enq.json());
  console.log(`enqueued job ${id}; waiting for the Excel task pane to render…`);

  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const r = await fetch(`${base}/result?id=${id}`);
    if (r.status === 200) {
      const { pngBase64, error } = /** @type {{ pngBase64?: string, error?: string }} */ (await r.json());
      if (error) throw new Error(`render error: ${error}`);
      if (typeof pngBase64 !== 'string' || pngBase64.length === 0) {
        throw new Error('render error: worker returned no PNG payload');
      }
      const out = resolve(outPath);
      await mkdir(dirname(out), { recursive: true });
      await writeFile(out, Buffer.from(pngBase64, 'base64'));
      console.log(`rendered ${out}`);
      return;
    }
    await new Promise((r2) => setTimeout(r2, 500));
  }
  await fetch(`${base}/cancel?id=${id}`, { method: 'POST' }).catch(() => {});
  throw new Error('timed out waiting for the task pane to render (is Excel + add-in open?)');
}

/** Batch: enqueue many specs at once and collect all PNGs from the single
 *  long-lived Excel worker (one instance renders the whole queue sequentially).
 *  Usage: npm run render:batch -- [--out DIR] artifact1.json artifact2.json …
 *  @param {string[]} args
 */
async function renderBatchViaServer(args) {
  let outDir = 'out';
  /** @type {string[]} */
  const artifactFiles = [];
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--out') { outDir = args[++i]; continue; }
    artifactFiles.push(args[i]);
  }
  if (artifactFiles.length === 0) {
    throw new Error('usage: npm run render:batch -- [--out DIR] <artifact.json…>');
  }
  const base = `https://localhost:${PORT}`;

  // 1) enqueue everything up front so the worker can pipeline the queue
  /** @type {Array<{ id: number, name: string }>} */
  const jobs = [];
  for (const artifactFile of artifactFiles) {
    const artifact = JSON.parse(readFileSync(artifactFile, 'utf8'));
    const name = basename(artifactFile).replace(/\.json$/, '');
    const enq = await fetch(`${base}/enqueue`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ artifact }),
    }).catch((e) => {
      throw new Error(`server not reachable at ${base} (start it first): ${e.message}`);
    });
    if (!enq.ok) throw new Error(`server rejected ${artifactFile} with HTTP ${enq.status}: ${await enq.text()}`);
    const { id } = /** @type {{ id: number }} */ (await enq.json());
    jobs.push({ id, name });
  }
  console.log(`enqueued ${jobs.length} jobs; one Excel worker renders them in sequence…`);

  // 2) collect results in order
  const deadline = Date.now() + 60_000 * Math.max(1, jobs.length);
  let ok = 0;
  for (const job of jobs) {
    let done = false;
    while (!done && Date.now() < deadline) {
      const r = await fetch(`${base}/result?id=${job.id}`);
      if (r.status === 200) {
        const { pngBase64, error } = /** @type {{ pngBase64?: string, error?: string }} */ (await r.json());
        if (error) {
          console.error(`  ✗ ${job.name}: ${error}`);
        } else if (typeof pngBase64 !== 'string' || pngBase64.length === 0) {
          console.error(`  ✗ ${job.name}: worker returned no PNG payload`);
        } else {
          const out = resolve(outDir, `${job.name}.png`);
          await mkdir(dirname(out), { recursive: true });
          await writeFile(out, Buffer.from(pngBase64, 'base64'));
          console.log(`  ✓ ${job.name} → ${out}`);
          ok += 1;
        }
        done = true;
      } else {
        await new Promise((r2) => setTimeout(r2, 400));
      }
    }
    if (!done) {
      await fetch(`${base}/cancel?id=${job.id}`, { method: 'POST' }).catch(() => {});
      console.error(`  ✗ ${job.name}: timed out`);
    }
  }
  console.log(`${ok}/${jobs.length} rendered by a single Excel instance`);
}

const [cmd, a, b] = process.argv.slice(2);
if (cmd === 'render') {
  // NB: uses self-signed dev cert; set NODE_TLS_REJECT_UNAUTHORIZED=0 or trust the CA.
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED ?? '0';
  renderViaServer(a, b ?? 'evaluations/out/chart.png').catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
} else if (cmd === 'render-batch') {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = process.env.NODE_TLS_REJECT_UNAUTHORIZED ?? '0';
  renderBatchViaServer(process.argv.slice(3)).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
} else {
  startServer();
}
