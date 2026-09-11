import { useEffect, useMemo, useRef, useState } from 'react';
import { scaleLinear, scaleUtc } from 'd3';
import type { ChartAssemblyInput } from 'flint-chart';
import {
  buildInteractiveChart,
  inspectIndex,
  type FlintInteractionEventDetail,
  type InteractiveChartSurface,
} from 'flint-chart/interactive';
import { ScaleToFit } from '../components/ScaleToFit';
import { INDEX_CHART_STOCKS } from '../data/index-chart-stocks';
import {
  deriveIndexChartState,
  clampDateToPreparedDomain,
  prepareIndexChartData,
} from './index-chart-model';
import './index-chart-stage.css';

const VIEW_WIDTH = 900;
const VIEW_HEIGHT = 520;
const FALLBACK_PLOT_BOUNDS = { left: 63, right: 760, top: 26, bottom: 474 };
const DATA_UPDATE_ID = 'index-chart-data';
const INSPECT_INTERACTION_ID = 'index-chart-inspect';
const PREPARED = prepareIndexChartData(INDEX_CHART_STOCKS);
const INITIAL_ACTIVE_DATE = new Date('2015-05-13T00:00:00Z');

function xScaleForBounds(bounds: { left: number; right: number }) {
  return scaleUtc()
    .domain([PREPARED.minDate, PREPARED.maxDate])
    .range([bounds.left, bounds.right])
    .clamp(true);
}

function chartInput(rows: ReturnType<typeof deriveIndexChartState>['indexedRows']): ChartAssemblyInput {
  return {
    data: { values: rows },
    semantic_types: {
      Date: 'Date',
      Symbol: 'Category',
      IndexedReturn: {
        semanticType: 'Quantity',
        intrinsicDomain: PREPARED.returnDomain,
      },
    },
    field_display_names: {
      IndexedReturn: 'Return vs. reference date',
      Symbol: 'Ticker',
    },
    theme_spec: {
      extends: 'datawrapper',
      legend: {
        show: 'always',
        placement: ['seriesEnd', 'right'],
      },
    },
    options: { addTooltips: false },
    chart_spec: {
      chartType: 'Line Chart',
      title: 'Index chart (Flint + D3 reference)',
      subtitle: 'Flint redraws the return lines; the host overlay supplies the movable reference cursor.',
      encodings: { x: 'Date', y: 'IndexedReturn', color: 'Symbol' },
      baseSize: { width: VIEW_WIDTH, height: VIEW_HEIGHT },
      canvasSize: { width: VIEW_WIDTH, height: VIEW_HEIGHT },
      chartProperties: {
        includeZero_y: true,
        showPoints: false,
      },
    },
  };
}

function measurePlotBounds(mount: HTMLDivElement) {
  const frame = mount.querySelector<SVGGraphicsElement>('.mark-group.role-frame.root');
  if (!frame) return FALLBACK_PLOT_BOUNDS;
  const background = [...frame.children]
    .find((child): child is SVGGraphicsElement => child instanceof SVGGraphicsElement
      && child.classList.contains('background'));
  const box = (background ?? frame).getBBox();
  const lineBoxes = [...mount.querySelectorAll<SVGGraphicsElement>('g.mark-line.role-mark path')]
    .map((path) => path.getBBox())
    .filter((candidate) =>
      Number.isFinite(candidate.x)
      && Number.isFinite(candidate.width)
      && candidate.width > 2);
  const matrix = frame.getCTM();
  const scaleX = matrix?.a || 1;
  const scaleY = matrix?.d || scaleX;
  const plotX = lineBoxes.length > 0 ? Math.min(...lineBoxes.map((candidate) => candidate.x)) : box.x;
  const plotRight = lineBoxes.length > 0
    ? Math.max(...lineBoxes.map((candidate) => candidate.x + candidate.width))
    : box.x + box.width;
  const left = ((matrix?.e ?? 0) / scaleX) + plotX;
  const top = ((matrix?.f ?? 0) / scaleY) + box.y;
  const width = plotRight - plotX;
  if (!Number.isFinite(width) || !Number.isFinite(box.height) || width < 2 || box.height < 2) {
    return FALLBACK_PLOT_BOUNDS;
  }
  return {
    left,
    right: left + width,
    top,
    bottom: top + box.height,
  };
}

