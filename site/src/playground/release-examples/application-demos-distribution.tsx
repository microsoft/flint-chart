import { useCallback, useMemo, useRef, useState } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import {
  dragTrigger,
  externalInteraction,
  type CanvasInteractionDef,
  type ChartUpdate,
  type InteractionDef,
} from 'flint-chart/interactive';
import { FlintChart, type FlintChartHandle } from 'flint-chart/react';
import { expressionInterpreter } from 'vega-interpreter';
import faithful from '../../data/old-faithful.json';
import { DemoColumns } from './application-demos-layout';

/*
 * A belief the reader draws. The bars start as a plausible guess at how long
 * Old Faithful makes you wait, with a handle on each bar's top and a line
 * through the handles so the sketch reads as a curve. A drag from a handle or
 * a bar sets every bin the pointer crosses to the pointer's height, and the
 * host reads the sketch back as a mean, a spread, a peak, and a share under
 * an hour. The handles and the line are overlays that carry the bar rows
 * themselves, so a drag that starts on a handle resolves to the bar beneath
 * it. Reveal draws the real month as faded bars through the chart's own band
 * scale, where a band's left edge is the bin's lower edge, so the sketch and
 * the data share one frame.
 */

type Row = { Minutes: number; Eruptions: number };

const CHART_ID = 'app-demo-distribution';
const SKETCH_ID = 'sketch';
const RESET_ID = 'reset';
const REVEAL_ID = 'reveal';
const MIN = 'Minutes';
const COUNT = 'Eruptions';
const FIRST = 40;
const WIDTH = 5;
const BINS = 13;
const Y_MAX = 70;
const HOUR = 60;
const DATA_INK = '#d1495b';
const SKETCH_INK = '#1f2328';
const HANDLE_RADIUS = 12;

const binValue = (bin: number) => FIRST + bin * WIDTH;
const centre = (row: Row) => row[MIN] + WIDTH / 2;
const SQRT_2PI = Math.sqrt(2 * Math.PI);
const normalPdf = (x: number, mean: number, sd: number) => Math.exp(-((x - mean) ** 2) / (2 * sd * sd)) / (sd * SQRT_2PI);

const DATA: readonly Row[] = (() => {
  const counts = new Array<number>(BINS).fill(0);
  for (const { waiting } of faithful.rows) {
    const bin = Math.floor((waiting - FIRST) / WIDTH);
    if (bin >= 0 && bin < BINS) counts[bin] += 1;
  }
  return counts.map((count, bin) => ({ [MIN]: binValue(bin), [COUNT]: count }));
})();
const TOTAL = DATA.reduce((sum, row) => sum + row[COUNT], 0);

/** A single hump around seventy minutes: the shape most people expect, and a shape worth correcting. */
const GUESS: readonly Row[] = (() => {
  const weights = DATA.map((row) => normalPdf(centre(row), 72, 9));
  const sum = weights.reduce((total, weight) => total + weight, 0);
  return weights.map((weight, bin) => ({ [MIN]: binValue(bin), [COUNT]: Math.round((TOTAL * weight) / sum) }));
})();

type Reading = { n: number; mean: number; sd: number; underHour: number; peak: number; shortest: number; longest: number };

function readingOf(rows: readonly Row[]): Reading {
  const n = rows.reduce((sum, row) => sum + row[COUNT], 0) || 1;
  const weighted = (value: (row: Row) => number) => rows.reduce((sum, row) => sum + row[COUNT] * value(row), 0) / n;
  const mean = weighted(centre);
  const sd = Math.sqrt(weighted((row) => (centre(row) - mean) ** 2)) || WIDTH / 2;
  const underHour = rows.filter((row) => row[MIN] < HOUR).reduce((sum, row) => sum + row[COUNT], 0) / n;
  const peak = rows.reduce((best, row) => (row[COUNT] > best[COUNT] ? row : best))[MIN];
  const filled = rows.filter((row) => row[COUNT] > 0);
  const shortest = filled.length > 0 ? filled[0][MIN] : FIRST;
  const longest = filled.length > 0 ? filled[filled.length - 1][MIN] : FIRST;
  return { n, mean, sd, underHour, peak, shortest, longest };
}

const DATA_READING = readingOf(DATA);

type Cue =
  | { kind: 'hint' }
  | { kind: 'active'; bin: number }
  | { kind: 'none' };

/**
 * The reader's sketch: the bars, a line through their tops, and a knob on each.
 * Before the first edit the peak knob says "Drag"; during a drag the knob under
 * the pointer grows and names its count.
 */
