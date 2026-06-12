import type { PreviewBackend } from './supported-backends';
import { BACKEND_LABELS } from './supported-backends';
import scatterIcon from '../assets/chart-icons/chart-icon-scatter.svg';
import regressionIcon from '../assets/chart-icons/chart-icon-linear-regression.svg';
import barIcon from '../assets/chart-icons/chart-icon-column.svg';
import stackedBarIcon from '../assets/chart-icons/chart-icon-column-stacked.svg';
import groupedBarIcon from '../assets/chart-icons/chart-icon-column-grouped.svg';
import lineIcon from '../assets/chart-icons/chart-icon-line.svg';
import areaIcon from '../assets/chart-icons/chart-icon-area.svg';
import pieIcon from '../assets/chart-icons/chart-icon-pie.svg';
import heatmapIcon from '../assets/chart-icons/chart-icon-heat-map.svg';
import histogramIcon from '../assets/chart-icons/chart-icon-histogram.svg';
import boxplotIcon from '../assets/chart-icons/chart-icon-box-plot.svg';
import radarIcon from '../assets/chart-icons/chart-icon-radar.svg';
import streamgraphIcon from '../assets/chart-icons/chart-icon-streamgraph.svg';
import densityIcon from '../assets/chart-icons/chart-icon-density.svg';
import lollipopIcon from '../assets/chart-icons/chart-icon-lollipop.svg';
import candlestickIcon from '../assets/chart-icons/chart-icon-candlestick.svg';
import waterfallIcon from '../assets/chart-icons/chart-icon-waterfall.svg';
import roseIcon from '../assets/chart-icons/chart-icon-rose.svg';
import pyramidIcon from '../assets/chart-icons/chart-icon-pyramid.svg';
import bumpIcon from '../assets/chart-icons/chart-icon-bump.svg';
import stripPlotIcon from '../assets/chart-icons/chart-icon-strip-plot.svg';
import funnelIcon from '../assets/chart-icons/chart-icon-funnel.svg';
import gaugeIcon from '../assets/chart-icons/chart-icon-gauge.svg';
import treemapIcon from '../assets/chart-icons/chart-icon-treemap.svg';
import sunburstIcon from '../assets/chart-icons/chart-icon-sunburst.svg';
import sankeyIcon from '../assets/chart-icons/chart-icon-sankey.svg';
import rangedDotPlotIcon from '../assets/chart-icons/chart-icon-dot-plot-horizontal.svg';
import calendarIcon from '../assets/chart-icons/chart-icon-calendar.svg';
import parallelIcon from '../assets/chart-icons/chart-icon-parallel.svg';
import bubbleIcon from '../assets/chart-icons/chart-icon-bubble.svg';
import doughnutIcon from '../assets/chart-icons/chart-icon-doughnut.svg';
import comboIcon from '../assets/chart-icons/chart-icon-combo.svg';
import treeIcon from '../assets/chart-icons/chart-icon-tree.svg';
import networkIcon from '../assets/chart-icons/chart-icon-network.svg';

export interface ChartEntry {
  id: string;
  label: string;
  generator: string;
  backend: PreviewBackend;
  backendLabel: string;
  icon: string;
}

export interface ChartCategory {
  id: PreviewBackend;
  label: string;
  description: string;
  charts: ChartEntry[];
}

function createChart(
  backend: PreviewBackend,
  id: string,
  label: string,
  generator: string,
  icon: string,
): ChartEntry {
  return {
    id,
    label,
    generator,
    backend,
    backendLabel: BACKEND_LABELS[backend],
    icon,
  };
}

