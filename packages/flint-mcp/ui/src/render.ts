// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Client-side Flint rendering. Mirrors the server's Vega-Lite render path
 * (compile -> headless vega.View -> SVG) but runs entirely in the browser so
 * the chart re-renders instantly as the user edits options. No server round
 * trip, no data leaving the host.
 */
import { assembleVegaLite, injectCanvasFurnitureSVG, readCanvasFurniture, resolveThemeSpec } from 'flint-chart';
import type { ChartAssemblyInput } from 'flint-chart';
import { compile } from 'vega-lite';
import { parse, View, Error as VegaError } from 'vega';
import { expressionInterpreter } from 'vega-interpreter';

export interface FlintRenderResult {
  /** Rendered SVG markup. */
  svg: string;
  /** High-resolution PNG rendered by the same Vega view, ready for clipboard/export. */
  png: Blob;
  /** Encoded PNG dimensions in physical pixels. */
  pngSize: { width: number; height: number };
  /** The assembled Vega-Lite spec (Flint annotations left in place). */
  vlSpec: Record<string, unknown>;
  /** Assembler warnings, if any. */
  warnings: { severity: string; code: string; message: string }[];
}

const DEFAULT_BACKGROUND = '#ffffff';
const APP_PREVIEW_BASE_SIZE = { width: 360, height: 270 } as const;
const APP_PREVIEW_CANVAS_SIZE = { width: 720, height: 540 } as const;
const APP_PREVIEW_MIN_STEP_PLOT_SIZE = { width: 220, height: 160 } as const;
const APP_PREVIEW_MAX_AUTO_STEP = 96;
const COPY_PNG_TARGET_LONG_EDGE = 1920;
const COPY_PNG_MAX_SCALE = 4;

function copyPngScale(width: number, height: number): number {
  const longEdge = Math.max(width, height);
  if (!Number.isFinite(longEdge) || longEdge <= 0) return 2;
  return Math.min(COPY_PNG_MAX_SCALE, Math.max(1, COPY_PNG_TARGET_LONG_EDGE / longEdge));
}

function usesAutoPreviewSize(input: ChartAssemblyInput): boolean {
  return !input.chart_spec.baseSize && !input.chart_spec.canvasSize;
}

/**
 * The footprint the chosen house draws at, if it states one.
 *
 * A house's `baseSize` is not a stray number: it is the measure the rest of the
 * style was set against — the Economist's wide print column, Nature's narrow
 * single-column figure — and the type scale is read off it. Handing the
 * assembler the app's own preview size instead pre-empts it, and every house
 * comes out at the same size in the same type, which is the one thing a set of
 * houses must not do.
 */
function houseBaseSize(input: ChartAssemblyInput): { width: number; height: number } | undefined {
  try {
    return resolveThemeSpec(input.theme_spec)?.compileDefaults?.baseSize;
  } catch {
    // An unknown house is the assembler's error to report, not ours to swallow.
    return undefined;
  }
}

function withAppPreviewDefaults(input: ChartAssemblyInput): ChartAssemblyInput {
  if (!usesAutoPreviewSize(input)) return input;
  // The ceiling is the widget's business — it is how much room there is. The
  // footprint is the house's, and the app's preview size only stands in where
  // no house has spoken.
  const base = houseBaseSize(input) ?? APP_PREVIEW_BASE_SIZE;
  return {
    ...input,
    chart_spec: {
      ...input.chart_spec,
      baseSize: { ...base },
      canvasSize: { ...APP_PREVIEW_CANVAS_SIZE },
    },
  };
}

function encodingField(input: ChartAssemblyInput, channel: 'x' | 'y'): string | undefined {
  const encoding = input.chart_spec.encodings[channel];
  if (typeof encoding === 'string') return encoding;
  if (encoding && typeof encoding === 'object' && !Array.isArray(encoding)) {
    const field = (encoding as { field?: unknown }).field;
    return typeof field === 'string' ? field : undefined;
  }
  return undefined;
}

function uniqueValueCount(input: ChartAssemblyInput, field: string | undefined): number {
  if (!field) return 0;
  const rows = input.data.values ?? [];
  return new Set(rows.map((row) => row?.[field]).filter((value) => value != null)).size;
}

