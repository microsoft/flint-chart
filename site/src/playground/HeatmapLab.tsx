import { assembleVegaLite, getRegistryEntry, isRegistered, type ChartAssemblyInput } from 'flint-chart';
import { FlintView } from '../components/FlintView';
import './density-lab.css';

/**
 * Heatmaps along a date side: the cases a date field can arrive in (a few snapshots, a regular
 * calendar step, a step the calendar does not keep, holes, timestamps). On a time scale each cell
 * should span the period its date stands for, so the cells tile. Each caption reads the compiled spec.
 */

type Row = Record<string, unknown>;
type Side = { field: string; type: string; values: (string | number)[] };

const REGIONS = ['North', 'South', 'East', 'West', 'Central'];
const CELL = { width: 520, height: 160 };

const iso = (time: number) => new Date(time).toISOString().slice(0, 10);
const day = (y: number, m: number, d: number) => Date.UTC(y, m, d);
const monthsFrom = (y: number, m: number, count: number, every = 1) =>
  Array.from({ length: count }, (_, i) => new Date(Date.UTC(y, m + i * every, 1)).toISOString().slice(0, 7));
const dates = (n: number, from: number, stepDays: number) => Array.from({ length: n }, (_, i) => iso(from + i * stepDays * 864e5));
const monthDays = (count: number, pick: (y: number, m: number) => number) => Array.from({ length: count }, (_, i) => iso(pick(2024, i)));

/** A fixed pseudo-random stream, so the page draws the same holes every time. */
function random(seed: number) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
const drop = (values: string[], share: number, seed: number) => {
  const next = random(seed);
  return values.filter((_, i) => i === 0 || i === values.length - 1 || next() > share);
};

const YEAR_MS = 365.25 * 864e5;

/** A value as a time, where it reads as one: a bare year, epoch milliseconds, or a date string. */
function timeOf(value: string | number): number | undefined {
  if (typeof value === 'number') return value >= 1000 && value <= 2999 ? Date.UTC(value, 0, 1) : value;
  const week = value.match(/^(\d{4})-W(\d{2})$/);
  if (week) return Date.UTC(Number(week[1]), 0, 1) + (Number(week[2]) - 1) * 7 * 864e5;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : undefined;
}

/**
 * How each region's demand runs through time, so the cells show something: a seasonal swing that
 * peaks at a different time of year in each region, a growth trend in the East over the dates' span, a weekend dip in
 * daily data, a day and night cycle in hourly data, a few one-off spikes, and a little noise.
 */
const REGION_SHAPE = [
  { level: 52, swing: 30, peak: 0.55, trend: 0, weekend: -10 }, // North: hot summers
  { level: 58, swing: 10, peak: 0.05, trend: 0, weekend: -6 }, // South: mild, a winter peak
  { level: 34, swing: 12, peak: 0.6, trend: 14, weekend: -8 }, // East: growing
  { level: 50, swing: 22, peak: 0.05, trend: -3, weekend: 6 }, // West: winter peak, busy weekends
  { level: 46, swing: 16, peak: 0.35, trend: 2, weekend: -22 }, // Central: workdays
];

function demand(time: number | undefined, i: number, r: number, stepMs: number, first: number, span: number): number {
  const shape = REGION_SHAPE[r];
  const noise = (((i * 7919 + r * 104729) % 1000) / 1000 - 0.5) * 8;
  if (time === undefined) return Math.round(shape.level + 20 * Math.sin(i / 4 + r) + noise);
  const d = new Date(time);
  const ofYear = (time - Date.UTC(d.getUTCFullYear(), 0, 1)) / YEAR_MS;
  let value = shape.level + shape.swing * Math.cos(2 * Math.PI * (ofYear - shape.peak)) + 2 * shape.trend * (time - first) / span;
  if (stepMs < 2 * 864e5 && [0, 6].includes(d.getUTCDay())) value += shape.weekend;
  if (stepMs < 864e5) value += 18 * Math.cos(2 * Math.PI * (d.getUTCHours() - 15) / 24) - 6;
  if ((i * 13 + r * 5) % 23 === 0) value += 28;
  return Math.max(0, Math.round(value + noise));
}

