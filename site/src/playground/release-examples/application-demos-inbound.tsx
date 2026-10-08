import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChartAssemblyInput, InteractionEntry } from 'flint-chart';
import {
  externalInteraction,
  type ChartUpdate,
  type InteractionDef,
} from 'flint-chart/interactive';
import { FlintChart, type FlintChartHandle } from 'flint-chart/react';
import { expressionInterpreter } from 'vega-interpreter';
import { SiteRange } from '../../components/SiteRange';
import foodPrices from '../../data/cpi-food-prices.json';
import gdp from '../../data/gdp-top10.json';
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

/** The handle of the mounted chart, and a dispatch to its control that reports anything not applied. */
function useControl<P>(chartId: string) {
  const chart = useRef<FlintChartHandle>(null);
  const send = useCallback((payload: P) => {
    void chart.current?.dispatch(CONTROL, payload).then((result) => {
      if (result?.status !== 'applied') console.warn(`${chartId}: ${result?.status ?? 'no handler'}`, result);
    });
  }, [chartId]);
  return { chart, send };
}

const CLEAR_STYLE: ChartUpdate['ops'] = [{ op: 'set-style', targets: [], value: { state: 'normal' } }];

const STYLE_INTERACTIONS = controlled<{ countries: string[] }>(({ countries }) => (countries.length > 0
  ? [{ op: 'set-style', targets: countries.map((Country) => ({ select: { key: { Country } } })), value: { state: 'emphasized' } }]
  : CLEAR_STYLE));
const COUNTRY_NAMES = rowsOfFixture(countriesFixture).map((row) => String(row.Country)).sort();

export function SetStyleDemo() {
  const { chart, send } = useControl<{ countries: string[] }>('app-demo-style');
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
    chart={<FlintChart
      ref={chart}
      spec={countriesFixture.input}
      interactions={STYLE_INTERACTIONS}
      chartId="app-demo-style"
      ariaLabel={countriesFixture.title}
      renderer="svg" expressionInterpreter={expressionInterpreter} className="it-chart-mount" width="100%"
    />}
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
  const { chart, send } = useControl<{ alert: Alert | null }>('app-demo-annotation');
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
    chart={<FlintChart
      ref={chart}
      spec={weatherFixture.input}
      interactions={ANNOTATION_INTERACTIONS}
      chartId="app-demo-annotation"
      ariaLabel={weatherFixture.title}
      renderer="svg" expressionInterpreter={expressionInterpreter} className="it-chart-mount" width="100%"
    />}
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
  const { chart, send } = useControl<{ range: Range }>('app-demo-viewport');
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
    chart={<FlintChart
      ref={chart}
      spec={VIEWPORT_FIXTURE.input}
      interactions={VIEWPORT_INTERACTIONS}
      chartId="app-demo-viewport"
      ariaLabel={VIEWPORT_FIXTURE.title}
      renderer="svg" expressionInterpreter={expressionInterpreter} className="it-chart-mount" width="100%"
    />}
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
  const { chart, send } = useControl<{ countries: string[] }>('app-demo-order');
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
    chart={<FlintChart
      ref={chart}
      spec={ORDER_FIXTURE.input}
      interactions={ORDER_INTERACTIONS}
      chartId="app-demo-order"
      ariaLabel={ORDER_FIXTURE.title}
      renderer="svg" expressionInterpreter={expressionInterpreter} className="it-chart-mount" width="100%"
    />}
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
  const { chart, send } = useControl<{ year: number }>('app-demo-data');
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
    chart={<FlintChart
      ref={chart}
      spec={DATA_FIXTURE.input}
      interactions={DATA_INTERACTIONS}
      chartId="app-demo-data"
      ariaLabel={DATA_FIXTURE.title}
      renderer="svg" expressionInterpreter={expressionInterpreter} className="it-chart-mount" width="100%"
    />}
  />;
}

type GdpRow = typeof gdp.rows[number];
const GDP_YEARS = [...new Set(gdp.rows.map((row) => row.year))].sort((a, b) => a - b);
const FIRST_GDP_YEAR = GDP_YEARS[0];
const LAST_GDP_YEAR = GDP_YEARS[GDP_YEARS.length - 1];
const GDP_COUNTRIES = [...new Set(gdp.rows.map((row) => row.country))].sort();
const gdpIn = (year: number): GdpRow[] => gdp.rows.filter((row) => row.year === year);
const gdpRow = (country: string, value: number): Row => ({ Country: country, 'GDP ($ trillion)': value });
const gdpRows = (year: number): Row[] => gdpIn(year).map((row) => gdpRow(row.country, row.gdp));

const TOP = 10;

/**
 * The rows part-way from one year to the next: shared countries move, leavers
 * shrink to zero, entrants grow from it. Only the ten largest of the frame are
 * kept, so the bar count, and with it the chart's height, never changes.
 */
