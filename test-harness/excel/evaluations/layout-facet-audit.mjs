#!/usr/bin/env node
// @ts-nocheck

import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderChart } from 'flint-chart-mcp/render';
import { assembleExcel } from 'flint-chart/excel';
import { renderExcelArtifact } from './render-client.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const outDir = join(here, 'out', 'layout-facet-audit');
const tempDir = join(outDir, 'temp');
const scale = 3;
const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, Math.round(value)));

rmSync(outDir, { recursive: true, force: true });
mkdirSync(tempDir, { recursive: true });

function runMagick(args) {
  execFileSync('magick', args, { stdio: 'pipe' });
}

function barInput(count) {
  return {
    data: {
      values: Array.from({ length: count }, (_value, index) => ({
        Category: `Category ${index + 1}`,
        Value: 40 + ((index * 37) % 180),
      })),
    },
    semantic_types: { Category: 'Category', Value: 'Quantity' },
    chart_spec: {
      chartType: 'Bar Chart',
      encodings: { x: 'Category', y: 'Value' },
      baseSize: { width: 400, height: 300 },
    },
  };
}

function lineInput(dateCount, seriesCount) {
  const values = [];
  for (let seriesIndex = 0; seriesIndex < seriesCount; seriesIndex += 1) {
    for (let dateIndex = 0; dateIndex < dateCount; dateIndex += 1) {
      const date = new Date(Date.UTC(2020, 0, 1 + dateIndex));
      values.push({
        Date: date.toISOString().slice(0, 10),
        Series: `Series ${seriesIndex + 1}`,
        Value: Math.round(100 + seriesIndex * 18 + dateIndex * 1.7 + Math.sin((dateIndex + seriesIndex) / 4) * 24),
      });
    }
  }
  return {
    data: { values },
    semantic_types: { Date: 'Date', Series: 'Category', Value: 'Quantity' },
    chart_spec: {
      chartType: 'Line Chart',
      encodings: { x: 'Date', y: 'Value', color: 'Series' },
      baseSize: { width: 400, height: 300 },
    },
  };
}

const dynamicCases = [
  { name: 'bar-04', label: 'Bar · 4 categories', family: 'bar', input: barInput(4) },
  { name: 'bar-24', label: 'Bar · 24 categories', family: 'bar', input: barInput(24) },
  { name: 'bar-80', label: 'Bar · 80 categories', family: 'bar', input: barInput(80) },
  { name: 'line-12x1', label: 'Line · 12 dates × 1 series', family: 'line', input: lineInput(12, 1) },
  { name: 'line-60x8', label: 'Line · 60 dates × 8 series', family: 'line', input: lineInput(60, 8) },
  { name: 'line-120x20', label: 'Line · 120 dates × 20 series', family: 'line', input: lineInput(120, 20) },
];

