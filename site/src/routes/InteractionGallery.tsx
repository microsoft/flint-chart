import { Fragment, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowLeftRight, Brush, Focus, GripVertical, Keyboard, Layers, LayoutGrid, MousePointerClick, Move, Pencil, Ruler, Scan, SlidersHorizontal, Table2, UserRound, ZoomIn } from 'lucide-react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { INTERACTION_PRESET_TYPES, type CanvasInteractionAction } from 'flint-chart/interactive';
import { CodeBlock } from '../components/CodeBlock';
import { MicrosoftDisclosures, SiteNavBar, SiteShell } from '../components/SiteShell';
import { LocaleLink } from '../i18n/LocaleLink';
import { useLocale } from '../i18n/LocaleContext';
import { siteTheme } from '../shared/theme';
import '../playground/playground.css';
import { ClickFocusLab, compositionInteractionModes, unitInteractionModes, type InteractionMode } from '../playground/ClickFocusLab';
import foodPrices from '../data/cpi-food-prices.json';
import { FlintChart } from 'flint-chart/react';
import type { ChartAssemblyInput } from 'flint-chart';
import { ScaleToFit } from '../components/ScaleToFit';
import { ThemePicker } from '../playground/ThemePicker';
import { FilterControlsGallery } from '../playground/FilterControlsGallery';
import { CompositionsGallery } from '../playground/CompositionsGallery';
import { ClimatePhaseStage } from '../playground/ClimatePhaseStage';
import { RetailDrilldownStage } from '../playground/RetailDrilldownStage';
import { YouDrawItStage } from '../playground/YouDrawItStage';
import { FreeformExplodedDetailStage } from '../playground/ExplodedDetailStage';
import { ContinentCohortStage, CountryTableStage } from '../playground/ExternalToChartLab';
import {
  CaseCard, interactionCases,
} from '../playground/InteractionGallery';

function MechanismArrows() {
  const svgRef = useRef<SVGSVGElement>(null);
  const [width, setWidth] = useState(720);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(svg);
    return () => observer.disconnect();
  }, []);

  const chartLeft = width * 0.04;
  const chartRight = width * 0.4;
  const environmentLeft = width * 0.6;
  const environmentRight = width * 0.96;
  const leftRail = -20;
  const rightRail = width + 20;

  return (
    <svg ref={svgRef} className="ig-mechanism-arrows" viewBox={`0 0 ${width} 330`} aria-hidden="true">
      <defs>
        {(['chart', 'external'] as const).map(path => (
          <marker key={path} id={`ig-${path}-arrow`} viewBox="0 0 10 10" refX="10" refY="5" markerUnits="userSpaceOnUse" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 Z" fill={`var(--ig-${path}-path)`} />
          </marker>
        ))}
      </defs>
      <path data-flows="internal outgoing" className="ig-chart-path" d={`M ${width / 2 - 36} 24 H ${leftRail} V 114 H ${chartLeft}`} markerEnd="url(#ig-chart-arrow)" />
      <path data-flows="internal outgoing" className="ig-chart-path" d={`M ${width * 0.22} 146 V 174`} markerEnd="url(#ig-chart-arrow)" />
      <path data-flows="internal" className="ig-chart-path" d={`M ${chartLeft} 130 H ${leftRail} V 274 H ${chartLeft}`} markerEnd="url(#ig-chart-arrow)" />
      <path data-flows="outgoing" className="ig-chart-path" d={`M ${chartRight} 198 H ${environmentLeft}`} markerEnd="url(#ig-chart-arrow)" />
      <path data-flows="incoming" className="ig-external-path" d={`M ${width / 2 + 36} 24 H ${rightRail} V 274 H ${environmentRight}`} markerEnd="url(#ig-external-arrow)" />
      <path data-flows="incoming" className="ig-external-path" d={`M ${environmentLeft} 274 H ${chartRight}`} markerEnd="url(#ig-external-arrow)" />
    </svg>
  );
}

const mechanismScenarios = [
  { value: 'internal', label: 'Linked brushing', direction: 'Internal', arrows: ['Compiler', 'handle (user)', 'Render (compiler)'], steps: [
    { title: 'Raw input', description: 'Drag (x1, y1) to (x2, y2)' },
    { title: 'Semantic event', description: 'select-region: [country1, ...]' },
    { title: 'Update operator', description: 'set-style: emphasize countries' },
    { title: 'Highlighted chart', description: 'Same countries, both subplots.' },
  ] },
  { value: 'outgoing', label: 'Table filtering', direction: 'Chart to external', arrows: ['Compiler', 'handle (user)', 'Render (app)'], steps: [
    { title: 'Raw input', description: 'Drag (x1, y1) to (x2, y2)' },
    { title: 'Semantic event', description: 'select-region: [country1, ...]' },
    { title: 'External update', description: 'Filter rows by country.' },
    { title: 'Filtered table', description: 'Rows for selected countries.' },
  ] },
  { value: 'incoming', label: 'Story highlighting', direction: 'External to chart', arrows: ['handle (user)', 'Render (compiler)'], steps: [
    { title: 'External event', description: 'Story step: Asia' },
    { title: 'Update operator', description: 'set-style: emphasize Asia' },
    { title: 'Highlighted chart', description: 'Asian countries; mute others.' },
  ] },
  { value: 'connected', label: 'Continent cohort', direction: 'Bidirectional', arrows: ['Compiler', 'handle (user)', 'Render (compiler)'], steps: [
    { title: 'Raw input', description: 'Click Japan at (x, y)' },
    { title: 'Semantic event', description: 'click-element: Japan, Asia' },
    { title: 'Update operator', description: 'set-style: emphasize Asia' },
    { title: 'Synced chart and tabs', description: 'Asia tab + all Asian points.' },
  ] },
] as const;
type MechanismScenario = typeof mechanismScenarios[number]['value'];

