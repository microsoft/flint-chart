// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly template registry.
 *
 * Mirrors the structure of chartjs/templates/index.ts, echarts/templates/index.ts
 * and vegalite/templates/index.ts but with Plotly template definitions.
 *
 * First-merge scope (see docs/adding-a-backend.md §6): the four acceptance
 * templates. Further templates are follow-ups.
 */

import { ChartTemplateDef } from '../../core/types';
import { plBarChartDef } from './bar';
import { plLineChartDef } from './line';
import { plAreaChartDef } from './area';
import { plScatterPlotDef } from './scatter';

/**
 * Plotly chart template definitions, grouped by category.
 */
export const plTemplateDefs: { [key: string]: ChartTemplateDef[] } = {
    'Scatter & Point': [plScatterPlotDef],
    'Bar':             [plBarChartDef],
    'Line & Area':     [plLineChartDef, plAreaChartDef],
};

/**
 * Flat list of all Plotly chart template definitions.
 */
export const plAllTemplateDefs: ChartTemplateDef[] = Object.values(plTemplateDefs).flat();

/**
 * Look up a Plotly chart template definition by chart type name.
 */
export function plGetTemplateDef(chartType: string): ChartTemplateDef | undefined {
    return plAllTemplateDefs.find(t => t.chart === chartType);
}

/**
 * Get the available channels for a Plotly chart type.
 */
export function plGetTemplateChannels(chartType: string): string[] {
    return plGetTemplateDef(chartType)?.channels || [];
}
