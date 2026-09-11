import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import {
  buildInteractiveChart,
  rectangleTrigger,
  type CanvasInteractionDef,
  type ChartUpdate,
  type InteractiveChartSurface,
} from 'flint-chart/interactive';
import { ScaleToFit } from '../components/ScaleToFit';
import { INDEX_CHART_STOCKS } from '../data/index-chart-stocks';
import {
  filterRowsByTimebox,
  isValidTimeboxDate,
  normalizeTimeboxSelection,
  prepareTimeboxData,
  type TimeboxSelection,
} from './timebox-model';
import './timebox-stage.css';

const VIEW_WIDTH = 900;
const VIEW_HEIGHT = 520;
const DATA_UPDATE_ID = 'timebox-data';
const TIMEBOX_INTERACTION_ID = 'timebox-region';
const PREPARED = prepareTimeboxData(INDEX_CHART_STOCKS.map((row) => ({
  series: row.Symbol,
  date: row.Date,
  value: row.Close,
})));

function chartInput(rows = PREPARED.rows): ChartAssemblyInput {
  return {
    data: { values: rows },
    semantic_types: {
      Date: 'Date',
      Series: 'Category',
      IndexedValue: {
        semanticType: 'Quantity',
        intrinsicDomain: PREPARED.valueDomain,
      },
    },
    field_display_names: {
      Series: 'Ticker',
      IndexedValue: 'Indexed close (first sample = 100)',
      Value: 'Close price (USD)',
    },
    theme_spec: {
      extends: 'datawrapper',
      legend: { show: 'never' },
    },
    options: { addTooltips: false },
    chart_spec: {
      chartType: 'Line Chart',
      title: 'Timebox filtering on indexed stock closes',
      subtitle: 'Drag a box over date and indexed close. A stock stays only if every sampled point inside the time window falls within the box.',
      encodings: { x: 'Date', y: 'IndexedValue', color: 'Series' },
      baseSize: { width: VIEW_WIDTH, height: VIEW_HEIGHT },
      canvasSize: { width: VIEW_WIDTH, height: VIEW_HEIGHT },
      chartProperties: {
        includeZero_y: false,
        showPoints: false,
      },
    },
  };
}

