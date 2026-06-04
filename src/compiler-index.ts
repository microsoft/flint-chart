// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * @module @microsoft/flint-chart-compiler
 *
 * Compiles a Flint specification into a chart library spec.
 * Currently supports Vega-Lite; ECharts and Chart.js to be added later.
 */

// Core: types, semantic types, decisions, layout, overflow
export * from './core';

// Vega-Lite backend: assembleVegaLite, templates, spec instantiation
export * from './vegalite';
