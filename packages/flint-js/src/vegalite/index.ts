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
export { assembleVegaLite, getChartOptions } from './assemble';

// VL spec instantiation (Phase 2)
export { vlApplyLayoutToSpec, vlApplyTooltips } from './instantiate-spec';

// VL template registry
export {
    vlTemplateDefs,
    vlAllTemplateDefs,
    vlGetTemplateDef,
    vlGetTemplateChannels,
} from './templates';

// VL recommendation & adaptation
export { vlAdaptChart, vlRecommendEncodings } from './recommendation';
