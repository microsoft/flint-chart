// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Vega-Lite Calendar Heatmap template.
 *
 * The ECharts backend has a first-class calendar coordinate system; Vega-Lite
 * has none, so two UTC calendar fields are derived from the supplied date:
 *   x  →  Monday at the start of the observation's week
 *   y  →  Monday-first weekday name
 * Using one UTC definition for both fields prevents ISO dates from drifting a
 * weekday in negative-offset hosts and keeps every column a contiguous
 * Monday–Sunday week.
 *
 * Encoding:
 *   x     (temporal) → the date of each cell
 *   color (quantitative) → the cell value (defaults to a count of 1)
 */

import { ChartTemplateDef, ChartPropertyDef, EncodingActionDef } from '../../core/types';
import { MUTED_HOVER_STROKE, targetFromHits } from '../../core/interaction-semantics';
import { suppressAnnotationUpdate } from '../../interactive/updates/annotation';

/** Weekday row order, Monday-first — mirrors the ECharts template's dayLabel.firstDay = 1. */
const WEEKDAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Sequential schemes. Named Vega-Lite schemes pass through as `scale.scheme`;
 * 'github' has no built-in Vega-Lite equivalent, so it resolves to an explicit
 * `scale.range` (the same low→high ramp the ECharts template uses).
 */
const GITHUB_RANGE = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'];
const VL_SCHEMES = new Set(['viridis', 'blues', 'greens', 'reds', 'oranges', 'purples']);
const COUNT_FIELD = '__flintCalendarCount';
const DATE_FIELD = '__flintCalendarDate';
const WEEK_FIELD = '__flintCalendarWeek';
const WEEKDAY_FIELD = '__flintCalendarWeekday';

function calendarDate(raw: unknown): Date | undefined {
    if (raw instanceof Date) {
        return Number.isFinite(raw.getTime()) ? new Date(raw.getTime()) : undefined;
    }
    const text = typeof raw === 'string' ? raw.trim() : undefined;
    if (text && /^\d{4}-\d{2}-\d{2}$/.test(text)) {
        const [year, month, date] = text.split('-').map(Number);
        return new Date(Date.UTC(year, month - 1, date));
    }
    if (text
        && /^\d{4}-\d{2}-\d{2}[T ]/.test(text)
        && !/(?:Z|[+-]\d{2}:?\d{2})$/i.test(text)) {
        const date = new Date(`${text.replace(' ', 'T')}Z`);
        return Number.isFinite(date.getTime()) ? date : undefined;
    }
    if (typeof raw !== 'string' && typeof raw !== 'number') return undefined;
    const date = new Date(text ?? raw);
    return Number.isFinite(date.getTime()) ? date : undefined;
}

function calendarWeekDomain(table: any[], field: string): number[] | undefined {
    const dates = table.flatMap(row => {
        const date = calendarDate(row?.[field]);
        return date ? [date] : [];
    });
    if (!dates.length) return undefined;
    dates.sort((a, b) => a.getTime() - b.getTime());

    const first = dates[0];
    const last = dates[dates.length - 1];
    const start = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), 1));
    start.setUTCDate(start.getUTCDate() - ((start.getUTCDay() + 6) % 7));
    const end = new Date(Date.UTC(last.getUTCFullYear(), last.getUTCMonth() + 1, 0));
    end.setUTCDate(end.getUTCDate() - ((end.getUTCDay() + 6) % 7));

    const domain: number[] = [];
    for (const week = new Date(start); week <= end; week.setUTCDate(week.getUTCDate() + 7)) {
        domain.push(week.getTime());
    }
    return domain;
}

