import { Fragment, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EyeOff, GripVertical, Keyboard, Lasso, Layers3, Link2, Menu, MessageSquareText, MousePointerClick, Move, MoveHorizontal, MoveVertical, RotateCcw, Ruler, Scan, Target, Timer, ZoomIn } from 'lucide-react';
import { assembleVegaLite, type ChartAssemblyInput } from 'flint-chart';
import {
  genBarTests,
  genGroupedBarTests,
  genStackedBarTests,
  TEST_GENERATORS,
  type TestCase,
} from 'flint-chart/test-data';
import {
  buildInteractiveChart,
  brushAngle,
  brushX,
  brushY,
  brushZoom,
  clickAnnotate,
  clickGroupFocus,
  clickHighlight,
  contextActivate,
  doubleActivate,
  dragReorder,
  hoverGroupFocus,
  inspect,
  inspectIndex,
  lassoSelect,
  legendToggle,
  linkedBrush,
  longPress,
  navigate,
  select as rectangleSelect,
  type FlintInteractionEventDetail,
  type InspectIndexShow,
} from 'flint-chart/interactive';
import { expressionInterpreter } from 'vega-interpreter';
import { ScaleToFit } from '../components/ScaleToFit';
import { SiteRange } from '../components/SiteRange';
import foodPrices from '../data/cpi-food-prices.json';
import { BACKENDS } from '../shared/supported-backends';
import { testCaseToAssemblyInput } from '../shared/test-case-utils';
import { ThemePicker } from './ThemePicker';
import { navigationDemoCases } from './navigation-demo-data';
import { gapminderRows } from './gapminder-dashboard-data';
import './click-focus-lab.css';

export type InteractionMode = 'click-highlight' | 'click-group-focus' | 'annotate' | 'select'
  | 'linked-brush' | 'hover-group-focus'
  | 'brush-x' | 'brush-y' | 'brush-angle' | 'brush-x-stateful' | 'brush-y-stateful' | 'brush-angle-stateful'
  | 'navigate' | 'drag-reorder'
  | 'lasso' | 'inspect' | 'inspect-index'
  | 'long-press' | 'double-activate' | 'legend-toggle' | 'brush-zoom'
  | 'keyboard-focus' | 'select-context';
type ProbeStatus = 'loading' | 'ready' | 'unsupported' | 'error';

export interface NavigationGuard {
  minVisibleFraction: number;
  maxVisibleFraction: number;
  overscrollFraction: number;
}

const unitInteractionModes = [
  { value: 'click-highlight', label: 'Click highlight', icon: MousePointerClick },
  { value: 'click-group-focus', label: 'Click group focus', icon: Layers3 },
  { value: 'hover-group-focus', label: 'Hover group focus', icon: Target },
  { value: 'annotate', label: 'Annotate', icon: MessageSquareText },
  { value: 'select', label: 'Select', icon: Scan },
  { value: 'linked-brush', label: 'Linked brush', icon: Link2 },
  { value: 'brush-x', label: 'X brush', icon: MoveHorizontal },
  { value: 'brush-y', label: 'Y brush', icon: MoveVertical },
  { value: 'brush-angle', label: 'Angle brush', icon: RotateCcw },
  { value: 'brush-x-stateful', label: 'X brush (edit)', icon: MoveHorizontal },
  { value: 'brush-y-stateful', label: 'Y brush (edit)', icon: MoveVertical },
  { value: 'brush-angle-stateful', label: 'Angle brush (edit)', icon: RotateCcw },
  { value: 'navigate', label: 'Pan & zoom', icon: Move },
  { value: 'drag-reorder', label: 'Drag reorder', icon: GripVertical },
  { value: 'lasso', label: 'Lasso', icon: Lasso },
  { value: 'inspect', label: 'Inspect y', icon: Target },
  { value: 'inspect-index', label: 'Inspect index', icon: Ruler },
  { value: 'long-press', label: 'Long press', icon: Timer },
  { value: 'double-activate', label: 'Double click', icon: MousePointerClick },
  { value: 'legend-toggle', label: 'Legend toggle', icon: EyeOff },
  { value: 'brush-zoom', label: 'Brush zoom', icon: ZoomIn },
] as const;

const compositionInteractionModes = [
  { value: 'keyboard-focus', label: 'Focus + keyboard', icon: Keyboard },
  { value: 'select-context', label: 'Select + context', icon: Menu },
] as const;

type MountedInteraction = ReturnType<typeof clickHighlight>;

/**
 * Each named unit mode mounts its corresponding preset; explicitly named compositions are separate.
 */
function modeInteractions(
  mode: InteractionMode,
  navigationAxes: 'x' | 'y' | 'xy' | undefined,
  navigationGuard: NavigationGuard | undefined,
  groupBy: string | readonly string[] | undefined,
  indexInspection: InteractionCase['indexInspection'],
): MountedInteraction[] {
  switch (mode) {
    case 'click-highlight': return [clickHighlight({ targets: ['mark', 'legend', 'discreteAxis'] })];
    case 'click-group-focus': return [clickGroupFocus({ groupBy })];
    case 'hover-group-focus': return groupBy ? [hoverGroupFocus({ groupBy })] : [];
    case 'annotate': return [clickAnnotate()];
    case 'select': return [rectangleSelect()];
    case 'linked-brush': return groupBy ? [linkedBrush({ groupBy })] : [];
    case 'brush-x': return [brushX()];
    case 'brush-y': return [brushY()];
    case 'brush-angle': return [brushAngle()];
    case 'brush-x-stateful': return [brushX({ mode: 'stateful' })];
    case 'brush-y-stateful': return [brushY({ mode: 'stateful' })];
    case 'brush-angle-stateful': return [brushAngle({ mode: 'stateful' })];
    case 'drag-reorder': return [dragReorder()];
    case 'lasso': return [lassoSelect()];
    case 'inspect': return [inspect({ mode: 'y' })];
    case 'inspect-index': return indexInspection ? [inspectIndex(indexInspection)] : [];
    case 'keyboard-focus': return [clickHighlight({ targets: ['mark'] })];
    case 'select-context': return [rectangleSelect(), contextActivate()];
    case 'legend-toggle': return [legendToggle()];
    case 'long-press': return [longPress()];
    case 'double-activate': return [doubleActivate()];
    case 'brush-zoom': return [brushZoom()];
    default: return [navigate({ axes: navigationAxes ?? 'available', domainGuard: navigationGuard })];
  }
}

