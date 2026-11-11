// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { registerNapiFonts } from './fonts.js';
import type { RenderResult } from './types.js';

const DEFAULT_W = 400;
const DEFAULT_H = 320;

export interface ChartjsRenderArgs {
  scale: number;
  background: string;
  width: number;
  height: number;
}

/**
 * Render a Chart.js config to a PNG using the `@napi-rs/canvas` 2D engine.
 *
 * Chart.js has no SVG output, so this path is PNG-only. The canvas is sized to
 * `width*scale × height*scale` and `devicePixelRatio` is set to `scale` so the
 * logical layout matches the design size while the raster stays crisp.
 */
export async function renderChartjs(
  config: any,
  args: ChartjsRenderArgs,
): Promise<Omit<RenderResult, 'warnings'>> {
  const napiCanvas: any = await import('@napi-rs/canvas');
  registerNapiFonts(napiCanvas);
  const { createCanvas } = napiCanvas;

  const chartjs: any = await import('chart.js/auto');
  const Chart = chartjs.default ?? chartjs.Chart ?? chartjs;

  const width = args.width || DEFAULT_W;
  const height = args.height || DEFAULT_H;
  const scale = args.scale > 0 ? args.scale : 1;

  const canvas: any = createCanvas(Math.round(width * scale), Math.round(height * scale));
  // Chart.js probes `canvas.style`; napi-canvas has none, so provide a stub.
  canvas.style = {};

  const ctx = canvas.getContext('2d');
  ctx.fillStyle = args.background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const merged = {
    ...config,
    options: {
      ...(config.options ?? {}),
      responsive: false,
      maintainAspectRatio: false,
      animation: false,
      devicePixelRatio: scale,
    },
  };

  const chart = new Chart(canvas, merged);
  let buffer: Buffer;
  try {
    chart.draw();
    buffer = Buffer.from(canvas.toBuffer('image/png'));
  } finally {
    chart.destroy();
  }

  return {
    backend: 'chartjs',
    format: 'png',
    mimeType: 'image/png',
    buffer,
    base64: buffer.toString('base64'),
    width,
    height,
  };
}
