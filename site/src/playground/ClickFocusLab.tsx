import { useEffect, useRef, useState } from 'react';
import { Layers3, MousePointer2, Move, MoveHorizontal, MoveVertical, RotateCcw, RotateCw, Scan } from 'lucide-react';
import { assembleVegaLite, type ChartAssemblyInput } from 'flint-chart';
import {
  genAreaTests,
  genBarTableTests,
  genBarTests,
  genBoxplotTests,
  genCandlestickTests,
  genConnectedScatterTests,
  genGanttTests,
  genGroupedBarTests,
  genHeatmapTests,
  genHistogramTests,
  genLineTests,
  genLollipopTests,
  genPieTests,
  genPyramidTests,
  genRangedDotPlotTests,
  genRoseTests,
  genScatterTests,
  genStackedBarTests,
  genStripPlotTests,
  genWaterfallTests,
  type TestCase,
} from 'flint-chart/test-data';
import {
  buildInteractiveChart,
  brushAngle,
  brushX,
  brushY,
  clickGroupHighlight,
  clickHighlight,
  navigate,
  select as rectangleSelect,
} from 'flint-chart/interactive';
import { expressionInterpreter } from 'vega-interpreter';
import { ScaleToFit } from '../components/ScaleToFit';
import { testCaseToAssemblyInput } from '../shared/test-case-utils';
import { ThemePicker } from './ThemePicker';
import './click-focus-lab.css';

type InteractionMode = 'element' | 'group' | 'select'
  | 'brush-x' | 'brush-y' | 'brush-angle' | 'brush-x-stateful' | 'brush-y-stateful' | 'navigate';
type Support = 'works' | 'partial' | 'none';

interface NavigationGuard {
  minVisibleFraction: number;
  maxVisibleFraction: number;
  overscrollFraction: number;
}

const interactionModes = [
  { value: 'element', label: 'Element', icon: MousePointer2 },
  { value: 'group', label: 'Group', icon: Layers3 },
  { value: 'select', label: 'Select', icon: Scan },
  { value: 'brush-x', label: 'X brush', icon: MoveHorizontal },
  { value: 'brush-y', label: 'Y brush', icon: MoveVertical },
  { value: 'brush-angle', label: 'Angular brush', icon: RotateCw },
  { value: 'brush-x-stateful', label: 'X brush (edit)', icon: MoveHorizontal },
  { value: 'brush-y-stateful', label: 'Y brush (edit)', icon: MoveVertical },
  { value: 'navigate', label: 'Pan & zoom', icon: Move },
] as const;

interface InteractionCase {
  id: string;
  input: ChartAssemblyInput;
  support: Support;
  expectation: string;
}

const SIZE = { width: 350, height: 240 };

function representative(generator: () => TestCase[]): TestCase {
  const cases = generator();
  return cases.find((test) => test.tags?.includes('real') && !test.encodingMap.column?.fieldID && !test.encodingMap.row?.fieldID)
    ?? cases.find((test) => !test.tags?.some((tag) => ['stress', 'edge-case', 'overflow'].includes(tag)))
    ?? cases[0];
}

function interactionCase(
  id: string,
  generator: () => TestCase[],
  support: Support,
  expectation: string,
): InteractionCase {
  const testCase = representative(generator);
  return {
    id,
    input: testCaseToAssemblyInput(testCase, SIZE) as ChartAssemblyInput,
    support,
    expectation,
  };
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
    support: 'works',
    expectation: selected.expectation,
  };
}

const interactionCases: InteractionCase[] = [
  interactionCase('bar', genBarTests, 'works', 'Element mode isolates one bar; group mode follows its color series.'),
  interactionCase('grouped-bar', genGroupedBarTests, 'works', 'Element mode isolates one bar; group mode follows the same color across categories.'),
  interactionCase('stacked-bar', genStackedBarTests, 'works', 'Element mode isolates one segment; group mode follows its color across stacks.'),
  interactionCase('heatmap', genHeatmapTests, 'works', 'A cell is keyed by both discrete axes.'),
  interactionCase('pie', genPieTests, 'works', 'Each arc is one semantic slice.'),
  interactionCase('rose', genRoseTests, 'works', 'Each radial arc is one semantic category.'),
  interactionCase('pyramid', genPyramidTests, 'works', 'Each age-and-side bar resolves independently.'),
  interactionCase('gantt', genGanttTests, 'works', 'Task bars resolve by their discrete task axis.'),
  interactionCase('waterfall', genWaterfallTests, 'partial', 'Group mode follows the implicit increase, decrease, or total color; connectors remain independent.'),
  interactionCase('bar-table', genBarTableTests, 'partial', 'Bars respond; text and table furniture do not.'),
  interactionCase('histogram', genHistogramTests, 'works', 'Each generated bin is one selectable interval.'),
  interactionCase('lollipop', genLollipopTests, 'works', 'A dot and its stem resolve to one encoded observation.'),
  interactionCase('candlestick', genCandlestickTests, 'works', 'Body, wick, and doji tick resolve to one trading interval.'),
  interactionCase('scatter', genScatterTests, 'works', 'Each point resolves by its complete encoded identity.'),
  multiLegendCase('shape'),
  multiLegendCase('size'),
  interactionCase('strip', genStripPlotTests, 'works', 'Element mode isolates one point; group mode follows every point in its jitter lane.'),
  interactionCase('line', genLineTests, 'works', 'Click or drag a segment; visible points remain independently selectable.'),
  interactionCase('area', genAreaTests, 'works', 'Each domain interval resolves to an area slice.'),
  interactionCase('boxplot', genBoxplotTests, 'works', 'Box, median, and whiskers coalesce by category and series.'),
  interactionCase('ranged-dot', genRangedDotPlotTests, 'works', 'Both endpoints and their connector resolve as one interval.'),
  interactionCase('connected-scatter', genConnectedScatterTests, 'works', 'Trajectory segments and observed points resolve independently.'),
];

