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

import { ChartTemplateDef, ChartPropertyDef, PlotPlanContext, type ViewPlanContext } from '../../core/types';
import { gapOf, type ViewNode } from '../../core/views';
import { skeletonStructure } from '../../core/structure';
import { resolveSeriesTarget } from '../../core/interaction-semantics';
import {
    categoryValueAnnotationText,
    presentAnnotationUpdate,
} from '../../interactive/presentation/annotation';
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

/** The highest point of a Gaussian kernel density over the values, at its normal-reference bandwidth. */
function peakDensity(values: number[]): number {
    const n = values.length;
    const bw = bandwidthNRD(values);
    if (n < 2 || !(bw > 0)) return 0;
    let lo = Infinity;
    let hi = -Infinity;
    for (const v of values) { if (v < lo) lo = v; if (v > hi) hi = v; }
    const norm = n * bw * Math.sqrt(2 * Math.PI);
    let peak = 0;
    for (let i = 0; i <= 64; i++) {
        const x = lo + ((hi - lo) * i) / 64;
        let sum = 0;
        for (const v of values) { const z = (x - v) / bw; sum += Math.exp(-0.5 * z * z); }
        if (sum / norm > peak) peak = sum / norm;
    }
    return peak;
}

/** Below this share of the widest violin's peak, a violin drawn to equal area is too thin to read. */
const THIN_VIOLIN = 0.25;

/**
 * Whether the violins are drawn to equal area — one width scale for all, so a wide one is a common
 * value range — or each to the width of its own band. Equal area keeps widths comparable, until a
 * group spread far wider than the rest is drawn as a hairline whose shape cannot be read: then
 * each fills its band, and the shapes, not their widths, are compared. The author's choice holds.
 */
export function violinWidths(table: any[], measure: string, groupby: string[], asked?: unknown): 'area' | 'band' {
    if (asked === 'area' || asked === 'band') return asked;
    const groups = new Map<string, number[]>();
    for (const row of table) {
        const v = row?.[measure];
        if (typeof v !== 'number' || !Number.isFinite(v)) continue;
        const key = groupby.map((f) => String(row[f])).join('\u0000');
        let arr = groups.get(key);
        if (!arr) { arr = []; groups.set(key, arr); }
        arr.push(v);
    }
    const peaks = [...groups.values()].map(peakDensity).filter((peak) => peak > 0);
    if (peaks.length < 2) return 'area';
    return Math.min(...peaks) / Math.max(...peaks) < THIN_VIOLIN ? 'band' : 'area';
}

/**
 * How a violin chart lays out its per-category panels, and the size of one panel.
 *
 * A genuine colour sub-group cannot dodge full shapes inside one panel, so it is laid out by
 * count: 2 sub-groups split each violin; 3 or more get a category × sub-group grid. Otherwise
 * the categories sit in one row, wrapping only when the row would get too cramped.
 */
/**
 * Whether a colour field splits each category into three or more sub-groups that share a band,
 * which the violin lays out as a grid of panels, one row per sub-group.
 */
function subgroupGrid(table: any[], catField: string, colorField: string | undefined, rowField: string | undefined): { useGrid: boolean; subgroupCount: number } {
    const genuineSubgroup = !!colorField && colorField !== catField && !rowField
        && planBandDodge(table, catField, colorField).maxPerBand > 1;
    const subgroupCount = genuineSubgroup ? new Set(table.map((r: any) => String(r[colorField!]))).size : 0;
    return { useGrid: genuineSubgroup && subgroupCount >= 3, subgroupCount };
}

