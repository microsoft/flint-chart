// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Side-by-side Vega-Lite / Plotly theme comparison.
 *
 * The two backend audits (`theme-real.ts`, `theme-plotly.ts`) each render a
 * grid of houses for one backend. That answers "is this house consistent?" but
 * not "does Plotly read as badly as Vega-Lite here?" — and the second question
 * is the one that finds Plotly-only defects, because Vega-Lite has already been
 * swept and is the reference.
 *
 * So this harness pairs them: one row per house, Vega-Lite on the left and
 * Plotly on the right, both drawn in the same headless Chrome (Vega-Lite as an
 * inline SVG compiled in Node, Plotly live) so the pixels are comparable.
 *
 * Run:  npx esbuild scripts/theme-vs.ts --bundle --platform=node --format=esm \
 *         --outfile=scripts/.vs.mjs --external:puppeteer-core --log-level=error \
 *         --alias:flint-chart/test-data=./packages/flint-js/src/test-data/index.ts \
 *         --alias:flint-chart=./packages/flint-js/src/index.ts && \
 *       node scripts/.vs.mjs <idFilter> [house ...]
 *
 * Output: `audit-out/vs/<id>.png`.
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import puppeteer from 'puppeteer-core';
import { compile } from 'vega-lite';
import * as vega from 'vega';

import { assembleVegaLite, assemblePlotly, vlGetTemplateDef, plGetTemplateDef } from '../packages/flint-js/src/index';
import { THEME_PRESETS } from '../packages/flint-js/src/core/theme/presets';
import { PREVIEW_CASES, type PreviewCase } from '../site/src/shared/preview-cases';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../audit-out/vs');
const PLOTLY_JS = resolve(__dirname, '../node_modules/plotly.js-dist-min/plotly.min.js');

const CHROME_CANDIDATES = [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome',
];

function chromePath(): string {
    const found = CHROME_CANDIDATES.find((p) => existsSync(p));
    if (!found) throw new Error('No Chrome found');
    return found;
}

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function stripInternal(node: any): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(stripInternal);
    for (const key of Object.keys(node)) {
        if (/^_[^_]/.test(key)) delete node[key];
        else stripInternal(node[key]);
    }
}

function inputFor(c: PreviewCase): any {
    return {
        data: { values: c.data },
        semantic_types: c.semantic_types,
        chart_spec: {
            chartType: c.chartType,
            title: c.title,
            encodings: c.encodings,
            baseSize: { width: 300, height: 300 },
            ...(c.chartProperties ? { chartProperties: c.chartProperties } : {}),
        },
    };
}

async function vlPanel(c: PreviewCase, house: string | null) {
    if (!vlGetTemplateDef(c.chartType)) return { html: '<div class="none">no VL template</div>', bg: '#eee' };
    try {
        const base = inputFor(c);
        const spec: any = assembleVegaLite(house ? { ...base, theme_spec: THEME_PRESETS[house].spec } : base);
        const bg = typeof spec.background === 'string' ? spec.background : '#ffffff';
        stripInternal(spec);
        delete spec.$schema;
        const view = new vega.View(vega.parse(compile(spec).spec), { renderer: 'none' });
        const svg = await view.toSVG();
        view.finalize();
        return { html: svg, bg };
    } catch (err) {
        return { html: `<div class="none">VL failed: ${esc((err as Error).message)}</div>`, bg: '#ffdddd' };
    }
}

function plFigure(c: PreviewCase, house: string | null) {
    if (!plGetTemplateDef(c.chartType)) return { figure: null, bg: '#eee', err: 'no Plotly template' };
    try {
        const base = inputFor(c);
        const figure: any = assemblePlotly(house ? { ...base, theme_spec: THEME_PRESETS[house].spec } : base);
        return {
            figure: { data: figure.data ?? [], layout: figure.layout ?? {} },
            bg: typeof figure.layout?.paper_bgcolor === 'string' ? figure.layout.paper_bgcolor : '#ffffff',
            err: '',
        };
    } catch (err) {
        return { figure: null, bg: '#ffdddd', err: (err as Error).message };
    }
}

