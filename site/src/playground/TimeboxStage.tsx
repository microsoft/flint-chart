import { useEffect, useMemo, useRef, useState } from 'react';
import { LoaderCircle } from 'lucide-react';
import type { ChartAssemblyInput } from 'flint-chart';
import {
  buildInteractiveChart,
  rectangleTrigger,
  type CanvasInteractionDef,
  type ChartUpdate,
  type InteractiveChartSurface,
} from 'flint-chart/interactive';
import { ScaleToFit } from '../components/ScaleToFit';
import {
  filterRowsByTimebox,
  isValidTimeboxDate,
  normalizeTimeboxSelection,
  prepareTimeboxData,
  type PreparedTimeboxData,
  type TimeboxSelection,
} from './timebox-model';
import './timebox-stage.css';

const VIEW_WIDTH = 900;
const VIEW_HEIGHT = 520;
const DATA_UPDATE_ID = 'timebox-data';
const TIMEBOX_INTERACTION_ID = 'timebox-region';
interface WeatherData {
  dates: string[];
  cities: { name: string; temperature: number[] }[];
}

let weatherData: Promise<PreparedTimeboxData> | undefined;

function loadWeatherData(): Promise<PreparedTimeboxData> {
  weatherData ??= fetch(`${import.meta.env.BASE_URL}data/timebox-weather-2023.json`)
    .then(async response => {
      if (!response.ok) throw new Error(`Weather data request failed (${response.status})`);
      const data = await response.json() as WeatherData;
      return prepareTimeboxData(data.cities.flatMap(city => data.dates.flatMap((date, index) =>
        index % 5 === 0 || index === data.dates.length - 1
          ? [{ series: city.name, date, value: city.temperature[index] }]
          : [])), { indexValues: false });
    })
    .catch(error => {
      weatherData = undefined;
      throw error;
    });
  return weatherData;
}