function sketchUpdate(rows: readonly Row[], cue: Cue = { kind: 'none' }): ChartUpdate {
  const values = rows.map((row) => ({ ...row }));
  const encodings = { x: { field: MIN }, y: { field: COUNT } };
  const peak = values.reduce((best, row) => (row[COUNT] > best[COUNT] ? row : best));
  const cued = cue.kind === 'active' ? [values[cue.bin]] : cue.kind === 'hint' ? [peak] : [];
  const label = cue.kind === 'active' ? String(values[cue.bin][COUNT]) : cue.kind === 'hint' ? 'Drag' : '';
  return {
    id: SKETCH_ID,
    ops: [
      { op: 'set-data', source: 'main', value: { rows: values } },
      {
        op: 'set-overlay',
        name: 'curve',
        value: {
          mark: 'line',
          role: 'sketch',
          data: { values },
          encodings,
          style: { stroke: SKETCH_INK, strokeWidth: 1.5, opacity: 0.8 },
        },
      },
      {
        op: 'set-overlay',
        name: 'handles',
        value: {
          mark: 'point',
          role: 'handle',
          data: { values },
          encodings,
          style: { fill: SKETCH_INK, stroke: '#ffffff', strokeWidth: 2, pointRadius: 6 },
        },
      },
      {
        op: 'set-overlay',
        name: 'active',
        value: cued.length > 0
          ? {
            mark: 'point',
            role: 'handle',
            data: { values: cued },
            encodings,
            style: { fill: SKETCH_INK, stroke: '#ffffff', strokeWidth: 2.5, pointRadius: 9 },
          }
          : null,
      },
      {
        op: 'set-overlay',
        name: 'handle-label',
        value: cued.length > 0
          ? {
            mark: 'text',
            role: 'handle-label',
            data: { values: cued.map((row) => ({ ...row, label })) },
            encodings: { ...encodings, text: { field: 'label' } },
            style: { fill: SKETCH_INK, fontSize: 11, fontWeight: 'bold', textAlign: 'middle', dy: -15 },
          }
          : null,
      },
    ],
  };
}

/** The real month as faded bars behind the sketch; each rect runs from its band's left edge to the next band's. */
const revealUpdate = (shown: boolean): ChartUpdate => ({
  id: REVEAL_ID,
  ops: [{
    op: 'set-overlay',
    name: 'data',
    value: shown
      ? {
        mark: 'rect',
        role: 'reference',
        data: { values: DATA.slice(0, -1).map((row) => ({ x: row[MIN], x2: row[MIN] + WIDTH, y: row[COUNT], y2: 0 })) },
        encodings: { x: { field: 'x' }, x2: { field: 'x2' }, y: { field: 'y' }, y2: { field: 'y2' } },
        style: { fill: DATA_INK, fillOpacity: 0.35, stroke: DATA_INK, strokeWidth: 1 },
      }
      : null,
  }],
});

/** The data is retained before the sketch so its bars draw beneath the sketch's line and handles. */
const MOUNT: readonly ChartUpdate[] = [revealUpdate(false), sketchUpdate(GUESS, { kind: 'hint' })];

const SPEC = {
  data: { values: GUESS.map((row) => ({ ...row })) },
  semantic_types: {
    [MIN]: { semanticType: 'Quantity', intrinsicDomain: [FIRST, FIRST + BINS * WIDTH], unit: 'min' },
    [COUNT]: { semanticType: 'Count', intrinsicDomain: [0, Y_MAX] },
  },
  options: { addTooltips: false },
  chart_spec: {
    chartType: 'Bar Chart',
    title: 'How long until Old Faithful erupts again?',
    subtitle: `Minutes between eruptions, in five-minute bins.`,
    encodings: { x: { field: MIN, type: 'ordinal' }, y: COUNT },
    baseSize: { width: 440, height: 380 },
  },
} as ChartAssemblyInput;

const clamp = (value: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, value));

function binOf(value: unknown): number | undefined {
  const bin = Math.round((Number(value) - FIRST) / WIDTH);
  return Number.isFinite(bin) && bin >= 0 && bin < BINS ? bin : undefined;
}

function countOf(coordinate: { kind: string; value?: unknown } | undefined): number | undefined {
  const value = coordinate?.kind === 'value' ? Number(coordinate.value) : NaN;
  return Number.isFinite(value) ? Math.round(clamp(value, 0, Y_MAX)) : undefined;
}

const minutes = (value: number) => `${Math.round(value)} min`;
const percent = (value: number) => `${Math.round(value * 100)}%`;

