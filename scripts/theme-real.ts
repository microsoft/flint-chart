// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Real-data theme audit. The R2 corpus (`theme-r2.ts`) drives the houses with
 * synthetic gallery generators — clean cardinalities, tidy labels. This harness
 * drives them with the *real-world* datasets staged in
 * `site/src/playground/new-case-preview-data.ts` (the r1 theme-lab set): real
 * category names, real distributions, real negative values and long labels.
 *
 * It renders each VL-supported case as a contact sheet
 *
 *     flint | nyt | economist | nature
 *     mckinsey | datawrapper | powerbi | powerbi-light
 *
 * to `audit-out/real/<id>.png`, plus `_report.txt`.
 *
 * Run:  npx esbuild scripts/theme-real.ts --bundle --platform=node --format=esm \
 *         --outfile=scripts/.real.mjs --external:@resvg/resvg-js --log-level=error \
 *         --alias:flint-chart/test-data=./packages/flint-js/src/test-data/index.ts \
 *         --alias:flint-chart=./packages/flint-js/src/index.ts && node scripts/.real.mjs
 *
 *   node scripts/.real.mjs                every VL-supported case
 *   node scripts/.real.mjs penguins line cases whose id contains "penguins"/"line"
 */

import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { compile } from 'vega-lite';
import * as vega from 'vega';
import { Resvg } from '@resvg/resvg-js';

import { assembleVegaLite, vlGetTemplateDef } from '../packages/flint-js/src/index';
import { THEME_PRESETS } from '../packages/flint-js/src/core/theme/presets';
import { PREVIEW_CASES, type PreviewCase } from '../site/src/shared/preview-cases';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '../audit-out/real');

const THEME_IDS = Object.keys(THEME_PRESETS);
const COLUMNS = ['flint', ...THEME_IDS];

const GAP = 10;
const LABEL_H = 16;
const GRID_COLS = 4;

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

/** Assembly input for a real case — mirrors ThemeLab.tsx `inputFor`. */
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

interface Panel { svg: string; width: number; height: number; label: string; background: string }

async function toSvg(spec: any): Promise<{ svg: string; width: number; height: number }> {
    const vgSpec = compile(spec).spec;
    const view = new vega.View(vega.parse(vgSpec), { renderer: 'none' });
    const svg = await view.toSVG();
    view.finalize();
    const m = /<svg[^>]*\bwidth="([\d.]+)"[^>]*\bheight="([\d.]+)"/.exec(svg);
    return { svg, width: m ? Number(m[1]) : 400, height: m ? Number(m[2]) : 300 };
}

function contactSheet(panels: Panel[], cols: number, heading: string): { svg: string; width: number } {
    const colW = Math.ceil(Math.max(...panels.map((p) => p.width)));
    const rowH = Math.ceil(Math.max(...panels.map((p) => p.height))) + LABEL_H;
    const rows = Math.ceil(panels.length / cols);
    const HEAD_H = 20;
    const totalW = cols * colW + (cols - 1) * GAP;
    const totalH = HEAD_H + rows * rowH + (rows - 1) * GAP;

    let body = `<rect width="${totalW}" height="${totalH}" fill="#e8e8e8"/>`;
    body += `<text x="2" y="14" font-family="Helvetica, Arial, sans-serif" font-size="12" fill="#111">${esc(heading)}</text>`;
    panels.forEach((p, i) => {
        const x = (i % cols) * (colW + GAP);
        const y = HEAD_H + Math.floor(i / cols) * (rowH + GAP);
        body += `<text x="${x + 2}" y="${y + 11}" font-family="Helvetica, Arial, sans-serif" font-size="10" fill="#444">${esc(p.label)}</text>`;
        body += `<rect x="${x}" y="${y + LABEL_H}" width="${colW}" height="${rowH - LABEL_H}" fill="${p.background}"/>`;
        body += `<g transform="translate(${x},${y + LABEL_H})">${p.svg}</g>`;
    });
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${totalW}" height="${totalH}" viewBox="0 0 ${totalW} ${totalH}">${body}</svg>`;
    return { svg, width: totalW };
}

