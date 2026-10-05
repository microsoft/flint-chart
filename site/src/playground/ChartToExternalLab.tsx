import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type { ChartChange, ChartHiddenValue, ChartState, DomainGeometry, InteractionDef, SemanticElement } from 'flint-chart/interactive';
import { InteractionDemoChart } from './InteractionDemoChart';
import {
  countriesFixture,
  ganttFixture,
  incidentsFixture,
  lifeFixture,
  penguinsFixture,
  populationFixture,
  revenueFixture,
  salesFixture,
  stocksFixture,
  weatherFixture,
  type InteractionDemoFixture,
} from './interaction-demo-data';
import './interaction-transport.css';

type Row = Record<string, unknown>;

/** What the panel knows after a change: the rows to show, the gesture's own hit, and what the chart lights up. */
interface DemoView {
  phase: ChartChange['phase'] | null;
  rows: Row[];
  hit: Row[];
  shown: Row[];
  /** The rows of the retained updates: what a click pinned. */
  selection: Row[];
  /** The rows under the pointer while a hover previews; empty otherwise. */
  hover: Row[];
  /** The x value of the gesture, when it has one: a brushed start or an inspected index. */
  x: unknown;
  /** The domain the gesture reports: a brushed range, or the viewport after a pan or zoom. */
  domain: DomainGeometry | undefined;
  /** The fixture rows inside the viewport, queried on a commit only; null while a gesture runs. */
  visible: Row[] | null;
  /** The legend values a toggle hides now. */
  hidden: readonly ChartHiddenValue[];
}

const EMPTY_VIEW: DemoView = { phase: null, rows: [], hit: [], shown: [], selection: [], hover: [], x: undefined, domain: undefined, visible: null, hidden: [] };

type DemoGesture = 'click' | 'select' | 'hover-group' | 'inspect-index' | 'navigate' | 'legend-toggle';

export interface OutboundDemo {
  id: string;
  fixture: InteractionDemoFixture;
  title: string;
  description: string;
  panelTitle: string;
  gesture: DemoGesture;
  render: (view: DemoView, fixture: InteractionDemoFixture) => ReactNode;
}

function value(record: Row | undefined, field: string): string {
  const result = record?.[field];
  return result === undefined || result === null ? '—' : String(result);
}

function time(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  return Date.parse(String(value));
}

function monthLabel(value: unknown): string {
  if (value === undefined || value === null) return '—';
  const stamp = time(value);
  return Number.isNaN(stamp) ? String(value).slice(0, 7) : new Date(stamp).toISOString().slice(0, 7);
}

function month(record: Row | undefined): string {
  return monthLabel(record?.Month);
}

/** One row per series: the row whose month is nearest to the inspected x. A line segment hit carries both ends. */
function atIndex(rows: Row[], x: unknown, series: string): Row[] {
  const index = time(x);
  const nearest = new Map<string, Row>();
  for (const row of rows) {
    const key = String(row[series]);
    const current = nearest.get(key);
    if (!current || Math.abs(time(row.Month) - index) < Math.abs(time(current.Month) - index)) nearest.set(key, row);
  }
  return [...nearest.values()];
}

function mean(rows: Row[], field: string): number {
  return rows.reduce((sum, row) => sum + Number(row[field]), 0) / rows.length;
}

function metric(label: string, result: string | number) {
  return <div className="it-metric"><span>{label}</span><strong>{result}</strong></div>;
}

function intervalLabel(coordinate: { start: unknown; end: unknown }): string {
  const [low, high] = [Number(coordinate.start), Number(coordinate.end)].sort((a, b) => a - b);
  return `${low.toFixed(1)}–${high.toFixed(1)}`;
}

function fixtureRows(fixture: InteractionDemoFixture): Row[] {
  return (fixture.input.data.values ?? []) as Row[];
}

/** The value of each mark: the host's own identity for a row, with no copy of the row. */
function valuesOf(elements: readonly SemanticElement[]): Row[] {
  return elements.map((element) => element.value);
}

function retainedValues(state: ChartState): Row[] {
  const retained = [...(state.entries?.values() ?? [])].filter((entry) => entry.layer === 'retained');
  return valuesOf(retained.flatMap((entry) => entry.elements));
}

