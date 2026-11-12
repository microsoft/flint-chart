// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { svgToResult } from './svg.js';
import type { RenderResult, RenderFormat } from './types.js';

const DEFAULT_W = 400;
const DEFAULT_H = 320;

export interface EChartsRenderArgs {
  format: RenderFormat;
  scale: number;
  background: string;
  width: number;
  height: number;
}

/**
 * Render an ECharts option using server-side rendering to an SVG string, then
 * rasterize (for PNG) with resvg. Uses ECharts' built-in SSR mode — no DOM.
 */
export async function renderECharts(
  option: any,
  args: EChartsRenderArgs,
): Promise<Omit<RenderResult, 'warnings'>> {
  const echarts: any = await import('echarts');
  const width = args.width || DEFAULT_W;
  const height = args.height || DEFAULT_H;

  const opt = { ...option, animation: false };
  if (!opt.backgroundColor) opt.backgroundColor = args.background;

  const chart = echarts.init(null, null, {
    renderer: 'svg',
    ssr: true,
    width,
    height,
  });
  let svg: string;
  try {
    chart.setOption(opt);
    svg = chart.renderToSVGString();
  } finally {
    chart.dispose();
  }

  return svgToResult(svg, {
    backend: 'echarts',
    format: args.format,
    scale: args.scale,
    background: args.background,
    width,
    height,
  });
}
