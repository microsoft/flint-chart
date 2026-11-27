// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * CanvasXpress native-spec types and shared data builders.
 *
 * A CanvasXpress chart is instantiated from a plain object:
 *     new CanvasXpress(targetId, { graphType, data, config, events?, afterRender? })
 * so the backend's job is to produce `CanvasXpressSpec` — the second argument,
 * minus the DOM target, which the renderer (`mountChart`) supplies.
 *
 * CanvasXpress's primary data model is a "y-matrix":
 *     data.y = { vars, smps, data }
 *       smps  — column keys   (the shared category axis, e.g. x values)
 *       vars  — row keys      (the series, e.g. one per color group)
 *       data  — vars.length × smps.length matrix of measures
 * This maps cleanly onto Flint's channel model: the banded axis supplies `smps`,
 * the `color`/`group` channel supplies `vars`, and the measure fills the matrix.
 */

import { ChannelSemantics, ChartEncoding } from '../core/types';
import { resolveDisplayAggregate } from '../core/field-semantics';

/** The object handed to `new CanvasXpress(target, spec)`, minus the DOM target. */
export interface CanvasXpressSpec {
    /** CanvasXpress graph type, e.g. 'Bar', 'Line', 'Area', 'Scatter2D'. */
    graphType: string;
    /** CanvasXpress data block (y-matrix form for most Cartesian charts). */
    data: CanvasXpressData;
    /** CanvasXpress config block (axis titles, orientation, theme, …). */
    config: Record<string, any>;
    /** Optional event handlers (click/dblclick/mousemove/mouseout). */
    events?: Record<string, string>;
    /** Optional post-render hook source. */
    afterRender?: unknown[];

    // ---- Internal metadata, mirroring the ECharts backend's `_*` keys. ----
    /** Warnings surfaced by the shared pipeline (see assembleCanvasXpress). */
    _warnings?: unknown[];
    /** Row count after overflow filtering, for parity with ecOption._dataLength. */
    _dataLength?: number;
}

/** CanvasXpress y-matrix data block. */
export interface CanvasXpressData {
    y: {
        vars: string[];
        smps: string[];
        data: (number | null)[][];
    };
    /** Optional per-sample annotations (x) — unused by the core four, kept for parity. */
    x?: Record<string, (string | number)[]>;
}

/**
 * Distinct values of `field` across the table, in encounter order.
 * Mirrors ECharts' extractCategories without its sort/order plumbing (deferred).
 */
export function distinctValues(table: any[], field: string): string[] {
    const seen = new Set<string>();
    const out: string[] = [];
    for (const row of table) {
        const key = String(row[field]);
        if (!seen.has(key)) {
            seen.add(key);
            out.push(key);
        }
    }
    return out;
}

/**
 * The reduce op `buildYMatrix` should use for a measure channel: the measure's
 * semantic display aggregate — additive types (counts, amounts) sum, intensive
 * types (rates, ratios, temperatures) average — falling back to `'sum'` when the
 * channel carries no measure semantics. Thin wrapper over `resolveDisplayAggregate`
 * so bar/line/area resolve the collision reduction identically.
 *
 * @param measure  The measure channel's resolved semantics (e.g. `channelSemantics.y`).
 * @param encoding The measure channel's user encoding, for its declared `aggregate`.
 * @returns `'sum'` or `'average'`.
 * @public
 */
export function resolveMatrixReduce(
    measure: ChannelSemantics | undefined,
    encoding?: ChartEncoding,
): 'sum' | 'average' {
    return resolveDisplayAggregate(measure, encoding?.aggregate) ?? 'sum';
}

/**
 * Build a y-matrix from tabular rows.
 *
 * @param table        Post-overflow data rows (ctx.table).
 * @param categoryField Field whose values become `smps` (the banded axis).
 * @param valueField    Field whose values fill the matrix (the measure).
 * @param seriesField   Optional field whose values become `vars` (the color/group split);
 *                      when absent, a single row keyed by `valueField` is produced.
 * @param reduce        How several rows on one (series, category) cell are combined:
 *                      `'sum'` totals them (the additive default), `'average'` takes their
 *                      arithmetic mean (for intensive measures). Callers resolve this from the
 *                      measure channel's semantics via `resolveDisplayAggregate`. Either way a
 *                      single-row cell keeps its own value unchanged. Defaults to `'sum'`.
 * @returns A CanvasXpressData y-matrix, nulls where a (series, category) pair is absent.
 */
