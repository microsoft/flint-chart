// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ExcelTemplateDef } from './types';
import { excelAreaChartDef } from './area';
import { excelBarChartDef, excelGroupedBarChartDef, excelStackedBarChartDef } from './bar';
import { excelBoxplotDef } from './boxplot';
import { excelCandlestickDef } from './candlestick';
import { excelFunnelChartDef } from './funnel';
import { excelHistogramDef } from './histogram';
import { excelLineChartDef } from './line';
import { excelDonutChartDef, excelPieChartDef } from './pie';
import { excelPyramidChartDef } from './pyramid';
import { excelRadarChartDef } from './radar';
import { excelConnectedScatterPlotDef, excelScatterPlotDef } from './scatter';
import { excelSunburstChartDef } from './sunburst';
import { excelTreemapDef } from './treemap';
import { excelWaterfallChartDef } from './waterfall';

export const excelAllTemplateDefs: ExcelTemplateDef[] = [
    excelBarChartDef,
    excelGroupedBarChartDef,
    excelStackedBarChartDef,
    excelPyramidChartDef,
    excelLineChartDef,
    excelAreaChartDef,
    excelScatterPlotDef,
    excelConnectedScatterPlotDef,
    excelPieChartDef,
    excelDonutChartDef,
    excelHistogramDef,
    excelBoxplotDef,
    excelCandlestickDef,
    excelWaterfallChartDef,
    excelRadarChartDef,
    excelFunnelChartDef,
    excelTreemapDef,
    excelSunburstChartDef,
];

export function excelGetTemplateDef(chartType: string): ExcelTemplateDef | undefined {
    return excelAllTemplateDefs.find((template) => template.chart === chartType);
}

export function excelGetTemplateChannels(chartType: string): string[] {
    return excelGetTemplateDef(chartType)?.channels ?? [];
}

export type { ExcelTemplateContext, ExcelTemplateDef } from './types';