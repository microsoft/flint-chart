import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Accessibility, AlertTriangle, Braces, Check, ChevronDown, ChevronRight, Copy, EyeOff, GripVertical, Keyboard, Lasso, Layers3, Link2, LoaderCircle, Maximize2, Menu, MessageSquareText, MousePointerClick, Move, MoveHorizontal, MoveVertical, RotateCcw, Ruler, Scan, Target, Timer, X, ZoomIn } from 'lucide-react';
import { LocaleLink } from '../i18n/LocaleLink';
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
  brushAngle,
  brushX,
  brushY,
  brushZoom,
  clickAnnotate,
  clickGroupFocus,
  clickHighlight,
  contextMenu,
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
  type ContextMenuGesture,
  type InteractionDef,
  type CanvasInteractionAction,
  type InspectIndexShow,
} from 'flint-chart/interactive';
import { expressionInterpreter } from 'vega-interpreter';
import { FlintChart, type FlintChartHandle } from 'flint-chart/react';
import stringify from 'json-stringify-pretty-compact';
import { flintChartCode, presetFactoryName } from '../shared/flint-chart-code';
import { CodeBlock } from '../components/CodeBlock';
import { ScaleToFit } from '../components/ScaleToFit';
import { SiteRange } from '../components/SiteRange';
import foodPrices from '../data/cpi-food-prices.json';
import classicDatasets from '../data/classic-datasets.json';
import oldFaithful from '../data/old-faithful.json';
import gapminderCsv from '../assets/gapminder-five-year.csv?raw';
import { csvParseRows } from 'd3-dsv';
import { BACKENDS } from '../shared/supported-backends';
import { siteTheme } from '../shared/theme';
import { representativeCasesByChartType, testCaseToAssemblyInput } from '../shared/test-case-utils';
import { ThemePicker } from './ThemePicker';
import { navigationDemoCases } from './navigation-demo-data';
import './click-focus-lab.css';

export type InteractionMode = 'click-highlight' | 'click-group-focus' | 'annotate' | 'select' | 'select-stateful'
  | 'linked-brush' | 'hover-group-focus'
  | 'brush-x' | 'brush-y' | 'brush-angle' | 'brush-x-stateful' | 'brush-y-stateful' | 'brush-angle-stateful'
  | 'navigate' | 'drag-reorder'
  | 'lasso' | 'inspect' | 'inspect-index'
  | 'long-press' | 'double-activate' | 'legend-toggle' | 'brush-zoom'
  | 'keyboard-focus' | 'context-menu' | ContextMenuVariant | 'accessible-navigation';
type ContextMenuVariant = 'context-menu-lasso' | 'context-menu-click' | 'context-menu-right-click' | 'context-menu-long-press';
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
  { value: 'select-stateful', label: 'Select (edit)', icon: Scan },
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
  { value: 'context-menu', label: 'Context menu', icon: Menu },
] as const;

export const compositionInteractionModes = [
  { value: 'keyboard-focus', label: 'Focus + keyboard', icon: Keyboard },
] as const;

/** The host actions the context-menu cases list; the lab reports which one was picked. */
const CONTEXT_MENU_ITEMS = [
  { id: 'chat', label: 'Send to chat' },
  { id: 'report', label: 'Add to report' },
  { id: 'copy', label: 'Copy values' },
];

const contextMenuGesture = (mode: InteractionMode): ContextMenuGesture =>
  mode === 'context-menu' ? 'rectangle' : mode.replace('context-menu-', '') as ContextMenuGesture;


/**
 * Each named unit mode mounts its corresponding preset; explicitly named compositions are separate.
 */
function modeInteractions(
  mode: InteractionMode,
  navigationAxes: 'x' | 'y' | 'xy' | undefined,
  navigationGuard: NavigationGuard | undefined,
  groupBy: string | readonly string[] | undefined,
  indexInspection: InteractionCase['indexInspection'],
): InteractionDef[] {
  switch (mode) {
    case 'click-highlight': return [clickHighlight({ targets: ['mark', 'legend', 'discreteAxis'] })];
    case 'click-group-focus': return [clickGroupFocus({ groupBy })];
    case 'hover-group-focus': return groupBy ? [hoverGroupFocus({ groupBy })] : [];
    case 'annotate': return [clickAnnotate()];
    case 'select': return [rectangleSelect({ mode: 'ephemeral' })];
    case 'select-stateful': return [rectangleSelect({ mode: 'stateful' })];
    case 'linked-brush': return groupBy ? [linkedBrush({ groupBy })] : [];
    case 'brush-x': return [brushX({ mode: 'ephemeral' })];
    case 'brush-y': return [brushY({ mode: 'ephemeral' })];
    case 'brush-angle': return [brushAngle({ mode: 'ephemeral' })];
    case 'brush-x-stateful': return [brushX({ mode: 'stateful' })];
    case 'brush-y-stateful': return [brushY({ mode: 'stateful' })];
    case 'brush-angle-stateful': return [brushAngle({ mode: 'stateful' })];
    case 'drag-reorder': return [dragReorder()];
    case 'lasso': return [lassoSelect()];
    case 'inspect': return [inspect({ mode: 'y' })];
    case 'inspect-index': return indexInspection ? [inspectIndex(indexInspection)] : [];
    case 'keyboard-focus': return [clickHighlight({ targets: ['mark'] })];
    case 'context-menu':
    case 'context-menu-lasso':
    case 'context-menu-click':
    case 'context-menu-right-click':
    case 'context-menu-long-press':
      return [contextMenu({ items: CONTEXT_MENU_ITEMS, gesture: contextMenuGesture(mode) })];
    case 'legend-toggle': return [legendToggle()];
    case 'long-press': return [longPress()];
    case 'double-activate': return [doubleActivate()];
    case 'brush-zoom': return [brushZoom()];
    case 'accessible-navigation': return [accessibleNavigation()];
    default: return [navigate({ axes: navigationAxes ?? 'available', domainGuard: navigationGuard })];
  }
}

