// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * A spec's own `updates`: applied by the interactive runtime once the chart is drawn, before and
 * under a host's updates of the same id; left out of static outputs, which say so.
 */

import { describe, expect, it } from 'vitest';
import { assembleVegaLite, type ChartAssemblyInput } from '../src';
import { assemblePlotly } from '../src/plotly';
import { assembleECharts } from '../src/echarts';
import { assembleChartjs } from '../src/chartjs';
import { validateChart } from '../src/validate';
import { composeInteractiveOptions } from '../src/interactive/spec/compose';

const NOTE = { id: 'note', ops: [{ op: 'annotate-text', target: { select: { key: { Region: 'East' } } }, value: { text: 'Best quarter' } }] } as const;
const SHADE = { id: 'shade', ops: [{ op: 'set-style', targets: [{ select: { where: { Region: { in: ['West'] } } } }], value: { state: 'muted' } }] } as const;

const chart = (updates?: unknown[]): ChartAssemblyInput => ({
    data: { values: [{ Region: 'East', Sales: 4 }, { Region: 'West', Sales: 3 }] },
    semantic_types: { Region: 'Category', Sales: 'Quantity' },
    chart_spec: { chartType: 'Bar Chart', encodings: { x: 'Region', y: 'Sales' } },
    ...(updates ? { updates } : {}),
} as ChartAssemblyInput);

describe('a spec’s updates', () => {
    it('are applied before the host’s, a host update replacing the spec’s of its id', () => {
        const composed = composeInteractiveOptions(chart([NOTE, SHADE]), { backend: 'vegalite', updates: [{ id: 'note', ops: [] }] });
        expect(composed.updates.map((update) => [update.id, update.ops.length])).toEqual([['shade', 1], ['note', 0]]);
        expect(composeInteractiveOptions(chart([NOTE]), { backend: 'vegalite' }).updates.map((update) => update.id)).toEqual(['note']);
    });

    it('are left out of a static output, which says so; a spec without them says nothing', () => {
        for (const assemble of [assembleVegaLite, assemblePlotly, assembleECharts, assembleChartjs]) {
            const warning = (assemble(chart([NOTE, SHADE])) as any)._warnings?.find((each: any) => each.code === 'updates-not-compiled');
            expect(warning).toMatchObject({ severity: 'info' });
            expect(warning.message).toContain('"note", "shade"');
            expect(((assemble(chart()) as any)._warnings ?? []).some((each: any) => each.code === 'updates-not-compiled')).toBe(false);
        }
    });

    it('are validated with the host’s, op by op against the chart, and named where malformed', () => {
        const result = validateChart(chart([NOTE]), 'vegalite', { updates: [SHADE] as any });
        expect(result.valid).toBe(true);
        expect(result.updates?.map((check) => check.id)).toEqual(['note', 'shade']);
        // Validation assembles the chart without them: no note that the output lacks them.
        expect(result.warnings.some((each) => each.code === 'updates-not-compiled')).toBe(false);
        const bad = validateChart(chart([{ id: 'x', ops: [{ op: 'no-such-op' }] }]), 'vegalite');
        expect(bad.valid).toBe(false);
        expect(bad.errors[0].message).toContain('input.updates[0]');
    });
});