/** Five regions down y, the date field along x. */
function heatmapInput(x: Side): ChartAssemblyInput {
  const times = x.values.map(timeOf);
  const known = times.filter((t): t is number => t !== undefined).sort((a, b) => a - b);
  const gaps = known.slice(1).map((t, i) => t - known[i]).sort((a, b) => a - b);
  const stepMs = gaps.length ? gaps[Math.floor(gaps.length / 2)] : YEAR_MS;
  const rows: Row[] = x.values.flatMap((v, i) => REGIONS.map((region, r) => ({
    [x.field]: v, region, Demand: demand(times[i], i, r, stepMs, known[0] ?? 0, Math.max(1, (known[known.length - 1] ?? 0) - (known[0] ?? 0))),
  })));
  return {
    data: { values: rows },
    semantic_types: { [x.field]: x.type, region: 'Category', Demand: 'Quantity' },
    chart_spec: { chartType: 'Heatmap', encodings: { x: x.field, y: 'region', color: { field: 'Demand', aggregate: 'sum' } }, canvasSize: CELL },
  } as ChartAssemblyInput;
}

interface Case { title: string; note: string; x: Side }

/** A field of dates (open time), as Flint reads its semantic type: not a cycle, not a duration. */
function isDateType(type: string): boolean {
  if (!isRegistered(type)) return false;
  const entry = getRegistryEntry(type);
  return entry.t0 === 'Temporal' && entry.t1 !== 'Duration' && entry.domainShape !== 'cyclic';
}

/** What the compiled spec put along x, and whether the case is a date field on bands. */
function readX(spec: ChartAssemblyInput, x: Side): { text: string; scope: 'dates on bands' | 'time scale' | 'not dates' } {
  let compiled: any;
  try { compiled = assembleVegaLite(spec); } catch (error) { return { text: `error: ${(error as Error).message}`, scope: 'not dates' }; }
  const units: any[] = [compiled, ...(compiled.layer ?? [])];
  const enc = units.map((unit) => unit.encoding?.x).find((e) => e?.field === x.field) ?? units.map((unit) => unit.encoding?.x).find(Boolean);
  if (!enc) return { text: 'no x encoding', scope: 'not dates' };
  const date = isDateType(x.type);
  const count = new Set(x.values).size;
  if (enc.type === 'ordinal' || enc.type === 'nominal') {
    return { text: `bands (${enc.type}) · ${count} values`, scope: date ? 'dates on bands' : 'not dates' };
  }
  const transforms: any[] = units.flatMap((unit) => unit.transform ?? []);
  const end = transforms.find((t) => t.as === '__cell_x_end')?.calculate as string | undefined;
  const months = end?.match(/utcOffset\('month', [^,]+, (\d+)\)/);
  const days = end?.match(/utcOffset\('day', [^,]+, (\d+)\)/);
  const ms = end?.match(/^time\([^)]*\) \+ (\d+)$/);
  const span = !end ? '' : months ? ` · each cell spans ${months[1]} month(s)` : days ? ` · each cell spans ${days[1]} day(s)`
    : ms ? ` · each cell spans ${Number(ms[1]) / 3_600_000} hour(s)` : ' · each cell runs to the next date';
  return { text: `time scale (${enc.scale?.type ?? 'time'})${span}`, scope: date ? 'time scale' : 'not dates' };
}

const SCOPE_INK = { 'dates on bands': '#9a6700', 'time scale': '#1a7f37', 'not dates': '#57606a' } as const;

function Cell({ c }: { c: Case }) {
  const spec = heatmapInput(c.x);
  const read = readX(spec, c.x);
  return (
    <figure>
      <figcaption>
        <b>{c.title}</b> <span style={{ color: SCOPE_INK[read.scope], fontWeight: 600 }}>· {read.scope}</span>
        <br />{c.note}
        <br /><i>x is {c.x.type}</i> → {read.text}
      </figcaption>
      <FlintView spec={spec} renderer="svg" showWarnings compact />
    </figure>
  );
}

/* ---------------------------------------------------------------------------------------------- */
/* Cases                                                                                           */
/* ---------------------------------------------------------------------------------------------- */

