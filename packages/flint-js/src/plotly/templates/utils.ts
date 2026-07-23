// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Shared helper functions for Plotly template hooks.
 * Pure logic — no UI dependencies.
 */

import type { ChannelSemantics, InstantiateContext } from '../../core/types';
import { pickPlotlyPalette } from '../colormap';

const isDiscrete = (type: string | undefined) => type === 'nominal' || type === 'ordinal';

/** Exported alias so templates can share the same discrete-type predicate. */
export const isDiscreteType = isDiscrete;

/** True if every category label parses as a number (used to decide label rotation). */
export function areCategoriesNumeric(cats: string[]): boolean {
    if (cats.length === 0) return true;
    return cats.every((c) => {
        const s = String(c).trim();
        if (s === '') return false;
        const n = Number(s);
        return !isNaN(n) && isFinite(n);
    });
}

/**
 * Extract unique category values from data for a given field, preserving order.
 * If `ordinalSortOrder` is provided, returns values sorted in that canonical order.
 */
export function extractCategories(data: any[], field: string, ordinalSortOrder?: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const row of data) {
        const val = row[field];
        if (val != null) {
            const key = String(val);
            if (!seen.has(key)) {
                seen.add(key);
                result.push(key);
            }
        }
    }

    if (ordinalSortOrder && ordinalSortOrder.length > 0) {
        const orderMap = new Map(ordinalSortOrder.map((v, i) => [v, i]));
        result.sort((a, b) => {
            const ia = orderMap.get(a);
            const ib = orderMap.get(b);
            if (ia !== undefined && ib !== undefined) return ia - ib;
            if (ia !== undefined) return -1;
            if (ib !== undefined) return 1;
            return 0;
        });
    }

    return result;
}

/**
 * Resolve the display order of a categorical axis, honoring either a canonical
 * `ordinalSortOrder` (months, weekdays, …) or a sort-by-measure request
 * (`sortBy` + `sortOrder` from the shared "Sort" control). Plotly has no native
 * "order a categorical axis by another field" (Vega-Lite's `sort` op), so we
 * aggregate the measure per category (sum) and order ascending/descending here.
 */
export function resolveCategoryOrder(
    data: any[],
    catField: string,
    opts?: { ordinalSortOrder?: string[]; sortBy?: string; sortOrder?: 'ascending' | 'descending' },
): string[] {
    const base = extractCategories(data, catField, opts?.ordinalSortOrder);
    if (!opts?.sortBy) return base;
    const agg = new Map<string, number>();
    for (const row of data) {
        const cat = String(row[catField] ?? '');
        const v = Number(row[opts.sortBy]);
        if (Number.isFinite(v)) agg.set(cat, (agg.get(cat) ?? 0) + v);
    }
    const dir = opts.sortOrder === 'ascending' ? 1 : -1;
    return [...base].sort((a, b) => dir * ((agg.get(a) ?? 0) - (agg.get(b) ?? 0)));
}

/**
 * Group data by a categorical field.
 * Returns a map: seriesName → rows[].
 */
export function groupBy(data: any[], field: string): Map<string, any[]> {
    const groups = new Map<string, any[]>();
    for (const row of data) {
        const key = String(row[field] ?? '');
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key)!.push(row);
    }
    return groups;
}

/**
 * Build category-aligned value array for a subset of rows.
 * Returns values indexed by category position (null for missing).
 */
export function buildCategoryAlignedData(
    rows: any[],
    catField: string,
    valField: string,
    categories: string[],
): (number | null)[] {
    const map = new Map<string, number>();
    for (const row of rows) {
        const key = String(row[catField] ?? '');
        const val = row[valField];
        if (val != null && !isNaN(val)) {
            map.set(key, (map.get(key) ?? 0) + Number(val));
        }
    }
    return categories.map(cat => map.get(cat) ?? null);
}

/**
 * Detect which axis is the category (banded) axis and which is the value axis.
 *
 * A bar's length is encoded on the **quantitative** axis; the band axis is the
 * other one — which may be discrete (nominal/ordinal) *or* temporal (a bar over
 * time is banded per period). Checking only for discreteness misses the temporal
 * case and leaves dates on the value axis (→ empty bars).
 */
