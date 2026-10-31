import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import {
  clickHighlight,
  dragReorder,
  linkCharts,
  type ChartUpdate,
  type InteractiveChartSurface,
} from 'flint-chart/interactive';
import { Case, CaseChart, chart, where, type Renderer } from './update-animation-case';

type Row = Record<string, unknown>;

interface Shared {
  duration: number;
  renderer: Renderer;
}

const NATIONS = [
  { Country: 'India', Region: 'Asia', base: 12, growth: 0.07 },
  { Country: 'Vietnam', Region: 'Asia', base: 8, growth: 0.085 },
  { Country: 'Japan', Region: 'Asia', base: 40, growth: 0.002 },
  { Country: 'Chile', Region: 'Americas', base: 22, growth: 0.03 },
  { Country: 'Brazil', Region: 'Americas', base: 30, growth: 0.015 },
  { Country: 'Poland', Region: 'Europe', base: 18, growth: 0.045 },
  { Country: 'Spain', Region: 'Europe', base: 35, growth: 0.01 },
  { Country: 'Kenya', Region: 'Africa', base: 6, growth: 0.05 },
];
const VALUE = 'Output ($bn)';
const nationRows = (year: number, region?: string): Row[] => NATIONS
  .filter((nation) => !region || nation.Region === region)
  .map(({ Country, Region, base, growth }) => ({ Country, Region, [VALUE]: Math.round(base * (1 + growth) ** (year - 2000)) }));
const byValue = (rows: Row[]) => [...rows].sort((a, b) => Number(b[VALUE]) - Number(a[VALUE])).map((row) => row.Country);
const NATION_TYPES = { Country: 'Country', Region: 'Category', [VALUE]: 'Amount' };
const nationChart = (chartType = 'Bar Chart', rows = nationRows(2000), width = 340): ChartAssemblyInput =>
  chart(chartType, 'Output by country (illustrative)', rows, NATION_TYPES, { x: 'Country', y: VALUE, color: 'Region' }, width, 210);

const register = (id: string, surface: InteractiveChartSurface | null) => {
  const registry = window as unknown as { flintUpdateAnimation?: Record<string, InteractiveChartSurface | null> };
  registry.flintUpdateAnimation = { ...registry.flintUpdateAnimation, [id]: surface };
};
const wait = (ms: number) => new Promise((resolve) => window.setTimeout(resolve, ms));

interface TourStep {
  label: string;
  run: (surface: InteractiveChartSurface) => Promise<unknown>;
}

/** One chart taken through every kind of change, each step easing from the frame the last one left. */
export function OpeningTour({ duration, renderer }: Shared) {
  const input = useMemo(() => nationChart(), []);
  const lollipop = useMemo(() => nationChart('Lollipop Chart'), []);
  const interactions = useMemo(() => [clickHighlight(), dragReorder()], []);
  const [step, setStep] = useState(-1);
  const playing = useRef(false);
  const steps: TourStep[] = useMemo(() => {
    const latest = nationRows(2024);
    const asia = nationRows(2024, 'Asia');
    return [
      { label: 'New data: 2000 → 2024', run: (s) => s.applyUpdate({ id: 'data', ops: [{ op: 'set-data', source: 'main', value: { rows: latest } }] }) },
      { label: 'Sort by value', run: (s) => s.applyUpdate({ id: 'order', ops: [{ op: 'set-order', scope: 'category', field: 'Country', values: byValue(latest) }] }) },
      { label: 'Emphasize the leaders, name the first', run: (s) => s.applyUpdate({ id: 'focus', ops: [
        { op: 'set-style', targets: [where('Country', byValue(latest).slice(0, 3))], value: { state: 'emphasized', mutedOpacity: 0.2 } },
        { op: 'set-annotation', target: { select: { key: { Country: byValue(latest)[0] } } }, value: { text: 'Leader' } },
      ] }) },
      { label: 'Narrow to Asia', run: async (s) => {
        void s.clearUpdate('focus');
        await s.applyUpdate({ id: 'data', ops: [{ op: 'set-data', source: 'main', value: { rows: asia } }] });
      } },
      { label: 'Change chart type: lollipop', run: (s) => s.setInput(lollipop) },
    ];
  }, [lollipop]);
  const reset = async (surface: InteractiveChartSurface) => {
    await surface.setInput(input);
    for (const id of ['data', 'order', 'focus']) await surface.clearUpdate(id);
    setStep(-1);
  };
  const play = async (surface: InteractiveChartSurface) => {
    if (playing.current) return;
    playing.current = true;
    await reset(surface);
    await wait(500);
    for (let at = 0; at < steps.length; at += 1) {
      setStep(at);
      await steps[at]!.run(surface);
      await wait(Math.max(900, duration * 3));
    }
    playing.current = false;
  };
  return (
    <Case
      id="opening"
      title="One chart, every kind of change"
      op="set-data · set-order · set-style · set-annotation · setInput"
      note="Press Play. New values, a new order, emphasis with a note, rows leaving, then a new chart type: each change eases from the frame the last one left, and nothing on the page asked for animation."
      input={input}
      interactions={interactions}
      duration={duration}
      renderer={renderer}
      wide
      controls={(surface) => (
        <>
          <button type="button" onClick={() => void play(surface)}>Play</button>
          <button type="button" onClick={() => void reset(surface)}>Reset</button>
          <ol className="ua-steps-list">
            {steps.map((entry, at) => <li key={entry.label} data-active={at === step}>{entry.label}</li>)}
          </ol>
        </>
      )}
    />
  );
}