export const CHART_CATEGORIES: ChartCategory[] = [
  {
    id: 'vegalite',
    label: BACKEND_LABELS.vegalite,
    description: 'Semantic chart specs compiled to clean Vega-Lite examples.',
    charts: [
      createChart('vegalite', 'scatter-plot', 'Scatter Plot', 'Scatter Plot', scatterIcon),
      createChart('vegalite', 'regression', 'Regression', 'Regression', regressionIcon),
      createChart('vegalite', 'bar-chart', 'Bar Chart', 'Bar Chart', barIcon),
      createChart('vegalite', 'stacked-bar-chart', 'Stacked Bar Chart', 'Stacked Bar Chart', stackedBarIcon),
      createChart('vegalite', 'grouped-bar-chart', 'Grouped Bar Chart', 'Grouped Bar Chart', groupedBarIcon),
      createChart('vegalite', 'histogram', 'Histogram', 'Histogram', histogramIcon),
      createChart('vegalite', 'heatmap', 'Heatmap', 'Heatmap', heatmapIcon),
      createChart('vegalite', 'line-chart', 'Line Chart', 'Line Chart', lineIcon),
      createChart('vegalite', 'bump-chart', 'Bump Chart', 'Bump Chart', bumpIcon),
      createChart('vegalite', 'boxplot', 'Boxplot', 'Boxplot', boxplotIcon),
      createChart('vegalite', 'pie-chart', 'Pie Chart', 'Pie Chart', pieIcon),
      createChart('vegalite', 'ranged-dot-plot', 'Ranged Dot Plot', 'Ranged Dot Plot', rangedDotPlotIcon),
      createChart('vegalite', 'area-chart', 'Area Chart', 'Area Chart', areaIcon),
      createChart('vegalite', 'streamgraph', 'Streamgraph', 'Streamgraph', streamgraphIcon),
      createChart('vegalite', 'lollipop-chart', 'Lollipop Chart', 'Lollipop Chart', lollipopIcon),
      createChart('vegalite', 'density-plot', 'Density Plot', 'Density Plot', densityIcon),
      createChart('vegalite', 'candlestick-chart', 'Candlestick Chart', 'Candlestick Chart', candlestickIcon),
      createChart('vegalite', 'waterfall-chart', 'Waterfall Chart', 'Waterfall Chart', waterfallIcon),
      createChart('vegalite', 'strip-plot', 'Strip Plot', 'Strip Plot', stripPlotIcon),
      createChart('vegalite', 'radar-chart', 'Radar Chart', 'Radar Chart', radarIcon),
      createChart('vegalite', 'pyramid-chart', 'Pyramid Chart', 'Pyramid Chart', pyramidIcon),
      createChart('vegalite', 'rose-chart', 'Rose Chart', 'Rose Chart', roseIcon),
    ],
  },
  {
    id: 'echarts',
    label: BACKEND_LABELS.echarts,
    description: 'Interactive ECharts examples grouped into a focused gallery.',
    charts: [
      createChart('echarts', 'echarts-scatter', 'Scatter Plot', 'ECharts: Scatter', scatterIcon),
      createChart('echarts', 'echarts-line', 'Line Chart', 'ECharts: Line', lineIcon),
      createChart('echarts', 'echarts-bar', 'Bar Chart', 'ECharts: Bar', barIcon),
      createChart('echarts', 'echarts-stacked-bar', 'Stacked Bar Chart', 'ECharts: Stacked Bar', stackedBarIcon),
      createChart('echarts', 'echarts-grouped-bar', 'Grouped Bar Chart', 'ECharts: Grouped Bar', groupedBarIcon),
      createChart('echarts', 'echarts-area', 'Area Chart', 'ECharts: Area', areaIcon),
      createChart('echarts', 'echarts-pie', 'Pie Chart', 'ECharts: Pie', pieIcon),
      createChart('echarts', 'echarts-heatmap', 'Heatmap', 'ECharts: Heatmap', heatmapIcon),
      createChart('echarts', 'echarts-calendar', 'Calendar Heatmap *', 'ECharts: Calendar Heatmap *', calendarIcon),
      createChart('echarts', 'echarts-histogram', 'Histogram', 'ECharts: Histogram', histogramIcon),
      createChart('echarts', 'echarts-parallel', 'Parallel Coordinates *', 'ECharts: Parallel Coordinates *', parallelIcon),
      createChart('echarts', 'echarts-boxplot', 'Boxplot', 'ECharts: Boxplot', boxplotIcon),
      createChart('echarts', 'echarts-radar', 'Radar Chart', 'ECharts: Radar', radarIcon),
      createChart('echarts', 'echarts-candlestick', 'Candlestick Chart', 'ECharts: Candlestick', candlestickIcon),
      createChart('echarts', 'echarts-streamgraph', 'Streamgraph', 'ECharts: Streamgraph', streamgraphIcon),
      createChart('echarts', 'echarts-rose', 'Rose Chart', 'ECharts: Rose', roseIcon),
      createChart('echarts', 'echarts-gauge', 'Gauge', 'ECharts: Gauge', gaugeIcon),
      createChart('echarts', 'echarts-funnel', 'Funnel', 'ECharts: Funnel', funnelIcon),
      createChart('echarts', 'echarts-treemap', 'Treemap', 'ECharts: Treemap', treemapIcon),
      createChart('echarts', 'echarts-sunburst', 'Sunburst', 'ECharts: Sunburst', sunburstIcon),
      createChart('echarts', 'echarts-tree', 'Tree *', 'ECharts: Tree *', treeIcon),
      createChart('echarts', 'echarts-sankey', 'Sankey', 'ECharts: Sankey', sankeyIcon),
      createChart('echarts', 'echarts-graph', 'Network Graph *', 'ECharts: Network Graph *', networkIcon),
    ],
  },
  {
    id: 'chartjs',
    label: BACKEND_LABELS.chartjs,
    description: 'Practical Chart.js examples for familiar dashboard-style visuals.',
    charts: [
      createChart('chartjs', 'chartjs-scatter', 'Scatter Plot', 'Chart.js: Scatter', scatterIcon),
      createChart('chartjs', 'chartjs-bubble', 'Bubble Chart *', 'Chart.js: Bubble *', bubbleIcon),
      createChart('chartjs', 'chartjs-line', 'Line Chart', 'Chart.js: Line', lineIcon),
      createChart('chartjs', 'chartjs-bar', 'Bar Chart', 'Chart.js: Bar', barIcon),
      createChart('chartjs', 'chartjs-combo', 'Combo Chart *', 'Chart.js: Combo *', comboIcon),
      createChart('chartjs', 'chartjs-stacked-bar', 'Stacked Bar Chart', 'Chart.js: Stacked Bar', stackedBarIcon),
      createChart('chartjs', 'chartjs-grouped-bar', 'Grouped Bar Chart', 'Chart.js: Grouped Bar', groupedBarIcon),
      createChart('chartjs', 'chartjs-area', 'Area Chart', 'Chart.js: Area', areaIcon),
      createChart('chartjs', 'chartjs-pie', 'Pie Chart', 'Chart.js: Pie', pieIcon),
      createChart('chartjs', 'chartjs-doughnut', 'Doughnut Chart *', 'Chart.js: Doughnut *', doughnutIcon),
      createChart('chartjs', 'chartjs-histogram', 'Histogram', 'Chart.js: Histogram', histogramIcon),
      createChart('chartjs', 'chartjs-radar', 'Radar Chart', 'Chart.js: Radar', radarIcon),
      createChart('chartjs', 'chartjs-rose', 'Rose Chart', 'Chart.js: Rose', roseIcon),
    ],
  },
];

export const DEFAULT_CHART_ID = CHART_CATEGORIES[0]?.charts[0]?.id ?? 'scatter-plot';

export function findChartEntry(
  chartId: string,
): { category: ChartCategory; chart: ChartEntry } | undefined {
  for (const category of CHART_CATEGORIES) {
    const chart = category.charts.find((candidate) => candidate.id === chartId);
    if (chart) return { category, chart };
  }
  return undefined;
}

export function isValidChartId(chartId: string): boolean {
  return findChartEntry(chartId) !== undefined;
}

export function getCategoryFirstChartId(categoryId: string): string | undefined {
  return CHART_CATEGORIES.find((category) => category.id === categoryId)?.charts[0]?.id;
}

export function getAllChartEntries(): Array<{ category: ChartCategory; chart: ChartEntry }> {
  return CHART_CATEGORIES.flatMap((category) =>
    category.charts.map((chart) => ({ category, chart })),
  );
}