const navigationAxesByCase = new Map(interactionCases.flatMap((item) => {
  const spec = assembleVegaLite(item.input) as any;
  const axes = spec._interactionSemantics?.navigationAxes as readonly ('x' | 'y')[] | undefined;
  return axes?.length ? [[item.id, axes] as const] : [];
}));

function InteractiveChart({
  input,
  mode,
  themeId,
  navigationGuard,
  resetVersion,
}: {
  input: ChartAssemblyInput;
  mode: InteractionMode;
  themeId: string | undefined;
  navigationGuard: NavigationGuard;
  resetVersion: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const interaction = mode === 'element'
      ? clickHighlight()
      : mode === 'group'
        ? clickGroupHighlight()
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
                    : navigate({ axes: 'available', domainGuard: navigationGuard });
    const themedInput = themeId ? { ...input, theme_spec: themeId } : input;
    const surface = buildInteractiveChart(container, themedInput, {
      backend: 'vegalite',
      renderer: 'svg',
      interactions: [interaction],
      expressionInterpreter,
      ariaLabel: input.chart_spec.title,
    });
    void surface.ready.catch((error) => {
      container.textContent = error instanceof Error ? error.message : String(error);
    });
    return () => surface.destroy();
  }, [input, mode, navigationGuard, resetVersion, themeId]);

  return <div className="cf-mount" ref={containerRef} />;
}

function CaseCard({
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
  const title = item.input.chart_spec.title || item.input.chart_spec.chartType;
  const navigationAxes = navigationAxesByCase.get(item.id);
  const description = mode === 'navigate'
    ? `Drag to pan and use the wheel or trackpad to zoom the ${navigationAxes?.join(' and ')} domain.`
    : item.expectation;
  return (
    <article className="cf-probe">
      <header className="cf-probe-header">
        <div>
          <h2>{title}</h2>
          <p>{description}</p>
        </div>
        <span className={`cf-status cf-status-${item.support}`}>
          {mode === 'navigate'
            ? navigationAxes?.join(' + ')
            : item.support === 'works' ? 'Bound' : item.support === 'partial' ? 'Partial' : 'Not bound'}
        </span>
      </header>
      <div className="cf-stage">
        <ScaleToFit height={420} minHeight={300} adaptiveHeight padding={8}>
          <InteractiveChart
            input={item.input}
            mode={mode}
            themeId={themeId}
            navigationGuard={navigationGuard}
            resetVersion={resetVersion}
          />
        </ScaleToFit>
      </div>
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
  const counts = interactionCases.reduce((result, item) => {
    result[item.support] += 1;
    return result;
  }, { works: 0, partial: 0, none: 0 });
  const visibleCases = mode === 'brush-angle'
    ? interactionCases.filter((item) => item.id === 'pie' || item.id === 'rose')
    : mode === 'navigate'
      ? interactionCases.filter((item) => navigationAxesByCase.has(item.id))
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
        <p>Flint currently supports five interaction families:</p>
        <ul className="cf-interaction-list">
          <li><strong>Element:</strong> Click a mark to focus it and dim the other marks.</li>
          <li><strong>Group:</strong> Click a mark to focus related marks in the same category or series.</li>
          <li><strong>Select:</strong> Drag a rectangle to focus all marks within an area.</li>
          <li><strong>X brush:</strong> Drag horizontally to focus marks across an X interval.</li>
          <li><strong>Y brush:</strong> Drag vertically to focus marks across a Y interval.</li>
          <li><strong>Angular brush:</strong> Drag around the center of a pie, donut, or rose chart.</li>
          <li><strong>Stateful brush:</strong> Move the committed interval, resize either edge, or click outside to clear it.</li>
          <li><strong>Pan & zoom:</strong> Drag continuous axes to pan; use the wheel or trackpad to zoom.</li>
        </ul>
        <div className="cf-summary" aria-label="Support summary">
          <span className="cf-summary-bound"><strong>{counts.works}</strong> bound</span>
          <span className="cf-summary-partial"><strong>{counts.partial}</strong> partial</span>
          <span className="cf-summary-none"><strong>{counts.none}</strong> not bound</span>
        </div>
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
      <div className="cf-grid">
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