function encodedField(fixture: InteractionDemoFixture, channel: 'x' | 'y'): string | undefined {
  const encoding = fixture.input.chart_spec.encodings?.[channel];
  const first = Array.isArray(encoding) ? encoding[0] : encoding;
  return typeof first === 'string' ? first : first?.field;
}

/** The host's own query: the fixture rows whose x and y fall inside the reported viewport. */
function rowsInViewport(fixture: InteractionDemoFixture, domain: DomainGeometry | undefined): Row[] {
  return fixtureRows(fixture).filter((row) => (['x', 'y'] as const).every((channel) => {
    const coordinate = domain?.[channel];
    const field = encodedField(fixture, channel);
    if (coordinate?.kind !== 'interval' || !field) return true;
    const [low, high] = [Number(coordinate.start), Number(coordinate.end)].sort((a, b) => a - b);
    const value = Number(row[field]);
    return value >= low && value <= high;
  }));
}

/** A hidden legend value names its channel, so the colour legend reports `color`. */
function isHidden(hidden: readonly ChartHiddenValue[], value: unknown): boolean {
  return hidden.some((entry) => entry.channel === 'color' && Object.is(entry.value, value));
}

function sameRecord(a: Row, b: Row): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** A click demo keeps the pinned record on top and the hovered record below it. */
function clickPanel(demo: OutboundDemo, view: DemoView): ReactNode {
  const selected = view.selection[0];
  const hovered = view.hover[0];
  const showHover = hovered !== undefined && !(selected !== undefined && sameRecord(selected, hovered));
  if (!selected && !showHover) return null;
  return (
    <>
      <section className="it-panel-part">
        <h4 className="it-panel-part-label">Selected</h4>
        {selected
          ? demo.render({ ...view, rows: view.selection }, demo.fixture)
          : <p className="it-detail-note">Click a mark to pin it here.</p>}
      </section>
      {showHover && (
        <section className="it-panel-part">
          <h4 className="it-panel-part-label">Hovered</h4>
          {demo.render({ ...view, rows: view.hover }, demo.fixture)}
        </section>
      )}
    </>
  );
}

