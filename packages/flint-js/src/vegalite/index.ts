// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * @module flint-chart/vegalite
 *
 * Vega-Lite backend for flint-chart.
 *
 * Compiles the core semantic layer into Vega-Lite specifications.
 * Contains VL-specific assembly, spec instantiation, and chart templates.
 */

// VL assembly function
export { assembleVegaLite, getChartOptions, getChartPivot, getChartTransform } from './assemble';

// VL spec instantiation (Phase 2)
export { vlApplyLayoutToSpec, vlApplyTooltips } from './instantiate-spec';

// Canvas-anchored furniture (branding marks drawn onto the rendered SVG)
export {
    type CanvasFurnitureItem,
    CANVAS_FURNITURE_KEY,
    readCanvasFurniture,
    canvasFurnitureMarkup,
    injectCanvasFurnitureSVG,
} from './canvas-furniture';

// VL template registry
export {
    vlTemplateDefs,
    vlAllTemplateDefs,
    vlGetTemplateDef,
    vlGetTemplateChannels,
} from './templates';

// VL recommendation & adaptation
export { vlAdaptChart, vlRecommendEncodings, vlRecommendChartTypes, vlRecommendCharts } from './recommendation';