export interface InteractionCase {
  id: string;
  title?: string;
  wide?: boolean;
  spacious?: boolean;
  stageHeight?: number;
  stageScale?: number;
  input: ChartAssemblyInput;
  groupBy?: string | readonly string[];
  indexInspection?: {
    axis?: 'x' | 'y';
    show?: InspectIndexShow;
    seriesBy?: string;
    tolerance?: number;
  };
  navigationAxes?: 'x' | 'y' | 'xy';
  chartType: string;
  expectation: string;
}

const SIZE = { width: 350, height: 240 };

function blsFoodPriceSeries(items: readonly string[]): Record<string, unknown>[] {
  const selected = new Set(items);
  return foodPrices.values
    .filter(({ item }) => selected.has(item))
    .map(({ month: Index, price: Value, item: Series }) => ({ Index, Value, Series }));
}

function representative(generator: () => TestCase[]): TestCase {
  const cases = generator();
  return cases.find((test) => test.tags?.includes('real') && !test.encodingMap.column?.fieldID && !test.encodingMap.row?.fieldID)
    ?? cases.find((test) => !test.tags?.some((tag) => ['stress', 'edge-case', 'overflow'].includes(tag)))
    ?? cases[0];
}

function interactionCase(testCase: TestCase, suffix = ''): InteractionCase {
  return {
    id: `${testCase.chartType}-${testCase.title}${suffix}`,
    chartType: testCase.chartType,
    input: testCaseToAssemblyInput(testCase, SIZE) as ChartAssemblyInput,
    expectation: testCase.description || 'Interact with the chart and inspect the resolved semantic target below.',
  };
}

function representativeCases(): InteractionCase[] {
  const byChartType = new Map<string, TestCase>();
  for (const generator of Object.values(TEST_GENERATORS)) {
    let cases: TestCase[];
    try {
      cases = generator();
    } catch {
      continue;
    }
    for (const testCase of cases) {
      if (!BACKENDS.vegalite.getTemplateDef(testCase.chartType)) continue;
      const current = byChartType.get(testCase.chartType);
      const preferred = testCase.tags?.includes('real')
        && !testCase.encodingMap.column?.fieldID
        && !testCase.encodingMap.row?.fieldID;
      if (!current || preferred) byChartType.set(testCase.chartType, testCase);
    }
  }
  const cases = [...byChartType.values()].map((testCase) => interactionCase(testCase));
  const horizontalBar = genBarTests().find((testCase) => testCase.description.includes('Horizontal'));
  if (horizontalBar) cases.push(interactionCase(horizontalBar, '-horizontal'));
  return cases.sort((left, right) => left.chartType.localeCompare(right.chartType) || left.id.localeCompare(right.id));
}

function multiLegendCase(kind: 'shape' | 'size'): InteractionCase {
  const shapeCase = {
    data: [
      ['Adelie', 'Male', 181, 3750], ['Adelie', 'Male', 190, 3650],
      ['Adelie', 'Female', 186, 3800], ['Adelie', 'Female', 195, 3250],
      ['Chinstrap', 'Male', 196, 3900], ['Chinstrap', 'Male', 193, 3650],
      ['Chinstrap', 'Female', 192, 3500], ['Chinstrap', 'Female', 188, 3525],
      ['Gentoo', 'Male', 230, 5700], ['Gentoo', 'Male', 218, 5700],
      ['Gentoo', 'Female', 211, 4500], ['Gentoo', 'Female', 210, 4450],
    ].map(([Species, Sex, flipper, mass]) => ({
      Species, Sex, 'Flipper length (mm)': flipper, 'Body mass (g)': mass,
    })),
    semanticTypes: {
      Species: 'Category', Sex: 'Category',
      'Flipper length (mm)': 'Quantity', 'Body mass (g)': 'Quantity',
    },
    title: 'Palmer Penguins — species and sex',
    x: 'Flipper length (mm)',
    y: 'Body mass (g)',
    color: 'Species',
    secondaryField: 'Sex',
    expectation: 'Species and sex legends each highlight their cohort across the other grouping.',
  };
  const sizeCase = {
    data: [
      ['Norway', 64800, 82.3, 'Europe', 'Under 100M'],
      ['Germany', 50900, 81.0, 'Europe', 'Under 100M'],
      ['Russia', 25800, 72.4, 'Europe', '100M+'],
      ['United States', 62600, 78.6, 'Americas', '100M+'],
      ['Brazil', 15600, 75.7, 'Americas', '100M+'],
      ['Chile', 25200, 80.0, 'Americas', 'Under 100M'],
      ['China', 16800, 76.7, 'Asia', '100M+'],
      ['Japan', 39300, 84.2, 'Asia', '100M+'],
      ['Qatar', 116900, 80.1, 'Asia', 'Under 100M'],
      ['Nigeria', 5300, 54.3, 'Africa', '100M+'],
      ['Ethiopia', 2000, 66.2, 'Africa', '100M+'],
      ['South Africa', 13000, 63.9, 'Africa', 'Under 100M'],
    ].map(([Country, gdp, life, Continent, populationBand]) => ({
      Country, 'GDP per capita': gdp, 'Life expectancy': life,
      Continent, 'Population band': populationBand,
    })),
    semanticTypes: {
      Country: 'Category', Continent: 'Category', 'Population band': 'Category',
      'GDP per capita': 'Quantity', 'Life expectancy': 'Quantity',
    },
    title: 'Countries — continent and population',
    x: 'GDP per capita',
    y: 'Life expectancy',
    color: 'Continent',
    secondaryField: 'Population band',
    expectation: 'Continent and population-band legends each highlight their cohort across the other grouping.',
  };
  const selected = kind === 'shape' ? shapeCase : sizeCase;
  return {
    id: `scatter-color-${kind}`,
    input: {
      data: { values: selected.data },
      semantic_types: selected.semanticTypes,
      chart_spec: {
        chartType: 'Scatter Plot',
        title: selected.title,
        encodings: {
          x: { field: selected.x },
          y: { field: selected.y },
          color: { field: selected.color },
          [kind]: { field: selected.secondaryField },
        },
        chartProperties: kind === 'size' ? { logScale_x: true } : undefined,
        baseSize: SIZE,
      },
    } as ChartAssemblyInput,
    chartType: 'Scatter Plot',
    groupBy: selected.color,
    expectation: `Interact with marks grouped by ${selected.color.toLowerCase()}.`,
  };
}

