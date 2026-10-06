import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import stringify from 'json-stringify-pretty-compact';
import { csvParseRows } from 'd3-dsv';
import gapminderCsv from '../assets/gapminder-five-year.csv?raw';
import { Accessibility, AlertTriangle, ArrowDown, ArrowLeft, ArrowRight, ArrowUp, CornerDownLeft, EyeOff, GripVertical, Keyboard, Lasso, Layers3, Link2, Menu, MessageSquareText, MousePointer2, MousePointerClick, Move, MoveHorizontal, MoveVertical, Pause, Play, RotateCcw, Ruler, Scan, Target, Timer, ZoomIn } from 'lucide-react';
import {
  assembleVegaLite,
  type ChartAssemblyInput,
  type ChartWarning,
  type InteractionEntry,
  type InteractionPresetType,
  type InteractionSpec,
} from 'flint-chart';
import {
  genBarTests,
  genGroupedBarTests,
  genStackedBarTests,
  TEST_GENERATORS,
  type TestCase,
} from 'flint-chart/test-data';
import {
  accessibleNavigation,
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
  type InteractiveChartSurface,
  type InspectIndexShow,
} from 'flint-chart/interactive';
import { expressionInterpreter } from 'vega-interpreter';
import { ScaleToFit } from '../components/ScaleToFit';
import { CodeBlock } from '../components/CodeBlock';
import { SiteRange } from '../components/SiteRange';
import foodPrices from '../data/cpi-food-prices.json';
import { BACKENDS } from '../shared/supported-backends';
import { representativeCasesByChartType, testCaseToAssemblyInput } from '../shared/test-case-utils';
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
  | 'keyboard-focus' | 'select-context' | 'accessible-navigation';
type ProbeStatus = 'loading' | 'ready' | 'unsupported' | 'error';
/** Where a card's interactions come from: factory calls in code, or `interaction_spec` JSON. */
export type InteractionSource = 'code' | 'spec';

export interface NavigationGuard {
  minVisibleFraction: number;
  maxVisibleFraction: number;
  overscrollFraction: number;
}

export const unitInteractionModes = [
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
  { value: 'accessible-navigation', label: 'Accessible navigation', icon: Accessibility },
] as const;

export const compositionInteractionModes = [
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
    case 'accessible-navigation': return [accessibleNavigation()];
    default: return [navigate({ axes: navigationAxes ?? 'available', domainGuard: navigationGuard })];
  }
}

/**
 * The same table as `modeInteractions`, spelled as `interaction_spec`. Each mode
 * maps to the same preset with the same options, so the two tabs test one
 * design from two entry points. Surface policies ride in the spec too.
 */