function InteractionMechanism() {
  const [selected, setSelected] = useState<MechanismScenario>('internal');
  const active = mechanismScenarios.find(scenario => scenario.value === selected) ?? mechanismScenarios[0];

  return <div className="ig-mechanism-layout">
    <div className="ig-mechanism-controls">
      <div className="ig-mechanism-scenarios" role="group" aria-label="Interaction scenarios">
        {mechanismScenarios.map(({ value, label, direction }) => <button key={value} type="button"
          aria-label={label} aria-describedby={`ig-scenario-direction-${value}`} aria-controls="ig-mechanism-example"
          aria-pressed={selected === value} data-active={selected === value}
          onClick={() => setSelected(value)}>
          <strong>{label}</strong>
          <span id={`ig-scenario-direction-${value}`} className="ig-mechanism-direction">{direction}</span>
        </button>)}
      </div>
    </div>
    <figure className="ig-mechanism" data-flow={selected} aria-label="Blue path: Flint Canvas listens to user inputs, updates its visual display, and emits interaction events for the external environment to listen and react. Orange path: user interactions with a report, dashboard, app, or another Flint chart send update commands back to the same visual display.">
      <MechanismArrows />
      <div className="ig-mechanism-user"><UserRound size={18} aria-hidden="true" /><strong>User</strong></div>
      <div data-flows="internal outgoing" className="ig-mechanism-path-label ig-mechanism-canvas-path ig-chart-path"><strong>Interact on canvas</strong><span>Update chart &amp; emit Flint event</span></div>
      <div data-flows="incoming" className="ig-mechanism-path-label ig-mechanism-host-path ig-external-path"><strong>Interact with host app</strong><span>Send commands to update Flint</span></div>
      <div className="ig-mechanism-node ig-mechanism-chart">
        <header><strong>Flint Canvas</strong></header>
        <div data-flows="internal outgoing" className="ig-mechanism-step ig-mechanism-input ig-chart-path">Listen to user inputs</div>
        <div data-flows="internal outgoing" className="ig-mechanism-step ig-mechanism-events ig-chart-path">Emit interaction events</div>
        <div data-flows="internal incoming" className="ig-mechanism-step ig-mechanism-display"><strong>Update visual display</strong><span>Highlight, annotate, zoom...</span></div>
      </div>
      <div className="ig-mechanism-exchange">
        <span data-flows="outgoing" className="ig-chart-path">Events</span>
        <span data-flows="incoming" className="ig-external-path">Updates</span>
      </div>
      <div className="ig-mechanism-node ig-mechanism-environment">
        <header data-flows="outgoing incoming"><strong>External Environment</strong><span>Report / dashboard / app<br />Other Flint charts</span></header>
        <div data-flows="outgoing" className="ig-mechanism-step ig-mechanism-events ig-chart-path">Listen &amp; react to Flint events</div>
        <div data-flows="incoming" className="ig-mechanism-step ig-mechanism-display ig-external-path">Send update commands</div>
      </div>
    </figure>
    <aside id="ig-mechanism-example" className="ig-mechanism-examples" aria-label="Concrete interaction example" aria-live="polite">
      {active.steps.map(({ title, description }, index) => <Fragment key={`${selected}-${index}`}>
        <div className="ig-mechanism-example">
          <strong>{title}</strong>
          <p>{description}</p>
        </div>
        {index < active.steps.length - 1 && <div className="ig-mechanism-example-arrow">
          <ArrowDown size={14} aria-hidden="true" />
          <span>{active.arrows[index]}</span>
        </div>}
      </Fragment>)}
    </aside>
  </div>;
}

// Not an InteractionMode: its page is FilterControlsGallery, not a ClickFocusLab case set.
const filterControlsMode = { value: 'filter-controls', label: 'Filter controls', icon: SlidersHorizontal } as const;
const compositionsMode = { value: 'compositions', label: 'Compositions', icon: Layers } as const;
type GalleryMode = InteractionMode | typeof filterControlsMode.value | typeof compositionsMode.value;
const galleryModes = [...unitInteractionModes, ...compositionInteractionModes, filterControlsMode, compositionsMode];

const supportedGroups = [
  { label: 'Highlight', icon: MousePointerClick, description: 'Emphasize a mark, category, or related group.',
    modes: ['click-highlight', 'click-group-focus', 'hover-group-focus', 'long-press', 'double-activate'] },
  { label: 'Select & brush', icon: Scan, description: 'Select regions, axis intervals, or angular sectors, optionally editable, and match groups across linked views.',
    modes: ['select', 'brush-x', 'brush-y', 'brush-angle', 'lasso', 'linked-brush'] },
  { label: 'Inspect & annotate', icon: Ruler, description: 'Read values at a position or attach a value label to a mark.',
    modes: ['inspect', 'inspect-index', 'annotate'] },
  { label: 'Change the view', icon: Move, description: 'Explore domains, reorder categories, or toggle series visibility.',
    modes: ['navigate', 'brush-zoom', 'drag-reorder', 'legend-toggle'] },
  { label: 'Widgets', icon: SlidersHorizontal, description: 'Controls the chart draws for the reader: filters beside it, and a menu of host actions beside a selection.',
    modes: ['filter-controls', 'context-menu'] },
  { label: 'Keyboard', icon: Keyboard, description: 'Navigate chart elements accessibly and activate them from the keyboard.',
    modes: ['accessible-navigation'] },
  { label: 'Compositions', icon: Layers, description: 'Presets that stack on one chart, each pair answering a two-step question.',
    modes: ['compositions'] },
] as const satisfies readonly { label: string; icon: typeof Move; description: string; modes: readonly GalleryMode[] }[];