function indexInspectCases(): InteractionCase[] {
  const makeCase = (
    id: string,
    title: string,
    values: Record<string, unknown>[],
    expectation: string,
    show: InspectIndexShow,
    indexType: 'Year' | 'Date' | 'Category',
    seriesBy: string | undefined = 'Series',
  ): InteractionCase => ({
    id,
    title,
    chartType: 'Line Chart',
    expectation,
    ...(seriesBy ? { groupBy: seriesBy } : {}),
    indexInspection: { axis: 'x', show, ...(seriesBy ? { seriesBy } : {}) },
    input: {
      data: { values },
      semantic_types: { Index: indexType, Value: 'Currency', Series: 'Category' },
      field_display_names: { Index: 'Month', Value: 'Average price (USD)', Series: 'Food' },
      chart_spec: {
        chartType: 'Line Chart',
        encodings: {
          x: { field: 'Index' }, y: { field: 'Value' },
          ...(seriesBy ? { color: { field: seriesBy } } : {}),
        },
        baseSize: SIZE,
      },
    },
  });

  const makeScatterCase = (
    id: string,
    title: string,
    values: Record<string, unknown>[],
    expectation: string,
    show: InspectIndexShow,
    xField: string,
    yField: string,
    semanticTypes: Record<string, string>,
    seriesBy?: string,
  ): InteractionCase => ({
    id,
    title,
    chartType: 'Scatter Plot',
    expectation,
    ...(seriesBy ? { groupBy: seriesBy } : {}),
    indexInspection: { axis: 'x', show, ...(seriesBy ? { seriesBy } : {}), tolerance: 0.025 },
    input: {
      data: { values },
      semantic_types: semanticTypes,
      chart_spec: {
        chartType: 'Scatter Plot',
        encodings: {
          x: { field: xField }, y: { field: yField },
          ...(seriesBy ? { color: { field: seriesBy } } : {}),
        },
        baseSize: SIZE,
      },
    },
  });

  return [
    makeCase(
      'inspect-index-line-single',
      'BLS food prices — single line',
      blsFoodPriceSeries(['Bananas']),
      'Move along time to inspect the nearest monthly U.S. average banana price from the Bureau of Labor Statistics.',
      'all', 'Date', undefined,
    ),
    makeCase(
      'inspect-index-line-two',
      'BLS food prices — two lines',
      blsFoodPriceSeries(['Eggs', 'White bread']),
      'Tracking starts on White bread. Click Eggs or White bread in the legend to switch the tracked series.',
      { series: 'White bread' }, 'Date',
    ),
    makeCase(
      'inspect-index-line-two-all',
      'BLS food prices — read both lines',
      blsFoodPriceSeries(['Eggs', 'White bread']),
      'Move along time to read both foods at once; each series keeps its own horizontal value guide.',
      'all', 'Date',
    ),
    makeCase(
      'inspect-index-line-multi',
      'BLS food prices — track one series',
      blsFoodPriceSeries(['Bananas', 'Eggs', 'Ground beef', 'White bread', 'Whole milk']),
      'Tracking starts on the first food. Click a legend item to switch the tracked series.',
      'single', 'Date',
    ),
    makeScatterCase(
      'inspect-index-scatter-near-x',
      'Gapminder 2007 — assisted income inspection',
      gapminderRows.filter((row) => row.Year === 2007),
      'Move onto or just beside GDP per capita on x to inspect the observed life-expectancy point.',
      'all',
      'GDP per capita',
      'Life expectancy',
      {
        Country: 'Country', Continent: 'Category', Year: 'Year', Population: 'Quantity',
        'GDP per capita': 'Quantity', 'Life expectancy': 'Quantity',
      },
      'Continent',
    ),
    makeScatterCase(
      'inspect-index-scatter-shared-x',
      'Gapminder — country life expectancy by year',
      gapminderRows.filter((row) => ['Argentina', 'Egypt', 'Japan'].includes(row.Country)),
      'Tracking starts on the first country. Click the legend to switch countries.',
      'single',
      'Year',
      'Life expectancy',
      {
        Country: 'Country', Continent: 'Category', Year: 'Year', Population: 'Quantity',
        'GDP per capita': 'Quantity', 'Life expectancy': 'Quantity',
      },
      'Country',
    ),
  ];
}

