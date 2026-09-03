import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import {
  buildInteractiveChart,
  dragTrigger,
  externalInteraction,
  type CanvasInteractionDef,
  type ChartUpdate,
  type InteractiveChartSurface,
} from 'flint-chart/interactive';
import { ScaleToFit } from '../components/ScaleToFit';
import {
  TIMEBOX_ROWS,
  TIME_DOMAIN,
  TIME_LABELS,
  TOTAL_SERIES,
  VALUE_DOMAIN,
} from './timebox-stage-data';
import {
  filterRowsByTimebox,
  normalizeTimeboxSelection,
  type TimeboxFilterResult,
  type TimeboxSelection,
} from './timebox-stage-logic';
import './interaction-candidates.css';
import './timebox-stage.css';

const TIMEBOX_UPDATE_ID = 'flint-timebox-window';
const TIMEBOX_DRAG_ID = 'flint-timebox-drag';
const TIMEBOX_HOST_ID = 'flint-timebox-host';

type Point = { x: number; y: number };
type LinearFit = { toPixel: (value: number) => number; toValue: (pixel: number) => number };
type PlotCalibration = {
  x: LinearFit;
  y: LinearFit;
  bounds: { left: number; right: number; top: number; bottom: number };
};
type HostGesturePayload = {
  phase: 'start' | 'preview' | 'commit' | 'cancel';
  start: Point;
  current: Point;
  coordinateSpace: 'mount' | 'plot';
};

const ALL_SERIES = [...new Set(TIMEBOX_ROWS.map((row) => row.Series))];
const FULL_RESULT: TimeboxFilterResult = {
  keptSeries: ALL_SERIES,
  keptRows: TIMEBOX_ROWS,
  pointsInWindow: 0,
};
const HIDE_ALL_SERIES_TARGETS = ALL_SERIES.map((series) => ({
  select: { key: { Series: series } },
}));

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function mountPoint(event: PointerEvent, mount: HTMLDivElement): Point {
  const rect = mount.getBoundingClientRect();
  const scaleX = mount.offsetWidth / rect.width;
  const scaleY = mount.offsetHeight / rect.height;
  return {
    x: (event.clientX - rect.left) * scaleX,
    y: (event.clientY - rect.top) * scaleY,
  };
}

function pointInsidePlot(point: Point, calibration: PlotCalibration | null) {
  if (!calibration) return false;
  return point.x >= calibration.bounds.left
    && point.x <= calibration.bounds.right
    && point.y >= calibration.bounds.top
    && point.y <= calibration.bounds.bottom;
}

function fitLinearScale(samples: readonly { value: number; pixel: number }[]): LinearFit | null {
  if (samples.length < 2) return null;
  const meanValue = samples.reduce((sum, sample) => sum + sample.value, 0) / samples.length;
  const meanPixel = samples.reduce((sum, sample) => sum + sample.pixel, 0) / samples.length;
  const numerator = samples.reduce(
    (sum, sample) => sum + (sample.value - meanValue) * (sample.pixel - meanPixel),
    0,
  );
  const denominator = samples.reduce((sum, sample) => sum + (sample.value - meanValue) ** 2, 0);
  if (denominator === 0 || numerator === 0) return null;
  const slope = numerator / denominator;
  const intercept = meanPixel - slope * meanValue;
  return {
    toPixel: (value) => intercept + slope * value,
    toValue: (pixel) => (pixel - intercept) / slope,
  };
}

function renderedPointSamples(mount: HTMLDivElement) {
  const mountRect = mount.getBoundingClientRect();
  const scaleX = mount.offsetWidth / mountRect.width;
  const scaleY = mount.offsetHeight / mountRect.height;
  return Array.from(mount.querySelectorAll<SVGGraphicsElement>('[aria-label*="Series:"][aria-label*="Time:"][aria-label*="Value:"]'))
    .flatMap((element) => {
      const aria = element.getAttribute('aria-label') ?? '';
      const time = Number(/Time:\s*([^;]+)/.exec(aria)?.[1]);
      const value = Number(/Value:\s*([^;]+)/.exec(aria)?.[1]);
      const rect = element.getBoundingClientRect();
      if (!Number.isFinite(time) || !Number.isFinite(value) || rect.width > 28 || rect.height > 28) {
        return [];
      }
      return [{
        time,
        value,
        pixel: {
          x: (rect.left + rect.width / 2 - mountRect.left) * scaleX,
          y: (rect.top + rect.height / 2 - mountRect.top) * scaleY,
        },
      }];
    });
}