function backgroundOf(spec: any): string {
    return typeof spec?.background === 'string' ? spec.background : '#ffffff';
}

interface Built { spec: any; report: any[]; error?: string }

function build(c: PreviewCase, themeId: string | null): Built {
    try {
        const input = inputFor(c);
        const spec = assembleVegaLite(
            themeId ? { ...input, theme_spec: THEME_PRESETS[themeId].spec } : input,
        );
        const report = spec._theme?.report ?? [];
        stripInternal(spec);
        return { spec, report };
    } catch (err) {
        return { spec: null, report: [], error: (err as Error).message };
    }
}

async function panelFor(c: PreviewCase, column: string): Promise<{ panel: Panel; notes: string[] }> {
    const themeId = column === 'flint' ? null : column;
    const built = build(c, themeId);
    const notes: string[] = built.report.map((r: any) => `[${r.stage}] ${r.path} — ${r.message}`);
    if (built.error) {
        notes.push(`ASSEMBLE FAILED — ${built.error}`);
        return { panel: { svg: '', width: 300, height: 300, label: `${column} ✗ assemble`, background: '#ffdddd' }, notes };
    }
    try {
        const r = await toSvg(built.spec);
        return { panel: { ...r, label: column, background: backgroundOf(built.spec) }, notes };
    } catch (err) {
        notes.push(`RENDER FAILED — ${(err as Error).message}`);
        return { panel: { svg: '', width: 300, height: 300, label: `${column} ✗ render`, background: '#ffdddd' }, notes };
    }
}

async function main(): Promise<void> {
    const filters = process.argv.slice(2).filter((a) => !a.startsWith('--'));
    const supported = PREVIEW_CASES.filter((c) => vlGetTemplateDef(c.chartType));
    const skipped = PREVIEW_CASES.filter((c) => !vlGetTemplateDef(c.chartType));
    const cases = filters.length
        ? supported.filter((c) => filters.some((f) => c.id.toLowerCase().includes(f.toLowerCase()) || c.chartType.toLowerCase().includes(f.toLowerCase())))
        : supported;

    if (!filters.length) rmSync(OUT, { recursive: true, force: true });
    mkdirSync(OUT, { recursive: true });

    const reportLines: string[] = [];
    const failures: string[] = [];
    let written = 0;

    for (const c of cases) {
        const panels: Panel[] = [];
        for (const col of COLUMNS) {
            const { panel, notes } = await panelFor(c, col);
            panels.push(panel);
            if (notes.length) {
                reportLines.push(`${c.id}.${col}`);
                for (const n of notes) reportLines.push(`    ${n}`);
            }
            for (const n of notes) if (/FAILED/.test(n)) failures.push(`${c.id}.${col}: ${n}`);
        }
        const sheet = contactSheet(panels, GRID_COLS, `${c.id}  ·  ${c.chartType}  ·  ${c.title}`);
        writeFileSync(
            resolve(OUT, `${c.id}.png`),
            new Resvg(sheet.svg, { fitTo: { mode: 'width', value: sheet.width * 2 } }).render().asPng(),
        );
        written++;
        process.stdout.write(`\r${written}/${cases.length} ${c.id.padEnd(28)}`);
    }

    if (!filters.length) {
        reportLines.push('');
        reportLines.push(`Skipped (no VL template — Plotly-only): ${skipped.map((c) => `${c.id} (${c.chartType})`).join(', ')}`);
    }
    writeFileSync(resolve(OUT, '_report.txt'), reportLines.join('\n') + '\n');
    console.log(`\nwrote ${written} contact sheets to ${OUT}`);
    if (skipped.length && !filters.length) console.log(`skipped ${skipped.length} Plotly-only: ${skipped.map((c) => c.id).join(', ')}`);
    if (failures.length) {
        console.log(`\n${failures.length} failures:`);
        for (const f of failures) console.log(`  ${f}`);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