function gdpBetween(from: number, to: number, t: number): Row[] {
  const a = new Map(gdpIn(from).map((row) => [row.country, row.gdp]));
  const b = new Map(gdpIn(to).map((row) => [row.country, row.gdp]));
  return [...new Set([...a.keys(), ...b.keys()])]
    .map((country) => gdpRow(country, (a.get(country) ?? 0) * (1 - t) + (b.get(country) ?? 0) * t))
    .sort((x, y) => Number(y['GDP ($ trillion)']) - Number(x['GDP ($ trillion)']))
    .slice(0, TOP);
}

type GdpEvent = { year: number; title: string; note: string; country?: string };
const GDP_EVENTS: GdpEvent[] = [
  { year: 1960, title: 'The postwar order', note: 'The US economy is six times the size of Germany’s, the next largest.', country: 'United States' },
  { year: 1968, title: 'Japan passes West Germany', note: 'Second place, which it holds for the next four decades.', country: 'Japan' },
  { year: 1973, title: 'First oil shock', note: 'The OPEC embargo; nominal GDP keeps climbing with inflation.' },
  { year: 1988, title: 'The Soviet Union enters the ten', note: 'Reported in dollars for the first time; gone again after 1992.', country: 'Russian Federation' },
  { year: 1995, title: 'Japan’s peak', note: 'A strong yen puts Japan at three quarters of the US economy.', country: 'Japan' },
  { year: 2001, title: 'China joins the WTO', note: 'Sixth place, between France and Italy.', country: 'China' },
  { year: 2008, title: 'Financial crisis', note: 'China passes Germany for third.', country: 'China' },
  { year: 2010, title: 'China passes Japan', note: 'Second place changes hands.', country: 'China' },
  { year: 2020, title: 'Pandemic year', note: 'Most of the ten shrink in dollar terms; China grows.', country: 'China' },
  { year: 2022, title: 'India passes the UK', note: 'Fifth place.', country: 'India' },
  { year: 2023, title: 'Germany passes Japan', note: 'A weak yen drops Japan to fourth.', country: 'Germany' },
];
const eventOf = (year: number) => GDP_EVENTS.find((event) => event.year === year) ?? null;

/** The ten largest economies of one year, as a ranked bar chart with no gesture of its own. */
const GDP_FIXTURE: InteractionDemoFixture = {
  id: 'gdp-ranking',
  title: 'The ten largest economies',
  source: gdp.source,
  input: {
    data: { values: gdpRows(FIRST_GDP_YEAR) },
    semantic_types: { Country: 'Category', 'GDP ($ trillion)': 'Amount' },
    chart_spec: {
      chartType: 'Bar Chart',
      title: 'The ten largest economies',
      subtitle: 'GDP in current US dollars, trillions',
      encodings: { x: 'GDP ($ trillion)', y: { field: 'Country', sortBy: 'x', sortOrder: 'descending' } },
      baseSize: { width: 440, height: 700 },
      canvasSize: { width: 440, height: 700 },
    },
  } as ChartAssemblyInput,
};

type GdpFrame = { rows: Row[]; follow: string | null; event: GdpEvent | null };
const FOLLOW = 'follow';
const FOLLOW_INK = '#e07b39';
const has = (rows: Row[], country: string | undefined | null) => Boolean(country) && rows.some((row) => row.Country === country);
/** The rows land first; the lit bar and the event note resolve against them in a second update. */
const GDP_INTERACTIONS: readonly InteractionDef[] = [
  externalInteraction<Row[]>({ id: CONTROL, handle: (rows) => ({ id: CONTROL, ops: [{ op: 'set-data', source: 'main', value: { rows } }] }) }),
  externalInteraction<GdpFrame>({ id: FOLLOW, handle: ({ rows, follow, event }) => ({ id: FOLLOW, ops: [
    has(rows, follow)
      ? { op: 'set-style', targets: [{ select: { key: { Country: follow! } } }], value: { fill: FOLLOW_INK } }
      : CLEAR_STYLE[0],
    ...(event && has(rows, event.country)
      ? [{ op: 'set-annotation', target: { select: { key: { Country: event.country! } } }, value: { text: event.title } } as const]
      : []),
  ] }) }),
];

/** The chart opens on 1960 with its event already noted. */
const GDP_INITIAL_UPDATES: readonly ChartUpdate[] = [{ id: FOLLOW, ops: [
  { op: 'set-annotation', target: { select: { key: { Country: GDP_EVENTS[0].country! } } }, value: { text: GDP_EVENTS[0].title } },
] }];

const STEP_MS = 900;

