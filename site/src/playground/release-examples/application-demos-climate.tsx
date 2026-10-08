import { useCallback, useMemo, useRef, useState } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import {
  brushX,
  clickHighlight,
  externalInteraction,
  type ChartChange,
  type ChartUpdate,
  type InteractionDef,
} from 'flint-chart/interactive';
import { FlintChart, type FlintChartHandle } from 'flint-chart/react';
import { expressionInterpreter } from 'vega-interpreter';
import gistemp from '../../data/gistemp-monthly.json';

/*
 * A century and a half of global temperature as one bar per year, read two
 * ways. A click on a year opens its twelve months on the second chart; a
 * brush across years averages them month by month as the reference line the
 * year is read against. Both are read from the retained layers of the first
 * chart's state, so a reset there resets the second chart too.
 */

const STRIPES_ID = 'app-demo-warming-years';
const MONTHS_ID = 'app-demo-warming-months';
const YEAR_ID = 'year';
const SPAN_ID = 'span';
const SHOW_ID = 'show';
const ANOMALY = 'Anomaly (°C)';
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const BASELINE: [number, number] = [1951, 1980];

type YearRow = { year: number; annual: number | null; months: (number | null)[] };
const YEARS: readonly YearRow[] = gistemp.years;
const COMPLETE = YEARS.filter((row) => row.annual !== null);
const LATEST = COMPLETE[COMPLETE.length - 1].year;
const DEFAULT_YEAR = LATEST;

const STRIPES_SPEC = {
  data: { values: COMPLETE.map((row) => ({ Year: String(row.year), [ANOMALY]: row.annual })) },
  semantic_types: {
    Year: 'Year',
    [ANOMALY]: { semanticType: 'Quantity', divergingMidpoint: 0, intrinsicDomain: [-1.3, 1.3], unit: '°C' },
  },
  chart_spec: {
    chartType: 'Bar Chart',
    title: `Global temperature, ${COMPLETE[0].year}–${LATEST}`,
    subtitle: 'Annual anomaly in °C against the 1951–1980 mean. Click a year; drag across years for a reference period.',
    encodings: { x: 'Year', y: ANOMALY, color: ANOMALY },
    baseSize: { width: 900, height: 300 },
  },
} as ChartAssemblyInput;

const REFERENCE = 'Reference period';
const PICKED = 'Selected year';

/** Month by month: the mean over `span` as the reference, and the picked year. The series names are fixed so the colour domain, pinned at mount, never moves. */
function monthRows(year: number, span: [number, number]): Record<string, unknown>[] {
  const inSpan = YEARS.filter((row) => row.year >= span[0] && row.year <= span[1]);
  const reference = MONTHS.flatMap((Month, index) => {
    const values = inSpan.map((row) => row.months[index]).filter((value): value is number => value !== null);
    return values.length > 0 ? [{ Series: REFERENCE, Month, [ANOMALY]: Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 1000) / 1000 }] : [];
  });
  const picked = YEARS.find((row) => row.year === year);
  const months = MONTHS.flatMap((Month, index) => {
    const value = picked?.months[index] ?? null;
    return value === null ? [] : [{ Series: PICKED, Month, [ANOMALY]: value }];
  });
  return [...reference, ...months];
}

/** The two lines named at their right ends: the span of the reference and the year. */
function labelOps(year: number, span: [number, number], rows: readonly Record<string, unknown>[]): ChartUpdate['ops'] {
  const last = (series: string) => [...rows].reverse().find((row) => row.Series === series);
  const values = [
    { series: REFERENCE, text: span[0] === span[1] ? String(span[0]) : `${span[0]}–${span[1]} mean` },
    { series: PICKED, text: String(year) },
  ].flatMap(({ series, text }) => {
    const row = last(series);
    return row ? [{ Series: series, Month: row.Month, [ANOMALY]: row[ANOMALY], Label: text }] : [];
  });
  return [{
    op: 'set-overlay',
    name: 'labels',
    value: {
      mark: 'text',
      role: 'series-label',
      data: { values },
      encodings: { x: { field: 'Month' }, y: { field: ANOMALY }, color: { field: 'Series' }, text: { field: 'Label' } },
      style: { dy: -9, textAlign: 'end', fontSize: 11, fontWeight: 'bold' },
    },
  }];
}

const MOUNT_LABELS: readonly ChartUpdate[] = [{ id: SHOW_ID, ops: labelOps(DEFAULT_YEAR, BASELINE, monthRows(DEFAULT_YEAR, BASELINE)) }];

