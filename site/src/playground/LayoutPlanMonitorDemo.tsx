import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import { getChartTransitions } from 'flint-chart';
import { openVegaLiteSession } from '../../../packages/flint-js/src/vegalite/assemble';
import foodPrices from '../data/cpi-food-prices.json';
import election from '../data/election-2024.json';
import { labelText, specStep } from './layout-plan-shared';
import { MorphingChart } from './LayoutPlanMorphDemo';

type Row = Record<string, unknown>;

interface Snapshot {
  rows: number;
  chartType: string;
  spec: ChartAssemblyInput;
  facts: string;
  warning?: string;
}

interface Stream {
  id: string;
  title: string;
  /** What arrives each tick. */
  arrives: string;
  base: ChartAssemblyInput;
  /** The data as of a tick. */
  rowsAt: (tick: number) => Row[];
  /** The tick by which all of the stream's data has arrived. */
  lastTick: number;
  /** The chart type the stream should be drawn as for the rows so far, and why, or undefined to keep the authored type. */
  policy: (rows: Row[]) => { to: string; reason: string } | undefined;
}

// ─── Data ──────────────────────────────────────────────────────────────────

const EGGS = foodPrices.values
  .filter(({ item }) => item === 'Eggs')
  .map(({ month, price }) => ({ Month: month.slice(0, 7), Price: price }));

const ITEMS = [...new Set(foodPrices.values.map(({ item }) => item))];
/** A new food joins every few ticks; on each tick every food that has joined gains its next month. */
const FOOD_JOIN_TICKS = 6;
const FOOD_STREAM = (() => {
  const series = ITEMS.map((item) => foodPrices.values
    .filter((row) => row.item === item && row.month >= '2019-01')
    .map(({ month, price }) => ({ Month: month.slice(0, 7), Food: item, Price: price })));
  const rows: Row[] = [];
  const counts = [0];
  for (let tick = 1; rows.length < series.reduce((sum, list) => sum + list.length, 0); tick++) {
    series.forEach((list, index) => {
      const month = tick - 1 - index * FOOD_JOIN_TICKS;
      if (month >= 0 && month < list.length) rows.push(list[month]);
    });
    counts.push(rows.length);
  }
  return { rowsAt: (tick: number) => rows.slice(0, counts[Math.min(tick, counts.length - 1)]), lastTick: counts.length - 1 };
})();

/** The tick by which the streams that are not paced by their own data have all of it. */
const RUN_TICKS = 120;

const STRIP_STATES = ['PA', 'GA', 'NV', 'AZ'];
const COUNTIES_BY_STATE = STRIP_STATES.map((state) => election.counties
  .filter((county) => county.state === state)
  .map(({ county, margin }) => ({ State: state, County: county, Margin: margin })));

/** Each state's counties report at its own pace, so every state finishes on the last tick. */
const countiesAt = (tick: number): Row[] => COUNTIES_BY_STATE.flatMap((counties) =>
  counties.slice(0, Math.max(1, Math.round(counties.length * Math.min(1, tick / RUN_TICKS)))));

const REPORTING_TICKS = 40;
const STATES_BY_SIZE = [...election.states].sort((a, b) => b.total - a.total);
const startOf = (index: number) => 1 + Math.round(index * (RUN_TICKS - REPORTING_TICKS) / STATES_BY_SIZE.length);

/** Election-night returns: each state starts reporting at its own tick and counts up to its total over the next 40 ticks. */
const returnsAt = (tick: number): Row[] => STATES_BY_SIZE
  .map(({ stateName, total }, index) => ({ State: stateName, Votes: Math.round(total * Math.min(1, (tick - startOf(index) + 1) / REPORTING_TICKS)) }))
  .filter(({ Votes }) => Votes > 0)
  .sort((a, b) => b.Votes - a.Votes);

/** The registry's edge from one chart type to another, if Flint offers it. */
const edge = (from: string, to: string) => getChartTransitions(from).find((transition) => transition.to === to);
const SERIES_LIMIT = 6;
const POINTS_LIMIT = 40;