function PairCard({ id, title, note, op, children, controls }: { id: string; title: string; note: string; op: string; children: ReactNode; controls: ReactNode }) {
  return (
    <article className="cf-probe cf-probe-wide ua-case" data-case={id}>
      <header className="cf-probe-header">
        <div>
          <h2>{title}</h2>
          <p>{note}</p>
          <code className="ua-op">{op}</code>
        </div>
      </header>
      <div className="cf-stage ua-stage ua-pair">{children}</div>
      <div className="ua-controls">{controls}</div>
    </article>
  );
}

function useSurface(id: string): [InteractiveChartSurface | null, (next: InteractiveChartSurface | null) => void] {
  const [surface, setSurface] = useState<InteractiveChartSurface | null>(null);
  const onSurface = useCallback((next: InteractiveChartSurface | null) => {
    setSurface(next);
    register(id, next);
  }, [id]);
  return [surface, onSurface];
}

const ignore = () => {};

/** The same updates sent to a chart with motion and to one without. */
export function WithAndWithout({ duration, renderer }: Shared) {
  const input = useMemo(() => nationChart('Bar Chart', nationRows(2000), 300), []);
  const interactions = useMemo(() => [clickHighlight(), dragReorder()], []);
  const [off, onOff] = useSurface('compare-off');
  const [on, onOn] = useSurface('compare-on');
  const both = (update: ChartUpdate) => { for (const surface of [off, on]) if (surface) void surface.applyUpdate(update); };
  const latest = nationRows(2024);
  return (
    <PairCard
      id="compare"
      title="With and without"
      note="Both charts get the same updates. On the left every change jumps, so the eye has to find each country again; on the right each bar is seen to become itself."
      op="the same ChartUpdate, transition 0 and default"
      controls={(
        <>
          <button type="button" onClick={() => both({ id: 'data', ops: [{ op: 'set-data', source: 'main', value: { rows: nationRows(2000) } }] })}>2000</button>
          <button type="button" onClick={() => both({ id: 'data', ops: [{ op: 'set-data', source: 'main', value: { rows: latest } }] })}>2024</button>
          <button type="button" onClick={() => both({ id: 'order', ops: [{ op: 'set-order', scope: 'category', field: 'Country', values: byValue(latest) }] })}>Sort</button>
          <button type="button" onClick={() => { for (const surface of [off, on]) void surface?.clearUpdate('order'); }}>Unsort</button>
        </>
      )}
    >
      <figure className="ua-pair-cell">
        <figcaption>No motion</figcaption>
        <CaseChart input={input} interactions={interactions} duration={0} renderer={renderer} onSurface={onOff} onChange={ignore} />
      </figure>
      <figure className="ua-pair-cell">
        <figcaption>Flint default</figcaption>
        <CaseChart input={input} interactions={interactions} duration={duration} renderer={renderer} onSurface={onOn} onChange={ignore} />
      </figure>
    </PairCard>
  );
}

