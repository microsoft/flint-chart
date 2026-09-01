import { useCallback, useMemo, useRef, useState } from 'react';
import type {
  InteractionDef,
  InteractiveChartSurface,
} from 'flint-chart/interactive';
import { externalInteraction } from 'flint-chart/interactive';
import { InteractionDemoChart } from './InteractionDemoChart';
import {
  countriesFixture,
  ganttFixture,
  incidentsFixture,
  lifeFixture,
  salesFixture,
  stocksFixture,
  weatherFixture,
  type InteractionDemoFixture,
} from './interaction-demo-data';
import './interaction-transport.css';

interface MatchPayload {
  label: string;
  match?: Record<string, unknown>;
}

type ControlOption = MatchPayload;

interface ExternalDemo {
  id: string;
  fixture: InteractionDemoFixture;
  title: string;
  description: string;
  controlLabel: string;
  options: ControlOption[];
}

function selectorKey(match: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(match).map(([field, value]) => [
    field,
    field === 'Date' && typeof value === 'string' ? new Date(value).valueOf() : value,
  ]));
}

function ExternalControlContent({
  demo,
  activeLabel,
  onSelect,
}: {
  demo: ExternalDemo;
  activeLabel?: string;
  onSelect: (option: ControlOption) => void;
}) {
  const control = (option: ControlOption, className: string, content: React.ReactNode = option.label) => (
    <button
      type="button"
      key={option.label}
      className={`${className}${activeLabel === option.label ? ' active' : ''}`}
      onClick={() => onSelect(option)}
    >
      {content}
    </button>
  );

  if (demo.id === 'sales-table') {
    return (
      <div className="it-mini-table" role="table" aria-label="Order summary">
        <div className="it-mini-table-head" role="row"><span>Region</span><span>Segment</span></div>
        {demo.options.map((option) => {
          const [region, segment] = option.label.split(' / ');
          return control(option, 'it-mini-table-row', <><span>{region}</span><span>{segment}</span></>);
        })}
      </div>
    );
  }

  if (demo.id === 'country-finder') {
    return (
      <div className="it-article-fragment">
        <p>Country profiles compare income, health, and population. Read about{' '}
          {demo.options.map((option, index) => <span key={option.label}>{index > 0 && (index === demo.options.length - 1 ? ', or ' : ', ')}{control(option, 'it-inline-link')}</span>)}.
        </p>
      </div>
    );
  }

  if (demo.id === 'continent-filter') {
    const continentCopy: Record<string, { heading: string; text: string }> = {
      Africa: {
        heading: 'A young, fast-growing region',
        text: 'Health outcomes have improved substantially, while income levels still vary sharply across the continent.',
      },
      Americas: {
        heading: 'Wide differences across neighboring economies',
        text: 'The region spans high-income countries and emerging markets, with life expectancy clustering more closely than income.',
      },
      Asia: {
        heading: 'Scale and development move together unevenly',
        text: 'Asia contains both the largest populations and some of the widest gaps in income and longevity in this snapshot.',
      },
      Europe: {
        heading: 'High longevity across varied incomes',
        text: 'European countries occupy the upper end of life expectancy, even as GDP per capita remains meaningfully dispersed.',
      },
    };
    const selected = activeLabel ? continentCopy[activeLabel] : null;
    return (
      <div className="it-tab-module">
        <div className="it-tabs" role="tablist" aria-label="Continent">
          {demo.options.map((option) => control(option, 'it-tab'))}
        </div>
        <div className="it-tab-copy" aria-live="polite">
          {selected ? <><strong>{selected.heading}</strong><p>{selected.text}</p></> : <p>Select a continent to explore its position in the global income and health distribution.</p>}
        </div>
      </div>
    );
  }

  if (demo.id === 'stock-date') {
    return (
      <ol className="it-date-list">
        {demo.options.map((option, index) => <li key={option.label}><span>{index + 2}</span>{control(option, 'it-date-link')}</li>)}
      </ol>
    );
  }

  if (demo.id === 'weather-alert') {
    const levels = ['Cold anomaly', 'Heat warning', 'Local maximum', 'Stable pattern'];
    return (
      <div className="it-alert-list">
        {demo.options.map((option, index) => control(option, 'it-alert-item', <><span>{levels[index]}</span><strong>{option.label}</strong></>))}
      </div>
    );
  }

  if (demo.id === 'task-lookup') {
    return (
      <div className="it-timeline">
        {demo.options.map((option, index) => control(option, 'it-timeline-item', <><span>{String(index + 1).padStart(2, '0')}</span><strong>{option.label}</strong></>))}
      </div>
    );
  }

  if (demo.id === 'life-comparison') {
    return (
      <div className="it-comparison-copy">
        <p>Compare the female and male life expectancy gap for:</p>
        <p>{demo.options.map((option, index) => <span key={option.label}>{index > 0 && ' · '}{control(option, 'it-inline-link')}</span>)}</p>
      </div>
    );
  }

  const counts: Record<string, number> = { Critical: 3, High: 11, Medium: 24 };
  return (
    <div className="it-queue-list">
      {demo.options.map((option) => control(option, 'it-queue-item', <><span className={`it-severity it-severity-${option.label.toLowerCase()}`}>{option.label}</span><strong>{counts[option.label]} open</strong></>))}
    </div>
  );
}

