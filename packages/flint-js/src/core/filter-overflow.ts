// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * =============================================================================
 * OVERFLOW FILTERING
 * =============================================================================
 *
 * Decides *which* discrete values to keep when there are too many for
 * the available canvas space, then filters the data accordingly.
 *
 * This module does **no layout math**.  Per-channel capacity budgets
 * are computed upstream by `computeChannelBudgets` and passed in as
 * a `ChannelBudgets` object.  This module focuses on:
 *   1. Iterating each discrete channel
 *   2. Applying the overflow strategy (which values to keep)
 *   3. Filtering data rows
 *   4. Producing truncation warnings
 *
 * Runs AFTER computeChannelBudgets and BEFORE computeLayout.
 *
 * VL dependency: **None**
 * =============================================================================
 */

import type {
    ChannelSemantics,
    ChartEncoding,
    LayoutDeclaration,
    TruncationWarning,
    OverflowResult,
    OverflowStrategy,
    OverflowStrategyContext,
    ChannelBudgets,
} from './types';
import type { ChartWarning } from './types';
import { inferVisCategory } from './semantic-types';

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Filter data to keep only the values that fit within the canvas.
 *
 * @param channelSemantics  Phase 0 output (field, type per channel)
 * @param declaration       Template layout declaration (resolvedTypes, overflowStrategy)
 * @param encodings         Original user-level encodings (for sort info)
 * @param data              Full data table
 * @param budgets           Per-channel capacity budgets from computeChannelBudgets
 * @param allMarkTypes      Set of all mark types in the template (for connected-mark detection)
 * @returns                 OverflowResult with filtered data, nominal counts, truncations, and warnings
 */