export function detectAxes(
    channelSemantics: Record<string, ChannelSemantics>,
): { categoryAxis: 'x' | 'y'; valueAxis: 'x' | 'y' } {
    const xCS = channelSemantics.x;
    const yCS = channelSemantics.y;
    const xQuant = !!xCS && xCS.type === 'quantitative';
    const yQuant = !!yCS && yCS.type === 'quantitative';

    // Bar length lives on the quantitative axis; the band is the other axis.
    if (yQuant && !xQuant) return { categoryAxis: 'x', valueAxis: 'y' }; // vertical
    if (xQuant && !yQuant) return { categoryAxis: 'y', valueAxis: 'x' }; // horizontal

    // Fallbacks (both discrete, both quantitative, or missing): discrete-first.
    if (xCS && isDiscrete(xCS.type)) {
        return { categoryAxis: 'x', valueAxis: 'y' };
    }
    if (yCS && isDiscrete(yCS.type)) {
        return { categoryAxis: 'y', valueAxis: 'x' };
    }
    return { categoryAxis: 'x', valueAxis: 'y' };
}

/**
 * Coerce a temporal value to an ISO-8601 string for Plotly's native `date`
 * axis. Numbers below 1e12 are treated as Unix seconds; strings and Dates are
 * parsed directly. Returns null when unparseable.
 */
