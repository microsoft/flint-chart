// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Vega-Lite Calendar Heatmap template.
 *
 * The ECharts backend has a first-class calendar coordinate system; Vega-Lite
 * has none, but it does not need computed week/day fields either — `timeUnit`
 * expresses the GitHub-style grid directly from a single date field:
 *   x  →  timeUnit 'yearweek' (one ordinal column per calendar week)
 *   y  →  timeUnit 'day'      (Sun–Sat, one ordinal row per weekday)
 * so the same date field drives both axes and the sum-per-cell aggregation
 * collapses to one value per calendar day.
 *
 * Encoding:
 *   x     (temporal) → the date of each cell
 *   color (quantitative) → the cell value (defaults to a count of 1)
 */

import { ChartTemplateDef, EncodingActionDef } from '../../core/types';

/** Weekday row order, Monday-first — mirrors the ECharts template's dayLabel.firstDay = 1. */
const WEEKDAY_ORDER = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Sequential schemes. Named Vega-Lite schemes pass through as `scale.scheme`;
 * 'github' has no built-in Vega-Lite equivalent, so it resolves to an explicit
 * `scale.range` (the same low→high ramp the ECharts template uses).
 */
const GITHUB_RANGE = ['#ebedf0', '#9be9a8', '#40c463', '#30a14e', '#216e39'];
const VL_SCHEMES = new Set(['viridis', 'blues', 'greens', 'reds', 'oranges', 'purples']);

export const vlCalendarHeatmapDef: ChartTemplateDef = {
    chart: 'Calendar Heatmap',
    template: { mark: { type: 'rect', cornerRadius: 2 }, encoding: {} },
    channels: ['x', 'color'],
    markCognitiveChannel: 'color',
    declareLayoutMode: () => ({
        // Both axes are ordinal bands (week columns × weekday rows); square-ish
        // cells read as a calendar rather than a stretched grid.
        axisFlags: { x: { banded: true }, y: { banded: true } },
    }),
    instantiate: (spec, ctx) => {
        const dateField = ctx.channelSemantics.x?.field;
        const valueField = ctx.channelSemantics.color?.field;
        if (!dateField) return;

        const encScheme = ctx.encodings?.color?.scheme;
        const scheme = encScheme && encScheme !== 'default' ? encScheme : 'viridis';
        const colorScale =
            scheme === 'github'
                // Quantile scale snaps counts into the 5 canonical GitHub buckets
                // (equal-count bins → discrete levels), rather than a smooth ramp.
                ? { type: 'quantile' as const, range: GITHUB_RANGE }
                : { scheme: VL_SCHEMES.has(scheme) ? scheme : 'viridis' };

        spec.encoding = {
            // One ordinal column per calendar week; month initials label the axis.
            x: {
                field: dateField,
                timeUnit: 'yearweek',
                type: 'ordinal',
                title: null,
                axis: {
                    format: '%b',
                    labelAngle: 0,
                    labelOverlap: true,
                    tickBand: 'extent',
                    domain: false,
                    ticks: false,
                },
            },
            // Sun–Sat rows, Monday-first to match the ECharts calendar.
            y: {
                field: dateField,
                timeUnit: 'day',
                type: 'ordinal',
                title: null,
                sort: WEEKDAY_ORDER,
                axis: { domain: false, ticks: false },
            },
            // Sum collapses multiple rows sharing a calendar day into one cell.
            color: {
                ...(valueField
                    ? { field: valueField, aggregate: 'sum' }
                    : { aggregate: 'count' }),
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
};
