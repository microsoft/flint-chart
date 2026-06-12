// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Chart.js template registry.
 *
 * Mirrors the structure of echarts/templates/index.ts and
 * vegalite/templates/index.ts but with Chart.js template definitions.
 */

import { ChartTemplateDef } from '../../core/types';
import { cjsScatterPlotDef } from './scatter';
import { cjsBubbleChartDef } from './bubble';
import { cjsBarChartDef, cjsStackedBarChartDef, cjsGroupedBarChartDef } from './bar';
import { cjsComboChartDef } from './combo';
import { cjsLineChartDef } from './line';
import { cjsAreaChartDef } from './area';
import { cjsPieChartDef } from './pie';
import { cjsDoughnutChartDef } from './doughnut';
import { cjsHistogramDef } from './histogram';
import { cjsRadarChartDef } from './radar';
import { cjsRoseChartDef } from './rose';

/**
 * Chart.js chart template definitions, grouped by category.
 */
export const cjsTemplateDefs: { [key: string]: ChartTemplateDef[] } = {
    'Scatter & Point': [cjsScatterPlotDef, cjsBubbleChartDef],
    'Bar':             [cjsBarChartDef, cjsGroupedBarChartDef, cjsStackedBarChartDef, cjsComboChartDef, cjsHistogramDef],
    'Line & Area':     [cjsLineChartDef, cjsAreaChartDef],
    'Part-to-Whole':   [cjsPieChartDef, cjsDoughnutChartDef],
    'Polar':           [cjsRadarChartDef, cjsRoseChartDef],
};

/**
 * Flat list of all Chart.js chart template definitions.
 */
export const cjsAllTemplateDefs: ChartTemplateDef[] = Object.values(cjsTemplateDefs).flat();

/**
 * Look up a Chart.js chart template definition by chart type name.
 */
export function cjsGetTemplateDef(chartType: string): ChartTemplateDef | undefined {
    return cjsAllTemplateDefs.find(t => t.chart === chartType);
}

/**
 * Get the available channels for a Chart.js chart type.
 */
export function cjsGetTemplateChannels(chartType: string): string[] {
    return cjsGetTemplateDef(chartType)?.channels || [];
}
