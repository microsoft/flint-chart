// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Shared helper functions for chart template hooks (v2 pipeline).
 * Pure logic — no UI dependencies.
 */

import type { ChannelSemantics, InstantiateContext } from '../../core/types';
import { resolveDiscreteType } from '../../core/axis-detection';

// ---------------------------------------------------------------------------
// Discrete-dimension helpers
// ---------------------------------------------------------------------------

const isDiscrete = (type: string | undefined) => type === "nominal" || type === "ordinal";

/**
 * Check whether a numeric field's values are equally strided (uniform spacing).
 */
export function isEquallyStrided(field: string, table: any[]): boolean {
    const vals = [...new Set(table.map(r => r[field]).filter((v: any) => v != null && typeof v === 'number'))];
    if (vals.length <= 1) return true;
    vals.sort((a, b) => a - b);

    const diffs = [];
    for (let i = 1; i < vals.length; i++) {
        diffs.push(vals[i] - vals[i - 1]);
    }
    const medianDiff = diffs.slice().sort((a, b) => a - b)[Math.floor(diffs.length / 2)];
    if (medianDiff === 0) return false;

    const tolerance = 0.01 * Math.abs(medianDiff);
    return diffs.every(d => Math.abs(d - medianDiff) <= tolerance);
}

/**
 * Convert a single encoding to a discrete VL type in-place.
 */
export function resolveAsDiscrete(
    encodingObj: any,
    table: any[],
): 'nominal' | 'ordinal' {
    if (!encodingObj) return 'nominal';
    const result = resolveDiscreteType(encodingObj.type, encodingObj.field, table);
    encodingObj.type = result;
    return result;
}

/**
 * Default instantiate implementation for simple templates.
 * Maps each resolved encoding channel directly to spec.encoding[channel].
 */
export const defaultBuildEncodings = (spec: any, encodings: Record<string, any>): void => {
    if (!spec.encoding) spec.encoding = {};
    for (const [channel, encodingObj] of Object.entries(encodings)) {
        if (Object.keys(encodingObj).length > 0) {
            const existing = spec.encoding[channel];
            if (existing && typeof existing === 'object') {
                spec.encoding[channel] = { ...existing, ...encodingObj };
            } else {
                spec.encoding[channel] = encodingObj;
            }
        }
    }
};

// ---------------------------------------------------------------------------
// Mark sizing helpers (used by v2 instantiate hooks)
// ---------------------------------------------------------------------------

/**
 * Set a property on a mark object (handles both string and object forms).
 */
export function setMarkProp(mark: any, key: string, value: any): any {
    if (typeof mark === 'string') {
        return { type: mark, [key]: value };
    }
    return { ...mark, [key]: value };
}

/**
 * Marks whose size came from the coarse coverage estimate in
 * `applyPointSizeScaling`, which runs at build time against an assumed plot
 * and the whole table. A theme knows the plot it actually got and how many
 * panels the rows are spread over, so where both have an opinion the theme's
 * is the better-informed one — but only for the marks this rule sized, never
 * for a mark a template fitted to a lane.
 */
export const coverageSizedMarks = new WeakSet<object>();

/**
 * Coverage-based point sizing.
 */
export const applyPointSizeScaling = (
    vgSpec: any,
    table: any[],
    plotWidth: number = 400,
    plotHeight: number = 300,
    targetCoverage: number = 0.15,
    defaultSize: number = 30,
    minSize: number = 4,
): any => {
    if (!table || table.length === 0) return vgSpec;

    const markType = typeof vgSpec.mark === 'string' ? vgSpec.mark : vgSpec.mark?.type;
    if (!['circle', 'point', 'square'].includes(markType)) return vgSpec;

    if (vgSpec.encoding?.size?.field) return vgSpec;
    if (typeof vgSpec.mark === 'object' && vgSpec.mark.size != null) return vgSpec;

    const n = table.length;
    const plotArea = plotWidth * plotHeight;
    const currentCoverage = (n * defaultSize) / plotArea;

    if (currentCoverage <= targetCoverage) return vgSpec;

    const size = Math.round(Math.max(minSize, (targetCoverage * plotArea) / n));
    vgSpec.mark = setMarkProp(vgSpec.mark, 'size', size);
    coverageSizedMarks.add(vgSpec.mark);
    return vgSpec;
};