function realFacetedCases(): InteractionCase[] {
  const electricityMix = genStackedBarTests().find((test) =>
    test.tags?.includes('real') && test.title.includes('Electricity generation mix'));
  const titanic = genGroupedBarTests().find((test) =>
    test.tags?.includes('real') && test.title.includes('Titanic survival'));
  if (!electricityMix?.encodingMap.color) throw new Error('Missing real electricity generation fixture');
  if (!titanic?.encodingMap.group) throw new Error('Missing real Titanic survival fixture');

  const { color: sourceFacet, ...barEncodings } = electricityMix.encodingMap;
  const { group: sexFacet, ...titanicEncodings } = titanic.encodingMap;
  const barCase = interactionCase({
    ...electricityMix,
    chartType: 'Bar Chart',
    title: 'Electricity generation mix — faceted by source',
    description: `${electricityMix.description} Each source is shown in its own panel.`,
    encodingMap: { ...barEncodings, column: sourceFacet },
    chartProperties: { ...electricityMix.chartProperties, facetColumns: 3 },
  }, '-faceted');
  return [
    {
      ...barCase,
      title: 'Electricity generation mix — faceted by source',
      groupBy: 'Country',
      wide: true,
    },
    {
      id: 'Scatter Plot-Gapminder-faceted-years',
      chartType: 'Scatter Plot',
      title: 'Gapminder — linked countries across 1952 and 2007',
      groupBy: 'Country',
      expectation: 'Brush countries in either year to highlight the same countries in both panels (Gapminder).',
      input: {
        semantic_types: {
          Country: 'Country',
          Continent: 'Category',
          Year: 'Year',
          Population: 'Quantity',
          'GDP per capita': 'Quantity',
          'Life expectancy': 'Quantity',
        },
        chart_spec: {
          chartType: 'Scatter Plot',
          encodings: {
            x: { field: 'GDP per capita' },
            y: { field: 'Life expectancy' },
            color: { field: 'Continent' },
            detail: { field: 'Country' },
            column: { field: 'Year' },
          },
          chartProperties: { facetColumns: 2, logScale_x: true },
          baseSize: SIZE,
        },
        data: { values: gapminderRows.filter(({ Year }) => Year === 1952 || Year === 2007) },
      },
    },
    {
      ...interactionCase({
        ...titanic,
        chartType: 'Bar Chart',
        title: 'Titanic survival — row facets by sex',
        description: `${titanic.description} Sex is shown in separate rows.`,
        encodingMap: { ...titanicEncodings, row: sexFacet },
      }, '-faceted'),
      title: 'Titanic survival — row facets by sex',
      groupBy: 'Class',
    },
    {
      id: 'Scatter Plot-Gapminder-faceted-four-years',
      chartType: 'Scatter Plot',
      title: 'Gapminder — continents across four years',
      groupBy: 'Continent',
      wide: true,
      spacious: true,
      stageHeight: 540,
      stageScale: 1.25,
      expectation: 'Brush a point to link every country in its continent across all four year panels.',
      input: {
        semantic_types: {
          Country: 'Country', Continent: 'Category', Year: 'Year',
          Population: 'Quantity', 'GDP per capita': 'Quantity',
        },
        chart_spec: {
          chartType: 'Scatter Plot',
          encodings: {
            x: { field: 'GDP per capita' }, y: { field: 'Population' },
            color: { field: 'Continent' }, detail: { field: 'Country' }, column: { field: 'Year' },
          },
          chartProperties: { facetColumns: 4, logScale_x: true, logScale_y: true },
          baseSize: SIZE,
        },
        data: { values: gapminderRows.filter(({ Year }) => [1952, 1972, 1992, 2007].includes(Year)) },
      },
    },
    {
      id: 'Scatter Plot-Gapminder-faceted-correlation-grid',
      chartType: 'Scatter Plot',
      title: 'Gapminder — 4×4 country correlation grid',
      groupBy: 'Country',
      wide: true,
      spacious: true,
      stageHeight: 820,
      stageScale: 1.15,
      expectation: 'Brush a country to link it through four years within its continent row.',
      input: {
        semantic_types: {
          Country: 'Country', Continent: 'Category', Year: 'Year',
          'GDP per capita': 'Quantity', 'Life expectancy': 'Quantity',
        },
        chart_spec: {
          chartType: 'Scatter Plot',
          encodings: {
            x: { field: 'GDP per capita' }, y: { field: 'Life expectancy' },
            detail: { field: 'Country' }, column: { field: 'Year' }, row: { field: 'Continent' },
          },
          chartProperties: { facetColumns: 4, logScale_x: true },
          baseSize: { width: 600, height: 480 },
        },
        data: {
          values: gapminderRows.filter(({ Continent, Year }) =>
            Continent !== 'Oceania' && [1952, 1972, 1992, 2007].includes(Year)),
        },
      },
    },
  ];
}

const interactionCases: InteractionCase[] = [
  ...representativeCases(),
  multiLegendCase('shape'),
  multiLegendCase('size'),
  ...indexInspectCases(),
  ...realFacetedCases(),
];

const ANNOTATION_CHART_TYPES = [
  'Area Chart',
  'Bar Chart',
  'Bar Table',
  'Bullet Chart',
  'Calendar Heatmap',
  'Candlestick Chart',
  'Choropleth',
  'Connected Scatter Plot',
  'Density Plot',
  'Heatmap',
  'Pie Chart',
  'Ranged Dot Plot',
  'Scatter Plot',
  'Slope Chart',
  'Violin Plot',
  'Waterfall Chart',
] as const;