export function filterOverflow(
    channelSemantics: Record<string, ChannelSemantics>,
    declaration: LayoutDeclaration,
    encodings: Record<string, ChartEncoding>,
    data: any[],
    budgets: ChannelBudgets,
    allMarkTypes: Set<string>,
): OverflowResult {

    // --- Build effective channel info from semantics + declaration ---

    const effectiveType = (ch: string): string | undefined =>
        declaration.resolvedTypes?.[ch] ?? channelSemantics[ch]?.type;

    const effectiveField = (ch: string): string | undefined => {
        if (channelSemantics[ch]?.field) return channelSemantics[ch].field;
        return undefined;
    };

    const isDiscreteType = (t: string | undefined) => t === 'nominal' || t === 'ordinal';

    // --- Filter data ---

    const nominalCounts: Record<string, number> = {
        x: 0, y: 0, column: 0, row: 0, group: 0,
    };
    const truncations: TruncationWarning[] = [];
    const warnings: ChartWarning[] = [];
    const viewports: OverflowResult['viewports'] = [];
    let filteredData = data;

    // Compute group nominal count
    const groupField = channelSemantics.group?.field;
    if (groupField) {
        nominalCounts.group = new Set(data.map(r => r[groupField])).size;
    }

    // Strategy context for custom or default overflow
    const strategyContext: OverflowStrategyContext = {
        data,
        channelSemantics,
        encodings,
        allMarkTypes,
    };

    const strategy = declaration.overflowStrategy ?? defaultOverflowStrategy;

    for (const channel of ['x', 'y', 'column', 'row', 'color'] as const) {
        const fieldName = effectiveField(channel);
        const type = effectiveType(channel);
        if (!fieldName) continue;

        // Budget for this channel (Infinity if uncapped)
        const maxToKeep = budgets.maxValues[channel] ?? Infinity;

        // For non-discrete types on column/row, apply overflow cap —
        // every unique value becomes a facet panel.
        if (!isDiscreteType(type)) {
            if (channel === 'column' || channel === 'row') {
                const uniqueValues = [...new Set(filteredData.map(r => r[fieldName]))];
                nominalCounts[channel] = Math.min(uniqueValues.length, maxToKeep);

                if (uniqueValues.length > maxToKeep) {
                    // For non-discrete facets, keep the first N values (sorted)
                    const sorted = [...uniqueValues].sort();
                    const valuesToKeep = sorted.slice(0, maxToKeep);

                    const omittedCount = uniqueValues.length - valuesToKeep.length;
                    warnings.push({
                        severity: 'warning',
                        code: 'overflow',
                        message: `${omittedCount} of ${uniqueValues.length} values in '${fieldName}' were omitted (showing first ${valuesToKeep.length}).`,
                        channel,
                        field: fieldName,
                    });

                    const keepSet = new Set(valuesToKeep);
                    filteredData = filteredData.filter(row => keepSet.has(row[fieldName]));
                }
            }
            continue;
        }

        const uniqueValues = [...new Set(filteredData.map(r => r[fieldName]))];
        nominalCounts[channel] = Math.min(uniqueValues.length, maxToKeep);

        if (uniqueValues.length > maxToKeep) {
            const orderedValues = strategy === defaultOverflowStrategy
                ? defaultOverflowOrder(channel, fieldName, uniqueValues, strategyContext)
                : undefined;
            const valuesToKeep = orderedValues
                ? orderedValues.slice(0, maxToKeep)
                : strategy(channel, fieldName, uniqueValues, maxToKeep, strategyContext);

            if ((channel === 'x' || channel === 'y') && orderedValues) {
                viewports.push({
                    channel,
                    field: fieldName,
                    orderedValues,
                    visibleCount: valuesToKeep.length,
                    totalCount: orderedValues.length,
                });
            }

            const omittedCount = uniqueValues.length - valuesToKeep.length;
            const placeholder = `...${omittedCount} items omitted`;

            warnings.push({
                severity: 'warning',
                code: 'overflow',
                message: `${omittedCount} of ${uniqueValues.length} values in '${fieldName}' were omitted (showing first ${valuesToKeep.length} in sort order).`,
                channel,
                field: fieldName,
            });

            truncations.push({
                severity: 'warning',
                code: 'overflow',
                message: `${omittedCount} of ${uniqueValues.length} values in '${fieldName}' were omitted (showing first ${valuesToKeep.length} in sort order).`,
                channel,
                field: fieldName,
                keptValues: valuesToKeep,
                omittedCount,
                placeholder,
            });

            // Filter data rows (except for color — we keep all rows but style the legend)
            if (channel !== 'color') {
                filteredData = filteredData.filter(row => valuesToKeep.includes(row[fieldName]));
            }
        }
    }

    return { filteredData, nominalCounts, truncations, warnings, viewports };
}

/** Resolve a clamped category window for one viewport axis. */
export function resolveCategoryViewport(
    viewport: OverflowResult['viewports'][number],
    requestedStart: number = 0,
): { start: number; end: number; values: any[] } {
    const maxStart = Math.max(0, viewport.totalCount - viewport.visibleCount);
    const start = Math.min(maxStart, Math.max(0, Math.floor(requestedStart)));
    const end = Math.min(viewport.totalCount, start + viewport.visibleCount);
    return { start, end, values: viewport.orderedValues.slice(start, end) };
}

/**
 * Apply one or more host-controlled category windows to the original rows.
 * A heatmap may provide both x and y starts; ordinary bar charts provide one.
 */
export function applyCategoryViewports(
    data: any[],
    viewports: OverflowResult['viewports'],
    starts: Partial<Record<'x' | 'y', number>> = {},
): any[] {
    const windows = viewports.map((viewport) => ({
        field: viewport.field,
        values: new Set(resolveCategoryViewport(viewport, starts[viewport.channel]).values),
    }));
    return data.filter((row) => windows.every((window) => window.values.has(row[window.field])));
}

// ---------------------------------------------------------------------------
// Default overflow strategy
// ---------------------------------------------------------------------------

/**
 * Default overflow strategy: decides which discrete values to keep.
 *
 * - User-specified sort: respect it
 * - Canonical semantic order (months, ranks, etc.): keep the first N
 * - Numeric categories: keep the first N numerically
 * - Otherwise preserve data encounter order
 */
