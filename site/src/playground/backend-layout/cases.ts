/**
 * The layout cases every backend page draws: the same inputs the Vega-Lite layout labs use (axis
 * labels, title wrap, calendar axes, categorical temporal, canvas squeeze, density, legend, colour),
 * gathered by section so ECharts, Chart.js and Plotly can be checked against them one by one.
 */
import type { ChartAssemblyInput } from 'flint-chart';
import { LABEL_CASES, DUAL_LEGEND_CASES, HORIZONTAL_LEGEND_CASES, FACET_LABEL_CASES, labelCaseInput } from '../axis-label-cases';
import { TEXT_CASES, bubbleInput, CHART_WIDTHS, CHART_DECKS } from '../TitleWrapLab';
import { EXAMPLES as CALENDAR_EXAMPLES, INSPECTION_EXAMPLES, exampleInput } from '../CalendarAxisLab';
import { CASES as TEMPORAL_CASES } from '../CategoricalTemporalLab';
import { CASES as SQUEEZE_CASES } from '../canvas-squeeze/cases';
import { SETUPS, boxOf, setupLabel, type Setup } from '../canvas-squeeze/CanvasSqueeze';
import { SERIES_COUNTS, lineInput, DOT_DATA, dotInput } from '../DensityLab';
import { SINGLE as LEGEND_SINGLE, MULTI as LEGEND_MULTI, SIZES as LEGEND_SIZES } from '../LegendLab';
import { CASES as COLOR_CASES, ROWS as COLOR_ROWS } from '../ColorLab';
import { gapminderRows } from '../gapminder-dashboard-data';

export type SectionId = 'axis-labels' | 'title-wrap' | 'calendar' | 'categorical-temporal' | 'canvas-squeeze' | 'density' | 'legend' | 'color';

export const SECTIONS: Array<{ id: SectionId; label: string; lead: string }> = [
  { id: 'axis-labels', label: 'Axis labels', lead: 'Category names along x and down y: wrapped, turned, thinned or cut by the shared band-label plan; keys with long names.' },
  { id: 'title-wrap', label: 'Title wrap', lead: 'Headline and deck broken to their block with no widow (fullest lines), set in the backend\u2019s own title type.' },
  { id: 'calendar', label: 'Calendar axes', lead: 'Continuous date axes: the backend keeps its own calendar ticks; the frame measures the room they take.' },
  { id: 'categorical-temporal', label: 'Categorical temporal', lead: 'Dates on a banded axis: names as written, or as a calendar names them where crowded.' },
  { id: 'canvas-squeeze', label: 'Canvas squeeze', lead: 'Charts set in a small box: title, keys and labels measured; past legibility the plot is laid out smaller, once.' },
  { id: 'density', label: 'Density', lead: 'Many series thin their lines (15% ink rule, 0.75 px floor); many dots as the backend draws them.' },
  { id: 'legend', label: 'Legend', lead: 'Keys beside the plot with long names wrapped, or moved where they will not stand beside it.' },
  { id: 'color', label: 'Color', lead: 'Colour controls on a heatmap and a bar chart, and the room the colour key takes.' },
];

export interface LayoutCase {
  id: string;
  title: string;
  note?: string;
  /** The house the Vega-Lite lab draws the case in; ECharts and Chart.js have no themes. */
  theme?: string;
  input: ChartAssemblyInput;
  /** Spans two columns. */
  wide?: boolean;
}

const withTheme = (input: ChartAssemblyInput, theme: string | undefined): ChartAssemblyInput =>
  theme ? { ...input, theme_spec: theme } : input;

function axisLabelCases(): LayoutCase[] {
  const out: LayoutCase[] = [];
  for (const c of LABEL_CASES) {
    for (const surface of ['x', 'y', 'color'] as const) {
      out.push({ id: `labels-${c.id}-${surface}`, title: `${c.title} · ${surface === 'color' ? 'colour legend' : `${surface} axis`}`, input: labelCaseInput(c, surface, 480, 320) });
    }
  }
  for (const c of DUAL_LEGEND_CASES) {
    out.push({ id: `labels-dual-${c.id}`, title: `Colour + size · ${c.title}${c.longSizeTitle ? ' · long size title' : ''}`, input: labelCaseInput(c, 'dual', 480, 320) });
  }
  for (const c of HORIZONTAL_LEGEND_CASES) out.push({ id: `labels-${c.id}`, title: `Titled · ${c.title}`, input: c.input });
  for (const c of FACET_LABEL_CASES) out.push({ id: `labels-${c.id}`, title: `Facets · ${c.title}`, input: c.input, wide: true });
  return out;
}

const FIVE = new Set(['China', 'India', 'United States', 'Brazil', 'Nigeria']);

