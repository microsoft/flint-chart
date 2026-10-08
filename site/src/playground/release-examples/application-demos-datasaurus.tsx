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
import datasaurus from '../../data/datasaurus-dozen.json';
import { DemoColumns } from './application-demos-layout';

/*
 * The Datasaurus Dozen as direct manipulation. Thirteen point clouds share
 * their statistics; one point of the cloud is the handle, and its path
 * through the shapes is nearly a straight line because the shapes are
 * ordered, and the handle chosen in each, so that a real point sits on the
 * line's stations. Press the handle and drag along its path; the whole cloud
 * interpolates between the neighbouring shapes through set-data. The shape
 * list jumps to one shape; the panel reads the statistics from the rows the
 * chart draws.
 */

type Point = { x: number; y: number };

const CHART_ID = 'app-demo-datasaurus';
const MORPH_ID = 'morph';
const JUMP_ID = 'jump';
const PATH_INK = '#e07b39';

const SHAPE_LABELS: Record<string, string> = {
  dino: 'Dinosaur',
  away: 'Away',
  h_lines: 'Horizontal lines',
  v_lines: 'Vertical lines',
  x_shape: 'X',
  star: 'Star',
  high_lines: 'High lines',
  dots: 'Dots',
  circle: 'Circle',
  bullseye: 'Bullseye',
  slant_up: 'Slant up',
  slant_down: 'Slant down',
  wide_lines: 'Wide lines',
};
/** The shapes in the order that lets one point walk a near-straight line from (30, 20) to (80, 10). */
const SHAPES = ['v_lines', 'high_lines', 'wide_lines', 'star', 'circle', 'dots', 'dino', 'slant_down', 'slant_up', 'bullseye', 'away', 'h_lines', 'x_shape'];
const LINE = { from: { x: 30, y: 20 }, to: { x: 80, y: 10 } };
const stationOf = (index: number) => ({
  x: LINE.from.x + ((LINE.to.x - LINE.from.x) * index) / (SHAPES.length - 1),
  y: LINE.from.y + ((LINE.to.y - LINE.from.y) * index) / (SHAPES.length - 1),
});
/** Each set with the point nearest its station moved to row 0: that row is the handle in every shape. */
const SETS: Record<string, number[][]> = Object.fromEntries(SHAPES.map((shape, index) => {
  const rows = (datasaurus.sets as Record<string, number[][]>)[shape].map(([x, y]) => [x, y]);
  const station = stationOf(index);
  const distance = (row: number[]) => Math.hypot(row[0] - station.x, row[1] - station.y);
  const handle = rows.reduce((best, row, i) => (distance(row) < distance(rows[best]) ? i : best), 0);
  [rows[0], rows[handle]] = [rows[handle], rows[0]];
  return [shape, rows];
}));
const COUNT = SETS[SHAPES[0]].length;
const START = SHAPES.indexOf('dino');

/** The cloud at a fractional position along the shape list. */
function cloudAt(position: number): Point[] {
  const from = Math.max(0, Math.min(SHAPES.length - 1, Math.floor(position)));
  const to = Math.min(SHAPES.length - 1, from + 1);
  const t = Math.max(0, Math.min(1, position - from));
  const a = SETS[SHAPES[from]];
  const b = SETS[SHAPES[to]];
  return a.map(([x, y], i) => ({ x: x + (b[i][0] - x) * t, y: y + (b[i][1] - y) * t }));
}

/** The handle's position in every shape, in list order. */
const PATH = SHAPES.map((shape, Shape) => ({ Shape, x: SETS[shape][0][0], y: SETS[shape][0][1] }));
const handleAt = (position: number) => cloudAt(position)[0];

type Stats = { meanX: number; meanY: number; sdX: number; sdY: number; r: number };

function statsOf(points: readonly Point[]): Stats {
  const n = points.length;
  const meanX = points.reduce((sum, p) => sum + p.x, 0) / n;
  const meanY = points.reduce((sum, p) => sum + p.y, 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.x - meanX) ** 2;
    syy += (p.y - meanY) ** 2;
    sxy += (p.x - meanX) * (p.y - meanY);
  }
  return { meanX, meanY, sdX: Math.sqrt(sxx / (n - 1)), sdY: Math.sqrt(syy / (n - 1)), r: sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : 0 };
}

