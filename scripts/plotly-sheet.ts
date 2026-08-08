// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Offline Plotly renderer for the theme audits.
 *
 * Vega-Lite compiles and renders in Node; Plotly does not — it is a browser
 * library that measures text with the DOM. So the contact sheets are drawn by
 * the real thing: a headless Chrome with `plotly.js-dist-min` loaded from
 * `node_modules`, one page holding a grid of plots, screenshotted at 2×.
 *
 * Nothing here knows about themes. It takes figures and gives back PNGs, so
 * the same helper serves the lab, the R2 corpus and the real-data sweep.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import puppeteer, { type Browser } from 'puppeteer-core';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PLOTLY_JS = resolve(__dirname, '../node_modules/plotly.js-dist-min/plotly.min.js');

const CHROME_CANDIDATES = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
];

export interface PlotlyPanel {
    label: string;
    /** `{ data, layout }`, or null when assembly failed. */
    figure: any | null;
    /** Shown instead of a plot when the figure is missing. */
    error?: string;
}

export interface PlotlySheet {
    /** Output file stem — written as `<outDir>/<name>.png`. */
    name: string;
    heading: string;
    panels: PlotlyPanel[];
    cols?: number;
}

function chromePath(): string {
    const found = CHROME_CANDIDATES.find((p) => existsSync(p));
    if (!found) {
        throw new Error(
            'No Chrome/Edge/Chromium found. Set one of:\n  ' + CHROME_CANDIDATES.join('\n  '),
        );
    }
    return found;
}

/** The size a figure asks for, with Plotly's own defaults as the floor. */
function sizeOf(figure: any): { width: number; height: number } {
    const w = Number(figure?.layout?.width) || Number(figure?._width) || 420;
    const h = Number(figure?.layout?.height) || Number(figure?._height) || 320;
    return { width: Math.max(180, w), height: Math.max(150, h) };
}

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Drop the `_internal` keys the assemblers hang off the figure. */
function cleanFigure(figure: any): any {
    return {
        data: figure?.data ?? [],
        layout: figure?.layout ?? {},
        config: { staticPlot: true, displayModeBar: false },
    };
}

export class PlotlyRenderer {
    private browser: Browser | null = null;
    private plotlySrc = '';

    async open(): Promise<void> {
        this.plotlySrc = readFileSync(PLOTLY_JS, 'utf8');
        this.browser = await puppeteer.launch({
            executablePath: chromePath(),
            headless: true,
            args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'],
        });
    }

    async close(): Promise<void> {
        await this.browser?.close();
        this.browser = null;
    }

    /** Render one contact sheet to `<outDir>/<name>.png`. Returns any per-panel render errors. */
    async sheet(s: PlotlySheet, outDir: string): Promise<string[]> {
        if (!this.browser) throw new Error('renderer not open');
        mkdirSync(outDir, { recursive: true });

        const cols = s.cols ?? 4;
        const cellW = Math.ceil(Math.max(...s.panels.map((p) => sizeOf(p.figure).width))) + 2;
        const cellH = Math.ceil(Math.max(...s.panels.map((p) => sizeOf(p.figure).height))) + 2;

        const page = await this.browser.newPage();
        await page.setViewport({
            width: cols * (cellW + 10) + 20,
            height: Math.max(400, Math.ceil(s.panels.length / cols) * (cellH + 26) + 60),
            deviceScaleFactor: 2,
        });

        const cells = s.panels
            .map(
                (p, i) => `
        <div class="cell" style="width:${cellW}px">
          <div class="lab">${esc(p.label)}</div>
          <div class="plot" id="p${i}" style="width:${cellW}px;height:${cellH}px;background:${
              p.figure?.layout?.paper_bgcolor ?? '#fff'
          }">${
              p.figure ? '' : `<div class="err">${esc(p.error ?? 'no figure')}</div>`
          }</div>
        </div>`,
            )
            .join('');

        await page.setContent(
            `<!doctype html><html><head><meta charset="utf-8">
      <style>
        body { margin:0; background:#e8e8e8; font-family: Helvetica, Arial, sans-serif; }
        #sheet { display:inline-block; padding:8px; }
        h1 { font-size:12px; font-weight:600; color:#111; margin:0 0 6px; }
        #grid { display:grid; grid-template-columns: repeat(${cols}, max-content); gap:10px; }
        .lab { font-size:10px; color:#444; height:14px; }
        .plot { background:#fff; }
        .err { color:#a00; font-size:11px; padding:6px; background:#ffdddd; height:100%; box-sizing:border-box; }
      </style></head>
      <body><div id="sheet"><h1>${esc(s.heading)}</h1><div id="grid">${cells}</div></div></body></html>`,
            { waitUntil: 'domcontentloaded' },
        );
        await page.addScriptTag({ content: this.plotlySrc });

        const errors: string[] = await page.evaluate(async (figs: Array<any | null>) => {
            const out: string[] = [];
            for (let i = 0; i < figs.length; i++) {
                const f = figs[i];
                if (!f) continue;
                try {
                    await (window as any).Plotly.newPlot(`p${i}`, f.data, f.layout, f.config);
                } catch (err) {
                    out.push(`panel ${i}: ${(err as Error).message}`);
                    const el = document.getElementById(`p${i}`);
                    if (el) el.innerHTML = `<div class="err">RENDER FAILED — ${(err as Error).message}</div>`;
                }
            }
            return out;
        }, s.panels.map((p) => (p.figure ? cleanFigure(p.figure) : null)) as any);

        const el = await page.$('#sheet');
        const png = (await el!.screenshot({ type: 'png' })) as Buffer;
        writeFileSync(resolve(outDir, `${s.name}.png`), png);
        await page.close();
        return errors;
    }
}