/** Colours a JSON document by token: keys, preset type names, other strings, numbers. */
function highlightJson(value: unknown): ReactNode[] {
  const text = JSON.stringify(value, null, 2);
  const tokens = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?)|\b(true|false|null)\b/g;
  const nodes: ReactNode[] = [];
  let last = 0;
  let previousKey = '';
  let match: RegExpExecArray | null;
  while ((match = tokens.exec(text)) !== null) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    const [whole, string, colon, number, literal] = match;
    if (string && colon) {
      previousKey = string.slice(1, -1);
      nodes.push(<span key={match.index} className="cf-json-key">{string}</span>, colon);
    } else if (string) {
      nodes.push(<span key={match.index} className={previousKey === 'type' ? 'cf-json-type' : 'cf-json-string'}>{string}</span>);
      previousKey = '';
    } else {
      nodes.push(<span key={match.index} className="cf-json-number">{number ?? literal}</span>);
      previousKey = '';
    }
    last = match.index + whole.length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
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
    case 'select': return { interactions: [entry('select', { mode: 'ephemeral' })] };
    case 'select-stateful': return { interactions: [entry('select', { mode: 'stateful' })] };
    case 'linked-brush': return { interactions: groupBy ? [entry('linked-brush', { groupBy })] : [] };
    case 'brush-x': return { interactions: [entry('brush-x', { mode: 'ephemeral' })] };
    case 'brush-y': return { interactions: [entry('brush-y', { mode: 'ephemeral' })] };
    case 'brush-angle': return { interactions: [entry('brush-angle', { mode: 'ephemeral' })] };
    case 'brush-x-stateful': return { interactions: [entry('brush-x', { mode: 'stateful' })] };
    case 'brush-y-stateful': return { interactions: [entry('brush-y', { mode: 'stateful' })] };
    case 'brush-angle-stateful': return { interactions: [entry('brush-angle', { mode: 'stateful' })] };
    case 'drag-reorder': return { interactions: [entry('drag-reorder')] };
    case 'lasso': return { interactions: [entry('lasso-select')] };
    case 'inspect': return { interactions: [entry('inspect', { mode: 'y' })] };
    case 'inspect-index': return { interactions: indexInspection ? [entry('inspect-index', { ...indexInspection })] : [] };
    case 'keyboard-focus': return { interactions: [entry('click-highlight', { targets: ['mark'] })], keyboardTargeting: true };
    case 'context-menu':
    case 'context-menu-lasso':
    case 'context-menu-click':
    case 'context-menu-right-click':
    case 'context-menu-long-press':
      return { interactions: [entry('context-menu', { items: CONTEXT_MENU_ITEMS, gesture: contextMenuGesture(mode) })] };
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
    title: testCase.title,
    chartType: testCase.chartType,
    input: testCaseToAssemblyInput(testCase, SIZE) as ChartAssemblyInput,
    expectation: testCase.description || 'Interact with the chart and inspect the resolved semantic target below.',
  };
}

const tableRows = ({ columns, rows }: { columns: string[]; rows: unknown[][] }): Record<string, unknown>[] =>
  rows.map((row) => Object.fromEntries(columns.map((column, index) => [column, row[index]])));

const penguinRows = tableRows(classicDatasets.penguins);
const eruptionRows = oldFaithful.rows.map(({ eruption }) => ({ 'Duration (min)': eruption }));
export const gapminderRows = csvParseRows(gapminderCsv).slice(1)
  .map(([Country, year, population, Continent, lifeExpectancy, gdpPerCapita]) => ({
    Country,
    Continent,
    Year: Number(year),
    Population: Number(population),
    'Life expectancy': Number(lifeExpectancy),
    'GDP per capita': Number(gdpPerCapita),
  }));

// The shared fixtures carry small samples; the lab mounts these classic datasets in full.
const FULL_DATASETS: Record<string, { rows: Record<string, unknown>[]; description: string }> = {
  'Palmer Penguins — flipper length vs body mass': {
    rows: penguinRows,
    description: 'Three species form crisp clusters across all 342 measured penguins (Palmer Station LTER, CC0).',
  },
  'Penguin body mass by species': {
    rows: penguinRows,
    description: 'Gentoo penguins are markedly heavier than Adélie and Chinstrap (342 penguins, Palmer Station LTER, CC0).',
  },
  'Auto MPG — horsepower vs fuel economy': {
    rows: tableRows(classicDatasets.autoMpg),
    description: 'The classic inverse relationship across 392 cars: more horsepower, fewer miles per gallon (UCI / StatLib Auto MPG).',
  },
  'Keeling Curve — atmospheric CO₂ at Mauna Loa': {
    rows: tableRows(classicDatasets.keeling),
    description: 'The defining climate record: annual-mean CO₂ rising from 316 ppm (1959) to 427 ppm (2025) (NOAA GML / Scripps).',
  },
  'Old Faithful — distribution of eruption durations': {
    rows: eruptionRows,
    description: 'Two humps across all 272 eruptions: short (~2 min) and long (~4.5 min) — a mean would hide this (R "faithful").',
  },
  'Old Faithful — eruption duration density': {
    rows: eruptionRows,
    description: 'The same bimodal shape as a smooth density curve, from all 272 eruptions (R "faithful").',
  },
  'Iris petal length by species': {
    rows: tableRows(classicDatasets.iris),
    description: 'Setosa petals are tiny and tightly clustered; the other two overlap more (all 150 flowers, Fisher 1936).',
  },
};