const sections = supportedGroups.map(group => ({
  label: group.label,
  modes: group.modes.flatMap(value =>
    galleryModes.filter(item => item.value === value)),
}));

const countryElectricityMix = {
  France: { Nuclear: 65.195, Renewables: 26.89, Fossil: 7.915 },
  Germany: { Nuclear: 1.425, Renewables: 54.685, Fossil: 43.89 },
  'United States': { Nuclear: 18.215, Renewables: 22.679, Fossil: 59.106 },
  China: { Nuclear: 4.597, Renewables: 30.606, Fossil: 64.797 },
  Brazil: { Nuclear: 2.048, Renewables: 88.995, Fossil: 8.958 },
  Canada: { Nuclear: 13.787, Renewables: 65.397, Fossil: 20.816 },
  'United Kingdom': { Nuclear: 13.879, Renewables: 46.378, Fossil: 39.743 },
  India: { Nuclear: 2.513, Renewables: 19.287, Fossil: 78.201 },
  Japan: { Nuclear: 7.694, Renewables: 22.137, Fossil: 70.169 },
  Australia: { Nuclear: 0, Renewables: 34.81, Fossil: 65.19 },
};
const electricityMixCase = interactionCases.find(item => item.id === 'Stacked Bar Chart-Electricity generation mix by country, 2023');
const electricityReorderCase = electricityMixCase && {
  ...electricityMixCase,
  id: `${electricityMixCase.id}-ten-countries`,
  input: {
    ...electricityMixCase.input,
    semantic_types: {
      ...electricityMixCase.input.semantic_types,
      Share: { semanticType: 'Quantity' as const, intrinsicDomain: [0, 100] as [number, number] },
    },
    data: {
      values: Object.entries(countryElectricityMix).flatMap(([Country, sources]) =>
        Object.entries(sources).map(([Source, Share]) => ({ Country, Source, Share }))),
    },
    chart_spec: {
      ...electricityMixCase.input.chart_spec,
      title: 'Electricity generation mix by country, 2023',
      baseSize: { width: 600, height: 260 },
    },
  },
};

const inspectIndexCase = interactionCases.find(item => item.id === 'inspect-index-line-two-all');
const nutritionRadarCase = interactionCases.find(item => item.chartType === 'Radar Chart');

const curatedExamples = [
  { label: 'Linked brush', mode: 'linked-brush', implementation: 'Preset',
    interactionLabel: 'Linked brushing', icon: Brush,
    caption: 'Brushing countries in one year highlights the same countries in the other years.',
    item: interactionCases.find(item => item.id === 'Scatter Plot-Gapminder-faceted-years') },
  { label: 'Inspect', mode: 'inspect-index', implementation: 'Preset',
    interactionLabel: 'Shared-axis inspection', icon: Ruler,
    caption: 'Moving along the time axis reads egg and bread prices at the same month, with a labeled value guide for each series.',
    item: inspectIndexCase && {
      ...inspectIndexCase,
      input: {
        ...inspectIndexCase.input,
        chart_spec: {
          ...inspectIndexCase.input.chart_spec,
          title: 'U.S. average egg and bread prices, 2015-2025',
        },
      },
      indexInspection: { ...inspectIndexCase.indexInspection, displayValue: true },
    } },
  { label: 'Reorder', mode: 'drag-reorder', implementation: 'Preset',
    interactionLabel: 'Country reordering', icon: GripVertical,
    caption: 'Dragging a country bar reorders ten electricity-generation mixes (OWID/Ember, 2023); the source shares remain unchanged.',
    item: electricityReorderCase },
  { label: 'Cohorts', mode: 'continent-cohort', implementation: 'Preset-level app integration', item: undefined,
    interactionLabel: 'Bidirectional selection', icon: ArrowLeftRight,
    caption: 'The continent selector highlights its countries; selecting a country updates the continent summary.' },
  { label: 'Table to chart', mode: 'country-table', implementation: 'Preset-level app integration', item: undefined,
    interactionLabel: 'External selection', icon: Table2,
    caption: 'Selecting a country in the Gapminder table highlights its point and annotates its income and life expectancy.' },
  { label: 'DimpVis', mode: 'climate-phase', implementation: 'Custom API', item: undefined,
    interactionLabel: 'Temporal dragging (DimpVis)', icon: Move,
    caption: "Dragging a city's seasonal path moves all cities through the year; playback animates the same cycle." },
  { label: 'Keyboard', mode: 'accessible-navigation', implementation: 'Preset',
    interactionLabel: 'Accessible keyboard navigation', icon: Keyboard,
    caption: 'Move focus through chart elements and read their labels and values without a mouse.',
    item: nutritionRadarCase && {
      ...nutritionRadarCase,
      input: {
        ...nutritionRadarCase.input,
        chart_spec: {
          ...nutritionRadarCase.input.chart_spec,
          title: 'Nutritional profiles: almonds, Greek yogurt, and oats',
        },
      },
    } },
  { label: 'Zoom', mode: 'semantic-zoom', implementation: 'Custom API', item: undefined,
    interactionLabel: 'Semantic zoom', icon: ZoomIn,
    caption: 'Wheel zoom changes the time window and redraws the bars, axes, and value labels.' },
  { label: 'Draw it', mode: 'you-draw-it', implementation: 'Custom API', item: undefined,
    interactionLabel: 'Freehand prediction', icon: Pencil,
    caption: "Drawing the missing years predicts coal's share of U.S. electricity generation; revealing the real series scores the prediction." },
  { label: 'Fisheye', mode: 'freeform-detail', implementation: 'Custom API', item: undefined,
    interactionLabel: 'Magnified neighborhood detail', icon: Focus,
    caption: 'Moving over the temperature lines magnifies nearby points with labels; scrolling changes the lens magnification without zooming the chart.' },
] as const;

