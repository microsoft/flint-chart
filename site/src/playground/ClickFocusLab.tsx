import { useEffect, useRef, useState } from 'react';
import { ChevronDown, GripVertical, Layers3, MessageSquareText, MousePointer2, Move, MoveHorizontal, MoveVertical, RotateCcw, RotateCw, Scan } from 'lucide-react';
import { assembleVegaLite, type ChartAssemblyInput } from 'flint-chart';
import {
  genBarTests,
  TEST_GENERATORS,
  type TestCase,
} from 'flint-chart/test-data';
import {
  buildInteractiveChart,
  brushAngle,
  brushX,
  brushY,
  clickAnnotate,
  clickGroupHighlight,
  clickHighlight,
  dragReorder,
  navigate,
  select as rectangleSelect,
  type FlintInteractionEventDetail,
} from 'flint-chart/interactive';
import { expressionInterpreter } from 'vega-interpreter';
import { ScaleToFit } from '../components/ScaleToFit';
import { BACKENDS } from '../shared/supported-backends';
import { testCaseToAssemblyInput } from '../shared/test-case-utils';
import { ThemePicker } from './ThemePicker';
import { navigationDemoCases } from './navigation-demo-data';
import './click-focus-lab.css';

export type InteractionMode = 'element' | 'group' | 'annotate' | 'select'
  | 'brush-x' | 'brush-y' | 'brush-angle' | 'brush-x-stateful' | 'brush-y-stateful' | 'navigate' | 'drag-reorder';
type ProbeStatus = 'loading' | 'ready' | 'unsupported' | 'error';

export interface NavigationGuard {
  minVisibleFraction: number;
  maxVisibleFraction: number;
  overscrollFraction: number;
}

const interactionModes = [
  { value: 'element', label: 'Element', icon: MousePointer2 },
  { value: 'group', label: 'Group', icon: Layers3 },
  { value: 'annotate', label: 'Annotate', icon: MessageSquareText },
  { value: 'select', label: 'Select', icon: Scan },
  { value: 'brush-x', label: 'X brush', icon: MoveHorizontal },
  { value: 'brush-y', label: 'Y brush', icon: MoveVertical },
  { value: 'brush-angle', label: 'Angular brush', icon: RotateCw },
  { value: 'brush-x-stateful', label: 'X brush (edit)', icon: MoveHorizontal },
  { value: 'brush-y-stateful', label: 'Y brush (edit)', icon: MoveVertical },
  { value: 'navigate', label: 'Pan & zoom', icon: Move },
  { value: 'drag-reorder', label: 'Drag reorder', icon: GripVertical },
] as const;

export interface InteractionCase {
  id: string;
  input: ChartAssemblyInput;
  navigationAxes?: 'x' | 'y' | 'xy';
  chartType: string;
  expectation: string;
}

const SIZE = { width: 350, height: 240 };

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
    expectation: selected.expectation,
  };
}

