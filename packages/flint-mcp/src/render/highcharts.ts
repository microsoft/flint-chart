// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import fs from 'node:fs';
import { createRequire } from 'node:module';
import { svgToResult } from './svg.js';
import type { RenderResult, RenderFormat } from './types.js';

const require = createRequire(import.meta.url);

const DEFAULT_W = 400;
const DEFAULT_H = 320;

export interface HighchartsRenderArgs {
  format: RenderFormat;
  scale: number;
  background: string;
  width: number;
  height: number;
}

function getScriptContentOrUrl(modulePath: string, cdnUrl: string): { content?: string; url?: string } {
  try {
    const resolved = require.resolve(modulePath);
    if (fs.existsSync(resolved)) {
      return { content: fs.readFileSync(resolved, 'utf-8') };
    }
  } catch {
    // Fall back to CDN
  }
  return { url: cdnUrl };
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
  const width = args.width || option?._width || DEFAULT_W;
  const height = args.height || option?._height || DEFAULT_H;

  let browser: any;
  try {
    const launchOptions: any = {
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu'],
    };
    if (process.env.PUPPETEER_EXECUTABLE_PATH) {
      launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
    } else {
      launchOptions.channel = 'chrome';
    }
    browser = await puppeteer.launch(launchOptions);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new Error(
      `Failed to launch Chrome for Highcharts rendering: ${msg}. ` +
      `Ensure Google Chrome is installed, or set the PUPPETEER_EXECUTABLE_PATH environment variable to a valid Chrome or Chromium executable.`,
    );
  }

  try {
    const page = await browser.newPage();
    await page.setViewport({ width, height, deviceScaleFactor: args.scale });

    const html = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><style>
  html, body { margin: 0; padding: 0; overflow: hidden; }
</style></head><body></body></html>`;

    await page.setContent(html, { waitUntil: 'domcontentloaded' });

    // Set background via DOM assignment to prevent CSS injection / XSS
    await page.evaluate((bg: string) => {
      const doc = (globalThis as any).document;
      if (doc) {
        doc.documentElement.style.backgroundColor = bg;
        doc.body.style.backgroundColor = bg;
      }
    }, args.background);

    // Load Highcharts core and required modules
    const modules = [
      { path: 'highcharts/highcharts.js', cdn: 'https://code.highcharts.com/highcharts.js' },
      { path: 'highcharts/highcharts-more.js', cdn: 'https://code.highcharts.com/highcharts-more.js' },
      { path: 'highcharts/modules/heatmap.js', cdn: 'https://code.highcharts.com/modules/heatmap.js' },
      { path: 'highcharts/modules/sunburst.js', cdn: 'https://code.highcharts.com/modules/sunburst.js' },
    ];

    for (const mod of modules) {
      const script = getScriptContentOrUrl(mod.path, mod.cdn);
      if (script.content) {
        await page.addScriptTag({ content: script.content });
      } else if (script.url) {
        await page.addScriptTag({ url: script.url });
      }
    }

    const svg: string = await page.evaluate(
      (payload: { option: any; width: number; height: number; background: string }) => {
        const { option, width, height, background } = payload;
        const win = globalThis as any;
        const Highcharts = win.Highcharts;
        const doc = win.document;
        if (!Highcharts) throw new Error('Highcharts failed to load in browser context');

        function escapeXml(str: string): string {
          return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&apos;');
        }

        function disableAnim(opt: any) {
          if (!opt || typeof opt !== 'object') return opt;
          return {
            ...opt,
            chart: { ...(opt.chart ?? {}), animation: false },
            plotOptions: {
              ...(opt.plotOptions ?? {}),
              series: { ...(opt.plotOptions?.series ?? {}), animation: false },
            },
          };
        }

        // Faceted rendering
        if (option._facet && Array.isArray(option._facetPanels)) {
          const panelRows = option._facetPanels;
          const ref = panelRows[0]?.[0]?.option;
          const panelW = ref?._width || 400;
          const panelH = ref?._height || 300;
          const gap = 16;
          const hasColHeader = panelRows.some((row: any[]) => row.some((p: any) => p.colVal));
          const hasRowHeader = panelRows.some((row: any[]) => row.some((p: any) => p.rowVal));
          const colHeaderH = hasColHeader ? 22 : 0;
          const rowHeaderW = hasRowHeader ? 28 : 0;
          const colHeaderPerRow = Boolean(option._facetColHeaderPerRow);

          const titleText = option.title?.text;
          const subtitleText = option.subtitle?.text;
          const titleOffset = titleText ? (subtitleText ? 44 : 28) : 0;

          let compositeInner = '';

          if (titleText) {
            compositeInner += `<text x="${width / 2}" y="20" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="16" font-weight="bold" fill="#333333">${escapeXml(String(titleText))}</text>`;
            if (subtitleText) {
              compositeInner += `<text x="${width / 2}" y="38" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="12" fill="#666666">${escapeXml(String(subtitleText))}</text>`;
            }
          }

          for (let ri = 0; ri < panelRows.length; ri++) {
            const rowPanels = panelRows[ri];
            const yHeader = titleOffset + (colHeaderPerRow
              ? ri * (colHeaderH + panelH + gap)
              : (ri === 0 && hasColHeader ? 0 : colHeaderH));
            const yChart = titleOffset + (colHeaderPerRow
              ? ri * (colHeaderH + panelH + gap) + colHeaderH
              : colHeaderH + ri * (panelH + gap));

            for (let ci = 0; ci < rowPanels.length; ci++) {
              const panel = rowPanels[ci];
              const xChart = rowHeaderW + ci * (panelW + gap);

              if (panel.colVal && (colHeaderPerRow || ri === 0)) {
                const colX = xChart + panelW / 2;
                const colY = yHeader + 15;
                compositeInner += `<text x="${colX}" y="${colY}" text-anchor="middle" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="12" font-weight="600" fill="#555555">${escapeXml(String(panel.colVal))}</text>`;
              }

              if (panel.rowVal && ci === 0 && hasRowHeader) {
                const rowX = 10;
                const rowY = yChart + panelH / 2;
                compositeInner += `<text x="${rowX}" y="${rowY}" text-anchor="start" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="12" font-weight="600" fill="#555555">${escapeXml(String(panel.rowVal))}</text>`;
              }

              const container = doc.createElement('div');
              container.style.width = `${panelW}px`;
              container.style.height = `${panelH}px`;
              doc.body.appendChild(container);

              const panelOpt = disableAnim({
                ...panel.option,
                chart: {
                  ...(panel.option?.chart ?? {}),
                  width: panelW,
                  height: panelH,
                  backgroundColor: background || (panel.option?.chart?.backgroundColor ?? 'transparent'),
                  animation: false,
                },
              });

              const chart = Highcharts.chart(container, panelOpt);
              const svgEl = container.querySelector('svg');
              if (svgEl) {
                svgEl.setAttribute('x', String(xChart));
                svgEl.setAttribute('y', String(yChart));
                compositeInner += svgEl.outerHTML;
              }
              chart.destroy();
              container.remove();
            }
          }

          const bgRect = background ? `<rect width="100%" height="100%" fill="${escapeXml(background)}" />` : '';
          return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${bgRect}${compositeInner}</svg>`;
        }

        // Single chart
        const container = doc.createElement('div');
        container.style.width = `${width}px`;
        container.style.height = `${height}px`;
        doc.body.appendChild(container);

        const chartOpt = disableAnim({
          ...option,
          chart: {
            ...(option?.chart ?? {}),
            width,
            height,
            backgroundColor: background || (option?.chart?.backgroundColor ?? 'transparent'),
            animation: false,
          },
        });

        const chart = Highcharts.chart(container, chartOpt);
        const svgEl = container.querySelector('svg');
        const resSvg = svgEl ? svgEl.outerHTML : '';
        chart.destroy();
        container.remove();
        return resSvg;
      },
      { option, width, height, background: args.background },
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