type CuratedExampleMode = typeof curatedExamples[number]['mode'];

function InteractionExamples({ selected, onSelect }: {
  selected: CuratedExampleMode;
  onSelect: (mode: CuratedExampleMode) => void;
}) {
  const active = curatedExamples.find(example => example.mode === selected) ?? curatedExamples[0];
  const CaptionIcon = active.icon;

  return <section className="ig-curated-examples" aria-labelledby="ig-examples-title">
    <header className="ig-example-header">
    <span id="ig-examples-title" className="ig-example-label">Examples</span>
    <div className="ig-example-tabs" role="tablist" aria-label="Interactive examples">
      {curatedExamples.map(({ label, mode }, index) => <button key={mode} type="button" role="tab"
        id={`ig-example-tab-${mode}`} aria-controls="ig-example-panel" aria-selected={selected === mode}
        tabIndex={selected === mode ? 0 : -1} onClick={() => onSelect(mode)}
        onKeyDown={event => {
          const nextIndex = event.key === 'ArrowRight' ? (index + 1) % curatedExamples.length
            : event.key === 'ArrowLeft' ? (index + curatedExamples.length - 1) % curatedExamples.length
            : event.key === 'Home' ? 0 : event.key === 'End' ? curatedExamples.length - 1 : undefined;
          if (nextIndex === undefined) return;
          event.preventDefault();
          const next = curatedExamples[nextIndex].mode;
          onSelect(next);
          document.getElementById(`ig-example-tab-${next}`)?.focus();
        }}>{label}</button>)}
    </div>
    </header>
    <div className="ig-example-workspace" id="ig-example-panel" role="tabpanel"
      aria-labelledby={`ig-example-tab-${selected}`} aria-describedby="ig-example-caption">
      <figure key={selected} className="ig-curated-example" data-example-mode={selected} aria-label={active.label}>
        {active.mode === 'continent-cohort' ? <ContinentCohortStage />
          : active.mode === 'country-table' ? <CountryTableStage />
          : active.mode === 'climate-phase' ? <ClimatePhaseStage compact height={440} showReadout />
          : active.mode === 'semantic-zoom' ? <RetailDrilldownStage />
          : active.mode === 'you-draw-it' ? <YouDrawItStage />
          : active.mode === 'freeform-detail' ? <FreeformExplodedDetailStage />
          : active.item && <CaseCard
            item={{
              ...active.item,
              input: {
                ...active.item.input,
                chart_spec: {
                  ...active.item.input.chart_spec,
                  title: active.item.input.chart_spec.title ?? active.item.title ?? active.item.chartType,
                },
              },
              stageHeight: 380, stageScale: 1, wide: false, spacious: false,
            }}
            mode={active.mode} source="spec" themeId={active.mode === 'inspect-index' ? 'powerbi-light' : undefined}
            navigationGuard={{ minVisibleFraction: 0.02, maxVisibleFraction: 1, overscrollFraction: 0 }}
            resetVersion={0} playback={active.mode === 'accessible-navigation'}
            selectionControls={active.mode === 'linked-brush'}
            keyboardControls={active.mode === 'accessible-navigation'} />}
        <figcaption id="ig-example-caption" className="ig-example-caption">
          <strong><CaptionIcon size={15} aria-hidden="true" />{active.interactionLabel}</strong>{' '}
          <span className="ig-example-source">({active.implementation})</span>:{' '}{active.caption}
        </figcaption>
      </figure>
    </div>
  </section>;
}

