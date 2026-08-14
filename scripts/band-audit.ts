// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Numeric band-geometry audit over the real-data gallery cases.
 *
 * For every VL case with a banded axis, reports the category count and the
 * pitch each house settles, so an over-expanded sparse axis shows up as a
 * number rather than something to spot in a contact sheet.
 *
 * Run:  npx esbuild scripts/band-audit.ts --bundle --platform=node --format=esm \
 *         --outfile=scripts/.band.mjs --log-level=error \
 *         --alias:flint-chart/test-data=./packages/flint-js/src/test-data/index.ts \
 *         --alias:flint-chart=./packages/flint-js/src/index.ts && node scripts/.band.mjs
 */

import { assembleVegaLite } from '../packages/flint-js/src/index';
import { THEME_PRESETS } from '../packages/flint-js/src/core/theme/presets';
import { PREVIEW_CASES } from '../site/src/shared/preview-cases';

const THEME_IDS = Object.keys(THEME_PRESETS);

interface Row {
    id: string;
    theme: string;
    count: number;
    step: number;
    solid: number;
}

function paddingInner(node: any): number | undefined {
    if (!node || typeof node !== 'object') return undefined;
    for (const ch of ['x', 'y']) {
        const p = node.encoding?.[ch]?.scale?.paddingInner;
        if (typeof p === 'number') return p;
    }
    for (const v of Object.values(node)) {
        const found = paddingInner(v);
        if (found != null) return found;
    }
    return undefined;
}

const rows: Row[] = [];
const failures: string[] = [];

for (const c of PREVIEW_CASES) {
    for (const theme of THEME_IDS) {
        let spec: any;
        try {
            spec = assembleVegaLite({
                data: { values: c.data },
                semantic_types: c.semantic_types,
                chart_spec: {
                    chartType: c.chartType,
                    encodings: c.encodings,
                    ...(c.chartProperties ? { chartProperties: c.chartProperties } : {}),
                    canvasSize: { width: 560, height: 400 },
                },
                theme_spec: theme,
            } as any);
        } catch (err) {
            failures.push(`${c.id} ${theme}: ${(err as Error).message}`);
            continue;
        }
        const step = typeof spec.width?.step === 'number' ? spec.width.step
            : typeof spec.height?.step === 'number' ? spec.height.step
            : undefined;
        if (step == null) continue;
        const field = (c.encodings as any)?.x ?? (c.encodings as any)?.y;
        const count = new Set((c.data as any[]).map((r) => r?.[field as string])).size;
        const fill = 1 - (paddingInner(spec) ?? 0.2);
        rows.push({ id: c.id, theme, count, step, solid: step * fill });
    }
}

const wide = rows.filter((r) => r.step >= 80).sort((a, b) => b.step - a.step);
console.log(`cases measured: ${new Set(rows.map((r) => r.id)).size}, rows: ${rows.length}`);
if (failures.length) console.log(`\ncompile failures: ${failures.length}\n  ${failures.slice(0, 10).join('\n  ')}`);

console.log(`\n--- pitch >= 80px (${wide.length} rows) ---`);
for (const r of wide.slice(0, 30)) {
    console.log(`  ${r.id.padEnd(26)} ${r.theme.padEnd(14)} n=${String(r.count).padEnd(4)} pitch=${r.step.toFixed(0).padEnd(5)} solid=${r.solid.toFixed(0)}`);
}

console.log('\n--- per-theme max pitch ---');
for (const theme of THEME_IDS) {
    const t = rows.filter((r) => r.theme === theme);
    if (!t.length) continue;
    const max = t.reduce((a, b) => (b.step > a.step ? b : a));
    const median = [...t].sort((a, b) => a.step - b.step)[Math.floor(t.length / 2)];
    console.log(`  ${theme.padEnd(14)} median=${median.step.toFixed(0).padEnd(5)} max=${max.step.toFixed(0).padEnd(5)} (${max.id}, n=${max.count})`);
}