const MONTHS_SPEC = {
  data: { values: monthRows(DEFAULT_YEAR, BASELINE) },
  semantic_types: {
    Series: 'Category',
    Month: 'Month',
    [ANOMALY]: { semanticType: 'Quantity', intrinsicDomain: [-0.8, 1.8], unit: '°C' },
  },
  chart_spec: {
    chartType: 'Line Chart',
    title: 'The year, month by month',
    subtitle: 'The selected year against the monthly mean of the reference period',
    encodings: { x: 'Month', y: ANOMALY, color: 'Series' },
    baseSize: { width: 900, height: 280 },
  },
  theme_spec: { ink: { series: { categorical: ['#8a9096', '#c93135'] } }, legend: { show: 'never' } },
} as ChartAssemblyInput;

const STRIPES_INTERACTIONS: readonly InteractionDef[] = [
  brushX({ id: SPAN_ID, mode: 'stateful', dimOpacity: 0.3 }),
  clickHighlight({ id: YEAR_ID, targets: ['mark'], dimOpacity: 0.3 }),
];

const MONTHS_INTERACTIONS: readonly InteractionDef[] = [
  externalInteraction<{ year: number; span: [number, number] }>({
    id: SHOW_ID,
    handle: ({ year, span }) => {
      const rows = monthRows(year, span);
      return { id: SHOW_ID, ops: [{ op: 'set-data', source: 'main', value: { rows } }, ...labelOps(year, span, rows)] };
    },
  }),
];

/** The years a retained layer holds, read from each element's value: the year as a string, or as a time. */
function yearsIn(change: ChartChange, id: string): number[] {
  const entry = change.state.entries?.get(id);
  if (!entry || entry.layer !== 'retained') return [];
  return entry.elements.flatMap((element) => {
    const value = (element.value as { Year?: unknown }).Year;
    if (typeof value === 'string' && /^\d{4}$/.test(value)) return [Number(value)];
    const ms = value instanceof Date ? value.getTime() : typeof value === 'number' ? value : Date.parse(String(value));
    return Number.isFinite(ms) ? [new Date(ms).getUTCFullYear()] : [];
  });
}

export function WarmingStripesDemo() {
  const months = useRef<FlintChartHandle>(null);
  const [year, setYear] = useState(DEFAULT_YEAR);
  const [span, setSpan] = useState<[number, number]>(BASELINE);

  const onStripesChange = useCallback((change: ChartChange) => {
    if (change.phase !== 'commit') return;
    const picked = yearsIn(change, YEAR_ID)[0] ?? DEFAULT_YEAR;
    const brushed = yearsIn(change, SPAN_ID);
    const nextSpan: [number, number] = brushed.length > 0 ? [Math.min(...brushed), Math.max(...brushed)] : BASELINE;
    setYear(picked);
    setSpan(nextSpan);
    void months.current?.dispatch(SHOW_ID, { year: picked, span: nextSpan }).then((result) => {
      if (result && result.status !== 'applied') console.warn(`${MONTHS_ID}: ${result.status}`, result);
    });
  }, []);
  const status = useMemo(() => {
    const row = YEARS.find((entry) => entry.year === year);
    const reference = span[0] === BASELINE[0] && span[1] === BASELINE[1] ? 'the 1951–1980 baseline' : `the ${span[0]}–${span[1]} mean`;
    const annual = row?.annual === null || row?.annual === undefined ? '' : ` ${year} averaged ${row.annual > 0 ? '+' : ''}${row.annual.toFixed(2)} °C.`;
    return `Showing ${year} against ${reference}.${annual} Click another year, drag across years to change the reference, or press Escape to return to the baseline.`;
  }, [span, year]);

  return <div className="app-demo-stack">
    <p className="it-detail-note app-demo-year-note">{status}</p>
    <div className="app-demo-box app-demo-stack-chart">
      <FlintChart
        spec={STRIPES_SPEC}
        interactions={STRIPES_INTERACTIONS}
        chartId={STRIPES_ID}
        ariaLabel="Global temperature anomaly by year"
        renderer="svg" expressionInterpreter={expressionInterpreter} className="it-chart-mount" width="100%"
        onChange={onStripesChange}
      />
    </div>
    <div className="app-demo-box app-demo-stack-chart">
      <FlintChart
        ref={months}
        spec={MONTHS_SPEC}
        interactions={MONTHS_INTERACTIONS}
        updates={MOUNT_LABELS}
        chartId={MONTHS_ID}
        ariaLabel="Monthly anomalies of the picked year against the reference period"
        renderer="svg" expressionInterpreter={expressionInterpreter} className="it-chart-mount" width="100%"
      />
    </div>
  </div>;
}