const behaviors: Partial<Record<InteractionMode, readonly { trigger: string; update: string }[]>> = {
  'click-highlight': [
    { trigger: 'Click a mark, a legend entry, or a discrete axis label', update: 'Highlight matching data and dim unrelated marks.' },
    { trigger: 'Shift-click (or Ctrl- or ⌘-click) another one', update: 'Add it to the highlight; doing it again on a highlighted one takes it out.' },
  ],
  'click-group-focus': [
    { trigger: 'Click a mark', update: 'Highlight all marks sharing its configured group and dim unrelated marks.' },
    { trigger: 'Shift-click (or Ctrl- or ⌘-click) a mark in another group', update: 'Add that group to the highlight, or take it out again.' },
  ],
  'hover-group-focus': [{ trigger: 'Hover over a mark', update: 'Temporarily emphasize its group without changing the retained selection.' }],
  annotate: [{ trigger: 'Click a mark', update: 'Add a value label in nearby free space, connected to the mark.' }],
  select: [
    { trigger: 'Drag a rectangle across the plot', update: 'Highlight enclosed marks and dim marks outside the rectangle.' },
    { trigger: 'Drag inside a stateful rectangle or on its edge', update: 'Move or resize the rectangle and update the highlighted marks.' },
    { trigger: 'Click outside a stateful rectangle', update: 'Clear the rectangle and restore all marks.' },
  ],
  'select-stateful': [
    { trigger: 'Drag a rectangle across the plot', update: 'Create a retained rectangle and highlight enclosed marks.' },
    { trigger: 'Drag inside the rectangle or on an edge', update: 'Move or resize the rectangle and update the highlighted marks.' },
    { trigger: 'Click outside the rectangle', update: 'Clear the rectangle and restore all marks.' },
  ],
  'linked-brush': [{ trigger: 'Drag a rectangle across the plot', update: 'Highlight matching groups across linked views and dim unrelated groups.' }],
  'brush-x': [
    { trigger: 'Drag horizontally across the plot', update: 'Highlight marks within the X interval and dim the rest.' },
    { trigger: 'Drag around the center of a compatible polar chart', update: 'Highlight marks within the angular sector.' },
    { trigger: 'Drag inside a stateful interval or on its edge', update: 'Move or resize the interval and update the highlighted marks.' },
    { trigger: 'Click outside a stateful interval', update: 'Clear the interval and restore all marks.' },
  ],
  'brush-y': [
    { trigger: 'Drag vertically across the plot', update: 'Highlight marks within the Y range and dim the rest.' },
    { trigger: 'Drag inside a stateful range or on its edge', update: 'Move or resize the range and update the highlighted marks.' },
    { trigger: 'Click outside a stateful range', update: 'Clear the range and restore all marks.' },
  ],
  'brush-angle': [
    { trigger: 'Drag around the chart center', update: 'Highlight marks within the angular sector and dim the rest.' },
    { trigger: 'Drag inside a stateful sector or on a boundary', update: 'Move or resize the sector and update the highlighted marks.' },
    { trigger: 'Click outside a stateful sector', update: 'Clear the sector and restore all marks.' },
  ],
  'brush-x-stateful': [
    { trigger: 'Drag horizontally across the plot', update: 'Create a retained interval and highlight matching marks.' },
    { trigger: 'Drag inside the interval or on an edge', update: 'Move or resize the interval and update the highlighted marks.' },
    { trigger: 'Click outside the interval', update: 'Clear the interval and restore all marks.' },
  ],
  'brush-y-stateful': [
    { trigger: 'Drag vertically across the plot', update: 'Create a retained range and highlight matching marks.' },
    { trigger: 'Drag inside the range or on an edge', update: 'Move or resize the range and update the highlighted marks.' },
    { trigger: 'Click outside the range', update: 'Clear the range and restore all marks.' },
  ],
  'brush-angle-stateful': [
    { trigger: 'Drag around the chart center', update: 'Create a retained sector and highlight matching marks.' },
    { trigger: 'Drag inside the sector or on a boundary', update: 'Move or resize the sector and update the highlighted marks.' },
    { trigger: 'Click outside the sector', update: 'Clear the sector and restore all marks.' },
  ],
  navigate: [
    { trigger: 'Drag across the plot', update: 'Pan the visible axis domains within the configured limits.' },
    { trigger: 'Scroll the mouse wheel or pinch over the plot', update: 'Zoom the visible domains around the pointer or pinch position.' },
  ],
  'drag-reorder': [{ trigger: 'Drag a category mark to a new position', update: 'Reorder the bars and category labels without changing their values.' }],
  lasso: [{ trigger: 'Draw a freehand boundary around marks', update: 'Highlight enclosed marks and dim marks outside the boundary.' }],
  inspect: [{ trigger: 'Move the pointer across the plot', update: 'Move the inspection indicator and show values at the acquired Y position.' }],
  'inspect-index': [{ trigger: 'Move the pointer along the index axis', update: 'Move the shared indicator and show series values at that index.' }],
  'long-press': [{ trigger: 'Press and hold a mark', update: 'Highlight its data and dim unrelated marks.' }],
  'double-activate': [{ trigger: 'Double-click a mark', update: 'Highlight its data and dim unrelated marks.' }],
  'legend-toggle': [{ trigger: 'Click a legend entry', update: 'Hide or show the marks in its series.' }],
  'brush-zoom': [
    { trigger: 'Drag a rectangle across the plot', update: 'Zoom the continuous axes into the selected region.' },
    { trigger: 'Press Escape or double-click', update: 'Restore the initial viewport.' },
  ],
  'accessible-navigation': [
    { trigger: 'Focus the chart and press arrow keys, Enter, or Escape', update: 'Move between chart elements, update the focus indicator, and announce the focused content.' },
    { trigger: 'Press Tab after Enter', update: 'Step through the elements at that level; past the last one, Tab moves on from the chart.' },
  ],
  'keyboard-focus': [
    { trigger: 'Click a mark', update: 'Highlight its data and dim unrelated marks.' },
    { trigger: 'Use arrow keys while the chart is focused, then press Enter', update: 'Move between marks and activate the focused mark.' },
  ],
  'context-menu': [
    { trigger: 'Pick marks with the gesture chosen below (a rectangle, a lasso, a click, a right-click, or a long press)', update: 'Highlight them and open a menu of actions beside them.' },
    { trigger: 'Pick a menu item', update: 'Hand the action and the picked marks to the host, which performs it.' },
  ],
};

