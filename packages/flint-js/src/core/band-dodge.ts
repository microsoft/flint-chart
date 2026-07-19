// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Band-dodge decision: does a secondary discrete channel (`color`, or an explicit
 * `group` field) subdivide a categorical axis band into side-by-side sub-lanes
 * ("dodge"), or is it redundant/nested with the axis (render one full-width glyph
 * per band, "nested")?
 *
 * This is the single source of truth shared by the layout engine
 * (`compute-layout.ts`) and every backend template that dodges by color/group
 * (VL boxplot/violin/grouped-bar, ECharts, Chart.js). Keeping the decision here
 * prevents the layout and the templates from drifting apart (the class of bug
 * where the band is budgeted for a different lane count than the glyph is sized
 * for). See `design-docs/boxplot-color-dodge-heuristic.md`.
 *
 * Two independent quantities, deliberately NOT the same number:
 *   - the **gate** (`dodge`): keyed off the max per-band sub-cardinality — "does
 *     any single band actually contain more than one sub-value?"
 *   - the **lane count** (`laneCount`): the *global* distinct sub-value count,
 *     because that is what a global band-offset scale (VL `xOffset`, an ECharts
 *     series-per-group, a Chart.js dataset-per-group) physically reserves per
 *     band. Sizing a glyph by the max-per-band instead would overlap in sparse
 *     cross-products.
 */

/** Default fraction of single-valued bands above which `auto` snaps to `none`
 *  (mostly-1:1 / dirty near-1:1 data). Tunable via `planBandDodge` options. */
export const DEFAULT_NESTED_SNAP_THRESHOLD = 0.9;

/** Resolved dodge mode (what actually renders). */
export type DodgeMode = 'none' | 'local' | 'global';

/** User-facing `dodge` chart-property values (`auto` defers to the compiler). */
export type DodgeOption = 'auto' | DodgeMode;

export interface BandDodgePlan {
    /** Compiler's recommended default mode. */
    mode: DodgeMode;
    /** Back-compat: does the recommendation subdivide the band? (`mode !== 'none'`). */
    dodge: boolean;
    /** Lanes a *global* offset scale reserves per band = global distinct
     *  sub-values (the `global` mode lane count). */
    laneCount: number;
    /** True when local and global dodge can produce different layouts. */
    ambiguous: boolean;
    /** Most distinct sub-values co-occurring within any single band. */
    maxPerBand: number;
    /** Global distinct sub-values. */
    global: number;
    /** Number of distinct axis bands. */
    bandCount: number;
}

export interface PlanBandDodgeOptions {
    /** Fraction of single-valued bands above which `auto` snaps to `none`.
     *  Defaults to {@link DEFAULT_NESTED_SNAP_THRESHOLD}. */
    nestedSnapThreshold?: number;
}

/** Pure recommendation from the per-band statistics. */
function recommendMode(
    maxPerBand: number,
    globalCount: number,
    nestedFraction: number,
    threshold: number,
): DodgeMode {
    // Nothing subdivides any band → full-width.
    if (maxPerBand <= 1) return 'none';
    // Mostly single-valued (a few dirty/outlier multi-color bands) → snap to
    // full-width rather than dodge the whole chart for a couple of rows.
    if (nestedFraction >= threshold) return 'none';
    // Every occupied band spans the full sub-domain → uniform global grid.
    if (maxPerBand >= globalCount) return 'global';
    // Sparse / spiky → compact, centered per-band lanes.
    return 'local';
}

/**
 * Decide whether `subField` dodges `axisField` for the given data.
 *
 * Confident zones (never ambiguous):
 *   - `maxPerBand <= 1`  → nested (redundant/nested with the axis; `color == x`
 *     or a 1:1 different-field pair).
 *   - `maxPerBand === global` → dodge (clean full cross-product).
 * Ambiguous zone (`1 < maxPerBand < global`, e.g. sparse cross-products or dirty
 * near-1:1 data): the `auto` lean is resolved by a configurable threshold on the
 * fraction of single-valued bands, and `ambiguous` is set so a host can surface
 * the toggle.
 */
export function planBandDodge(
    table: ReadonlyArray<Record<string, unknown>>,
    axisField: string,
    subField: string,
    options?: PlanBandDodgeOptions,
): BandDodgePlan {
    const perBand = new Map<unknown, Set<unknown>>();
    const global = new Set<unknown>();
    for (const row of table) {
        global.add(row[subField]);
        const key = row[axisField];
        let bandSet = perBand.get(key);
        if (!bandSet) perBand.set(key, (bandSet = new Set()));
        bandSet.add(row[subField]);
    }

    const globalCount = Math.max(1, global.size);
    const bandCount = perBand.size;
    let maxPerBand = 0;
    let singleValuedBands = 0;
    let completeBands = 0;
    for (const bandSet of perBand.values()) {
        if (bandSet.size > maxPerBand) maxPerBand = bandSet.size;
        if (bandSet.size <= 1) singleValuedBands++;
        if (bandSet.size === globalCount) completeBands++;
    }

    const threshold = options?.nestedSnapThreshold ?? DEFAULT_NESTED_SNAP_THRESHOLD;
    const nestedFraction = bandCount > 0 ? singleValuedBands / bandCount : 1;
    const mode = recommendMode(maxPerBand, globalCount, nestedFraction, threshold);

    return {
        mode,
        dodge: mode !== 'none',
        laneCount: globalCount,
        ambiguous: maxPerBand > 1 && completeBands < bandCount,
        maxPerBand,
        global: globalCount,
        bandCount,
    };
}

/** Number of sub-lanes a resolved mode reserves per band. */
export function laneCountForMode(plan: BandDodgePlan, mode: DodgeMode): number {
    if (mode === 'global') return plan.global;
    if (mode === 'local') return Math.max(1, plan.maxPerBand);
    return 1;
}

/**
 * Apply a user `dodge` override on top of a plan. `none`/`local`/`global` are
 * hard overrides; `auto` (or unset) follows the compiler recommendation. A dodge
 * mode is downgraded to `none` when nothing actually subdivides a band
 * (`maxPerBand <= 1`), so forcing dodge on redundant color can't collapse it.
 */
export function resolveDodge(
    plan: BandDodgePlan,
    override?: string,
): { mode: DodgeMode; laneCount: number } {
    let mode: DodgeMode =
        override === 'none' || override === 'local' || override === 'global'
            ? override
            : plan.mode;
    if (mode !== 'none' && plan.maxPerBand <= 1) mode = 'none';
    return { mode, laneCount: laneCountForMode(plan, mode) };
}

// ---------------------------------------------------------------------------
// Back-compat shim (pre-`local` callers that only need a dodge boolean).
// `local` currently renders via the global offset path, so its lane count is
// the global one until the per-backend `local` renderer lands (Stage 2).
// ---------------------------------------------------------------------------

/** @deprecated user-facing values; prefer {@link DodgeOption}. */
export type ColorLayoutMode = DodgeOption;

/** @deprecated prefer {@link resolveDodge}. Maps the mode to a dodge boolean and
 *  the global lane count (the only lane count the current renderers support). */
export function resolveBandDodge(
    plan: BandDodgePlan,
    override?: string,
): { dodge: boolean; laneCount: number } {
    // Legacy override spellings → new modes.
    const normalized = override === 'dodge' ? 'global' : override === 'nested' ? 'none' : override;
    const { mode } = resolveDodge(plan, normalized);
    return { dodge: mode !== 'none', laneCount: plan.laneCount };
}