export function buildYMatrix(
    table: any[],
    categoryField: string,
    valueField: string,
    seriesField?: string,
    reduce: 'sum' | 'average' = 'sum',
): CanvasXpressData {
    const smps = distinctValues(table, categoryField);
    const smpIndex = new Map(smps.map((s, i) => [s, i]));
    const vars = seriesField ? distinctValues(table, seriesField) : [valueField];
    const varIndex = new Map(vars.map((v, i) => [v, i]));

    const matrix: (number | null)[][] = vars.map(() => smps.map(() => null));
    // Count rows per cell so 'average' can divide; unused (stays 0) for 'sum'.
    const counts: number[][] = vars.map(() => smps.map(() => 0));
    for (const row of table) {
        const ci = smpIndex.get(String(row[categoryField]));
        if (ci == null) continue;
        const ri = seriesField ? varIndex.get(String(row[seriesField])) : 0;
        if (ri == null) continue;
        const raw = row[valueField];
        const num = raw == null || raw === '' ? null : Number(raw);
        if (num == null || Number.isNaN(num)) continue;
        // Several rows on one (series, category) cell are reduced rather than
        // letting the last row silently overwrite the earlier ones. We accumulate
        // the sum here and divide at the end for 'average'. Callers that need a
        // declared operation set `aggregate` on the measure, which collapses each
        // cell to one row upstream (assemble.ts / core/aggregate) — this then runs
        // over exactly one value and the reduce op is a no-op.
        const prev = matrix[ri][ci];
        matrix[ri][ci] = prev == null ? num : prev + num;
        counts[ri][ci] += 1;
    }

    if (reduce === 'average') {
        for (let ri = 0; ri < vars.length; ri++) {
            for (let ci = 0; ci < smps.length; ci++) {
                const n = counts[ri][ci];
                if (n > 1 && matrix[ri][ci] != null) matrix[ri][ci] = (matrix[ri][ci] as number) / n;
            }
        }
    }

    return { y: { vars, smps, data: matrix } };
}

/**
 * Build a y-matrix that preserves a facet dimension alongside a color/group series.
 *
 * Samples are the distinct (category, facet) pairs (so the same category in two
 * facets is two samples that keep the same `smps` label); `vars` are the series
 * (one row per color/group value); and `data.x[facetField]` carries each sample's
 * facet value so the caller can `segregateSamplesBy: [facetField]` into one panel
 * per facet. Colliding (series, category, facet) cells reduce by `reduce` exactly
 * as `buildYMatrix` does. This is the faceted counterpart used when BOTH a series
 * and a facet are bound — the plain builder keys only on (series, category), which
 * merged rows from different facets onto one another.
 *
 * @param table        Data rows.
 * @param categoryField Field whose values label the banded axis (`smps`).
 * @param valueField    Measure field filling the matrix.
 * @param seriesField   Color/group field whose values become `vars` (the series).
 * @param facetField    Field whose values segregate the samples into panels.
 * @param reduce        How duplicate cells combine (`'sum'` | `'average'`). Defaults to `'sum'`.
 * @returns A CanvasXpressData y-matrix with an `x[facetField]` sample annotation.
 * @public
 */
export function buildYMatrixFaceted(
    table: any[],
    categoryField: string,
    valueField: string,
    seriesField: string | undefined,
    facetField: string,
    reduce: 'sum' | 'average' = 'sum',
): CanvasXpressData {
    // Samples = distinct (category, facet) pairs, in encounter order.
    const sampleIndex = new Map<string, number>();
    const smps: string[] = [];        // display label = the category
    const facetAnno: string[] = [];   // the facet value per sample (x annotation)
    for (const row of table) {
        const cat = String(row[categoryField]);
        const fac = String(row[facetField]);
        const key = cat + '\u0000' + fac;
        if (!sampleIndex.has(key)) {
            sampleIndex.set(key, smps.length);
            smps.push(cat);
            facetAnno.push(fac);
        }
    }

    const vars = seriesField ? distinctValues(table, seriesField) : [valueField];
    const varIndex = new Map(vars.map((v, i) => [v, i]));

    const matrix: (number | null)[][] = vars.map(() => smps.map(() => null));
    const counts: number[][] = vars.map(() => smps.map(() => 0));
    for (const row of table) {
        const key = String(row[categoryField]) + '\u0000' + String(row[facetField]);
        const ci = sampleIndex.get(key);
        if (ci == null) continue;
        const ri = seriesField ? varIndex.get(String(row[seriesField])) : 0;
        if (ri == null) continue;
        const raw = row[valueField];
        const num = raw == null || raw === '' ? null : Number(raw);
        if (num == null || Number.isNaN(num)) continue;
        const prev = matrix[ri][ci];
        matrix[ri][ci] = prev == null ? num : prev + num;
        counts[ri][ci] += 1;
    }

    if (reduce === 'average') {
        for (let ri = 0; ri < vars.length; ri++) {
            for (let ci = 0; ci < smps.length; ci++) {
                const n = counts[ri][ci];
                if (n > 1 && matrix[ri][ci] != null) matrix[ri][ci] = (matrix[ri][ci] as number) / n;
            }
        }
    }

    return { y: { vars, smps, data: matrix }, x: { [facetField]: facetAnno } };
}