const eventActions: Partial<Record<InteractionMode, readonly CanvasInteractionAction[]>> = {
  'click-highlight': ['click-element', 'click-legend', 'click-axis'],
  'click-group-focus': ['click-element'],
  'hover-group-focus': ['hover-element'],
  annotate: ['click-element'],
  select: ['select-region'],
  'select-stateful': ['select-region'],
  'linked-brush': ['select-region'],
  'brush-x': ['brush-x', 'brush-angle'],
  'brush-y': ['brush-y'],
  'brush-angle': ['brush-angle'],
  'brush-x-stateful': ['brush-x', 'brush-angle'],
  'brush-y-stateful': ['brush-y'],
  'brush-angle-stateful': ['brush-angle'],
  navigate: ['pan-viewport', 'zoom-viewport', 'reset-viewport'],
  'drag-reorder': ['drag'],
  lasso: ['select-lasso'],
  inspect: ['inspect-y'],
  'inspect-index': ['inspect-x', 'inspect-y'],
  'long-press': ['long-press-element'],
  'double-activate': ['double-activate-element'],
  'legend-toggle': ['click-legend'],
  'brush-zoom': ['select-region'],
  'accessible-navigation': ['focus-element'],
  'keyboard-focus': ['click-element', 'focus-element', 'activate-element'],
  'context-menu': ['menu-select'],
};

const eventDescriptions: Partial<Record<CanvasInteractionAction, string>> = {
  'click-element': 'The clicked mark and its represented data.',
  'click-legend': 'The legend entry and the data in its group.',
  'click-axis': 'The category label and the data it represents.',
  'hover-element': 'The hovered mark and its represented data.',
  'select-region': 'The rectangle and the marks selected within it.',
  'brush-x': 'The horizontal interval and matching data.',
  'brush-y': 'The vertical range and matching data.',
  'brush-angle': 'The angular sector and matching data.',
  'pan-viewport': 'The axes and translation of the visible domain.',
  'zoom-viewport': 'The axes, zoom factor, and zoom anchor.',
  'reset-viewport': 'The axes whose visible domain returns to the initial frame.',
  drag: 'The dragged category and its drop target.',
  'select-lasso': 'The freehand polygon and the marks selected within it.',
  'inspect-x': 'The acquired position along X and its matching values.',
  'inspect-y': 'The acquired position along Y and its matching values.',
  'long-press-element': 'The held mark and its represented data.',
  'double-activate-element': 'The double-clicked mark and its represented data.',
  'focus-element': 'The focused chart element and its represented content.',
  'activate-element': 'The keyboard-activated element and its represented data.',
  'context-element': 'The mark resolved for a contextual action.',
  'menu-select': 'The item the reader picked (event.item), with the selected marks as the target.',
};

// The chart an agent would answer the example chat with.
const CHAT_SPEC = {
  data: {
    values: foodPrices.values
      .filter(({ item }) => item === 'Eggs' || item === 'White bread')
      .map(({ month, price, item }) => ({ Month: month, Price: price, Food: item })),
  },
  semantic_types: { Month: 'Date', Price: 'Currency', Food: 'Category' },
  field_display_names: { Price: 'Average price (USD)' },
  chart_spec: {
    chartType: 'Line Chart',
    encodings: { x: 'Month', y: 'Price', color: 'Food' },
    baseSize: { width: 380, height: 200 },
  },
  interaction_spec: { interactions: [{ type: 'inspect-index', options: { show: 'all' } }] },
} as ChartAssemblyInput;

