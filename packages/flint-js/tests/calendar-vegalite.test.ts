// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite, assembleECharts, vlGetTemplateDef } from '../src';

/**
 * Vega-Lite Calendar Heatmap — parity with the ECharts calendar template.
 *
 * Vega-Lite has no first-class calendar coordinate system, so the grid is
 * expressed with `timeUnit`: the same date field drives `yearweek` (week
 * columns) on x and `day` (weekday rows) on y, and `sum` collapses rows that
 * share a calendar day into one cell.
 */

const DAILY = [
    { date: '2024-01-01', value: 5 },
    { date: '2024-01-02', value: 9 },
    { date: '2024-01-02', value: 1 }, // same day → summed with the row above
    { date: '2024-01-08', value: 12 },
    { date: '2024-02-05', value: 3 },
];

function calInput(extraEnc?: Record<string, unknown>) {
    return {
        data: { values: DAILY },
        semantic_types: { date: 'Date', value: 'Amount' },
        chart_spec: {
            chartType: 'Calendar Heatmap',
            encodings: { x: { field: 'date' }, color: { field: 'value', ...extraEnc } },
            baseSize: { width: 420, height: 160 },
        },
    };
}

describe('Vega-Lite Calendar Heatmap', () => {
    it('is registered in the Vega-Lite template registry', () => {
        expect(vlGetTemplateDef('Calendar Heatmap')).toBeDefined();
    });

    it('drives both axes from the one date field via yearweek × day', () => {
        const spec = assembleVegaLite(calInput()) as any;
        expect(spec.mark?.type ?? spec.mark).toBe('rect');
        expect(spec.encoding.x.field).toBe('date');
        expect(spec.encoding.x.timeUnit).toBe('yearweek');
        expect(spec.encoding.y.field).toBe('date');
        expect(spec.encoding.y.timeUnit).toBe('day');
    });

    it('orders weekday rows Monday-first (matches the ECharts calendar)', () => {
        const spec = assembleVegaLite(calInput()) as any;
        expect(spec.encoding.y.sort).toEqual(['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']);
    });

    it('sums the value per calendar day', () => {
        const spec = assembleVegaLite(calInput()) as any;
        expect(spec.encoding.color.field).toBe('value');
        expect(spec.encoding.color.aggregate).toBe('sum');
        expect(spec.encoding.color.type).toBe('quantitative');
    });

    it('falls back to a per-day count when no value field is given', () => {
        const input = {
            data: { values: DAILY },
            semantic_types: { date: 'Date' },
            chart_spec: {
                chartType: 'Calendar Heatmap',
                encodings: { x: { field: 'date' } },
                baseSize: { width: 420, height: 160 },
            },
        };
        const spec = assembleVegaLite(input) as any;
        expect(spec.encoding.color.aggregate).toBe('count');
        expect(spec.encoding.color.field).toBeUndefined();
    });

    it('resolves the github scheme to an explicit range (no built-in Vega-Lite scheme)', () => {
        const spec = assembleVegaLite(calInput({ scheme: 'github' })) as any;
        expect(spec.encoding.color.scale.scheme).toBeUndefined();
        expect(Array.isArray(spec.encoding.color.scale.range)).toBe(true);
        expect(spec.encoding.color.scale.range[0]).toBe('#ebedf0');
    });

    it('passes a named scheme straight through to scale.scheme', () => {
        const spec = assembleVegaLite(calInput({ scheme: 'blues' })) as any;
        expect(spec.encoding.color.scale.scheme).toBe('blues');
    });

    it('assembles the same chart type on both backends (registry parity)', () => {
        const vl = assembleVegaLite(calInput()) as any;
        const ec = assembleECharts(calInput()) as any;
        expect(vl.encoding.x.timeUnit).toBe('yearweek'); // VL: timeUnit grid
        expect(ec.series?.[0]?.coordinateSystem).toBe('calendar'); // EC: calendar coord
    });
});
