// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly template registry.
 *
 * Mirrors the structure of chartjs/templates/index.ts, echarts/templates/index.ts
 * and vegalite/templates/index.ts but with Plotly template definitions.
 *
 * Coverage: the four original acceptance templates (Bar, Line, Area, Scatter)
 * plus an expressive tranche mirroring most of the Vega-Lite catalog (grouped/
 * stacked bar, distributions, circular charts, specialized native-trace charts),
 * two Plotly opportunity charts (Funnel, Gauge) that showcase native
 * `indicator`/`funnel` traces ECharts otherwise hand-builds, native geo charts
 * (Map, Choropleth — Plotly's own `scattergeo`/`choropleth` built-in atlas, no
 * TopoJSON fetch/join needed), and two composite table/strip layouts
 * (Sparkline, Bar Table) built as self-contained Plotly figures (own axis
 * grid + paper-anchored annotations) rather than forced through the generic
 * cartesian column/row facet combiner (`facet.ts`), which only supports one
 * axis pair per panel. See `sparkline.ts` / `bar-table.ts` for the composite
 * layout technique and `selfManagesFacets` in `../assemble.ts`.
 */

import { ChartTemplateDef } from '../../core/types';
import { plBarChartDef, plGroupedBarChartDef, plStackedBarChartDef, plPyramidChartDef } from './bar';
import { plLineChartDef } from './line';
import { plAreaChartDef } from './area';
import { plScatterPlotDef } from './scatter';
import { plHistogramDef } from './histogram';
import { plPieChartDef, plDonutChartDef } from './pie';
import { plRadarChartDef } from './radar';
import { plRoseChartDef } from './rose';
import { plBoxplotDef } from './boxplot';
import { plViolinPlotDef } from './violin';
import { plDensityPlotDef } from './density';
import { plEcdfPlotDef } from './ecdf';
import { plStripPlotDef } from './jitter';
import { plConnectedScatterDef } from './connected-scatter';
import { plRangeAreaChartDef } from './range-area';
import { plStreamgraphDef } from './streamgraph';
import { plSlopeChartDef } from './slope';
import { plBumpChartDef } from './bump';
import { plWaterfallChartDef } from './waterfall';
import { plCandlestickChartDef } from './candlestick';
import { plHeatmapDef } from './heatmap';
import { plLollipopChartDef } from './lollipop';
import { plBulletChartDef } from './bullet';
import { plGanttChartDef } from './gantt';
import { plRangedDotPlotDef } from './ranged-dot';
import { plRegressionDef } from './regression';
import { plKpiCardDef } from './kpi-card';
import { plFunnelChartDef } from './funnel';
import { plGaugeChartDef } from './gauge';
import { plMapDef } from './map';
import { plChoroplethDef } from './choropleth';
import { plSparklineDef } from './sparkline';
import { plBarTableDef } from './bar-table';

/**
 * Plotly chart template definitions, grouped by category.
 */
export const plTemplateDefs: { [key: string]: ChartTemplateDef[] } = {
    'Scatter & Point': [plScatterPlotDef, plRegressionDef, plConnectedScatterDef, plRangedDotPlotDef, plStripPlotDef],
    'Bar':             [plBarChartDef, plGroupedBarChartDef, plStackedBarChartDef, plLollipopChartDef, plWaterfallChartDef, plPyramidChartDef],
    'Distributions':   [plHistogramDef, plBoxplotDef, plViolinPlotDef, plDensityPlotDef, plEcdfPlotDef, plCandlestickChartDef],
    'Line & Area':     [plLineChartDef, plAreaChartDef, plBumpChartDef, plSlopeChartDef, plStreamgraphDef, plRangeAreaChartDef],
    'Circular':        [plPieChartDef, plDonutChartDef, plRadarChartDef, plRoseChartDef],
    'Tables & KPIs':   [plHeatmapDef, plGanttChartDef, plBulletChartDef, plKpiCardDef, plSparklineDef, plBarTableDef],
    'Maps':            [plMapDef, plChoroplethDef],
    'Opportunity':     [plFunnelChartDef, plGaugeChartDef],
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
