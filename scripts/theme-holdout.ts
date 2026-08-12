// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * The held-out set.
 *
 * The theme lab is the dev set: every gap in `04-experiment.md` was found by
 * looking at it, so it cannot say whether the compiler generalises. This script
 * draws a sample from `shared/test-data` — chart cases written for other
 * purposes entirely, never looked at while the theme compiler was being built —
 * and renders each one twice:
 *
 *     1 Flint default   |   2 ThemeSpec compiled
 *
 * There is no hand-authored column here, and that is the point: the question is
 * no longer "how close is the compiler to one human's reading of the house
 * rules" but "does the compiler produce a chart worth looking at at all".
 *
 * Run:  npx esbuild scripts/theme-holdout.ts --bundle --platform=node \
 *         --format=esm --outfile=scripts/.holdout.mjs --external:@resvg/resvg-js \
 *         --log-level=error && node scripts/.holdout.mjs [count] [seed]
 */

import { readFileSync, readdirSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { compile } from 'vega-lite';
import * as vega from 'vega';
import { Resvg } from '@resvg/resvg-js';

import { assembleVegaLite, vlGetTemplateDef } from '../packages/flint-js/src/index';
import { THEME_PRESETS } from '../packages/flint-js/src/core/theme/presets';

const __dirname = dirname(fileURLToPath(import.meta.url));
const CASES = resolve(__dirname, '../shared/test-data');
const OUT = resolve(__dirname, '../audit-out/holdout');

const THEMES = Object.fromEntries(
    Object.entries(THEME_PRESETS).map(([id, preset]) => [id, preset.spec]),
) as Record<string, any>;
const THEME_IDS = Object.keys(THEMES);

const PANEL_WIDTH = 400;
const GAP = 12;
const LABEL_H = 18;

/** A small deterministic generator, so a sample can be quoted and re-drawn. */
function rng(seed: number): () => number {
    let s = seed >>> 0;
    return () => {
        s = (s * 1664525 + 1013904223) >>> 0;
        return s / 0x100000000;
    };
}

function stripInternal(node: any): void {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(stripInternal); return; }
    for (const key of Object.keys(node)) {
        if (/^_[^_]/.test(key)) delete node[key];
        else stripInternal(node[key]);
    }
}

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

interface Case { slug: string; chartType: string; title: string; input: any }

function loadCases(): Case[] {
    const out: Case[] = [];
    for (const slug of readdirSync(CASES)) {
        const file = resolve(CASES, slug, 'input.json');
        if (!existsSync(file)) continue;
        let raw: any;
        try { raw = JSON.parse(readFileSync(file, 'utf8')); } catch { continue; }
        const input = raw.input ?? raw;
        const chartType = raw.chartType ?? input?.chart_spec?.chartType;
        if (!chartType || !input?.chart_spec || !input?.data) continue;
        if (!vlGetTemplateDef(chartType)) continue;
        const title = raw.title ?? slug;
        if (input.chart_spec.title == null) input.chart_spec.title = title;
        out.push({ slug, chartType, title, input });
    }
    return out;
}

/** One case per chart type, drawn at random, so the sample spans the vocabulary. */
function sample(cases: Case[], count: number, seed: number): Case[] {
    const rand = rng(seed);
    const byType = new Map<string, Case[]>();
    for (const c of cases) {
        const list = byType.get(c.chartType) ?? [];
        list.push(c);
        byType.set(c.chartType, list);
    }
    const types = [...byType.keys()].sort();
    for (let i = types.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        [types[i], types[j]] = [types[j], types[i]];
    }
    return types.slice(0, count).map((t) => {
        const list = byType.get(t)!;
        return list[Math.floor(rand() * list.length)];
    });
}

async function main(): Promise<void> {
    const count = Number(process.argv[2] ?? 10);
    const seed = Number(process.argv[3] ?? 20260101);
    rmSync(OUT, { recursive: true, force: true });
    mkdirSync(OUT, { recursive: true });

    const picked = sample(loadCases(), count, seed);
    const failures: string[] = [];
    const manifest: any[] = [];

    for (const [i, c] of picked.entries()) {
        const themeId = THEME_IDS[i % THEME_IDS.length];
        let flint: any, themed: any;
        try {
            flint = assembleVegaLite(structuredClone(c.input));
            themed = assembleVegaLite({ ...structuredClone(c.input), theme_spec: THEMES[themeId] });
        } catch (err) {
            failures.push(`${c.slug} [${themeId}]: ${(err as Error).message}`);
            continue;
        }
        const report = themed._theme?.report ?? [];
        const warnings = [...(flint._warnings ?? []), ...(themed._warnings ?? [])];
        stripInternal(flint);
        stripInternal(themed);

        const panels: Panel[] = [];
        for (const [spec, label] of [[flint, '1 flint'], [themed, `2 ${themeId}`]] as Array<[any, string]>) {
            try {
                const r = await toSvg(spec);
                panels.push({
                    ...r,
                    label: `${label}  ${c.chartType} · ${c.slug}`,
                    background: typeof spec.background === 'string' ? spec.background : '#ffffff',
                });
            } catch (err) {
                failures.push(`${c.slug} [${label}]: ${(err as Error).message}`);
                panels.push({ svg: '', width: PANEL_WIDTH, height: 300, label: `${label} FAILED`, background: '#ffdddd' });
            }
        }
        const sheet = contactSheet(panels);
        const png = new Resvg(sheet.svg, { fitTo: { mode: 'width', value: sheet.width * 2 } }).render().asPng();
        const name = `${String(i + 1).padStart(2, '0')}.${themeId}.${c.slug}`;
        writeFileSync(resolve(OUT, `${name}.png`), png);
        writeFileSync(resolve(OUT, `${name}.compiled.json`), JSON.stringify(themed, null, 2) + '\n');
        manifest.push({ n: i + 1, slug: c.slug, chartType: c.chartType, theme: themeId, report, warnings });
    }

    writeFileSync(resolve(OUT, '_manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(`sampled ${picked.length} cases (seed ${seed}) into ${OUT}`);
    for (const m of manifest) console.log(`  ${m.n}. ${m.theme} · ${m.chartType} · ${m.slug}`);
    if (failures.length) {
        console.log(`\n${failures.length} failures:`);
        for (const f of failures) console.log(`  ${f}`);
    }
}

main().catch((err) => { console.error(err); process.exit(1); });
