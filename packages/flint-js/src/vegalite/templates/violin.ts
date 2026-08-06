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
import { planBandDodge } from '../../core/band-dodge';

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
        const colorType = (color?.type as string) || 'nominal';
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

        // --- Grouped sub-distributions (a genuine colour sub-group) ---
        // A violin cannot dodge full shapes side-by-side inside one panel — the
        // KDE owns the continuous axis and VL drops an `xOffset` on a continuous
        // x. So a genuine sub-group is laid out by count:
        //   • 2 sub-groups  → SPLIT violin (the `stack:'center'` mirror below
        //     seats one sub-group on each half — the standard split violin).
        //   • ≥3 sub-groups → a per-(category × sub-group) small-multiples GRID
        //     so every sub-group keeps its own independent, un-stacked shape (a
        //     3-way centre stack misreads each layer's width).
        // `planBandDodge` gates this so a redundant/1:1 colour (maxPerBand ≤ 1)
        // stays a plain one-violin-per-category chart rather than dodging.
        const genuineSubgroup =
            !!colorField && colorField !== catField && !rowField &&
            planBandDodge(ctx.table, catField, colorField).maxPerBand > 1;
        const subgroupCount = genuineSubgroup
            ? new Set(ctx.table.map((r: any) => String(r[colorField]))).size
            : 0;
        const useGrid = genuineSubgroup && subgroupCount >= 3;

        // --- Per-category panels ---
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

        const facetDef: any = {
            field: catField,
            type: catType,
            ...(x?.sort !== undefined ? { sort: x.sort } : {}),
            spacing,
            header: { titleOrient: 'bottom', labelOrient: 'bottom', labelPadding: 2 },
        };

        if (useGrid) {
            // 2-D grid: category across columns, sub-group down rows. Each cell is
            // one clean full violin; the row headers label the sub-group, so the
            // colour legend is redundant.
            let panelW = Math.round((canvasW - reservedW) / catCount);
            panelW = Math.max(minPanelW, Math.min(panelW, 220));
            const panelH = Math.max(70, Math.round((canvasH - reservedH) / subgroupCount) - 10);
            spec.encoding.column = facetDef;
            spec.encoding.row = {
                field: colorField,
                type: colorType,
                ...(color?.sort !== undefined ? { sort: color.sort } : {}),
                header: { labelAngle: 0 },
            };
            if (spec.encoding.color) spec.encoding.color.legend = null;
            spec.width = panelW;
            spec.height = panelH;
        } else {
            const maxPerRow = Math.max(1, Math.floor((canvasW - reservedW) / (minPanelW + spacing)));
            const columns = Math.min(catCount, maxPerRow);
            const gridRows = Math.ceil(catCount / columns);
            let panelW = Math.round((canvasW - reservedW - (columns - 1) * spacing) / columns);
            panelW = Math.max(minPanelW, Math.min(panelW, 220));
            const panelH = Math.max(120, Math.round((canvasH - reservedH) / gridRows) - (gridRows > 1 ? 24 : 0));

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
        }

        // --- What the smoothing hides ------------------------------------
        // A kernel density is an *inference*: it draws a curve where there
        // were points, and with twelve birds per species the curve says more
        // than the sample can support. Houses that publish distributions in
        // print answer that by drawing the evidence next to the estimate —
        // every observation, and the one summary the eye cannot read off a
        // smooth shape, the median.
        const wantPoints = config?.showPoints === true;
        const wantMedian = config?.showMedian === true;
        // A density estimate has an edge, and whether that edge is drawn is a
        // real choice: a wash with no contour reads as a cloud, a contour reads
        // as a measured shape. Houses that print distributions draw the line.
        const wantContour = config?.showContour === true;
        const medianWidth = typeof config?.medianWidth === 'number' && config.medianWidth > 0
            ? Math.min(1, config.medianWidth)
            : 0.6;
        if (wantPoints || wantMedian || wantContour) {
            // A centre stack does not centre on zero — it centres every shape
            // on half the widest density in the panel set, so zero sits at the
            // left edge and anything drawn at zero misses the violin. The
            // mirror is therefore cut by hand, half the density either side of
            // zero, which puts the centre line where the jitter expects it.
            const baseX = { ...(spec.encoding.x || {}) };
            delete baseX.stack;
            delete baseX.impute;
            delete baseX.field;
            const layers: any[] = [{
                transform: [
                    ...(spec.transform || []),
                    { calculate: 'datum.density / 2', as: '__violinHalf' },
                    { calculate: '-datum.density / 2', as: '__violinNegHalf' },
                ],
                // A solid shape drawn over the evidence hides it: the estimate
                // steps back to a wash so the observations read through it.
                mark: wantPoints
                    ? { ...(typeof spec.mark === 'string' ? { type: spec.mark } : spec.mark), fillOpacity: 0.35 }
                    : spec.mark,
                encoding: {
                    y: spec.encoding.y,
                    x: { ...baseX, field: '__violinHalf', type: 'quantitative', stack: null },
                    x2: { field: '__violinNegHalf' },
                },
            }];
            if (wantContour) {
                // An area mark fills a shape; it does not draw one, and its
                // `line` overlay follows only the leading edge — half a
                // silhouette on a mirrored density. So the contour is two
                // lines, one down each side, both riding the same colour scale
                // as the wash they enclose. `point: false` is not decoration:
                // a house that puts a dot on every line vertex would otherwise
                // bead two hundred kernel samples along the outline.
                for (const edge of ['__violinHalf', '__violinNegHalf']) {
                    layers.push({
                        transform: [
                            ...(spec.transform || []),
                            { calculate: 'datum.density / 2', as: '__violinHalf' },
                            { calculate: '-datum.density / 2', as: '__violinNegHalf' },
                        ],
                        mark: {
                            type: 'line', orient: 'horizontal', strokeWidth: 1,
                            opacity: 0.9, point: false,
                        },
                        encoding: {
                            y: spec.encoding.y,
                            x: { ...baseX, field: edge, type: 'quantitative', stack: null },
                        },
                    });
                }
            }
            if (wantPoints) {
                // A normal kernel peaks at ~0.4 / bandwidth, and the mirror
                // seats half of that on each side of the centre line, so a
                // quarter of the peak is a strip of jitter that stays well
                // inside the shape it belongs to — and it is measured in the
                // same density units, so it rides the violin's own scale.
                const peak = effectiveBw > 0 ? 0.4 / effectiveBw : 0;
                const jitter = peak * 0.25;
                layers.push({
                    transform: [{
                        calculate: jitter > 0 ? `(random() - 0.5) * ${jitter}` : '0',
                        as: '__violinJitter',
                    }],
                    mark: { type: 'point', filled: true, size: 16, opacity: 0.9 },
                    encoding: {
                        y: {
                            field: measureField, type: 'quantitative', title: measureField,
                            // The violin is a window on the distribution, not a
                            // length measured from nothing — a point mark would
                            // otherwise drag the axis down to zero.
                            scale: { zero: false },
                        },
                        x: {
                            field: '__violinJitter', type: 'quantitative', title: null,
                            axis: null, stack: null,
                        },
                    },
                });
            }
            if (wantMedian) {
                // A rule drawn the full width of the panel is not a summary of
                // *this* shape, it is a line across the page that happens to
                // pass through the median. The mirror puts the widest a violin
                // can ever get at half the kernel peak, so the rule is cut to a
                // fraction of that — the same width in every panel, always
                // inside the widest shape, and visibly a mark on the violin
                // rather than a graticule behind it.
                const peakHalf = effectiveBw > 0 ? (0.4 / effectiveBw) / 2 : 0;
                const half = peakHalf * medianWidth;
                layers.push({
                    transform: [{
                        aggregate: [{ op: 'median', field: measureField, as: '__violinMedian' }],
                        groupby,
                    }],
                    mark: { type: 'rule', strokeWidth: 1.5 },
                    encoding: {
                        y: {
                            field: '__violinMedian', type: 'quantitative', title: measureField,
                            scale: { zero: false },
                        },
                        ...(half > 0
                            ? { x: { datum: -half, type: 'quantitative' }, x2: { datum: half } }
                            : {}),
                    },
                });
            }
            // Vega-Lite ignores a facet *channel* on a layered spec, so the
            // per-category panels move to the facet operator: the panels wrap
            // the layers instead of sitting beside them.
            const enc = spec.encoding;
            const wrap = enc.facet;
            const shared = { ...enc };
            delete shared.facet;
            delete shared.column;
            delete shared.row;
            // Position belongs to each layer — a shared x would push its stack
            // onto the observations and its field onto the median rule.
            delete shared.x;
            delete shared.y;
            const inner: any = { layer: layers, encoding: shared };
            if (spec.width != null) inner.width = spec.width;
            if (spec.height != null) inner.height = spec.height;
            if (wrap) {
                const { columns, ...def } = wrap;
                spec.facet = def;
                if (columns != null) spec.columns = columns;
            } else {
                spec.facet = {
                    ...(enc.column ? { column: enc.column } : {}),
                    ...(enc.row ? { row: enc.row } : {}),
                };
            }
            spec.spec = inner;
            delete spec.mark;
            delete spec.transform;
            delete spec.encoding;
            delete spec.width;
            delete spec.height;
        }
    },
    properties: [
        { key: 'bandwidth', label: 'Bandwidth', type: 'continuous', min: 0.05, max: 2, step: 0.05, defaultValue: 0 },
        { key: 'showPoints', label: 'Observations', type: 'binary', defaultValue: false },
        { key: 'showMedian', label: 'Median rule', type: 'binary', defaultValue: false },
        { key: 'showContour', label: 'Contour', type: 'binary', defaultValue: false },
        {
            key: 'medianWidth', label: 'Median width', type: 'continuous',
            min: 0.2, max: 1, step: 0.05, defaultValue: 0.6,
            check: (ctx: any) => ({ applicable: ctx.chartProperties?.showMedian === true }),
        },
    ] as ChartPropertyDef[],
};