/**
 * Compute the maximum non-overlapping mark size (in pixels) for a continuous
 * banded axis.
 */
function maxNonOverlapSize(
    field: string,
    table: any[],
    isTemporal: boolean,
    subplotDim: number,
    count: number,
    minSize: number = 2,
): number {
    const nums = [...new Set(
        table.map((r: any) => {
            const v = r[field];
            if (v == null) return NaN;
            return isTemporal ? +new Date(v) : +v;
        }).filter((v: number) => !isNaN(v)),
    )];
    if (nums.length < 2) return Infinity;

    nums.sort((a, b) => a - b);

    let minGap = Infinity;
    for (let i = 1; i < nums.length; i++) {
        const gap = nums[i] - nums[i - 1];
        if (gap > 0 && gap < minGap) minGap = gap;
    }
    if (!isFinite(minGap)) return Infinity;

    const dataRange = nums[nums.length - 1] - nums[0];
    if (dataRange <= 0) return Infinity;

    const pixelsPerUnit = subplotDim * (count - 1) / (dataRange * count);
    const maxWidth = Math.floor(minGap * pixelsPerUnit);
    return Math.max(minSize, maxWidth);
}

/**
 * Make a stacked mark's segment order match its colour order.
 *
 * The assembler expresses "keep the order the data arrived in" as
 * `color.sort: null`. That governs the legend, but NOT the stack: Vega-Lite
 * derives the stack's sort from the colour *scale*, and a scale with no
 * explicit domain falls back to sorting the field ascending — i.e.
 * alphabetically. The result is a chart whose legend reads
 * `A great deal, Some, Not much, None at all` while its bars stack
 * `A great deal, None at all, Not much, Some`. For any ordered series
 * (a Likert scale, an age band, a size class) that silently destroys the
 * meaning of the stack.
 *
 * Pinning `scale.domain` to the same order makes Vega-Lite emit a
 * `_<field>_sort_index` and sort the stack by it, so legend and stack agree.
 * An explicit `sort` array does NOT achieve this — Vega-Lite applies it to
 * the legend only — which is why the domain is what gets set here.
 */
export function alignStackOrderToColorOrder(spec: any, ctx: InstantiateContext): void {
    const color = spec.encoding?.color;
    // Only meaningful for a discrete colour series.
    if (!color?.field || (color.type !== 'nominal' && color.type !== 'ordinal')) return;
    // Called from stacked templates, where stacking is implicit unless it has
    // been explicitly switched off (`stackMode: 'layered'` → `stack: null`).
    const unstacked = (['x', 'y'] as const).some(
        (axis) => spec.encoding?.[axis] && 'stack' in spec.encoding[axis] &&
            (spec.encoding[axis].stack === null || spec.encoding[axis].stack === false),
    );
    if (unstacked) return;
    // An explicit domain already pins the order; don't override the caller.
    if (color.scale?.domain) return;

    // `sort: null` means data order; an array means that array. Anything else
    // (a field-driven sort spec, "ascending"/"descending") is left alone.
    let order: any[];
    if (color.sort === null) {
        const seen = new Set<any>();
        order = [];
        for (const row of ctx.table ?? []) {
            const v = row?.[color.field];
            if (v === undefined || v === null || seen.has(v)) continue;
            seen.add(v);
            order.push(v);
        }
    } else if (Array.isArray(color.sort)) {
        order = color.sort;
    } else {
        return;
    }
    if (order.length < 2) return;

    color.scale = { ...(color.scale ?? {}), domain: order };
}

/**
 * Adjust bar/rect marks for continuous-as-discrete axes.
 * v2 version: reads layout info from InstantiateContext.
 */
/**
 * Fraction of a continuous-banded step a bar fills by default, leaving a 10%
 * gap. A house that states its own `marks.bandFraction` re-cuts against this
 * baseline (see theme.ts `bandWalk`), so the two must agree on the number.
 */
export const CONTINUOUS_BAR_STEP_FILL = 0.9;

