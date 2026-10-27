// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Highcharts template registry.
 *
 * Mirrors the structure of echarts/templates/index.ts and
 * chartjs/templates/index.ts but with Highcharts template definitions.
 */

import { ChartTemplateDef } from '../../core/types';
import { hcScatterPlotDef } from './scatter';
import { hcBarChartDef, hcStackedBarChartDef, hcGroupedBarChartDef } from './bar';
import { hcLineChartDef, hcAreaChartDef } from './line';
import { hcPieChartDef, hcDoughnutChartDef } from './pie';
import { hcHistogramDef } from './histogram';
import { hcRadarChartDef } from './radar';
import { hcHeatmapDef } from './heatmap';
import { hcWaterfallChartDef } from './waterfall';
import { hcSunburstChartDef } from './sunburst';

/**
 * Highcharts chart template definitions, grouped by category.
 */
export const hcTemplateDefs: { [key: string]: ChartTemplateDef[] } = {
    'Scatter & Point': [hcScatterPlotDef],
    'Bar':             [hcBarChartDef, hcGroupedBarChartDef, hcStackedBarChartDef, hcHistogramDef],
    'Line & Area':     [hcLineChartDef, hcAreaChartDef],
    'Part-to-Whole':   [hcPieChartDef, hcDoughnutChartDef, hcSunburstChartDef],
    'Polar':           [hcRadarChartDef],
    'Statistical':     [hcHeatmapDef],
    'Other':           [hcWaterfallChartDef],
};

/**
 * Flat list of all Highcharts chart template definitions.
 */
export const hcAllTemplateDefs: ChartTemplateDef[] = Object.values(hcTemplateDefs).flat();

/**
 * Look up a Highcharts chart template definition by chart type name.
 */
export function hcGetTemplateDef(chartType: string): ChartTemplateDef | undefined {
    return hcAllTemplateDefs.find(t => t.chart === chartType);
}

/**
 * Get the available channels for a Highcharts chart type.
 */
export function hcGetTemplateChannels(chartType: string): string[] {
    return hcGetTemplateDef(chartType)?.channels || [];
}