function formatDate(date: Date) {
  return new Intl.DateTimeFormat('en', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(date);
}

function formatValue(value: number) {
  return value.toFixed(1);
}

function selectionSummary(selection: TimeboxSelection | null) {
  if (!selection) return null;
  if (!isValidTimeboxDate(selection.startDate) || !isValidTimeboxDate(selection.endDate)) return null;
  const normalized = normalizeTimeboxSelection(selection);
  return {
    date: `${formatDate(normalized.startDate)} to ${formatDate(normalized.endDate)}`,
    value: `${formatValue(normalized.minValue)} to ${formatValue(normalized.maxValue)}`,
  };
}

function selectionFromEvent(event: Parameters<NonNullable<CanvasInteractionDef['handle']>>[0]): TimeboxSelection | null {
  if (event.action !== 'select-region') return null;
  if (event.phase === 'start' || event.phase === 'cancel') return null;
  const xDomain = event.geometry.domain?.x;
  const yDomain = event.geometry.domain?.y;
  if (xDomain?.kind !== 'interval' || yDomain?.kind !== 'interval') return null;
  if (!isValidTimeboxDate(xDomain.start) || !isValidTimeboxDate(xDomain.end)) return null;
  const minValue = Number(yDomain.start);
  const maxValue = Number(yDomain.end);
  if (!Number.isFinite(minValue) || !Number.isFinite(maxValue)) return null;
  return normalizeTimeboxSelection({
    startDate: xDomain.start,
    endDate: xDomain.end,
    minValue,
    maxValue,
  });
}

function allSeriesTargets() {
  return PREPARED.series.map((series) => ({ select: { key: { Series: series.key } } }));
}

function retainedSeriesTargets(symbols: readonly string[]) {
  return symbols.map((symbol) => ({ select: { key: { Series: symbol } } }));
}

function styleUpdate(retainedSymbols: readonly string[]): ChartUpdate {
  return {
    id: DATA_UPDATE_ID,
    ops: retainedSymbols.length > 0
      ? [{
        op: 'set-style' as const,
        targets: retainedSeriesTargets(retainedSymbols),
        value: { state: 'emphasized' as const, mutedOpacity: 0.14 },
      }]
      : [{
        op: 'set-style' as const,
        targets: allSeriesTargets(),
        value: { opacity: 0.14 },
      }],
  };
}

export function TimeboxStage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<InteractiveChartSurface | null>(null);
  const [selection, setSelection] = useState<TimeboxSelection | null>(null);
  const [retainedCount, setRetainedCount] = useState(PREPARED.series.length);
  const [windowSampleCount, setWindowSampleCount] = useState(0);
  const totalCount = PREPARED.series.length;
  const summary = useMemo(() => selectionSummary(selection), [selection]);

  const timeboxInteraction = useMemo<CanvasInteractionDef>(() => ({
    id: TIMEBOX_INTERACTION_ID,
    eventSource: rectangleTrigger('contain'),
    affordances: [{ target: 'plot', cursor: 'region' }],
    handle(event) {
      if (event.action !== 'select-region' || event.phase !== 'commit') return null;
      const nextSelection = selectionFromEvent(event);
      if (!nextSelection) return null;
      const filtered = filterRowsByTimebox(PREPARED, nextSelection);
      setSelection(nextSelection);
      setRetainedCount(filtered.retainedSymbols.length);
      setWindowSampleCount(filtered.windowSampleCount);
      return styleUpdate(filtered.retainedSymbols);
    },
  }), []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    const surface = buildInteractiveChart(mount, chartInput(), {
      backend: 'vegalite',
      renderer: 'svg',
      interactions: [timeboxInteraction],
      ariaLabel: 'Timebox filtering over indexed stock series',
      chartId: 'timebox-stage',
    });
    surfaceRef.current = surface;
    return () => {
      surfaceRef.current = null;
      surface.destroy();
    };
  }, [timeboxInteraction]);

  const reset = () => {
    setSelection(null);
    setRetainedCount(totalCount);
    setWindowSampleCount(0);
    const surface = surfaceRef.current;
    if (!surface) return;
    void (async () => {
      await surface.applyUpdate({
        id: DATA_UPDATE_ID,
        ops: [{
          op: 'set-style',
          targets: [],
          value: { state: 'normal' },
        }],
      });
    })();
  };

  return (
    <div className="ic-flint-dimpvis-shell timebox-shell">
      <div className="ic-stage-meta">
        <strong>Discrete timebox over sampled stock series</strong>
        <span>
          Drag a rectangular box directly on the plot. The prototype keeps only the tickers whose
          sampled points within that time window all stay inside the indexed value band.
        </span>
      </div>
      <div className="ic-toolbar timebox-toolbar">
        <span className="ic-pill" data-active={selection !== null}>
          {selection ? `Retained: ${retainedCount}/${totalCount}` : `Series: ${totalCount}`}
        </span>
        <span className="ic-pill" data-active={selection !== null}>
          {summary ? `Time: ${summary.date}` : 'Time: none'}
        </span>
        <span className="ic-pill" data-active={selection !== null}>
          {summary ? `Value: ${summary.value}` : 'Value: none'}
        </span>
        <button type="button" className="ic-pill" onClick={reset}>Reset</button>
      </div>
      <div className="ic-flint-dimpvis-panel">
        <ScaleToFit height={540} minHeight={400} adaptiveHeight padding={8}>
          <div className="ic-flint-dimpvis-mount timebox-mount" ref={mountRef} />
        </ScaleToFit>
      </div>
      <div className="timebox-footer">
        <span>
          {selection
            ? retainedCount === 0
              ? `${windowSampleCount} sampled points were tested in the selected window, and no series satisfied the full timebox constraint.`
              : `${windowSampleCount} sampled points were tested inside the selected time window.`
            : 'No active box. Draw on the plot area to define a time window and value constraints.'}
        </span>
      </div>
    </div>
  );
}
