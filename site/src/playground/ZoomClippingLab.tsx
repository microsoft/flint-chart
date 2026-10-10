import { useCallback, useRef, useState } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import {
  clickHighlight,
  inspectIndex,
  navigate,
  viewportUpdate,
  type CanvasInteractionDef,
  type ChartUpdate,
  type ChartUpdateOp,
} from 'flint-chart/interactive';
import { FlintChart, type FlintChartHandle } from 'flint-chart/react';
import './overflow-viewport-lab.css';
import './zoom-clipping-lab.css';

const ZOOM_ID = 'zoom-clipping-viewport';

const FORECAST_START = 44;
const LAST_WEEK = 52;
const FINAL_PRICE = 2;

const seasonalPrice = (week: number): number => 3 + 0.4 * Math.sin(week / 8) + 0.15 * Math.cos(week / 3);

const priceRows = Array.from({ length: LAST_WEEK }, (_, index) => {
  const Week = index + 1;
  const start = seasonalPrice(FORECAST_START);
  const price = Week <= FORECAST_START
    ? seasonalPrice(Week)
    : start + (FINAL_PRICE - start) * (Week - FORECAST_START) / (LAST_WEEK - FORECAST_START);
  return { Week, Price: Number(price.toFixed(2)) };
});

const regionRows = priceRows.flatMap(({ Week, Price }) => [
  { Week, Region: 'Coast', Price: Number((Price + 0.9).toFixed(2)) },
  { Week, Region: 'Inland', Price },
]);

const sizing = { baseSize: { width: 560, height: 260 } };

function lineInput(title: string): ChartAssemblyInput {
  return {
    semantic_types: { Week: 'Number', Price: 'Price' },
    chart_spec: { chartType: 'Line Chart', title, ...sizing, encodings: { x: 'Week', y: 'Price' } },
    data: { values: priceRows },
  };
}

function priceAt(week: number): number {
  return priceRows[week - 1].Price;
}

const extremeWeek = (from: number, to: number, pick: (a: number, b: number) => boolean): number =>
  priceRows.slice(from - 1, to).reduce((best, row) => (pick(row.Price, best.Price) ? row : best)).Week;

const peakWeek = extremeWeek(1, 26, (a, b) => a > b);
const lowWeek = extremeWeek(27, FORECAST_START, (a, b) => a < b);

function note(week: number, text: string): ChartUpdateOp {
  return { op: 'set-annotation', target: { select: { key: { Week: week } } }, value: { text } };
}

const forecastRows = [44, 46, 48, 50, 52].map((Week, index) => ({
  Week,
  Price: Number((priceAt(FORECAST_START) + index * 0.1).toFixed(2)),
}));
const TARGET_PRICE = 1.75;

const forecastOps: ChartUpdateOp[] = [
  {
    op: 'set-overlay',
    name: 'forecast',
    value: {
      mark: 'line',
      role: 'forecast',
      data: { values: forecastRows },
      encodings: { x: { field: 'Week' }, y: { field: 'Price' }, order: { field: 'Week' } },
      style: { stroke: '#c0563b', strokeWidth: 2, strokeDash: [5, 4] },
    },
  },
  {
    op: 'set-overlay',
    name: 'target',
    value: {
      mark: 'rule',
      role: 'target',
      data: { values: [{ Price: TARGET_PRICE }] },
      encodings: { y: { field: 'Price' } },
      style: { stroke: '#2f7d5b', strokeWidth: 1.5, strokeDash: [2, 3] },
    },
  },
  {
    op: 'set-overlay',
    name: 'forecast-end',
    value: {
      mark: 'text',
      role: 'forecast-label',
      data: { values: [{ ...forecastRows[forecastRows.length - 1], Label: `Forecast ${forecastRows[forecastRows.length - 1].Price}` }] },
      encodings: { x: { field: 'Week' }, y: { field: 'Price' }, text: { field: 'Label' } },
      style: { fill: '#c0563b', fontSize: 11, fontWeight: 'bold', textAlign: 'end', dx: -6, dy: -10 },
    },
  },
];

type Action = { label: string; run: (chart: FlintChartHandle) => Promise<unknown> };

