import { useCallback, useMemo, useState, type ReactNode } from 'react';
import type {
  FlintInteractionEventDetail,
  InteractionDef,
  SemanticTarget,
} from 'flint-chart/interactive';
import { clickHighlight, select as rectangleSelect } from 'flint-chart/interactive';
import { InteractionDemoChart } from './InteractionDemoChart';
import {
  countriesFixture,
  ganttFixture,
  lifeFixture,
  penguinsFixture,
  populationFixture,
  salesFixture,
  stocksFixture,
  weatherFixture,
  type InteractionDemoFixture,
} from './interaction-demo-data';
import './interaction-transport.css';

type Row = Record<string, unknown>;

interface OutboundDemo {
  id: string;
  fixture: InteractionDemoFixture;
  title: string;
  description: string;
  panelTitle: string;
  gesture: 'click' | 'select';
  render: (records: Row[], fixture: InteractionDemoFixture) => ReactNode;
}

function targetRecords(target: SemanticTarget | null): Row[] {
  const seen = new Set<string>();
  const records: Row[] = [];
  for (const record of target?.elements.flatMap((element) => element.records ?? []) ?? []) {
    const clean = Object.fromEntries(Object.entries(record).filter(([field]) => !field.startsWith('__')));
    const signature = JSON.stringify(clean);
    if (seen.has(signature)) continue;
    seen.add(signature);
    records.push(clean);
  }
  return records;
}

function value(record: Row | undefined, field: string): string {
  const result = record?.[field];
  return result === undefined || result === null ? '—' : String(result);
}

function metric(label: string, result: string | number) {
  return <div className="it-metric"><span>{label}</span><strong>{result}</strong></div>;
}

function fixtureRows(fixture: InteractionDemoFixture): Row[] {
  return (fixture.input.data.values ?? []) as Row[];
}

const demos: OutboundDemo[] = [
  {
    id: 'order-explorer', fixture: salesFixture, title: 'Order explorer', gesture: 'click',
    description: 'Hover or click a bar to send its region and segment into an order summary.',
    panelTitle: 'Selected order cohort',
    render(records) {
      const row = records[0];
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
    id: 'country-profile', fixture: countriesFixture, title: 'Country profile', gesture: 'click',
    description: 'A resolved point updates a profile panel without parsing SVG or Vega internals.',
    panelTitle: 'Country profile',
    render(records) {
      const row = records[0];
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
    render(records) {
      if (records.length === 0) return null;
      const average = (field: string) => records.reduce((sum, row) => sum + Number(row[field]), 0) / records.length;
      const species = [...new Set(records.map((row) => String(row.Species)))].join(', ');
      return <>
        <div className="it-detail-heading">{records.length} penguins</div>
        <div className="it-metrics">
          {metric('Species', species)}
          {metric('Avg. bill', `${average('Bill length (mm)').toFixed(1)} mm`)}
          {metric('Avg. flipper', `${average('Flipper length (mm)').toFixed(1)} mm`)}
          {metric('Avg. mass', `${Math.round(average('Body mass (g)'))} g`)}
        </div>
      </>;
    },
  },
  {
    id: 'weather-detail', fixture: weatherFixture, title: 'Climate-cell details', gesture: 'click',
    description: 'A heatmap cell becomes a typed city-month record for the surrounding application.',
    panelTitle: 'Climate observation',
    render(records) {
      const row = records[0];
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
    render(records) {
      const row = records[0];
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
    render(records) {
      const row = records[0];
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
    render(records) {
      const row = records[0];
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
    render(records, fixture) {
      const country = records[0]?.Country;
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

function OutboundDemoRow({ demo }: { demo: OutboundDemo }) {
  const [detail, setDetail] = useState<FlintInteractionEventDetail | null>(null);
  const interaction: InteractionDef = useMemo(
    () => demo.gesture === 'select'
      ? rectangleSelect({ id: `${demo.id}-selection` })
      : clickHighlight({ id: `${demo.id}-element`, targets: ['mark'] }),
    [demo.gesture, demo.id],
  );
  const interactions = useMemo(() => [interaction], [interaction]);
  const handleSemanticEvent = useCallback((event: FlintInteractionEventDetail) => setDetail(event), []);
  const records = targetRecords(detail?.event.target ?? null);
  const rendered = demo.render(records, demo.fixture);

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
            fixture={demo.fixture}
            interactions={interactions}
            chartId={`outbound-${demo.id}`}
            onSemanticEvent={handleSemanticEvent}
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
        <h1>Semantic chart events that drive application UI</h1>
        <p>Each chart resolves physical geometry into semantic records, emits a chart-scoped event, and updates an external React view without inspecting renderer internals.</p>
      </header>
      <div className="it-examples">
        {demos.map((demo) => <OutboundDemoRow key={demo.id} demo={demo} />)}
      </div>
    </div>
  );
}
