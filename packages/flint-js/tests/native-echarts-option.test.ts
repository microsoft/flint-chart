// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * `chart_spec.echarts` — the native ECharts escape hatch.
 *
 * The tests pin the *contract* (merge semantics + binding sugar), because the
 * whole value of the hatch rests on it being predictable: a caller who patches
 * `series[1]` must not have to restate `series[0]`, a caller who passes raw
 * `data` must get raw `data`, and a caller who asks for a right-hand axis must
 * get a real second axis without touching any template.
 */

import { describe, it, expect } from 'vitest';
import { assembleECharts } from '../src/echarts';
import { assembleVegaLite, validateChart } from '../src';
import type { ChartAssemblyInput } from '../src/core/types';

const ROWS = [
    { month: '2026-01', revenue: 120, margin: 0.18, cost: 0.11 },
    { month: '2026-02', revenue: 96, margin: 0.22, cost: 0.14 },
    { month: '2026-03', revenue: 141, margin: 0.15, cost: 0.09 },
];

const SEMANTIC_TYPES = { month: 'DateTime', revenue: 'Quantity', margin: 'Percentage', cost: 'Percentage' };

function lineInput(echarts?: Record<string, unknown>, encodings?: Record<string, unknown>): ChartAssemblyInput {
    return {
        data: { values: ROWS },
        semantic_types: SEMANTIC_TYPES,
        chart_spec: {
            chartType: 'Line Chart',
            encodings: (encodings ?? { x: { field: 'month' }, y: { field: 'revenue' } }) as any,
            baseSize: { width: 600, height: 400 },
            ...(echarts ? { echarts } : {}),
        },
    } as ChartAssemblyInput;
}

const warningsOf = (spec: any) => (spec._warnings ?? []) as Array<{ code: string; severity: string }>;

describe('chart_spec.echarts — native option merge', () => {
    it('deep-merges objects and keeps the base values it does not mention', () => {
        const spec = assembleECharts(lineInput({
            tooltip: { valueFormatter: '{value}%' },
            yAxis: { axisLabel: { formatter: '{value}' } },
            dataZoom: [{ type: 'inside' }],
        })) as any;

        expect(spec.tooltip.trigger).toBe('axis');          // base kept
        expect(spec.tooltip.valueFormatter).toBe('{value}%'); // patch applied
        expect(spec.yAxis.name).toBe('revenue');            // base kept
        expect(spec.yAxis.axisLabel.formatter).toBe('{value}');
        expect(spec.dataZoom).toEqual([{ type: 'inside' }]); // new top-level key
    });

    it('merges series element-wise by index, so series[1] is addressable without restating series[0]', () => {
        const spec = assembleECharts(lineInput({
            series: [{ lineStyle: { width: 5 } }, { type: 'line', name: 'Margin', field: 'margin' }],
        })) as any;

        expect(spec.series).toHaveLength(2);
        expect(spec.series[0].lineStyle).toEqual({ width: 5 });
        expect(spec.series[0].data).toHaveLength(ROWS.length); // base data intact
        expect(spec.series[1].name).toBe('Margin');
        expect(spec.series[1].data).toEqual([
            ['2026-01', 0.18],
            ['2026-02', 0.22],
            ['2026-03', 0.15],
        ]);
    });

    it('replaces (not merges) primitive arrays such as a series\' data', () => {
        const spec = assembleECharts(lineInput({
            series: [{ data: [['2026-01', 9]] }],
        })) as any;

        expect(spec.series[0].data).toEqual([['2026-01', 9]]);
    });

    it('expands fields[] into one series per column, named after the column', () => {
        const spec = assembleECharts(lineInput({
            series: [{ type: 'line', fields: ['margin', 'cost'] }],
        })) as any;

        expect(spec.series).toHaveLength(3);
        expect(spec.series[1].name).toBe('margin');
        expect(spec.series[2].name).toBe('cost');
        expect(spec.series[2].data[0]).toEqual(['2026-01', 0.11]);
    });

    it('honours an explicit categoryField', () => {
        const spec = assembleECharts(lineInput({
            series: [{ type: 'line', field: 'margin', categoryField: 'month', name: 'Margin' }],
        })) as any;

        expect(spec.series[1].data.map((p: unknown[]) => p[0])).toEqual(['2026-01', '2026-02', '2026-03']);
    });

    it('drops the binding keys from the compiled series (they are Flint-side, not ECharts)', () => {
        const spec = assembleECharts(lineInput({
            series: [{ type: 'bar', field: 'margin', categoryField: 'month', axis: 'right', name: 'Margin' }],
        })) as any;

        const s = spec.series[1];
        expect(s.field).toBeUndefined();
        expect(s.fields).toBeUndefined();
        expect(s.categoryField).toBeUndefined();
        expect(s.axis).toBeUndefined();
        expect(s.type).toBe('bar');
    });
});