function chartInput(prepared: PreparedTimeboxData): ChartAssemblyInput {
  return {
    data: { values: prepared.rows.map(({ Series, Date, Value }) => ({ Series, Date, Value })) },
    semantic_types: {
      Date: 'Date',
      Series: 'Category',
      Value: {
        semanticType: 'Temperature',
        intrinsicDomain: prepared.valueDomain,
      },
    },
    field_display_names: {
      Series: 'City',
      Value: 'Daily mean temperature (\u00b0C)',
    },
    theme_spec: {
      extends: 'datawrapper',
      ink: { series: { single: '#495760' } },
      legend: { show: 'never' },
      furniture: [],
    },
    options: { addTooltips: false },
    chart_spec: {
      chartType: 'Line Chart',
      title: 'Daily mean temperature, 2023',
      subtitle: '12 cities, sampled every 5 days; NASA POWER / MERRA-2 reanalysis',
      encodings: { x: 'Date', y: 'Value', detail: 'Series' },
      baseSize: { width: VIEW_WIDTH, height: VIEW_HEIGHT },
      canvasSize: { width: VIEW_WIDTH, height: VIEW_HEIGHT },
      chartProperties: {
        includeZero_y: false,
        showPoints: false,
      },
    },
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

function allSeriesTargets(prepared: PreparedTimeboxData) {
  return prepared.series.map((series) => ({ select: { key: { Series: series.key } } }));
}

function retainedSeriesTargets(symbols: readonly string[]) {
  return symbols.map((symbol) => ({ select: { key: { Series: symbol } } }));
}

function styleUpdate(prepared: PreparedTimeboxData, retainedSymbols?: readonly string[]): ChartUpdate {
  return {
    id: DATA_UPDATE_ID,
    ops: [{
      op: 'set-style',
      targets: allSeriesTargets(prepared),
      value: { opacity: retainedSymbols ? 0.08 : 0.4 },
    }, ...(retainedSymbols?.length
      ? [{
        op: 'set-style' as const,
        targets: retainedSeriesTargets(retainedSymbols),
        value: { opacity: 0.95 },
      }]
      : [])],
  };
}

export function TimeboxStage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<InteractiveChartSurface | null>(null);
  const scheduleRef = useRef<((selection: TimeboxSelection | null) => void) | null>(null);
  const [prepared, setPrepared] = useState<PreparedTimeboxData | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [isUpdating, setIsUpdating] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);
  const [selection, setSelection] = useState<TimeboxSelection | null>(null);
  const [retainedSymbols, setRetainedSymbols] = useState<string[]>([]);
  const [windowSampleCount, setWindowSampleCount] = useState(0);
  const totalCount = prepared?.series.length ?? 0;

  useEffect(() => {
    let cancelled = false;
    void loadWeatherData().then(data => {
      if (!cancelled) setPrepared(data);
    }).catch(error => {
      if (cancelled) return;
      setStatus('error');
      console.error('Timebox weather data failed to load', error);
    });
    return () => { cancelled = true; };
  }, []);

  const timeboxInteraction = useMemo<CanvasInteractionDef>(() => ({
    id: TIMEBOX_INTERACTION_ID,
    eventSource: { ...rectangleTrigger('contain'), mode: 'stateful' },
    reset: ['click-none'],
    onReset() {
      scheduleRef.current?.(null);
    },
    affordances: { plot: { cursor: 'region' } },
    handle(event) {
      if (event.action !== 'select-region' || event.phase !== 'commit') return null;
      const nextSelection = selectionFromEvent(event);
      if (!nextSelection) return null;
      if (nextSelection.startDate.getTime() === nextSelection.endDate.getTime()
        || nextSelection.minValue === nextSelection.maxValue) return null;
      scheduleRef.current?.(nextSelection);
      return null;
    },
  }), []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !prepared) return undefined;
    let cancelled = false;
    const surface = buildInteractiveChart(mount, chartInput(prepared), {
      backend: 'vegalite',
      renderer: 'svg',
      interactions: [timeboxInteraction],
      updates: [styleUpdate(prepared)],
      assistedTargeting: false,
      keyboardTargeting: false,
      ariaLabel: 'Daily mean temperatures in Celsius for 12 cities in 2023, with an editable timebox over five-day samples',
      chartId: 'timebox-stage',
    });
    surfaceRef.current = surface;
    let revision = 0;
    let pending: { revision: number; selection: TimeboxSelection | null } | null = null;
    let running = false;
    async function drainUpdates() {
      running = true;
      try {
        while (pending && !cancelled) {
          await new Promise<void>(resolve => {
            requestAnimationFrame(() => { window.setTimeout(resolve, 0); });
          });
          if (cancelled || !pending) return;
          const request = pending;
          pending = null;
          const filtered = filterRowsByTimebox(prepared!, request.selection);
          await surface.applyUpdate(styleUpdate(prepared!, request.selection ? filtered.retainedSymbols : undefined));
          if (cancelled) return;
          if (request.revision !== revision) continue;
          setSelection(request.selection);
          setRetainedSymbols(request.selection ? filtered.retainedSymbols : []);
          setWindowSampleCount(filtered.windowSampleCount);
        }
      } catch (error) {
        if (!cancelled) {
          if (!pending) setUpdateError('Timebox update failed.');
          console.error('Timebox update failed', error);
        }
      } finally {
        running = false;
        if (!cancelled) {
          if (pending) void drainUpdates();
          else setIsUpdating(false);
        }
      }
    }
    scheduleRef.current = nextSelection => {
      pending = { revision: ++revision, selection: nextSelection };
      setUpdateError(null);
      setIsUpdating(true);
      if (!running) void drainUpdates();
    };
    void surface.ready.then(() => {
      if (!cancelled) setStatus('ready');
    }).catch(error => {
      if (cancelled) return;
      setStatus('error');
      console.error('Timebox weather chart failed to build', error);
    });
    return () => {
      cancelled = true;
      pending = null;
      scheduleRef.current = null;
      surfaceRef.current = null;
      surface.destroy();
    };
  }, [prepared, timeboxInteraction]);

  const reset = () => {
    void surfaceRef.current?.clearUpdate(TIMEBOX_INTERACTION_ID);
    scheduleRef.current?.(null);
  };

  return (
    <div className="ic-flint-dimpvis-shell timebox-shell">
      <div className="ic-toolbar timebox-toolbar">
        <button type="button" className="ic-pill" disabled={status !== 'ready'} onClick={reset}>Reset</button>
        <span className="timebox-update-status" role="status">
          {isUpdating ? <><LoaderCircle size={13} aria-hidden="true" />Updating...</> : updateError}
        </span>
      </div>
      <div className="ic-flint-dimpvis-panel timebox-panel">
        {status !== 'ready' && <div className="timebox-loading" role="status">
          {status === 'loading'
            ? <progress aria-label="Loading daily temperatures" />
            : 'Daily temperatures could not be loaded.'}
        </div>}
        <ScaleToFit height={540} adaptiveHeight padding={8}>
          <div className="ic-flint-dimpvis-mount timebox-mount" ref={mountRef} />
        </ScaleToFit>
      </div>
      <div className="timebox-footer" aria-live="polite">
        {selection ? <>
          <strong>{retainedSymbols.length} of {totalCount} cities match</strong>
          <span>{retainedSymbols.length ? retainedSymbols.join(', ') : 'No matching cities.'}</span>
          <span>{windowSampleCount.toLocaleString()} displayed samples checked in the selected interval.</span>
        </> : prepared && <span>{totalCount} cities, {prepared.series[0].points.length} displayed samples per city.</span>}
      </div>
    </div>
  );
}