/** Counts the animation frames in which the card's chart changed, until it has been still for a while. */
function countFrames(id: string, settle: number): Promise<number> {
  const root = document.querySelector(`[data-case="${id}"] .ua-mount`);
  if (!root) return Promise.resolve(0);
  return new Promise((resolve) => {
    let frames = 0;
    let dirty = false;
    let last = performance.now();
    const observer = new MutationObserver(() => { dirty = true; });
    observer.observe(root, { subtree: true, attributes: true, childList: true, characterData: true });
    const tick = () => {
      if (dirty) { frames += 1; dirty = false; last = performance.now(); }
      if (performance.now() - last > settle) {
        observer.disconnect();
        resolve(frames);
        return;
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/** A change that overtakes one in flight, and a change the chart already shows. */
export function InterruptAndRepeat({ duration, renderer }: Shared) {
  const input = useMemo(() => nationChart('Bar Chart', nationRows(2000), 300), []);
  const interactions = useMemo(() => [clickHighlight()], []);
  const shown = useRef(2000);
  const [readout, setReadout] = useState('');
  const send = (surface: InteractiveChartSurface, year: number) => {
    shown.current = year;
    void surface.applyUpdate({ id: 'data', ops: [{ op: 'set-data', source: 'main', value: { rows: nationRows(year) } }] });
  };
  const measure = (label: string) => {
    void countFrames('interrupt', 250).then((frames) => setReadout(`${label}: ${frames} frame${frames === 1 ? '' : 's'} drawn`));
  };
  return (
    <Case
      id="interrupt"
      title="Turn back mid-flight, repeat for free"
      op="set-data, interrupted and repeated"
      note="Turn back sends 2024 and, a third of the way through, 2000 again: the bars reverse from where they are, never from a jump. Same again resends the year on screen and draws nothing."
      input={input}
      interactions={interactions}
      duration={duration}
      renderer={renderer}
      controls={(surface) => (
        <>
          <button type="button" onClick={() => { measure('2000'); send(surface, 2000); }}>2000</button>
          <button type="button" onClick={() => { measure('2024'); send(surface, 2024); }}>2024</button>
          <button type="button" onClick={async () => { measure('Turn back'); send(surface, 2024); await wait(Math.max(60, duration / 3)); send(surface, 2000); }}>Turn back</button>
          <button type="button" onClick={() => { measure('Same again'); send(surface, shown.current); }}>Same again</button>
          <span className="ua-readout">{readout}</span>
        </>
      )}
    />
  );
}

const MONTH_LIST = Array.from({ length: 12 }, (_, index) => `2025-${String(index + 1).padStart(2, '0')}-01`);
const REGION_SALES = ['North', 'South', 'East', 'West'];
const regionTotals = REGION_SALES.map((Region, at) => ({ Region, Sales: [186, 142, 171, 120][at] }));
const regionMonths = MONTH_LIST.flatMap((Month, index) => REGION_SALES.map((Region, at) => ({
  Month, Region, Sales: Math.round(10 + at * 2 + 4 * Math.sin(index / 2 + at) + index * (0.4 + at * 0.1)),
})));

/** A click on one chart is a commit on both, so both ease. */
export function LinkedPair({ duration, renderer }: Shared) {
  const bars = useMemo(() => chart('Bar Chart', 'Sales by region', regionTotals, { Region: 'Category', Sales: 'Amount' }, { x: 'Region', y: 'Sales', color: 'Region' }, 240, 200), []);
  const lines = useMemo(() => chart('Line Chart', 'Monthly sales', regionMonths, { Month: 'Date', Region: 'Category', Sales: 'Amount' }, { x: 'Month', y: 'Sales', color: 'Region' }, 300, 200), []);
  const barInteractions = useMemo(() => [clickHighlight()], []);
  const lineInteractions = useMemo(() => [clickHighlight()], []);
  const [barSurface, onBars] = useSurface('linked-bars');
  const [lineSurface, onLines] = useSurface('linked-line');
  const link = useRef<ReturnType<typeof linkCharts> | null>(null);
  useEffect(() => {
    if (!barSurface || !lineSurface) return undefined;
    const charts = linkCharts({ bars: { input: bars, surface: barSurface }, lines: { input: lines, surface: lineSurface } }, { fields: ['Region'] });
    link.current = charts;
    return () => { charts.destroy(); link.current = null; };
  }, [barSurface, lineSurface, bars, lines]);
  return (
    <PairCard
      id="linked"
      title="Linked charts move together"
      note="Click a bar or a line. The selection is a commit on both charts, so the other chart eases to it in the same beat."
      op="linkCharts → set-style on each chart"
      controls={(
        <>
          <button type="button" onClick={() => void link.current?.select({ Region: { in: ['East'] } })}>Select East</button>
          <button type="button" onClick={() => link.current?.clear()}>Clear</button>
        </>
      )}
    >
      <CaseChart input={bars} interactions={barInteractions} duration={duration} renderer={renderer} onSurface={onBars} onChange={ignore} />
      <CaseChart input={lines} interactions={lineInteractions} duration={duration} renderer={renderer} onSurface={onLines} onChange={ignore} />
    </PairCard>
  );
}

/** Who decides how long a change takes: the call, then the interaction, then the chart. */
export function DurationPrecedence({ duration, renderer }: Shared) {
  const input = useMemo(() => nationChart('Bar Chart', nationRows(2024), 300), []);
  const interactions = useMemo(() => [clickHighlight({ transition: { duration: 1200 } }), dragReorder()], []);
  const sorted = byValue(nationRows(2024));
  const sort = (surface: InteractiveChartSurface, values: readonly unknown[], transition?: { duration: number }) =>
    void surface.applyUpdate({ id: 'order', ops: [{ op: 'set-order', scope: 'category', field: 'Country', values }] }, transition ? { transition } : undefined);
  return (
    <Case
      id="durations"
      title="Who sets the duration"
      op="transition: call › interaction › chart › 300 ms"
      note="The chart takes the page's setting. Its click highlight asks for 1.2 s, so a click eases slowly. A call can set its own: the last two sort in 1.2 s and at once. Reduced motion turns all of it off."
      input={input}
      interactions={interactions}
      duration={duration}
      renderer={renderer}
      controls={(surface) => (
        <>
          <button type="button" onClick={() => sort(surface, sorted)}>Sort (chart)</button>
          <button type="button" onClick={() => sort(surface, [...sorted].reverse(), { duration: 1200 })}>Reverse in 1.2 s (call)</button>
          <button type="button" onClick={() => sort(surface, sorted, { duration: 0 })}>Sort at once (call)</button>
        </>
      )}
    />
  );
}

const SHARES = [{ Source: 'Wind', Share: 38 }, { Source: 'Solar', Share: 29 }, { Source: 'Hydro', Share: 19 }, { Source: 'Gas', Share: 14 }];

/** Pie to bars is not a transition Flint lists, and a theme is style, so both cross-fade. */
export function CrossFade({ duration, renderer }: Shared) {
  const pie = useMemo(() => chart('Pie Chart', 'Electricity by source, 2025', SHARES, { Source: 'Category', Share: 'Percentage' }, { color: 'Source', size: 'Share' }, 240, 200), []);
  const bars = useMemo(() => chart('Bar Chart', 'Electricity by source, 2025', SHARES, { Source: 'Category', Share: 'Percentage' }, { x: 'Source', y: 'Share', color: 'Source' }, 240, 200), []);
  const themed = useMemo(() => ({ ...pie, theme_spec: 'economist' }), [pie]);
  const interactions = useMemo(() => [clickHighlight()], []);
  return (
    <Case
      id="crossfade"
      title="A pie becomes bars; a theme changes"
      op="setInput · cross-fade"
      note="Pie to bars is not a transition Flint lists: a wedge has no honest path to a bar, so the two charts cross-fade. A new theme changes style, not meaning, so it cross-fades too."
      input={pie}
      interactions={interactions}
      duration={duration}
      renderer={renderer}
      controls={(surface) => (
        <>
          <button type="button" onClick={() => void surface.setInput(bars)}>Bars</button>
          <button type="button" onClick={() => void surface.setInput(pie)}>Pie</button>
          <button type="button" onClick={() => void surface.setInput(themed)}>Pie, Economist theme</button>
        </>
      )}
    />
  );
}