const zoomTo = (label: string, viewport: Parameters<typeof viewportUpdate>[1]): Action => ({
  label,
  run: (chart) => chart.applyUpdate(viewportUpdate(ZOOM_ID, viewport)),
});

const resetInstant: Action = { label: 'Reset', run: (chart) => chart.applyUpdate(viewportUpdate(ZOOM_ID, null)) };

const resetAnimated: Action = {
  label: 'Reset (animated)',
  run: (chart) => chart.applyUpdate(viewportUpdate(ZOOM_ID, null), { transition: { duration: 700 } }),
};

interface ZoomCase {
  id: string;
  input: ChartAssemblyInput;
  description: string;
  check: string;
  before: string;
  interactions: readonly CanvasInteractionDef[];
  updates?: readonly ChartUpdate[];
  actions: readonly Action[];
  readout?: (chart: FlintChartHandle) => string;
}

const cases: readonly ZoomCase[] = [
  {
    id: 'notes',
    input: lineInput('A note whose target leaves the view'),
    description: `Two notes, on the spring peak (week ${peakWeek}) and the autumn low (week ${lowWeek}). Zooming to the last weeks moves the peak off the plot.`,
    check: 'The spring peak note hides while zoomed, and its state reads inView: false. Reset brings it back.',
    before: 'The spring peak card stayed on the plot with its pointer line running off the edge.',
    interactions: [navigate({ id: 'zoom', axes: 'x' })],
    updates: [{ id: 'notes', ops: [note(peakWeek, 'Spring peak'), note(lowWeek, 'Autumn low')] }],
    actions: [zoomTo('Zoom to weeks 30–52', { x: [30, 52] }), resetInstant],
    readout: (chart) => (chart.getState()?.annotations ?? [])
      .map((annotation) => `${annotation.text}: inView ${annotation.inView ?? '–'}`)
      .join(' · ') || 'No notes yet',
  },
  {
    id: 'overlays',
    input: lineInput('Overlays at the plot edge'),
    description: 'A dashed forecast line, a target rule, and a label at the forecast’s last point, all drawn as data overlays.',
    check: 'While zoomed, the forecast stops at the plot edge like the chart’s own line, and the label is gone because its point is out of view.',
    before: 'The forecast ran on past the plot into the margin, and the label floated outside the chart.',
    interactions: [navigate({ id: 'zoom', axes: 'x' })],
    updates: [{ id: 'forecast', ops: forecastOps }],
    actions: [zoomTo('Zoom to weeks 38–48', { x: [38, 48] }), resetInstant],
  },
  {
    id: 'animated-reset',
    input: lineInput('An animated reset'),
    description: `The same overlays and a note on the autumn low (week ${lowWeek}). The reset flies home over 700 ms instead of jumping.`,
    check: 'Zoom in, then reset with the animation: the note and the overlays follow every frame and land on the line.',
    before: 'The overlays were drawn once, at the start of the flight, and stayed where the zoomed scales put them.',
    interactions: [navigate({ id: 'zoom', axes: 'x' })],
    updates: [{ id: 'forecast', ops: forecastOps }, { id: 'notes', ops: [note(lowWeek, 'Autumn low')] }],
    actions: [zoomTo(`Zoom to weeks ${lowWeek - 3}–48`, { x: [lowWeek - 3, 48] }), resetAnimated],
  },
  {
    id: 'picking',
    input: {
      semantic_types: { Week: 'Number', Price: 'Price' },
      chart_spec: { chartType: 'Scatter Plot', title: 'Nothing hidden is pickable', ...sizing, encodings: { x: 'Week', y: 'Price' } },
      data: { values: priceRows.filter(({ Week }) => Week % 4 === 0) },
      interaction_spec: { interactions: [], keyboardTargeting: true },
    },
    description: 'Points every four weeks. The zoom leaves week 20 a few pixels past the left edge, hidden by the clip.',
    check: 'Click or hover just inside the left edge: nothing is picked. Focus the chart and press an arrow key: focus starts at week 24, the first point in view.',
    before: 'Snapping reached past the edge and picked week 20, and the arrow keys stepped through points nobody could see.',
    interactions: [navigate({ id: 'zoom', axes: 'x', pan: false }), clickHighlight()],
    actions: [zoomTo('Zoom to weeks 20.1–40', { x: [20.1, 40] }), resetInstant],
    readout: (chart) => {
      const weeks = (chart.getState()?.selected ?? []).map((element) => element.value.Week).filter((week) => week !== undefined);
      return weeks.length > 0 ? `Picked week ${weeks.join(', ')}` : 'Nothing picked';
    },
  },
  {
    id: 'inspect',
    input: {
      semantic_types: { Week: 'Number', Region: 'Category', Price: 'Price' },
      chart_spec: { chartType: 'Line Chart', title: 'Inspect a value above the view', ...sizing, encodings: { x: 'Week', y: 'Price', color: 'Region' } },
      data: { values: regionRows },
    },
    description: 'Two regions; the y zoom keeps Inland in view and pushes Coast above the plot.',
    check: 'Hover the chart: the Coast readout says “(above view)”, and its rule sits at the top edge.',
    before: 'The Coast value read like any other, with nothing to say the line was off screen.',
    interactions: [navigate({ id: 'zoom', axes: 'xy' }), inspectIndex()],
    actions: [zoomTo('Zoom y to 2.4–3.4', { y: [2.4, 3.4] }), resetInstant],
  },
];

