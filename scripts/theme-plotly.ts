// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly theme lab — contact sheets of one chart under every house.
 *
 *     flint | nyt | economist | swiss | nature | mckinsey | datawrapper | powerbi | …
 *
 * Written to `audit-out/plotly-<set>/<id>.png`, plus `_report.txt` with every
 * ground/realize report and every assembly or render failure.
 *
 * Three corpora, in the order the Vega-Lite experiment used them:
 *   --set lab    a hand-picked handful of core chart types (start small)
 *   --set r2     the synthetic R2 corpus (clean cardinalities, wide coverage)
 *   --set real   the real-world datasets (long labels, negatives, real shapes)
 *
 * Run:
 *   npx esbuild scripts/theme-plotly.ts --bundle --platform=node --format=esm \
 *     --outfile=scripts/.plotly.mjs --external:puppeteer-core --log-level=error \
 *     --alias:flint-chart/test-data=./packages/flint-js/src/test-data/index.ts \
 *     --alias:flint-chart=./packages/flint-js/src/index.ts
 *   node scripts/.plotly.mjs --set lab
 *   node scripts/.plotly.mjs --set r2 bar line     # filter by id/chart type
 */

import { writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

import { assemblePlotly, plGetTemplateDef } from '../packages/flint-js/src/index';
import { THEME_PRESETS } from '../packages/flint-js/src/core/theme/presets';
import { PREVIEW_CASES, type PreviewCase } from '../site/src/shared/preview-cases';
import { R2_CASES, r2Input, type R2Case } from '../site/src/playground/theme-lab-r2-data';
import { PlotlyRenderer, type PlotlyPanel } from './plotly-sheet';

const __dirname = dirname(fileURLToPath(import.meta.url));

const THEME_IDS = Object.keys(THEME_PRESETS);
const COLUMNS = ['flint', ...THEME_IDS];

/** The starting set: one chart of each core family, on real data. */
const LAB_IDS = ['browser-pie', 'causes-death', 'keeling', 'penguins', 'life-expectancy', 'temp-heatmap'];

interface Case {
    id: string;
    heading: string;
    input: () => any;
}

function realCase(c: PreviewCase): Case {
    return {
        id: c.id,
        heading: `${c.id}  ·  ${c.chartType}  ·  ${c.title}`,
        input: () => ({
            data: { values: c.data },
            semantic_types: c.semantic_types,
            chart_spec: {
                chartType: c.chartType,
                title: c.title,
                encodings: c.encodings,
                baseSize: { width: 320, height: 300 },
                ...(c.chartProperties ? { chartProperties: c.chartProperties } : {}),
            },
        }),
    };
}

function r2Wrapped(c: R2Case): Case {
    return {
        id: c.id,
        heading: `${c.id}  ·  ${c.gen}[${c.index}]  ·  ${c.probe}`,
        input: () => r2Input(c),
    };
}

function corpus(set: string, filters: string[]): Case[] {
    let cases: Case[];
    if (set === 'r2') {
        cases = R2_CASES.map(r2Wrapped);
    } else if (set === 'real') {
        cases = PREVIEW_CASES.map(realCase);
    } else {
        cases = PREVIEW_CASES.filter((c) => LAB_IDS.includes(c.id)).map(realCase);
    }
    if (filters.length) {
        cases = cases.filter((c) =>
            filters.some((f) => c.id.toLowerCase().includes(f.toLowerCase())
                || c.heading.toLowerCase().includes(f.toLowerCase())),
        );
    }
    return cases;
}

function stripInternal(node: any, depth = 0): void {
    if (!node || typeof node !== 'object' || depth > 8) return;
    if (Array.isArray(node)) return node.forEach((n) => stripInternal(n, depth + 1));
    for (const key of Object.keys(node)) {
        if (/^_[^_]/.test(key)) delete node[key];
        else stripInternal(node[key], depth + 1);
    }
}

function build(c: Case, themeId: string | null): { figure: any | null; report: any[]; error?: string } {
    try {
        const input = c.input();
        const chartType = input.chart_spec.chartType;
        if (!plGetTemplateDef(chartType)) {
            return { figure: null, report: [], error: `no Plotly template for \`${chartType}\`` };
        }
        const figure = assemblePlotly(
            themeId ? { ...input, theme_spec: THEME_PRESETS[themeId].spec } : input,
        );
        const report = figure?._theme?.report ?? [];
        const clean = { data: figure.data, layout: figure.layout };
        stripInternal(clean);
        return { figure: clean, report };
    } catch (err) {
        return { figure: null, report: [], error: (err as Error).message };
    }
}

async function main(): Promise<void> {
    const argv = process.argv.slice(2);
    const setIdx = argv.indexOf('--set');
    const set = setIdx >= 0 ? argv[setIdx + 1] : 'lab';
    const filters = argv.filter((a, i) => !a.startsWith('--') && i !== setIdx + 1);

    const out = resolve(__dirname, `../audit-out/plotly-${set}`);
    const cases = corpus(set, filters);
    if (!cases.length) throw new Error(`no cases for set \`${set}\` with filters ${filters.join(',')}`);
    if (!filters.length) rmSync(out, { recursive: true, force: true });
    mkdirSync(out, { recursive: true });

    const renderer = new PlotlyRenderer();
    await renderer.open();

    const reportLines: string[] = [];
    const failures: string[] = [];
    let written = 0;

    for (const c of cases) {
        const panels: PlotlyPanel[] = [];
        for (const col of COLUMNS) {
            const built = build(c, col === 'flint' ? null : col);
            panels.push({ label: col, figure: built.figure, error: built.error });
            const notes = built.report.map((r: any) => `[${r.stage}] ${r.path} — ${r.message}`);
            if (built.error) {
                notes.push(`ASSEMBLE FAILED — ${built.error}`);
                failures.push(`${c.id}.${col}: ${built.error}`);
            }
            if (notes.length) {
                reportLines.push(`${c.id}.${col}`);
                for (const n of notes) reportLines.push(`    ${n}`);
            }
        }
        const errs = await renderer.sheet(
            { name: c.id, heading: c.heading, panels, cols: 4 },
            out,
        );
        for (const e of errs) {
            failures.push(`${c.id}: RENDER ${e}`);
            reportLines.push(`${c.id}    RENDER FAILED — ${e}`);
        }
        written++;
        process.stdout.write(`\r${written}/${cases.length} ${c.id.padEnd(30)}`);
    }

    await renderer.close();
    writeFileSync(resolve(out, '_report.txt'), reportLines.join('\n') + '\n');
    console.log(`\nwrote ${written} contact sheets to ${out}`);
    if (failures.length) {
        console.log(`\n${failures.length} failures:`);
        for (const f of failures.slice(0, 40)) console.log(`  ${f}`);
    }
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