async function runDynamicAudit() {
  const results = [];
  for (const item of dynamicCases) {
    const reference = await renderChart(item.input, 'vegalite', { format: 'png', scale });
    const spec = assembleExcel(item.input);
    const authoredSize = { width: spec.width, height: spec.height };
    spec.width = clamp(reference.width, 320, 1600);
    spec.height = clamp(reference.height, 220, 900);
    const excel = await renderExcelArtifact(spec, { scale });
    const referencePath = join(outDir, `${item.name}.reference.png`);
    const excelPath = join(outDir, `${item.name}.excel.png`);
    writeFileSync(referencePath, reference.buffer);
    writeFileSync(excelPath, excel);
    results.push({
      name: item.name,
      label: item.label,
      family: item.family,
      authoredSize,
      optimizedSize: { width: reference.width, height: reference.height },
      appliedExcelSize: { width: spec.width, height: spec.height },
      excelType: spec.chartType,
      retainedRows: spec.data.length - 1,
    });
    console.log(`  ✓ ${item.label}: ${reference.width}×${reference.height} → Excel ${spec.width}×${spec.height}`);
  }

  const barCases = results.filter((result) => result.family === 'bar');
  if (barCases[1].optimizedSize.width <= barCases[0].optimizedSize.width) {
    throw new Error('bar layout did not stretch for the moderate-cardinality case');
  }
  if (barCases.some((result, index) => result.retainedRows !== [4, 24, 80][index])) {
    throw new Error('bar layout dropped data while changing cardinality regimes');
  }
  for (const result of results) {
    if (result.appliedExcelSize.width < 320 || result.appliedExcelSize.width > 1600
      || result.appliedExcelSize.height < 220 || result.appliedExcelSize.height > 900) {
      throw new Error(`${result.name} escaped the Excel audit size bounds`);
    }
  }
  const lineCases = results.filter((result) => result.family === 'line');
  for (let index = 1; index < lineCases.length; index += 1) {
    const previous = lineCases[index - 1].optimizedSize;
    const current = lineCases[index].optimizedSize;
    if (current.width * current.height < previous.width * previous.height) {
      throw new Error(`line optimized area decreased from ${lineCases[index - 1].name} to ${lineCases[index].name}`);
    }
  }

  for (let page = 0; page < 2; page += 1) {
    const pageCases = results.slice(page * 3, page * 3 + 3);
    const rows = [];
    const header = join(tempDir, `dynamic-header-${page}.png`);
    runMagick(['-size', '2000x100', '-background', 'white', '-fill', 'black', '-font', 'Helvetica-Bold', '-pointsize', '26', '-gravity', 'center', `label:Dynamic layout audit · page ${page + 1}`, header]);
    rows.push(header);
    for (const result of pageCases) {
      const label = join(tempDir, `dynamic-${result.name}-label.png`);
      const reference = join(tempDir, `dynamic-${result.name}-reference.png`);
      const excel = join(tempDir, `dynamic-${result.name}-excel.png`);
      const row = join(tempDir, `dynamic-${result.name}-row.png`);
      const sizeLabel = `${result.label}\nFlint ${result.optimizedSize.width}×${result.optimizedSize.height}\nExcel ${result.appliedExcelSize.width}×${result.appliedExcelSize.height}`;
      runMagick(['-size', '300x600', '-background', 'white', '-fill', 'black', '-font', 'Helvetica', '-pointsize', '20', '-gravity', 'center', `label:${sizeLabel}`, label]);
      runMagick([join(outDir, `${result.name}.reference.png`), '-resize', '850x580', '-background', 'white', '-gravity', 'center', '-extent', '850x600', reference]);
      runMagick([join(outDir, `${result.name}.excel.png`), '-resize', '850x580', '-background', 'white', '-gravity', 'center', '-extent', '850x600', excel]);
      runMagick([label, reference, excel, '+append', row]);
      rows.push(row);
    }
    runMagick([...rows, '-append', join(outDir, `dynamic-layout-${page + 1}.png`)]);
  }
  return results;
}

function facetInput(name) {
  if (name === 'column-bar') {
    const values = [];
    for (const region of ['North', 'Central', 'South']) {
      for (const category of ['Consumer', 'Corporate', 'Home Office', 'Reseller']) {
        values.push({ Region: region, Category: category, Value: 60 + ((values.length * 47) % 320) });
      }
    }
    return {
      data: { values },
      semantic_types: { Region: 'Category', Category: 'Category', Value: 'Amount' },
      chart_spec: { chartType: 'Bar Chart', encodings: { x: 'Category', y: 'Value', column: 'Region' }, baseSize: { width: 400, height: 300 } },
    };
  }
  if (name === 'row-scatter') {
    const values = [];
    for (const group of ['Group A', 'Group B', 'Group C']) {
      for (let index = 0; index < 18; index += 1) {
        values.push({ Group: group, X: 20 + index * 4 + group.length, Y: 30 + ((index * 17 + group.charCodeAt(6)) % 70) });
      }
    }
    return {
      data: { values },
      semantic_types: { Group: 'Category', X: 'Quantity', Y: 'Quantity' },
      chart_spec: { chartType: 'Scatter Plot', encodings: { x: 'X', y: 'Y', row: 'Group' }, baseSize: { width: 400, height: 300 } },
    };
  }
  if (name === 'grid-bar') {
    const values = [];
    for (const region of ['North', 'South']) {
      for (const channel of ['Online', 'Retail']) {
        for (const category of ['A', 'B', 'C', 'D']) {
          values.push({ Region: region, Channel: channel, Category: category, Value: 50 + ((values.length * 31) % 240) });
        }
      }
    }
    return {
      data: { values },
      semantic_types: { Region: 'Category', Channel: 'Category', Category: 'Category', Value: 'Amount' },
      chart_spec: { chartType: 'Bar Chart', encodings: { x: 'Category', y: 'Value', column: 'Region', row: 'Channel' }, baseSize: { width: 400, height: 300 } },
    };
  }

  const values = [];
  for (const region of ['North', 'South', 'East', 'West', 'Central', 'Pacific', 'Mountain', 'Atlantic', 'Gulf', 'Midwest']) {
    for (let month = 0; month < 12; month += 1) {
      values.push({ Region: region, Month: `M${month + 1}`, Value: 80 + ((month * 23 + region.length * 17) % 170) });
    }
  }
  return {
    data: { values },
    semantic_types: { Region: 'Category', Month: 'Month', Value: 'Quantity' },
    chart_spec: { chartType: 'Line Chart', encodings: { x: 'Month', y: 'Value', column: 'Region' }, baseSize: { width: 400, height: 300 } },
    options: { minSubplotSize: 180 },
  };
}

