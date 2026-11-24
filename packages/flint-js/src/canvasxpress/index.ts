// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * @module flint-chart/canvasxpress
 *
 * CanvasXpress backend for flint-chart.
 * Compiles the core semantic layer into CanvasXpress render specs
 * ({ graphType, data, config }).
 */

// CX assembly function
export { assembleCanvasXpress } from './assemble';

// CX native-spec types + data builders
export type { CanvasXpressSpec, CanvasXpressData } from './spec';
export { buildYMatrix, distinctValues } from './spec';

// CX template registry
export {
    cxTemplateDefs,
    cxAllTemplateDefs,
    cxGetTemplateDef,
    cxGetTemplateChannels,
} from './templates';