function violinGrid(
    ctx: PlotPlanContext,
    catField: string,
    colorField: string | undefined,
    rowField: string | undefined,
): { useGrid: boolean; columns: number; panel: { width: number; height: number } } {
    const { useGrid, subgroupCount } = subgroupGrid(ctx.table, catField, colorField, rowField);

    const catCount = Math.max(1, distinctValues(ctx.table, catField).length);
    const canvasW = ctx.canvasSize?.width ?? 560;
    const canvasH = ctx.canvasSize?.height ?? 360;
    const spacing = 0;
    const reservedW = 60;   // value axis + its title
    const reservedH = 70;   // facet headers + breathing room
    const minPanelW = 44;

    if (useGrid) {
        const panelW = Math.max(minPanelW, Math.min(Math.round((canvasW - reservedW) / catCount), 220));
        const panelH = Math.max(70, Math.round((canvasH - reservedH) / subgroupCount) - 10);
        return { useGrid, columns: catCount, panel: { width: panelW, height: panelH } };
    }
    const maxPerRow = Math.max(1, Math.floor((canvasW - reservedW) / (minPanelW + spacing)));
    const columns = Math.min(catCount, maxPerRow);
    const gridRows = Math.ceil(catCount / columns);
    const panelW = Math.max(minPanelW, Math.min(Math.round((canvasW - reservedW - (columns - 1) * spacing) / columns), 220));
    const panelH = Math.max(120, Math.round((canvasH - reservedH) / gridRows) - (gridRows > 1 ? 24 : 0));
    return { useGrid, columns, panel: { width: panelW, height: panelH } };
}

/**
 * A violin's panels: one per category, wrapped into rows the plan's facet gap apart, or crossed
 * with the sub-groups (or an outer row field) into a grid of touching columns and rows the facet
 * gap apart.
 */
function violinViews(ctx: ViewPlanContext): ViewNode | undefined {
    const catField = ctx.channelSemantics.x?.field;
    if (!catField || !ctx.channelSemantics.y?.field) return undefined;
    const colorField = ctx.channelSemantics.color?.field;
    const rowField = ctx.channelSemantics.row?.field;
    const { useGrid, columns } = violinGrid(ctx, catField, colorField, rowField);
    const panel: ViewNode = { kind: 'view', role: 'plot', width: ctx.plot.width, height: ctx.plot.height };
    const categories = Math.max(1, distinctValues(ctx.table, catField).length);
    const gap = gapOf(ctx.spacing, 0);
    const crossed = useGrid ? colorField : rowField;
    if (crossed) {
        // Columns of a grid share each row's ruler, so they touch and its grid lines run unbroken.
        const rows = Math.max(1, distinctValues(ctx.table, crossed).length);
        const row = useGrid ? gap.row + ctx.rulerOverhang : gap.row;
        return { kind: 'facet', columns: categories, rows, panels: categories * rows, gap: { row, column: 0 }, panel };
    }
    return { kind: 'facet', columns, rows: Math.ceil(categories / columns), panels: categories, gap, panel };
}