export function SetWindowDemo() {
  const chart = useRef<FlintChartHandle>(null);
  const send = useCallback(async (frame: GdpFrame) => {
    const data = await chart.current?.dispatch(CONTROL, frame.rows);
    const follow = await chart.current?.dispatch(FOLLOW, frame);
    for (const result of [data, follow]) {
      if (result && result.status !== 'applied') console.warn(`app-demo-window: ${result.status}`, result);
    }
  }, []);
  const [year, setYear] = useState(FIRST_GDP_YEAR);
  const [follow, setFollow] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const run = useRef<{ frame: number; busy: boolean; follow: string | null } | null>(null);
  const reachedEvent = useRef<HTMLLIElement>(null);

  const show = useCallback((next: number, followed: string | null) => {
    setYear(next);
    void send({ rows: gdpRows(next), follow: followed, event: eventOf(next) });
  }, [send]);

  const stop = useCallback(() => {
    if (run.current) cancelAnimationFrame(run.current.frame);
    run.current = null;
    setPlaying(false);
  }, []);

  const play = useCallback((from: number) => {
    stop();
    const state = { frame: 0, busy: false, follow };
    run.current = state;
    setPlaying(true);
    let year = from;
    let started = performance.now();
    const tick = (now: number) => {
      if (run.current !== state) return;
      const t = Math.min(1, (now - started) / STEP_MS);
      if (!state.busy) {
        state.busy = true;
        const frame: GdpFrame = t < 1
          ? { rows: gdpBetween(year, year + 1, t), follow: state.follow, event: eventOf(year) }
          : { rows: gdpRows(year + 1), follow: state.follow, event: eventOf(year + 1) };
        void send(frame).then(() => { state.busy = false; });
        if (t >= 1) {
          year += 1;
          started = now;
          setYear(year);
          if (year >= LAST_GDP_YEAR) { stop(); return; }
        }
      }
      state.frame = requestAnimationFrame(tick);
    };
    state.frame = requestAnimationFrame(tick);
  }, [follow, send, stop]);

  useEffect(() => stop, [stop]);
  useEffect(() => {
    reachedEvent.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [year]);

  const pick = (next: number) => {
    stop();
    show(next, follow);
  };
  const track = (next: string | null) => {
    setFollow(next);
    if (run.current) run.current.follow = next;
    else void send({ rows: gdpRows(year), follow: next, event: eventOf(year) });
  };
  const togglePlay = () => {
    if (playing) stop();
    else play(year >= LAST_GDP_YEAR ? FIRST_GDP_YEAR : year);
  };

  const ranked = [...gdpIn(year)].sort((a, b) => b.gdp - a.gdp);
  const reached = GDP_EVENTS.filter((event) => event.year <= year).at(-1);
  const rank = follow ? ranked.findIndex((row) => row.country === follow) : -1;

  return <DemoColumns
    panelTitle="External control"
    panel={<div className="app-demo-gdp-panel">
      <div className="app-demo-year-row">
        <strong>{year}</strong>
        <SiteRange min={FIRST_GDP_YEAR} max={LAST_GDP_YEAR} step={1} value={year} aria-label="Year" onChange={(event) => pick(Number(event.target.value))} />
        <button type="button" className="app-demo-play" onClick={togglePlay} aria-pressed={playing}>{playing ? 'Pause' : year >= LAST_GDP_YEAR ? 'Replay' : 'Play'}</button>
      </div>
      <label className="app-demo-field">
        <span>Follow a country</span>
        <select value={follow ?? ''} onChange={(event) => track(event.target.value || null)}>
          <option value="">None</option>
          {GDP_COUNTRIES.map((country) => <option key={country} value={country}>{country}</option>)}
        </select>
        <strong>
          {follow
            ? rank >= 0 ? `#${rank + 1} in ${year}, $${ranked[rank].gdp.toFixed(2)} trillion` : `Outside the ten in ${year}`
            : 'Its bar turns orange and keeps the colour as the ranks change.'}
        </strong>
      </label>
      <div className="it-detail-heading">Timeline</div>
      <ol className="app-demo-timeline">
        {GDP_EVENTS.map((event) => {
          const state = event.year === year ? 'is-current' : event.year < year ? 'is-past' : 'is-future';
          return <li key={event.year} className={state} ref={event === reached ? reachedEvent : undefined}>
            <button type="button" title={event.note} onClick={() => pick(event.year)}>
              <span>{event.year}</span>
              <strong>{event.title}</strong>
            </button>
          </li>;
        })}
      </ol>
    </div>}
    chart={<FlintChart
      ref={chart}
      spec={GDP_FIXTURE.input}
      interactions={GDP_INTERACTIONS}
      updates={GDP_INITIAL_UPDATES}
      chartId="app-demo-window"
      ariaLabel={GDP_FIXTURE.title}
      renderer="svg" expressionInterpreter={expressionInterpreter} className="it-chart-mount" width="100%"
    />}
  />;
}
