/* global Office, Excel */
// @ts-nocheck
window.__flintWorkerLoaded = true;

/**
 * The backend bundle is imported per backend version at job time, so rebuilding
 * flint-js never reloads the pane (which needs an unlocked desktop to reopen).
 * A bundle that fails to load fails its job; the worker keeps polling.
 */
let backendVersion = null;
const backendModules = new Map();
async function loadBackend() {
  const key = backendVersion ?? 'initial';
  if (!backendModules.has(key)) {
    backendModules.set(key, import(`/flint-excel-backend.js?v=${key}`).catch((error) => {
      backendModules.delete(key);
      throw error;
    }));
  }
  return backendModules.get(key);
}

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
  if (l) l.textContent = (`${new Date().toLocaleTimeString()}  ${msg}\n` + l.textContent).slice(0, 4000);
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

async function cleanActiveWorksheet() {
  await Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    sheet.charts.load('items/name');
    const usedRange = sheet.getUsedRangeOrNullObject();
    await context.sync();
    sheet.charts.items.forEach((chart) => chart.delete());
    if (!usedRange.isNullObject) {
      usedRange.rowHidden = false;
      usedRange.columnHidden = false;
      usedRange.clear();
    }
    await context.sync();
  });
}

async function renderGeneratedProgram(job) {
  if (job.renderOptions?.cleanWorksheet !== false) await cleanActiveWorksheet();
  const module = await import(`${SERVER}/generated-program/${job.id}.mjs?v=${Date.now()}`);
  if (typeof module.renderChart !== 'function') {
    throw new Error('Generated Office.js module does not export renderChart.');
  }
  await module.renderChart(Excel, job.data);
  return Excel.run(async (context) => {
    const sheet = context.workbook.worksheets.getActiveWorksheet();
    sheet.charts.load('items/name,items/chartType,items/width,items/height');
    const usedRange = sheet.getUsedRangeOrNullObject();
    usedRange.load('isNullObject,address,values');
    await context.sync();
    if (sheet.charts.items.length !== 1) {
      throw new Error(`Generated Office.js created ${sheet.charts.items.length} charts; expected exactly one.`);
    }
    const chart = sheet.charts.items[0];
    chart.series.load('items/name');
    const scale = Number(job.renderOptions?.scale ?? 2);
    const image = chart.getImage(
      Math.round(chart.width * (96 / 72) * scale),
      Math.round(chart.height * (96 / 72) * scale),
      Excel.ImageFittingMode.fit,
    );
    await context.sync();
    return {
      pngBase64: image.value,
      inspection: job.renderOptions?.inspectNativeChart ? {
        usedRange: usedRange.isNullObject ? null : {
          address: usedRange.address,
          values: usedRange.values,
        },
        chart: {
          name: chart.name,
          chartType: chart.chartType,
          width: chart.width,
          height: chart.height,
          series: chart.series.items.map((series) => ({ name: series.name })),
        },
      } : null,
    };
  });
}

function bytesToBase64(bytes) {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 0x8000) {
    binary += String.fromCharCode.apply(null, bytes.slice(index, index + 0x8000));
  }
  return btoa(binary);
}

/** The open workbook as .xlsx bytes (Base64), read slice by slice. */
function readWorkbookFile() {
  return new Promise((resolve, reject) => {
    Office.context.document.getFileAsync(Office.FileType.Compressed, { sliceSize: 4 * 1024 * 1024 }, (opened) => {
      if (opened.status !== Office.AsyncResultStatus.Succeeded) {
        reject(new Error(`getFileAsync failed: ${opened.error?.message}`));
        return;
      }
      const file = opened.value;
      const slices = [];
      const readSlice = (index) => file.getSliceAsync(index, (slice) => {
        if (slice.status !== Office.AsyncResultStatus.Succeeded) {
          file.closeAsync();
          reject(new Error(`getSliceAsync failed: ${slice.error?.message}`));
          return;
        }
        slices.push(slice.value.data);
        if (index + 1 < file.sliceCount) {
          readSlice(index + 1);
          return;
        }
        file.closeAsync();
        resolve(bytesToBase64(slices.flat()));
      });
      readSlice(0);
    });
  });
}

/**
 * Build a workbook of native charts (one sheet each, beside its data) and an
 * overview sheet, export it, then remove the added sheets so the render sheet
 * is left as it was.
 */
