// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Excel backend types.
 *
 * The Excel "native spec" is a declarative description of an Office.js chart:
 * a wide/matrix data range plus chart type, axes, legend, and series config.
 * A host renders it imperatively via the Office.js Excel API
 * (`sheet.charts.add(type, range, seriesBy)` + `chart.getImage()`).
 *
 * This mirrors how the other backends emit a native artifact (Vega-Lite spec,
 * ECharts option, Chart.js config) — here the artifact targets Excel charts.
 */

import type { ChartWarning } from '../core/types';

/** Excel `ChartSeriesBy` orientation. */
export type ExcelSeriesBy = 'Columns' | 'Rows';

/** Excel `ChartLegendPosition` (subset we emit). */
export type ExcelLegendPosition = 'Top' | 'Bottom' | 'Left' | 'Right';

export interface ExcelAxisSpec {
    /** Axis title text (from the field display name). */
    title?: string;
    /** Native Excel category-axis interpretation. */
    categoryType?: 'DateAxis' | 'TextAxis';
    /** Base unit used by a native Excel date axis. */
    baseTimeUnit?: 'Days' | 'Months' | 'Years';
    /** Unit associated with `majorUnit` on a native Excel date axis. */
    majorTimeUnitScale?: 'Days' | 'Months' | 'Years';
    /** Axis-label font size in points, used when dense categories need explicit sizing. */
    labelFontSize?: number;
    /** Number of categories between displayed labels; underlying data stays intact. */
    tickLabelSpacing?: number;
    /** Excel number format string, e.g. `"$#,##0"`, `"0.0%"`, `"#,##0"`. */
    numberFormat?: string;
    /** Reverse Excel's native category plotting order (horizontal nominal bars). */
    reversePlotOrder?: boolean;
    /** Explicit native-axis minimum, used for zero-anchored length/area charts. */
    minimumScale?: number;
    /** Explicit native-axis maximum, used to avoid excessive automatic headroom. */
    maximumScale?: number;
    /** Interval between major ticks on a numeric axis. */
    majorUnit?: number;
}

export interface ExcelLegendSpec {
    visible: boolean;
    position?: ExcelLegendPosition;
}

export interface ExcelDataLabelsSpec {
    visible: boolean;
    position?: 'BestFit' | 'Center' | 'InsideBase' | 'InsideEnd' | 'OutsideEnd';
    numberFormat?: string;
    fontColor?: string;
    fontSize?: number;
}

export interface ExcelNativeSeriesSpec {
    /** Legend/series name. */
    name: string;
    /** Zero-based worksheet column containing X values, excluding the header row. */
    xColumn: number;
    /** Zero-based worksheet column containing Y values, excluding the header row. */
    yColumn: number;
    /** Number of populated worksheet rows in this series. */
    rowCount: number;
    /** Optional zero-based worksheet column containing bubble sizes. */
    bubbleSizeColumn?: number;
}

export interface ExcelNativeSeriesFormatSpec {
    /** Native HTML color shared by related series segments. */
    color?: string;
    /** Excel.ChartLineStyle string. */
    lineStyle?: 'Continuous' | 'Dash' | 'DashDot' | 'DashDotDot' | 'Dot' | 'RoundDot';
}

export interface ExcelBoxWhiskerOptionsSpec {
    quartileCalculation?: 'Inclusive' | 'Exclusive';
    showInnerPoints?: boolean;
    showMeanLine?: boolean;
    showMeanMarker?: boolean;
    showOutlierPoints?: boolean;
}

interface ExcelRenderSpecBase {
    /** Stable discriminator for serialized Flint Excel artifacts. */
    schema: 'flint.excel.chart/v1';
    /** Chart title. */
    title?: string;
    /** Source values written to the worksheet. */
    data: Array<Array<string | number | null>>;
    /** Target width/height in points (from Flint layout / baseSize). */
    width?: number;
    height?: number;
    /** Flint assembler warnings (overflow, etc.). */
    warnings?: ChartWarning[];
    /** Provenance for debugging (not consumed by the renderer). */
    _flint?: Record<string, unknown>;
}

/** A conventional native Excel chart rendered through `Chart.getImage()`. */
export interface ExcelNativeChartSpec extends ExcelRenderSpecBase {
    kind: 'chart';
    /**
     * The Office.js `Excel.ChartType` enum string, e.g. `"ColumnClustered"`,
     * `"BarStacked"`, `"Line"`, `"XYScatter"`, `"Pie"`.
     */
    chartType: string;
    /** Whether series run down columns or across rows of the data range. */
    seriesBy: ExcelSeriesBy;
    /** Explicit bindings for XY/bubble series when Excel cannot infer grouped ranges. */
    series?: ExcelNativeSeriesSpec[];
    /** Formatting aligned with the rendered series order. */
    seriesFormats?: ExcelNativeSeriesFormatSpec[];
    /** Category (label) axis. Absent for pie/doughnut (no axes). */
    categoryAxis?: ExcelAxisSpec;
    /** Value (measure) axis. Absent for pie/doughnut. */
    valueAxis?: ExcelAxisSpec;
    /** Legend visibility + position. */
    legend?: ExcelLegendSpec;
    /** Native chart data labels. */
    dataLabels?: ExcelDataLabelsSpec;
    /** Bar/column gap width (%) — bar family only. */
    gapWidth?: number;
    /** Bar/column series overlap (%) — 2-D bar family only. */
    overlap?: number;
    /** Excel bubble-size percentage (0-300), applied to every bubble series. */
    bubbleScale?: number;
    /** Doughnut hole size percentage (10-90), applied to every doughnut series. */
    doughnutHoleSize?: number;
    /** Statistical options applied to every native box-and-whisker series. */
    boxWhiskerOptions?: ExcelBoxWhiskerOptionsSpec;
    /** Display native connector lines between Waterfall points. */
    showConnectorLines?: boolean;
}

/** A backend-native Excel chart artifact. */
export type ExcelChartSpec = ExcelNativeChartSpec;

/** Preferred name for the backend artifact; retained alongside ExcelChartSpec. */
export type ExcelRenderSpec = ExcelChartSpec;