describe('chart_spec.echarts — dual axis without a template change', () => {
    it('creates a right-hand value axis, binds the series to it, and reserves grid room', () => {
        const base = assembleECharts(lineInput()) as any;
        const spec = assembleECharts(lineInput({
            series: [{ type: 'line', field: 'margin', name: 'Margin', axis: 'right' }],
        })) as any;

        expect(Array.isArray(spec.yAxis)).toBe(true);
        expect(spec.yAxis).toHaveLength(2);
        expect(spec.yAxis[1]).toMatchObject({ type: 'value', position: 'right' });
        expect(spec.series[1].yAxisIndex).toBe(1);
        expect(spec.grid.right).toBeGreaterThan(base.grid.right);
    });

    it('keeps a caller-supplied yAxis when one is patched in', () => {
        const spec = assembleECharts(lineInput({
            series: [{ type: 'line', field: 'margin', axis: 'right' }],
            yAxis: [{}, { name: 'Right axis' }],
        })) as any;

        expect(spec.yAxis).toHaveLength(2);
        expect(spec.yAxis[0].name).toBe('revenue'); // base axis untouched
        expect(spec.yAxis[1]).toMatchObject({ name: 'Right axis', position: 'right' });
    });

    it('does not create a second axis when the series stays on the left', () => {
        const spec = assembleECharts(lineInput({
            series: [{ type: 'line', field: 'margin' }],
        })) as any;

        expect(Array.isArray(spec.yAxis)).toBe(false);
        expect(spec.series[1].yAxisIndex).toBeUndefined();
    });
});

describe('chart_spec.echarts — guards', () => {
    it('ignores a non-object payload with a warning', () => {
        const spec = assembleECharts(lineInput('nope' as any)) as any;

        expect(spec.series).toHaveLength(1);
        expect(warningsOf(spec).map((w) => w.code)).toContain('native_echarts_invalid');
    });

    it('strips Flint-reserved "_" keys with an info warning', () => {
        const spec = assembleECharts(lineInput({ _width: 1, tooltip: { show: true } })) as any;

        expect(spec._width).toBeTypeOf('number');
        expect(spec._width).not.toBe(1);
        expect(spec.tooltip.show).toBe(true);
        const warning = warningsOf(spec).find((w) => w.code === 'native_echarts_private_keys');
        expect(warning?.severity).toBe('info');
    });

    it('warns and skips a series bound to a column that does not exist', () => {
        const spec = assembleECharts(lineInput({
            series: [{ type: 'line', field: 'nope' }],
        })) as any;

        expect(spec.series).toHaveLength(1);
        const warning = warningsOf(spec).find((w) => w.code === 'native_echarts_unknown_field');
        expect(warning).toBeDefined();
    });

    it('leaves the native patch applied but refuses per-series binding on faceted charts', () => {
        const spec = assembleECharts(lineInput(
            { series: [{ type: 'line', field: 'margin' }], legend: { show: false } },
            { x: { field: 'month' }, y: { field: 'revenue' }, column: { field: 'margin' } },
        )) as any;

        expect(warningsOf(spec).map((w) => w.code)).toContain('native_echarts_faceted');
        expect(spec.legend.show).toBe(false);
    });

    it('falls back to plain values when the chart has no category field', () => {
        const spec = assembleECharts({
            data: { values: ROWS },
            semantic_types: SEMANTIC_TYPES,
            chart_spec: {
                chartType: 'Pie Chart',
                encodings: { color: { field: 'month' }, size: { field: 'revenue' } },
                baseSize: { width: 400, height: 320 },
                echarts: { series: [{ type: 'bar', field: 'margin', name: 'Margin' }] },
            },
        } as any) as any;

        const native = spec.series[spec.series.length - 1];
        expect(native.name).toBe('Margin');
        expect(native.data).toEqual([0.18, 0.22, 0.15]);
    });

    it('is ignored by other backends (backend-scoped, like theme_spec)', () => {
        const input = lineInput({ series: [{ type: 'line', field: 'margin' }] }) as any;
        const spec = assembleVegaLite(input) as any;

        expect(spec.encoding).toBeDefined();
        expect(JSON.stringify(spec)).not.toContain('"field":"margin"');
    });

    it('passes validation: a native patch never turns into an assembly failure', () => {
        const ok = validateChart(lineInput({ tooltip: { show: false } }), 'echarts');
        expect(ok.errors).toEqual([]);
        expect(ok.valid).toBe(true);
        expect(ok.computedSize).toBeDefined();

        // A malformed payload degrades to a warning — the chart still renders.
        const bad = validateChart(lineInput('nope' as any), 'echarts');
        expect(bad.valid).toBe(true);
        expect(bad.warnings.map((w) => w.code)).toContain('native_echarts_invalid');
    });

    it('an empty array in the patch does not wipe a value the chart built', () => {
        const spec = assembleECharts(lineInput({ series: [] })) as any;

        expect(spec.series).toHaveLength(1);
        expect(spec.series[0].data).toHaveLength(ROWS.length);
    });

    it('leaves the caller\'s own input object untouched', () => {
        const payload = { series: [{ type: 'line', field: 'margin', name: 'Margin' }] };
        const input = lineInput(payload);
        assembleECharts(input);

        expect(payload.series).toEqual([{ type: 'line', field: 'margin', name: 'Margin' }]);
    });
});