export function FlintInteractive() {
  const [selectedExample, setSelectedExample] = useState<CuratedExampleMode>('linked-brush');
  return <div className="ig-article-page" style={{ fontFamily: siteTheme.fontSans, color: siteTheme.text }}>
    <SiteNavBar flush />
    <main className="ig-article-main">
      <article className="ig-article">
        <header>
          <h1>Flint Interactive</h1>
          <section className="ig-overview-intro" aria-label="About Flint-interactive">
            <p>Flint-interactive is a language for creating interactive data visualizations on top of Flint. It allows you to create dashboards, interactive data stories, and interactive artifacts more easily. You can use {INTERACTION_PRESET_TYPES.length} <LocaleLink to="/interactions/gallery">presets</LocaleLink> to quickly make a chart interactive, and use the <LocaleLink to="/documentation/interaction-api">Flint API</LocaleLink> to compose <LocaleLink to="/interactions/advanced">advanced interactions</LocaleLink> that connect to external apps. Flint-interactive is available both in the <LocaleLink to="/mcp">MCP server</LocaleLink>, for interactive charts right in your chat with an agent, and in the <a href="https://www.npmjs.com/package/flint-chart" target="_blank" rel="noreferrer">npm library</a>, for building interactive apps, dashboards, and data stories.</p>
            <p>The magic behind Flint-interactive is its compiler that maps user interactions to <strong>semantic events</strong> that reflect the meaning of the items users interact with, and provides <strong>high-level operators</strong> to perform visual updates based on internal and external events. The separation of interaction and visual logic allows us to design high-level yet expressive interactions for agents to create rich interactive visualizations.</p>
          </section>
        </header>
        <nav className="ig-entry-links" aria-label="Interaction galleries">
          <LocaleLink to="/interactions/gallery" className="ig-entry-link">
            <LayoutGrid size={17} aria-hidden="true" /> Interaction Presets
          </LocaleLink>
          <LocaleLink to="/interactions/advanced" className="ig-entry-link">
            <Pencil size={17} aria-hidden="true" /> Advanced Interactions
          </LocaleLink>
        </nav>
        <InteractionExamples selected={selectedExample} onSelect={setSelectedExample} />
        <section className="ig-overview-intro" aria-labelledby="ig-usage-title">
          <h2 id="ig-usage-title">How to use</h2>
          <section className="ig-usage-row" aria-labelledby="ig-usage-chat">
            <div className="ig-usage-description">
              <h3 id="ig-usage-chat" className="ig-usage-subtitle">1. Use Flint in your chat</h3>
              <p>Use Flint Interactive directly in your chat or canvas environment through Flint-MCP and MCP Apps, following the <LocaleLink to="/mcp">MCP setup guide</LocaleLink>.</p>
              <p>With the latest release, tell your agent what to chart and which interactions you want; it can generate an <code>interaction_spec</code> alongside the Flint chart spec and render the interactive chart in your conversation.</p>
            </div>
            <div className="ig-usage-code ig-chat" aria-label="Example chat">
              <p className="ig-chat-user">Visualize U.S. egg and bread prices since 2015. Let me hover to read both at any month.</p>
              <div className="ig-chat-agent">
                <p>Here it is. Hover along the timeline to read both prices.</p>
                <ScaleToFit height={220} adaptiveHeight padding={0}>
                  <FlintChart spec={CHAT_SPEC} renderer="svg" ariaLabel="U.S. egg and bread prices" />
                </ScaleToFit>
              </div>
            </div>
          </section>
          <section className="ig-usage-row" aria-labelledby="ig-usage-app">
            <div className="ig-usage-description">
              <h3 id="ig-usage-app" className="ig-usage-subtitle">2. Build an interactive app with Flint</h3>
              <p>Build interactive charts in a dashboard, data story, or apps with Flint Canvas. You can define how your app responds to Flint's semantic interaction events to update app state, or send <LocaleLink to="/documentation/interaction-api#update-operators-and-host-responses">update operators</LocaleLink> (e.g., <code>set-style</code> to highlight, <code>set-viewport</code> to zoom) to instruct Flint to update the chart in response to external events.</p>
              <p>To get started, share the <a href="https://github.com/microsoft/flint-chart/blob/main/agent-skills/flint-interaction-author/SKILL.md" target="_blank" rel="noreferrer">interaction-author skill</a> with your coding agent to generate presets for your app.</p>
            </div>
            <div className="ig-usage-code">
            <CodeBlock language="tsx" variant="light" wrapLongLines customStyle={{ margin: 0, fontSize: 12 }}>{`<FlintChart
  spec={{
    chart_spec: { chartType: "Scatter Plot", … },
    interaction_spec: {
      interactions: [{ type: "brush-x" }]
    }
  }}
  onChange={({ phase, state }) => {
    const rows = state.selected.map(…);
    if (phase === "preview") table.highlight(rows);
    if (phase === "commit") table.filter(rows);
  }}
/>`}</CodeBlock>
            </div>
          </section>
          <section className="ig-usage-row" aria-labelledby="ig-usage-bespoke">
            <div className="ig-usage-description">
              <h3 id="ig-usage-bespoke" className="ig-usage-subtitle">3. Create bespoke interactions</h3>
              <p>To create bespoke interactions beyond Flint's presets, define a trigger and a custom <code>handle</code> function with the <LocaleLink to="/documentation/interaction-api">programming API</LocaleLink> that maps semantic events to custom chart update sequences.</p>
              <p>Share the <a href="https://github.com/microsoft/flint-chart/blob/main/agent-skills/flint-interaction-author/SKILL.md" target="_blank" rel="noreferrer">interaction-author skill</a> with your coding agent for preset conventions, and use the programming guide to help it build custom interactions for your app. Check out some bespoke interactions we built in <LocaleLink to="/interactions/advanced">Advanced Interactions</LocaleLink>.</p>
            </div>
            <div className="ig-usage-code">
              <CodeBlock language="tsx" variant="light" wrapLongLines customStyle={{ margin: 0, fontSize: 12 }}>{`const countryDetails = {
  id: "country-details",
  eventSource: { gesture: "click", … },
  // target: the clicked country, as data
  handle: ({ target }) => ({ ops: [
    { op: "set-style", targets: [target],
      value: { state: "emphasized" } },
    { op: "set-annotation", target,
      value: { text: … } },
    { op: "set-overlay", name: "continent-avg",
      value: { mark: "rule", data: …, encodings: … } },
  ] }),
};

<FlintChart spec={…}
  interactions={[countryDetails]} />`}</CodeBlock>
            </div>
          </section>
        </section>
        <section className="ig-overview-intro" aria-labelledby="ig-mechanism-title">
          <h2 id="ig-mechanism-title">How it works</h2>
          <p>Flint Canvas is a state machine that tracks user interactions on the canvas and manages visual rendering state. Flint makes interaction specification easy by separating visual logic, managed by the compiler, from interaction logic, specified by the user at the semantic level:</p>
          <ol className="ig-mechanism-logic">
            <li><strong>Visual logic:</strong> The compiler automatically resolves raw triggers, such as clicks, drags, and key presses, into <strong>semantic events</strong> that identify chart elements and data. It also translates <strong>update operators</strong> into rendered canvas changes, handling hit testing and low-level visual updates.</li>
            <li><strong>Interaction logic:</strong> The user specifies interactions by mapping semantic interaction events to chart update operators, such as <code>set-style</code> to highlight data, <code>set-annotation</code> to label a point, or <code>set-viewport</code> to pan or zoom. The user can also use those semantic events to update external tables, widgets, or application state.</li>
          </ol>
          <p>This separation means users do not need to reverse-engineer rendering logic or manipulate renderer-specific marks, making interactions easier to specify and maintain. Furthermore, because event generation and visual updates are compositional, the same model also connects Flint with tables, text, other charts, and widgets to build interactive stories and dashboards.</p>
          <InteractionMechanism />
        </section>
        <section className="ig-overview-intro" aria-labelledby="ig-support-title">
          <h2 id="ig-support-title">Interaction Presets</h2>
          <dl className="ig-support-list" style={{ maxWidth: 832, margin: '0 auto 20px' }}>
            {supportedGroups.map(({ icon: Icon, ...group }) => <Fragment key={group.label}>
              <dt><Icon size={16} strokeWidth={1.8} aria-hidden="true" /><span>{group.label}</span></dt>
              <dd>
                <p>{group.description}</p>
                <div>{group.modes.map((value, index) => <Fragment key={value}>
                  {index > 0 && <span aria-hidden="true"> / </span>}
                  <LocaleLink to={`/interactions/${value}`}>
                    {galleryModes.find(item => item.value === value)?.label}
                  </LocaleLink>
                </Fragment>)}</div>
              </dd>
            </Fragment>)}
          </dl>
          <p>Compatibility depends on the chart type, its data, and axis configuration.</p>
        </section>
        <section className="ig-overview-intro" aria-labelledby="ig-try-title">
          <h2 id="ig-try-title">Try It Now!</h2>
          <p><strong>Chart users:</strong> <LocaleLink to="/documentation/setup-flint-mcp">Set up Flint in your chat</LocaleLink> and ask your agent to create an interactive chart. Find inspiration in the <LocaleLink to="/interactions/gallery">interaction presets</LocaleLink>.</p>
          <p><strong>App builders:</strong> Build interactive dashboards, data stories, and connected views with the <LocaleLink to="/documentation/interaction-api">programming API</LocaleLink>. Share the <a href="https://github.com/microsoft/flint-chart/blob/main/agent-skills/flint-interaction-author/SKILL.md" target="_blank" rel="noreferrer">interaction-author skill</a> with your coding agent to add presets to your app.</p>
          <p><strong>Interaction designers:</strong> Explore the <LocaleLink to="/interactions/advanced">advanced examples</LocaleLink>, design a new interaction, and turn it into a reusable preset. <a href="https://github.com/microsoft/flint-chart/issues/new" target="_blank" rel="noreferrer">Propose a preset on GitHub</a> and share your prototype or implementation to help expand Flint's interaction vocabulary.</p>
        </section>
      </article>
    </main>
    <MicrosoftDisclosures />
  </div>;
}