const FEW: Case[] = [
  { title: '6 months', note: 'YearMonth, 2025-01 … 2025-06: few enough to name each one.', x: { field: 'Month', type: 'YearMonth', values: monthsFrom(2025, 0, 6) } },
  { title: 'Two snapshots', note: 'YearMonth, 2025-07 and 2025-12.', x: { field: 'Month', type: 'YearMonth', values: ['2025-07', '2025-12'] } },
  { title: '5 years', note: 'Year, 2020 … 2024.', x: { field: 'Year', type: 'Year', values: [2020, 2021, 2022, 2023, 2024] } },
  { title: '8 quarter ends', note: 'Date, 2023-03-31 … 2024-12-31.', x: { field: 'Date', type: 'Date', values: Array.from({ length: 8 }, (_, i) => iso(day(2023, 3 * i + 3, 0))) } },
];

const REGULAR: Case[] = [
  { title: '12 months', note: 'YearMonth, 2025-01 … 2025-12.', x: { field: 'Month', type: 'YearMonth', values: monthsFrom(2025, 0, 12) } },
  { title: '60 months', note: 'YearMonth, five years of months.', x: { field: 'Month', type: 'YearMonth', values: monthsFrom(2021, 0, 60) } },
  { title: 'Quarters, 6 years', note: 'Date, the first day of each quarter.', x: { field: 'Quarter', type: 'Date', values: monthsFrom(2019, 0, 24, 3).map((m) => `${m}-01`) } },
  { title: '26 weeks', note: 'Date, every Monday from 2024-01-01.', x: { field: 'Week', type: 'Date', values: dates(26, day(2024, 0, 1), 7) } },
  { title: '52 weeks, as dates', note: 'YearWeek, every Monday of 2024 written as a date.', x: { field: 'Week', type: 'YearWeek', values: dates(52, day(2024, 0, 1), 7) } },
  { title: '52 weeks, as week names', note: 'YearWeek, 2024-W01 … 2024-W52.', x: { field: 'Week', type: 'YearWeek', values: Array.from({ length: 52 }, (_, i) => `2024-W${String(i + 1).padStart(2, '0')}`) } },
  { title: '90 days', note: 'Date, every day from 2024-01-01.', x: { field: 'Day', type: 'Date', values: dates(90, day(2024, 0, 1), 1) } },
  { title: '25 years', note: 'Year, 2000 … 2024.', x: { field: 'Year', type: 'Year', values: Array.from({ length: 25 }, (_, i) => 2000 + i) } },
];

const OFF_CALENDAR: Case[] = [
  { title: 'The 5th of each month', note: 'Date, 2024-01-05, 2024-02-05, …', x: { field: 'Date', type: 'Date', values: monthDays(24, (y, m) => day(y, m, 5)) } },
  { title: 'Month ends', note: 'Date, 2024-01-31, 2024-02-29, …: 28 to 31 days apart.', x: { field: 'Date', type: 'Date', values: monthDays(24, (y, m) => day(y, m + 1, 0)) } },
  { title: 'Twice a month', note: 'Date, the 1st and 15th: 14 to 17 days apart.', x: { field: 'Date', type: 'Date', values: monthDays(12, (y, m) => day(y, m, 1)).flatMap((d) => [d, `${d.slice(0, 8)}15`]) } },
  {
    title: 'Every 13 or 14 days', note: 'Date, 80 dates over three years (gallery case "Temporal × Nominal, 80×5").',
    x: { field: 'Date', type: 'Date', values: Array.from({ length: 80 }, (_, i) => iso(day(2016, 0, 1) + Math.floor(i * (365 * 3 / 80)) * 864e5)) },
  },
  { title: 'About every 45 days', note: 'Date, 24 dates: 2020-01-01, 02-15, 04-01, … (theme lab "Shipments over time").', x: { field: 'Date', type: 'Date', values: Array.from({ length: 24 }, (_, i) => iso(day(2020, 0, 1) + Math.floor(i * (1049 / 23)) * 864e5)) } },
  { title: 'Trading days', note: 'Date, weekdays only for 8 weeks.', x: { field: 'Date', type: 'Date', values: dates(56, day(2024, 0, 1), 1).filter((d) => ![0, 6].includes(new Date(d).getUTCDay())) } },
];

