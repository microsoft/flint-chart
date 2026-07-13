// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Vega-Lite Violin Plot template.
 *
 * A violin plot shows the **full smoothed distribution shape** of a quantitative
 * measure, one mirrored kernel-density curve per category. It is the
 * density-plot cousin of the Boxplot: where the boxplot draws quartiles, the
 * violin draws the whole KDE, symmetric about a center line so the *width*
 * encodes how many observations fall near each value. The read is the density
 * area/width (bimodality, skew, spread), not a position — hence the 'area'
 * cognitive channel (mirrors density.ts).
 *
 * Contract (mirrors Boxplot's channel mapping):
 *   x      — the category (discrete grouping). One violin per x value.
 *   y      — the quantitative measure whose distribution is drawn (the shared
 *            continuous "value" axis).
 *   color  — optional; defaults to the category so each violin gets its own hue.
 *   row    — optional OUTER facet (small multiples of the whole violin panel).
 *
 * Vega-Lite native idiom (no plugins): VL's `density` transform per category
 * plus a mirrored area (`x = density, stack: "center"`). The canonical VL violin
 * places each category in its own **column facet** with the measure on `y` and
 * the mirrored density on `x`. This template therefore CONSUMES the column-facet
 * slot for the per-category panels (the category supplied on `x` is moved into a
 * VL column/wrap facet). `column` is consequently NOT a user-available channel —
 * an additional outer facet is offered through `row` only. The measure stays on
 * the shared `y` (value) axis so all violins are directly comparable.
 *
 * Reuses density.ts's bandwidth wiring and the boxplot's discrete-axis handling.
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { detectBandedAxisForceDiscrete } from '../../core/axis-detection';

const isDiscrete = (t: string | undefined) => t === 'nominal' || t === 'ordinal';

/** Distinct non-null values of a field, in data-encounter order. */
function distinctValues(table: any[], field: string): any[] {
    const seen = new Set<string>();
    const out: any[] = [];
    for (const row of table) {
        const v = row[field];
        if (v == null) continue;
        const key = String(v);
        if (!seen.has(key)) { seen.add(key); out.push(v); }
    }
    return out;
}

/** [min, max] of a numeric field across the table (ignoring non-numbers). */
function numericExtent(table: any[], field: string): [number, number] | null {
    let min = Infinity, max = -Infinity;
    for (const row of table) {
        const v = row[field];
        if (typeof v !== 'number' || !isFinite(v)) continue;
        if (v < min) min = v;
        if (v > max) max = v;
    }
    if (min === Infinity || max === -Infinity) return null;
    if (min === max) { min -= 0.5; max += 0.5; }
    return [min, max];
}

/** Linear-interpolated quantile of an already-sorted ascending array. */
function quantileSorted(sorted: number[], p: number): number {
    const n = sorted.length;
    if (n === 0) return NaN;
    const idx = (n - 1) * p;
    const lo = Math.floor(idx), hi = Math.ceil(idx);
    if (lo === hi) return sorted[lo];
    return sorted[lo] + (sorted[hi] - sorted[lo]) * (idx - lo);
}

/** Sample standard deviation (n-1) of a numeric array. */
function stdev(values: number[]): number {
    const n = values.length;
    if (n < 2) return 0;
    const mean = values.reduce((s, x) => s + x, 0) / n;
    const v = values.reduce((s, x) => s + (x - mean) * (x - mean), 0) / (n - 1);
    return Math.sqrt(v);
}

/**
 * Normal-reference (Scott/Silverman) KDE bandwidth — the same rule Vega's
 * `density` transform uses when no bandwidth is given. Lets us pad the shared
 * density `extent` by a multiple of the *actual* kernel width so every violin
 * tapers to ~zero at its ends instead of being clipped flat (see instantiate).
 */
function bandwidthNRD(values: number[]): number {
    const n = values.length;
    if (n < 2) return 0;
    const s = [...values].sort((a, b) => a - b);
    const lo = quantileSorted(s, 0.25);
    const hi = quantileSorted(s, 0.75);
    const sd = stdev(s);
    let h = Math.min(sd, (hi - lo) / 1.34);
    if (!(h > 0)) h = sd || Math.abs(lo) || 1;
    return 1.06 * h * Math.pow(n, -0.2);
}

/**
 * Largest per-group KDE bandwidth across the groups Vega will form (one per
 * distinct `groupby` tuple). Vega computes the auto bandwidth per group, so the
 * widest-spread group dictates how far the shared extent must reach to taper.
 */
function maxGroupBandwidth(table: any[], measure: string, groupby: string[]): number {
    const groups = new Map<string, number[]>();
    for (const row of table) {
        const v = row[measure];
        if (typeof v !== 'number' || !isFinite(v)) continue;
        const key = groupby.map((f) => String(row[f])).join('\u0000');
        let arr = groups.get(key);
        if (!arr) { arr = []; groups.set(key, arr); }
        arr.push(v);
    }
    let max = 0;
    for (const arr of groups.values()) {
        const bw = bandwidthNRD(arr);
        if (bw > max) max = bw;
    }
    return max;
}

export const violinPlotDef: ChartTemplateDef = {
    chart: 'Violin Plot',
    template: {
        mark: { type: 'area', orient: 'horizontal' },
        transform: [{ density: '__measure__', groupby: [], as: ['value', 'density'] }],
        encoding: {
            // Measure → shared continuous value axis (vertical).
            y: { field: 'value', type: 'quantitative' },
            // Mirrored kernel density → horizontal width, centered (the violin).
            x: {
                field: 'density', type: 'quantitative', stack: 'center',
                impute: null, title: null,
                axis: { labels: false, ticks: false, grid: false },
            },
        },
    },
    // `column` is consumed internally for the per-category panels; only `row`
    // is exposed as an additional outer facet.
    channels: ['x', 'y', 'color', 'row'],
    markCognitiveChannel: 'area',
    declareLayoutMode: (cs, table) => {
        // The category lives on `x`; force it discrete (boxplot-style) so a
        // numeric/temporal category still resolves to clean bands/panels.
        if (!cs.x?.field || !cs.y?.field) return {};
        const result = detectBandedAxisForceDiscrete(cs, table, { preferAxis: 'x' });
        if (!result) return {};
        return { resolvedTypes: result.resolvedTypes };
    },
    instantiate: (spec, ctx) => {
        const { x, y, color, row } = ctx.resolvedEncodings;
        const catField = x?.field;
        const measureField = y?.field;
        if (!catField || !measureField) return;

        // --- Density transform (per category, retaining every facet field) ---
        // The density transform only keeps its `groupby` fields on the output
        // rows, so EVERY field used for faceting/coloring must be grouped — else
        // VL drops it (an outer row facet would collapse to "undefined").
        const colorField = color?.field;
        const rowField = row?.field;
        const groupby = [catField];
        if (rowField && rowField !== catField) groupby.push(rowField);
        if (colorField && colorField !== catField && colorField !== rowField) groupby.push(colorField);
        spec.transform[0].density = measureField;
        spec.transform[0].groupby = groupby;

        // --- Bandwidth (mirrors density.ts) ---
        // `bandwidth` is a *relative* smoothing multiplier (1 ≈ the data-derived
        // default per group), NOT an absolute width in data units — an absolute
        // 0.05 bandwidth would be invisible on a measure that spans thousands.
        // Scale the widest per-group normal-reference base by the slider so it
        // reads consistently across measures of any scale and matches density.ts.
        // 0 / unset leaves Vega to pick its own (auto) bandwidth per group.
        // Resolve the effective bandwidth FIRST so the extent padding below can
        // match the actual kernel width Vega will use.
        const config = ctx.chartProperties;
        const baseBandwidth = maxGroupBandwidth(ctx.table, measureField, groupby);
        const bwMultiplier = config?.bandwidth && config.bandwidth > 0 ? config.bandwidth : 0;
        const effectiveBw = bwMultiplier > 0 ? baseBandwidth * bwMultiplier : baseBandwidth;
        if (bwMultiplier > 0 && baseBandwidth > 0) {
            spec.transform[0].bandwidth = effectiveBw;
        }

        // Evaluate every violin over the SAME measure range so they share the
        // value axis and stay directly comparable. The shared `extent` is what
        // Vega clips the KDE to, so it must reach far enough past the data that
        // the kernel tails decay to ~zero — otherwise the widest-spread group
        // (whose data fills the extent) ends in a flat clipped slab instead of a
        // tapered point. Pad by ~1.5 bandwidths past the data on each side
        // (seaborn-style "cut"), using the effective kernel width Vega will use.
        const extent = numericExtent(ctx.table, measureField);
        if (extent) {
            const range = extent[1] - extent[0];
            const pad = Math.max(range * 0.05, 1.5 * effectiveBw, 1e-6);
            spec.transform[0].extent = [extent[0] - pad, extent[1] + pad];
        }

        // --- Value axis (the measure) ---
        spec.encoding.y.title = measureField;

        // --- Color: default to the category so each violin has its own hue ---
        const catType = isDiscrete(x?.type) ? x.type : 'nominal';
        if (colorField) {
            spec.encoding.color = { ...color };
        } else {
            spec.encoding.color = { field: catField, type: catType };
        }
        // The facet headers already label each category, so the color legend is
        // redundant when color mirrors the category.
        if (!colorField || colorField === catField) {
            spec.encoding.color.legend = null;
        }

        // --- Per-category panels: the category occupies the column/wrap facet ---
        const cats = distinctValues(ctx.table, catField);
        const catCount = Math.max(1, cats.length);

        // Size each violin panel from the canvas + category count (single row,
        // wrapping only when the row would get too cramped).
        const canvasW = ctx.canvasSize?.width ?? 560;
        const canvasH = ctx.canvasSize?.height ?? 360;
        const spacing = 0;
        const reservedW = 60;   // value axis + its title
        const reservedH = 70;   // facet headers + breathing room
        const minPanelW = 44;
        const maxPerRow = Math.max(1, Math.floor((canvasW - reservedW) / (minPanelW + spacing)));
        const columns = Math.min(catCount, maxPerRow);
        const rows = Math.ceil(catCount / columns);
        let panelW = Math.round((canvasW - reservedW - (columns - 1) * spacing) / columns);
        panelW = Math.max(minPanelW, Math.min(panelW, 220));
        const panelH = Math.max(120, Math.round((canvasH - reservedH) / rows) - (rows > 1 ? 24 : 0));

        const facetDef: any = {
            field: catField,
            type: catType,
            ...(x?.sort !== undefined ? { sort: x.sort } : {}),
            spacing,
            header: { titleOrient: 'bottom', labelOrient: 'bottom', labelPadding: 2 },
        };

        if (row) {
            // An additional OUTER facet → 2-D grid: category in columns, the
            // outer field in rows (VL cannot combine a wrap `facet` with `row`).
            // A non-wrap `column` + `row` pair is left intact by restructureFacets.
            spec.encoding.column = facetDef;
            spec.encoding.row = row;
        } else {
            // The per-category panels occupy a wrap facet with an EXPLICIT column
            // count. We set `encoding.facet` directly (not `encoding.column`) so
            // the assembler's restructureFacets leaves the grid untouched — it
            // would otherwise collapse an un-tracked column facet to `columns: 1`.
            spec.encoding.facet = { ...facetDef, columns };
        }

        // Explicit per-panel size (numbers) so vlApplyLayoutToSpec keeps them and
        // the grid is the per-category strip, not a single oversized plot.
        spec.width = panelW;
        spec.height = panelH;
    },
    properties: [
        { key: 'bandwidth', label: 'Bandwidth', type: 'continuous', min: 0.05, max: 2, step: 0.05, defaultValue: 0 },
    ] as ChartPropertyDef[],
};
