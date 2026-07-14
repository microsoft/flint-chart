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

/** Default fraction of bands that must be single-valued for `auto` to snap to
 *  `nested` in the ambiguous zone. Tunable via `planBandDodge` options. */
export const DEFAULT_NESTED_SNAP_THRESHOLD = 0.9;

export interface BandDodgePlan {
    /** `auto` recommendation: subdivide the band into sub-lanes? */
    dodge: boolean;
    /** Sub-lanes a global offset scale reserves per band = global distinct
     *  sub-values. Meaningful whenever the caller decides to dodge. */
    laneCount: number;
    /** True in the uncertain regime (`1 < maxPerBand < global`) where a
     *  user-facing toggle should be surfaced instead of trusting `auto`. */
    ambiguous: boolean;
    /** Most distinct sub-values co-occurring within any single band. */
    maxPerBand: number;
    /** Global distinct sub-values (== `laneCount`). */
    global: number;
}

export interface PlanBandDodgeOptions {
    /** Fraction of single-valued bands above which `auto` snaps to `nested` in
     *  the ambiguous zone. Defaults to {@link DEFAULT_NESTED_SNAP_THRESHOLD}. */
    nestedSnapThreshold?: number;
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
    for (const bandSet of perBand.values()) {
        if (bandSet.size > maxPerBand) maxPerBand = bandSet.size;
        if (bandSet.size <= 1) singleValuedBands++;
    }

    // Confident: no band holds more than one sub-value → nested.
    if (maxPerBand <= 1) {
        return { dodge: false, laneCount: globalCount, ambiguous: false, maxPerBand, global: globalCount };
    }
    // Confident: every occupied band spans the full sub-domain → real 2nd dim.
    if (maxPerBand === globalCount) {
        return { dodge: true, laneCount: globalCount, ambiguous: false, maxPerBand, global: globalCount };
    }

    // Ambiguous: resolve the `auto` lean via the snap threshold.
    const threshold = options?.nestedSnapThreshold ?? DEFAULT_NESTED_SNAP_THRESHOLD;
    const nestedFraction = bandCount > 0 ? singleValuedBands / bandCount : 1;
    const dodge = nestedFraction < threshold;
    return { dodge, laneCount: globalCount, ambiguous: true, maxPerBand, global: globalCount };
}

/** User-facing `colorLayout` chart-property values. */
export type ColorLayoutMode = 'auto' | 'dodge' | 'nested';

/**
 * Apply a user `colorLayout` override on top of a plan. `dodge`/`nested` are hard
 * overrides; `auto` (or anything else) follows the plan's recommendation. The
 * lane count is always the plan's global-derived value.
 */
export function resolveBandDodge(
    plan: BandDodgePlan,
    override?: string,
): { dodge: boolean; laneCount: number } {
    if (override === 'dodge') return { dodge: true, laneCount: plan.laneCount };
    if (override === 'nested') return { dodge: false, laneCount: plan.laneCount };
    return { dodge: plan.dodge, laneCount: plan.laneCount };
}
