// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { makeCartesianPivot } from '../../core/pivot';

/**
 * Silverman/Scott rule-of-thumb bandwidth, matching vega-statistics' bandwidth.js
 * (and the ECharts density template's `estimateBandwidth`): 1.06 · v · n^(-0.2)
 * with v = min(std, IQR/1.34). Used as the *base* that the user's `bandwidth`
 * property scales, so the slider behaves as a relative smoothing factor instead
 * of an absolute width in data units (a 0.05 absolute bandwidth is invisible
 * smoothing on a 0–100 score scale but enormous on a 0–1 ratio).
 */
function estimateBandwidth(values: number[]): number {
    const n = values.length;
    if (n < 2) return 1;
    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    const d = Math.sqrt(variance); // standard deviation
    const q1 = sorted[Math.floor((n - 1) * 0.25)];
    const q3 = sorted[Math.floor((n - 1) * 0.75)];
    const iqr = (q3 != null && q1 != null) ? q3 - q1 : 0;
    const h = iqr / 1.34;
    const v = Math.min(d, h || d) || d || 1;
    return 1.06 * v * Math.pow(n, -0.2);
}

/**
 * Widest per-group Silverman bandwidth across the groups Vega's density
 * transform will form (one KDE per `groupby` combination). Mirrors the Violin
 * template's `_max_group_bandwidth`: a single shared `bandwidth` must cover the
 * group that needs the most smoothing, and pooling all groups would over-smooth
 * well-separated distributions.
 */
function maxGroupBandwidth(table: any[], field: string, groupby: string[]): number {
    const groups = new Map<string, number[]>();
    for (const row of table) {
        const v = Number(row[field]);
        if (!Number.isFinite(v)) continue;
        const key = groupby.length ? groupby.map(f => String(row[f])).join('\u0000') : '';
        const arr = groups.get(key);
        if (arr) arr.push(v);
        else groups.set(key, [v]);
    }
    let mx = 0;
    for (const arr of groups.values()) {
        const bw = estimateBandwidth(arr);
        if (bw > mx) mx = bw;
    }
    return mx;
}

export const densityPlotDef: ChartTemplateDef = {
    chart: "Density Plot",
    template: {
        mark: "area",
        transform: [{ density: "__field__" }],
        encoding: {
            x: { field: "value", type: "quantitative" },
            y: { field: "density", type: "quantitative" },
        },
    },
    channels: ["x", "color", "column", "row"],
    navigation: { axes: ['x'] },
    markCognitiveChannel: 'area',
    instantiate: (spec, ctx) => {
        const { x, color, column, row } = ctx.resolvedEncodings;
        if (x?.field) {
            spec.transform[0].density = x.field;
            spec.encoding.x.title = x.field;
        }

        // The density transform only emits its `value`/`density` columns plus the
        // fields named in `groupby`. Every field that partitions the chart — the
        // color series AND any column/row facet — must therefore be in `groupby`,
        // otherwise that field vanishes from the transformed data and its
        // encoding silently collapses (e.g. a column facet renders a single
        // "undefined" panel with all sites pooled together).
        const groupby: string[] = [];
        if (color?.field) {
            spec.encoding.color = { ...(spec.encoding.color || {}), ...color };
            groupby.push(color.field);
        }
        if (column) {
            spec.encoding.column = column;
            if (column.field) groupby.push(column.field);
        }
        if (row) {
            spec.encoding.row = row;
            if (row.field) groupby.push(row.field);
        }
        if (groupby.length > 0) {
            spec.transform[0].groupby = groupby;
        }

        const config = ctx.chartProperties;
        // `bandwidth` is a *relative* smoothing multiplier (1 ≈ the data-derived
        // default per group), not an absolute width — see estimateBandwidth above.
        // We scale the widest per-group Silverman base by it so the same slider
        // reads consistently across fields of any scale and matches the ECharts
        // backend and Violin template. 0 / unset leaves Vega to pick its own
        // (auto) bandwidth per group.
        if (config?.bandwidth && config.bandwidth > 0 && x?.field) {
            const base = maxGroupBandwidth(ctx.table, x.field, groupby);
            if (base > 0) spec.transform[0].bandwidth = base * config.bandwidth;
        }
    },
    properties: [
        { key: "bandwidth", label: "Bandwidth", type: "continuous", min: 0.05, max: 2, step: 0.05, defaultValue: 0 },
    ] as ChartPropertyDef[],
    // Mirrors the histogram: a single bound field (x) with a computed density, so
    // only `shift` (series → legend/facets) applies, plus the reciprocal θ edge
    // back to a binned Histogram.
    pivot: makeCartesianPivot({
        shift: ['color', 'column', 'row'],
        // θ (→ Histogram / ECDF) is declared centrally in core/chart-transitions.ts.
    }),
};