function frameUpdate(position: number): ChartUpdate {
  const nearest = Math.round(position);
  const label = Math.abs(position - nearest) < 0.02 ? SHAPE_LABELS[SHAPES[nearest]] : `${SHAPE_LABELS[SHAPES[Math.floor(position)]]} → ${SHAPE_LABELS[SHAPES[Math.ceil(position)]]}`;
  const handle = handleAt(position);
  return {
    id: MORPH_ID,
    ops: [
      { op: 'set-data', source: 'main', value: { rows: cloudAt(position) } },
      {
        op: 'set-overlay',
        name: 'path',
        value: {
          mark: 'line',
          role: 'trajectory',
          interactive: true,
          projectable: true,
          data: { values: PATH },
          encodings: { x: { field: 'x' }, y: { field: 'y' }, order: { field: 'Shape' } },
          style: { stroke: PATH_INK, strokeWidth: 2, strokeDash: [5, 4], opacity: 0.7 },
        },
      },
      {
        op: 'set-overlay',
        name: 'stations',
        value: {
          mark: 'point',
          role: 'trajectory-station',
          data: { values: PATH },
          encodings: { x: { field: 'x' }, y: { field: 'y' } },
          style: { fill: '#ffffff', stroke: PATH_INK, strokeWidth: 1.5, pointRadius: 3 },
        },
      },
      {
        op: 'set-overlay',
        name: 'handle',
        value: {
          mark: 'point',
          role: 'handle',
          data: { values: [handle] },
          encodings: { x: { field: 'x' }, y: { field: 'y' } },
          style: { fill: PATH_INK, stroke: '#ffffff', strokeWidth: 2, pointRadius: 8 },
        },
      },
      {
        op: 'set-overlay',
        name: 'handle-label',
        value: {
          mark: 'text',
          role: 'handle-label',
          data: { values: [{ ...handle, label }] },
          encodings: { x: { field: 'x' }, y: { field: 'y' }, text: { field: 'label' } },
          style: { fill: '#8a4a1d', fontSize: 11, fontWeight: 'bold', textAlign: 'middle', dy: -14 },
        },
      },
    ],
  };
}

const MOUNT: readonly ChartUpdate[] = [frameUpdate(START)];

const SPEC = {
  data: { values: cloudAt(START) },
  semantic_types: {
    x: { semanticType: 'Quantity', intrinsicDomain: [0, 100] },
    y: { semanticType: 'Quantity', intrinsicDomain: [0, 100] },
  },
  options: { addTooltips: false },
  chart_spec: {
    chartType: 'Scatter Plot',
    title: 'Same statistics, different pictures',
    subtitle: `${COUNT} points; drag the orange point along its path to morph the shape`,
    encodings: { x: 'x', y: 'y' },
    baseSize: { width: 420, height: 440 },
    chartProperties: { includeZero_x: true, includeZero_y: true },
  },
} as ChartAssemblyInput;

const fixed = (value: number) => value.toFixed(2);

export function DatasaurusDemo() {
  const chart = useRef<FlintChartHandle>(null);
  const [position, setPosition] = useState(START);

  const apply = useCallback((next: number): ChartUpdate => {
    setPosition(next);
    return frameUpdate(next);
  }, []);

  const interactions = useMemo<readonly InteractionDef[]>(() => {
    const morph: CanvasInteractionDef = {
      id: MORPH_ID,
      eventSource: dragTrigger(14),
      affordances: { mark: { cursor: 'drag' } },
      handle(event) {
        if (event.action !== 'drag' || event.phase === 'start' || event.phase === 'cancel') return null;
        const projection = event.geometry.projection;
        if (projection?.kind !== 'path') return null;
        const from = Number((projection.segment.start.value as { Shape?: unknown }).Shape);
        const to = Number((projection.segment.end.value as { Shape?: unknown }).Shape);
        if (!Number.isFinite(from) || !Number.isFinite(to)) return null;
        return apply(from + (to - from) * projection.segment.t);
      },
    };
    const jump = externalInteraction<{ shape: number }>({
      id: JUMP_ID,
      handle: ({ shape }) => apply(shape),
    });
    return [morph, jump];
  }, [apply]);

  const pick = (shape: number) => {
    void chart.current?.dispatch(JUMP_ID, { shape }).then((result) => {
      if (result && result.status !== 'applied') console.warn(`${CHART_ID}: ${result.status}`, result);
    });
  };

  const stats = useMemo(() => statsOf(cloudAt(position)), [position]);
  const nearest = Math.round(position);
  const between = Math.abs(position - nearest) > 0.02;

  return <DemoColumns
    panelTitle="Shapes"
    panel={<>
      <ul className="app-demo-shape-list">
        {SHAPES.map((name, index) => <li key={name}>
          <button
            type="button"
            className={!between && nearest === index ? 'is-active' : ''}
            aria-pressed={!between && nearest === index}
            onClick={() => pick(index)}
          >{SHAPE_LABELS[name]}</button>
        </li>)}
      </ul>
      <div className="it-detail-heading">All {COUNT} points</div>
      <dl className="it-definition-list app-demo-stats app-demo-stats--large">
        <div><dt>Mean x</dt><dd>{fixed(stats.meanX)}</dd></div>
        <div><dt>Mean y</dt><dd>{fixed(stats.meanY)}</dd></div>
        <div><dt>SD x</dt><dd>{fixed(stats.sdX)}</dd></div>
        <div><dt>SD y</dt><dd>{fixed(stats.sdY)}</dd></div>
        <div><dt>Correlation</dt><dd>{stats.r.toFixed(3)}</dd></div>
      </dl>
    </>}
    chart={<FlintChart
      ref={chart}
      spec={SPEC}
      interactions={interactions}
      updates={MOUNT}
      chartId={CHART_ID}
      ariaLabel="The Datasaurus Dozen"
      renderer="svg" expressionInterpreter={expressionInterpreter} className="it-chart-mount" width="100%" fit="shrink"
    />}
  />;
}
