import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pause, Play } from 'lucide-react';
import type { ChartAssemblyInput, InteractionEntry } from 'flint-chart';
import {
  externalInteraction,
  type ChartUpdate,
  type InteractionDef,
  type InteractiveChartSurface,
} from 'flint-chart/interactive';
import { SiteRange } from '../../components/SiteRange';
import foodPrices from '../../data/cpi-food-prices.json';
import gdp from '../../data/gdp-top10.json';
import { InteractionDemoChart } from '../InteractionDemoChart';
import {
  countriesFixture,
  lifeFixture,
  stocksFixture,
  weatherFixture,
  type InteractionDemoFixture,
} from '../interaction-demo-data';
import { DemoColumns } from './application-demos-layout';

type Row = Record<string, unknown>;

const CONTROL = 'control';

function controlled<P>(handle: (payload: P) => ChartUpdate['ops']): readonly InteractionDef[] {
  return [externalInteraction<P>({ id: CONTROL, handle: (payload) => ({ id: CONTROL, ops: handle(payload) }) })];
}

function withSpec(fixture: InteractionDemoFixture, entries: InteractionEntry[]): InteractionDemoFixture {
  return { ...fixture, input: { ...fixture.input, interaction_spec: { interactions: entries } } };
}

function rowsOfFixture(fixture: InteractionDemoFixture): Row[] {
  return (fixture.input.data.values ?? []) as Row[];
}

/** The surface of the mounted chart, and a dispatch to its control that reports anything not applied. */
function useControl<P>(chartId: string) {
  const surface = useRef<InteractiveChartSurface | null>(null);
  const onSurface = useCallback((next: InteractiveChartSurface | null) => { surface.current = next; }, []);
  const send = useCallback((payload: P) => {
    void surface.current?.dispatch(CONTROL, payload).then((result) => {
      if (result?.status !== 'applied') console.warn(`${chartId}: ${result?.status ?? 'no handler'}`, result);
    });
  }, [chartId]);
  return { onSurface, send };
}

const CLEAR_STYLE: ChartUpdate['ops'] = [{ op: 'set-style', targets: [], value: { state: 'normal' } }];

const STYLE_INTERACTIONS = controlled<{ countries: string[] }>(({ countries }) => (countries.length > 0
  ? [{ op: 'set-style', targets: countries.map((Country) => ({ select: { key: { Country } } })), value: { state: 'emphasized' } }]
  : CLEAR_STYLE));
const COUNTRY_NAMES = rowsOfFixture(countriesFixture).map((row) => String(row.Country)).sort();

export function SetStyleDemo() {
  const { onSurface, send } = useControl<{ countries: string[] }>('app-demo-style');
  const [query, setQuery] = useState('');
  const matches = useMemo(() => {
    const text = query.trim().toLowerCase();
    return text ? COUNTRY_NAMES.filter((name) => name.toLowerCase().includes(text)) : [];
  }, [query]);
  const search = (next: string) => {
    setQuery(next);
    const text = next.trim().toLowerCase();
    send({ countries: text ? COUNTRY_NAMES.filter((name) => name.toLowerCase().includes(text)) : [] });
  };

  return <DemoColumns
    panel={<>
      <label className="app-demo-field">
        <span>Find a country</span>
        <input type="search" value={query} placeholder="Try “an” or “Japan”" onChange={(event) => search(event.target.value)} />
      </label>
      <ul className="app-demo-options">
        {COUNTRY_NAMES.map((name) => <li key={name}>
          <button type="button" className={matches.includes(name) ? 'is-active' : ''} onClick={() => search(name)}>{name}</button>
        </li>)}
      </ul>
    </>}
    chart={<InteractionDemoChart fixture={countriesFixture} interactions={STYLE_INTERACTIONS} chartId="app-demo-style" onSurface={onSurface} />}
  />;
}

type Alert = { id: string; City: string; Month: string; text: string };
const ALERTS: Alert[] = [
  { id: 'moscow', City: 'Moscow', Month: 'Jan', text: 'Coldest month: −9 °C' },
  { id: 'cairo', City: 'Cairo', Month: 'Jul', text: 'Hottest month: 29 °C' },
  { id: 'seattle', City: 'Seattle', Month: 'Dec', text: 'Seattle bottoms out at 4 °C' },
  { id: 'singapore', City: 'Singapore', Month: 'Apr', text: 'Singapore barely moves: 26–28 °C all year' },
];
const ANNOTATION_INTERACTIONS = controlled<{ alert: Alert | null }>(({ alert }) => (alert
  ? [{ op: 'set-annotation', target: { select: { key: { City: alert.City, Month: alert.Month } } }, value: { text: alert.text } }]
  : CLEAR_STYLE));