const interactionCases: InteractionCase[] = [
  ...representativeCases(),
  multiLegendCase('shape'),
  multiLegendCase('size'),
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

const ITEM_PREVIEW_LIMIT = 5;

function summarizeElement(
  element: NonNullable<FlintInteractionEventDetail['event']['target']>['elements'][number],
): string {
  const values = Object.entries(element.value ?? {})
    .filter(([field, value]) => !field.startsWith('__')
      && !['value', 'density', 'density_start', 'density_end'].includes(field)
      && value != null
      && typeof value !== 'object')
    .slice(0, 3)
    .map(([field, value]) => `${field}: ${String(value)}`);
  return values.length ? values.join(' · ') : Object.values(element.key).map(String).join(' · ');
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
  resetVersion,
  onStatus,
  onSemanticEvent,
}: {
  input: ChartAssemblyInput;
  mode: InteractionMode;
  themeId: string | undefined;
  navigationGuard: NavigationGuard;
  navigationAxes?: 'x' | 'y' | 'xy';
  resetVersion: number;
  onStatus: (status: ProbeStatus, message?: string) => void;
  onSemanticEvent: (detail: FlintInteractionEventDetail) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const statusRef = useRef(onStatus);
  const semanticEventRef = useRef(onSemanticEvent);
  statusRef.current = onStatus;
  semanticEventRef.current = onSemanticEvent;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    statusRef.current('loading');
    const handleInteraction = (event: Event) => {
      semanticEventRef.current((event as CustomEvent<FlintInteractionEventDetail>).detail);
    };
    container.addEventListener('flint-interaction', handleInteraction);
    const interaction = mode === 'element'
      ? clickHighlight()
      : mode === 'group'
        ? clickGroupHighlight()
        : mode === 'annotate'
          ? clickAnnotate()
        : mode === 'select'
          ? rectangleSelect()
          : mode === 'brush-x'
            ? brushX()
            : mode === 'brush-y'
              ? brushY()
              : mode === 'brush-angle'
                ? brushAngle()
                : mode === 'brush-x-stateful'
                  ? brushX({ mode: 'stateful' })
                  : mode === 'brush-y-stateful'
                    ? brushY({ mode: 'stateful' })
                    : mode === 'drag-reorder'
                      ? dragReorder()
                      : navigate({ axes: navigationAxes ?? 'available', domainGuard: navigationGuard });
    const themedInput = themeId ? { ...input, theme_spec: themeId } : input;
    const surface = buildInteractiveChart(container, themedInput, {
      backend: 'vegalite',
      renderer: 'svg',
      interactions: [interaction],
      expressionInterpreter,
      ariaLabel: input.chart_spec.title,
    });
    void surface.ready.then(() => statusRef.current('ready')).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      statusRef.current(message.includes('requires') || message.includes('support') ? 'unsupported' : 'error', message);
    });
    return () => {
      container.removeEventListener('flint-interaction', handleInteraction);
      surface.destroy();
    };
  }, [input, mode, navigationAxes, navigationGuard, resetVersion, themeId]);

  return <div className="cf-mount" ref={containerRef} />;
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
  const [itemsExpanded, setItemsExpanded] = useState(false);
  const title = item.input.chart_spec.title || item.input.chart_spec.chartType;
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
  const resolved = semanticItems.length > 0;
  const geometry = lastInteraction ? summarizeGeometry(lastInteraction.event) : undefined;
  const responded = resolved || lastInteraction?.event.action.endsWith('-viewport');
  return (
    <article className="cf-probe">
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
        <ScaleToFit height={420} minHeight={300} adaptiveHeight padding={8}>
          <InteractiveChart
            input={item.input}
            mode={mode}
            themeId={themeId}
            navigationGuard={navigationGuard}
            navigationAxes={item.navigationAxes}
            resetVersion={resetVersion}
            onStatus={(nextStatus, message) => {
              setStatus(nextStatus);
              setStatusMessage(message ?? (nextStatus === 'ready' ? 'Interactive surface ready' : 'Compiling'));
            }}
            onSemanticEvent={(detail) => {
              setLastInteraction(detail);
              setItemsExpanded(false);
            }}
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
                </span>
              )}
              {lastInteraction.event.dropTarget?.elements[0] && (
                <span className="cf-probe-event-value">Drop: {summarizeElement(lastInteraction.event.dropTarget.elements[0])}</span>
              )}
            </div>
            {semanticItems.length > 0 && (
              <div className="cf-probe-event-data">
                <ul className="cf-probe-event-items">
                  {semanticItems.slice(0, itemsExpanded ? undefined : ITEM_PREVIEW_LIMIT).map((element, index) => (
                    <li key={`${index}-${JSON.stringify(element.key)}`}>{summarizeElement(element)}</li>
                  ))}
                </ul>
                  {semanticItems.length > ITEM_PREVIEW_LIMIT && (
                  <button
                    type="button"
                    className="cf-items-toggle"
                    aria-expanded={itemsExpanded}
                    onClick={() => setItemsExpanded((expanded) => !expanded)}
                  >
                    {itemsExpanded ? 'Show less' : `Show ${semanticItems.length - ITEM_PREVIEW_LIMIT} more`}
                    <ChevronDown size={12} aria-hidden="true" />
                  </button>
                )}
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
  const [mode, setMode] = useState<InteractionMode>('element');
  const [themeId, setThemeId] = useState<string | undefined>(undefined);
  const [navigationGuard, setNavigationGuard] = useState<NavigationGuard>({
    minVisibleFraction: 0.02,
    maxVisibleFraction: 1,
    overscrollFraction: 0,
  });
  const [resetVersion, setResetVersion] = useState(0);
  const visibleCases = mode === 'brush-angle'
    ? interactionCases.filter((item) => ['Donut Chart', 'Pie Chart', 'Rose Chart'].includes(item.chartType))
    : mode === 'navigate'
      ? navigationCases.filter((item) => navigationAxesByCase.has(item.id))
      : mode === 'drag-reorder'
        ? interactionCases.filter((item) => reorderAxesByCase.has(item.id))
      : interactionCases;

  return (
    <div className="dev-page cf-page">
      <div className="cf-action-rail" role="toolbar" aria-label="Interaction mode">
        {interactionModes.map(({ value, label, icon: Icon }) => (
          <button
            key={value}
            type="button"
            className={mode === value ? 'active' : ''}
            aria-label={label}
            aria-pressed={mode === value}
            title={label}
            onClick={() => setMode(value)}
          >
            <Icon size={17} strokeWidth={1.8} aria-hidden="true" />
            <span>{label}</span>
          </button>
        ))}
      </div>
      <header className="dev-page-heading cf-heading">
        <h1>Interaction gallery</h1>
        <p>Choose an interaction mode, then try it across the compatible chart cases:</p>
        <ul className="cf-interaction-list">
          <li><strong>Element:</strong> Click a mark to focus it and dim the other marks.</li>
          <li><strong>Group:</strong> Click a mark to focus related marks in the same category or series.</li>
          <li><strong>Annotate:</strong> Click a mark to search nearby free space and connect its represented value.</li>
          <li><strong>Select:</strong> Drag a rectangle to focus all marks within an area.</li>
          <li><strong>X brush:</strong> Drag horizontally to focus marks across an X interval.</li>
          <li><strong>Y brush:</strong> Drag vertically to focus marks across a Y interval.</li>
          <li><strong>Angular brush:</strong> Drag around the center of a pie, donut, or rose chart.</li>
          <li><strong>Stateful brush:</strong> Move the committed interval, resize either edge, or click outside to clear it.</li>
          <li><strong>Pan & zoom:</strong> Drag continuous axes to pan; use the wheel or trackpad to zoom.</li>
        </ul>
        <div className="cf-summary"><span><strong>{visibleCases.length}</strong> test cases</span></div>
        <div className="cf-theme-picker">
          <ThemePicker themeId={themeId} onTheme={setThemeId} />
        </div>
        {mode === 'navigate' && (
          <div className="cf-navigation-controls" aria-label="Navigation guards">
            <label>
              <span>Minimum span <strong>{Math.round(navigationGuard.minVisibleFraction * 100)}%</strong></span>
              <input type="range" min="1" max="25"
                value={navigationGuard.minVisibleFraction * 100}
                onChange={(event) => setNavigationGuard((guard) => ({
                  ...guard, minVisibleFraction: Number(event.target.value) / 100,
                }))} />
            </label>
            <label>
              <span>Maximum span <strong>{Math.round(navigationGuard.maxVisibleFraction * 100)}%</strong></span>
              <input type="range" min="25" max="160"
                value={navigationGuard.maxVisibleFraction * 100}
                onChange={(event) => setNavigationGuard((guard) => ({
                  ...guard, maxVisibleFraction: Number(event.target.value) / 100,
                }))} />
            </label>
            <label>
              <span>Overscroll <strong>{Math.round(navigationGuard.overscrollFraction * 100)}%</strong></span>
              <input type="range" min="0" max="30"
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