const STREAMS: Stream[] = [
  {
    id: 'months',
    title: 'Egg prices, month by month',
    arrives: 'one month per tick',
    rowsAt: (tick) => EGGS.slice(0, tick),
    lastTick: EGGS.length,
    base: {
      data: { values: [] },
      semantic_types: { Month: 'YearMonth', Price: { semanticType: 'Price', unit: 'USD' } },
      chart_spec: { chartType: 'Bar Chart', encodings: { x: 'Month', y: 'Price' }, baseSize: { width: 360, height: 200 } },
    },
    policy: (rows) => {
      const limit = edge('Line Chart', 'Bar Chart')?.maxCategoryCardinality ?? 30;
      return rows.length > limit
        ? { to: 'Line Chart', reason: `${rows.length} months, more than ${limit} bars can show` }
        : undefined;
    },
  },
  {
    id: 'series',
    title: 'Food prices, foods joining over time',
    arrives: 'one month per food, a new food every 6 ticks',
    rowsAt: FOOD_STREAM.rowsAt,
    lastTick: FOOD_STREAM.lastTick,
    base: {
      data: { values: [] },
      semantic_types: { Month: 'YearMonth', Food: 'Category', Price: { semanticType: 'Price', unit: 'USD' } },
      chart_spec: { chartType: 'Line Chart', encodings: { x: 'Month', y: 'Price', color: 'Food' }, baseSize: { width: 360, height: 200 } },
    },
    policy: (rows) => {
      const series = new Set(rows.map((row) => row.Food)).size;
      return series > SERIES_LIMIT && edge('Line Chart', 'Sparkline')
        ? { to: 'Sparkline', reason: `${series} foods, too many overlapping lines` }
        : undefined;
    },
  },
  {
    id: 'points',
    title: 'County margins in four states',
    arrives: 'each state reports its counties at its own pace',
    rowsAt: countiesAt,
    lastTick: RUN_TICKS,
    base: {
      data: { values: [] },
      semantic_types: { State: 'Category', County: 'Name', Margin: { semanticType: 'SignedMeasure', unit: 'pts' } },
      chart_spec: { chartType: 'Strip Plot', encodings: { x: 'State', y: 'Margin' }, baseSize: { width: 360, height: 200 } },
    },
    policy: (rows) => {
      const perState = rows.length / STRIP_STATES.length;
      return perState > POINTS_LIMIT && edge('Strip Plot', 'Boxplot')
        ? { to: 'Boxplot', reason: `${Math.round(perState)} counties per state, too dense to read as dots` }
        : undefined;
    },
  },
  {
    id: 'categories',
    title: 'Votes counted, state by state',
    arrives: 'states start reporting one by one and count up',
    rowsAt: returnsAt,
    lastTick: RUN_TICKS,
    base: {
      data: { values: [] },
      semantic_types: { State: 'State', Votes: 'Count' },
      chart_spec: { chartType: 'Bar Chart', encodings: { x: 'State', y: 'Votes' }, baseSize: { width: 360, height: 200 } },
    },
    policy: () => undefined,
  },
];

function snapshot(stream: Stream, tick: number): Snapshot & { switched?: string } {
  const rows = stream.rowsAt(tick);
  const authored = stream.base.chart_spec.chartType;
  const decision = stream.policy(rows);
  const input: ChartAssemblyInput = {
    ...structuredClone(stream.base),
    data: { values: rows },
    ...(decision ? { chart_spec: { ...structuredClone(stream.base.chart_spec), chartProperties: { pivot: `type:${decision.to}` } } } : {}),
  };
  const session = openVegaLiteSession(input);
  const warnings: { message?: string }[] = session.spec?._warnings ?? [];
  const step = specStep(session.spec, 'width');
  return {
    rows: rows.length,
    chartType: decision?.to ?? authored,
    spec: input,
    facts: `${step !== undefined ? `${step.toFixed(0)} px bands · ` : ''}labels ${labelText(session.axisLabels.x)}`,
    warning: warnings.length > 0 ? 'some values cut to fit' : undefined,
    switched: decision?.reason,
  };
}

const START_TICK = 8;
/** The longest a tick waits for its charts to finish morphing before moving on anyway. */
const TICK_TIMEOUT_MS = 4000;
/** A type switch morphs this many times longer than a tick, and the stream then rests as long again. */
const SWITCH_FACTOR = 2.5;