export function adjustBarMarks(spec: any, ctx: InstantiateContext): void {
    const layout = ctx.layout;
    for (const axis of ['x', 'y'] as const) {
        const count = axis === 'x' ? layout.xContinuousAsDiscrete : layout.yContinuousAsDiscrete;
        if (count <= 0) continue;
        const enc = spec.encoding?.[axis];
        if (enc?.bin) continue;

        const effStep = axis === 'x' ? layout.xStep : layout.yStep;

        const allMarkTypes = new Set<string>();
        const mt = typeof spec.mark === 'string' ? spec.mark : spec.mark?.type;
        if (mt) allMarkTypes.add(mt);
        if (Array.isArray(spec.layer)) {
            for (const layer of spec.layer) {
                const lm = typeof layer.mark === 'string' ? layer.mark : layer.mark?.type;
                if (lm) allMarkTypes.add(lm);
            }
        }
        const sizeKey = allMarkTypes.has('rect')
            ? (axis === 'x' ? 'width' : 'height')
            : 'size';

        const subplotDim = axis === 'x' ? layout.subplotWidth : layout.subplotHeight;
        const isTemporal = enc?.type === 'temporal';
        const maxSize = enc?.field
            ? maxNonOverlapSize(enc.field, ctx.table, isTemporal, subplotDim, count)
            : Infinity;
        const cellSize = Math.max(2, Math.min(Math.round(effStep * CONTINUOUS_BAR_STEP_FILL), maxSize));

        if (Array.isArray(spec.layer)) {
            for (const layer of spec.layer) {
                const lm = typeof layer.mark === 'string' ? layer.mark : layer.mark?.type;
                if (lm === 'bar' || lm === 'rect') {
                    layer.mark = setMarkProp(layer.mark, sizeKey, cellSize);
                }
            }
        } else if (spec.mark) {
            const markType = typeof spec.mark === 'string' ? spec.mark : spec.mark?.type;
            if (markType === 'bar' || markType === 'rect') {
                spec.mark = setMarkProp(spec.mark, sizeKey, cellSize);
            }
        }
    }
}

/**
 * Adjust rect marks for edge-to-edge tiling on continuous axes.
 * v2 version: reads layout info from InstantiateContext.
 */
export function adjustRectTiling(spec: any, ctx: InstantiateContext): void {
    const layout = ctx.layout;

    for (const axis of ['x', 'y'] as const) {
        const enc = spec.encoding?.[axis];
        if (!enc?.field) continue;
        const t = enc.type;
        if (t === 'nominal' || t === 'ordinal') continue;
        if (enc.aggregate) continue;

        const uniqueVals = [...new Set(ctx.table.map((r: any) => r[enc.field]))];
        const cardinality = uniqueVals.length;
        if (cardinality <= 1) continue;

        const count = axis === 'x' ? layout.xContinuousAsDiscrete : layout.yContinuousAsDiscrete;
        const effStep = axis === 'x' ? layout.xStep : layout.yStep;
        const pixelSpacing = count > 0 ? effStep * (count + 1) / count : effStep;

        const subplotDim = axis === 'x' ? layout.subplotWidth : layout.subplotHeight;
        const isTemporal = t === 'temporal';
        const maxSize = maxNonOverlapSize(enc.field, ctx.table, isTemporal, subplotDim, count);
        const cellSize = Math.max(1, Math.min(Math.floor(pixelSpacing * 0.98), maxSize));

        const sizeKey = axis === 'x' ? 'width' : 'height';
        spec.mark = setMarkProp(spec.mark, sizeKey, cellSize);
    }
}

/**
 * Convert both positional axes to discrete types if they aren't already.
 * Returns resolvedTypes for layout declaration.
 */
export function ensureDiscreteTypes(
    channelSemantics: Record<string, ChannelSemantics>,
    table: any[],
): Record<string, 'nominal' | 'ordinal' | 'quantitative' | 'temporal'> {
    const resolvedTypes: Record<string, 'nominal' | 'ordinal' | 'quantitative' | 'temporal'> = {};
    for (const axis of ['x', 'y'] as const) {
        const cs = channelSemantics[axis];
        if (!cs?.field || isDiscrete(cs.type)) continue;
        resolvedTypes[axis] = resolveDiscreteType(cs.type, cs.field, table);
    }
    return resolvedTypes;
}
