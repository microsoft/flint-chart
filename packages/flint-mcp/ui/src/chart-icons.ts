// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Chart-type display name → icon asset URL, for the chart-type switcher.
 *
 * The SVGs live under `./assets/chart-icons/` (copied from the site's icon set).
 * Names match the `chart` field on every backend's `ChartTemplateDef`; unmapped
 * types simply render without an icon.
 */

const ICON_FILE_BY_CHART: Record<string, string> = {
    'Scatter Plot': 'chart-icon-scatter.svg',
    'Regression': 'chart-icon-linear-regression.svg',
    'Connected Scatter Plot': 'chart-icon-connected-scatter.svg',
    'Ranged Dot Plot': 'chart-icon-dot-plot-horizontal.svg',
    'Strip Plot': 'chart-icon-strip-plot.svg',
    'Boxplot': 'chart-icon-box-plot.svg',
    'Bubble Chart': 'chart-icon-bubble.svg',
    'Bar Chart': 'chart-icon-column.svg',
    'Grouped Bar Chart': 'chart-icon-column-grouped.svg',
    'Stacked Bar Chart': 'chart-icon-column-stacked.svg',
    'Pyramid Chart': 'chart-icon-pyramid.svg',
    'Histogram': 'chart-icon-histogram.svg',
    'Heatmap': 'chart-icon-heat-map.svg',
    'Calendar Heatmap': 'chart-icon-calendar.svg',
    'Lollipop Chart': 'chart-icon-lollipop.svg',
    'Waterfall Chart': 'chart-icon-waterfall.svg',
    'Gantt Chart': 'chart-icon-gantt.svg',
    'Bullet Chart': 'chart-icon-bullet.svg',
    'Combo Chart': 'chart-icon-combo.svg',
    'Bar Table': 'chart-icon-bar-table.svg',
    'Density Plot': 'chart-icon-density.svg',
    'ECDF Plot': 'chart-icon-ecdf.svg',
    'Violin Plot': 'chart-icon-violin.svg',
    'Candlestick Chart': 'chart-icon-candlestick.svg',
    'Parallel Coordinates': 'chart-icon-parallel.svg',
    'Line Chart': 'chart-icon-line.svg',
    'Sparkline': 'chart-icon-sparkline.svg',
    'Bump Chart': 'chart-icon-bump.svg',
    'Slope Chart': 'chart-icon-slope.svg',
    'Area Chart': 'chart-icon-area.svg',
    'Streamgraph': 'chart-icon-streamgraph.svg',
    'Range Area Chart': 'chart-icon-range-area.svg',
    'Pie Chart': 'chart-icon-pie.svg',
    'Doughnut Chart': 'chart-icon-doughnut.svg',
    'Scatter Pie Chart': 'chart-icon-pie.svg',
    'Rose Chart': 'chart-icon-rose.svg',
    'Radar Chart': 'chart-icon-radar.svg',
    'Gauge Chart': 'chart-icon-gauge.svg',
    'Funnel Chart': 'chart-icon-funnel.svg',
    'Treemap': 'chart-icon-treemap.svg',
    'Sunburst Chart': 'chart-icon-sunburst.svg',
    'Tree': 'chart-icon-tree.svg',
    'Sankey Diagram': 'chart-icon-sankey.svg',
    'Network Graph': 'chart-icon-network.svg',
    'KPI Card': 'chart-icon-kpi-card.svg',
    'Map': 'chart-icon-world-map.svg',
    'Choropleth': 'chart-icon-us-map.svg',
};

// Resolve every icon file to its bundled URL at build time.
const ICON_URLS = import.meta.glob('./assets/chart-icons/*.svg', {
    eager: true,
    query: '?url',
    import: 'default',
}) as Record<string, string>;

/** Look up a chart type's icon URL by its display name (e.g. 'Bar Chart'). */
export function chartIconFor(name: string): string | undefined {
    const file = ICON_FILE_BY_CHART[name];
    if (!file) return undefined;
    return ICON_URLS[`./assets/chart-icons/${file}`];
}
