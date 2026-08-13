// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Image-Charts chart-type mapping.
 *
 * Image-Charts renders through a fixed set of `cht` chart codes (the Google
 * Image Charts / Image-Charts query grammar), so a Flint chart type maps to the
 * closest native `cht`. Orientation (vertical vs horizontal) is decided by the
 * assembler from channel semantics and selects the `bv*` vs `bh*` family.
 *
 * Coverage is partial by design (like the Excel backend): only chart types with
 * a faithful `cht` equivalent are mapped. Everything else throws in `assemble`.
 */

/** Which Image-Charts `cht` family a Flint chart type maps to. */
export interface ImageChartsTypeMapping {
    /** Base Image-Charts `cht` value (vertical / category-on-x orientation). */
    cht: string;
    /** `cht` for the horizontal (category-on-y) variant, when supported. */
    horizontal?: string;
    /** True for pie/doughnut charts: slice labels, no value/category axes. */
    noAxes?: boolean;
    /** True for XY (both-measure) scatter charts rendered as `lxy`. */
    xy?: boolean;
    /** True for radar charts, which use the `chxt=r` polar axis. */
    radar?: boolean;
    /** True for area charts: a line (`lc`) plus a `chm=B` fill to the baseline. */
    area?: boolean;
}

/** Flint chart type (display name) → Image-Charts `cht` family. */
export const IMAGE_CHARTS_TYPE_MAP: Record<string, ImageChartsTypeMapping> = {
    'Bar Chart': { cht: 'bvg', horizontal: 'bhg' },
    'Grouped Bar Chart': { cht: 'bvg', horizontal: 'bhg' },
    'Stacked Bar Chart': { cht: 'bvs', horizontal: 'bhs' },
    'Line Chart': { cht: 'lc' },
    'Sparkline': { cht: 'ls' },
    'Area Chart': { cht: 'lc', area: true },
    'Scatter Plot': { cht: 'lxy', xy: true },
    'Pie Chart': { cht: 'p', noAxes: true },
    'Donut Chart': { cht: 'pd', noAxes: true },
    'Radar Chart': { cht: 'r', radar: true },
};

/** Chart types this backend can render as an Image-Charts URL. */
export function isImageChartsSupported(flintChartType: string): boolean {
    return flintChartType in IMAGE_CHARTS_TYPE_MAP;
}