function ZoomCaseDemo({ zoomCase }: { zoomCase: ZoomCase }) {
  const chartRef = useRef<FlintChartHandle>(null);
  const [readout, setReadout] = useState('');
  const refreshReadout = useCallback(() => {
    if (zoomCase.readout && chartRef.current) setReadout(zoomCase.readout(chartRef.current));
  }, [zoomCase]);
  const run = async (action: Action) => {
    if (!chartRef.current) return;
    await action.run(chartRef.current);
    refreshReadout();
  };

  return (
    <section className="ov-demo zc-demo">
      <header className="ov-demo-header">
        <div>
          <h2>{zoomCase.input.chart_spec.title}</h2>
          <p>{zoomCase.description}</p>
        </div>
        <div className="ov-backends" role="group" aria-label="Viewport">
          {zoomCase.actions.map((action) => (
            <button type="button" key={action.label} onClick={() => void run(action)}>{action.label}</button>
          ))}
        </div>
      </header>
      <div className="ov-stage ov-interactive-stage">
        <FlintChart
          ref={chartRef}
          className="ov-interactive-mount"
          spec={zoomCase.input}
          interactions={zoomCase.interactions}
          updates={zoomCase.updates ?? []}
          renderer="svg"
          chartId={`zoom-clipping-${zoomCase.id}`}
          onRender={refreshReadout}
          onChange={refreshReadout}
        />
      </div>
      <dl className="zc-notes">
        {zoomCase.readout && (
          <>
            <dt>State</dt>
            <dd className="zc-readout">{readout}</dd>
          </>
        )}
        <dt>Check</dt>
        <dd>{zoomCase.check}</dd>
        <dt>Before</dt>
        <dd>{zoomCase.before}</dd>
      </dl>
    </section>
  );
}

export function ZoomClippingLab() {
  return (
    <div className="dev-page ov-page">
      <header className="dev-page-heading ov-heading">
        <h1>Zoom clipping lab</h1>
        <p>A navigated chart keeps every mark in its scene and clips the ones outside the viewport. What Flint draws on top of the chart and what a reader can pick now follow that clip. Each card zooms from the host with the buttons; the wheel works too.</p>
      </header>

      <div className="ov-section-heading">
        <span>Drawn on top</span>
        <small>Notes and data overlays hide or clip with the viewport and follow animated changes.</small>
      </div>
      {cases.slice(0, 3).map((zoomCase) => <ZoomCaseDemo key={zoomCase.id} zoomCase={zoomCase} />)}

      <div className="ov-section-heading">
        <span>Picking</span>
        <small>The pointer, the keyboard, and inspect only reach what is on screen.</small>
      </div>
      {cases.slice(3).map((zoomCase) => <ZoomCaseDemo key={zoomCase.id} zoomCase={zoomCase} />)}
    </div>
  );
}
