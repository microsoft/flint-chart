// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { describe, it, expect } from 'vitest';
import { assembleVegaLite, assembleECharts, vlGetTemplateDef } from '../src';
import { THEME_PRESETS } from '../src/core/theme/presets';

/**
 * Vega-Lite Calendar Heatmap — parity with the ECharts calendar template.
 *
 * Vega-Lite has no first-class calendar coordinate system, so the grid derives
 * a UTC Monday week-start and weekday category from the date field. `sum`
 * collapses rows that share a calendar day into one cell.
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

function calendarCell(spec: any): { mark: any; encoding: any } {
    let found: { mark: any; encoding: any } | undefined;
    const visit = (node: any, inherited: any = {}) => {
        if (!node || found) return;
        const encoding = { ...inherited, ...(node.encoding ?? {}) };
        if (!node.__themeSynthetic && (node.mark?.type ?? node.mark) === 'rect' && encoding.color) {
            found = { mark: node.mark, encoding };
            return;
        }
        for (const key of ['layer', 'concat', 'hconcat', 'vconcat']) {
            for (const child of node[key] ?? []) visit(child, encoding);
        }
        if (node.spec) visit(node.spec, encoding);
    };
    visit(spec);
    if (!found) throw new Error('Calendar cell mark not found');
    return found;
}

function hasIndependentColorScale(node: any): boolean {
    if (!node || typeof node !== 'object') return false;
    if (node.resolve?.scale?.color === 'independent') return true;
    return ['layer', 'concat', 'hconcat', 'vconcat']
        .some(key => (node[key] ?? []).some((child: any) => hasIndependentColorScale(child)))
        || hasIndependentColorScale(node.spec);
}

describe('Vega-Lite Calendar Heatmap', () => {
    it('is registered in the Vega-Lite template registry', () => {
        expect(vlGetTemplateDef('Calendar Heatmap')).toBeDefined();
    });

    it('draws no plot frame, which would box in the days a part week lacks', () => {
        const spec = assembleVegaLite(calInput()) as any;
        expect(spec.config.view.stroke).toBeNull();
    });

    it('lets the caller square off the cells', () => {
        const rounded = assembleVegaLite(calInput()) as any;
        expect(rounded.mark.cornerRadius).toBe(2);

        const input: any = calInput();
        input.chart_spec.chartProperties = { cornerRadius: 0 };
        expect((assembleVegaLite(input) as any).mark.cornerRadius).toBe(0);
    });

    it('derives UTC Monday-week and weekday fields from the date', () => {
        const spec = assembleVegaLite(calInput()) as any;
        expect(spec.mark?.type ?? spec.mark).toBe('rect');
        expect(spec.encoding.x.field).toBe('__flintCalendarWeek');
        expect(spec.encoding.x.timeUnit).toBeUndefined();
        expect(spec.encoding.y.field).toBe('__flintCalendarWeekday');
        expect(spec.encoding.y.timeUnit).toBeUndefined();
        expect(spec.transform).toContainEqual({
            calculate: 'utc(utcyear(toDate(datum["__flintCalendarDate"])),utcmonth(toDate(datum["__flintCalendarDate"])),utcdate(toDate(datum["__flintCalendarDate"]))-((utcday(toDate(datum["__flintCalendarDate"]))+6)%7))',
            as: '__flintCalendarWeek',
        });
        expect(spec.transform).toContainEqual({
            calculate: "['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][utcday(toDate(datum[\"__flintCalendarDate\"]))]",
            as: '__flintCalendarWeekday',
        });
    });

    it('prints one month label near each boundary rather than one per week', () => {
        const spec = assembleVegaLite(calInput()) as any;
        expect(spec.encoding.x.axis.format).toBeUndefined();
        expect(spec.encoding.x.axis.labelExpr).toContain('utcdate(datum.value) <= 7');
        expect(spec.encoding.x.axis.labelExpr).toContain("utcFormat(datum.value, '%b')");
    });

    it('preserves empty weeks and month labels for sparse calendars', () => {
        const spec = assembleVegaLite({
            data: {
                values: [
                    { date: '2024-01-15', value: 1 },
                    { date: '2024-02-15', value: 2 },
                    { date: '2024-03-21', value: 3 },
                ],
            },
            semantic_types: { date: 'Date', value: 'Amount' },
            chart_spec: {
                chartType: 'Calendar Heatmap',
                encodings: { x: { field: 'date' }, color: { field: 'value' } },
                baseSize: { width: 420, height: 160 },
            },
        } as any) as any;
        expect(spec.encoding.x.scale.domain.length).toBeGreaterThan(3);
        expect(spec.encoding.x.scale.domain[0]).toBe(Date.UTC(2024, 0, 1));
        expect(spec.encoding.x.axis.labelExpr).toContain('utcdate(datum.value) <= 7');
    });

    it('uses timestamp offsets when deriving the explicit UTC week domain', () => {
        const spec = assembleVegaLite({
            data: {
                values: [
                    { date: '2024-09-01T00:30:00+14:00', value: 1 },
                    { date: '2024-09-03T12:00:00Z', value: 2 },
                ],
            },
            semantic_types: { date: 'Date', value: 'Amount' },
            chart_spec: {
                chartType: 'Calendar Heatmap',
                encodings: { x: { field: 'date' }, color: { field: 'value' } },
                baseSize: { width: 420, height: 160 },
            },
        } as any) as any;
        expect(spec.encoding.x.scale.domain).toContain(Date.UTC(2024, 7, 26));
    });

    it.each(['2024-01-01T00:00:00', '2024-01-01 00:00:00', ' 2024-01-01 00:00:00 '])(
        'normalizes timezone-less timestamp %s to UTC before deriving cells and domains',
        (date) => {
        const spec = assembleVegaLite({
            data: { values: [{ date, value: 1 }] },
            semantic_types: { date: 'Date', value: 'Amount' },
            chart_spec: {
                chartType: 'Calendar Heatmap',
                encodings: { x: { field: 'date' }, color: { field: 'value' } },
                baseSize: { width: 420, height: 160 },
            },
        } as any) as any;
        expect(spec.data.values[0].__flintCalendarDate).toBe(Date.UTC(2024, 0, 1));
        expect(spec.encoding.x.scale.domain).toContain(Date.UTC(2024, 0, 1));
        },
    );

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

    it('falls back to a derived per-day count when no value field is given', () => {
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
        expect(spec.transform).toContainEqual({ calculate: '1', as: '__flintCalendarCount' });
        expect(spec.encoding.color.aggregate).toBe('sum');
        expect(spec.encoding.color.field).toBe('__flintCalendarCount');
    });

    it.each([
        ['value-backed', calInput()],
        ['count-only', {
            data: { values: DAILY },
            semantic_types: { date: 'Date' },
            chart_spec: {
                chartType: 'Calendar Heatmap',
                encodings: { x: { field: 'date' } },
                baseSize: { width: 420, height: 160 },
            },
        }],
    ])('applies the house ramp, tile gap, type, and surface to %s calendars', (_name, input) => {
        const spec = assembleVegaLite({ ...input, theme_spec: THEME_PRESETS.pop.spec } as any) as any;
        const cell = calendarCell(spec);
        expect(cell.encoding.color.scale.scheme).toBeUndefined();
        expect(cell.encoding.color.scale.range).toEqual(spec._theme.decisions.series.range);
        expect(cell.mark.stroke).toBe(spec._theme.decisions.marks.tile.color);
        expect(cell.mark.strokeWidth).toBe(spec._theme.decisions.marks.tile.gap);
        expect(spec.config.axisX.labelFont).toBe(spec._theme.decisions.axes.x.label.font);
        expect(spec.background).toBe(spec._theme.decisions.surface.canvas);
    });

    it.each(Object.keys(THEME_PRESETS))('realizes the complete %s house on the calendar', (themeId) => {
        const spec = assembleVegaLite({ ...calInput(), theme_spec: themeId } as any) as any;
        const cell = calendarCell(spec);
        expect(spec._theme.id).toBe(themeId);
        expect(cell.encoding.color.scale.range).toEqual(spec._theme.decisions.series.range);
        expect(spec.config.axisX.labelFont).toBe(spec._theme.decisions.axes.x.label.font);
        expect(spec.background).toBe(spec._theme.decisions.surface.canvas);
    });

    it('aggregates theme-added cell labels with the calendar values', () => {
        const spec = assembleVegaLite({ ...calInput(), theme_spec: 'pop' } as any) as any;
        const label = spec.layer.find((layer: any) =>
            layer.__themeSynthetic && (layer.mark?.type ?? layer.mark) === 'text');
        expect(label.encoding.text.field).toBe('value');
        expect(label.encoding.text.aggregate).toBe('sum');
        expect(label.encoding.color.field).toBe('value');
        expect(label.encoding.color.aggregate).toBe('sum');
        expect(label.encoding.color.scale.type).toBe('quantize');
    });

    it.each(['swiss', 'datawrapper', 'cartoon'])(
        'keeps the %s label-contrast scale independent from the cell-fill scale',
        (themeId) => {
            const spec = assembleVegaLite({ ...calInput(), theme_spec: themeId } as any) as any;
            expect(hasIndependentColorScale(spec)).toBe(true);
        },
    );

    it('mirrors quantile fill bins when choosing aggregate label inks', () => {
        const input = calInput({ scheme: 'github' });
        const spec = assembleVegaLite({
            ...input,
            theme_spec: {
                id: 'contrast',
                label: 'Contrast',
                ink: {
                    surface: { canvas: '#ffffff' },
                    text: { primary: '#111111', inverse: '#ffffff' },
                    series: { single: '#333333', sequential: { stops: ['#ffffff', '#000000'] } },
                },
                dataLabels: { show: 'always', placement: 'atMark', inkMode: 'contrastWithMark' },
            },
        } as any) as any;
        const cell = calendarCell(spec);
        const label = spec.layer.find((layer: any) =>
            layer.__themeSynthetic && (layer.mark?.type ?? layer.mark) === 'text');
        expect(cell.encoding.color.scale.type).toBe('quantile');
        expect(label.encoding.color.scale.type).toBe('quantile');
        expect(label.encoding.color.scale.range).toHaveLength(cell.encoding.color.scale.range.length);
    });

    it('resolves the github scheme to a quantile scale over the canonical 5-bucket range', () => {
        const spec = assembleVegaLite(calInput({ scheme: 'github' })) as any;
        expect(spec.encoding.color.scale.scheme).toBeUndefined();
        // Quantile scale → discrete GitHub buckets, not a continuous ramp.
        expect(spec.encoding.color.scale.type).toBe('quantile');
        expect(spec.encoding.color.scale.range).toEqual([
            '#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39',
        ]);
    });

    it('passes a named scheme straight through to scale.scheme', () => {
        const spec = assembleVegaLite(calInput({ scheme: 'blues' })) as any;
        expect(spec.encoding.color.scale.scheme).toBe('blues');
    });

    it('assembles the same chart type on both backends (registry parity)', () => {
        const vl = assembleVegaLite(calInput()) as any;
        const ec = assembleECharts(calInput()) as any;
        expect(vl.encoding.x.field).toBe('__flintCalendarWeek'); // VL: derived week grid
        expect(ec.series?.[0]?.coordinateSystem).toBe('calendar'); // EC: calendar coord
    });
});
