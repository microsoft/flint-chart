// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * CanvasXpress template registry.
 *
 * Mirrors echarts/templates/index.ts: category-grouped ChartTemplateDefs plus
 * cxGetTemplateDef(chartType) = find(t => t.chart === chartType).
 *
 * This first PR registers 29 chart types:
 *   - the four acceptance charts (Bar / Line / Area / Scatter);
 *   - seven statistical charts whose computation very closely matches R (Boxplot, Violin,
 *     Histogram, Density, Density Contour, Regression, Streamgraph);
 *   - eighteen CanvasXpress-exclusive charts that no other backend renders
 *     (survival, genomics, set relationships, networks, flows, …).
 * Bar/Line/Area share the y-matrix builder (buildYMatrix); Scatter uses its own
 * point builder (see scatter.ts). The remaining cross-backend parity charts
 * (grouped/stacked bar, pie, radar, heatmap, …) follow in a separate PR, per the
 * "cross-backend parity is a goal" note.
 */

import { ChartTemplateDef } from '../../core/types';
import { cxBarChartDef } from './bar';
import { cxLineChartDef } from './line';
import { cxAreaChartDef, cxStreamgraphDef } from './area';
import { cxBoxplotDef, cxViolinDef } from './boxplot';
import { cxHistogramDef, cxDensityDef } from './histogram';
import { cxDensityContourDef } from './contour';
import { cxRegressionDef } from './regression';
import { cxKaplanMeierDef } from './km';
import { cxVolcanoDef } from './volcano';
import { cxVennDef } from './venn';
import { cxNetworkDef } from './network';
import { cxClusteredHeatmapDef } from './clustermap';
import { cxCorrelationDef } from './correlation';
import { cxSankeyDef } from './sankey';
import { cxChordDef } from './chord';
import { cxCircosDef } from './circos';
import { cxLoessDef } from './loess';
import { cxSplomDef } from './splom';
import { cxGenomeDef } from './genome';
import { cxUpSetDef } from './upset';
import { cxOncoprintDef } from './oncoprint';
import { cxScatterPlotDef } from './scatter';
import { cxScatter3DDef } from './scatter3d';
import { cxBubbleDef } from './bubble';
import { cxTagCloudDef } from './tagcloud';
import { cxTreeDef } from './tree';

/** CanvasXpress chart template definitions, grouped by category. */
export const cxTemplateDefs: { [key: string]: ChartTemplateDef[] } = {
    'Bar':             [cxBarChartDef],
    'Line & Area':     [cxLineChartDef, cxAreaChartDef, cxStreamgraphDef],
    // Statistical charts: the engine computes the summary itself (quartiles, kernel
    // density, 2-D density contours, bins, stream smoothing) and very closely
    // reproduces R's results.
    'Distributions':   [cxBoxplotDef, cxViolinDef, cxHistogramDef, cxDensityDef, cxDensityContourDef],
    'Part-to-whole & Matrix': [cxBubbleDef, cxTagCloudDef],
    // Scientific / CanvasXpress-exclusive charts — chart types the generic grammar
    // does not define and no other flint backend can render.
    'Scientific':      [cxKaplanMeierDef, cxVolcanoDef, cxVennDef, cxUpSetDef, cxOncoprintDef, cxNetworkDef, cxClusteredHeatmapDef, cxCorrelationDef, cxSankeyDef, cxChordDef, cxCircosDef, cxLoessDef, cxSplomDef, cxGenomeDef, cxTreeDef],
    'Scatter & Point': [cxScatterPlotDef, cxScatter3DDef, cxRegressionDef],
};

/** Flat list of all CanvasXpress template definitions. */
export const cxAllTemplateDefs: ChartTemplateDef[] = Object.values(cxTemplateDefs).flat();

/** Look up a CanvasXpress template by chart type name. */
export function cxGetTemplateDef(chartType: string): ChartTemplateDef | undefined {
    return cxAllTemplateDefs.find(t => t.chart === chartType);
}

/** Get the available channels for a CanvasXpress chart type. */
export function cxGetTemplateChannels(chartType: string): string[] {
    return cxGetTemplateDef(chartType)?.channels || [];
}