const IRREGULAR: Case[] = [
  { title: '36 months, some missing', note: 'YearMonth, about one month in six missing.', x: { field: 'Month', type: 'YearMonth', values: drop(monthsFrom(2022, 0, 36), 0.18, 7) } },
  { title: '90 days, some missing', note: 'Date, about one day in four missing.', x: { field: 'Day', type: 'Date', values: drop(dates(90, day(2024, 0, 1), 1), 0.25, 11) } },
  {
    title: '40 dates at random', note: 'Date, 40 days drawn at random from two years.',
    x: { field: 'Date', type: 'Date', values: (() => { const next = random(23); return [...new Set(Array.from({ length: 40 }, () => iso(day(2023, 0, 1) + Math.floor(next() * 730) * 864e5)))].sort(); })() },
  },
  {
    title: 'Clustered events', note: 'Date, bursts of a few days each, months apart.',
    x: { field: 'Date', type: 'Date', values: [[2023, 1, 3], [2023, 1, 4], [2023, 1, 6], [2023, 4, 20], [2023, 4, 21], [2023, 8, 1], [2023, 8, 2], [2023, 8, 3], [2023, 8, 8], [2024, 0, 15], [2024, 0, 16], [2024, 5, 30]].map(([y, m, d]) => iso(day(y, m, d))) },
  },
];

const TIMESTAMPS: Case[] = [
  { title: 'Hourly readings', note: 'DateTime, 2024-03-01T00:00:00Z … 47 hours on.', x: { field: 'Time', type: 'DateTime', values: Array.from({ length: 48 }, (_, i) => new Date(day(2024, 2, 1) + i * 36e5).toISOString()) } },
  { title: 'Daily at 09:30', note: 'DateTime, 2024-01-01T09:30:00Z, the next day at 09:30, …', x: { field: 'Time', type: 'DateTime', values: Array.from({ length: 60 }, (_, i) => new Date(day(2024, 0, 1) + i * 864e5 + 9.5 * 36e5).toISOString()) } },
  { title: 'Month ends as timestamps', note: 'DateTime, 2024-01-31T23:59:59Z, …', x: { field: 'Time', type: 'DateTime', values: Array.from({ length: 30 }, (_, i) => new Date(day(2024, i + 1, 1) - 1000).toISOString()) } },
  { title: 'Quarters as epoch milliseconds', note: 'Date, numbers: 1546300800000 (2019-01-01), …', x: { field: 'Time', type: 'Date', values: Array.from({ length: 24 }, (_, i) => day(2019, i * 3, 1)) } },
];

const SECTIONS: { title: string; text: string; cases: Case[] }[] = [
  { title: '1. A few dates', text: 'Eight or fewer dates are named one cell each, whatever their step.', cases: FEW },
  { title: '2. Dates on a regular calendar step', text: 'Every month, quarter, week, day or year, none missing.', cases: REGULAR },
  { title: '3. Regular dates the calendar does not step evenly', text: 'One date per period off its first day, or a step in days that drifts against the calendar.', cases: OFF_CALENDAR },
  { title: '4. Irregular dates, with holes', text: 'Dates missing at random, or drawn at random.', cases: IRREGULAR },
  { title: '5. Timestamps', text: 'The same steps as times of day or epoch milliseconds: the period is read from the values, not the type.', cases: TIMESTAMPS },
];

export function HeatmapLab() {
  return (
    <div className="dev-page dl-page">
      <header className="dev-page-heading dl-heading">
        <h1>Heatmaps along a date side</h1>
        <p>
          Five regions down y, a date field along x. The axis type follows the semantic type: a date field is drawn on a time
          scale where its values keep a step, each cell spanning the period its date stands for, or as one cell per date where
          they are few or keep none. Each caption names the semantic type and what the compiled Vega-Lite drew.
        </p>
      </header>
      {SECTIONS.map((section) => (
        <section key={section.title} className="dl-block">
          <h2>{section.title}</h2>
          <p className="dl-text">{section.text}</p>
          <div className="dl-cells">
            {section.cases.map((c) => <Cell key={c.title} c={c} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