const demos: OutboundDemo[] = [
  {
    id: 'order-explorer', fixture: salesFixture, title: 'Order explorer', gesture: 'click',
    description: 'Hover or click a bar to send its region and segment into an order summary.',
    panelTitle: 'Selected order cohort',
    render({ rows }) {
      const row = rows[0];
      return row ? <>
        <div className="it-detail-heading">{value(row, 'Region')} / {value(row, 'Segment')}</div>
        <div className="it-metrics">
          {metric('Sales', `$${value(row, 'Sales ($K)')}K`)}
          {metric('Profit', `$${value(row, 'Profit ($K)')}K`)}
        </div>
      </> : null;
    },
  },
  {
    id: 'region-trend', fixture: revenueFixture, title: 'Series in context', gesture: 'hover-group',
    description: 'Hover a point. The chart lights up its whole series, and the panel reads the point from the hit and the series mean from the chart state.',
    panelTitle: 'Point and series',
    render({ hit, shown }) {
      const point = hit[0];
      if (!point || shown.length === 0) return null;
      const seriesMean = mean(shown, 'Revenue ($K)');
      const delta = Number(point['Revenue ($K)']) - seriesMean;
      return <>
        <div className="it-detail-heading">{value(point, 'Region')} in {month(point)}</div>
        <div className="it-metrics">
          {metric('This month', `$${value(point, 'Revenue ($K)')}K`)}
          {metric('Series mean', `$${seriesMean.toFixed(1)}K`)}
          {metric('Months in series', shown.length)}
        </div>
        <p className={delta >= 0 ? 'it-change positive' : 'it-change negative'}>
          {delta >= 0 ? '+' : ''}{delta.toFixed(1)}K against the series mean
        </p>
      </>;
    },
  },
  {
    id: 'month-comparison', fixture: revenueFixture, title: 'Every series at one index', gesture: 'inspect-index',
    description: 'Move along the x axis. The hit holds one point per region at that month, and the panel computes the largest gap between them.',
    panelTitle: 'Regions at this month',
    render({ hit, x }) {
      if (hit.length === 0) return null;
      const sorted = atIndex(hit, x, 'Region').sort((a, b) => Number(b['Revenue ($K)']) - Number(a['Revenue ($K)']));
      const top = sorted[0];
      const bottom = sorted[sorted.length - 1];
      return <>
        <div className="it-detail-heading">{month(top)}</div>
        <dl className="it-definition-list">
          {sorted.map((row) => (
            <div key={value(row, 'Region')}><dt>{value(row, 'Region')}</dt><dd>${value(row, 'Revenue ($K)')}K</dd></div>
          ))}
        </dl>
        {sorted.length > 1 && (
          <p className="it-narrative">
            Largest gap: <strong>${(Number(top['Revenue ($K)']) - Number(bottom['Revenue ($K)'])).toFixed(0)}K</strong> between {value(top, 'Region')} and {value(bottom, 'Region')}.
          </p>
        )}
      </>;
    },
  },
  {
    id: 'penguin-window', fixture: penguinsFixture, title: 'Viewport in context', gesture: 'navigate',
    description: 'Drag to pan or scroll to zoom. Each frame reports the shown ranges; on release the host queries its own rows inside them for the penguins in view and their mean body mass. Double-click to return home.',
    panelTitle: 'Penguins in view',
    render({ domain, visible }, fixture) {
      const x = domain?.x;
      if (x?.kind !== 'interval') return null;
      const total = fixtureRows(fixture).length;
      return <>
        <div className="it-detail-heading">Bill {intervalLabel(x)} mm</div>
        <div className="it-metrics">
          {metric('Flipper', domain?.y?.kind === 'interval' ? `${intervalLabel(domain.y)} mm` : '—')}
          {visible && metric('Penguins in view', `${visible.length} of ${total}`)}
          {visible && metric('Mean body mass', visible.length > 0 ? `${Math.round(mean(visible, 'Body mass (g)'))} g` : '—')}
          {visible && metric('Species', visible.length > 0 ? [...new Set(visible.map((row) => String(row.Species)))].join(', ') : '—')}
        </div>
        {!visible && <p className="it-detail-note">Release to count the penguins in view.</p>}
      </>;
    },
  },
  {
    id: 'severity-filter', fixture: incidentsFixture, title: 'Hidden series in context', gesture: 'legend-toggle',
    description: 'Click a severity in the legend to hide it. The chart state reports the hidden legend values, and the panel totals the severities that stay in view.',
    panelTitle: 'Severities in view',
    render({ hidden }, fixture) {
      const rows = fixtureRows(fixture);
      const severities = [...new Set(rows.map((row) => String(row.Severity)))];
      const hiddenNames = severities.filter((name) => isHidden(hidden, name));
      const total = (subset: Row[]) => subset.reduce((sum, row) => sum + Number(row.Incidents), 0);
      const shownRows = rows.filter((row) => !isHidden(hidden, row.Severity));
      return <>
        <div className="it-detail-heading">{hiddenNames.length === 0 ? 'Every severity shown' : `${hiddenNames.join(', ')} hidden`}</div>
        <div className="it-metrics">
          {metric('Severities in view', `${severities.length - hiddenNames.length} of ${severities.length}`)}
          {metric('Incidents in view', `${total(shownRows)} of ${total(rows)}`)}
        </div>
        <dl className="it-definition-list">
          {severities.map((name) => (
            <div key={name}>
              <dt>{name}</dt>
              <dd>{isHidden(hidden, name) ? 'hidden' : `${total(rows.filter((row) => row.Severity === name))} incidents`}</dd>
            </div>
          ))}
        </dl>
      </>;
    },
  },
  {
    id: 'country-profile', fixture: countriesFixture, title: 'Country profile', gesture: 'click',
    description: 'A resolved point updates a profile panel without parsing SVG or Vega internals.',
    panelTitle: 'Country profile',
    render({ rows }) {
      const row = rows[0];
      return row ? <>
        <div className="it-detail-heading">{value(row, 'Country')}</div>
        <div className="it-metrics">
          {metric('Continent', value(row, 'Continent'))}
          {metric('Life expectancy', `${value(row, 'Life expectancy')} years`)}
          {metric('GDP per capita', `$${Number(row['GDP per capita ($)']).toLocaleString()}`)}
          {metric('Population', `${value(row, 'Population (M)')}M`)}
        </div>
      </> : null;
    },
  },
  {
    id: 'penguin-cohort', fixture: penguinsFixture, title: 'Cohort summary', gesture: 'select',
    description: 'Drag a rectangle around penguins to compute statistics from the semantic selection.',
    panelTitle: 'Selected cohort',
    render({ rows }) {
      if (rows.length === 0) return null;
      const species = [...new Set(rows.map((row) => String(row.Species)))].join(', ');
      return <>
        <div className="it-detail-heading">{rows.length} penguins</div>
        <div className="it-metrics">
          {metric('Species', species)}
          {metric('Avg. bill', `${mean(rows, 'Bill length (mm)').toFixed(1)} mm`)}
          {metric('Avg. flipper', `${mean(rows, 'Flipper length (mm)').toFixed(1)} mm`)}
          {metric('Avg. mass', `${Math.round(mean(rows, 'Body mass (g)'))} g`)}
        </div>
      </>;
    },
  },
  {
    id: 'weather-detail', fixture: weatherFixture, title: 'Climate-cell details', gesture: 'click',
    description: 'A heatmap cell becomes a typed city-month record for the surrounding application.',
    panelTitle: 'Climate observation',
    render({ rows }) {
      const row = rows[0];
      return row ? <>
        <div className="it-detail-heading">{value(row, 'City')} in {value(row, 'Month')}</div>
        <div className="it-temperature">{value(row, 'Temperature (C)')}<span>C</span></div>
        <p className="it-detail-note">Monthly climate normal from the embedded snapshot.</p>
      </> : null;
    },
  },
  {
    id: 'trading-inspector', fixture: stocksFixture, title: 'Trading-day inspection', gesture: 'click',
    description: 'The candle body and wick resolve to one trading interval and one OHLC panel.',
    panelTitle: 'Daily market data',
    render({ rows }) {
      const row = rows[0];
      if (!row) return null;
      const change = Number(row.Close) - Number(row.Open);
      return <>
        <div className="it-detail-heading">{value(row, 'Date')}</div>
        <div className="it-metrics it-metrics-four">
          {metric('Open', `$${value(row, 'Open')}`)} {metric('High', `$${value(row, 'High')}`)}
          {metric('Low', `$${value(row, 'Low')}`)} {metric('Close', `$${value(row, 'Close')}`)}
        </div>
        <p className={change >= 0 ? 'it-change positive' : 'it-change negative'}>
          {change >= 0 ? '+' : ''}{change.toFixed(2)} daily change
        </p>
      </>;
    },
  },
  {
    id: 'task-details', fixture: ganttFixture, title: 'Task details', gesture: 'click',
    description: 'Selecting a task interval updates delivery metadata outside the chart.',
    panelTitle: 'Delivery record',
    render({ rows }) {
      const row = rows[0];
      return row ? <>
        <div className="it-detail-heading">{value(row, 'Task')}</div>
        <dl className="it-definition-list">
          <div><dt>Owner</dt><dd>{value(row, 'Owner')}</dd></div>
          <div><dt>Team</dt><dd>{value(row, 'Team')}</dd></div>
          <div><dt>Window</dt><dd>{value(row, 'Start')} to {value(row, 'End')}</dd></div>
          <div><dt>Status</dt><dd>{value(row, 'Status')}</dd></div>
        </dl>
      </> : null;
    },
  },
  {
    id: 'budget-explanation', fixture: populationFixture, title: 'Waterfall explanation', gesture: 'click',
    description: 'A waterfall step drives a plain-language contribution explanation.',
    panelTitle: 'Population contribution',
    render({ rows }) {
      const row = rows[0];
      return row ? <>
        <div className="it-detail-heading">{value(row, 'Step')}</div>
        <p className="it-narrative">
          This step contributes <strong>{Number(row['Population (M)']).toLocaleString()} million</strong> people to the 1950-2020 bridge.
        </p>
      </> : null;
    },
  },
  {
    id: 'life-narrative', fixture: lifeFixture, title: 'Country comparison narrative', gesture: 'click',
    description: 'Either endpoint identifies the country; the application supplies the full comparison.',
    panelTitle: 'Life expectancy comparison',
    render({ rows }, fixture) {
      const country = rows[0]?.Country;
      if (!country) return null;
      const countryRows = fixtureRows(fixture).filter((row) => row.Country === country);
      const male = Number(countryRows.find((row) => row.Sex === 'Male')?.['Life expectancy']);
      const female = Number(countryRows.find((row) => row.Sex === 'Female')?.['Life expectancy']);
      return <>
        <div className="it-detail-heading">{String(country)}</div>
        <p className="it-narrative">
          Female life expectancy is <strong>{female.toFixed(1)} years</strong>, {Math.abs(female - male).toFixed(1)} years higher than the male value of {male.toFixed(1)}.
        </p>
      </>;
    },
  },
];

