import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  InteractionDef,
  FlintInteractionEventDetail,
} from 'flint-chart/interactive';
import { clickGroupFocus, externalInteraction } from 'flint-chart/interactive';
import type { FlintChartHandle } from 'flint-chart/react';
import { ScaleToFit } from '../components/ScaleToFit';
import { InteractionDemoChart } from './InteractionDemoChart';
import { withHouseId } from '../shared/test-case-utils';
import {
  carsFixture,
  companionsFixture,
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
  annotation?: string;
}

type ControlOption = MatchPayload;

interface ExternalDemo {
  id: string;
  fixture: InteractionDemoFixture;
  title: string;
  description: string;
  controlLabel: string;
  options: ControlOption[];
  defaultSelection?: ControlOption;
}

function selectorKey(match: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(match).map(([field, value]) => [
    field,
    field === 'Date' && typeof value === 'string' ? new Date(value).valueOf() : value,
  ]));
}

const currency = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

/** One country picked in the table or on the chart: the point emphasised and its numbers noted on it. */
function countrySelection(row: Record<string, unknown>): MatchPayload {
  const country = String(row.Country);
  return {
    label: country,
    match: { Country: country },
    annotation: `${country}\nGDP/person: ${currency.format(Number(row['GDP per capita ($)']))}\nLife expectancy: ${Number(row['Life expectancy']).toFixed(1)} years`,
  };
}