export function SetAnnotationDemo() {
  const { onSurface, send } = useControl<{ alert: Alert | null }>('app-demo-annotation');
  const [active, setActive] = useState<string | null>(null);
  const pick = (alert: Alert) => {
    const next = active === alert.id ? null : alert;
    setActive(next?.id ?? null);
    send({ alert: next });
  };

  return <DemoColumns
    panel={<>
      <div className="it-detail-heading">Climate alerts</div>
      <ul className="app-demo-rows">
        {ALERTS.map((alert) => <li key={alert.id}>
          <button type="button" className={active === alert.id ? 'is-active' : ''} aria-pressed={active === alert.id} onClick={() => pick(alert)}>
            <strong>{alert.City}, {alert.Month}</strong>
            <span>{alert.text}</span>
          </button>
        </li>)}
      </ul>
    </>}
    chart={<InteractionDemoChart fixture={weatherFixture} interactions={ANNOTATION_INTERACTIONS} chartId="app-demo-annotation" onSurface={onSurface} />}
  />;
}

const DAY = 24 * 60 * 60 * 1000;
type Range = { id: string; label: string; from?: string; to?: string };
const RANGES: Range[] = [
  { id: 'week-1', label: 'Jan 2–5', from: '2024-01-02', to: '2024-01-05' },
  { id: 'week-2', label: 'Jan 8–12', from: '2024-01-08', to: '2024-01-12' },
  { id: 'late', label: 'Jan 10–16', from: '2024-01-10', to: '2024-01-16' },
  { id: 'all', label: 'All days' },
];
const VIEWPORT_FIXTURE = withSpec(stocksFixture, [{ type: 'navigate', id: 'navigate', options: { axes: 'x' } }]);
const VIEWPORT_INTERACTIONS = controlled<{ range: Range }>(({ range }) => [{
  op: 'set-viewport',
  axes: 'x',
  value: range.from && range.to ? { x: [Date.parse(range.from) - 0.6 * DAY, Date.parse(range.to) + 0.6 * DAY] } : {},
}]);

export function SetViewportDemo() {
  const { onSurface, send } = useControl<{ range: Range }>('app-demo-viewport');
  const [active, setActive] = useState('all');
  const pick = (range: Range) => {
    setActive(range.id);
    send({ range });
  };

  return <DemoColumns
    panel={<>
      <div className="it-detail-heading">Trading days</div>
      <div className="app-demo-segments" role="group" aria-label="Date range">
        {RANGES.map((range) => <button key={range.id} type="button" aria-pressed={active === range.id} onClick={() => pick(range)}>{range.label}</button>)}
      </div>
      <p className="it-detail-note">Each button frames the x axis on its trading days.</p>
    </>}
    chart={<InteractionDemoChart fixture={VIEWPORT_FIXTURE} interactions={VIEWPORT_INTERACTIONS} chartId="app-demo-viewport" onSurface={onSurface} />}
  />;
}

const LIFE_ROWS = rowsOfFixture(lifeFixture);
const LIFE = new Map<string, { Male: number; Female: number }>();
for (const row of LIFE_ROWS) {
  const entry = LIFE.get(String(row.Country)) ?? { Male: 0, Female: 0 };
  entry[row.Sex as 'Male' | 'Female'] = Number(row['Life expectancy']);
  LIFE.set(String(row.Country), entry);
}
type Sort = { id: string; label: string; value: (country: string) => number | string; descending: boolean; unit: (country: string) => string };
const SORTS: Sort[] = [
  { id: 'female', label: 'Female', value: (c) => LIFE.get(c)!.Female, descending: true, unit: (c) => `${LIFE.get(c)!.Female} years` },
  { id: 'male', label: 'Male', value: (c) => LIFE.get(c)!.Male, descending: true, unit: (c) => `${LIFE.get(c)!.Male} years` },
  { id: 'gap', label: 'Gap', value: (c) => LIFE.get(c)!.Female - LIFE.get(c)!.Male, descending: true, unit: (c) => `${(LIFE.get(c)!.Female - LIFE.get(c)!.Male).toFixed(1)} years` },
  { id: 'name', label: 'Name', value: (c) => c, descending: false, unit: () => '' },
];
function sorted(sort: Sort): string[] {
  return [...LIFE.keys()].sort((a, b) => {
    const [x, y] = [sort.value(a), sort.value(b)];
    const order = typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y));
    return sort.descending ? -order : order;
  });
}
const ORDER_FIXTURE = withSpec(lifeFixture, [{ type: 'drag-reorder', id: 'reorder' }]);
const ORDER_INTERACTIONS = controlled<{ countries: string[] }>(({ countries }) => [
  { op: 'set-order', scope: 'category', field: 'Country', values: countries },
]);