function modeSpec(
  mode: InteractionMode,
  navigationAxes: 'x' | 'y' | 'xy' | undefined,
  navigationGuard: NavigationGuard | undefined,
  groupBy: string | readonly string[] | undefined,
  indexInspection: InteractionCase['indexInspection'],
): InteractionSpec {
  const entry = (type: InteractionPresetType, options?: Record<string, unknown>): InteractionEntry =>
    options ? { type, options } : { type };
  switch (mode) {
    case 'click-highlight': return { interactions: [entry('click-highlight', { targets: ['mark', 'legend', 'discreteAxis'] })] };
    case 'click-group-focus': return { interactions: [entry('click-group-focus', groupBy ? { groupBy } : undefined)] };
    case 'hover-group-focus': return { interactions: groupBy ? [entry('hover-group-focus', { groupBy })] : [] };
    case 'annotate': return { interactions: [entry('click-annotate')] };
    case 'select': return { interactions: [entry('select')] };
    case 'linked-brush': return { interactions: groupBy ? [entry('linked-brush', { groupBy })] : [] };
    case 'brush-x': return { interactions: [entry('brush-x')] };
    case 'brush-y': return { interactions: [entry('brush-y')] };
    case 'brush-angle': return { interactions: [entry('brush-angle')] };
    case 'brush-x-stateful': return { interactions: [entry('brush-x', { mode: 'stateful' })] };
    case 'brush-y-stateful': return { interactions: [entry('brush-y', { mode: 'stateful' })] };
    case 'brush-angle-stateful': return { interactions: [entry('brush-angle', { mode: 'stateful' })] };
    case 'drag-reorder': return { interactions: [entry('drag-reorder')] };
    case 'lasso': return { interactions: [entry('lasso-select')] };
    case 'inspect': return { interactions: [entry('inspect', { mode: 'y' })] };
    case 'inspect-index': return { interactions: indexInspection ? [entry('inspect-index', { ...indexInspection })] : [] };
    case 'keyboard-focus': return { interactions: [entry('click-highlight', { targets: ['mark'] })], keyboardTargeting: true };
    case 'select-context': return { interactions: [entry('select'), entry('context-activate')] };
    case 'legend-toggle': return { interactions: [entry('legend-toggle')] };
    case 'long-press': return { interactions: [entry('long-press')] };
    case 'double-activate': return { interactions: [entry('double-activate')] };
    case 'brush-zoom': return { interactions: [entry('brush-zoom')] };
    case 'accessible-navigation': return { interactions: [entry('accessible-navigation')] };
    default: return {
      interactions: [entry('navigate', {
        axes: navigationAxes ?? 'available',
        ...(navigationGuard ? { domainGuard: navigationGuard } : {}),
      })],
    };
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
    displayValue?: boolean;
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
  const cases = [...representativeCasesByChartType().values()]
    .filter((testCase) => BACKENDS.vegalite.getTemplateDef(testCase.chartType))
    .map((testCase) => interactionCase(testCase));
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
    indexInspection: { axis: 'x', show, displayValue: true, ...(seriesBy ? { seriesBy } : {}) },
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
    indexInspection: { axis: 'x', show, displayValue: true, ...(seriesBy ? { seriesBy } : {}), tolerance: 0.025 },
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
  const linkedCountryRows = csvParseRows(gapminderCsv).slice(1)
    .filter(([, year]) => year === '1952' || year === '2007')
    .map(([Country, year, population, Continent, lifeExpectancy, gdpPerCapita]) => ({
      Observation: `${Country}-${year}`,
      Country,
      Continent,
      Year: Number(year),
      Population: Number(population),
      'GDP per capita': Number(gdpPerCapita),
      'Life expectancy': Number(lifeExpectancy),
    }));
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
        data: { values: linkedCountryRows },
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

export const interactionCases: InteractionCase[] = [
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
  interactionOverrides,
  spec,
  resetVersion,
  preview = false,
  onStatus,
  onSemanticEvent,
  onSurface,
}: {
  input: ChartAssemblyInput;
  mode: InteractionMode;
  themeId: string | undefined;
  navigationGuard: NavigationGuard;
  navigationAxes?: 'x' | 'y' | 'xy';
  groupBy?: string | readonly string[];
  indexInspection?: InteractionCase['indexInspection'];
  interactionOverrides?: MountedInteraction[];
  /** When set, the chart mounts from this spec and the code-side options stay empty. */
  spec?: InteractionSpec;
  resetVersion: number;
  preview?: boolean;
  onStatus: (status: ProbeStatus, message?: string, warnings?: readonly ChartWarning[]) => void;
  onSemanticEvent: (detail: FlintInteractionEventDetail) => void;
  onSurface?: (surface: InteractiveChartSurface | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef(onStatus);
  const semanticEventRef = useRef(onSemanticEvent);
  const onSurfaceRef = useRef(onSurface);
  const surfaceRef = useRef<ReturnType<typeof buildInteractiveChart> | null>(null);
  const pointerRef = useRef({ x: 0, y: 0 });
  const selectionRef = useRef<FlintInteractionEventDetail['event']['target']>(null);
  const [contextMenu, setContextMenu] = useState<
    { x: number; y: number; detail: FlintInteractionEventDetail } | null
  >(null);
  const [comment, setComment] = useState<string | null>(null);
  statusRef.current = onStatus;
  semanticEventRef.current = onSemanticEvent;
  onSurfaceRef.current = onSurface;

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
      const bounds = container.getBoundingClientRect();
      pointerRef.current = { x: event.clientX - (preview ? bounds.left : 0), y: event.clientY - (preview ? bounds.top : 0) };
    };
    container.addEventListener('contextmenu', captureContextPoint, true);
    container.addEventListener('flint-interaction', handleInteraction);
    const themedInput = themeId ? { ...input, theme_spec: themeId } : input;
    const detach = () => {
      container.removeEventListener('contextmenu', captureContextPoint, true);
      container.removeEventListener('flint-interaction', handleInteraction);
      surfaceRef.current = null;
      onSurfaceRef.current?.(null);
      selectionRef.current = null;
      setContextMenu(null);
      setComment(null);
    };
    let surface: ReturnType<typeof buildInteractiveChart>;
    try {
      surface = spec
        // The spec tab: behaviour comes from the JSON, nothing from the options.
        ? buildInteractiveChart(container, { ...themedInput, interaction_spec: spec }, {
          backend: 'vegalite',
          renderer: 'svg',
          expressionInterpreter,
          ariaLabel: input.chart_spec.title,
        })
        : buildInteractiveChart(container, themedInput, {
          backend: 'vegalite',
          renderer: 'svg',
          interactions: interactionOverrides ?? modeInteractions(mode, navigationAxes, navigationGuard, groupBy, indexInspection),
          expressionInterpreter,
          ariaLabel: input.chart_spec.title,
          keyboardTargeting: mode === 'keyboard-focus',
        });
    } catch (error) {
      // The resolver rejects a malformed spec before anything mounts.
      statusRef.current('error', error instanceof Error ? error.message : String(error));
      return detach;
    }
    surfaceRef.current = surface;
    onSurfaceRef.current?.(surface);
    void surface.ready.then(async () => {
      // A spec entry the chart cannot honour is dropped and reported, not thrown.
      const warnings = spec ? await surface.warnings : [];
      if (warnings.length > 0) {
        statusRef.current('unsupported', warnings.map((warning) => warning.message).join('\n'), warnings);
        return;
      }
      statusRef.current('ready');
    }).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      statusRef.current(message.includes('requires') || message.includes('support') ? 'unsupported' : 'error', message);
    });
    return () => {
      detach();
      surface.destroy();
    };
  }, [groupBy, input, mode, navigationAxes, navigationGuard, resetVersion, spec, themeId, preview, interactionOverrides]);

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
        preview && containerRef.current ? containerRef.current : document.body,
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
  source = 'code',
  autoplay = false,
  playback = false,
  keyboardControls = false,
  selectionControls = false,
  preview = false,
  onProbe,
  onSurface,
}: {
  item: InteractionCase;
  mode: InteractionMode;
  themeId: string | undefined;
  navigationGuard: NavigationGuard;
  resetVersion: number;
  source?: InteractionSource;
  autoplay?: boolean;
  playback?: boolean;
  keyboardControls?: boolean;
  selectionControls?: boolean;
  preview?: boolean;
  /** Reports the card's status so the page can tally ready and dropped cards. */
  onProbe?: (id: string, status: ProbeStatus) => void;
  onSurface?: (surface: InteractiveChartSurface | null) => void;
}) {
  const [status, setStatus] = useState<ProbeStatus>('loading');
  const [statusMessage, setStatusMessage] = useState('Compiling');
  const [warnings, setWarnings] = useState<readonly ChartWarning[]>([]);
  const cardRef = useRef<HTMLElement>(null);
  const [demoActive, setDemoActive] = useState(false);
  const [demoVisible, setDemoVisible] = useState(!preview);
  const [demoPointer, setDemoPointer] = useState({ x: 20, y: 20, pressed: false, travel: 0 });
  const [demoKey, setDemoKey] = useState('');
  const [selectionType, setSelectionType] = useState<'rectangle' | 'lasso' | 'x' | 'y'>('rectangle');
  const selectionInteractions = useMemo<MountedInteraction[] | undefined>(() => {
    if (!selectionControls) return undefined;
    if (selectionType === 'lasso') return [linkedBrush({ groupBy: item.groupBy ?? 'Country', brush: 'lasso' })];
    if (selectionType === 'rectangle') {
      const rectangle = linkedBrush({ groupBy: item.groupBy ?? 'Country' });
      return [{ ...rectangle, eventSource: { ...rectangle.eventSource, mode: 'stateful' } }];
    }
    const axisBrush = selectionType === 'x' ? brushX({ mode: 'stateful' }) : brushY({ mode: 'stateful' });
    return [{
      ...axisBrush,
      handle(event) {
        if (event.action !== `brush-${selectionType}` || event.phase === 'start' || event.phase === 'cancel') return null;
        const countries = [...new Set((event.target?.elements ?? [])
          .map(element => element.value.Country)
          .filter((country): country is string => typeof country === 'string'))];
        return {
          id: axisBrush.id,
          ops: [{
            op: 'set-style',
            targets: countries.map(Country => ({ select: { key: { Country } } })),
            value: { state: countries.length ? 'emphasized' : 'normal', mutedOpacity: 0.25 },
          }],
        };
      },
    }];
  }, [selectionControls, selectionType, item.groupBy]);
  useEffect(() => {
    if (!preview || !cardRef.current) return;
    const observer = new IntersectionObserver(([entry]) => setDemoVisible(entry.isIntersecting), {
      root: cardRef.current.closest('.ig-scroll'), threshold: 0.1,
    });
    observer.observe(cardRef.current);
    return () => observer.disconnect();
  }, [preview]);
  useEffect(() => {
    if (!preview || !autoplay) return;
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const update = () => setDemoActive(!motion.matches);
    update();
    motion.addEventListener('change', update);
    return () => motion.removeEventListener('change', update);
  }, [preview, autoplay]);
  useEffect(() => {
    if (!(autoplay || playback) || !demoActive || !demoVisible || status !== 'ready') return;
    const card = cardRef.current;
    if (!card) return;
    if (mode === 'accessible-navigation') {
      const proxy = card.querySelector<HTMLElement>('[data-flint-accessible-focus]');
      for (let depth = 0; proxy && proxy.dataset.flintAccessibleFocus !== 'chart' && depth < 12; depth += 1) {
        proxy.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      }
    }
    let step = 0;
    let activeDrag: { svg: SVGSVGElement; clientX: number; clientY: number } | undefined;
    const timers = new Set<number>();
    const schedule = (callback: () => void, delay: number) => {
      const timer = window.setTimeout(() => { timers.delete(timer); callback(); }, delay);
      timers.add(timer);
    };
    const movePointer = (clientX: number, clientY: number, pressed = false, travel = 0) => {
      if (!preview) return;
      const bounds = card.getBoundingClientRect();
      setDemoPointer({ x: clientX - bounds.left - card.clientLeft,
        y: clientY - bounds.top - card.clientTop, pressed, travel });
    };
    const sendEvent = (target: Element, type: string, clientX: number, clientY: number) => {
      const options = { bubbles: true, cancelable: true, view: window, button: 0,
        buttons: type === 'pointerup' || type === 'click' ? 0 : 1, clientX, clientY };
      target.dispatchEvent(type.startsWith('pointer')
        ? new PointerEvent(type, { ...options, pointerId: 1001, pointerType: 'mouse', isPrimary: true })
        : new MouseEvent(type, options));
    };
    const playStep = () => {
      const svg = card.querySelector<SVGSVGElement>('.cf-stage svg.marks');
      const marks = [...card.querySelectorAll<SVGGraphicsElement>('.cf-stage .mark-rect path[aria-label], .cf-stage .mark-symbol path[aria-label], .cf-stage .mark-line path[aria-label], .cf-stage .mark-arc path[aria-label]')]
        .filter(mark => { const bounds = mark.getBoundingClientRect(); return bounds.width > 0 && bounds.height > 0; });
      if (!svg || marks.length === 0) return;
      setDemoKey('');
      if (mode === 'keyboard-focus' || mode === 'accessible-navigation') {
        const keys = mode === 'accessible-navigation'
          ? ['Enter', 'ArrowRight', 'ArrowRight', 'Enter', 'ArrowDown', 'ArrowDown', 'ArrowDown', 'Escape', 'Escape']
          : ['ArrowRight', 'ArrowRight', 'Enter', 'ArrowRight', 'ArrowLeft', 'Escape'];
        const key = keys[step++ % keys.length];
        const target = mode === 'accessible-navigation'
          ? card.querySelector('.cf-stage [role="application"]') ?? card.querySelector('.cf-stage [tabindex="0"]')
          : svg;
        setDemoKey(key);
        target?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
        return;
      }
      if (mode === 'select' || mode === 'select-context' || mode === 'linked-brush' || mode === 'lasso'
        || mode.startsWith('brush-') || mode === 'navigate' || mode === 'drag-reorder') {
        const bounds = marks.map(mark => mark.getBoundingClientRect());
        const left = Math.min(...bounds.map(bounds => bounds.left));
        const top = Math.min(...bounds.map(bounds => bounds.top));
        const width = Math.max(...bounds.map(bounds => bounds.right)) - left;
        const height = Math.max(...bounds.map(bounds => bounds.bottom)) - top;
        const cycle = step++;
        const stateful = mode.endsWith('-stateful');
        const phase = stateful ? cycle % 3 : 0;
        const startFraction = phase === 1 ? 0.4 : phase === 2 ? 0.78 : 0.12;
        const endFraction = phase === 1 ? 0.5 : phase === 2 ? 0.6 : 0.68;
        const offset = stateful ? 0 : cycle % 3 * 0.06;
        let startX = left + width * (startFraction + offset);
        let startY = top + height * 0.25;
        let endX = left + width * (endFraction + offset);
        let endY = top + height * 0.7;
        let dragTarget: Element = svg;
        if (mode.startsWith('brush-x')) startY = endY = top + height / 2;
        if (mode.startsWith('brush-y')) {
          startX = endX = left + width / 2;
          startY = top + height * startFraction;
          endY = top + height * endFraction;
        }
        if (mode === 'navigate') {
          startX = left + width * 0.5;
          startY = top + height * 0.5;
          endX = left + width * (cycle % 2 ? 0.4 : 0.6);
          endY = top + height * 0.55;
        }
        if (mode === 'drag-reorder') {
          const start = bounds[cycle % bounds.length];
          const end = bounds[(cycle + 2) % bounds.length];
          startX = start.left + start.width / 2;
          startY = start.top + start.height / 2;
          endX = end.left + end.width / 2;
          endY = end.top + end.height / 2;
          dragTarget = marks[cycle % marks.length];
        }
        const pointAt = (fraction: number) => {
          if (mode === 'lasso') {
            const angle = fraction * Math.PI * 2;
            return { x: left + width * (0.45 + Math.cos(angle) * 0.25),
              y: top + height * (0.45 + Math.sin(angle) * 0.25) };
          }
          if (mode.startsWith('brush-angle')) {
            const radius = Math.min(width, height) * 0.38;
            const startAngle = phase === 1 ? 0 : phase === 2 ? Math.PI / 4 : -Math.PI / 4;
            const endAngle = phase === 1 ? Math.PI / 4 : phase === 2 ? Math.PI / 2 : Math.PI / 4;
            const angle = startAngle + (endAngle - startAngle) * fraction;
            return { x: left + width / 2 + Math.cos(angle) * radius,
              y: top + height / 2 + Math.sin(angle) * radius };
          }
          return { x: startX + (endX - startX) * fraction, y: startY + (endY - startY) * fraction };
        };
        const start = pointAt(0);
        const end = pointAt(1);
        startX = start.x;
        startY = start.y;
        movePointer(startX, startY, false, 350);
        schedule(() => {
          activeDrag = { svg, clientX: startX, clientY: startY };
          movePointer(startX, startY, true);
          sendEvent(dragTarget, 'pointerdown', startX, startY);
        }, 400);
        for (let frame = 1; frame <= 24; frame++) schedule(() => {
          const { x: clientX, y: clientY } = pointAt(frame / 24);
          activeDrag = { svg, clientX, clientY };
          movePointer(clientX, clientY, true);
          sendEvent(svg, 'pointermove', clientX, clientY);
        }, 400 + frame * 40);
        schedule(() => {
          movePointer(end.x, end.y);
          sendEvent(svg, 'pointerup', end.x, end.y);
          activeDrag = undefined;
          if (mode === 'brush-zoom') schedule(() => svg.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })), 400);
          if (mode === 'navigate') svg.dispatchEvent(new WheelEvent('wheel', { bubbles: true, cancelable: true,
            clientX: end.x, clientY: end.y, deltaY: cycle % 2 ? 120 : -120 }));
          if (mode === 'select-context') {
            const target = marks.find(mark => {
              const bounds = mark.getBoundingClientRect();
              return bounds.left >= start.x && bounds.right <= end.x && bounds.top >= start.y && bounds.bottom <= end.y;
            }) ?? marks[0];
            const bounds = target.getBoundingClientRect();
            movePointer(bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
            sendEvent(target, 'contextmenu', bounds.left + bounds.width / 2, bounds.top + bounds.height / 2);
          }
        }, 1400);
      } else if (mode === 'inspect' || mode === 'inspect-index') {
        const bounds = svg.getBoundingClientRect();
        const reverse = step++ % 2;
        for (let frame = 0; frame <= 24; frame++) schedule(() => {
          const fraction = reverse ? 1 - frame / 24 : frame / 24;
          const clientX = bounds.left + bounds.width * (0.2 + fraction * 0.6);
          const clientY = bounds.top + bounds.height * (0.35 + fraction * 0.25);
          movePointer(clientX, clientY);
          sendEvent(svg, 'pointermove', clientX, clientY);
        }, frame * 40);
      } else {
        const targets = mode === 'legend-toggle'
          ? [...card.querySelectorAll<SVGGraphicsElement>('.role-legend-symbol path')]
          : marks;
        const mark = targets[step++ % targets.length];
        if (!mark) return;
        const bounds = mark.getBoundingClientRect();
        const matrix = mark.getScreenCTM();
        const point = mark instanceof SVGPathElement && mark.closest('.mark-line') && matrix
          ? mark.getPointAtLength(mark.getTotalLength() * (0.2 + (step % 4) * 0.2)).matrixTransform(matrix)
          : { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 };
        movePointer(point.x, point.y, false, 350);
        schedule(() => {
          movePointer(point.x, point.y, mode !== 'hover-group-focus');
          sendEvent(mark, mode === 'hover-group-focus' ? 'mousemove' : mode === 'double-activate' ? 'dblclick'
            : mode === 'long-press' ? 'pointerdown' : 'click', point.x, point.y);
        }, 400);
        schedule(() => {
          movePointer(point.x, point.y);
          if (mode === 'long-press') sendEvent(mark, 'pointerup', point.x, point.y);
        }, mode === 'long-press' ? 1300 : 580);
      }
    };
    schedule(playStep, 400);
    const interval = window.setInterval(playStep, 2200);
    return () => {
      window.clearInterval(interval);
      timers.forEach(timer => window.clearTimeout(timer));
      if (activeDrag?.svg.isConnected) sendEvent(activeDrag.svg, 'pointerup', activeDrag.clientX, activeDrag.clientY);
    };
  }, [autoplay, playback, demoActive, demoVisible, status, mode, preview]);
  useEffect(() => { onProbe?.(item.id, status); }, [item.id, onProbe, status]);
  // Memoised, so a re-render does not remount the chart through a fresh spec object.
  const spec = useMemo(
    () => source === 'spec' && !selectionControls
      ? modeSpec(mode, item.navigationAxes, navigationGuard, item.groupBy, item.indexInspection)
      : undefined,
    [source, mode, item, navigationGuard, selectionControls],
  );
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
    : mode === 'accessible-navigation'
      ? 'Tab into the chart, then use the arrows, Enter, and Escape to walk its titles, axes, legends, headers, and marks.'
    : item.expectation;
  const semanticTarget = lastInteraction?.event.target;
  const semanticItems = semanticTarget?.elements ?? [];
  const semanticRecords = semanticItems.reduce((count, element) => count + (element.records?.length ?? 0), 0);
  const resolved = semanticItems.length > 0;
  const geometry = lastInteraction ? summarizeGeometry(lastInteraction.event) : undefined;
  const responded = resolved || lastInteraction?.event.action.endsWith('-viewport');
  const playControl = (autoplay || playback) && <button type="button" className="cf-demo-play" aria-label={demoActive ? 'Pause demo' : 'Play demo'}
    title={demoActive ? 'Pause demo' : 'Play demo'} disabled={status !== 'ready'}
    onClick={() => setDemoActive(!demoActive)}>
    {demoActive ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
  </button>;
  const navigationKeys = [
    { key: 'Escape', label: 'Escape: back' },
    { key: 'Enter', label: 'Enter: open selected item', Icon: CornerDownLeft },
    { key: 'ArrowUp', label: 'Up arrow: previous item', Icon: ArrowUp },
    { key: 'ArrowLeft', label: 'Left arrow: previous item', Icon: ArrowLeft },
    { key: 'ArrowDown', label: 'Down arrow: next item', Icon: ArrowDown },
    { key: 'ArrowRight', label: 'Right arrow: next item', Icon: ArrowRight },
  ];
  const sendNavigationKey = (key: string) => {
    setDemoActive(false);
    setDemoKey(key);
    const proxy = cardRef.current?.querySelector<HTMLElement>('[data-flint-accessible-focus]');
    proxy?.focus({ preventScroll: true });
    proxy?.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  };
  return (
    <article ref={cardRef} role={preview ? 'img' : undefined} aria-label={preview ? `${title} interaction preview` : undefined}
      data-preview-mode={preview ? mode : undefined} data-preview-status={preview ? status : undefined}
      className={`cf-probe${keyboardControls ? ' cf-probe-with-keyboard' : ''}${selectionControls ? ' cf-probe-with-selection' : ''}${preview ? ' cf-probe-preview' : ''}${item.wide ? ' cf-probe-wide' : ''}${item.spacious ? ' cf-probe-spacious' : ''}`}
      onMouseEnter={() => { if (autoplay && !preview && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) setDemoActive(true); }}
      onMouseLeave={() => { if (!preview && !playback) setDemoActive(false); }}
      onFocusCapture={() => { if (autoplay && !preview && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) setDemoActive(true); }}
      onBlurCapture={event => { if (!preview && !playback && !event.currentTarget.contains(event.relatedTarget as Node | null)) setDemoActive(false); }}
      onPointerDownCapture={event => {
        if ((autoplay || playback) && !preview && event.isTrusted && !(event.target as Element).closest('.cf-demo-play')) setDemoActive(false);
      }}
      onKeyDownCapture={event => {
        if ((autoplay || playback) && !preview && event.isTrusted && !(event.target as Element).closest('.cf-demo-play')) setDemoActive(false);
        if (keyboardControls && (event.target as Element).closest('.cf-stage') && navigationKeys.some(({ key }) => key === event.key)) setDemoKey(event.key);
      }}>
      {!preview && <header className="cf-probe-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className={`cf-status cf-status-${status}`} title={statusMessage}>
          {status === 'ready' && mode === 'navigate'
            ? navigationAxes?.join(' + ') || 'Ready'
            : status === 'ready' ? 'Ready' : status}
        </span>
        {!keyboardControls && playControl}
      </header>}
      {preview && demoActive && demoVisible && status === 'ready' && <span aria-hidden="true"
        className={`cf-demo-pointer${demoPointer.pressed ? ' cf-demo-pointer-pressed' : ''}`}
        style={{ transform: `translate(${demoPointer.x}px, ${demoPointer.y}px)`,
          transition: demoPointer.travel ? `transform ${demoPointer.travel}ms ease-in-out` : 'none' }}>
        <MousePointer2 size={19} fill="white" strokeWidth={1.8} />
        {demoKey && <kbd className="cf-demo-key">{demoKey}</kbd>}
      </span>}
      {spec && status === 'unsupported' && warnings.length > 0 && (
        <div className="cf-spec-warning" role="status">
          <AlertTriangle size={13} strokeWidth={2} aria-hidden="true" />
          <ul>
            {warnings.map((warning, index) => (
              <li key={index}>
                <span className="cf-spec-code">{warning.code}</span>
                {warning.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {spec && status === 'error' && (
        <div className="cf-spec-warning cf-spec-error" role="alert">
          <AlertTriangle size={13} strokeWidth={2} aria-hidden="true" />
          <ul><li><span className="cf-spec-code">rejected</span>{statusMessage}</li></ul>
        </div>
      )}
      <div className="cf-stage" ref={node => { node?.toggleAttribute('inert', preview); }}>
        <ScaleToFit
          height={item.stageHeight ?? 420}
          minHeight={selectionControls ? 0 : preview ? item.stageHeight ?? 300 : item.spacious ? 420 : 300}
          adaptiveHeight={!preview}
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
            interactionOverrides={selectionInteractions}
            spec={spec}
            resetVersion={resetVersion}
            preview={preview}
            onStatus={(nextStatus, message, nextWarnings) => {
              setStatus(nextStatus);
              setStatusMessage(message ?? (nextStatus === 'ready' ? 'Interactive surface ready' : 'Compiling'));
              setWarnings(nextWarnings ?? []);
            }}
            onSemanticEvent={setLastInteraction}
            onSurface={onSurface}
          />
        </ScaleToFit>
      </div>
      {selectionControls && <aside className="cf-selection-panel" aria-label="Selection controls">
        <div className="cf-keyboard-heading"><h3>Selection</h3></div>
        <div className="cf-selection-options" role="group" aria-label="Selection type">
          {([
            { value: 'rectangle', label: 'Rect', Icon: Scan },
            { value: 'lasso', label: 'Lasso', Icon: Lasso },
            { value: 'x', label: 'X brushing', Icon: MoveHorizontal },
            { value: 'y', label: 'Y brushing', Icon: MoveVertical },
          ] as const).map(({ value, label, Icon }) => <label key={value} className="cf-selection-option">
            <input type="radio" name={`selection-${item.id}`} value={value} checked={selectionType === value}
              disabled={status !== 'ready'} onChange={() => setSelectionType(value)} />
            <Icon size={16} aria-hidden="true" /><span>{label}</span>
          </label>)}
        </div>
      </aside>}
      {keyboardControls && <aside className="cf-keyboard-panel" aria-label="Chart keyboard navigator">
        <div className="cf-keyboard-heading"><h3>Navigator</h3>{playControl}</div>
        <div className="cf-keyboard-keys" role="group" aria-label="Navigation keys">
          {navigationKeys.map(({ key, label, Icon }) => <button key={key} type="button" data-key={key}
            data-active={demoKey === key} title={label} aria-label={label} disabled={status !== 'ready'}
            onClick={() => sendNavigationKey(key)}>
            {Icon ? <Icon size={18} aria-hidden="true" /> : 'Esc'}
          </button>)}
        </div>
      </aside>}
      {!preview && <footer className={`cf-probe-event ${responded ? 'cf-probe-event-resolved' : 'cf-probe-event-warning'}`}>
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
              {lastInteraction.event.description && (
                <span className="cf-probe-event-announcement" data-testid="accessible-announcement">
                  {lastInteraction.event.description.text}
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
      </footer>}
    </article>
  );
}

export function InteractionGallery({ source: initialSource = 'spec', mode: selectedMode, embedded = false, description }: {
  source?: InteractionSource;
  mode?: InteractionMode;
  embedded?: boolean;
  description?: string;
} = {}) {
  const [source, setSource] = useState<InteractionSource>(initialSource);
  const [localMode, setMode] = useState<InteractionMode>('click-highlight');
  const mode = selectedMode ?? localMode;
  const [themeId, setThemeId] = useState<string | undefined>(undefined);
  const [navigationGuard, setNavigationGuard] = useState<NavigationGuard>({
    minVisibleFraction: 0.02,
    maxVisibleFraction: 1,
    overscrollFraction: 0,
  });
  const [resetVersion, setResetVersion] = useState(0);
  const [probes, setProbes] = useState<Record<string, ProbeStatus>>({});
  const onProbe = useCallback((id: string, status: ProbeStatus) => {
    setProbes((current) => current[id] === status ? current : { ...current, [id]: status });
  }, []);
  // Pan & zoom lists every curated navigation case, including charts the
  // preset cannot drive yet (maps), so their unsupported status stays visible.
  const visibleCases = mode === 'navigate'
      ? navigationCases
    : mode === 'brush-zoom'
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
  const tally = visibleCases.reduce((counts, item) => {
    const status = probes[item.id] ?? 'loading';
    counts[status] += 1;
    return counts;
  }, { ready: 0, unsupported: 0, error: 0, loading: 0 } as Record<ProbeStatus, number>);
  const specPattern = modeSpec(mode, undefined, navigationGuard, '<group-field>', { seriesBy: '<series-field>', displayValue: true });
  const factoryNames = specPattern.interactions.map(entry =>
    entry.type.replace(/-([a-z])/g, (_match, letter: string) => letter.toUpperCase()));
  const functionalCode = [
    `import { buildInteractiveChart, ${factoryNames.join(', ')} } from 'flint-chart/interactive';`,
    '',
    'const chart = buildInteractiveChart(container, chartInput, {',
    "  backend: 'vegalite',",
    '  interactions: [',
    ...specPattern.interactions.map((entry, index) => {
      const prefix = `    ${factoryNames[index]}(`;
      const options = entry.options
        ? stringify(entry.options, { indent: 2, maxLength: 80 - prefix.length - 2 }).split('\n').join('\n    ')
        : '';
      return `${prefix}${options}),`;
    }),
    '  ],',
    ...(specPattern.keyboardTargeting ? ['  keyboardTargeting: true,'] : []),
    '});',
  ].join('\n');

  return (
    <div className="dev-page cf-page">
      {!embedded && <div className="cf-action-rail" role="toolbar" aria-label="Interaction mode">
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
      </div>}
      <header className="dev-page-heading cf-heading">
        <div className="cf-heading-title">
          <h1>{embedded ? [...unitInteractionModes, ...compositionInteractionModes].find(item => item.value === mode)?.label : 'Interaction gallery'}</h1>
          <div className="cf-source-toggle" role="group" aria-label="Interaction authoring">
            {(['spec', 'code'] as const).map((value) => (
              <button key={value} type="button" aria-pressed={source === value}
                onClick={() => {
                  if (source === value) return;
                  setProbes({});
                  setSource(value);
                }}>
                {value === 'code' ? 'Functional' : 'Spec'}
              </button>
            ))}
          </div>
        </div>
        {description && <p className="cf-description">{description}</p>}
        {!embedded && <>
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
          <li><strong>Accessible navigation:</strong> Tab into a chart and walk titles, axes, legends, headers, series, and marks; each step names the element and what it represents.</li>
        </ul>
        </>}
        {!embedded && <div className="cf-summary">
          <span><strong>{visibleCases.length}</strong> test cases</span>
          <span className={tally.ready === visibleCases.length ? 'cf-summary-ok' : undefined}>
            <strong>{tally.ready}</strong> ready
          </span>
          {(source === 'spec' || tally.unsupported > 0) && (
            <span className={tally.unsupported > 0 ? 'cf-summary-warn' : undefined}>
              <strong>{tally.unsupported}</strong> {source === 'spec' ? 'with dropped entries' : 'unsupported'}
            </span>
          )}
          {tally.error > 0 && <span className="cf-summary-error"><strong>{tally.error}</strong> errors</span>}
          {tally.loading > 0 && <span><strong>{tally.loading}</strong> loading</span>}
        </div>}
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
      <div className="cf-gallery-spec" aria-label={source === 'spec' ? 'Interaction spec pattern' : 'Functional interaction code'}>
        <CodeBlock language={source === 'spec' ? 'json' : 'typescript'}
          customStyle={{ margin: 0, padding: 12, fontSize: 12, maxHeight: 240, overflow: 'auto' }}>
          {source === 'spec' ? stringify({ interaction_spec: specPattern }, { indent: 2, maxLength: 160 }) : functionalCode}
        </CodeBlock>
      </div>
      <div className={mode === 'navigate' ? 'cf-grid cf-grid-wide' : 'cf-grid'}>
        {visibleCases.map((item) => (
          <CaseCard
            key={`${source}-${mode}-${item.id}`}
            item={item}
            mode={mode}
            themeId={themeId}
            navigationGuard={navigationGuard}
            resetVersion={resetVersion}
            source={source}
            onProbe={onProbe}
          />
        ))}
      </div>
    </div>
  );
}

