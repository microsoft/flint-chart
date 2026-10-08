import { useCallback, useMemo, useRef, useState } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import {
  axisBrushTrigger,
  navigate,
  type CanvasInteractionDef,
  type ChartChange,
  type FlintInteractionEventDetail,
  type InteractionDef,
} from 'flint-chart/interactive';
import { FlintChart, type FlintChartHandle } from 'flint-chart/react';
import { expressionInterpreter } from 'vega-interpreter';
import gasoline from '../../data/us-gasoline-prices.json';

/*
 * Overview and detail on one weekly series. Both charts hold every week; the
 * overview below carries a stateful brush, and its interval becomes the
 * viewport of the detail above through set-viewport, so the detail never
 * changes its rows, only the span of its x axis.
 */

const DETAIL_ID = 'app-demo-gasoline-detail';
const OVERVIEW_ID = 'app-demo-gasoline-overview';
const WINDOW_ID = 'window';
const FRAME_ID = 'frame';
const WEEK = 'Week';
const PRICE = 'Price ($ per gallon)';

type Row = { [WEEK]: string; [PRICE]: number };
const SINCE = '2000-01-01';
const ROWS: Row[] = gasoline.rows.filter((row) => row.Week >= SINCE).map((row) => ({ [WEEK]: row.Week, [PRICE]: row.Price }));
const FIRST = ROWS[0][WEEK];
const LAST = ROWS[ROWS.length - 1][WEEK];
const PEAK = ROWS.reduce((best, row) => (row[PRICE] > best[PRICE] ? row : best));
const PRICE_DOMAIN: [number, number] = [0, Math.ceil(PEAK[PRICE] * 2) / 2];
/** The box inside the 832px reading column. canvasSize pins each chart there, so nothing is shrunk and the text keeps its full size. */
const CHART_WIDTH = 800;
/** The layout shapes the plot from the data and grows its height sublinearly with the base, so a tall base is what makes the detail tall. */
const DETAIL_HEIGHT = 800;
const OVERVIEW_HEIGHT = 160;
const TYPE = { baseLabelFontSize: 12, baseTitleFontSize: 13 };

function spec(title: string | undefined, subtitle: string | undefined, height: number): ChartAssemblyInput {
  return {
    data: { values: ROWS },
    semantic_types: {
      [WEEK]: 'Date',
      [PRICE]: { semanticType: 'Quantity', intrinsicDomain: PRICE_DOMAIN, unit: '$' },
    },
    chart_spec: {
      chartType: 'Area Chart',
      ...(title ? { title } : {}),
      ...(subtitle ? { subtitle } : {}),
      encodings: { x: WEEK, y: PRICE },
      baseSize: { width: CHART_WIDTH, height },
      canvasSize: { width: CHART_WIDTH, height },
    },
    options: { addTooltips: false, ...TYPE },
  } as ChartAssemblyInput;
}

const DETAIL_SPEC = spec(
  `US regular gasoline, ${FIRST.slice(0, 4)}–${LAST.slice(0, 4)}`,
  undefined,
  DETAIL_HEIGHT,
);
const OVERVIEW_SPEC = spec(undefined, undefined, OVERVIEW_HEIGHT);

const DETAIL_INTERACTIONS: readonly InteractionDef[] = [navigate({ axes: 'x', pan: false, zoom: false, reset: [] })];
/** A stateful x brush that keeps its interval on screen but emphasizes nothing: the strip is a thumbnail, and the detail is the emphasis. */
const WINDOW_BRUSH: CanvasInteractionDef = {
  id: WINDOW_ID,
  eventSource: axisBrushTrigger('x', 'intersect', 'stateful'),
  affordances: { plot: { cursor: 'region' } },
  reset: ['click-none', 'escape'],
  handle(event) {
    if (event.action !== 'brush-x' || event.phase === 'start' || event.phase === 'cancel') return null;
    return { id: WINDOW_ID, ops: [{ op: 'set-style', targets: [], value: { state: 'normal' } }] };
  },
};
const OVERVIEW_INTERACTIONS: readonly InteractionDef[] = [WINDOW_BRUSH];

type Window = [number, number];

