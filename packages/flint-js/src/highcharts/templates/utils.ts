// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Shared helper functions for Highcharts template hooks.
 * Mirrors echarts/templates/utils.ts where the logic is target-agnostic.
 * Pure logic — no UI dependencies.
 */

import type { ChannelSemantics, InstantiateContext } from '../../core/types';

const isDiscrete = (type: string | undefined) => type === 'nominal' || type === 'ordinal';

/**
 * Get canonical category order for a channel (from resolvedEncodings or channelSemantics).
 * Honors the shared Sort encoding action (`encodings[channel].sortBy` =
 * measure channel + `sortOrder`) by aggregating the measure per category.
 */
export function getCategoryOrder(ctx: InstantiateContext, channel: string): string[] | undefined {
    const resolved = (ctx.resolvedEncodings as any)?.[channel];
    if (Array.isArray(resolved?.sortValues) && resolved.sortValues.length > 0) {
        return resolved.sortValues.map(String);
    }

    const ordinal = resolved?.ordinalSortOrder
        ?? ctx.channelSemantics?.[channel]?.ordinalSortOrder;

    const enc = ctx.encodings?.[channel];
    const sortByChannel = enc?.sortBy;
    if (
        typeof sortByChannel === 'string'
        && (sortByChannel === 'x' || sortByChannel === 'y' || sortByChannel === 'color'
            || sortByChannel === 'size' || sortByChannel === 'group')
    ) {
        const catField = ctx.channelSemantics?.[channel]?.field ?? enc?.field;
        const sortByField = ctx.channelSemantics?.[sortByChannel]?.field
            ?? ctx.encodings?.[sortByChannel]?.field;
        if (catField && sortByField && ctx.table) {
            return resolveCategoryOrder(ctx.table, catField, {
                ordinalSortOrder: ordinal,
                sortBy: sortByField,
                sortOrder: enc?.sortOrder,
            });
        }
    }

    return ordinal;
}

/**
 * Resolve the display order of a categorical axis, honoring either a canonical
 * `ordinalSortOrder` or a sort-by-measure request (`sortBy` + `sortOrder`).
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
 * Extract unique category values from data for a given field, preserving order.
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
 * Group data by a categorical field. Returns a map: seriesName → rows[].
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
 * Build values aligned to a category array, summing duplicates per category.
 */
export function buildCategoryValues(
    rows: any[],
    categoryField: string,
    valueField: string,
    categories: string[],
): (number | null)[] {
    const map = new Map<string, number>();
    for (const row of rows) {
        const cat = String(row[categoryField] ?? '');
        const val = row[valueField];
        if (val != null && !isNaN(val)) {
            map.set(cat, (map.get(cat) ?? 0) + Number(val));
        }
    }
    return categories.map(cat => map.get(cat) ?? null);
}

/** Count rows per category (when value axis has no numeric field, e.g. temporal). */
export function buildCategoryCounts(
    rows: any[],
    categoryField: string,
    categories: string[],
): number[] {
    const map = new Map<string, number>();
    for (const row of rows) {
        const cat = String(row[categoryField] ?? '');
        map.set(cat, (map.get(cat) ?? 0) + 1);
    }
    return categories.map(cat => map.get(cat) ?? 0);
}

/** When both x and y are discrete: count per (category, group). Returns one row per group. */
export function buildCategoryGroupCounts(
    rows: any[],
    categoryField: string,
    groupField: string,
    categories: string[],
    groups: string[],
): number[][] {
    return groups.map(group =>
        categories.map(cat =>
            rows.filter(r => String(r[categoryField] ?? '') === cat && String(r[groupField] ?? '') === group).length,
        ),
    );
}

/** Detect which axis is the category (banded) axis and which is the value axis. */
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
    if (xCS?.type === 'quantitative' && yCS?.type === 'temporal') {
        return { categoryAxis: 'y', valueAxis: 'x' };
    }
    if (xCS?.type === 'temporal' && yCS?.type === 'quantitative') {
        return { categoryAxis: 'x', valueAxis: 'y' };
    }
    return { categoryAxis: 'x', valueAxis: 'y' };
}

/** Highcharts default categorical palette (mirrors the library's built-in default). */
export const DEFAULT_COLORS = [
    '#2f7ed8', '#0d233a', '#8bbc21', '#910000', '#1aadce',
    '#492970', '#f28f43', '#77a1e5', '#c42525', '#a6c96a',
];

/** Few, short category labels → keep axis text horizontal (0°); else 90° to reduce overlap. */
const HC_BAR_SHORT_CATEGORY_COUNT = 4;
const HC_BAR_SHORT_CATEGORY_LABEL_LEN = 8;

export function categoryAxisLabelRotateDeg(
    categories: string[],
    channelType: string | undefined,
): number {
    if (channelType === 'quantitative') return 0;
    const labels = categories.map(c => String(c));
    if (labels.length === 0) return 0;
    const maxLen = Math.max(...labels.map(s => s.length));
    if (labels.length <= HC_BAR_SHORT_CATEGORY_COUNT && maxLen <= HC_BAR_SHORT_CATEGORY_LABEL_LEN) {
        return 0;
    }
    return 45;
}

/** True when every label parses as numbers (dense quantitative banding). */
export function areCategoriesNumeric(cats: string[]): boolean {
    if (cats.length === 0) return true;
    return cats.every((c) => {
        const s = String(c).trim();
        if (s === '') return false;
        const n = Number(s);
        return !isNaN(n) && isFinite(n);
    });
}

export { isDiscrete };
