// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * @module flint-chart/plotly
 *
 * Plotly backend for flint-chart.
 *
 * Compiles the core semantic layer into Plotly figure objects.
 * Contains PL-specific assembly, spec instantiation, and chart templates.
 *
 * Architecture contrast with other backends:
 *   VL: encoding-channel-based — { encoding: { x: { field, type }, y: ... } }
 *   EC: series-based           — { series: [{ type, data }], xAxis, yAxis }
 *   CJS: dataset-based         — { type, data: { labels, datasets[] }, options }
 *   PL: trace-based            — { data: [{ type, x, y }], layout }
 *
 * Same core pipeline (Phase 0 + Phase 1), different Phase 2 output.
 * Figures are pure JSON (no callback functions).
 */

// PL assembly function
export { assemblePlotly, getPlotlyPivot, getPlotlyTransform } from './assemble';

// PL spec instantiation (Phase 2)
export { plApplyLayoutToSpec, plApplyTooltips } from './instantiate-spec';

// PL theme realization (stage 3)
export { realizeThemePlotly, realizeValueLabelsPlotly, plCollectMarkTypes, plCollectPositional, fitPlotlyTitle } from './theme';

// PL template registry
export {
    plTemplateDefs,
    plAllTemplateDefs,
    plGetTemplateDef,
    plGetTemplateChannels,
} from './templates';