async function exportWorkbook(job) {
  const backend = await loadBackend();
  const { overview } = job;
  const added = [];
  let renderSheet = null;
  try {
    await cleanActiveWorksheet();
    for (const sheet of job.sheets) {
      await backend.renderExcelChart(Excel, sheet.artifact, { worksheetName: sheet.name, scale: 1, cleanWorksheet: true });
      added.push(sheet.name);
      await Excel.run(async (context) => {
        const worksheet = context.workbook.worksheets.getItem(sheet.name);
        worksheet.getUsedRange().format.autofitColumns();
        await context.sync();
      });
    }
    await Excel.run(async (context) => {
      const worksheets = context.workbook.worksheets;
      const active = worksheets.getActiveWorksheet();
      active.load('name');
      const sheet = worksheets.add(overview.sheetName);
      added.push(overview.sheetName);
      sheet.position = 0;
      sheet.getRange('A1').values = [[overview.title]];
      sheet.getRange('A1').format.font.size = 18;
      sheet.getRange('A1').format.font.bold = true;
      (overview.notes ?? []).forEach((note, index) => {
        sheet.getRange(`A${index + 2}`).values = [[note]];
      });
      const top = (overview.notes?.length ?? 0) + 3;
      const header = sheet.getRangeByIndexes(top - 1, 0, 1, overview.header.length);
      header.values = [overview.header];
      header.format.font.bold = true;
      header.format.fill.color = '#DDEBF7';
      overview.rows.forEach((row, index) => {
        const cells = sheet.getRangeByIndexes(top + index, 0, 1, row.length);
        cells.values = [row];
        const link = sheet.getCell(top + index, 0);
        link.hyperlink = { documentReference: `'${row[0]}'!A1`, textToDisplay: String(row[0]) };
      });
      sheet.getRangeByIndexes(top - 1, 0, overview.rows.length + 1, overview.header.length).format.autofitColumns();
      await context.sync();
      renderSheet = active.name;
      active.visibility = 'Hidden';
      sheet.activate();
      await context.sync();
    });
    return await readWorkbookFile();
  } finally {
    await Excel.run(async (context) => {
      const worksheets = context.workbook.worksheets;
      if (renderSheet) {
        const render = worksheets.getItem(renderSheet);
        render.visibility = 'Visible';
        render.activate();
        await context.sync();
      }
      for (const name of added) worksheets.getItemOrNullObject(name).delete();
      await context.sync();
    });
  }
}

/** Auto-reload: reload the pane whenever the served worker code changes. */
async function checkVersion() {
  try {
    const r = await fetch(`${SERVER}/version`);
    if (!r.ok) return;
    const { version, backend } = await r.json();
    if (backend !== undefined) backendVersion = backend;
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
    if (job.kind === 'workbook') {
      setStatus(`building a workbook of ${job.sheets.length} charts…`, 'busy');
      log(`job ${job.id}: workbook of ${job.sheets.length} charts`);
      try {
        const fileBase64 = await exportWorkbook(job);
        await fetch(`${SERVER}/result`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: job.id, name: 'workbook', fileBase64 }),
        });
        log(`job ${job.id}: workbook exported (${fileBase64.length} b64 chars)`);
      } catch (err) {
        const errorMessage = describeError(err);
        log(`job ${job.id}: ERROR ${errorMessage}`);
        await fetch(`${SERVER}/result`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: job.id, error: errorMessage }),
        });
      }
      return;
    }
    const renderType = job.kind === 'program' ? 'generated Office.js' : job.artifact.chartType;
    const renderTitle = job.kind === 'program' ? renderType : job.artifact.title || renderType;
    setStatus(`rendering “${renderTitle}”…`, 'busy');
    log(`job ${job.id}: ${renderType}`);
    try {
      const blockedReason = BLOCKED_CHART_TYPES.get(String(renderType ?? '').toLowerCase());
      if (blockedReason) throw new Error(blockedReason);
      const { pngBase64, inspection } = job.kind === 'program'
        ? await renderGeneratedProgram(job)
        : await (await loadBackend()).renderExcelChart(Excel, job.artifact, job.renderOptions);
      const completedType = inspection?.chart?.chartType || renderType;
      await fetch(`${SERVER}/result`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: job.id, name: completedType, pngBase64, inspection }),
      });
      showPreview(pngBase64, completedType);
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