const demos: ExternalDemo[] = [
  {
    id: 'sales-table', fixture: salesFixture, title: 'Sales table selection',
    description: 'A row in an operations table targets one region and product segment.',
    controlLabel: 'Order summary rows',
    options: [
      { label: 'West / Technology', match: { Region: 'West', Segment: 'Technology' } },
      { label: 'East / Office Supplies', match: { Region: 'East', Segment: 'Office Supplies' } },
      { label: 'Central / Furniture', match: { Region: 'Central', Segment: 'Furniture' } },
    ],
  },
  {
    id: 'country-finder', fixture: countriesFixture, title: 'Country finder',
    description: 'A search result identifies one observation in a dense country scatterplot.',
    controlLabel: 'Country results',
    options: ['Japan', 'Brazil', 'Nigeria', 'Germany'].map((Country) => ({ label: Country, match: { Country } })),
  },
  {
    id: 'continent-filter', fixture: countriesFixture, title: 'Continent cohort',
    description: 'A segmented filter targets a semantic cohort rather than a single mark.',
    controlLabel: 'Continent',
    options: ['Africa', 'Americas', 'Asia', 'Europe'].map((Continent) => ({ label: Continent, match: { Continent } })),
  },
  {
    id: 'stock-date', fixture: stocksFixture, title: 'Trading-day navigator',
    description: 'A date list drives the matching OHLC candle, including its body and wick.',
    controlLabel: 'Trading dates',
    options: ['2024-01-02', '2024-01-05', '2024-01-10', '2024-01-16'].map((Date) => ({ label: Date, match: { Date } })),
  },
  {
    id: 'weather-alert', fixture: weatherFixture, title: 'Climate alert list',
    description: 'Named exceptions from an alert service target precise city-month cells.',
    controlLabel: 'Detected conditions',
    options: [
      { label: 'Moscow coldest', match: { City: 'Moscow', Month: 'Jan' } },
      { label: 'Cairo hottest', match: { City: 'Cairo', Month: 'Jul' } },
      { label: 'Seattle warmest', match: { City: 'Seattle', Month: 'Jul' } },
      { label: 'Singapore stable', match: { City: 'Singapore', Month: 'Apr' } },
    ],
  },
  {
    id: 'task-lookup', fixture: ganttFixture, title: 'Task lookup',
    description: 'A delivery tracker selects a task interval from outside the chart.',
    controlLabel: 'Release tasks',
    options: ['Planning', 'Design', 'Implementation', 'Testing', 'Launch'].map((Task) => ({ label: Task, match: { Task } })),
  },
  {
    id: 'life-comparison', fixture: lifeFixture, title: 'Population comparison',
    description: 'Selecting a country emphasizes both endpoints and the connecting interval.',
    controlLabel: 'Country comparison',
    options: ['Japan', 'United States', 'Brazil', 'Nigeria'].map((Country) => ({ label: Country, match: { Country } })),
  },
  {
    id: 'severity-queue', fixture: incidentsFixture, title: 'Incident severity queue',
    description: 'An incident queue highlights one severity across every reporting week.',
    controlLabel: 'Severity',
    options: ['Critical', 'High', 'Medium'].map((Severity) => ({ label: Severity, match: { Severity } })),
  },
];

function ExternalDemoRow({ demo }: { demo: ExternalDemo }) {
  const surfaceRef = useRef<InteractiveChartSurface | null>(null);
  const [lastPayload, setLastPayload] = useState<MatchPayload | null>(null);
  const interactionId = `${demo.id}-control`;
  const interactions = useMemo<InteractionDef[]>(() => [externalInteraction<MatchPayload>({
    id: interactionId,
    handle: (payload) => ({
      id: interactionId,
      ops: payload.match
        ? [{
            op: 'set-style',
            targets: [{ select: { key: selectorKey(payload.match) } }],
            value: { state: 'emphasized', mutedOpacity: 0.25 },
          }]
        : [{ op: 'set-style', targets: [], value: { state: 'normal' } }],
    }),
  })], [interactionId]);
  const handleSurface = useCallback((surface: InteractiveChartSurface | null) => {
    surfaceRef.current = surface;
  }, []);
  const dispatch = (payload: MatchPayload) => {
    setLastPayload(payload);
    const surface = surfaceRef.current;
    if (!surface) return;
    void surface.dispatch(interactionId, payload);
  };

  return (
    <article className="it-example">
      <header className="it-example-header">
        <div>
          <h2>{demo.title}</h2>
          <p>{demo.description}</p>
        </div>
      </header>
      <div className="it-workspace it-workspace-external">
        <section className="it-control-panel" aria-label={demo.controlLabel}>
          <h3 className="it-component-title">{demo.controlLabel}</h3>
          <div className="it-control-content">
            <ExternalControlContent demo={demo} activeLabel={lastPayload?.label} onSelect={dispatch} />
          </div>
          <button
            type="button"
            className="it-reset"
            onClick={() => dispatch({ label: 'Reset' })}
          >
            Clear selection
          </button>
        </section>
        <section className="it-chart-panel">
          <InteractionDemoChart
            fixture={demo.fixture}
            interactions={interactions}
            chartId={`external-${demo.id}`}
            onSurface={handleSurface}
          />
        </section>
      </div>
    </article>
  );
}

export function ExternalToChartLab() {
  return (
    <div className="dev-page it-page">
      <header className="dev-page-heading it-heading">
        <h1>Application controls that speak chart semantics</h1>
        <p>Each control identifies semantic chart keys and applies a renderer-neutral update request.</p>
      </header>
      <div className="it-examples">
        {demos.map((demo) => <ExternalDemoRow key={demo.id} demo={demo} />)}
      </div>
    </div>
  );
}