export function MonitorDemo() {
  const [tick, setTick] = useState(START_TICK);
  const [playing, setPlaying] = useState(false);
  const [animation, setAnimation] = useState(450);
  const [pause, setPause] = useState(0);
  const switchMs = Math.max(600, animation * SWITCH_FACTOR);
  const [log, setLog] = useState<{ stream: string; tick: number; text: string }[]>([]);
  const lastType = useRef<Record<string, string>>({});
  const shownType = useRef<Record<string, string>>({});
  const holdUntil = useRef(0);
  const pending = useRef({ count: 0, since: 0, done: 0 });
  const settled = useCallback(() => {
    pending.current.count = Math.max(0, pending.current.count - 1);
    if (pending.current.count === 0) pending.current.done = performance.now();
  }, []);
  const maxTicks = Math.max(...STREAMS.map((stream) => stream.lastTick));

  useEffect(() => {
    if (!playing) return undefined;
    const timer = window.setInterval(() => {
      const now = performance.now();
      if (now < holdUntil.current) return;
      if (pending.current.count > 0 && now - pending.current.since < TICK_TIMEOUT_MS) return;
      if (now - pending.current.done < pause) return;
      setTick((current) => {
        if (current >= maxTicks) { setPlaying(false); return current; }
        pending.current = { count: STREAMS.length, since: performance.now(), done: 0 };
        return current + 1;
      });
    }, 30);
    return () => window.clearInterval(timer);
  }, [playing, maxTicks, pause]);

  const snapshots = useMemo(() => STREAMS.map((stream) => ({
    stream,
    snap: snapshot(stream, tick),
  })), [tick]);
  useEffect(() => {
    for (const { stream, snap } of snapshots) shownType.current[stream.id] = snap.chartType;
  }, [snapshots]);

  useEffect(() => {
    for (const { stream, snap } of snapshots) {
      const before = lastType.current[stream.id];
      lastType.current[stream.id] = snap.chartType;
      if (before && before !== snap.chartType) {
        holdUntil.current = performance.now() + switchMs * 2;
        setLog((lines) => [{ stream: stream.title, tick, text: `${before} → ${snap.chartType}. ${snap.switched ?? 'Back to the authored type.'}` }, ...lines].slice(0, 10));
      }
    }
  }, [snapshots, tick, switchMs]);

  const reset = useCallback(() => {
    setPlaying(false);
    setTick(START_TICK);
    setLog([]);
    lastType.current = {};
  }, []);

  return (
    <section className="ov-demo lp-demo" data-demo="monitor">
      <header className="ov-demo-header">
        <div>
          <h2>A live monitor that changes its mind</h2>
          <p>Four streams fill up over time and each chart is planned again on every tick. When a chart outgrows its type, the stream pauses while it morphs into another along Flint's own transition rules: monthly bars become a line, crowded lines become sparklines, dense strips become boxplots.</p>
        </div>
        <div className="ov-backends" role="group" aria-label="Playback">
          <button type="button" onClick={() => { if (tick >= maxTicks) reset(); setPlaying((value) => !value); }}>{playing ? 'Pause' : 'Play'}</button>
          <button type="button" onClick={reset}>Reset</button>
        </div>
      </header>
      <div className="lp-monitor-controls">
        <label className="lp-slider">
          <span>Tick {tick} of {maxTicks}</span>
          <input type="range" min={1} max={maxTicks} value={tick} onChange={(event) => { setPlaying(false); setTick(Number(event.target.value)); }} />
        </label>
        <label className="lp-slider">
          <span>Animation {animation} ms per tick</span>
          <input type="range" min={0} max={1500} step={50} value={animation} onChange={(event) => setAnimation(Number(event.target.value))} />
        </label>
        <label className="lp-slider">
          <span>Pause {pause} ms between ticks</span>
          <input type="range" min={0} max={2000} step={50} value={pause} onChange={(event) => setPause(Number(event.target.value))} />
        </label>
      </div>
      <div className="lp-monitor-grid">
        {snapshots.map(({ stream, snap }) => (
          <figure key={stream.id} className="lp-slice" data-stream={stream.id} data-chart-type={snap.chartType}>
            <figcaption>
              <strong>{stream.title}</strong>
              <span><b>{snap.chartType}</b> · {snap.rows} rows · {stream.arrives}</span>
              <span>{snap.facts}</span>
              {snap.warning && <span className="lp-slice-warning">{snap.warning}</span>}
            </figcaption>
            <MorphingChart spec={snap.spec} duration={shownType.current[stream.id] !== undefined && shownType.current[stream.id] !== snap.chartType ? switchMs : animation} onMorph={settled} />
          </figure>
        ))}
      </div>
      <h3 className="lp-monitor-log-title">Type switches</h3>
      {log.length === 0
        ? <p className="lp-muted">None yet. Press Play.</p>
        : (
          <ol className="lp-negotiation" data-switches>
            {log.map((line, index) => <li key={index}><b>{line.stream}</b>, tick {line.tick}: {line.text}</li>)}
          </ol>
        )}
    </section>
  );
}