function formatMonth(date: Date) {
  return new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

export function IndexChartStage() {
  const initialState = useMemo(() => deriveIndexChartState(PREPARED, INITIAL_ACTIVE_DATE), []);
  const [activeDate, setActiveDate] = useState(initialState.activeDate);
  const derived = useMemo(() => deriveIndexChartState(PREPARED, activeDate), [activeDate]);
  const [plotBounds, setPlotBounds] = useState(FALLBACK_PLOT_BOUNDS);
  const [cursorX, setCursorX] = useState(() => xScaleForBounds(FALLBACK_PLOT_BOUNDS)(initialState.activeDate));
  const mountRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<InteractiveChartSurface | null>(null);
  const inspectInteraction = useMemo(() => inspectIndex({
    id: INSPECT_INTERACTION_ID,
    axis: 'x',
    show: 'all',
  }), []);
  const plotWidth = Math.max(1, plotBounds.right - plotBounds.left);
  const plotXScale = useMemo(() => (
    scaleUtc()
      .domain([PREPARED.minDate, PREPARED.maxDate])
      .range([0, plotWidth])
      .clamp(true)
  ), [plotWidth]);
  const plotBoundsRef = useRef(plotBounds);
  const plotWidthRef = useRef(plotWidth);
  const plotXScaleRef = useRef(plotXScale);

  useEffect(() => {
    plotBoundsRef.current = plotBounds;
    plotWidthRef.current = plotWidth;
    plotXScaleRef.current = plotXScale;
  }, [plotBounds, plotWidth, plotXScale]);

  const xScale = useMemo(() => xScaleForBounds(plotBounds), [plotBounds.left, plotBounds.right]);

  const yScale = useMemo(() => (
    scaleLinear()
      .domain(PREPARED.returnDomain)
      .range([plotBounds.bottom, plotBounds.top])
  ), [plotBounds.bottom, plotBounds.top]);

  const activeX = xScale(derived.activeDate);
  const ruleX = Number.isFinite(cursorX) ? cursorX : activeX;
  const baselineY = yScale(0);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const handleInteraction = (event: Event) => {
      const detail = (event as CustomEvent<FlintInteractionEventDetail>).detail;
      if (detail.interactionId !== INSPECT_INTERACTION_ID) return;
      if (detail.event.phase === 'cancel') return;

      const plot = detail.event.geometry.plot;
      if (plot?.kind === 'point') {
        const currentBounds = plotBoundsRef.current;
        const currentWidth = plotWidthRef.current;
        const currentScale = plotXScaleRef.current;
        const localX = Math.max(0, Math.min(currentWidth, plot.point.x));
        const nextCursorX = currentBounds.left + localX;
        const nextDate = clampDateToPreparedDomain(PREPARED, currentScale.invert(localX));
        setCursorX(Math.max(currentBounds.left, Math.min(currentBounds.right, nextCursorX)));
        setActiveDate((current) => (current.getTime() === nextDate.getTime() ? current : nextDate));
      }
    };

    mount.addEventListener('flint-interaction', handleInteraction);

    const surface = buildInteractiveChart(mount, chartInput(initialState.indexedRows), {
      backend: 'vegalite',
      renderer: 'svg',
      interactions: [inspectInteraction],
      ariaLabel: 'Index chart with a movable reference date',
      chartId: 'index-chart-stage',
    });
    surfaceRef.current = surface;
    void surface.ready.then(() => {
      if (!mount.isConnected) return;
      setPlotBounds(measurePlotBounds(mount));
    });

    return () => {
      mount.removeEventListener('flint-interaction', handleInteraction);
      surfaceRef.current = null;
      surface.destroy();
    };
  }, [initialState.indexedRows, inspectInteraction]);

  useEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return undefined;
    let cancelled = false;

    void surface.ready.then(async () => {
      if (cancelled) return;
      await surface.applyUpdate({
        id: DATA_UPDATE_ID,
        ops: [{
          op: 'set-data',
          source: 'main',
          value: { rows: derived.indexedRows as unknown as Record<string, unknown>[] },
        }],
      });
      const mount = mountRef.current;
      if (mount && mount.isConnected) setPlotBounds(measurePlotBounds(mount));
    });

    return () => {
      cancelled = true;
    };
  }, [derived.indexedRows]);

  useEffect(() => {
    setCursorX(activeX);
  }, [activeX]);
  return (
    <div className="ic-flint-dimpvis-shell index-chart-shell">
      <div className="ic-stage-meta">
        <strong>Continuous reference date</strong>
        <span>
          Move across the chart to re-index every series against the current date.
        </span>
      </div>
      <div className="ic-flint-dimpvis-panel">
        <ScaleToFit height={540} minHeight={400} adaptiveHeight padding={8}>
          <div className="index-chart-stack">
            <div ref={mountRef} className="ic-flint-dimpvis-mount index-chart-mount" />
            <svg
              className="index-chart-overlay"
              viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
              aria-label="Reference cursor overlay"
            >
              <line
                x1={plotBounds.left}
                x2={plotBounds.right}
                y1={baselineY}
                y2={baselineY}
                className="index-chart-baseline"
              />
              <g
                className="index-chart-badge"
                transform={`translate(${Math.max(plotBounds.left + 54, Math.min(plotBounds.right - 54, ruleX))}, ${plotBounds.top + 16})`}
              >
                <rect x={-50} y={-12} width={100} height={22} rx={11} />
                <text y={4} textAnchor="middle">{formatMonth(derived.activeDate)}</text>
              </g>
            </svg>
          </div>
        </ScaleToFit>
      </div>
      <div className="index-chart-footer">
        <span className="ic-pill" data-active="true">Reference: {formatMonth(derived.activeDate)}</span>
      </div>
    </div>
  );
}
