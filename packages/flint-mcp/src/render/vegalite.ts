// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { injectCanvasFurnitureSVG, readCanvasFurniture } from 'flint-chart';
import { CHART_FONT_FAMILY, installVegaTextMetrics } from './fonts.js';
import { svgToResult } from './svg.js';
import type { RenderResult, RenderFormat } from './types.js';

const DEFAULT_W = 400;
const DEFAULT_H = 320;

function readSvgDimension(svg: string, attr: 'width' | 'height'): number | undefined {
  const match = svg.match(new RegExp(`<svg[^>]*\\s${attr}="([^\"]+)"`, 'i'));
  if (!match) return undefined;
  const value = Number.parseFloat(match[1]);
  return Number.isFinite(value) && value > 0 ? Math.round(value) : undefined;
}

export interface VegaLiteRenderArgs {
  format: RenderFormat;
  scale: number;
  background: string;
  width?: number;
  height?: number;
}

/**
 * Render a Vega-Lite spec entirely in-process: compile to Vega, build a
 * headless `vega.View`, emit SVG, then rasterize (for PNG) with resvg. No
 * browser or external binary is required.
 */
export async function renderVegaLite(
  spec: any,
  args: VegaLiteRenderArgs,
): Promise<Omit<RenderResult, 'warnings'>> {
  const vega = await import('vega');
  const vegaLite = await import('vega-lite');

  // Measure label widths the same way the browser does, via @napi-rs/canvas
  // (see fonts.ts). Must run before the View lays out / measures text below.
  await installVegaTextMetrics(vega);

  // Apply an Arial/sans-serif chart font so the export matches the live app
  // preview and standard web rendering (not the bundled DejaVu Sans).
  const config = {
    ...(spec.config ?? {}),
    font: spec.config?.font ?? CHART_FONT_FAMILY,
  };
  const vlSpec = { ...spec, config };

  const compiled = vegaLite.compile(vlSpec as any).spec;
  const runtime = vega.parse(compiled as any, { background: args.background } as any);
  const view = new vega.View(runtime, { renderer: 'none' });
  view.logLevel(vega.Error);
  await view.runAsync();
  // A house may anchor branding to the graphic frame rather than the plot —
  // the Economist's red masthead tab. Vega-Lite cannot express that, so the
  // theme records the coordinates and the renderer paints it on afterwards.
  // Done before rasterising, so the PNG carries it too.
  const svg = injectCanvasFurnitureSVG(await view.toSVG(), readCanvasFurniture(spec));
  view.finalize();

  // Vega's View width/height report the content box, excluding axes/legends.
  // The root SVG dimensions are the actual artifact dimensions used by resvg.
  const width = readSvgDimension(svg, 'width') ?? args.width ?? DEFAULT_W;
  const height = readSvgDimension(svg, 'height') ?? args.height ?? DEFAULT_H;

  return svgToResult(svg, {
    backend: 'vegalite',
    format: args.format,
    scale: args.scale,
    background: args.background,
    width,
    height,
  });
}
