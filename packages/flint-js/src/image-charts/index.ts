// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * @module flint-chart/image-charts
 *
 * Image-Charts backend for flint-chart.
 *
 * Compiles the core semantic layer into a single permanent
 * `https://image-charts.com` chart URL (the Google Image Charts / Image-Charts
 * query grammar). The URL renders server-side and embeds anywhere an `<img>`
 * works — email, PDF, Slack, no-code tools — with no runtime JavaScript.
 *
 * Architecture contrast with the other backends:
 *   VL:           encoding-channel spec — { encoding: { x, y }, mark }
 *   EC:           series-based option   — { series: [...], xAxis, yAxis }
 *   CJS:          dataset-based config   — { type, data: { labels, datasets } }
 *   Excel:        range/matrix spec      — { chartType, data: [[...]], axes }
 *   Image-Charts: hosted-image URL       — { type: 'image-charts', url }
 *
 * `assembleImageCharts` is PURE: it builds a string, performs no network I/O and
 * no signing, and emits unsigned free-tier URLs only.
 */

export { assembleImageCharts } from './assemble';
export type { ImageChartsArtifact } from './assemble';
export { IMAGE_CHARTS_TYPE_MAP, isImageChartsSupported } from './chart-types';
export type { ImageChartsTypeMapping } from './chart-types';
