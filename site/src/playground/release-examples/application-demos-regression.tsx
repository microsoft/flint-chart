import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { DemoColumns } from './application-demos-layout';

/*
 * Visual belief elicitation after Koonchanok, Papka and Reda (CHI 2023). The
 * reader states a relationship by dragging a trendline's slope and a strength
 * slider; a sample drawn from that model is redrawn every second and a half, so
 * the scatter shows what the belief implies. The line is an overlay the drag
 * trigger can press, the sample arrives through set-data from a timer, and
 * both live in one retained layer. There is no data behind the chart: every
 * point is the reader's model.
 */

const INCOME = 'Income ($k a year)';
const FREE = 'Free time (hours a week)';
type Row = { [INCOME]: number; [FREE]: number };

const CHART_ID = 'app-demo-regression';
const MODEL_ID = 'model';
const RESAMPLE_ID = 'resample';
const X_DOMAIN: [number, number] = [40, 260];
const Y_DOMAIN: [number, number] = [0, 60];
const PIVOT = { x: 150, y: 30 };
const SAMPLE = 80;
const SLOPE_LIMIT = 0.3;
const REFRESH_MS = 1500;
const LINE_INK = '#d1495b';

type Model = { slope: number; strength: number };
const INITIAL: Model = { slope: 0, strength: 0.5 };

const clamp = (value: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, value));
const lineAt = (slope: number, x: number) => PIVOT.y + slope * (x - PIVOT.x);
/** Noise around the line: a weak belief scatters widely, a strong one hugs it. */
const sigmaOf = (strength: number) => 1 + 20 * (1 - strength);

function gaussian(): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function sampleOf(model: Model): Row[] {
  const sigma = sigmaOf(model.strength);
  return Array.from({ length: SAMPLE }, () => {
    const x = X_DOMAIN[0] + 10 + Math.random() * (X_DOMAIN[1] - X_DOMAIN[0] - 20);
    return { [INCOME]: Math.round(x), [FREE]: Math.round(clamp(lineAt(model.slope, x) + sigma * gaussian(), Y_DOMAIN) * 10) / 10 };
  });
}

/** The trendline, clipped to the frame, as a path the drag trigger can press. */
function lineOp(slope: number): ChartUpdate['ops'][number] {
  const reach = slope === 0 ? Infinity : Math.min((Y_DOMAIN[1] - PIVOT.y) / Math.abs(slope), (PIVOT.y - Y_DOMAIN[0]) / Math.abs(slope));
  const x0 = Math.max(X_DOMAIN[0], PIVOT.x - reach);
  const x1 = Math.min(X_DOMAIN[1], PIVOT.x + reach);
  return {
    op: 'set-overlay',
    name: 'trend',
    value: {
      mark: 'line',
      role: 'reference',
      interactive: true,
      projectable: true,
      data: { values: [{ x: x0, y: lineAt(slope, x0) }, { x: x1, y: lineAt(slope, x1) }] },
      encodings: { x: { field: 'x' }, y: { field: 'y' } },
      style: { stroke: LINE_INK, strokeWidth: 3 },
    },
  };
}

const modelUpdate = (model: Model, rows: Row[]): ChartUpdate => ({
  id: MODEL_ID,
  ops: [
    { op: 'set-data', source: 'main', value: { rows } },
    lineOp(model.slope),
  ],
});

const FIRST_SAMPLE = sampleOf(INITIAL);
const MOUNT: readonly ChartUpdate[] = [modelUpdate(INITIAL, FIRST_SAMPLE)];

const SPEC = {
  data: { values: FIRST_SAMPLE },
  semantic_types: {
    [INCOME]: { semanticType: 'Quantity', intrinsicDomain: X_DOMAIN },
    [FREE]: { semanticType: 'Quantity', intrinsicDomain: Y_DOMAIN },
  },
  options: { addTooltips: false },
  chart_spec: {
    chartType: 'Scatter Plot',
    title: 'Programmers at US tech companies',
    encodings: { x: INCOME, y: FREE },
    baseSize: { width: 440, height: 380 },
    chartProperties: { includeZero_x: false, includeZero_y: true },
  },
} as ChartAssemblyInput;