export function coerceIsoDateForPlotly(raw: unknown): string | null {
    if (raw == null) return null;
    let ms: number;
    if (typeof raw === 'number' && Number.isFinite(raw)) {
        ms = raw < 1e12 ? Math.round(raw * 1000) : raw;
    } else if (raw instanceof Date) {
        ms = raw.getTime();
    } else {
        ms = new Date(String(raw)).getTime();
    }
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * Plotly's default qualitative palette (plotly.js `layout.colorway` defaults).
 * Fallback when no color decision is available; the decision-aware path lives
 * in ../colormap.ts (mirroring chartjs/colormap.ts).
 */
export const PLOTLY_COLORS = [
    '#636efa', // blue-violet
    '#EF553B', // red-orange
    '#00cc96', // green
    '#ab63fa', // purple
    '#FFA15A', // orange
    '#19d3f3', // cyan
    '#FF6692', // pink
    '#B6E880', // light green
    '#FF97FF', // magenta
    '#FECB52', // yellow
];

/**
 * 从 color-decisions 解析调色板；若没有决策则回退到 Plotly 默认 plotly10。
 * (Mirror of chartjs/templates/utils.ts getChartJsPalette.)
 */
export function getPlotlyPalette(ctx: InstantiateContext, preferred: 'color' | 'group' = 'color'): string[] {
    const decisions = ctx.colorDecisions;
    const decision =
        preferred === 'color'
            ? decisions?.color ?? decisions?.group
            : decisions?.group ?? decisions?.color;

    const palette = pickPlotlyPalette(decision);
    if (palette.length > 0) {
        return palette;
    }
    return PLOTLY_COLORS;
}

/** Series color by index from a resolved palette. */
export function getSeriesColor(palette: string[], index: number): string {
    if (!palette.length) {
        return PLOTLY_COLORS[index % PLOTLY_COLORS.length];
    }
    return palette[index % palette.length];
}

/** Hex → rgba with alpha, for translucent fills (area/violin/density/range-area). */
export function fillColor(hex: string, alpha: number): string {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(hex ?? '').trim());
    if (!m) return hex;
    const v = parseInt(m[1], 16);
    const a = Math.max(0, Math.min(1, alpha));
    return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${a})`;
}

/**
 * Bandwidth for Gaussian KDE — matches vega-statistics (bandwidth.js), shared
 * with the equivalent Vega-Lite/ECharts density templates so curves line up.
 */
export function estimateBandwidth(values: number[]): number {
    const n = values.length;
    if (n < 2) return 1;
    const sorted = [...values].sort((a, b) => a - b);
    const mean = values.reduce((a, b) => a + b, 0) / n;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    const d = Math.sqrt(variance);
    const q1 = sorted[Math.floor((n - 1) * 0.25)];
    const q3 = sorted[Math.floor((n - 1) * 0.75)];
    const iqr = (q3 != null && q1 != null) ? q3 - q1 : 0;
    const h = iqr / 1.34;
    const v = Math.min(d, h || d) || d || 1;
    return 1.06 * v * Math.pow(n, -0.2);
}

/** One-dimensional Gaussian KDE over an extent. */
export function kde(
    values: number[], steps: number, bandwidthMultiplier: number,
    extent?: { min: number; max: number },
): { x: number[]; y: number[] } {
    if (values.length === 0) return { x: [], y: [] };
    const lo = extent ? extent.min : Math.min(...values);
    const hi = extent ? extent.max : Math.max(...values);
    const range = hi - lo || 1;
    const h = estimateBandwidth(values) * bandwidthMultiplier;
    const n = values.length;
    const x: number[] = [];
    const y: number[] = [];
    for (let i = 0; i <= steps; i++) {
        const t = lo + (i / steps) * (hi - lo || range);
        let sum = 0;
        for (const v of values) {
            const z = (t - v) / h;
            sum += Math.exp(-0.5 * z * z);
        }
        const density = sum / (n * h * Math.sqrt(2 * Math.PI));
        x.push(t);
        y.push(density);
    }
    return { x, y };
}

/**
 * Sorted distinct (value, cumulative-proportion) pairs for an ECDF, using the
 * "≤ x" convention (ties collapse to the last occurrence's proportion).
 */
export function ecdfPairs(values: number[]): [number, number][] {
    const sorted = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
    const n = sorted.length;
    const pairs: [number, number][] = [];
    if (n === 0) return pairs;
    let i = 0;
    while (i < n) {
        let j = i;
        while (j + 1 < n && sorted[j + 1] === sorted[i]) j++;
        pairs.push([sorted[i], (j + 1) / n]);
        i = j + 1;
    }
    return pairs;
}

/** Deterministic pseudo-random generator (LCG) for reproducible jitter. */
export function seededJitter(seed: number): () => number {
    let s = seed;
    return () => {
        s = (s * 1103515245 + 12345) & 0x7fffffff;
        return (s / 0x7fffffff) * 2 - 1;
    };
}

/** Round up to a "nice" ceiling (radar/gauge axis maxima). */
export function niceMax(v: number): number {
    if (v <= 0) return 1;
    const pow = Math.pow(10, Math.floor(Math.log10(v)));
    const mantissa = v / pow;
    const nice = mantissa <= 1 ? 1
        : mantissa <= 2 ? 2
        : mantissa <= 2.5 ? 2.5
        : mantissa <= 5 ? 5
        : 10;
    return nice * pow;
}

/**
 * Stable sort of `rows` by a sequence field: numeric when every present value
 * parses as a number, chronological when every value parses as a date,
 * lexical otherwise. Ties keep their original row order.
 */
export function sortByOrder(rows: any[], field: string | undefined): any[] {
    if (!field) return rows;
    const tagged = rows.map((row, idx) => ({ row, idx, key: row[field] }));
    const present = tagged.filter(t => t.key != null && t.key !== '');
    const allNumeric = present.length > 0 &&
        present.every(t => typeof t.key === 'number' ||
            (typeof t.key === 'string' && t.key.trim() !== '' && !isNaN(Number(t.key))));
    const allDates = !allNumeric && present.length > 0 &&
        present.every(t => !isNaN(Date.parse(String(t.key))));
    const rank = (k: any): number | string => {
        if (allNumeric) return Number(k);
        if (allDates) return Date.parse(String(k));
        return String(k);
    };
    return [...tagged].sort((a, b) => {
        const ra = rank(a.key);
        const rb = rank(b.key);
        if (ra < rb) return -1;
        if (ra > rb) return 1;
        return a.idx - b.idx;
    }).map(t => t.row);
}
