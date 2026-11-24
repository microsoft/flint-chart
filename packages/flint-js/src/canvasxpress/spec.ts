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
 * Build a y-matrix from tabular rows.
 *
 * @param table        Post-overflow data rows (ctx.table).
 * @param categoryField Field whose values become `smps` (the banded axis).
 * @param valueField    Field whose values fill the matrix (the measure).
 * @param seriesField   Optional field whose values become `vars` (the color/group split);
 *                      when absent, a single row keyed by `valueField` is produced.
 * @returns A CanvasXpressData y-matrix, nulls where a (series, category) pair is absent.
 */
export function buildYMatrix(
    table: any[],
    categoryField: string,
    valueField: string,
    seriesField?: string,
): CanvasXpressData {
    const smps = distinctValues(table, categoryField);
    const smpIndex = new Map(smps.map((s, i) => [s, i]));
    const vars = seriesField ? distinctValues(table, seriesField) : [valueField];
    const varIndex = new Map(vars.map((v, i) => [v, i]));

    const matrix: (number | null)[][] = vars.map(() => smps.map(() => null));
    for (const row of table) {
        const ci = smpIndex.get(String(row[categoryField]));
        if (ci == null) continue;
        const ri = seriesField ? varIndex.get(String(row[seriesField])) : 0;
        if (ri == null) continue;
        const raw = row[valueField];
        const num = raw == null || raw === '' ? null : Number(raw);
        matrix[ri][ci] = Number.isNaN(num as number) ? null : num;
    }

    return { y: { vars, smps, data: matrix } };
}