export const annotationCases = ANNOTATION_CHART_TYPES.flatMap((chartType) => {
  const item = interactionCases.find((candidate) => candidate.chartType === chartType);
  return item ? [item] : [];
});

const navigationCases: InteractionCase[] = navigationDemoCases.map((item) => ({
  ...item,
  chartType: item.input.chart_spec.chartType,
}));

const polarBrushCases = new Set(['Pie Chart', 'Donut Chart', 'Rose Chart', 'Radar Chart']);

const navigationAxesByCase = new Map([...interactionCases, ...navigationCases].flatMap((item) => {
  const spec = assembleVegaLite(item.input) as any;
  const axes = spec._interactionSemantics?.navigationAxes as readonly ('x' | 'y')[] | undefined;
  return axes?.length ? [[item.id, axes] as const] : [];
}));

const reorderAxesByCase = new Map(interactionCases.flatMap((item) => {
  const spec = assembleVegaLite(item.input) as any;
  const axes = spec._interactionSemantics?.reorderAxes as readonly { axis: 'x' | 'y'; field: string }[] | undefined;
  return axes?.length ? [[item.id, axes] as const] : [];
}));

function hasDiscreteLegendChannel(spec: any, channel: string, field: string): boolean {
  if (!spec || typeof spec !== 'object') return false;
  const encoding = spec.encoding?.[channel];
  if (encoding?.field === field && (encoding.type === 'nominal' || encoding.type === 'ordinal')) return true;
  const children = ['layer', 'hconcat', 'vconcat', 'concat']
    .flatMap((property) => Array.isArray(spec[property]) ? spec[property] : []);
  return [...children, spec.spec].some((child) => hasDiscreteLegendChannel(child, channel, field));
}

/** Toggling a legend key only means something when its entries are series, not scale ticks. */
const discreteLegendCases = new Set(interactionCases.flatMap((item) => {
  const spec = assembleVegaLite(item.input) as any;
  const legendFields = spec._interactionSemantics?.legendFields as Record<string, string> | undefined;
  const discrete = Object.entries(legendFields ?? {})
    .some(([channel, field]) => hasDiscreteLegendChannel(spec, channel, field));
  return discrete ? [item.id] : [];
}));

type ProbeElement = NonNullable<FlintInteractionEventDetail['event']['target']>['elements'][number];

function compactEntries(record: Record<string, unknown> | undefined): string {
  return Object.entries(record ?? {})
    .filter(([field, value]) => !field.startsWith('__') && value != null && typeof value !== 'object')
    .map(([field, value]) => `${field}=${String(value)}`)
    .join(', ');
}

function describeElement(element: ProbeElement): { value: string; records: string[] } {
  const legendChannel = element.value.channel;
  const legendField = element.value.field;
  const legendDomain = element.value.domain;
  const representedRange = element.value.range;
  const domainText = legendDomain && typeof legendDomain === 'object' && !Array.isArray(legendDomain)
    ? (() => {
      const domain = legendDomain as { kind?: unknown; value?: unknown; start?: unknown; end?: unknown };
      if (domain.kind === 'value') return `value=${String(domain.value)}`;
      if (domain.kind === 'interval') {
        return `domain=${domain.start === undefined ? '(-inf' : `[${String(domain.start)}`}, ${domain.end === undefined ? '+inf)' : `${String(domain.end)})`}`;
      }
      return undefined;
    })()
    : undefined;
  const rangeText = representedRange && typeof representedRange === 'object' && !Array.isArray(representedRange)
    ? (() => {
      const range = representedRange as { start?: unknown; end?: unknown };
      const field = typeof element.value.field === 'string' ? element.value.field : 'range';
      const count = typeof element.value.count === 'number' ? `, count=${element.value.count}` : '';
      return `${field}=[${String(range.start)}, ${String(range.end)})${count}`;
    })()
    : undefined;
  const value = typeof legendChannel === 'string'
    ? [
      `channel=${legendChannel}`,
      ...(typeof legendField === 'string' ? [`field=${legendField}`] : []),
      ...(domainText ? [domainText] : []),
    ].join(', ')
    : rangeText ?? (compactEntries(element.value) || 'none');
  return {
    value,
    records: element.records?.map((record) => compactEntries(record) || 'empty') ?? [],
  };
}

function summarizeElement(
  element: ProbeElement,
): string {
  const description = describeElement(element);
  return `value: ${description.value} · records: ${description.records.length}${description.records.length > 0
    ? ` [${description.records.map((record, index) => `${index + 1}. ${record}`).join(' ; ')}]`
    : ''}`;
}

function SemanticElementRows({ element }: { element: ProbeElement }) {
  const description = describeElement(element);
  return (
    <>
      <div className="cf-semantic-row cf-semantic-value-row">
        <span className="cf-semantic-label">value</span>
        <span className="cf-semantic-content">{description.value}</span>
      </div>
      <div className="cf-semantic-row cf-semantic-records-row">
        <span className="cf-semantic-label">records({description.records.length})</span>
        <span className="cf-semantic-content">
          {description.records.length > 0
            ? description.records.map((record, index) => (
              <span className="cf-semantic-record" key={`${index}-${record}`}>{index + 1}. {record}</span>
            ))
            : 'none'}
        </span>
      </div>
    </>
  );
}

type InteractionEvent = FlintInteractionEventDetail['event'];
type PlotGeometry = NonNullable<InteractionEvent['geometry']['plot']>;

const compactNumber = (value: number): string => {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
};
const plotPoint = (point: { x: number; y: number }): string =>
  `${compactNumber(point.x)}, ${compactNumber(point.y)}`;
const percentPoint = (point: { x: number; y: number }): string =>
  `${compactNumber(point.x * 100)}%, ${compactNumber(point.y * 100)}%`;

