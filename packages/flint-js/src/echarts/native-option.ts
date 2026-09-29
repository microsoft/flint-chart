// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Native ECharts escape hatch — `chart_spec.echarts`.
 *
 * Flint's semantic layer covers the common cases, but ECharts is much larger
 * than any channel set: a second value axis, mixed mark types in one chart,
 * `markLine`/`markArea`, `dataZoom`, axis/tooltip formatters, per-series
 * `areaStyle`, custom `grid`s, `visualMap` — the list does not end. Without a
 * way to reach those, a caller whose chart needs one of them has to costndon
 * Flint and hand-write the option, losing the semantic layer it came for.
 *
 * This module is the deliberate seam: the caller patches *the compiled
 * ECharts option* directly. It is a native escape hatch, not a second
 * semantic language — nothing here decides anything about the data; it only
 * merges what the caller states, and (optionally) binds extra series to
 * columns so a native series does not require re-serialising the rows.
 *
 * Shape (`chart_spec.echarts`):
 *
 * ```jsonc
 * {
 *   "yAxis": [{ "type": "value" }, { "type": "value", "position": "right" }],
 *   "series": [
 *     { "type": "line", "field": "margin", "name": "Margin rate", "axis": "right" }
 *   ],
 *   "tooltip": { "valueFormatter": "{value}%" }
 * }
 * ```
 *
 * Merge semantics (documented because they are the whole contract):
 *   - plain objects merge key by key, recursively;
 *   - arrays **of plain objects** (`series`, `xAxis`, `yAxis`, …) merge
 *     element-wise by index, and entries past the end of the base are
 *     appended — so `series[1].lineStyle` is addressable without restating
 *     `series[0]`;
 *   - any other array (a series' `data`, a `color` list) **replaces** the
 *     base value; an empty array says nothing and is skipped;
 *   - anything else (scalar, `null`) replaces.
 *
 * Series entries may carry `field` / `fields` instead of `data`: the assembler
 * materialises `[category, value]` pairs from the chart's rows, using the
 * chart's own category field unless `categoryField` says otherwise.
 * `axis: "right"` is sugar for "put this series on a right-hand value axis",
 * which is created if the chart does not already have one.
 *
 * Which of the two things a `series` entry means is decided by binding, not by
 * position: an entry that binds a column is a **new series** (appended), an
 * entry that does not is a **patch of the series at its own index**. Both may
 * appear in one array.
 *
 * Private (`_`-prefixed) keys are stripped: they carry Flint's own annotations
 * (`_warnings`, `_pivot`, `_viewports`, …) and a caller has no business
 * writing them.
 */

import type { ChartWarning } from '../core/types';

/** A native ECharts series that may bind its data to columns. */
export interface NativeEChartsSeries {
    [key: string]: unknown;
    /** One measure column → one series. */
    field?: string;
    /** Several measure columns → one series each (name defaults to the column). */
    fields?: string[];
    /** Category column for `field` binding (defaults to the chart's x field). */
    categoryField?: string;
    /** `"right"` puts the series on a right-hand value axis. */
    axis?: 'left' | 'right';
}

/** Right-hand axis margin added to `grid.right` when we create the axis. */
export const RIGHT_AXIS_EXTRA_MARGIN = 56;

/** Codes surfaced through `_warnings`. */
export const NATIVE_ECHARTS_CODES = {
    invalid: 'native_echarts_invalid',
    privateKeys: 'native_echarts_private_keys',
    unboundSeries: 'native_echarts_unbound_series',
    unknownField: 'native_echarts_unknown_field',
    faceted: 'native_echarts_faceted',
} as const;

type PlainObject = Record<string, unknown>;

function isPlainObject(value: unknown): value is PlainObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function clone<T>(value: T): T {
    if (Array.isArray(value)) return value.map((entry) => clone(entry)) as unknown as T;
    if (isPlainObject(value)) {
        const out: PlainObject = {};
        for (const [key, entry] of Object.entries(value)) out[key] = clone(entry);
        return out as unknown as T;
    }
    return value;
}

/** Every element (in either array) is a plain object → addressable by index. */
function isObjectArray(value: unknown): value is PlainObject[] {
    return Array.isArray(value) && value.length > 0 && value.every((entry) => isPlainObject(entry) && !Array.isArray(entry));
}

/**
 * Merge `patch` into `base` in place, following the semantics documented at
 * the top of this module. Returns `base`.
 */
export function mergeNativeOption(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
    for (const [key, value] of Object.entries(patch)) {
        if (key.startsWith('_')) continue;
        const current = base[key];
        if (isPlainObject(current) && isPlainObject(value)) {
            mergeNativeOption(current as Record<string, unknown>, value);
            continue;
        }
        if (isObjectArray(current) && isObjectArray(value)) {
            for (let i = 0; i < value.length; i++) {
                const entry = value[i];
                const target = (current as unknown[])[i];
                if (isPlainObject(target)) {
                    mergeNativeOption(target as Record<string, unknown>, entry);
                } else {
                    (current as unknown[])[i] = clone(entry);
                }
            }
            continue;
        }
        // An empty array says nothing — it must not wipe a value the chart
        // just built (an empty `series` patch would delete every series).
        if (Array.isArray(value) && value.length === 0) continue;
        base[key] = clone(value);
    }
    return base;
}

/** Fields a native series entry uses for Flint-side data binding, not for ECharts. */
const BINDING_KEYS = ['field', 'fields', 'categoryField', 'axis'] as const;

function stripBindingKeys(series: NativeEChartsSeries, name: string): PlainObject {
    const out: PlainObject = {};
    for (const [key, value] of Object.entries(series)) {
        if ((BINDING_KEYS as readonly string[]).includes(key) || key === 'name') continue;
        out[key] = clone(value);
    }
    if (name) out.name = name;
    return out;
}

export interface NativeEChartsContext {
    /** Rows the chart was built from (post-filter, same rows the series saw). */
    rows: Record<string, unknown>[];
    /** The chart's own x/category field, used when a series does not name one. */
    categoryField?: string;
    warnings: ChartWarning[];
    /** Faceted charts combine panels into one option; per-series binding is ambiguous there. */
    faceted: boolean;
}

/**
 * Split the `series` entries of a native patch into the two things a caller
 * can mean by "series":
 *
 *   - an entry that **binds a column** (`field` / `fields`) is a *new* series:
 *     its data is materialised from the chart's rows and it is appended;
 *   - an entry that does not bind a column is a *patch* of the series at its
 *     own index — which is what makes `series[1].lineStyle` reachable without
 *     restating `series[0]`.
 *
 * Both intents can appear in one array; the position of an added series among
 * the patches does not matter, only its order among the additions does.
 */
function splitSeries(
    entries: unknown[],
    ctx: NativeEChartsContext,
): { patches: unknown[]; additions: unknown[]; rightAxisNeeded: boolean } {
    const patches: unknown[] = [];
    const additions: unknown[] = [];
    let rightAxisNeeded = false;

    const buildData = (field: string, categoryField: string): unknown[] | undefined => {
        const sample = ctx.rows[0];
        if (sample && !(field in sample)) {
            ctx.warnings.push({
                severity: 'warning',
                code: NATIVE_ECHARTS_CODES.unknownField,
                message: `chart_spec.echarts.series[].field "${field}" does not exist in data.values`,
                field,
            });
            return undefined;
        }
        if (!categoryField) return ctx.rows.map((row) => row[field]);
        return ctx.rows.map((row) => [row[categoryField], row[field]]);
    };

    for (const entry of entries) {
        if (!isPlainObject(entry)) {
            // Not an object → nothing to bind and nothing to patch into; drop.
            ctx.warnings.push({
                severity: 'warning',
                code: NATIVE_ECHARTS_CODES.invalid,
                message: 'chart_spec.echarts.series[] entries must be objects; a non-object entry was ignored.',
            });
            continue;
        }
        const series = entry as NativeEChartsSeries;
        const fields = typeof series.field === 'string'
            ? [series.field]
            : Array.isArray(series.fields)
                ? series.fields.filter((f): f is string => typeof f === 'string')
                : [];

        if (fields.length === 0) {
            if (series.axis === 'right') {
                ctx.warnings.push({
                    severity: 'warning',
                    code: NATIVE_ECHARTS_CODES.unboundSeries,
                    message: 'chart_spec.echarts.series[] sets axis "right" without field/fields; the series is patched in place instead of added.',
                });
            }
            patches.push(clone(entry));
            continue;
        }
        if (ctx.faceted) {
            ctx.warnings.push({
                severity: 'warning',
                code: NATIVE_ECHARTS_CODES.faceted,
                message: 'chart_spec.echarts.series[].field binding is ignored for faceted charts; pass explicit data instead.',
            });
            patches.push(clone(entry));
            continue;
        }

        const categoryField = typeof series.categoryField === 'string'
            ? series.categoryField
            : (ctx.categoryField ?? '');

        for (const field of fields) {
            const data = buildData(field, categoryField);
            if (data === undefined) continue;
            const name = fields.length > 1 ? field : (typeof series.name === 'string' ? series.name : '');
            const built: PlainObject = { ...stripBindingKeys(series, name), data };
            if (series.axis === 'right') {
                rightAxisNeeded = true;
                if (built.yAxisIndex === undefined) built.yAxisIndex = 1;
            }
            additions.push(built);
        }
    }

    return { patches, additions, rightAxisNeeded };
}

/**
 * Make sure the option has value axes for every `yAxisIndex` a native series
 * asked for: axes past the first are appended as right-hand axes, and the
 * grid reserves room for them. A caller that patches `yAxis`/`grid` itself
 * still wins — this only fills in what is missing.
 */
function ensureValueAxes(option: Record<string, unknown>, rightAxisNeeded: boolean): void {
    if (!rightAxisNeeded) return;
    const existing = option.yAxis;
    const axes: unknown[] = Array.isArray(existing) ? existing : existing === undefined ? [] : [existing];
    if (axes.length < 2) axes.push({ type: 'value', position: 'right' });
    option.yAxis = axes;
    const grid = option.grid;
    if (isPlainObject(grid) && typeof grid.right === 'number') {
        grid.right = grid.right + RIGHT_AXIS_EXTRA_MARGIN;
    }
}

/**
 * Apply `chart_spec.echarts` to a compiled option.
 *
 * Mutates `option`; returns the same object. Warnings land in `ctx.warnings`
 * (surfaced as the compiled spec's `_warnings`).
 */
export function applyNativeEChartsOption(
    option: Record<string, unknown>,
    native: unknown,
    ctx: NativeEChartsContext,
): Record<string, unknown> {
    if (native === undefined || native === null) return option;
    if (!isPlainObject(native)) {
        ctx.warnings.push({
            severity: 'warning',
            code: NATIVE_ECHARTS_CODES.invalid,
            message: 'chart_spec.echarts must be an object; it was ignored.',
        });
        return option;
    }

    const patch = clone(native) as PlainObject;
    const privateKeys = Object.keys(patch).filter((key) => key.startsWith('_'));
    for (const key of privateKeys) delete patch[key];
    if (privateKeys.length > 0) {
        ctx.warnings.push({
            severity: 'info',
            code: NATIVE_ECHARTS_CODES.privateKeys,
            message: `chart_spec.echarts keys starting with "_" are reserved by Flint and were ignored: ${privateKeys.join(', ')}.`,
        });
    }

    // `series` is handled here rather than by the generic merge: a bound entry
    // is an *addition*, an unbound entry is a *patch by index*, and one array
    // cannot be merged as if it were only one of those. See splitSeries.
    const seriesEntries = Array.isArray(patch.series)
        ? patch.series
        : isPlainObject(patch.series)
            ? [patch.series]
            : undefined;
    delete patch.series;

    let additions: unknown[] = [];
    let rightAxisNeeded = false;
    if (seriesEntries) {
        const split = splitSeries(seriesEntries, ctx);
        additions = split.additions;
        rightAxisNeeded = split.rightAxisNeeded;
        if (split.patches.length > 0) patch.series = split.patches;
    }

    ensureValueAxes(option, rightAxisNeeded);
    mergeNativeOption(option, patch);

    if (additions.length > 0) {
        const current = option.series;
        const base: unknown[] = Array.isArray(current) ? current : current === undefined ? [] : [current];
        base.push(...additions);
        option.series = base;
    }
    return option;
}