export const vlCalendarHeatmapDef: ChartTemplateDef = {
    chart: 'Calendar Heatmap',
    template: { mark: { type: 'rect', cornerRadius: 2 }, encoding: {} },
    channels: ['x', 'color'],
    markCognitiveChannel: 'color',
    semanticInteractions: () => ({
        fields: [WEEK_FIELD, WEEKDAY_FIELD],
        categoryField: WEEK_FIELD,
        selectableMarks: ['rect'],
        renderHoverStyles: { rect: { stroke: MUTED_HOVER_STROKE, strokeWidth: 2 } },
        resolve: (event, context) => targetFromHits(event.hits, context.keyField, {
            kind: 'mark',
            role: 'calendar-day',
        }),
        presentUpdate: suppressAnnotationUpdate,
    }),
    declareLayoutMode: () => ({
        // Both axes are ordinal bands (week columns × weekday rows); square-ish
        // cells read as a calendar rather than a stretched grid.
        axisFlags: { x: { banded: true }, y: { banded: true } },
    }),
    instantiate: (spec, ctx) => {
        const dateField = ctx.channelSemantics.x?.field;
        const valueField = ctx.channelSemantics.color?.field;
        if (!dateField) return;
        // A calendar ends mid-week as often as not, and a frame around the plot
        // draws a box around the days the last week does not have. The cells
        // are the grid.
        spec._hideViewStroke = true;
        const weekDomain = calendarWeekDomain(ctx.table, dateField);
        spec.data = {
            values: ctx.table.map(row => ({
                ...row,
                [DATE_FIELD]: calendarDate(row?.[dateField])?.getTime() ?? null,
            })),
        };

        const date = `toDate(datum[${JSON.stringify(DATE_FIELD)}])`;
        const utcWeek = `utc(utcyear(${date}),utcmonth(${date}),utcdate(${date})-((utcday(${date})+6)%7))`;
        spec.transform = [
            ...(spec.transform ?? []),
            { calculate: utcWeek, as: WEEK_FIELD },
            {
                calculate: `['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][utcday(${date})]`,
                as: WEEKDAY_FIELD,
            },
            ...(!valueField ? [{ calculate: '1', as: COUNT_FIELD }] : []),
        ];

        const encScheme = ctx.encodings?.color?.scheme;
        const scheme = encScheme && encScheme !== 'default' ? encScheme : 'viridis';
        const cornerRadius = ctx.chartProperties?.cornerRadius;
        if (typeof cornerRadius === 'number') {
            spec.mark = { ...(typeof spec.mark === 'object' ? spec.mark : { type: 'rect' }), cornerRadius };
        }
        const colorScale =
            scheme === 'github'
                // Quantile scale snaps counts into the 5 canonical GitHub buckets
                // (equal-count bins → discrete levels), rather than a smooth ramp.
                ? { type: 'quantile' as const, range: GITHUB_RANGE }
                : { scheme: VL_SCHEMES.has(scheme) ? scheme : 'viridis' };

        spec.encoding = {
            // One ordinal column per calendar week; month initials label the axis.
            x: {
                field: WEEK_FIELD,
                type: 'ordinal',
                title: null,
                ...(weekDomain ? { scale: { domain: weekDomain } } : {}),
                axis: {
                    // `yearweek` has one tick per week. Print the month only
                    // on its first weekly boundary instead of repeating "Jan"
                    // under every January column.
                    labelExpr: "utcdate(datum.value) <= 7 ? utcFormat(datum.value, '%b') : ''",
                    labelAngle: 0,
                    labelOverlap: false,
                    tickBand: 'extent',
                    domain: false,
                    ticks: false,
                },
            },
            // Sun–Sat rows, Monday-first to match the ECharts calendar.
            y: {
                field: WEEKDAY_FIELD,
                type: 'ordinal',
                title: null,
                sort: WEEKDAY_ORDER,
                axis: { domain: false, ticks: false },
            },
            // Sum collapses multiple rows sharing a calendar day into one cell.
            color: {
                ...(valueField
                    ? { field: valueField, aggregate: 'sum' }
                    : { field: COUNT_FIELD, aggregate: 'sum' }),
                type: 'quantitative',
                legend: { title: null },
                scale: colorScale,
            },
        };
    },
    encodingActions: [
        {
            key: 'colorScheme',
            label: 'Scheme',
            isApplicable: (ctx) => !!ctx.encodings.color?.field,
            dependencies: ['color'],
            control: {
                type: 'discrete',
                options: [
                    { value: undefined, label: 'Default (Viridis)' },
                    { value: 'viridis', label: 'Viridis' },
                    { value: 'github', label: 'GitHub' },
                    { value: 'blues', label: 'Blues' },
                    { value: 'greens', label: 'Greens' },
                    { value: 'reds', label: 'Reds' },
                    { value: 'oranges', label: 'Oranges' },
                    { value: 'purples', label: 'Purples' },
                ],
            },
            get: (enc) => enc.color?.scheme,
            set: (enc, value) => ({ ...enc, color: { ...enc.color, scheme: value } }),
        },
    ] as EncodingActionDef[],
    properties: [
        { key: 'cornerRadius', label: 'Corners', type: 'continuous', min: 0, max: 8, step: 1, defaultValue: 2 },
    ] as ChartPropertyDef[],
};
