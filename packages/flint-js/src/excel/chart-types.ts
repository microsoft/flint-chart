// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Excel chart-type mapping + FormatSpec → Excel number format.
 *
 * Excel's native chart types are a fixed enum (`Excel.ChartType`), so a Flint
 * chart type maps to the closest native Excel chart. Orientation (vertical vs
 * horizontal) is decided by the assembler from channel semantics and selects
 * the Column* vs Bar* family.
 */

import type { FormatSpec } from '../core/field-semantics';

/** Which native Excel family a Flint chart maps to. */
export interface ExcelTypeMapping {
    /** Vertical (category on x) Excel.ChartType. */
    vertical: string;
    /** Horizontal (category on y) Excel.ChartType, when the family supports it. */
    horizontal?: string;
    /** True for pie/doughnut/… charts that have no value/category axes. */
    noAxes?: boolean;
    /** True for XY (both-measure) charts. */
    xy?: boolean;
}

/** Flint chart type (display name) → Excel chart family. */
export const EXCEL_TYPE_MAP: Record<string, ExcelTypeMapping> = {
    'Bar Chart': { vertical: 'ColumnClustered', horizontal: 'BarClustered' },
    'Grouped Bar Chart': { vertical: 'ColumnClustered', horizontal: 'BarClustered' },
    'Stacked Bar Chart': { vertical: 'ColumnStacked', horizontal: 'BarStacked' },
    'Pyramid Chart': { vertical: 'BarStacked', horizontal: 'BarStacked' },
    'Histogram': { vertical: 'ColumnClustered' },
    'Line Chart': { vertical: 'Line' },
    'Area Chart': { vertical: 'Area', horizontal: undefined },
    'Scatter Plot': { vertical: 'XYScatter', xy: true },
    'Connected Scatter Plot': { vertical: 'XYScatterLines', xy: true },
    'Pie Chart': { vertical: 'Pie', noAxes: true },
    'Donut Chart': { vertical: 'Doughnut', noAxes: true },
    'Boxplot': { vertical: 'BoxWhisker' },
    'Candlestick Chart': { vertical: 'StockOHLC' },
    'Waterfall Chart': { vertical: 'Waterfall' },
    'Radar Chart': { vertical: 'RadarMarkers' },
    'Funnel Chart': { vertical: 'Funnel', noAxes: true },
    'Treemap': { vertical: 'Treemap', noAxes: true },
    'Sunburst Chart': { vertical: 'Sunburst', noAxes: true },
};

/** Chart types this backend can render natively in Excel. */
export function isExcelSupported(flintChartType: string): boolean {
    return flintChartType in EXCEL_TYPE_MAP;
}

/**
 * Map a Flint {@link FormatSpec} to an Excel number-format string.
 *
 * Excel formats are pattern strings (`"$#,##0"`, `"0.0%"`, `"#,##0"`), distinct
 * from d3/Vega patterns, so we translate from the FormatSpec's intent (prefix,
 * suffix, abbreviate) rather than its d3 `pattern`.
 */
export function formatSpecToExcel(fmt: FormatSpec | undefined): string | undefined {
    if (!fmt) return undefined;
    const prefix = fmt.prefix ?? '';
    const suffix = fmt.suffix ?? '';
    const pat = fmt.pattern ?? '';

    // percent
    if (suffix === '%' || pat.includes('%')) {
        const decimals = decimalsFromPattern(pat);
        return decimals > 0 ? `0.${'0'.repeat(decimals)}%` : '0%';
    }

    // decide the numeric core
    const decimals = decimalsFromPattern(pat);
    let core = decimals > 0 ? `#,##0.${'0'.repeat(decimals)}` : '#,##0';
    if (fmt.abbreviate) core = '#,##0,"K"'; // thousands abbreviation (approx)

    const pre = prefix ? escapeLiteral(prefix) : '';
    const suf = suffix ? escapeLiteral(suffix) : '';
    if (!pre && !suf && !fmt.abbreviate && decimals === 0) return 'General';
    return `${pre}${core}${suf}`;
}

/** Number of fractional digits requested by a d3-ish pattern (best-effort). */
function decimalsFromPattern(pat: string): number {
    const m = pat.match(/\.(\d+)/);
    return m ? Number(m[1]) : 0;
}

/** Wrap non-numeric literal text so Excel treats it literally in a format. */
function escapeLiteral(s: string): string {
    // A leading/trailing currency symbol is fine bare; wrap other text in quotes.
    if (s === '$' || s === '€' || s === '£' || s === '¥') return s;
    return `"${s}"`;
}