export const violinPlotDef: ChartTemplateDef = {
    planViews: violinViews,
    planPlot: (ctx) => {
        const catField = ctx.channelSemantics.x?.field;
        if (!catField || !ctx.channelSemantics.y?.field) return undefined;
        return violinGrid(ctx, catField, ctx.channelSemantics.color?.field, ctx.channelSemantics.row?.field).panel;
    },
    chart: 'Violin Plot',
    composite: true,
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
    interactionSupport: {
        elements: true,
        region: ['cartesian'],
        legend: true,
        discreteAxis: true,
    },
    markCognitiveChannel: 'area',
    semanticInteractions: ({ resolvedEncodings }) => {
        const categoryField = resolvedEncodings.x?.field;
        const measureField = resolvedEncodings.y?.field;
        const colorField = resolvedEncodings.color?.field;
        const rowField = resolvedEncodings.row?.field;
        const seriesField = colorField ?? categoryField;
        return {
            fields: [...new Set([categoryField, colorField, rowField]
                .filter((field): field is string => !!field))],
            categoryField,
            seriesField,
            legendFields: colorField ? { color: colorField } : undefined,
            selectableMarks: ['area'],
            renderHoverStyles: { area: { opacity: 'spotlight' } },
            resolve: (event, context) => resolveSeriesTarget(event, context, seriesField),
            presentUpdate: presentAnnotationUpdate(
                () => ({ connection: 'segment-midpoint', maxWidth: 120 }),
                categoryValueAnnotationText(categoryField, measureField),
            ),
        };
    },
    declareLayoutMode: (cs, table) => {
        // The category lives on `x`; force it discrete (boxplot-style) so a
        // numeric/temporal category still resolves to clean bands/panels.
        if (!cs.x?.field || !cs.y?.field) return {};
        const result = detectBandedAxisForceDiscrete(cs, table, { preferAxis: 'x' });
        if (!result) return {};
        return { resolvedTypes: result.resolvedTypes };
    },
    structure: (ctx) => {
        // Each category's shape is the density of the measure, centred on itself; colour tells the
        // categories (or the colour field) apart. Drawing the evidence over it mirrors the shape by hand.
        const skeleton = skeletonStructure(violinPlotDef.template, ctx);
        const { x, y, color } = ctx.channelSemantics;
        if (!x?.field || !y?.field) return skeleton;
        const xType = ctx.resolvedTypes?.x ?? x.type;
        const config = ctx.chartProperties;
        const extras = [
            ...(config?.showContour === true ? ['line'] : []),
            ...(config?.showPoints === true ? ['point'] : []),
            ...(config?.showMedian === true ? ['rule'] : []),
        ];
        // The same grouping the density transform uses: the category, then any row and colour field.
        const row = ctx.channelSemantics.row?.field;
        const groupby = [x.field, ...(row && row !== x.field ? [row] : []), ...(color?.field && color.field !== x.field && color.field !== row ? [color.field] : [])];
        // Violins that each fill their band fit each panel's scale to its own shape, not to zero.
        const band = violinWidths(ctx.table, y.field, groupby, config?.widths) === 'band';
        return {
            marks: ['area', ...extras],
            x: { type: 'quantitative', fields: [y.field], derived: 'density', rounded: true, ...(band ? { baseline: 'data' } : {}) },
            y: { type: 'quantitative', fields: [y.field], ...(config?.showPoints === true || config?.showMedian === true ? { baseline: 'data' } : {}) },
            series: color?.field ? { field: color.field, type: color.type }
                : { field: x.field, type: xType === 'nominal' || xType === 'ordinal' ? xType : 'nominal' },
            // Panel headers name the categories, and a grid's row headers its sub-groups; only a
            // colour that splits panels by something else gets a key.
            keys: color?.field && color.field !== x.field && !subgroupGrid(ctx.table, x.field, color.field, ctx.channelSemantics.row?.field).useGrid
                ? [{ channel: 'color', field: color.field, ...(color.type ? { type: color.type } : {}) }] : [],
            stacking: extras.length ? 'none' : 'centered',
        };
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

        // --- Per-category panels: a 2-D grid for 3+ sub-groups, else a wrapped row ---
        const { useGrid, columns, panel } = violinGrid(ctx, catField, colorField, rowField);
        const panelW = ctx.plot?.width ?? panel.width;
        const panelH = ctx.plot?.height ?? panel.height;
        const facetDef: any = {
            field: catField,
            type: catType,
            ...(x?.sort !== undefined ? { sort: x.sort } : {}),
            header: { titleOrient: 'bottom', labelOrient: 'bottom', labelPadding: 2 },
        };

        if (useGrid) {
            // 2-D grid: category across columns, sub-group down rows. Each cell is
            // one clean full violin; the row headers label the sub-group, so the
            // colour legend is redundant.
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

        // --- Widths: one scale for all, or each its own band (see violinWidths) ---
        if (violinWidths(ctx.table, measureField, groupby, config?.widths) === 'band') {
            spec.resolve = { ...(spec.resolve ?? {}), scale: { ...(spec.resolve?.scale ?? {}), x: 'independent' } };
            // A centre stack centres every shape on half the widest density of all the panels, so a
            // scale that keeps zero still spans that width: each panel's scale is fitted to its own
            // shape instead.
            spec.encoding.x = { ...spec.encoding.x, scale: { ...(spec.encoding.x?.scale ?? {}), zero: false } };
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
            key: 'widths', label: 'Widths', type: 'discrete',
            options: [
                { value: 'auto', label: 'Auto' },
                { value: 'area', label: 'Equal area' },
                { value: 'band', label: 'Fill band' },
            ],
            // `auto` draws equal areas unless a violin would be too thin to read (see violinWidths).
            defaultValue: 'auto',
        },
        {
            key: 'medianWidth', label: 'Median width', type: 'continuous',
            min: 0.2, max: 1, step: 0.05, defaultValue: 0.6,
            check: (ctx: any) => ({ applicable: ctx.chartProperties?.showMedian === true }),
        },
    ] as ChartPropertyDef[],
};