function applyStepMinimum(node: unknown, dimension: 'width' | 'height', itemCount: number): void {
  if (!node || typeof node !== 'object' || itemCount <= 0) return;
  const record = node as Record<string, unknown>;
  const size = record[dimension];
  if (size && typeof size === 'object') {
    const stepSize = (size as { step?: unknown }).step;
    if (typeof stepSize === 'number' && Number.isFinite(stepSize)) {
      const minPlotSize = APP_PREVIEW_MIN_STEP_PLOT_SIZE[dimension];
      const desiredStep = Math.min(APP_PREVIEW_MAX_AUTO_STEP, Math.ceil(minPlotSize / itemCount));
      if (stepSize < desiredStep) {
        record[dimension] = { ...(size as Record<string, unknown>), step: desiredStep };
      }
    }
  }
  applyStepMinimum(record.spec, dimension, itemCount);
}

function widenSmallStepPlotsForPreview(vlSpec: Record<string, unknown>, input: ChartAssemblyInput): void {
  const xCount = uniqueValueCount(input, encodingField(input, 'x'));
  const yCount = uniqueValueCount(input, encodingField(input, 'y'));
  applyStepMinimum(vlSpec, 'width', xCount);
  applyStepMinimum(vlSpec, 'height', yCount);
}

/**
 * Assemble a Flint {@link ChartAssemblyInput} to a Vega-Lite spec and render it
 * to an SVG string. Throws on assembly or compile failure so the caller can
 * surface the message.
 */
export async function renderFlintSvg(
  input: ChartAssemblyInput,
  background: string = DEFAULT_BACKGROUND,
): Promise<FlintRenderResult> {
  const usePreviewDefaults = usesAutoPreviewSize(input);
  const previewInput = withAppPreviewDefaults(input);
  const raw = assembleVegaLite(previewInput) as Record<string, unknown>;
  if (usePreviewDefaults) widenSmallStepPlotsForPreview(raw, previewInput);
  const warnings = (raw._warnings as FlintRenderResult['warnings']) ?? [];
  // Pass the assembled spec straight through: Vega-Lite ignores unknown
  // top-level keys, so Flint's private annotations (`_warnings`, `_width`,
  // `_height`, `_options`, `_pivot`, …) are harmless. We must NOT strip
  // `_`-prefixed keys recursively — template-generated content legitimately
  // relies on them (e.g. the Bar Table's `datasets.__bt_displayTable` and
  // `__bt_sort` rows, or the `_count` field from count aggregates), and
  // removing those deletes the chart's data (blank rows + NaN color domain).
  const vlSpec = raw;

  const compiled = compile(vlSpec as never).spec;
  // Parse with `ast: true` and render through Vega's CSP-safe expression
  // interpreter. The default Vega runtime compiles expressions with
  // `new Function`, which violates strict webview CSPs (no 'unsafe-eval', e.g.
  // VS Code's MCP App host). The interpreter evaluates the AST instead.
  const runtime = parse(compiled as never, { background } as never, { ast: true } as never);
  const view = new View(runtime, { renderer: 'none', expr: expressionInterpreter });
  view.logLevel(VegaError);
  await view.runAsync();
  const pngScale = copyPngScale(view.width(), view.height());
  const [rawSvg, canvas] = await Promise.all([view.toSVG(), view.toCanvas(pngScale)]);
  // Canvas-anchored furniture (the Economist masthead tab) is painted after
  // Vega is done, because it belongs to the graphic frame rather than the plot
  // and Vega-Lite has no way to say so. Both artifacts get it: the SVG by
  // markup, the PNG by drawing straight onto the same view's canvas at the
  // scale it was rasterised at.
  const furniture = readCanvasFurniture(vlSpec);
  const svg = injectCanvasFurnitureSVG(rawSvg, furniture);
  if (furniture.length) {
    const ctx = canvas.getContext('2d') as CanvasRenderingContext2D | null;
    if (ctx) {
      for (const item of furniture) {
        ctx.fillStyle = item.color;
        ctx.fillRect(item.x * pngScale, item.y * pngScale, item.width * pngScale, item.height * pngScale);
      }
    }
  }
  const png = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new Error('Could not encode chart PNG')),
      'image/png',
    );
  });
  view.finalize();

  return {
    svg,
    png,
    pngSize: { width: canvas.width, height: canvas.height },
    vlSpec,
    warnings,
  };
}
