// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { svgToResult } from './svg.js';
import type { RenderResult, RenderFormat } from './types.js';

const DEFAULT_W = 400;
const DEFAULT_H = 320;

export interface HighchartsRenderArgs {
  format: RenderFormat;
  scale: number;
  background: string;
  width: number;
  height: number;
}

/**
 * Render a Highcharts options object to an SVG string in a headless browser,
 * then rasterize (for PNG) with resvg. Highcharts has no SSR mode, so this
 * path drives a real Chrome via puppeteer-core and serializes the chart's
 * SVG DOM node.
 */
export async function renderHighcharts(
  option: any,
  args: HighchartsRenderArgs,
): Promise<Omit<RenderResult, 'warnings'>> {
  const puppeteer: any = await import('puppeteer-core');
  const width = args.width || DEFAULT_W;
  const height = args.height || DEFAULT_H;

  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
  });

  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: args.scale });

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; background: ${args.background}; }
  #chart { width: ${width}px; height: ${height}px; }
</style></head><body>
<div id="chart"></div>
<script src="https://code.highcharts.com/highcharts.js"></script>
<script>
  window.__renderChart = async (option) => {
    Highcharts.chart('chart', option);
    const el = document.querySelector('#chart svg');
    return el ? el.outerHTML : '';
  };
</script>
</body></html>`;

    await page.setContent(html, { waitUntil: 'networkidle0' });
    const svg: string = await page.evaluate(
      (opt: any) => (globalThis as any).__renderChart(opt),
      { ...option, animation: false },
    );

    return svgToResult(svg, {
      backend: 'highcharts',
      format: args.format,
      scale: args.scale,
      background: args.background,
      width,
      height,
    });
  } finally {
    await browser.close();
  }
}
