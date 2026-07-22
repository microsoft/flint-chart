/* global Office, Excel */
// @ts-nocheck
import { renderExcelChart } from '/flint-excel-backend.js';

/**
 * taskpane.js — Office.js render worker.
 *
 * Long-polls the local server for Flint Excel artifacts, delegates execution
 * to the flint-chart/excel runtime, and posts the resulting PNG back.
 */

const SERVER = 'https://localhost:3000';
const BLOCKED_CHART_TYPES = new Map([
  ['pareto', 'Native Pareto rendering is disabled because Excel for Mac exits while creating the chart.'],
]);
const el = (id) => document.getElementById(id);
let renderCount = 0;
let codeVersion = null;
let polling = false;

function setStatus(text, cls) {
  const s = el('status');
  if (s) s.className = `status ${cls || 'idle'}`;
  const t = el('status-text');
  if (t) t.textContent = text;
}
function log(msg) {
  const l = el('log');
  if (l) l.textContent = `${new Date().toLocaleTimeString()}  ${msg}\n` + l.textContent;
}
function showPreview(base64, type) {
  const p = el('preview');
  if (p) {
    p.innerHTML = '';
    const img = document.createElement('img');
    img.src = `data:image/png;base64,${base64}`;
    p.appendChild(img);
  }
  renderCount += 1;
  if (el('m-count')) el('m-count').textContent = String(renderCount);
  if (el('m-type')) el('m-type').textContent = type || '—';
}

function describeError(error) {
  const parts = [String(error?.message || error)];
  if (error?.code) parts.push(`code=${error.code}`);
  if (error?.debugInfo?.errorLocation) parts.push(`location=${error.debugInfo.errorLocation}`);
  if (error?.debugInfo?.statement) parts.push(`statement=${error.debugInfo.statement}`);
  if (error?.debugInfo?.surroundingStatements) {
    parts.push(`context=${error.debugInfo.surroundingStatements.join(' | ')}`);
  }
  return parts.join('; ');
}

/** Auto-reload: reload the pane whenever the served worker code changes. */
async function checkVersion() {
  try {
    const r = await fetch(`${SERVER}/version`);
    if (!r.ok) return;
    const { version } = await r.json();
    if (codeVersion === null) { codeVersion = version; return; }
    if (version !== codeVersion) {
      log('code changed — reloading…');
      setTimeout(() => location.reload(), 200);
    }
  } catch { /* ignore */ }
}

async function poll() {
  if (polling) return;
  polling = true;
  try {
    const res = await fetch(`${SERVER}/next-job`);
    if (res.status === 204) {
      setStatus('ready — waiting for jobs', 'ready');
      return;
    }
    const job = await res.json();
    const renderType = job.artifact.chartType;
    setStatus(`rendering “${job.artifact.title || renderType}”…`, 'busy');
    log(`job ${job.id}: ${renderType} ${job.artifact.title || ''}`);
    try {
        const blockedReason = BLOCKED_CHART_TYPES.get(String(renderType ?? '').toLowerCase());
        if (blockedReason) throw new Error(blockedReason);
      const { pngBase64, inspection } = await renderExcelChart(Excel, job.artifact, job.renderOptions);
      await fetch(`${SERVER}/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: job.id, name: job.artifact.name || job.artifact.chartType, pngBase64, inspection }),
      });
      showPreview(pngBase64, renderType);
      log(`job ${job.id}: rendered (${pngBase64.length} b64 chars)`);
    } catch (err) {
      const errorMessage = describeError(err);
      log(`job ${job.id}: ERROR ${errorMessage}`);
      await fetch(`${SERVER}/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: job.id, error: errorMessage }),
      });
    }
  } catch (err) {
    setStatus(`server unreachable: ${err.message}`, 'err');
  } finally {
    polling = false;
  }
}

Office.onReady((info) => {
  if (info.host !== Office.HostType.Excel) {
    setStatus(`wrong host: ${info.host} (open in Excel)`, 'err');
    return;
  }
  setStatus('ready — polling for jobs', 'ready');
  log('worker ready');
  // announce ourselves so the server logs that the pane connected
  fetch(`${SERVER}/ready`, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' },
    body: `host=${info.host} platform=${info.platform}`,
  }).catch((e) => log(`ready ping failed: ${e.message}`));
  checkVersion();
  poll();
  setInterval(checkVersion, 1500);
  setInterval(poll, 800);
});