function withFullData(testCase: TestCase): TestCase {
  const full = FULL_DATASETS[testCase.title];
  if (!full) return testCase;
  const fields = Object.keys(testCase.data[0] ?? {});
  return {
    ...testCase,
    description: full.description,
    data: full.rows.map((row) => Object.fromEntries(fields.map((field) => [field, row[field]]))),
  };
}

function representativeCases(): InteractionCase[] {
  const cases = [...representativeCasesByChartType().values()]
    .filter((testCase) => BACKENDS.vegalite.getTemplateDef(testCase.chartType))
    .map((testCase) => interactionCase(withFullData(testCase)));
  const horizontalBar = genBarTests().find((testCase) => testCase.description.includes('Horizontal'));
  if (horizontalBar) cases.push(interactionCase(horizontalBar, '-horizontal'));
  return cases.sort((left, right) => left.chartType.localeCompare(right.chartType) || left.id.localeCompare(right.id));
}

function multiLegendCase(kind: 'shape' | 'size'): InteractionCase {
  const shapeCase = {
    data: penguinRows.filter(({ Sex }) => Sex),
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
    data: gapminderRows.filter(({ Year }) => Year === 2007).map(({ Country, Continent, Population, ...measures }) => ({
      Country, 'GDP per capita': measures['GDP per capita'], 'Life expectancy': measures['Life expectancy'],
      Continent, 'Population band': Population >= 100_000_000 ? '100M+' : 'Under 100M',
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
      'Tracking starts on whole milk. Click a legend item to switch the tracked series.',
      { series: 'Whole milk' }, 'Date',
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
  const linkedYears: InteractionCase = {
    id: 'Scatter Plot-Gapminder-faceted-years',
    chartType: 'Scatter Plot',
    title: 'Gapminder — linked countries across 1952 and 2007',
    groupBy: 'Country',
    expectation: 'Pick countries in either year to highlight the same countries in both panels (Gapminder).',
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
  };
  return [
    {
      ...barCase,
      title: 'Electricity generation mix — faceted by source',
      groupBy: 'Country',
      wide: true,
    },
    linkedYears,
    {
      ...linkedYears,
      id: `${linkedYears.id}-continent`,
      title: 'Gapminder — continents across 1952 and 2007',
      groupBy: 'Continent',
      expectation: 'Pick a country to highlight its whole continent in both years.',
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
      title: 'Gapminder — the same countries across four years',
      groupBy: 'Country',
      wide: true,
      spacious: true,
      stageHeight: 540,
      stageScale: 1.25,
      expectation: 'Brush countries in any year to highlight the same countries in all four panels.',
      input: {
        semantic_types: {
          Country: 'Country', Continent: 'Category', Year: 'Year',
          'GDP per capita': 'Quantity', 'Life expectancy': 'Quantity',
        },
        chart_spec: {
          chartType: 'Scatter Plot',
          encodings: {
            x: { field: 'GDP per capita' }, y: { field: 'Life expectancy' },
            color: { field: 'Continent' }, detail: { field: 'Country' }, column: { field: 'Year' },
          },
          chartProperties: { facetColumns: 4, logScale_x: true },
          baseSize: SIZE,
        },
        data: { values: gapminderRows.filter(({ Year }) => [1952, 1972, 1992, 2007].includes(Year)) },
      },
    },
    {
      id: 'Scatter Plot-Auto MPG-faceted-origin',
      chartType: 'Scatter Plot',
      title: 'Auto MPG — the same model years in every region',
      groupBy: 'Model year',
      wide: true,
      expectation: 'Brush cars in one region to highlight cars of the same model years in all three (392 cars, UCI Auto MPG).',
      input: {
        semantic_types: { Horsepower: 'Quantity', MPG: 'Quantity', Origin: 'Category', 'Model year': 'Year' },
        chart_spec: {
          chartType: 'Scatter Plot',
          encodings: {
            x: { field: 'Horsepower' }, y: { field: 'MPG' },
            color: { field: 'Model year' }, column: { field: 'Origin' },
          },
          chartProperties: { facetColumns: 3 },
          baseSize: SIZE,
        },
        data: { values: tableRows(classicDatasets.autoMpg) },
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

const AREA = 'Area Chart-Share of the world online, 1995–2023 (%)';
const BAR = 'Bar Chart-Most populous countries, 2023 (millions)';
const BOXPLOT = 'Boxplot-Penguin body mass by species';
const CANDLESTICK = 'Candlestick Chart-Daily stock OHLC over two weeks';
const CONNECTED_SCATTER = 'Connected Scatter Plot-Driving Shifts Into Reverse — miles vs gas price (US, 1956–2010)';
const FACETED_BARS = 'Bar Chart-Electricity generation mix — faceted by source-faceted';
const FACETED_SCATTER = 'Scatter Plot-Gapminder-faceted-years';
const GROUPED_BAR = 'Grouped Bar Chart-Titanic survival rate by class and sex';
const HEATMAP = 'Heatmap-Average monthly temperature by city';
const HISTOGRAM = 'Histogram-Old Faithful — distribution of eruption durations';
const LINE = 'Line Chart-Keeling Curve — atmospheric CO₂ at Mauna Loa';
const LOLLIPOP = 'Lollipop Chart-CO₂ emissions per capita, 2022 (tonnes)';
const MULTI_LINE = 'inspect-index-line-multi';
const PIE = 'Pie Chart-Desktop browser market share, 2024';
const DONUT = 'Donut Chart-Mobile OS market share, 2024';
const ROSE = 'Rose Chart-Seattle monthly rainfall';
const RADAR = 'Radar Chart-Nutrition profile per 100 g — almonds vs oats vs yogurt';
const RANGED_DOT = 'Ranged Dot Plot-Life expectancy gap, male vs female (2021)';
const RANGE_AREA = 'Range Area Chart-Seattle average monthly temperature range';
const REGRESSION = 'Regression-Auto MPG — horsepower vs fuel economy';
const SCATTER = 'Scatter Plot-Palmer Penguins — flipper length vs body mass';
const STACKED_BAR = 'Stacked Bar Chart-Electricity generation mix by country, 2023';
const STREAMGRAPH = 'Streamgraph-World population by region, 1950–2020';
const STRIP = 'Strip Plot-Iris petal length by species';
const VIOLIN = 'Violin Plot-Exam scores by class (basic)';

/**
 * The public preset gallery shows a few charts that suit each preset; the
 * dev lab keeps every case. Modes without an entry are already narrowed by
 * capability (index inspection, pan & zoom).
 */
const GALLERY_CASES: Partial<Record<InteractionMode, readonly string[]>> = {
  'click-highlight': [BAR, SCATTER, STACKED_BAR, PIE, HEATMAP],
  'click-group-focus': ['scatter-color-shape', MULTI_LINE, FACETED_SCATTER, `${FACETED_SCATTER}-continent`, FACETED_BARS],
  'hover-group-focus': ['scatter-color-shape', MULTI_LINE, FACETED_SCATTER, `${FACETED_SCATTER}-continent`, FACETED_BARS],
  'linked-brush': ['Scatter Plot-Gapminder-faceted-four-years', 'Scatter Plot-Auto MPG-faceted-origin', FACETED_BARS, 'Bar Chart-Titanic survival — row facets by sex-faceted'],
  annotate: [LINE, SCATTER, BAR, LOLLIPOP],
  select: [SCATTER, REGRESSION, STRIP, HEATMAP, CONNECTED_SCATTER, 'scatter-color-size', STACKED_BAR, FACETED_SCATTER],
  lasso: [SCATTER, REGRESSION, CONNECTED_SCATTER, 'scatter-color-size'],
  'context-menu': [SCATTER, STRIP, BAR, REGRESSION],
  'brush-x': [LINE, CANDLESTICK, HISTOGRAM, STREAMGRAPH, AREA, MULTI_LINE, CONNECTED_SCATTER, RANGE_AREA],
  'brush-y': [BAR, RANGED_DOT, SCATTER, STRIP, LOLLIPOP, BOXPLOT, REGRESSION, VIOLIN],
  'brush-angle': [PIE, DONUT, ROSE, RADAR],
  inspect: [SCATTER, STRIP, BOXPLOT, REGRESSION],
  'long-press': [BAR, SCATTER, PIE],
  'double-activate': [BAR, SCATTER, HEATMAP],
  'drag-reorder': [BAR, STACKED_BAR, HEATMAP, BOXPLOT],
  'keyboard-focus': [BAR, SCATTER, PIE],
  'legend-toggle': [SCATTER, STACKED_BAR, STREAMGRAPH, MULTI_LINE, PIE],
  'accessible-navigation': [BAR, LINE, SCATTER, GROUPED_BAR, PIE],
};

/** Pointing at one mark suits large marks: slices, bars, and cells. */
const MENU_MARK_CASES = [BAR, STACKED_BAR, HEATMAP, GROUPED_BAR, PIE, DONUT];

/** Gallery pages whose cards switch between variants of one preset option, shown as a row of choices. */
const GALLERY_VARIANTS: Partial<Record<InteractionMode, {
  label: string;
  option: string;
  choices: readonly { mode: InteractionMode; label: string; value: string; hint: string; cases?: readonly string[] }[];
}>> = {
  ...Object.fromEntries((['select', 'brush-x', 'brush-y', 'brush-angle'] as const).map((base) => [base, {
    label: 'Selection mode',
    option: 'mode',
    choices: [
      { mode: base, label: 'Ephemeral', value: 'ephemeral', hint: 'The region lasts only while you drag.' },
      { mode: `${base}-stateful` as InteractionMode, label: 'Stateful', value: 'stateful',
        hint: 'The region stays after the drag: move or resize it, or click outside to clear it.' },
    ],
  }])),
  'context-menu': {
    label: 'Gesture',
    option: 'gesture',
    choices: [
      { mode: 'context-menu', label: 'Rectangle', value: 'rectangle', hint: 'Drag a rectangle; the menu opens beside it, and the rectangle stays to move or resize.' },
      { mode: 'context-menu-lasso', label: 'Lasso', value: 'lasso', hint: 'Draw around the marks; the menu opens where the lasso ends.' },
      { mode: 'context-menu-click', label: 'Click', value: 'click', hint: 'Click a mark to highlight it and open the menu beside it.', cases: MENU_MARK_CASES },
      { mode: 'context-menu-right-click', label: 'Right-click', value: 'right-click', hint: 'Right-click a mark to open the menu on it, without highlighting.', cases: MENU_MARK_CASES },
      { mode: 'context-menu-long-press', label: 'Long press', value: 'long-press', hint: 'Press and hold a mark to highlight it and open the menu.', cases: MENU_MARK_CASES },
    ],
  },
};

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
  spec,
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
  /** When set, the chart mounts from this spec and the code-side options stay empty. */
  spec?: InteractionSpec;
  resetVersion: number;
  onStatus: (status: ProbeStatus, message?: string, warnings?: readonly ChartWarning[]) => void;
  onSemanticEvent: (detail: FlintInteractionEventDetail) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef(onStatus);
  const semanticEventRef = useRef(onSemanticEvent);
  const [comment, setComment] = useState<string | null>(null);
  statusRef.current = onStatus;
  semanticEventRef.current = onSemanticEvent;

  // The spec tab: behaviour comes from the JSON, nothing from the options.
  const chartSpec = useMemo<ChartAssemblyInput>(() => {
    const themedInput = themeId ? { ...input, theme_spec: themeId } : input;
    if (spec) return { ...themedInput, interaction_spec: spec };
    return mode === 'keyboard-focus'
      ? { ...themedInput, interaction_spec: { interactions: [], keyboardTargeting: true } }
      : themedInput;
  }, [input, mode, spec, themeId]);
  const interactions = useMemo(
    () => (spec ? [] : modeInteractions(mode, navigationAxes, navigationGuard, groupBy, indexInspection)),
    [groupBy, indexInspection, mode, navigationAxes, navigationGuard, spec],
  );

  useEffect(() => {
    statusRef.current('loading');
    setComment(null);
  }, [chartSpec, interactions, resetVersion]);

  const handleInteraction = (detail: FlintInteractionEventDetail) => {
    semanticEventRef.current(detail);
    const { action, item, target } = detail.event;
    // The host performs a menu action; this lab only reports what it was handed.
    if (action === 'menu-select') {
      const label = CONTEXT_MENU_ITEMS.find((entry) => entry.id === item)?.label ?? item;
      const count = target?.elements.length ?? 0;
      setComment(`${label}: ${count} selected ${count === 1 ? 'mark' : 'marks'}`);
    }
  };
  // A spec entry the chart cannot honour is dropped and reported, not thrown.
  const handleWarnings = (warnings: readonly ChartWarning[]) => {
    const dropped = spec ? warnings : [];
    if (dropped.length > 0) statusRef.current('unsupported', dropped.map((warning) => warning.message).join('\n'), dropped);
    else statusRef.current('ready');
  };
  const handleError = (error: Error) => {
    statusRef.current(error.message.includes('requires') || error.message.includes('support') ? 'unsupported' : 'error', error.message);
  };

  return (
    <>
      <div className="cf-mount" ref={containerRef}>
        <FlintChart
          key={resetVersion}
          spec={chartSpec}
          interactions={interactions}
          renderer="svg"
          expressionInterpreter={expressionInterpreter}
          ariaLabel={input.chart_spec.title}
          onInteraction={handleInteraction}
          onWarnings={handleWarnings}
          onError={handleError}
        />
      </div>
      {comment && <p className="cf-context-note">{comment}</p>}
    </>
  );
}

function InteractionChartModal({ item, mode, themeId, navigationGuard, resetVersion, source, title, description, onClose }: {
  item: InteractionCase;
  mode: InteractionMode;
  themeId: string | undefined;
  navigationGuard: NavigationGuard;
  resetVersion: number;
  source: InteractionSource;
  title: string;
  description: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [codeSource, setCodeSource] = useState(source);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState('');
  const [copyError, setCopyError] = useState(false);
  const spec = useMemo(() => modeSpec(mode, item.navigationAxes, navigationGuard, item.groupBy, item.indexInspection), [mode, item, navigationGuard]);
  const input = themeId ? { ...item.input, theme_spec: themeId } : item.input;
  const codeFor = (chartInput: ChartAssemblyInput) => codeSource === 'spec'
    ? stringify({ ...chartInput, interaction_spec: spec }, { maxLength: 60 })
    : flintChartCode({
      presets: spec.interactions.map((entry) => ({
        factory: presetFactoryName(entry.type),
        options: entry.options ? JSON.stringify(entry.options, null, 2) : '',
      })),
      keyboardTargeting: spec.keyboardTargeting,
      preamble: [`const chartInput = ${stringify(chartInput, { maxLength: 60 })};`],
    });
  // Highlighting hundreds of rows stalls the dialog; the view shows a few and Copy keeps them all.
  const values = 'values' in input.data ? input.data.values : undefined;
  const code = codeFor(values && values.length > 4
    ? { ...input, data: { values: [...values.slice(0, 3), `… ${values.length - 3} more rows`] } } as ChartAssemblyInput
    : input);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousOverflow = document.body.style.overflow;
    const previousFocus = document.activeElement;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus instanceof HTMLElement && previousFocus.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, []);

  return createPortal(
    <dialog ref={dialogRef} className="cf-chart-modal" aria-labelledby={titleId} style={{ fontFamily: siteTheme.fontSans }}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
      <header>
        <div><h2 id={titleId}>{title}</h2><p>{description}</p></div>
        <button type="button" className="cf-modal-icon" onClick={onClose} aria-label="Close chart" title="Close chart"><X size={18} aria-hidden="true" /></button>
      </header>
      <div className="cf-chart-modal-body">
        <section className="cf-chart-modal-preview" aria-label="Interactive chart">
          <div>
            <ScaleToFit fill height={650} padding={20} maxScale={1.9}>
              <InteractiveChart input={item.input} mode={mode} themeId={themeId} navigationGuard={navigationGuard}
                navigationAxes={item.navigationAxes} groupBy={item.groupBy} indexInspection={item.indexInspection}
                spec={source === 'spec' ? spec : undefined} resetVersion={resetVersion}
                onStatus={(status, message) => setMessage(status === 'error' || status === 'unsupported' ? message ?? status : '')}
                onSemanticEvent={detail => setMessage(detail.event.action)} />
            </ScaleToFit>
          </div>
          {message && <small className="cf-chart-modal-status" title={message}>{message}</small>}
        </section>
        <section className="cf-chart-modal-spec" aria-label="Chart code">
          <div className="cf-chart-modal-toolbar">
            <div className="cf-source-toggle" role="group" aria-label="Code format">
              <button type="button" aria-pressed={codeSource === 'spec'} onClick={() => { setCodeSource('spec'); setCopied(false); setCopyError(false); }}>Spec (JSON)</button>
              <button type="button" aria-pressed={codeSource === 'code'} onClick={() => { setCodeSource('code'); setCopied(false); setCopyError(false); }}>Functional</button>
            </div>
            <button type="button" className="cf-modal-icon" aria-label={copied ? 'Code copied' : 'Copy code'} title={copied ? 'Code copied' : 'Copy code'} onClick={async () => {
              try { await navigator.clipboard.writeText(codeFor(input)); setCopied(true); setCopyError(false); }
              catch { setCopyError(true); }
            }}>{copied ? <Check size={16} aria-hidden="true" /> : <Copy size={16} aria-hidden="true" />}</button>
          </div>
          {copyError && <p role="alert">Unable to copy code. Check clipboard permissions.</p>}
          <div className="cf-chart-modal-code">
            <CodeBlock language={codeSource === 'spec' ? 'json' : 'typescript'} variant="light" customStyle={{ margin: 0, borderRadius: 0, fontSize: 12, background: 'transparent' }}>{code}</CodeBlock>
          </div>
        </section>
      </div>
    </dialog>, document.body,
  );
}

export function CaseCard({
  item,
  mode,
  themeId,
  navigationGuard,
  resetVersion,
  source = 'code',
  showSpec = true,
  showSpecPanel = true,
  onProbe,
}: {
  item: InteractionCase;
  mode: InteractionMode;
  themeId: string | undefined;
  navigationGuard: NavigationGuard;
  resetVersion: number;
  source?: InteractionSource;
  /** Show the JSON panel under the chart on the spec tab. */
  showSpec?: boolean;
  showSpecPanel?: boolean;
  /** Reports the card's status so the page can tally ready and dropped cards. */
  onProbe?: (id: string, status: ProbeStatus) => void;
}) {
  const [status, setStatus] = useState<ProbeStatus>('loading');
  const [statusMessage, setStatusMessage] = useState('Compiling');
  const [warnings, setWarnings] = useState<readonly ChartWarning[]>([]);
  const [modalOpen, setModalOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  // Each card folds its own JSON; the page switch sets the default for all of them.
  const [specOpen, setSpecOpen] = useState(showSpec);
  useEffect(() => { setSpecOpen(showSpec); }, [showSpec]);
  useEffect(() => { onProbe?.(item.id, status); }, [item.id, onProbe, status]);
  // Memoised, so a re-render does not remount the chart through a fresh spec object.
  const spec = useMemo(
    () => source === 'spec'
      ? modeSpec(mode, item.navigationAxes, navigationGuard, item.groupBy, item.indexInspection)
      : undefined,
    [source, mode, item, navigationGuard],
  );
  const copySpec = () => {
    if (!spec) return;
    void navigator.clipboard?.writeText(JSON.stringify(spec, null, 2)).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    });
  };
  const [lastInteraction, setLastInteraction] = useState<FlintInteractionEventDetail | null>(null);
  const title = item.title || item.input.chart_spec.title || item.input.chart_spec.chartType;
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
  return (
    <article className={`cf-probe${item.wide ? ' cf-probe-wide' : ''}${item.spacious ? ' cf-probe-spacious' : ''}`}>
      <header className="cf-probe-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <div className="cf-probe-header-actions">
          {(status === 'error' || status === 'unsupported') && <span className={`cf-status cf-status-${status}`} title={statusMessage}>{status}</span>}
          {status === 'loading'
            ? <button type="button" className="cf-modal-icon" disabled aria-busy="true" aria-label="Loading chart" title="Loading chart"><LoaderCircle size={15} className="cf-chart-loading" aria-hidden="true" /></button>
            : <button type="button" className="cf-modal-icon" aria-label={`Open chart: ${title}`} title="Open chart and code" onClick={() => setModalOpen(true)}><Maximize2 size={15} aria-hidden="true" /></button>}
        </div>
      </header>
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
            spec={spec}
            resetVersion={resetVersion}
            onStatus={(nextStatus, message, nextWarnings) => {
              setStatus(nextStatus);
              setStatusMessage(message ?? (nextStatus === 'ready' ? 'Interactive surface ready' : 'Compiling'));
              setWarnings(nextWarnings ?? []);
            }}
            onSemanticEvent={setLastInteraction}
          />
        </ScaleToFit>
      </div>
      {spec && showSpecPanel && (
        <div className={`cf-spec-panel${specOpen ? ' cf-spec-panel-open' : ''}`}>
          <div className="cf-spec-panel-bar">
            <button
              type="button"
              className="cf-spec-panel-toggle"
              aria-expanded={specOpen}
              onClick={() => setSpecOpen((open) => !open)}
            >
              {specOpen
                ? <ChevronDown size={12} strokeWidth={2} aria-hidden="true" />
                : <ChevronRight size={12} strokeWidth={2} aria-hidden="true" />}
              <Braces size={12} strokeWidth={2} aria-hidden="true" />
              interaction_spec
              <span className="cf-spec-panel-count">
                {spec.interactions.length} {spec.interactions.length === 1 ? 'entry' : 'entries'}
              </span>
            </button>
            <button type="button" className="cf-spec-panel-copy" onClick={copySpec} aria-label="Copy interaction_spec JSON">
              {copied ? <Check size={12} aria-hidden="true" /> : <Copy size={12} aria-hidden="true" />}
              {copied ? 'Copied' : 'Copy'}
            </button>
          </div>
          {specOpen && <pre className="cf-json">{highlightJson(spec)}</pre>}
        </div>
      )}
      <footer className={`cf-probe-event ${responded ? 'cf-probe-event-resolved' : 'cf-probe-event-warning'}`}>
        {lastInteraction ? (
          <>
            <div className="cf-probe-result-row">
              <strong className="cf-probe-result-label">Event:</strong>
              <div className="cf-probe-event-summary">
              <strong>{lastInteraction.event.action}</strong>
              <span>Target: {semanticTarget
                ? `${semanticTarget.visual.kind}${semanticTarget.visual.role !== semanticTarget.visual.kind ? ` (${semanticTarget.visual.role})` : ''}`
                : lastInteraction.event.action.endsWith('-viewport') ? 'viewport' : 'none'}</span>
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
            </div>
              <div className="cf-probe-event-data cf-probe-result-row">
                <strong className="cf-probe-result-label">Semantics:</strong>
                {semanticItems.length > 0 ? <ul className="cf-probe-event-items">
                  {semanticItems.map((element, index) => (
                    <li key={`${index}-${JSON.stringify(element.value)}`}>
                      <SemanticElementRows element={element} />
                    </li>
                  ))}
                </ul> : <span>No resolved data</span>}
              </div>
          </>
        ) : (
          <span>{status === 'unsupported' || status === 'error' ? statusMessage : 'Interact to inspect semantic resolution'}</span>
        )}
      </footer>
      {modalOpen && <InteractionChartModal item={item} mode={mode} themeId={themeId} navigationGuard={navigationGuard}
        resetVersion={resetVersion} source={source} title={title} description={description} onClose={() => setModalOpen(false)} />}
    </article>
  );
}

export function ClickFocusLab({ source: initialSource = 'code', mode: selectedMode, embedded = false, headingLevel = 1, themeId: externalThemeId, showThemePicker = true, behaviors, eventActions, eventDescriptions }: {
  source?: InteractionSource;
  mode?: InteractionMode;
  embedded?: boolean;
  headingLevel?: 1 | 2;
  themeId?: string;
  showThemePicker?: boolean;
  behaviors?: readonly { trigger: string; update: string }[];
  eventActions?: readonly CanvasInteractionAction[];
  eventDescriptions?: Partial<Record<CanvasInteractionAction, string>>;
} = {}) {
  const [source, setSource] = useState<InteractionSource>(initialSource);
  const [localMode, setMode] = useState<InteractionMode>('click-highlight');
  const mode = selectedMode ?? localMode;
  const Heading = headingLevel === 2 ? 'h2' : 'h1';
  const behaviorDescriptions = behaviors?.map(behavior => {
    const verb = behavior.trigger.startsWith('Press and hold ') ? 'Press and hold' : behavior.trigger.split(' ')[0];
    return {
      trigger: behavior.trigger,
      content: <><strong>{verb}</strong>{`${behavior.trigger.slice(verb.length)} to ${behavior.update.charAt(0).toLowerCase()}${behavior.update.slice(1)}`}</>,
    };
  });
  const [localThemeId, setThemeId] = useState<string | undefined>(undefined);
  const themeId = showThemePicker ? localThemeId : externalThemeId;
  const [navigationGuard, setNavigationGuard] = useState<NavigationGuard>({
    minVisibleFraction: 0.02,
    maxVisibleFraction: 1,
    overscrollFraction: 0,
  });
  const [resetVersion, setResetVersion] = useState(0);
  const [showSpec, setShowSpec] = useState(true);
  const [probes, setProbes] = useState<Record<string, ProbeStatus>>({});
  const onProbe = useCallback((id: string, status: ProbeStatus) => {
    setProbes((current) => current[id] === status ? current : { ...current, [id]: status });
  }, []);
  // Pan & zoom lists every curated navigation case, including charts the
  // preset cannot drive yet (maps), so their unsupported status stays visible.
  const modeCases = mode === 'navigate'
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
  const variants = embedded ? GALLERY_VARIANTS[mode] : undefined;
  const [variantIndex, setVariantIndex] = useState(0);
  const variant = variants?.choices[variantIndex];
  const cardMode = variant?.mode ?? mode;
  const picks = embedded ? variant?.cases ?? GALLERY_CASES[mode] : undefined;
  const visibleCases = picks
    ? picks.flatMap((id) => modeCases.filter((item) => item.id === id))
    : modeCases;
  const tally = visibleCases.reduce((counts, item) => {
    const status = probes[item.id] ?? 'loading';
    counts[status] += 1;
    return counts;
  }, { ready: 0, unsupported: 0, error: 0, loading: 0 } as Record<ProbeStatus, number>);
  const specPattern = modeSpec(cardMode, undefined, navigationGuard, '<group-field>', { seriesBy: '<series-field>', displayValue: true });
  const formatProperties = (value: object, indentation: number) => Object.entries(value).map(([key, property]) => {
    const padding = ' '.repeat(indentation);
    const prefix = `${padding}${JSON.stringify(key)}: `;
    const formatted = stringify(property, { indent: 2, maxLength: 88 - prefix.length });
    return `${prefix}${formatted.split('\n').join(`\n${padding}`)}`;
  }).join(',\n');
  const specCode = [
    '{',
    '  "interaction_spec": {',
    Object.entries(specPattern).map(([key, value]) => key === 'interactions'
      ? [
        '    "interactions": [',
        specPattern.interactions.map(entry => `      {\n${formatProperties(entry, 8)}\n      }`).join(',\n'),
        '    ]',
      ].join('\n')
      : formatProperties({ [key]: value }, 4)).join(',\n'),
    '  }',
    '}',
  ].join('\n');
  const functionalCode = flintChartCode({
    presets: specPattern.interactions.map((entry) => {
      const factory = presetFactoryName(entry.type);
      const prefix = `    ${factory}(`;
      return {
        factory,
        options: entry.options ? stringify(entry.options, { indent: 2, maxLength: 80 - prefix.length - 2 }) : '',
      };
    }),
    keyboardTargeting: specPattern.keyboardTargeting,
    logInteractions: true,
  });
  // The code names the chosen variant and lists the others, so the switch reads as one option.
  const noteVariant = (code: string) => variants && variant
    ? code.replace(new RegExp(`^(.*"${variants.option}": "${variant.value}".*)$`, 'm'), (line) =>
      `${line}  // or ${variants.choices.filter((choice) => choice !== variant).map((choice) => `"${choice.value}"`).join(', ')}`)
    : code;

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
      <header className={`dev-page-heading cf-heading${embedded ? ' cf-heading-with-code' : ''}`}>
        <div>
        {embedded ? <>
          <div className="cf-heading-title">
            <Heading>{[...unitInteractionModes, ...compositionInteractionModes].find(item => item.value === mode)?.label}</Heading>
          </div>
          {behaviorDescriptions && <section className="cf-interaction-detail cf-preset-description" aria-label="Available interactions">
            {behaviorDescriptions.length === 1 ? <p>{behaviorDescriptions[0].content}</p>
              : <ul>{behaviorDescriptions.map(description => <li key={description.trigger}>{description.content}</li>)}</ul>}
          </section>}
          {eventActions && <section className="cf-interaction-detail cf-emitted-events" aria-label="Emitted Events">
            <div className="cf-emitted-events-heading">
              <h2>Emitted Events</h2>
            </div>
            <ul>{eventActions.map(action => <li key={action}>
              <code>{action}</code> {eventDescriptions?.[action]}
            </li>)}</ul>
            <p className="cf-events-doc-link">See <LocaleLink to="/documentation/interaction-components" className="site-text-link">Interaction components</LocaleLink> for how to read and handle Flint events.</p>
          </section>}
        </> : <>
        <h1>{source === 'spec' ? 'Interaction gallery, from a spec' : 'Interaction gallery'}</h1>
        {source === 'spec' ? (
          <p>
            The same cases as Test cases, but every chart mounts from <code>interaction_spec</code> instead
            of factory calls. Open <em>interaction_spec</em> on a card to read the JSON it used. A card marked
            unsupported still rendered; the message under its header names the entry the chart dropped.
          </p>
        ) : (
          <p>Choose an interaction mode, then try it across the compatible chart cases:</p>
        )}
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
        <div className="cf-summary">
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
          {source === 'spec' && (
            <label className="cf-spec-toggle">
              <input type="checkbox" checked={showSpec} onChange={(event) => setShowSpec(event.target.checked)} />
              Expand interaction_spec on every card
            </label>
          )}
        </div>
        </>}
        {showThemePicker && <div className="cf-theme-picker">
          <ThemePicker themeId={themeId} onTheme={setThemeId} />
        </div>}
        </div>
        {embedded && <section className="cf-preset-code" aria-label="Preset code">
          <div className="cf-preset-code-toolbar">
            <div className="cf-source-toggle" role="group" aria-label="Interaction source">
              {(['spec', 'code'] as const).map(value => <button key={value} type="button"
                aria-pressed={source === value} onClick={() => setSource(value)}>
                {value === 'spec' ? 'Spec (JSON)' : 'Functional'}
              </button>)}
            </div>
          </div>
          <div className="cf-gallery-spec" aria-label={source === 'spec' ? 'Interaction spec pattern' : 'Functional interaction code'}>
            <CodeBlock variant="light" language={source === 'spec' ? 'json' : 'typescript'}
              customStyle={{ margin: 0, padding: 8, fontSize: 10.5, lineHeight: 1.35, maxHeight: 200, overflow: 'auto' }}>
              {noteVariant(source === 'spec' ? specCode : functionalCode)}
            </CodeBlock>
          </div>
        </section>}
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
        {variants && variant && (
          <div className="cf-mode-controls">
            <span className="cf-mode-controls-label">{variants.label}</span>
            <div className="cf-source-toggle" role="group" aria-label={variants.label}>
              {variants.choices.map((choice, index) => <button key={choice.value} type="button"
                aria-pressed={choice === variant} onClick={() => setVariantIndex(index)}>
                {choice.label}
              </button>)}
            </div>
            <p>{variant.hint}</p>
          </div>
        )}
      </header>
      <div className={mode === 'navigate' ? 'cf-grid cf-grid-wide' : 'cf-grid'}>
        {visibleCases.map((item) => (
          <CaseCard
            key={`${source}-${cardMode}-${item.id}`}
            item={item}
            mode={cardMode}
            themeId={themeId}
            navigationGuard={navigationGuard}
            resetVersion={resetVersion}
            source={source}
            showSpec={!embedded && showSpec}
            showSpecPanel={!embedded}
            onProbe={onProbe}
          />
        ))}
      </div>
    </div>
  );
}

/** The Test cases gallery driven by `interaction_spec`: one design, checked from the JSON side. */
export function SpecTestCasesLab() {
  return <ClickFocusLab source="spec" />;
}