const facetCases = [
  { name: 'column-bar', label: 'Column facet · 3 bar panels' },
  { name: 'row-scatter', label: 'Row facet · 3 scatter panels' },
  { name: 'grid-bar', label: 'Column × row facet · 2×2 bar panels' },
  { name: 'wrapped-line', label: 'Wrapped column facet · 10 line panels' },
];

function distinct(values, field) {
  return [...new Set(values.map((row) => String(row[field])))];
}

function sharedNumericAxis(values, zero = false) {
  const finite = values.map(Number).filter(Number.isFinite);
  if (finite.length === 0) return {};
  const minimum = zero ? 0 : Math.min(...finite);
  const maximum = Math.max(...finite);
  const span = Math.max(1, maximum - minimum);
  const rough = span / 5;
  const power = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / power;
  const step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
  const lower = zero ? 0 : Math.floor(minimum / step) * step;
  const upperTick = Math.ceil(maximum / step) * step;
  return {
    minimumScale: lower,
    maximumScale: Math.abs(upperTick - maximum) < 1e-9 ? maximum + step * 0.25 : upperTick,
    majorUnit: step,
  };
}

async function runFacetAudit() {
  const results = [];
  for (const item of facetCases) {
    const input = facetInput(item.name);
    const reference = await renderChart(input, 'vegalite', { format: 'png', scale });
    const referencePath = join(outDir, `${item.name}.reference.png`);
    writeFileSync(referencePath, reference.buffer);

    let rejection;
    try {
      assembleExcel(input);
      throw new Error('faceted input unexpectedly assembled as one native chart');
    } catch (error) {
      rejection = String(error.message || error);
      if (!rejection.includes('does not support faceting')) throw error;
    }

    const columnField = typeof input.chart_spec.encodings.column === 'string' ? input.chart_spec.encodings.column : input.chart_spec.encodings.column?.field;
    const rowField = typeof input.chart_spec.encodings.row === 'string' ? input.chart_spec.encodings.row : input.chart_spec.encodings.row?.field;
    const xField = typeof input.chart_spec.encodings.x === 'string' ? input.chart_spec.encodings.x : input.chart_spec.encodings.x?.field;
    const yField = typeof input.chart_spec.encodings.y === 'string' ? input.chart_spec.encodings.y : input.chart_spec.encodings.y?.field;
    const sharedCategoryAxis = input.chart_spec.chartType === 'Scatter Plot'
      ? sharedNumericAxis(input.data.values.map((row) => row[xField]))
      : undefined;
    const sharedValueAxis = sharedNumericAxis(
      input.data.values.map((row) => row[yField]),
      input.chart_spec.chartType === 'Bar Chart',
    );
    const columns = columnField ? distinct(input.data.values, columnField) : [null];
    const rows = rowField ? distinct(input.data.values, rowField) : [null];
    const panels = [];
    for (const rowValue of rows) {
      for (const columnValue of columns) {
        const panelRows = input.data.values.filter((record) =>
          (!columnField || String(record[columnField]) === columnValue)
          && (!rowField || String(record[rowField]) === rowValue),
        );
        const encodings = { ...input.chart_spec.encodings };
        delete encodings.column;
        delete encodings.row;
        const child = {
          ...input,
          data: { values: panelRows },
          chart_spec: { ...input.chart_spec, encodings, baseSize: { width: 300, height: 220 } },
        };
        const childReference = await renderChart(child, 'vegalite', { format: 'png', scale: 1 });
        const spec = assembleExcel(child);
        if (sharedCategoryAxis) spec.categoryAxis = { ...spec.categoryAxis, ...sharedCategoryAxis };
        spec.valueAxis = { ...spec.valueAxis, ...sharedValueAxis };
        spec.width = clamp(childReference.width, 280, 420);
        spec.height = clamp(childReference.height, 200, 300);
        const facetLabel = [rowValue, columnValue].filter(Boolean).join(' · ');
        spec.title = `${facetLabel} — ${spec.title}`;
        const path = join(tempDir, `${item.name}-panel-${panels.length}.png`);
        writeFileSync(path, await renderExcelArtifact(spec, { scale }));
        panels.push(path);
      }
    }

    const gridColumns = item.name === 'row-scatter' ? 1 : item.name === 'wrapped-line' ? 5 : columns.length;
    const gridRows = Math.ceil(panels.length / gridColumns);
    const compositionPath = join(outDir, `${item.name}.excel-composition.png`);
    runMagick(['montage', ...panels, '-tile', `${gridColumns}x${gridRows}`, '-geometry', '900x650+16+16', '-background', 'white', compositionPath]);
    results.push({
      name: item.name,
      label: item.label,
      referenceSize: { width: reference.width, height: reference.height },
      panelCount: panels.length,
      grid: `${gridColumns}x${gridRows}`,
      productionResult: 'rejected',
      rejection,
      sharedCategoryAxis,
      sharedValueAxis,
    });
    console.log(`  ✓ ${item.label}: production rejected; experimental ${gridColumns}×${gridRows} composition rendered`);
  }

  for (let page = 0; page < 2; page += 1) {
    const pageCases = results.slice(page * 2, page * 2 + 2);
    const rows = [];
    const header = join(tempDir, `facet-header-${page}.png`);
    runMagick(['-size', '2000x100', '-background', 'white', '-fill', 'black', '-font', 'Helvetica-Bold', '-pointsize', '26', '-gravity', 'center', `label:Facet audit · canonical Flint vs experimental native-chart composition · page ${page + 1}`, header]);
    rows.push(header);
    for (const result of pageCases) {
      const label = join(tempDir, `facet-${result.name}-label.png`);
      const reference = join(tempDir, `facet-${result.name}-reference.png`);
      const excel = join(tempDir, `facet-${result.name}-excel.png`);
      const row = join(tempDir, `facet-${result.name}-row.png`);
      runMagick(['-size', '300x700', '-background', 'white', '-fill', 'black', '-font', 'Helvetica', '-pointsize', '19', '-gravity', 'center', `label:${result.label}\n${result.panelCount} native charts · ${result.grid}\nProduction: explicit rejection`, label]);
      runMagick([join(outDir, `${result.name}.reference.png`), '-resize', '850x680', '-background', 'white', '-gravity', 'center', '-extent', '850x700', reference]);
      runMagick([join(outDir, `${result.name}.excel-composition.png`), '-resize', '850x680', '-background', 'white', '-gravity', 'center', '-extent', '850x700', excel]);
      runMagick([label, reference, excel, '+append', row]);
      rows.push(row);
    }
    runMagick([...rows, '-append', join(outDir, `facet-layout-${page + 1}.png`)]);
  }
  return results;
}

console.log('Dynamic layout audit');
const dynamic = await runDynamicAudit();
console.log('Facet audit');
const facets = await runFacetAudit();
writeFileSync(join(outDir, 'summary.json'), JSON.stringify({ dynamic, facets }, null, 2) + '\n');
rmSync(tempDir, { recursive: true, force: true });
console.log(`\nWrote ${dynamic.length} dynamic cases and ${facets.length} facet cases to ${outDir}`);