function CountryTable({ rows, activeLabel, onSelect }: {
  rows: Record<string, unknown>[];
  activeLabel?: string;
  onSelect: (option: ControlOption) => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  // A pick on the chart brings its row into view, scrolling the table alone rather than the page.
  useEffect(() => {
    const box = scroller.current;
    const row = box?.querySelector<HTMLElement>('tr.active');
    if (!box || !row) return;
    const head = box.querySelector('thead')?.getBoundingClientRect().height ?? 0;
    const top = row.offsetTop - head;
    if (top < box.scrollTop || row.offsetTop + row.offsetHeight > box.scrollTop + box.clientHeight) {
      box.scrollTop = Math.max(0, top - (box.clientHeight - head - row.offsetHeight) / 2);
    }
  }, [activeLabel]);
  return (
    <div className="it-country-table-scroll" ref={scroller}>
      <table className="it-country-table" aria-label="Gapminder country statistics, 2007">
        <thead><tr><th scope="col">Country</th><th scope="col">GDP/person</th><th scope="col">Life (yr)</th></tr></thead>
        <tbody>{rows.map(row => {
          const country = String(row.Country);
          return <tr key={country} className={activeLabel === country ? 'active' : undefined}
            onClick={() => onSelect(countrySelection(row))}>
            <td><button type="button" aria-pressed={activeLabel === country}>{country}</button></td>
            <td>{currency.format(Number(row['GDP per capita ($)']))}</td>
            <td>{Number(row['Life expectancy']).toFixed(1)}</td>
          </tr>;
        })}</tbody>
      </table>
    </div>
  );
}

/** One row per origin: a pick names every car made there. */
function OriginTable({ rows, activeLabel, onSelect }: {
  rows: Record<string, unknown>[];
  activeLabel?: string;
  onSelect: (option: ControlOption) => void;
}) {
  const origins = useMemo(() => {
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const row of rows) groups.set(String(row.Origin), [...(groups.get(String(row.Origin)) ?? []), row]);
    return [...groups].map(([origin, members]) => {
      const power = members.map(row => Number(row.Horsepower)).sort((a, b) => a - b);
      const middle = Math.floor(power.length / 2);
      return {
        origin,
        count: members.length,
        horsepower: power.length % 2 ? power[middle] : (power[middle - 1] + power[middle]) / 2,
        mpg: members.reduce((total, row) => total + Number(row.MPG), 0) / members.length,
      };
    }).sort((a, b) => b.count - a.count);
  }, [rows]);
  return (
    <table className="it-country-table" aria-label="Cars by origin, 1970–1982">
      <thead><tr><th scope="col">Origin</th><th scope="col">Cars</th><th scope="col">Median hp</th><th scope="col">Mean MPG</th></tr></thead>
      <tbody>{origins.map(({ origin, count, horsepower, mpg }) => (
        <tr key={origin} className={activeLabel === origin ? 'active' : undefined}
          onClick={() => onSelect({ label: origin, match: { Origin: origin } })}>
          <td><button type="button" aria-pressed={activeLabel === origin}>{origin}</button></td>
          <td>{count}</td>
          <td>{Math.round(horsepower)}</td>
          <td>{mpg.toFixed(1)}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

/** One finding per kind of company, each about two lines so the panel keeps its height between tabs. */
const COMPANION_FINDINGS: Record<string, string> = {
  All: 'Hours a day with six kinds of company, for women and men aged 15 to 80. Pick a tab to light one in both panels and see how it changes with age.',
  Alone: 'Time alone grows steadily with age. By 80, women spend 8.4 hours a day alone; men peak a little earlier, at 7.9 hours around 65.',
  Partner: 'Time with a partner climbs from zero in the teens into later life. Men reach 5.8 hours a day at 76; women peak at 4.2 hours at 69.',
  Children: 'Time with children peaks in the thirties, while kids are young. Women reach 5.3 hours a day at 34, men 3.5 hours at 39.',
  Family: 'Other family fills the teenage years: about 4.5 hours a day for girls and 4.1 for boys at 15, falling below an hour by 40.',
  Friends: 'Friends matter most around 20, at about 2 hours a day. By the mid-thirties it falls to roughly half an hour and stays there.',
  'Co-workers': 'Co-workers arrive with the first job and leave at retirement. Men peak at 4.1 hours a day at 30, women at 3.1 hours at 23.',
};

/** One row per continent, so a pick names a whole group rather than one point. */
function ContinentTable({ rows, activeLabel, onSelect }: {
  rows: Record<string, unknown>[];
  activeLabel?: string;
  onSelect: (option: ControlOption) => void;
}) {
  const continents = useMemo(() => {
    const groups = new Map<string, Record<string, unknown>[]>();
    for (const row of rows) groups.set(String(row.Continent), [...(groups.get(String(row.Continent)) ?? []), row]);
    return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([continent, members]) => {
      const incomes = members.map(row => Number(row['GDP per capita ($)'])).sort((a, b) => a - b);
      const middle = Math.floor(incomes.length / 2);
      return {
        continent,
        count: members.length,
        income: incomes.length % 2 ? incomes[middle] : (incomes[middle - 1] + incomes[middle]) / 2,
        life: members.reduce((total, row) => total + Number(row['Life expectancy']), 0) / members.length,
      };
    });
  }, [rows]);
  return (
    <table className="it-country-table" aria-label="Gapminder continents, 2007">
      <thead><tr><th scope="col">Continent</th><th scope="col">Countries</th><th scope="col">Median GDP/person</th><th scope="col">Life (yr)</th></tr></thead>
      <tbody>{continents.map(({ continent, count, income, life }) => (
        <tr key={continent} className={activeLabel === continent ? 'active' : undefined}
          onClick={() => onSelect({ label: continent, match: { Continent: continent } })}>
          <td><button type="button" aria-pressed={activeLabel === continent}>{continent}</button></td>
          <td>{count}</td>
          <td>{currency.format(income)}</td>
          <td>{life.toFixed(1)}</td>
        </tr>
      ))}</tbody>
    </table>
  );
}

// Where the browser's English region name differs from Gapminder's.
const GAPMINDER_REGIONS: Record<string, string> = {
  BA: 'Bosnia and Herzegovina', CD: 'Congo, Dem. Rep.', CG: 'Congo, Rep.', CI: "Cote d'Ivoire",
  CZ: 'Czech Republic', HK: 'Hong Kong, China', KP: 'Korea, Dem. Rep.', KR: 'Korea, Rep.',
  MM: 'Myanmar', PS: 'West Bank and Gaza', RE: 'Reunion', SK: 'Slovak Republic',
  ST: 'Sao Tome and Principe', TT: 'Trinidad and Tobago', YE: 'Yemen, Rep.',
};

/** The reader's own country, read from the browser locale, when the data has it. */
function browserCountry(rows: Record<string, unknown>[]): Record<string, unknown> | undefined {
  try {
    const region = new Intl.Locale(navigator.language).maximize().region;
    if (!region) return undefined;
    const name = GAPMINDER_REGIONS[region] ?? new Intl.DisplayNames(['en'], { type: 'region' }).of(region);
    return rows.find(row => row.Country === name);
  } catch {
    return undefined;
  }
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
      aria-pressed={demo.id === 'continent-filter' || demo.id === 'companion-tabs' ? activeLabel === option.label : undefined}
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

  if (demo.id === 'country-table') {
    return <CountryTable rows={demo.fixture.input.data.values ?? []} activeLabel={activeLabel} onSelect={onSelect} />;
  }

  if (demo.id === 'continent-table') {
    return <ContinentTable rows={demo.fixture.input.data.values ?? []} activeLabel={activeLabel} onSelect={onSelect} />;
  }

  if (demo.id === 'origin-table') {
    return <OriginTable rows={demo.fixture.input.data.values ?? []} activeLabel={activeLabel} onSelect={onSelect} />;
  }

  if (demo.id === 'companion-tabs') {
    const who = demo.options.find(option => option.label === activeLabel && option.match)?.label;
    return (
      <div className="it-tab-module">
        <div className="it-tabs" role="group" aria-label="Company">
          {demo.options.map((option) => control(option, 'it-tab'))}
        </div>
        <div className="it-tab-copy" aria-live="polite">
          <strong>{who ?? 'All company'}</strong>
          <p>{COMPANION_FINDINGS[who ?? 'All']}</p>
        </div>
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
    const continent = demo.options.find(option => option.label === activeLabel && option.match)?.label;
    const countryLabels: Record<string, string> = {
      Africa: 'African countries',
      Americas: 'countries in the Americas',
      Asia: 'Asian countries',
      Europe: 'European countries',
      Oceania: 'countries in Oceania',
    };
    const countryLabel = continent ? countryLabels[continent] : 'countries across all continents';
    const rows = (demo.fixture.input.data.values ?? []).filter(row => !continent || row.Continent === continent);
    const population = rows.reduce((total, row) => total + Number(row['Population (M)']) * 1_000_000, 0);
    const meanLifeExpectancy = rows.reduce((total, row) => total + Number(row['Life expectancy']), 0) / rows.length;
    const incomes = rows.map(row => Number(row['GDP per capita ($)'])).sort((first, second) => first - second);
    const middle = Math.floor(incomes.length / 2);
    const medianIncome = incomes.length % 2 ? incomes[middle] : (incomes[middle - 1] + incomes[middle]) / 2;
    const populationLabel = new Intl.NumberFormat('en-US', { notation: 'compact', compactDisplay: 'long', maximumFractionDigits: 1 }).format(population);
    const incomeLabel = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(medianIncome);
    return (
      <div className="it-tab-module">
        <div className="it-tabs" role="group" aria-label="Continent">
          {demo.options.map((option) => control(option, 'it-tab'))}
        </div>
        <div className="it-tab-copy" aria-live="polite">
          <strong>{continent ?? 'All continents'}, 2007</strong>
          <p>The average life expectancy of {rows.length} {countryLabel} is {meanLifeExpectancy.toFixed(1)} years.
            {' '}Their total population is {populationLabel}, and median GDP per capita is {incomeLabel}.</p>
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

/** The chart answers back: a click picks one country with its numbers, or the whole group a mark belongs to. */
type Bidirectional = 'country' | { group: string };

const BY_CONTINENT: Bidirectional = { group: 'Continent' };

function ExternalDemoRow({ demo, compact = false, bidirectional }: {
  demo: ExternalDemo;
  compact?: boolean;
  bidirectional?: Bidirectional;
}) {
  const groupField = bidirectional === 'country' ? 'Country' : bidirectional?.group;
  const chartRef = useRef<FlintChartHandle>(null);
  const payloadRef = useRef<MatchPayload | null>(demo.defaultSelection ?? null);
  const [lastPayload, setLastPayload] = useState<MatchPayload | null>(payloadRef.current);
  const interactionId = `${demo.id}-control`;
  // Linked both ways, the control and a click on the chart write one entry, so each replaces the other.
  const selectionId = groupField ? `${demo.id}-group` : interactionId;
  const interactions = useMemo<InteractionDef[]>(() => [externalInteraction<MatchPayload>({
    id: interactionId,
    handle: (payload) => ({
      id: selectionId,
      ops: payload.match
        ? [{
            op: 'set-style',
            targets: [{ select: { key: selectorKey(payload.match) } }],
            value: { state: 'emphasized', mutedOpacity: 0.25 },
          }, ...(payload.annotation ? [{
            op: 'set-annotation' as const,
            target: { select: { key: selectorKey(payload.match) } },
            value: { text: payload.annotation },
          }] : [])]
        : [{ op: 'set-style', targets: [], value: { state: 'normal' } }],
    }),
  }), ...(groupField ? [clickGroupFocus({ id: selectionId, groupBy: groupField })] : [])], [interactionId, selectionId, groupField]);
  // Each new mount starts from the control's current selection.
  const handleRender = useCallback(() => {
    if (payloadRef.current) void chartRef.current?.dispatch(interactionId, payloadRef.current);
  }, [interactionId]);
  const handleSemanticEvent = useCallback((detail: FlintInteractionEventDetail) => {
    if (!bidirectional || detail.event.phase === 'start' || detail.event.phase === 'cancel') return;
    const value = detail.event.target?.elements[0]?.value;
    if (bidirectional === 'country') {
      // The clicked country gets the same note a table pick gives it.
      const row = typeof value?.Country === 'string'
        ? (demo.fixture.input.data.values ?? []).find(candidate => candidate.Country === value.Country)
        : undefined;
      const payload = row ? countrySelection(row) : null;
      payloadRef.current = payload;
      setLastPayload(payload);
      if (payload) void chartRef.current?.dispatch(interactionId, payload);
      else void chartRef.current?.clearUpdate(selectionId);
      return;
    }
    const group = groupField ? value?.[groupField] : undefined;
    const payload = typeof group === 'string' ? { label: group, match: { [groupField!]: group } } : { label: 'All' };
    payloadRef.current = payload;
    setLastPayload(payload);
  }, [bidirectional, groupField, interactionId, selectionId, demo.fixture]);
  const dispatch = async (payload: MatchPayload) => {
    payloadRef.current = payload;
    setLastPayload(payload);
    const chart = chartRef.current;
    if (!chart) return;
    await chart.dispatch(interactionId, payload);
  };

  return (
    <article className={`it-example${compact ? ' ig-continent-cohort' : ''}`}>
      {!compact && <header className="it-example-header">
        <div>
          <h2>{demo.title}</h2>
          <p>{demo.description}</p>
        </div>
      </header>}
      <div className="it-workspace it-workspace-external">
        <section className="it-control-panel" aria-label={demo.controlLabel}>
          <h3 className="it-component-title">{demo.controlLabel}</h3>
          <div className="it-control-content">
            <ExternalControlContent demo={demo} activeLabel={lastPayload?.label} onSelect={dispatch} />
          </div>
          {!compact && <button
            type="button"
            className="it-reset"
            onClick={() => dispatch({ label: 'Reset' })}
          >
            Clear selection
          </button>}
        </section>
        <section className="it-chart-panel" aria-label={demo.fixture.title}>
          {compact ? <ScaleToFit height={380} minHeight={280} adaptiveHeight padding={8}>
            <InteractionDemoChart
              ref={chartRef}
              fixture={demo.fixture}
              interactions={interactions}
              chartId={`article-${demo.id}`}
              onRender={handleRender}
              onSemanticEvent={handleSemanticEvent}
            />
          </ScaleToFit> :
          <InteractionDemoChart
            ref={chartRef}
            fixture={demo.fixture}
            interactions={interactions}
            chartId={`external-${demo.id}`}
            onRender={handleRender}
          />}
        </section>
      </div>
    </article>
  );
}

const continentCohortDemo: ExternalDemo = {
  ...demos.find(demo => demo.id === 'continent-filter')!,
  defaultSelection: { label: 'Asia', match: { Continent: 'Asia' } },
  options: [{ label: 'All' }, ...['Africa', 'Americas', 'Asia', 'Europe', 'Oceania'].map(Continent => ({ label: Continent, match: { Continent } }))],
};

export function ContinentCohortStage() {
  return <ExternalDemoRow demo={continentCohortDemo} compact bidirectional={BY_CONTINENT} />;
}

export function CountryTableStage({ themeId }: { themeId?: string | null } = {}) {
  const fixture = useMemo(() => ({ ...countriesFixture, input: withHouseId(countriesFixture.input, themeId) }), [themeId]);
  const defaultSelection = useMemo(() => {
    const rows = countriesFixture.input.data.values ?? [];
    const row = browserCountry(rows) ?? rows.find(candidate => candidate.Country === 'United States');
    return row ? countrySelection(row) : undefined;
  }, []);
  return <ExternalDemoRow demo={{
    id: 'country-table', fixture, title: 'Country table selection',
    description: 'Country statistics linked to income and life expectancy.',
    controlLabel: 'Gapminder countries, 2007', options: [], defaultSelection,
  }} compact bidirectional="country" />;
}

/** The same table-to-chart link, a level up: a continent row lights its countries, and a country picks its continent. */
export function ContinentTableStage({ themeId }: { themeId?: string | null } = {}) {
  const fixture = useMemo(() => ({ ...countriesFixture, input: withHouseId(countriesFixture.input, themeId) }), [themeId]);
  const defaultSelection = useMemo(() => {
    const continent = String(browserCountry(countriesFixture.input.data.values ?? [])?.Continent ?? 'Americas');
    return { label: continent, match: { Continent: continent } };
  }, []);
  return <ExternalDemoRow demo={{
    id: 'continent-table', fixture, title: 'Continent table selection',
    description: 'Continent summaries linked to every country they hold.',
    controlLabel: 'Gapminder continents, 2007', options: [], defaultSelection,
  }} compact bidirectional={BY_CONTINENT} />;
}

const BY_ORIGIN: Bidirectional = { group: 'Origin' };
const BY_COMPANY: Bidirectional = { group: 'Who' };

/** The cars' chart, as a spec pane shows it. */
export const CARS_INPUT = carsFixture.input;

/** A group table on cars: an origin row lights every car made there, and a car picks its origin's row. */
export function CarOriginTableStage({ themeId }: { themeId?: string | null } = {}) {
  const fixture = useMemo(() => ({ ...carsFixture, input: withHouseId(carsFixture.input, themeId) }), [themeId]);
  return <ExternalDemoRow demo={{
    id: 'origin-table', fixture, title: 'Cars by origin',
    description: 'Origin summaries linked to every car made there.',
    controlLabel: 'Cars by origin, 1970–1982', options: [],
    defaultSelection: { label: 'Japan', match: { Origin: 'Japan' } },
  }} compact bidirectional={BY_ORIGIN} />;
}

const COMPANIONS = ['Alone', 'Partner', 'Children', 'Family', 'Friends', 'Co-workers'];

/** The companions' chart, as a spec pane shows it. */
export const COMPANIONS_INPUT = companionsFixture.input;

/** Tabs over a faceted line chart: a tab lights one kind of company in both panels, and a line picks its tab. */
export function CompanionTabsStage({ themeId }: { themeId?: string | null } = {}) {
  const fixture = useMemo(() => ({ ...companionsFixture, input: withHouseId(companionsFixture.input, themeId) }), [themeId]);
  return <ExternalDemoRow demo={{
    id: 'companion-tabs', fixture, title: 'Who we spend time with',
    description: 'Tabs over the company kept, women and men side by side.',
    controlLabel: 'Who Americans spend time with',
    options: [{ label: 'All' }, ...COMPANIONS.map(Who => ({ label: Who, match: { Who } }))],
    defaultSelection: { label: 'Children', match: { Who: 'Children' } },
  }} compact bidirectional={BY_COMPANY} />;
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