export function SetOrderDemo() {
  const { onSurface, send } = useControl<{ countries: string[] }>('app-demo-order');
  const [active, setActive] = useState<string | null>(null);
  const sort = SORTS.find((entry) => entry.id === active);
  const pick = (next: Sort) => {
    setActive(next.id);
    send({ countries: sorted(next) });
  };

  return <DemoColumns
    panel={<>
      <div className="it-detail-heading">Sort countries by</div>
      <div className="app-demo-segments" role="group" aria-label="Sort countries by">
        {SORTS.map((entry) => <button key={entry.id} type="button" aria-pressed={active === entry.id} onClick={() => pick(entry)}>{entry.label}</button>)}
      </div>
      <ol className="app-demo-ranking">
        {(sort ? sorted(sort) : [...LIFE.keys()]).map((country) => <li key={country}>
          <span>{country}</span><strong>{sort?.unit(country)}</strong>
        </li>)}
      </ol>
    </>}
    chart={<InteractionDemoChart fixture={ORDER_FIXTURE} interactions={ORDER_INTERACTIONS} chartId="app-demo-order" onSurface={onSurface} />}
  />;
}

type PriceRow = { month: string; item: string; price: number };
const PRICE_ROWS = (foodPrices.values as PriceRow[]).filter((row) => row.month.endsWith('-08-01'));
const YEARS = [...new Set(PRICE_ROWS.map((row) => Number(row.month.slice(0, 4))))].sort((a, b) => a - b);
const MAX_PRICE = Math.ceil(Math.max(...PRICE_ROWS.map((row) => row.price)));
function pricesIn(year: number): Row[] {
  return PRICE_ROWS
    .filter((row) => row.month.startsWith(`${year}-`))
    .map((row) => ({ Item: row.item, 'Price ($)': row.price }));
}
const DATA_FIXTURE: InteractionDemoFixture = {
  id: 'food-prices',
  title: 'U.S. average food prices, August',
  source: foodPrices.source,
  input: {
    data: { values: pricesIn(YEARS[0]) },
    semantic_types: {
      Item: 'Category',
      'Price ($)': { semanticType: 'Price', intrinsicDomain: [0, MAX_PRICE], unit: 'USD' },
    },
    chart_spec: {
      chartType: 'Bar Chart',
      title: 'U.S. average food prices, August',
      encodings: { x: 'Item', y: 'Price ($)' },
      baseSize: { width: 430, height: 270 },
    },
  } as ChartAssemblyInput,
};
const DATA_INTERACTIONS = controlled<{ year: number }>(({ year }) => [
  { op: 'set-data', source: 'main', value: { rows: pricesIn(year) } },
]);

export function SetDataDemo() {
  const { onSurface, send } = useControl<{ year: number }>('app-demo-data');
  const [year, setYear] = useState(YEARS[0]);
  const rows = pricesIn(year);
  const base = new Map(pricesIn(YEARS[0]).map((row) => [String(row.Item), Number(row['Price ($)'])]));
  const pick = (next: number) => {
    setYear(next);
    send({ year: next });
  };

  return <DemoColumns
    panel={<>
      <label className="app-demo-field">
        <span>Year</span>
        <SiteRange min={0} max={YEARS.length - 1} step={1} value={YEARS.indexOf(year)} onChange={(event) => pick(YEARS[Number(event.target.value)])} />
        <strong>August {year}</strong>
      </label>
      <dl className="it-definition-list app-demo-list">
        {rows.map((row) => {
          const item = String(row.Item);
          const price = Number(row['Price ($)']);
          const start = base.get(item);
          return <div key={item}>
            <dt>{item}</dt>
            <dd>${price.toFixed(2)}{start && year !== YEARS[0] ? ` (${price >= start ? '+' : ''}${(((price - start) / start) * 100).toFixed(0)}% since ${YEARS[0]})` : ''}</dd>
          </div>;
        })}
      </dl>
    </>}
    chart={<InteractionDemoChart fixture={DATA_FIXTURE} interactions={DATA_INTERACTIONS} chartId="app-demo-data" onSurface={onSurface} />}
  />;
}