function summarizePlotGeometry(geometry: PlotGeometry): string {
  if (geometry.kind === 'point') return `at ${plotPoint(geometry.point)}`;
  if (geometry.kind === 'drag') {
    return `${plotPoint(geometry.start)} → ${plotPoint(geometry.current)} · Δ ${plotPoint(geometry.delta)}`;
  }
  if (geometry.kind === 'rect') {
    const { x, y, width, height } = geometry.rect;
    return `box ${plotPoint({ x, y })} · ${compactNumber(width)} × ${compactNumber(height)}`;
  }
  if (geometry.kind === 'polygon') {
    const { points } = geometry.polygon;
    if (!points.length) return 'polygon · 0 points';
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    return `polygon · ${points.length} points · ${compactNumber(Math.max(...xs) - Math.min(...xs))} × ${compactNumber(Math.max(...ys) - Math.min(...ys))}`;
  }
  if (geometry.kind === 'angular-sector') {
    const { center, innerRadius, outerRadius, startAngle, endAngle } = geometry.sector;
    const degrees = (radians: number) => compactNumber(radians * 180 / Math.PI);
    return `center ${plotPoint(center)} · r ${compactNumber(innerRadius)}–${compactNumber(outerRadius)} · ${degrees(startAngle)}°–${degrees(endAngle)}°`;
  }
  const parts = [`${geometry.axes} viewport`];
  if (geometry.anchor) parts.push(`center ${percentPoint(geometry.anchor)}`);
  if (geometry.factor != null) parts.push(`scale ${compactNumber(geometry.factor)}×`);
  if (geometry.delta) parts.push(`Δ ${percentPoint(geometry.delta)}`);
  return parts.join(' · ');
}

function summarizeGeometry(event: InteractionEvent): string | undefined {
  const plot = event.geometry.plot;
  if (!plot) return undefined;
  return summarizePlotGeometry(plot);
}

function InteractiveChart({
  input,
  mode,
  themeId,
  navigationGuard,
  navigationAxes,
  groupBy,
  indexInspection,
  resetVersion,
  onStatus,
  onSemanticEvent,
}: {
  input: ChartAssemblyInput;
  mode: InteractionMode;
  themeId: string | undefined;
  navigationGuard: NavigationGuard;
  navigationAxes?: 'x' | 'y' | 'xy';
  groupBy?: string | readonly string[];
  indexInspection?: InteractionCase['indexInspection'];
  resetVersion: number;
  onStatus: (status: ProbeStatus, message?: string) => void;
  onSemanticEvent: (detail: FlintInteractionEventDetail) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef(onStatus);
  const semanticEventRef = useRef(onSemanticEvent);
  const surfaceRef = useRef<ReturnType<typeof buildInteractiveChart> | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const selectionRef = useRef<FlintInteractionEventDetail['event']['target']>(null);
  const [contextMenu, setContextMenu] = useState<
    { x: number; y: number; detail: FlintInteractionEventDetail } | null
  >(null);
  const [comment, setComment] = useState<string | null>(null);
  statusRef.current = onStatus;
  semanticEventRef.current = onSemanticEvent;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    statusRef.current('loading');
    const handleInteraction = (event: Event) => {
      const detail = (event as CustomEvent<FlintInteractionEventDetail>).detail;
      semanticEventRef.current(detail);
      const { action, phase, target } = detail.event;
      if ((action === 'select-region' || action === 'select-lasso') && phase === 'commit') {
        selectionRef.current = target;
      }
      if (action !== 'context-element') return;
      if (!target?.elements.length) {
        setContextMenu(null);
        return;
      }
      setContextMenu({ x: pointerRef.current.x, y: pointerRef.current.y, detail });
    };
    // Capture runs before the chart's own handler, so the menu opens at the pointer.
    const captureContextPoint = (event: MouseEvent) => {
      pointerRef.current = { x: event.clientX, y: event.clientY };
    };
    container.addEventListener('contextmenu', captureContextPoint, true);
    container.addEventListener('flint-interaction', handleInteraction);
    const interactions = modeInteractions(mode, navigationAxes, navigationGuard, groupBy, indexInspection);
    const themedInput = themeId ? { ...input, theme_spec: themeId } : input;
    const surface = buildInteractiveChart(container, themedInput, {
      backend: 'vegalite',
      renderer: 'svg',
      interactions,
      expressionInterpreter,
      ariaLabel: input.chart_spec.title,
      keyboardTargeting: mode === 'keyboard-focus',
      dismiss: mode === 'long-press' || mode === 'double-activate'
        ? { click: 'any', escape: true }
        : undefined,
    });
    surfaceRef.current = surface;
    void surface.ready.then(() => statusRef.current('ready')).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      statusRef.current(message.includes('requires') || message.includes('support') ? 'unsupported' : 'error', message);
    });
    return () => {
      container.removeEventListener('contextmenu', captureContextPoint, true);
      container.removeEventListener('flint-interaction', handleInteraction);
      surfaceRef.current = null;
      selectionRef.current = null;
      setContextMenu(null);
      setComment(null);
      surface.destroy();
    };
  }, [groupBy, input, mode, navigationAxes, navigationGuard, resetVersion, themeId]);

  const menuTarget = contextMenu?.detail.event.target ?? null;
  const menuElement = menuTarget?.elements[0];

  useEffect(() => {
    if (!contextMenu) return;
    const dismiss = (event: Event) => {
      if ((event.target as Element | null)?.closest?.('.cf-context-menu')) return;
      setContextMenu(null);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null);
    };
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', dismiss, true);
      document.removeEventListener('keydown', onKey);
    };
  }, [contextMenu]);

  const addComment = () => {
    const surface = surfaceRef.current;
    if (!surface || !menuTarget || !menuElement) return;
    const text = summarizeElement(menuElement) ?? 'Comment';
    setComment(text);
    void surface.applyUpdate({
      id: 'select-context',
      ops: [{
        op: 'set-annotation',
        target: { visual: menuTarget.visual, elements: [menuElement] },
        value: { text },
      }],
    });
    setContextMenu(null);
  };
  const clearComment = () => {
    setComment(null);
    void surfaceRef.current?.clearUpdate('select-context');
    setContextMenu(null);
  };

  return (
    <>
      <div className="cf-mount" ref={containerRef} />
      {contextMenu && createPortal(
        <div
          className="cf-context-menu"
          style={{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }}
          role="menu"
        >
          <button type="button" role="menuitem" onClick={addComment} disabled={!menuElement}>
            Add comment
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              const selected = selectionRef.current?.elements.length ?? 0;
              setComment(selected > 0
                ? `Sent ${selected} selected item(s) to chat`
                : `Sent ${summarizeElement(menuElement!) ?? 'item'} to chat`);
              setContextMenu(null);
            }}
            disabled={!menuElement}
          >
            Send to chat
          </button>
          <button type="button" role="menuitem" onClick={clearComment}>Clear</button>
        </div>,
        document.body,
      )}
      {comment && <p className="cf-context-note">{comment}</p>}
    </>
  );
}