const NO_CODE_INTERACTIONS: readonly InteractionDef[] = [];

function specEntry(demo: OutboundDemo) {
  switch (demo.gesture) {
    case 'select':
      return { type: 'select' as const, id: `${demo.id}-selection` };
    case 'hover-group':
      return { type: 'hover-group-focus' as const, id: `${demo.id}-series`, options: { groupBy: 'Region' } };
    case 'inspect-index':
      return { type: 'inspect-index' as const, id: `${demo.id}-index`, options: { axis: 'x' as const } };
    case 'navigate':
      return { type: 'navigate' as const, id: `${demo.id}-navigate` };
    case 'legend-toggle':
      return { type: 'legend-toggle' as const, id: `${demo.id}-legend` };
    default:
      return { type: 'click-highlight' as const, id: `${demo.id}-element`, options: { targets: ['mark' as const] } };
  }
}

export function outboundDemo(id: string): OutboundDemo {
  const demo = demos.find((entry) => entry.id === id);
  if (!demo) throw new Error(`No chart-to-external demo "${id}".`);
  return demo;
}

/** The demo's chart input, its change handler, and the panel content for the current view. */
function useOutboundDemo(demo: OutboundDemo) {
  const [view, setView] = useState<DemoView>(EMPTY_VIEW);
  const fixture = useMemo(() => ({
    ...demo.fixture,
    input: {
      ...demo.fixture.input,
      interaction_spec: { interactions: [specEntry(demo)] },
    },
  }), [demo]);
  // A preview shows the gesture live. Everything else shows what the chart shows.
  // The navigate demo queries the fixture for the rows in the viewport, and only on a commit.
  const countsVisible = demo.gesture === 'navigate';
  const handleChange = useCallback((change: ChartChange) => {
    const hit = valuesOf(change.target?.elements ?? []);
    const shown = valuesOf(change.state.selected);
    const domain = change.geometry?.domain ?? change.state.viewport;
    const domainX = domain?.x;
    setView({
      phase: change.phase,
      hit,
      shown,
      selection: retainedValues(change.state),
      hover: change.phase === 'preview' ? hit : [],
      rows: change.phase === 'preview' && hit.length > 0 ? hit : shown,
      x: domainX?.kind === 'value' ? domainX.value : domainX?.start,
      domain,
      visible: countsVisible && change.phase === 'commit' ? rowsInViewport(demo.fixture, domain) : null,
      hidden: change.state.hidden ?? [],
    });
  }, [countsVisible, demo.fixture]);
  const rendered = demo.gesture === 'click' ? clickPanel(demo, view) : demo.render(view, demo.fixture);
  return { fixture, handleChange, rendered };
}