/** The brushed interval in milliseconds, or null when the brush is cleared. */
function windowOf(geometry: FlintInteractionEventDetail['event']['geometry']): Window | null {
  const x = geometry.domain?.x;
  if (x?.kind !== 'interval' || x.start === undefined || x.end === undefined) return null;
  const start = Number(x.start);
  const end = Number(x.end);
  return Number.isFinite(start) && Number.isFinite(end) && end > start ? [start, end] : null;
}

const longDate = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const dollars = (value: number) => `$${value.toFixed(2)}`;

export function OverviewDetailDemo() {
  const detail = useRef<FlintChartHandle>(null);
  const [window, setWindow] = useState<Window | null>(null);

  const frame = useCallback((next: Window | null, phase: ChartChange['phase']) => {
    const value = next ? { x: next } : {};
    void detail.current?.applyUpdate(
      { id: FRAME_ID, ops: [{ op: 'set-viewport', axes: 'x', value }] },
      phase === 'commit' ? { transition: { duration: 250 } } : undefined,
    ).then((result) => {
      if (result && result.status !== 'applied') console.warn(`${DETAIL_ID}: ${result.status}`, result);
    });
  }, []);

  // The brush emphasizes nothing, so its moves are gesture events, not changes to the chart's state.
  const onOverviewInteraction = useCallback((detail: FlintInteractionEventDetail) => {
    const { phase, geometry } = detail.event;
    if (detail.interactionId !== WINDOW_ID || (phase !== 'commit' && phase !== 'preview')) return;
    const next = windowOf(geometry);
    if (phase === 'commit') setWindow(next);
    frame(next, phase);
  }, [frame]);
  // A reset (Escape, a click on the background) is no gesture event: the brush's entry leaves the state.
  const onOverviewChange = useCallback((change: ChartChange) => {
    if (change.state.entries?.has(WINDOW_ID) || !change.previous.entries?.has(WINDOW_ID)) return;
    setWindow(null);
    frame(null, 'commit');
  }, [frame]);
  const status = useMemo(() => {
    if (!window) {
      return `Showing every week from ${longDate.format(Date.parse(FIRST))} to ${longDate.format(Date.parse(LAST))}. The record was ${dollars(PEAK[PRICE])} in the week of ${longDate.format(Date.parse(PEAK[WEEK]))}. Drag across the strip below to frame the chart on those weeks.`;
    }
    const inside = ROWS.filter((row) => {
      const time = Date.parse(row[WEEK]);
      return time >= window[0] && time <= window[1];
    });
    if (inside.length === 0) return `No weeks between ${longDate.format(window[0])} and ${longDate.format(window[1])}.`;
    const high = inside.reduce((best, row) => (row[PRICE] > best[PRICE] ? row : best));
    const low = inside.reduce((best, row) => (row[PRICE] < best[PRICE] ? row : best));
    return `Showing ${inside.length} weeks, ${longDate.format(window[0])} to ${longDate.format(window[1])}. High ${dollars(high[PRICE])} in the week of ${longDate.format(Date.parse(high[WEEK]))}, low ${dollars(low[PRICE])} in the week of ${longDate.format(Date.parse(low[WEEK]))}. Move or resize the brush, or press Escape on the strip to show every week again.`;
  }, [window]);

  return <div className="app-demo-stack">
    <p className="it-detail-note app-demo-year-note">{status}</p>
    <div className="app-demo-box app-demo-stack-chart">
      <FlintChart
        ref={detail}
        spec={DETAIL_SPEC}
        interactions={DETAIL_INTERACTIONS}
        chartId={DETAIL_ID}
        ariaLabel={`US regular gasoline, ${FIRST.slice(0, 4)}–${LAST.slice(0, 4)}`}
        renderer="svg" expressionInterpreter={expressionInterpreter} className="it-chart-mount" width="100%"
      />
    </div>
    <div className="app-demo-box app-demo-stack-chart app-demo-strip">
      <FlintChart
        spec={OVERVIEW_SPEC}
        interactions={OVERVIEW_INTERACTIONS}
        chartId={OVERVIEW_ID}
        ariaLabel="Weekly US regular gasoline price, every week"
        renderer="svg" expressionInterpreter={expressionInterpreter} className="it-chart-mount" width="100%"
        onChange={onOverviewChange}
        onInteraction={onOverviewInteraction}
      />
    </div>
  </div>;
}