function domainValue(coordinate: { kind: string; value?: unknown } | undefined): number | undefined {
  const value = coordinate?.kind === 'value' ? Number(coordinate.value) : NaN;
  return Number.isFinite(value) ? value : undefined;
}

/** The correlation the model implies for incomes spread evenly across the frame. */
function correlationOf(model: Model): number {
  const sdX = (X_DOMAIN[1] - X_DOMAIN[0] - 20) / Math.sqrt(12);
  const signal = model.slope * sdX;
  return signal / Math.sqrt(signal * signal + sigmaOf(model.strength) ** 2);
}

export function DragTheFitDemo() {
  const chart = useRef<FlintChartHandle>(null);
  const modelRef = useRef<Model>({ ...INITIAL });
  const [model, setModel] = useState<Model>(modelRef.current);

  const apply = useCallback((next: Model): ChartUpdate => {
    modelRef.current = next;
    setModel(next);
    return modelUpdate(next, sampleOf(next));
  }, []);

  const interactions = useMemo<readonly InteractionDef[]>(() => {
    const tilt: CanvasInteractionDef = {
      id: MODEL_ID,
      eventSource: dragTrigger(16),
      affordances: { mark: { cursor: 'drag' } },
      handle(event) {
        if (event.action !== 'drag' || event.phase === 'start' || event.phase === 'cancel') return null;
        const x = domainValue(event.geometry.domain?.x);
        const y = domainValue(event.geometry.domain?.y);
        if (x === undefined || y === undefined || Math.abs(x - PIVOT.x) < 15) return null;
        const slope = clamp((y - PIVOT.y) / (x - PIVOT.x), [-SLOPE_LIMIT, SLOPE_LIMIT]);
        return apply({ ...modelRef.current, slope: Math.round(slope * 1000) / 1000 });
      },
    };
    const resample = externalInteraction<{ model?: Model }>({
      id: RESAMPLE_ID,
      handle: ({ model: next }) => apply(next ?? modelRef.current),
    });
    return [tilt, resample];
  }, [apply]);

  const send = useCallback((next?: Model) => {
    void chart.current?.dispatch(RESAMPLE_ID, next ? { model: next } : {}).then((result) => {
      if (result && result.status !== 'applied') console.warn(`${CHART_ID}: ${result.status}`, result);
    });
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => send(), REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [send]);

  const perTen = model.slope * 10;
  const relationship = Math.abs(perTen) < 0.05
    ? 'flat'
    : `${Math.abs(perTen).toFixed(1)} h ${perTen < 0 ? 'less' : 'more'} free time per $10k`;
  const r = correlationOf(model);
  const changed = model.slope !== INITIAL.slope || model.strength !== INITIAL.strength;

  return <DemoColumns
    panelTitle="Your belief"
    panel={<>
      <p className="app-demo-prompt">
        Programmers at US tech companies: <em>what is the relationship between income and free time?</em>
      </p>
      <dl className="it-definition-list app-demo-stats app-demo-belief">
        <div><dt>Slope</dt><dd>{relationship}</dd></div>
        <div><dt>Correlation</dt><dd>r = {r.toFixed(2)}</dd></div>
      </dl>
      <label className="app-demo-strength">
        <span>Strength</span>
        <span className="app-demo-strength-track">
          <small>weak</small>
          <input
            type="range" min={0} max={1} step={0.01} value={model.strength}
            onChange={(e) => send({ ...modelRef.current, strength: Number(e.target.value) })}
          />
          <small>strong</small>
        </span>
      </label>
      <div className="app-demo-shapes">
        <button type="button" className="app-demo-play" onClick={() => send({ ...INITIAL })} disabled={!changed}>Restart</button>
      </div>
    </>}
    chart={<FlintChart
      ref={chart}
      spec={SPEC}
      interactions={interactions}
      updates={MOUNT}
      chartId={CHART_ID}
      ariaLabel="Draw the relationship"
      renderer="svg" expressionInterpreter={expressionInterpreter} className="it-chart-mount app-demo-sample-chart" width="100%" fit="shrink"
    />}
  />;
}