const defaultOverflowStrategy: OverflowStrategy = (
    channel, fieldName, uniqueValues, maxToKeep, context,
) => defaultOverflowOrder(channel, fieldName, uniqueValues, context).slice(0, maxToKeep);

/** Resolve the complete display order before a static or interactive window is applied. */
function defaultOverflowOrder(
    channel: string,
    fieldName: string,
    uniqueValues: any[],
    context: OverflowStrategyContext,
): any[] {
    const { data, channelSemantics, encodings, allMarkTypes } = context;

    // Determine sort intent from user encodings
    const encoding = encodings[channel];
    const sortBy = encoding?.sortBy;
    const sortOrder = encoding?.sortOrder;

    // Infer sort field and direction
    let sortField: string | undefined;
    let sortFieldType: string | undefined;
    let isDescending = false;

    if (sortBy) {
        // User explicitly specified sort
        if (sortBy === 'x' || sortBy === 'y' || sortBy === 'color') {
            const sortCS = channelSemantics[sortBy];
            sortField = sortCS?.field;
            sortFieldType = sortCS?.type;
            isDescending = sortOrder === 'descending' || (sortOrder !== 'ascending' && sortBy !== channel);
        } else {
            // Custom sort list — respect insertion order
            try {
                const sortedList = JSON.parse(sortBy);
                if (Array.isArray(sortedList)) {
                    const orderedValues = (sortOrder === 'descending') ? sortedList.reverse() : sortedList;
                    return orderedValues.filter((v: any) => uniqueValues.includes(v));
                }
            } catch {
                // not a JSON list, fall through
            }
            isDescending = sortOrder === 'descending';
        }
    }

    // Explicit value sort takes precedence over the category field's own type.
    if (sortField && sortFieldType === 'quantitative') {
        let aggregateOp = Math.max;
        let initialValue = -Infinity;
        if (allMarkTypes.has('bar') && sortField !== channelSemantics.color?.field) {
            aggregateOp = (x: number, y: number) => x + y;
            initialValue = 0;
        }

        const valueAggregates = new Map<any, number>();
        for (const row of data) {
            const fieldValue = row[fieldName];
            const sortValue = Number(row[sortField] ?? 0);
            if (valueAggregates.has(fieldValue)) {
                valueAggregates.set(fieldValue, aggregateOp(valueAggregates.get(fieldValue)!, sortValue));
            } else {
                valueAggregates.set(fieldValue, aggregateOp(initialValue, sortValue));
            }
        }

        return Array.from(valueAggregates.entries())
            .map(([value, agg]) => ({ value, agg }))
            .sort((a, b) => isDescending ? b.agg - a.agg : a.agg - b.agg)
            .map(v => v.value);
    }

    const canonicalOrder = channelSemantics[channel]?.ordinalSortOrder;
    if (!sortBy && !sortOrder && canonicalOrder?.length) {
        const present = new Set(uniqueValues);
        const ordered = canonicalOrder.filter(value => present.has(value));
        const canonicalValues = new Set(ordered);
        ordered.push(...uniqueValues.filter(value => !canonicalValues.has(value)));
        return ordered;
    }

    // Match the display default for quantitative values treated as discrete.
    const fieldOriginalType = inferVisCategory(data.map(r => r[fieldName]));
    if (fieldOriginalType === 'quantitative' || channel === 'color') {
        return [...uniqueValues].sort((a, b) => Number(a) - Number(b))
            ;
    }

    // Facet channels: first N
    if (channel === 'column' || channel === 'row') {
        return uniqueValues;
    }

    // Explicit field-order sort follows the displayed label order.
    if (sortOrder === 'descending') {
        return [...uniqueValues].sort((a, b) => String(b).localeCompare(String(a), undefined, { numeric: true }));
    }
    if (sortOrder === 'ascending') {
        return [...uniqueValues].sort((a, b) => String(a).localeCompare(String(b), undefined, { numeric: true }));
    }

    // Default: first N values
    return uniqueValues;
}