export function InteractionGallery() {
  const { mode } = useParams();
  const { pathname } = useLocation();
  const { lp } = useLocale();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [themeId, setThemeId] = useState<string | undefined>(undefined);
  const selected = galleryModes.find(item => item.value === mode)
    ?? (!mode ? unitInteractionModes[0] : undefined);
  useEffect(() => { scrollRef.current?.scrollTo(0, 0); }, [mode]);

  if (mode === 'select-context') return <Navigate to={lp('/interactions/gallery/context-menu')} replace />;
  if (mode === 'keyboard-focus') return <Navigate to={lp('/interactions/gallery/compositions')} replace />;
  if (!selected) return <Navigate to={lp('/interactions')} replace />;
  // Stateful brushes are shown on their brush page, behind its mode switch.
  if (selected.value.endsWith('-stateful')) {
    return <Navigate to={lp(`/interactions/gallery/${selected.value.replace(/-stateful$/, '')}`)} replace />;
  }
  if (mode && !pathname.includes('/interactions/gallery/')) {
    return <Navigate to={lp(`/interactions/gallery/${mode}`)} replace />;
  }

  return (
    <SiteShell>
      <div className="ig-scroll dev-shell" ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', fontFamily: siteTheme.fontSans }}>
        <div className="ig-layout">
          <main className="ig-content">
            <header className="ig-gallery-header">
              <nav className="ig-breadcrumb" aria-label="Breadcrumb">
                <LocaleLink to="/interactions">Flint Interactive</LocaleLink><span aria-hidden="true">/</span><span aria-current="page">Interaction Presets</span>
              </nav>
              <div className="ig-gallery-title-row">
                <h1>Interaction Presets</h1>
                <ThemePicker themeId={themeId} onTheme={setThemeId} />
              </div>
              <p>This page showcases {sections.reduce((count, section) => count + section.modes.length, 0)} interaction presets that are reusable across chart types. The presets support {sections.length} families of common interactions: {sections.map(section => section.label).join(', ')}.</p>
              <p>You can use these presets directly in a declarative specification or through the functional API in your application. To create bespoke interactions, refer to the <LocaleLink to="/interactions/advanced" className="site-text-link">Advanced Interactions page</LocaleLink>.</p>
            </header>
            <nav className="cf-action-rail ig-action-rail" aria-label="Interaction navigation">
              {sections.map((section, index) => (
                <Fragment key={section.label}>
                  {index > 0 && <div className="cf-action-divider" role="separator" />}
                  {section.modes.map(({ value, label, icon: Icon }) => (
                    <LocaleLink key={value} to={`/interactions/gallery/${value}`} className={selected.value === value ? 'active' : undefined}
                      aria-current={selected.value === value ? 'page' : undefined}>
                      <Icon size={15} strokeWidth={1.8} aria-hidden="true" /><span>{label}</span>
                    </LocaleLink>
                  ))}
                </Fragment>
              ))}
            </nav>
            {selected.value === filterControlsMode.value
              ? <FilterControlsGallery themeId={themeId} />
              : selected.value === compositionsMode.value
              ? <CompositionsGallery themeId={themeId} />
              : <ClickFocusLab key={selected.value} source="spec" mode={selected.value} embedded
                headingLevel={2}
                themeId={themeId} showThemePicker={false}
                behaviors={behaviors[selected.value]}
                eventActions={eventActions[selected.value]} eventDescriptions={eventDescriptions} />}
          </main>
        </div>
      </div>
    </SiteShell>
  );
}