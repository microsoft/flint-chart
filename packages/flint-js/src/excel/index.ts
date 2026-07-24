// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * @module flint-chart/excel
 *
 * Excel backend for flint-chart.
 *
 * Compiles the core semantic layer into a native Office.js Excel chart spec
 * (a wide/matrix data range + chart type, axes, legend). A host renders it via
 * the Office.js Excel API (`sheet.charts.add(...)` + `chart.getImage()`).
 *
 * Architecture contrast with other backends:
 *   VL:    encoding-channel-based — { encoding: { x, y }, mark }
 *   EC:    series-based           — { series: [...], xAxis, yAxis }
 *   CJS:   dataset-based          — { type, data: { labels, datasets } }
 *   Excel: range/matrix-based     — { chartType, data: [[...]], seriesBy, axes }
 *
 * Same core Phase 0 (semantics); Excel-specific Stage 3 output.
 */

export { assembleExcel } from './assemble';
export {
    EXCEL_ARTIFACT_SCHEMA,
    SUPPORTED_EXCEL_CHART_TYPES,
    excelColumnLetter,
    prepareExcelArtifact,
} from './artifact';
export type { PreparedExcelArtifact } from './artifact';
export { generateOfficeJs } from './codegen';
export type { GeneratedOfficeJs, OfficeJsCodegenOptions } from './codegen';
export { renderExcelChart } from './runtime';
export type { ExcelRenderOptions, ExcelRenderResult, OfficeJsExcelApi } from './runtime';
export { EXCEL_TYPE_MAP, isExcelSupported, formatSpecToExcel } from './chart-types';
export {
    excelAllTemplateDefs,
    excelGetTemplateDef,
    excelGetTemplateChannels,
} from './templates';
export type { ExcelTemplateContext, ExcelTemplateDef } from './templates';
export type {
    ExcelChartSpec,
    ExcelNativeChartSpec,
    ExcelNativeSeriesSpec,
    ExcelNativeSeriesFormatSpec,
    ExcelAxisSpec,
    ExcelLegendSpec,
    ExcelDataLabelsSpec,
    ExcelBoxWhiskerOptionsSpec,
    ExcelSeriesBy,
    ExcelLegendPosition,
} from './types';
