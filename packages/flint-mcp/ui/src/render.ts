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
/**
 * The room the preview has when nobody has measured it.
 *
 * This is a *ceiling*, not a footprint: it is how far the layout may stretch,
 * and it must match the box the SVG is finally shown in. When it does not, the
 * `.chart` rule (`max-width/height: 100%`) quietly scales the finished graphic
 * down to fit, and the type goes with it — an 11px axis label rendered into a
 * 540px-tall frame and displayed in a 348px one lands at 7.9px, smaller than
 * the app's own 11px chrome.
 *
 * Width is the host's to dictate, so the app measures it and passes it in.
 * Height is not: the frame grows to whatever the chart needs, because a title,
 * a deck, a legend and an axis can easily take 145px before the plot gets any,
 * and squeezing the plot to fit a short frame shrinks the type faster than the
 * frame saves it. This height is a backstop, and matches `--chart-max-height`
 * in `styles.css`.
 */
export const APP_PREVIEW_CANVAS_SIZE = { width: 588, height: 468 } as const;
/** Below this a viewport reading is noise (a collapsed or unmounted box). */
const MIN_VIEWPORT_WIDTH = 240;
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

/**
 * The ceiling to render into: the measured frame width when the app has one,
 * the default otherwise. Readings are floored to whole pixels and rejected
 * when implausibly small, so a transient zero-size layout pass cannot collapse
 * the chart.
 */
function previewCanvasSize(viewport?: { width: number; height?: number }): { width: number; height: number } {
  const height = Number.isFinite(viewport?.height) && (viewport!.height as number) > 0
    ? Math.floor(viewport!.height as number)
    : APP_PREVIEW_CANVAS_SIZE.height;
  const width = Math.floor(viewport?.width ?? NaN);
  if (!Number.isFinite(width) || width < MIN_VIEWPORT_WIDTH) {
    return { width: APP_PREVIEW_CANVAS_SIZE.width, height };
  }
  return { width, height };
}

function withAppPreviewDefaults(
  input: ChartAssemblyInput,
  viewport?: { width: number; height?: number },
): ChartAssemblyInput {
  if (!usesAutoPreviewSize(input)) return input;
  // The ceiling is the widget's business — it is how much room there is. The
  // footprint is the house's, and the app's preview size only stands in where
  // no house has spoken.
  const base = houseBaseSize(input) ?? APP_PREVIEW_BASE_SIZE;
  const ceiling = previewCanvasSize(viewport);
  return {
    ...input,
    chart_spec: {
      ...input.chart_spec,
      // A footprint larger than the room available is not a footprint; clamp
      // it so the house still leads but cannot overflow the frame.
      baseSize: {
        width: Math.min(base.width, ceiling.width),
        height: Math.min(base.height, ceiling.height),
      },
      canvasSize: ceiling,
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

/**
 * A step-sized plot (one band per category) asks for only as much room as its
 * bands need, so five categories can leave half a wide frame empty. When the
 * preview knows how much room it has, it spends it: the bands grow until the
 * plot fills the frame, less an allowance for the axis, legend and title block
 * around it. `APP_PREVIEW_MAX_AUTO_STEP` still caps how fat a single band may
 * get, so a two-category chart does not become two enormous slabs.
 *
 * This runs after assembly, so it only moves the step — the labels keep the
 * size and angle chosen for the original one. That is why the cap matters:
 * widen far enough and the axis would keep labels rotated as though it were
 * still cramped. Letting the assembler size bands to the frame up front is the
 * real fix, and belongs in the layout rather than here.
 */
const APP_PREVIEW_CHROME_ALLOWANCE = { width: 110, height: 170 } as const;

function stepTarget(dimension: 'width' | 'height', ceiling: { width: number; height: number }): number {
  return Math.max(
    APP_PREVIEW_MIN_STEP_PLOT_SIZE[dimension],
    ceiling[dimension] - APP_PREVIEW_CHROME_ALLOWANCE[dimension],
  );
}

function applyStepMinimum(
  node: unknown,
  dimension: 'width' | 'height',
  itemCount: number,
  minPlotSize: number,
): void {
  if (!node || typeof node !== 'object' || itemCount <= 0) return;
  const record = node as Record<string, unknown>;
  const size = record[dimension];
  if (size && typeof size === 'object') {
    const stepSize = (size as { step?: unknown }).step;
    if (typeof stepSize === 'number' && Number.isFinite(stepSize)) {
      const desiredStep = Math.min(APP_PREVIEW_MAX_AUTO_STEP, Math.ceil(minPlotSize / itemCount));
      if (stepSize < desiredStep) {
        record[dimension] = { ...(size as Record<string, unknown>), step: desiredStep };
      }
    }
  }
  applyStepMinimum(record.spec, dimension, itemCount, minPlotSize);
}

function widenSmallStepPlotsForPreview(
  vlSpec: Record<string, unknown>,
  input: ChartAssemblyInput,
  ceiling: { width: number; height: number },
): void {
  const xCount = uniqueValueCount(input, encodingField(input, 'x'));
  const yCount = uniqueValueCount(input, encodingField(input, 'y'));
  applyStepMinimum(vlSpec, 'width', xCount, stepTarget('width', ceiling));
  applyStepMinimum(vlSpec, 'height', yCount, stepTarget('height', ceiling));
}

/**
 * Assemble the preview's Vega-Lite spec: give the chart the room the frame
 * actually has, then let step-sized plots spend it.
 *
 * Split out from {@link renderFlintSvg} so the sizing can be exercised without
 * a browser canvas, which the PNG half of the render needs and Node has not.
 */
export function assemblePreviewSpec(
  input: ChartAssemblyInput,
  viewport?: { width: number; height?: number },
): Record<string, unknown> {
  const usePreviewDefaults = usesAutoPreviewSize(input);
  const previewInput = withAppPreviewDefaults(input, viewport);
  const spec = assembleVegaLite(previewInput) as Record<string, unknown>;
  if (usePreviewDefaults) widenSmallStepPlotsForPreview(spec, previewInput, previewCanvasSize(viewport));
  return spec;
}

/**
 * Assemble a Flint {@link ChartAssemblyInput} to a Vega-Lite spec and render it
 * to an SVG string. Throws on assembly or compile failure so the caller can
 * surface the message.
 *
 * `viewport` is the width the SVG will be displayed in (and, optionally, a
 * height ceiling). Passing it lets the layout use exactly the room it has, so
 * the result is shown at 1:1 and the type keeps the size its house chose.
 */
export async function renderFlintSvg(
  input: ChartAssemblyInput,
  background: string = DEFAULT_BACKGROUND,
  viewport?: { width: number; height?: number },
): Promise<FlintRenderResult> {
  const raw = assemblePreviewSpec(input, viewport);
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
