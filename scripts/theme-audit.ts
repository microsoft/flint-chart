// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Theme audit: renders each theme-lab case as a three-panel contact sheet
 *
 *     1 Flint default   |   2 hand-authored   |   3 ThemeSpec compiled
 *
 * to `audit-out/theme/<id>.<theme>.png`.
 *
 * Two specs can differ everywhere in JSON and render identically, and vice
 * versa, so the gap between columns 2 and 3 is only assessable as an image.
 *
 * Run:  npx esbuild scripts/theme-audit.ts --bundle --platform=node \
 *         --format=esm --outfile=scripts/.audit.mjs --external:@resvg/resvg-js \
 *         --log-level=error && node scripts/.audit.mjs [themeId|caseId ...]
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { compile } from 'vega-lite';
import * as vega from 'vega';
import { Resvg } from '@resvg/resvg-js';

import { THEME_PRESETS } from '../packages/flint-js/src/core/theme/presets';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(__dirname, '../site/src/playground/theme-lab-assets');
const COMPILED = resolve(ASSETS, 'compiled');
const OUT = resolve(__dirname, '../audit-out/theme');

const THEMES = THEME_PRESETS;

const PANEL_WIDTH = 400;
const GAP = 12;
const LABEL_H = 18;

function clean(spec: any): any {
    const out: any = {};
    for (const [k, v] of Object.entries(spec)) if (!k.startsWith('__')) out[k] = v;
    return out;
}

async function toSvg(spec: any): Promise<{ svg: string; width: number; height: number }> {
    const vgSpec = compile(clean(spec)).spec;
    const view = new vega.View(vega.parse(vgSpec), { renderer: 'none' });
    const svg = await view.toSVG();
    view.finalize();
    const m = /<svg[^>]*\bwidth="([\d.]+)"[^>]*\bheight="([\d.]+)"/.exec(svg);
    return { svg, width: m ? Number(m[1]) : PANEL_WIDTH, height: m ? Number(m[2]) : 300 };
}

function esc(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

interface Panel { svg: string; width: number; height: number; label: string; background: string }

function contactSheet(panels: Panel[]): { svg: string; width: number } {
    // Panels can be fractional pixels wide, so round up: the sheet width is also
    // the render target, and a fractional target rounds a thin sheet down to zero.
    const colW = Math.ceil(Math.max(PANEL_WIDTH, ...panels.map((p) => p.width)));
    const bodyH = Math.ceil(Math.max(...panels.map((p) => p.height)));
    const totalW = panels.length * colW + (panels.length - 1) * GAP;
    const totalH = bodyH + LABEL_H;

    let body = `<rect width="${totalW}" height="${totalH}" fill="#e8e8e8"/>`;
    panels.forEach((p, i) => {
        const x = i * (colW + GAP);
        body += `<text x="${x + 2}" y="12" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#444">${esc(p.label)}</text>`;
        body += `<rect x="${x}" y="${LABEL_H}" width="${colW}" height="${bodyH}" fill="${p.background}"/>`;
        body += `<g transform="translate(${x},${LABEL_H})">${p.svg}</g>`;
    });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">${body}</svg>`;
    return { svg, width: totalW };
}

function backgroundOf(spec: any): string {
    return typeof spec.background === 'string' ? spec.background : '#ffffff';
}

async function main(): Promise<void> {
    const filters = process.argv.slice(2);
    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(OUT, { recursive: true });

    const pairs: Array<{ id: string; theme: string }> = [];
    for (const file of readdirSync(ASSETS)) {
        const m = /^(.*)\.([a-z0-9]+)\.json$/.exec(file);
        if (!m || !THEMES[m[2]]) continue;
        pairs.push({ id: m[1], theme: m[2] });
    }
    pairs.sort((a, b) => a.theme.localeCompare(b.theme) || a.id.localeCompare(b.id));

    const failures: string[] = [];
    let written = 0;
    for (const { id, theme } of pairs) {
        if (filters.length && !filters.some((f) => f === theme || f === id || `${id}.${theme}` === f)) continue;
        let flint: any, manual: any, compiled: any;
        try {
            flint = JSON.parse(readFileSync(resolve(ASSETS, `${id}.flint.json`), 'utf8'));
            manual = JSON.parse(readFileSync(resolve(ASSETS, `${id}.${theme}.json`), 'utf8'));
            compiled = JSON.parse(readFileSync(resolve(COMPILED, `${id}.${theme}.json`), 'utf8'));
        } catch (err) {
            failures.push(`${id}.${theme}: missing spec — ${(err as Error).message}`);
            continue;
        }

        const panels: Panel[] = [];
        for (const [spec, label] of [
            [flint, '1 flint'],
            [manual, '2 manual'],
            [compiled, '3 compiled'],
        ] as Array<[any, string]>) {
            try {
                const r = await toSvg(spec);
                panels.push({ ...r, label: `${label}  ${id}.${theme}`, background: backgroundOf(spec) });
            } catch (err) {
                failures.push(`${id}.${theme} [${label}]: ${(err as Error).message}`);
                panels.push({ svg: '', width: PANEL_WIDTH, height: 300, label: `${label} FAILED`, background: '#ffdddd' });
            }
        }

        const sheet = contactSheet(panels);
        const png = new Resvg(sheet.svg, { fitTo: { mode: 'width', value: sheet.width * 2 } })
            .render()
            .asPng();
        writeFileSync(resolve(OUT, `${theme}.${id}.png`), png);
        written++;
    }

    const reportPath = resolve(COMPILED, '_report.json');
    const reports = JSON.parse(readFileSync(reportPath, 'utf8')) as Record<string, { report: any[] }>;
    const summary = Object.entries(reports)
        .filter(([, v]) => v.report.length)
        .map(([k, v]) => `${k}\n${v.report.map((r) => `    [${r.stage}] ${r.path} — ${r.message}`).join('\n')}`)
        .join('\n');
    writeFileSync(resolve(OUT, '_report.txt'), summary + '\n');

    console.log(`wrote ${written} contact sheets to ${OUT}`);
    if (failures.length) {
        console.log(`\n${failures.length} render failures:`);
        for (const f of failures) console.log(`  ${f}`);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