async function main(): Promise<void> {
    const args = process.argv.slice(2);
    const idFilter = args[0] ?? '';
    const houses = args.length > 1 ? args.slice(1) : ['flint', ...Object.keys(THEME_PRESETS)];

    const cases = PREVIEW_CASES.filter(
        (c) => !idFilter || c.id.toLowerCase().includes(idFilter.toLowerCase())
            || c.chartType.toLowerCase().includes(idFilter.toLowerCase()),
    );
    if (!cases.length) throw new Error(`no case matches "${idFilter}"`);

    mkdirSync(OUT, { recursive: true });
    const plotlySrc = readFileSync(PLOTLY_JS, 'utf8');
    const browser = await puppeteer.launch({
        executablePath: chromePath(),
        headless: true,
        args: ['--no-sandbox', '--disable-gpu', '--font-render-hinting=none'],
    });

    for (const c of cases) {
        const rows: string[] = [];
        const figures: Array<{ id: string; figure: any }> = [];
        for (const house of houses) {
            const id = house === 'flint' ? null : house;
            const vl = await vlPanel(c, id);
            const pl = plFigure(c, id);
            const key = `pl_${house.replace(/-/g, '_')}`;
            if (pl.figure) figures.push({ id: key, figure: pl.figure });
            rows.push(`
      <div class="row">
        <div class="house">${esc(house)}</div>
        <div class="pair">
          <div class="pane"><div class="tag">vega-lite</div><div class="art" style="background:${vl.bg}">${vl.html}</div></div>
          <div class="pane"><div class="tag">plotly</div><div class="art" style="background:${pl.bg}">${
              pl.figure ? `<div id="${key}"></div>` : `<div class="none">${esc(pl.err)}</div>`
          }</div></div>
        </div>
      </div>`);
        }

        const page = await browser.newPage();
        await page.setViewport({ width: 1100, height: 800, deviceScaleFactor: 2 });
        await page.setContent(`<!doctype html><html><head><meta charset="utf-8">
      <style>
        body { margin:0; background:#dcdcdc; font:12px Helvetica, Arial, sans-serif; }
        h1 { font-size:13px; margin:8px; }
        .row { margin:0 8px 10px; }
        .house { font-size:11px; font-weight:700; color:#333; margin-bottom:2px; }
        .pair { display:flex; gap:8px; align-items:flex-start; }
        .pane { background:#fff; border:1px solid #bbb; }
        .tag { font-size:9px; color:#666; padding:1px 4px; background:#f4f4f4; border-bottom:1px solid #ddd; }
        .art { display:inline-block; }
        .none { padding:20px; font-size:11px; color:#900; }
      </style></head><body>
      <h1>${esc(c.id)} · ${esc(c.chartType)} · ${esc(c.title ?? '')}</h1>
      ${rows.join('')}
      <script>${plotlySrc}</script>
      </body></html>`);

        await page.evaluate(async (figs: any[]) => {
            for (const f of figs) {
                const el = document.getElementById(f.id);
                if (el) await (window as any).Plotly.newPlot(el, f.figure.data, f.figure.layout, { staticPlot: true, displayModeBar: false });
            }
        }, figures as any);
        await new Promise((r) => setTimeout(r, 400));

        const h = await page.evaluate(() => document.body.scrollHeight);
        await page.setViewport({ width: 1100, height: Math.min(h + 20, 30000), deviceScaleFactor: 2 });
        await new Promise((r) => setTimeout(r, 200));
        await page.screenshot({ path: resolve(OUT, `${c.id}.png`) as `${string}.png`, fullPage: true });
        await page.close();
        console.log(`wrote ${c.id}.png`);
    }

    await browser.close();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