export function OutboundDemoRow({ demo }: { demo: OutboundDemo }) {
  const { fixture, handleChange, rendered } = useOutboundDemo(demo);

  return (
    <article className="it-example">
      <header className="it-example-header">
        <div>
          <h2>{demo.title}</h2>
          <p>{demo.description}</p>
        </div>
      </header>
      <div className="it-workspace it-workspace-outbound">
        <section className="it-chart-panel">
          <InteractionDemoChart
            fixture={fixture}
            interactions={NO_CODE_INTERACTIONS}
            chartId={`outbound-${demo.id}`}
            onChange={handleChange}
          />
        </section>
        <section className="it-detail-panel" aria-live="polite">
          <h3 className="it-component-title">{demo.panelTitle}</h3>
          <div className="it-detail-body">
            {rendered ?? <div className="it-empty-state">Interact with the chart to populate this view.</div>}
          </div>
        </section>
      </div>
    </article>
  );
}

export function ChartToExternalLab() {
  return (
    <div className="dev-page it-page">
      <header className="dev-page-heading it-heading">
        <h1>Chart state that drives application UI</h1>
        <p>Each chart resolves physical geometry into semantic records and reports what it shows after every change. The panel reads that state, or the gesture's own hit while a gesture runs, without inspecting renderer internals.</p>
      </header>
      <div className="it-examples">
        {demos.map((demo) => <OutboundDemoRow key={demo.id} demo={demo} />)}
      </div>
    </div>
  );
}