function inferPlotCalibration(mount: HTMLDivElement): PlotCalibration | null {
  const samples = renderedPointSamples(mount);
  // The host drag lives above the chart, so we recover screen<->data mapping
  // from the rendered sample points instead of reaching into Vega internals.
  const x = fitLinearScale(samples.map((sample) => ({ value: sample.time, pixel: sample.pixel.x })));
  const y = fitLinearScale(samples.map((sample) => ({ value: sample.value, pixel: sample.pixel.y })));
  if (!x || !y) return null;
  return {
    x,
    y,
    bounds: {
      left: x.toPixel(TIME_DOMAIN[0]),
      right: x.toPixel(TIME_DOMAIN[1]),
      top: y.toPixel(VALUE_DOMAIN[1]),
      bottom: y.toPixel(VALUE_DOMAIN[0]),
    },
  };
}

function formatTime(value: number) {
  const index = clamp(Math.round(value), TIME_DOMAIN[0], TIME_DOMAIN[1]) - 1;
  return TIME_LABELS[index];
}

function summarizeSelection(selection: TimeboxSelection | null) {
  if (!selection) return 'Draw a box in the plot to keep only series whose sampled points stay inside it.';
  return `${formatTime(selection.startTime)} - ${formatTime(selection.endTime)} · `
    + `${selection.minValue.toFixed(1)} - ${selection.maxValue.toFixed(1)}`;
}

function boxOverlayUpdate(
  selection: TimeboxSelection | null,
  filter: TimeboxFilterResult,
): ChartUpdate {
  if (!selection) {
    return {
      id: TIMEBOX_UPDATE_ID,
      ops: [
        { op: 'set-data', source: 'main', value: { rows: TIMEBOX_ROWS } },
        { op: 'set-overlay', name: 'timebox-box', value: null },
        { op: 'set-overlay', name: 'timebox-label', value: null },
      ],
    };
  }

  const label = `${filter.keptSeries.length}/${TOTAL_SERIES} kept`;
  const dataOps: ChartUpdate['ops'] = filter.keptRows.length > 0
    ? [{ op: 'set-data' as const, source: 'main', value: { rows: filter.keptRows } }]
    : [
      { op: 'set-data' as const, source: 'main', value: { rows: TIMEBOX_ROWS } },
      { op: 'set-style' as const, targets: HIDE_ALL_SERIES_TARGETS, value: { visible: false } },
    ];
  return {
    id: TIMEBOX_UPDATE_ID,
    ops: [
      ...dataOps,
      {
        op: 'set-overlay',
        name: 'timebox-box',
        value: {
          mark: 'rect',
          role: 'timebox',
          data: {
            values: [{
              Time: selection.startTime,
              Value: selection.minValue,
              TimeEnd: selection.endTime,
              ValueEnd: selection.maxValue,
            }],
          },
          encodings: {
            x: { field: 'Time' },
            y: { field: 'Value' },
            x2: { field: 'TimeEnd' },
            y2: { field: 'ValueEnd' },
          },
          style: {
            fill: '#6ea98a',
            fillOpacity: 0.16,
            stroke: '#355c49',
            strokeWidth: 1.6,
          },
        },
      },
      {
        op: 'set-overlay',
        name: 'timebox-label',
        value: {
          mark: 'text',
          role: 'timebox-label',
          data: {
            values: [{
              Time: (selection.startTime + selection.endTime) / 2,
              Value: selection.maxValue,
              Label: label,
            }],
          },
          encodings: {
            x: { field: 'Time' },
            y: { field: 'Value' },
            text: { field: 'Label' },
          },
          style: {
            fill: '#284738',
            fontSize: 11,
            fontWeight: 'bold',
            textAlign: 'middle',
            dy: -8,
          },
        },
      },
    ],
  };
}

function chartInput(large: boolean): ChartAssemblyInput {
  const size = large ? { width: 900, height: 520 } : { width: 620, height: 380 };
  return {
    data: { values: TIMEBOX_ROWS },
    semantic_types: {
      Series: 'Category',
      Time: { semanticType: 'Quantity', intrinsicDomain: [...TIME_DOMAIN] as [number, number] },
      Value: { semanticType: 'Quantity', intrinsicDomain: [...VALUE_DOMAIN] as [number, number] },
    },
    theme_spec: {
      extends: 'datawrapper',
      geometry: { point: { size: 78 } },
    },
    options: { addTooltips: false },
    chart_spec: {
      chartType: 'Line Chart',
      title: 'Timebox filtering on sampled trajectories',
      encodings: { x: 'Time', y: 'Value', color: 'Series' },
      baseSize: size,
      canvasSize: size,
      chartProperties: { includeZero_y: false, showPoints: true },
    },
  };
}