type GdpRow = typeof gdp.rows[number];
const GDP_YEARS = [...new Set(gdp.rows.map((row) => row.year))].sort((a, b) => a - b);
const LAST_GDP_YEAR = GDP_YEARS[GDP_YEARS.length - 1];
const gdpIn = (year: number): GdpRow[] => gdp.rows.filter((row) => row.year === year);
const gdpRows = (year: number): Row[] => gdpIn(year).map((row) => ({ Country: row.country, 'GDP ($ trillion)': row.gdp }));

/** The ten largest economies of one year, as a ranked bar chart with no gesture of its own. */
const GDP_FIXTURE: InteractionDemoFixture = {
  id: 'gdp-ranking',
  title: 'The ten largest economies',
  source: gdp.source,
  input: {
    data: { values: gdpRows(LAST_GDP_YEAR) },
    semantic_types: { Country: 'Category', 'GDP ($ trillion)': 'Amount' },
    chart_spec: {
      chartType: 'Bar Chart',
      title: 'The ten largest economies',
      subtitle: 'GDP in current US dollars, trillions',
      encodings: { x: 'GDP ($ trillion)', y: { field: 'Country', sortBy: 'x', sortOrder: 'descending' } },
      baseSize: { width: 600, height: 340 },
    },
  } as ChartAssemblyInput,
};
/** Milliseconds each year stays on screen while the demo plays. */
const PLAY_STEP_MS = 600;
const GDP_INTERACTIONS = controlled<{ year: number }>(({ year }) => [
  { op: 'set-data', source: 'main', value: { rows: gdpRows(year) } },
]);

export function SetWindowDemo() {
  const { onSurface, send } = useControl<{ year: number }>('app-demo-window');
  const [year, setYear] = useState(LAST_GDP_YEAR);
  const [playing, setPlaying] = useState(false);
  const pick = (next: number) => {
    setYear(next);
    send({ year: next });
  };
  const pickRef = useRef(pick);
  pickRef.current = pick;
  const yearRef = useRef(year);
  yearRef.current = year;

  // Play walks the years one step at a time and stops at the last one.
  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(() => {
      const next = yearRef.current + 1;
      if (next > LAST_GDP_YEAR) {
        setPlaying(false);
        return;
      }
      pickRef.current(next);
    }, PLAY_STEP_MS);
    return () => window.clearInterval(timer);
  }, [playing]);

  const togglePlay = () => {
    if (playing) {
      setPlaying(false);
      return;
    }
    // At the end, play starts over from the first year.
    if (year >= LAST_GDP_YEAR) pick(GDP_YEARS[0]);
    setPlaying(true);
  };
  const current = gdpIn(year);
  const previous = year > GDP_YEARS[0] ? gdpIn(year - 1) : [];
  const names = (rows: GdpRow[]) => new Set(rows.map((row) => row.country));
  const entered = current.filter((row) => previous.length > 0 && !names(previous).has(row.country)).map((row) => row.country);
  const left = previous.filter((row) => !names(current).has(row.country)).map((row) => row.country);

  return <div className="app-demo-stack">
    <div className="app-demo-year-bar">
      <button type="button" className="app-demo-play" onClick={togglePlay} aria-pressed={playing}>
        {playing ? <Pause size={13} strokeWidth={2.2} aria-hidden="true" /> : <Play size={13} strokeWidth={2.2} aria-hidden="true" />}
        <span>{playing ? 'Pause' : 'Play'}</span>
      </button>
      <label className="app-demo-field app-demo-year">
        <span>Year</span>
        <SiteRange min={GDP_YEARS[0]} max={LAST_GDP_YEAR} step={1} value={year} onChange={(event) => pick(Number(event.target.value))} />
        <strong>{year}</strong>
      </label>
      <p className="it-detail-note app-demo-year-note">
        {entered.length > 0 || left.length > 0
          ? <>{entered.length > 0 && <>In: {entered.join(', ')}. </>}{left.length > 0 && <>Out: {left.join(', ')}.</>}</>
          : 'Drag the thumb; the chart redraws with that year\'s ten and re-sorts the bars.'}
      </p>
    </div>
    <div className="app-demo-box app-demo-stack-chart">
      <InteractionDemoChart fixture={GDP_FIXTURE} interactions={GDP_INTERACTIONS} chartId="app-demo-window" onSurface={onSurface} />
    </div>
  </div>;
}