export function CaseCard({
  item,
  mode,
  themeId,
  navigationGuard,
  resetVersion,
}: {
  item: InteractionCase;
  mode: InteractionMode;
  themeId: string | undefined;
  navigationGuard: NavigationGuard;
  resetVersion: number;
}) {
  const [status, setStatus] = useState<ProbeStatus>('loading');
  const [statusMessage, setStatusMessage] = useState('Compiling');
  const [lastInteraction, setLastInteraction] = useState<FlintInteractionEventDetail | null>(null);
  const title = item.title || item.input.chart_spec.title || item.input.chart_spec.chartType;
  const availableNavigationAxes = navigationAxesByCase.get(item.id);
  const navigationAxes = item.navigationAxes === 'xy'
    ? ['x', 'y']
    : item.navigationAxes ? [item.navigationAxes] : availableNavigationAxes;
  const description = mode === 'navigate'
    ? item.expectation
    : mode === 'annotate'
      ? 'Click a mark to inspect its compiler-inferred nearby position and connector.'
    : item.expectation;
  const semanticTarget = lastInteraction?.event.target;
  const semanticItems = semanticTarget?.elements ?? [];
  const semanticRecords = semanticItems.reduce((count, element) => count + (element.records?.length ?? 0), 0);
  const resolved = semanticItems.length > 0;
  const geometry = lastInteraction ? summarizeGeometry(lastInteraction.event) : undefined;
  const responded = resolved || lastInteraction?.event.action.endsWith('-viewport');
  return (
    <article className={`cf-probe${item.wide ? ' cf-probe-wide' : ''}${item.spacious ? ' cf-probe-spacious' : ''}`}>
      <header className="cf-probe-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className={`cf-status cf-status-${status}`} title={statusMessage}>
          {status === 'ready' && mode === 'navigate'
            ? navigationAxes?.join(' + ') || 'Ready'
            : status === 'ready' ? 'Ready' : status}
        </span>
      </header>
      <div className="cf-stage">
        <ScaleToFit
          height={item.stageHeight ?? 420}
          minHeight={item.spacious ? 420 : 300}
          adaptiveHeight
          maxScale={item.stageScale ?? 1}
          padding={8}
        >
          <InteractiveChart
            input={item.input}
            mode={mode}
            themeId={themeId}
            navigationGuard={navigationGuard}
            navigationAxes={item.navigationAxes}
            groupBy={item.groupBy}
            indexInspection={item.indexInspection}
            resetVersion={resetVersion}
            onStatus={(nextStatus, message) => {
              setStatus(nextStatus);
              setStatusMessage(message ?? (nextStatus === 'ready' ? 'Interactive surface ready' : 'Compiling'));
            }}
            onSemanticEvent={setLastInteraction}
          />
        </ScaleToFit>
      </div>
      <footer className={`cf-probe-event ${responded ? 'cf-probe-event-resolved' : 'cf-probe-event-warning'}`}>
        {lastInteraction ? (
          <>
            <div className="cf-probe-event-summary">
              <strong>{lastInteraction.event.action}</strong>
              <span>{semanticTarget ? `${semanticTarget.visual.kind} · ${semanticTarget.visual.role}` : 'No semantic target'}</span>
              {geometry && <span className="cf-probe-event-geometry">{geometry}</span>}
              {!lastInteraction.event.action.endsWith('-viewport') && (
                <span className="cf-probe-event-count">
                  {semanticItems.length} item{semanticItems.length === 1 ? '' : 's'}
                  {semanticTarget?.visual.kind === 'legend'
                    ? ` · ${semanticRecords} record${semanticRecords === 1 ? '' : 's'}`
                    : ''}
                </span>
              )}
              {lastInteraction.event.dropTarget?.elements[0] && (
                <span className="cf-probe-event-value">Drop: {summarizeElement(lastInteraction.event.dropTarget.elements[0])}</span>
              )}
            </div>
            {semanticItems.length > 0 && (
              <div className="cf-probe-event-data">
                <ul className="cf-probe-event-items">
                  {semanticItems.map((element, index) => (
                    <li key={`${index}-${JSON.stringify(element.value)}`}>
                      <SemanticElementRows element={element} />
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        ) : (
          <span>{status === 'unsupported' || status === 'error' ? statusMessage : 'Interact to inspect semantic resolution'}</span>
        )}
      </footer>
    </article>
  );
}

export function ClickFocusLab() {
  const [mode, setMode] = useState<InteractionMode>('click-highlight');
  const [themeId, setThemeId] = useState<string | undefined>(undefined);
  const [navigationGuard, setNavigationGuard] = useState<NavigationGuard>({
    minVisibleFraction: 0.02,
    maxVisibleFraction: 1,
    overscrollFraction: 0,
  });
  const [resetVersion, setResetVersion] = useState(0);
  const visibleCases = mode === 'navigate' || mode === 'brush-zoom'
      ? navigationCases.filter((item) => navigationAxesByCase.has(item.id))
      : mode === 'drag-reorder'
        ? interactionCases.filter((item) => reorderAxesByCase.has(item.id))
        : mode === 'inspect-index'
          ? interactionCases.filter((item) => item.indexInspection)
        : mode === 'brush-angle' || mode === 'brush-angle-stateful'
          ? interactionCases.filter((item) => polarBrushCases.has(item.chartType))
        : mode === 'linked-brush' || mode === 'hover-group-focus'
          ? interactionCases.filter((item) => item.groupBy)
        : mode === 'legend-toggle'
          ? interactionCases.filter((item) => discreteLegendCases.has(item.id))
      : interactionCases;

  return (
    <div className="dev-page cf-page">
      <div className="cf-action-rail" role="toolbar" aria-label="Interaction mode">
        {[unitInteractionModes, compositionInteractionModes].map((modes, sectionIndex) => (
          <Fragment key={sectionIndex === 0 ? 'unit' : 'composition'}>
            {sectionIndex > 0 && <div className="cf-action-divider" role="separator" />}
            {modes.map(({ value, label, icon: Icon }) => (
              <button
                key={value}
                type="button"
                className={mode === value ? 'active' : ''}
                aria-label={label}
                aria-pressed={mode === value}
                title={label}
                onClick={() => setMode(value)}
              >
                <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
                <span>{label}</span>
              </button>
            ))}
          </Fragment>
        ))}
      </div>
      <header className="dev-page-heading cf-heading">
        <h1>Interaction gallery</h1>
        <p>Choose an interaction mode, then try it across the compatible chart cases:</p>
        <ul className="cf-interaction-list">
          <li><strong>Click highlight:</strong> Click a mark, legend entry, or categorical axis label to focus its cohort.</li>
          <li><strong>Click group focus:</strong> Click a mark to focus related marks in the same category or series.</li>
          <li><strong>Hover group focus:</strong> Hover a mark to preview matching semantic keys without changing retained state.</li>
          <li><strong>Annotate:</strong> Click a mark to search nearby free space and connect its represented value.</li>
          <li><strong>Select:</strong> Drag a rectangle to focus all marks within an area.</li>
          <li><strong>Linked brush:</strong> Brush marks to highlight matching semantic groups across available views.</li>
          <li><strong>X brush:</strong> Drag across an X interval; polar charts automatically use an angular sector.</li>
          <li><strong>Y brush:</strong> Drag vertically to focus marks across a Y interval.</li>
          <li><strong>Angle brush:</strong> Drag an angular sector across a pie, donut, rose, or radar chart.</li>
          <li><strong>Stateful brush:</strong> Move the committed interval, resize either edge, or click outside to clear it.</li>
          <li><strong>Pan & zoom:</strong> Drag continuous axes to pan; use the wheel, trackpad, or a two-finger pinch to zoom.</li>
          <li><strong>Context menu:</strong> Select marks or open a mark menu, then let the host application provide contextual actions.</li>
          <li><strong>Assisted and keyboard:</strong> Move to a target to see a shared indicator and compact semantic details.</li>
        </ul>
        <div className="cf-summary"><span><strong>{visibleCases.length}</strong> test cases</span></div>
        <div className="cf-theme-picker">
          <ThemePicker themeId={themeId} onTheme={setThemeId} />
        </div>
        {mode === 'navigate' && (
          <div className="cf-navigation-controls" aria-label="Navigation guards">
            <label>
              <span>Minimum span <strong>{Math.round(navigationGuard.minVisibleFraction * 100)}%</strong></span>
              <SiteRange min={1} max={25}
                value={navigationGuard.minVisibleFraction * 100}
                onChange={(event) => setNavigationGuard((guard) => ({
                  ...guard, minVisibleFraction: Number(event.target.value) / 100,
                }))} />
            </label>
            <label>
              <span>Maximum span <strong>{Math.round(navigationGuard.maxVisibleFraction * 100)}%</strong></span>
              <SiteRange min={25} max={160}
                value={navigationGuard.maxVisibleFraction * 100}
                onChange={(event) => setNavigationGuard((guard) => ({
                  ...guard, maxVisibleFraction: Number(event.target.value) / 100,
                }))} />
            </label>
            <label>
              <span>Overscroll <strong>{Math.round(navigationGuard.overscrollFraction * 100)}%</strong></span>
              <SiteRange min={0} max={30}
                value={navigationGuard.overscrollFraction * 100}
                onChange={(event) => setNavigationGuard((guard) => ({
                  ...guard, overscrollFraction: Number(event.target.value) / 100,
                }))} />
            </label>
            <button type="button" onClick={() => setResetVersion((value) => value + 1)}>
              <RotateCcw size={14} aria-hidden="true" /> Reset views
            </button>
          </div>
        )}
      </header>
      <div className={mode === 'navigate' ? 'cf-grid cf-grid-wide' : 'cf-grid'}>
        {visibleCases.map((item) => (
          <CaseCard
            key={item.id}
            item={item}
            mode={mode}
            themeId={themeId}
            navigationGuard={navigationGuard}
            resetVersion={resetVersion}
          />
        ))}
      </div>
    </div>
  );
}