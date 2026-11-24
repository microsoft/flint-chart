import type { ChartEntry } from './chart-categories';

/**
 * Generic chart families — a coarser grouping than per-chart-type, modelled on
 * the section headers of the Vega-Lite example gallery
 * (https://vega.github.io/vega-lite/examples/): "Bar Charts", "Line Charts",
 * "Scatter & Strip Plots", etc. Related chart types sit together under one
 * header so the wall reads like a curated gallery rather than a long flat list.
 */
export interface ChartFamily {
  id: string;
  label: string;
}

export const CHART_FAMILIES: ChartFamily[] = [
  { id: 'bar', label: 'Bar & Column' },
  { id: 'line', label: 'Line & Area' },
  { id: 'scatter', label: 'Scatter & Points' },
  { id: 'distribution', label: 'Distributions' },
  { id: 'radial', label: 'Circular & Radial' },
  { id: 'matrix', label: 'Tables & Multi-Dimensional' },
  { id: 'flow', label: 'Hierarchies & Flows' },
  { id: 'maps', label: 'Maps' },
];

/** Normalise a chart label so backend-specific suffixes don't break matching. */
function normalizeLabel(label: string): string {
  return label.replace(/\s*\*$/, '').replace(/\s+Chart$/i, '').trim().toLowerCase();
}

/** Maps a normalised chart label to a family id. */
const LABEL_TO_FAMILY: Record<string, string> = {
  // Bar & Column
  bar: 'bar',
  'stacked bar': 'bar',
  'grouped bar': 'bar',
  combo: 'bar',
  lollipop: 'bar',
  waterfall: 'bar',
  gantt: 'bar',
  bullet: 'bar',
  pyramid: 'bar',
  // Line & Area
  line: 'line',
  sparkline: 'line',
  area: 'line',
  'range area': 'line',
  streamgraph: 'line',
  bump: 'line',
  slope: 'line',
  // Scatter & Points
  'scatter plot': 'scatter',
  scatter: 'scatter',
  'connected scatter plot': 'scatter',
  'connected scatter': 'scatter',
  bubble: 'scatter',
  regression: 'scatter',
  'strip plot': 'scatter',
  'ranged dot plot': 'scatter',
  // Distributions
  histogram: 'distribution',
  boxplot: 'distribution',
  density: 'distribution',
  'density plot': 'distribution',
  violin: 'distribution',
  'violin plot': 'distribution',
  ecdf: 'distribution',
  'ecdf plot': 'distribution',
  // Scatter & Points (scientific point/curve charts)
  'kaplan-meier': 'scatter',
  'volcano plot': 'scatter',
  'loess fit': 'scatter',
  splom: 'scatter',
  // Circular & Radial
  pie: 'radial',
  doughnut: 'radial',
  rose: 'radial',
  radar: 'radial',
  funnel: 'radial',
  gauge: 'radial',
  'chord diagram': 'radial',
  'circos plot': 'radial',
  // Tables & Multi-Dimensional
  heatmap: 'matrix',
  'calendar heatmap': 'matrix',
  'clustered heatmap': 'matrix',
  'correlation matrix': 'matrix',
  'parallel coordinates': 'matrix',
  candlestick: 'matrix',
  'genome browser': 'matrix',
  'upset plot': 'matrix',
  oncoprint: 'matrix',
  // Maps
  map: 'maps',
  choropleth: 'maps',
  // Hierarchies & Flows — CanvasXpress network/sankey join the ECharts
  // tree/treemap/sankey/graph charts already in this family.
  'network graph': 'flow',
  'sankey diagram': 'flow',
  sankey: 'flow',
  treemap: 'flow',
  sunburst: 'flow',
  tree: 'flow',
};

export function familyForChart(chart: ChartEntry): string {
  return LABEL_TO_FAMILY[normalizeLabel(chart.label)] ?? 'matrix';
}
