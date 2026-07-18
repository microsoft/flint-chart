// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Shared helper functions for Plotly template hooks.
 * Pure logic — no UI dependencies.
 */

import type { ChannelSemantics } from '../../core/types';

const isDiscrete = (type: string | undefined) => type === 'nominal' || type === 'ordinal';

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
 */
export function detectAxes(
    channelSemantics: Record<string, ChannelSemantics>,
): { categoryAxis: 'x' | 'y'; valueAxis: 'x' | 'y' } {
    const xCS = channelSemantics.x;
    const yCS = channelSemantics.y;

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
 * Kept local to this backend, mirroring how each backend owns its palette.
 * Integration with core color-decisions is a follow-up.
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

/** Series color by index (wraps around the default palette). */
export function getSeriesColor(index: number): string {
    return PLOTLY_COLORS[index % PLOTLY_COLORS.length];
}