/** A plain chart under a headline or deck from the title-wrap lab, at the lab's block width. */
function titledLine(headline: string | undefined, deck: string | undefined, width: number): ChartAssemblyInput {
  return {
    data: { values: gapminderRows.filter((row) => FIVE.has(row.Country)) },
    semantic_types: { Country: 'Country', Year: 'Year', 'Life expectancy': 'Quantity' },
    chart_spec: {
      chartType: 'Line Chart',
      ...(headline ? { title: headline } : {}),
      ...(deck ? { subtitle: deck } : {}),
      encodings: { x: 'Year', y: 'Life expectancy', color: 'Country' },
      baseSize: { width, height: 260 },
    },
  };
}

function titleWrapCases(): LayoutCase[] {
  const out: LayoutCase[] = [];
  for (const c of TEXT_CASES) {
    const input = c.role === 'headline' ? titledLine(c.text, undefined, c.block) : titledLine('Life expectancy, five countries', c.text, c.block);
    out.push({ id: `title-${c.id}`, title: `${c.label} · ${c.block}px plot`, note: c.note, input });
  }
  for (const deck of CHART_DECKS) {
    for (const width of CHART_WIDTHS) {
      out.push({ id: `title-bubble-${deck.id}-${width}`, title: `Bubble chart · ${deck.label} · ${width}px plot`, theme: 'economist', input: bubbleInput(width, deck.text) });
    }
  }
  out.push({ id: 'title-headline-narrow', title: 'Headline only · 260px plot', input: titledLine('Life expectancy has risen in every one of these five countries since 1952', undefined, 260) });
  out.push({ id: 'title-unbroken', title: 'Unbroken headline · 260px plot', note: 'One long word cannot break: it is set a size down where that fits, else left whole.', input: titledLine('Lifeexpectancyhasrisenineverycountrysince1952', undefined, 260) });
  return out;
}

function calendarCases(): LayoutCase[] {
  return [...INSPECTION_EXAMPLES, ...CALENDAR_EXAMPLES].map((example) => ({
    id: `calendar-${example.id}`,
    title: example.title,
    input: exampleInput(example, example.planningWidth ?? 480, example.planningHeight ?? 420, ''),
    wide: Boolean(example.facets) || (example.planningWidth ?? 0) > 600,
  }));
}

function temporalCases(): LayoutCase[] {
  return TEMPORAL_CASES.map((c) => ({ id: `temporal-${c.id}`, title: `${c.group} · ${c.id}`, note: c.note, theme: c.theme, input: withTheme(c.input, c.theme) }));
}

function squeezeCases(setup: Setup): LayoutCase[] {
  return SQUEEZE_CASES.map((c) => {
    const input = structuredClone(c.input) as unknown as ChartAssemblyInput;
    (input.chart_spec as any).baseSize = setup.base;
    (input.chart_spec as any).canvasSize = boxOf(setup);
    return { id: `squeeze-${c.id}`, title: `${c.kind === 'squeezed' ? 'Squeezed' : 'Healthy'} · ${c.name}`, note: c.note, theme: c.theme, input: withTheme(input, c.theme) };
  });
}

function densityCases(): LayoutCase[] {
  const out: LayoutCase[] = SERIES_COUNTS.map((count) => ({ id: `density-lines-${count}`, title: `${count} series`, note: 'Lines thin with the number of series.', input: lineInput(count, undefined) }));
  for (const data of DOT_DATA) out.push({ id: `density-dots-${data.key}`, title: data.label, input: dotInput(data, undefined) });
  return out;
}

function legendCases(size: { width: number; height: number }): LayoutCase[] {
  return [...LEGEND_SINGLE, ...LEGEND_MULTI].map((c) => ({ id: `legend-${c.key}`, title: c.label, note: c.why, input: c.input(size) }));
}

function colorCases(): LayoutCase[] {
  return COLOR_CASES.map((c, index) => ({
    id: `color-${index}`,
    title: `${c.chart_spec.chartType} · color ${JSON.stringify((c.chart_spec.encodings as any).color)}`,
    theme: typeof c.theme_spec === 'string' ? c.theme_spec : undefined,
    input: { ...c, data: { values: COLOR_ROWS } } as ChartAssemblyInput,
  }));
}

export { SETUPS, boxOf, setupLabel, LEGEND_SIZES };
export type { Setup };

export interface SectionOptions { setup: Setup; legendSize: { width: number; height: number } }

export function sectionCases(section: SectionId, options: SectionOptions): LayoutCase[] {
  switch (section) {
    case 'axis-labels': return axisLabelCases();
    case 'title-wrap': return titleWrapCases();
    case 'calendar': return calendarCases();
    case 'categorical-temporal': return temporalCases();
    case 'canvas-squeeze': return squeezeCases(options.setup);
    case 'density': return densityCases();
    case 'legend': return legendCases(options.legendSize);
    case 'color': return colorCases();
  }
}