export function FitDistributionDemo() {
  const chart = useRef<FlintChartHandle>(null);
  const rowsRef = useRef<Row[]>(GUESS.map((row) => ({ ...row })));
  const last = useRef<{ bin: number; count: number } | null>(null);
  const [rows, setRows] = useState<readonly Row[]>(rowsRef.current);
  const [revealed, setRevealed] = useState(false);

  const apply = useCallback((next: Row[], cue?: Cue): ChartUpdate => {
    rowsRef.current = next;
    setRows(next);
    return sketchUpdate(next, cue);
  }, []);

  const interactions = useMemo<readonly InteractionDef[]>(() => {
    const sketch: CanvasInteractionDef = {
      id: SKETCH_ID,
      eventSource: dragTrigger(HANDLE_RADIUS),
      affordances: { mark: { cursor: 'drag', hover: 'target' } },
      handle(event) {
        if (event.action !== 'drag') return null;
        if (event.phase === 'start') {
          const value = event.target?.elements[0]?.value as Partial<Record<string, unknown>> | undefined;
          const bin = binOf(value?.[MIN]);
          last.current = bin === undefined ? null : { bin, count: rowsRef.current[bin][COUNT] };
          return bin === undefined ? null : apply(rowsRef.current, { kind: 'active', bin });
        }
        if (event.phase === 'cancel') {
          last.current = null;
          return apply(rowsRef.current);
        }
        const previous = last.current;
        const count = countOf(event.geometry.domain?.y);
        if (!previous || count === undefined) return null;
        const bin = binOf(event.geometry.domain?.x?.kind === 'value' ? event.geometry.domain.x.value : undefined) ?? previous.bin;
        const next = rowsRef.current.map((row) => ({ ...row }));
        const span = bin - previous.bin;
        for (let step = 0; step <= Math.abs(span); step += 1) {
          const at = previous.bin + Math.sign(span) * step;
          const t = span === 0 ? 1 : step / Math.abs(span);
          next[at][COUNT] = Math.round(previous.count + (count - previous.count) * t);
        }
        last.current = event.phase === 'commit' ? null : { bin, count };
        return apply(next, event.phase === 'commit' ? undefined : { kind: 'active', bin });
      },
    };
    const reset = externalInteraction<Record<string, never>>({
      id: RESET_ID,
      handle: () => apply(GUESS.map((row) => ({ ...row })), { kind: 'hint' }),
    });
    const reveal = externalInteraction<{ shown: boolean }>({
      id: REVEAL_ID,
      handle: ({ shown }) => revealUpdate(shown),
    });
    return [sketch, reset, reveal];
  }, [apply]);

  const send = (id: string, payload: object) => {
    void chart.current?.dispatch(id, payload).then((result) => {
      if (result && result.status !== 'applied') console.warn(`${CHART_ID}: ${result.status}`, result);
    });
  };
  const toggleReveal = () => {
    send(REVEAL_ID, { shown: !revealed });
    setRevealed(!revealed);
  };

  const guess = readingOf(rows);
  const edited = rows.some((row, i) => row[COUNT] !== GUESS[i][COUNT]);
  const cell = (reading: Reading) => ({
    mean: minutes(reading.mean),
    sd: minutes(reading.sd),
    peak: `${reading.peak}–${reading.peak + WIDTH} min`,
    shortest: `~${reading.shortest} min`,
    longest: `~${reading.longest} min`,
    under: percent(reading.underHour),
    n: String(reading.n),
  });
  const belief = cell(guess);
  const truth = revealed ? cell(DATA_READING) : null;
  const rowsOfTable: [string, keyof typeof belief][] = [['Mean', 'mean'], ['Std. dev.', 'sd'], ['Peak', 'peak'], ['Shortest', 'shortest'], ['Longest', 'longest'], ['< 1 hour', 'under'], ['Eruptions', 'n']];

  return <DemoColumns
    panelTitle="Belief against data"
    panel={<>
      <table className="app-demo-compare">
        <thead><tr><th /><th>Your sketch</th><th>The data</th></tr></thead>
        <tbody>
          {rowsOfTable.map(([label, key]) => (
            <tr key={key}><th>{label}</th><td>{belief[key]}</td><td className={truth ? '' : 'app-demo-compare-hidden'}>{truth ? truth[key] : '?'}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="app-demo-shapes">
        <button type="button" className="app-demo-play" onClick={toggleReveal}>{revealed ? 'Hide the data' : 'Show the data'}</button>
        <button type="button" className="app-demo-play" onClick={() => send(RESET_ID, {})} disabled={!edited}>Restart</button>
      </div>
    </>}
    chart={<FlintChart
      ref={chart}
      spec={SPEC}
      interactions={interactions}
      updates={MOUNT}
      chartId={CHART_ID}
      ariaLabel="Draw the wait"
      renderer="svg" expressionInterpreter={expressionInterpreter} className="it-chart-mount" width="100%"
    />}
  />;
}
