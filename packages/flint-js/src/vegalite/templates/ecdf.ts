// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Vega-Lite ECDF Plot (Empirical Cumulative Distribution Function) template.
 *
 * An ECDF plots each distinct value `x` of a quantitative measure against the
 * **proportion of observations ≤ x** — a non-decreasing step that rises from ~0
 * to 1. It is the cumulative cousin of the histogram/density (same distribution
 * family): instead of "how many observations fall in this bucket" the read is
 * "what fraction of the data is below this value", so medians/percentiles can be
 * read directly off the curve. Multiple groups → one monotonic step curve each,
 * for comparing distributions (a right-shifted curve = larger values).
 *
 * Contract (mirrors density.ts — there is NO user `y`; the cumulative
 * proportion is computed on the value axis):
 *   x      — the quantitative measure whose distribution is shown (rises along x).
 *   color  — optional grouping → one ECDF curve per group (legend).
 *   detail — optional grouping → one curve per group WITHOUT a color legend.
 *   column — optional facet (small multiples).
 *   row    — optional facet (small multiples).
 *
 * Vega-Lite native idiom (no plugins, no precompute): window-transform the raw
 * rows. Sort by the measure and compute a running count (the count of rows ≤ the
 * current value), normalize by the per-group total, then draw a `step-after`
 * line of (measure, proportion). The running count + total are grouped by EVERY
 * grouping/facet field so each curve (and each facet panel) normalizes to its
 * own n and ends at 1.0. The value axis is pinned to [0, 1].
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { setMarkProp } from './utils';

const showPointsProperty: ChartPropertyDef = {
    key: 'showPoints', label: 'Points', type: 'binary', defaultValue: false,
};

/**
 * Pick an internal field name that does not collide with any real data column.
 * The window/joinaggregate/calculate transforms write helper columns (running
 * count, group total, the ECDF proportion); if the user's data already has a
 * column of that name we prefix underscores until it is unique.
 */
function uniqueName(base: string, taken: Set<string>): string {
    let name = base;
    while (taken.has(name)) name = `_${name}`;
    return name;
}

export const ecdfPlotDef: ChartTemplateDef = {
    chart: 'ECDF Plot',
    template: {
        mark: { type: 'line', interpolate: 'step-after' },
        transform: [],
        encoding: {},
    },
    channels: ['x', 'color', 'detail', 'column', 'row'],
    markCognitiveChannel: 'position',
    declareLayoutMode: () => ({
        paramOverrides: {
            continuousMarkCrossSection: { x: 100, y: 20, seriesCountAxis: 'auto' },
            facetAspectRatioResistance: 0.5,
        },
    }),
    instantiate: (spec, ctx) => {
        const { x, color, detail, column, row } = ctx.resolvedEncodings;
        const measure = x?.field;
        if (!measure) return;

        // Internal column names that must not clash with real data columns.
        const taken = new Set<string>();
        for (const r of ctx.table ?? []) {
            for (const k of Object.keys(r)) taken.add(k);
        }
        const cntName = uniqueName('__ecdf_count', taken);
        const totalName = uniqueName('__ecdf_total', taken);
        const ecdfName = uniqueName('__ecdf', taken);

        // Group the running count + total by every grouping/facet field so each
        // curve (and each facet panel) is normalized to its own n — otherwise a
        // grouped/faceted ECDF would share one global count and never reach 1.0
        // within a group/panel.
        const groupby: string[] = [];
        const pushGroup = (f?: string) => {
            if (f && f !== measure && !groupby.includes(f)) groupby.push(f);
        };
        pushGroup(color?.field);
        pushGroup(detail?.field);
        pushGroup(column?.field);
        pushGroup(row?.field);

        spec.transform = [
            {
                // Running count of rows ≤ the current value (sorted ascending),
                // i.e. frame [unbounded-preceding, current-row].
                window: [{ op: 'count', field: measure, as: cntName }],
                sort: [{ field: measure, order: 'ascending' }],
                ...(groupby.length ? { groupby } : {}),
                frame: [null, 0],
            },
            {
                // Per-group total (n) → the denominator.
                joinaggregate: [{ op: 'count', field: measure, as: totalName }],
                ...(groupby.length ? { groupby } : {}),
            },
            { calculate: `datum['${cntName}'] / datum['${totalName}']`, as: ecdfName },
        ];

        // The measure on x (quantitative, titled by its field). An ECDF is read
        // by locating percentiles across the data's actual range, so suppress the
        // engine's zero-baseline (which would waste horizontal space on an empty
        // 0→min gap and make VL's x-range inconsistent with the ECharts/Chart.js
        // value axes, which already fit the data).
        spec.encoding.x = {
            ...x,
            type: 'quantitative',
            title: measure,
            scale: { ...((x as { scale?: Record<string, unknown> })?.scale ?? {}), zero: false },
        };
        // The cumulative proportion on y, pinned to [0, 1].
        spec.encoding.y = {
            field: ecdfName,
            type: 'quantitative',
            scale: { domain: [0, 1] },
            title: 'Cumulative proportion',
        };

        if (color?.field) spec.encoding.color = { ...color };
        if (detail?.field) spec.encoding.detail = { ...detail };
        if (column) spec.encoding.column = column;
        if (row) spec.encoding.row = row;

        if (ctx.chartProperties?.showPoints) {
            spec.mark = setMarkProp(spec.mark, 'point', true);
        }
    },
    properties: [showPointsProperty],
};