export function FlintTimeboxStage({ large = false }: { large?: boolean } = {}) {
  const input = useMemo(() => chartInput(large), [large]);
  const mountRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<InteractiveChartSurface | null>(null);
  const calibrationRef = useRef<PlotCalibration | null>(null);
  const committedSelectionRef = useRef<TimeboxSelection | null>(null);
  const hostDragRef = useRef<{ pointerId: number; start: Point; moved: boolean } | null>(null);
  const [selection, setSelection] = useState<TimeboxSelection | null>(null);
  const [filter, setFilter] = useState<TimeboxFilterResult>(FULL_RESULT);
  const [isDragging, setIsDragging] = useState(false);

  const applySelection = (nextSelection: TimeboxSelection | null, phase: HostGesturePayload['phase']) => {
    if (phase === 'cancel') {
      setIsDragging(false);
      const committed = committedSelectionRef.current;
      setSelection(committed);
      setFilter(committed ? filterRowsByTimebox(TIMEBOX_ROWS, committed) : FULL_RESULT);
      return boxOverlayUpdate(committed, committed ? filterRowsByTimebox(TIMEBOX_ROWS, committed) : FULL_RESULT);
    }

    if (phase === 'start') {
      setIsDragging(true);
      return null;
    }

    if (!nextSelection) {
      if (phase === 'preview') return null;
      setIsDragging(false);
      const committed = committedSelectionRef.current;
      setSelection(committed);
      setFilter(committed ? filterRowsByTimebox(TIMEBOX_ROWS, committed) : FULL_RESULT);
      return committed ? boxOverlayUpdate(committed, filterRowsByTimebox(TIMEBOX_ROWS, committed)) : null;
    }

    const nextFilter = filterRowsByTimebox(TIMEBOX_ROWS, nextSelection);
    setSelection(nextSelection);
    setFilter(nextFilter);
    if (phase === 'commit') {
      committedSelectionRef.current = nextSelection;
      setIsDragging(false);
    }
    return boxOverlayUpdate(nextSelection, nextFilter);
  };

  const selectionFromGesture = (payload: HostGesturePayload): TimeboxSelection | null => {
    const calibration = calibrationRef.current;
    if (!calibration) return null;
    const start = payload.coordinateSpace === 'plot'
      ? {
        x: calibration.bounds.left + payload.start.x,
        y: calibration.bounds.top + payload.start.y,
      }
      : payload.start;
    const current = payload.coordinateSpace === 'plot'
      ? {
        x: calibration.bounds.left + payload.current.x,
        y: calibration.bounds.top + payload.current.y,
      }
      : payload.current;
    const x0 = clamp(start.x, calibration.bounds.left, calibration.bounds.right);
    const x1 = clamp(current.x, calibration.bounds.left, calibration.bounds.right);
    const y0 = clamp(start.y, calibration.bounds.top, calibration.bounds.bottom);
    const y1 = clamp(current.y, calibration.bounds.top, calibration.bounds.bottom);
    if (Math.abs(x1 - x0) < 6 || Math.abs(y1 - y0) < 6) return null;
    return normalizeTimeboxSelection(
      calibration.x.toValue(x0),
      calibration.x.toValue(x1),
      calibration.y.toValue(y0),
      calibration.y.toValue(y1),
    );
  };

  const dragInteraction = useMemo<CanvasInteractionDef>(() => ({
    id: TIMEBOX_DRAG_ID,
    eventSource: dragTrigger(16),
    affordances: [{ target: 'mark', cursor: 'drag', hover: 'target' }],
    handle(event) {
      if (event.action !== 'drag-element') return null;
      const plot = event.geometry.plot;
      if (!plot || plot.kind !== 'drag') return null;
      return applySelection(selectionFromGesture({
        phase: event.phase,
        start: plot.start,
        current: plot.current,
        coordinateSpace: 'plot',
      }), event.phase);
    },
  }), []);

  const hostInteraction = useMemo(() => externalInteraction<HostGesturePayload>({
    id: TIMEBOX_HOST_ID,
    handle(payload) {
      return applySelection(selectionFromGesture(payload), payload.phase);
    },
  }), []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    let frame = 0;
    const refreshCalibration = () => {
      frame = 0;
      const next = inferPlotCalibration(mount);
      if (next) calibrationRef.current = next;
    };
    const queueCalibration = () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(refreshCalibration);
    };

    const surface = buildInteractiveChart(mount, input, {
      backend: 'vegalite',
      renderer: 'svg',
      interactions: [dragInteraction, hostInteraction],
      ariaLabel: 'Line chart timebox prototype',
      chartId: 'flint-timebox-line',
    });
    surfaceRef.current = surface;

    const hostPointerDown = (event: PointerEvent) => {
      const calibration = calibrationRef.current;
      if (!calibration || event.button !== 0) return;
      const start = mountPoint(event, mount);
      if (!pointInsidePlot(start, calibration)) return;
      const target = event.target;
      if (target instanceof Element && target.closest('[aria-label*="Series:"]')) return;
      hostDragRef.current = { pointerId: event.pointerId, start, moved: false };
      setIsDragging(true);
      void surface.dispatch(TIMEBOX_HOST_ID, {
        phase: 'start',
        start,
        current: start,
        coordinateSpace: 'mount',
      });
      try {
        mount.setPointerCapture(event.pointerId);
      } catch {
        // Ignore synthetic-pointer capture failures.
      }
    };

    const hostPointerMove = (event: PointerEvent) => {
      const drag = hostDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      const current = mountPoint(event, mount);
      drag.moved = drag.moved || Math.hypot(current.x - drag.start.x, current.y - drag.start.y) >= 4;
      if (!drag.moved) return;
      void surface.dispatch(TIMEBOX_HOST_ID, {
        phase: 'preview',
        start: drag.start,
        current,
        coordinateSpace: 'mount',
      });
    };

    const finishHostDrag = (event: PointerEvent, phase: 'commit' | 'cancel') => {
      const drag = hostDragRef.current;
      if (!drag || drag.pointerId !== event.pointerId) return;
      hostDragRef.current = null;
      const current = mountPoint(event, mount);
      if (drag.moved) {
        void surface.dispatch(TIMEBOX_HOST_ID, {
          phase,
          start: drag.start,
          current,
          coordinateSpace: 'mount',
        });
      } else {
        setIsDragging(false);
      }
      try {
        mount.releasePointerCapture(event.pointerId);
      } catch {
        // Ignore synthetic-pointer capture failures.
      }
    };

    const hostPointerUp = (event: PointerEvent) => finishHostDrag(event, 'commit');
    const hostPointerCancel = (event: PointerEvent) => finishHostDrag(event, 'cancel');

    mount.addEventListener('pointerdown', hostPointerDown);
    mount.addEventListener('pointermove', hostPointerMove);
    mount.addEventListener('pointerup', hostPointerUp);
    mount.addEventListener('pointercancel', hostPointerCancel);

    const resizeObserver = new ResizeObserver(queueCalibration);
    resizeObserver.observe(mount);
    void surface.ready.then(() => {
      queueCalibration();
      window.setTimeout(queueCalibration, 0);
    });

    return () => {
      if (frame !== 0) window.cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      mount.removeEventListener('pointerdown', hostPointerDown);
      mount.removeEventListener('pointermove', hostPointerMove);
      mount.removeEventListener('pointerup', hostPointerUp);
      mount.removeEventListener('pointercancel', hostPointerCancel);
      surfaceRef.current = null;
      surface.destroy();
    };
  }, [dragInteraction, hostInteraction, input]);

  const clearTimebox = () => {
    committedSelectionRef.current = null;
    setSelection(null);
    setFilter(FULL_RESULT);
    setIsDragging(false);
    void surfaceRef.current?.applyUpdate(boxOverlayUpdate(null, FULL_RESULT));
  };

  return (
    <div className="ic-flint-dimpvis-shell timebox-stage">
      <div className="ic-stage-meta">
        <strong>Discrete timebox on a retained line chart</strong>
        <span>
          Drag anywhere in the plot to define a time window and value range. A series survives only
          if every sampled point inside that time window falls within the box.
        </span>
      </div>
      <div className="ic-toolbar">
        <span className="ic-pill" data-active={selection !== null}>Window: {summarizeSelection(selection)}</span>
        <span className="ic-pill" data-active={selection !== null}>
          Kept: {filter.keptSeries.length}/{TOTAL_SERIES}
        </span>
        <span className="ic-pill">Points checked: {selection ? filter.pointsInWindow : 0}</span>
      </div>
      <div className="ic-flint-dimpvis-panel">
        <ScaleToFit
          height={large ? 540 : 390}
          minHeight={large ? 400 : 285}
          adaptiveHeight
          padding={8}
        >
          <div className="ic-flint-dimpvis-mount" ref={mountRef} />
        </ScaleToFit>
      </div>
      <div className="ic-toolbar">
        <button
          type="button"
          className="ic-pill"
          onClick={clearTimebox}
        >
          Reset
        </button>
        <span className="timebox-stage__hint">
          {isDragging
            ? 'Dragging updates both the retained box overlay and the filtered main data.'
            : `Matches: ${filter.keptSeries.join(', ') || 'none'}`}
        </span>
      </div>
    </div>
  );
}
