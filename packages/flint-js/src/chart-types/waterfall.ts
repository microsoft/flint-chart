// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Shared waterfall "totals" semantics, used by every backend template
 * (Vega-Lite / ECharts / Chart.js) and by the `totals` property `check` so the
 * options UI and the rendered chart never disagree on the default.
 *
 * A waterfall bar is either a *delta* (floats off the running cumulative) or a
 * *total* (anchored at zero, "touches down" to the running cumulative). When
 * the data has no explicit type column, Flint infers which ends are totals.
 * The user's `totals` property is purely an *override* of that inference.
 */

export type WaterfallTotalsMode = 'none' | 'first' | 'last' | 'both';

/**
 * True when the final value reconciles with the running cumulative of every
 * prior row — i.e. the last row reads like a genuine grand-total restatement
 * (`last ≈ Σ prior`). Tolerance is relative (0.5% of the cumulative) with a
 * tiny absolute floor for near-zero totals. Non-finite values never reconcile.
 */
export function waterfallLastReconciles(values: number[]): boolean {
    if (values.length < 2) return false;
    let cumPrev = 0;
    for (let i = 0; i < values.length - 1; i++) {
        if (!Number.isFinite(values[i])) return false;
        cumPrev += values[i];
    }
    const last = values[values.length - 1];
    if (!Number.isFinite(last)) return false;
    const tol = Math.max(1e-6, 0.005 * Math.abs(cumPrev));
    return Math.abs(last - cumPrev) <= tol;
}

/**
 * The compiler's inferred default when the user hasn't set `totals` and there
 * is no explicit type column. The first bar is always a reasonable start total;
 * the last bar is only treated as a total when it reconciles with the prior
 * cumulative — otherwise it stays a floating delta.
 */
export function recommendedTotalsMode(values: number[]): 'first' | 'both' {
    return waterfallLastReconciles(values) ? 'both' : 'first';
}

/**
 * Resolve the effective totals mode: a valid explicit user value wins;
 * anything else (undefined, or the UI default 'auto') falls back to the
 * data-aware recommendation.
 */
export function resolveTotalsMode(values: number[], explicit?: unknown): WaterfallTotalsMode {
    if (explicit === 'none' || explicit === 'first' || explicit === 'last' || explicit === 'both') {
        return explicit;
    }
    return recommendedTotalsMode(values);
}