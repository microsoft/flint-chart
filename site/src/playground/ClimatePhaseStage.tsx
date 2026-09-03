import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import {
  buildInteractiveChart,
  clickTrigger,
  dragTrigger,
  externalInteraction,
  type CanvasInteractionDef,
  type ChartUpdate,
  type FlintInteractionEventDetail,
  type InteractiveChartSurface,
} from 'flint-chart/interactive';
import { ScaleToFit } from '../components/ScaleToFit';
import { CLIMATE_CITIES, CLIMATE_MONTHS, type ClimateCity } from './climate-phase-data';
import './interaction-candidates.css';

const MARK_CLICK_ID = 'climate-phase-city-mark';
const LEGEND_CLICK_ID = 'climate-phase-city-legend';
const TRAJECTORY_ID = 'climate-phase-trajectory';
const PLAYBACK_ID = 'climate-phase-playback';

const MARK_CLICK: CanvasInteractionDef = {
  id: MARK_CLICK_ID,
  eventSource: { ...clickTrigger, defaultAssistDistance: 12 },
  affordances: [{ target: 'mark', cursor: 'activate', hover: 'target' }],
  handle() {
    return null;
  },
};

const LEGEND_CLICK: CanvasInteractionDef = {
  id: LEGEND_CLICK_ID,
  eventSource: clickTrigger,
  claimsLegendActivation: true,
  affordances: [{ target: 'legend-item', cursor: 'activate', hover: 'cohort' }],
  handle() {
    return null;
  },
};

type ClimateFrame = {
  phase: number;
  temperature: number;
  precipitation: number;
};

function wrapPhase(phase: number) {
  return ((phase % 12) + 12) % 12;
}

function frameAt(city: ClimateCity, phase: number): ClimateFrame {
  const wrapped = wrapPhase(phase);
  const lower = Math.floor(wrapped);
  const upper = (lower + 1) % 12;
  const t = wrapped - lower;
  return {
    phase: wrapped,
    temperature: city.temperature[lower] + (city.temperature[upper] - city.temperature[lower]) * t,
    precipitation: city.precipitation[lower] + (city.precipitation[upper] - city.precipitation[lower]) * t,
  };
}

function monthLabel(phase: number) {
  const wrapped = wrapPhase(phase);
  const month = Math.floor(wrapped);
  const day = Math.min(28, Math.floor((wrapped - month) * 30) + 1);
  return day === 1 ? CLIMATE_MONTHS[month] : `${CLIMATE_MONTHS[month]} ${day}`;
}

function chartRow(city: ClimateCity, frame: ClimateFrame, order = frame.phase) {
  return {
    City: city.name,
    Phase: order,
    Month: monthLabel(frame.phase),
    Temperature: frame.temperature,
    Precipitation: frame.precipitation,
  };
}

function snapshotRows(phase: number) {
  return CLIMATE_CITIES.map((city) => chartRow(city, frameAt(city, phase)));
}

function trajectoryRows(city: ClimateCity) {
  return Array.from({ length: 13 }, (_, phase) => chartRow(city, frameAt(city, phase), phase));
}

function trajectoryOverlayUpdate(city: ClimateCity, phase: number): ChartUpdate {
  const rows = trajectoryRows(city);
  return {
    id: TRAJECTORY_ID,
    ops: [
      {
        op: 'set-overlay' as const,
        name: 'active-month',
        value: {
          mark: 'text' as const,
          role: 'month-watermark',
          data: { values: [{ Temperature: 12, Precipitation: 3.1, Month: monthLabel(phase) }] },
          encodings: {
            x: { field: 'Temperature' },
            y: { field: 'Precipitation' },
            text: { field: 'Month' },
          },
          style: { fill: '#69737d', fontSize: 92, fontWeight: 'bold', opacity: 0.1 },
        },
      },
      {
        op: 'set-overlay' as const,
        name: 'trajectory',
        value: {
          mark: 'line' as const,
          role: 'trajectory',
          interactive: true,
          projectable: true,
          data: { values: rows },
          encodings: {
            x: { field: 'Temperature' },
            y: { field: 'Precipitation' },
            order: { field: 'Phase' },
            color: { field: 'City' },
          },
          style: { strokeWidth: 2.5, opacity: 0.78 },
        },
      },
      {
        op: 'set-overlay' as const,
        name: 'trajectory-months',
        value: {
          mark: 'text' as const,
          role: 'trajectory-label',
          data: { values: rows.slice(0, 12) },
          encodings: {
            x: { field: 'Temperature' },
            y: { field: 'Precipitation' },
            color: { field: 'City' },
            text: { field: 'Month' },
          },
          style: { dx: 7, dy: -5, textAlign: 'start', fontSize: 10, opacity: 0.68 },
        },
      },
    ],
  };
}

function trajectoryFrameUpdate(city: ClimateCity, phase: number): ChartUpdate {
  return {
    id: TRAJECTORY_ID,
    ops: [
      ...trajectoryOverlayUpdate(city, phase).ops,
      { op: 'set-data', source: 'main', value: { rows: snapshotRows(phase) } },
    ],
  };
}

function cityFromPoint(detail: FlintInteractionEventDetail) {
  if (detail.event.target?.visual.role !== 'symbol') return null;
  const element = detail.event.target.elements[0];
  const row = (element?.records?.[0] ?? element?.value) as Record<string, unknown> | undefined;
  return typeof row?.City === 'string' ? row.City : null;
}

function cityFromLegend(detail: FlintInteractionEventDetail) {
  if (detail.event.target?.visual.role !== 'legend-item') return null;
  const value = detail.event.target.elements[0]?.value as {
    field?: unknown;
    domain?: { kind?: unknown; value?: unknown };
  } | undefined;
  return value?.field === 'City' && value.domain?.kind === 'value' && typeof value.domain.value === 'string'
    ? value.domain.value
    : null;
}

function chartInput(): ChartAssemblyInput {
  return {
    data: { values: snapshotRows(0) },
    semantic_types: {
      City: 'City',
      Temperature: { semanticType: 'Quantity', intrinsicDomain: [-5, 30] },
      Precipitation: { semanticType: 'Quantity', intrinsicDomain: [0, 7] },
    },
    field_display_names: {
      Temperature: 'Temperature (°C)',
      Precipitation: 'Precipitation (mm/day)',
    },
    theme_spec: {
      extends: 'datawrapper',
      geometry: { point: { size: 180 } },
    },
    options: { addTooltips: false },
    chart_spec: {
      chartType: 'Scatter Plot',
      title: 'Seasonal climate phase portrait',
      encodings: { x: 'Temperature', y: 'Precipitation', color: 'City' },
      baseSize: { width: 900, height: 520 },
      canvasSize: { width: 900, height: 520 },
      chartProperties: { includeZero_x: false, includeZero_y: true },
    },
  };
}

const CHART_INPUT = chartInput();

export function ClimatePhaseStage() {
  const [selectedCity, setSelectedCity] = useState('Seattle');
  const [activePhase, setActivePhase] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const selectedCityRef = useRef(selectedCity);
  const activePhaseRef = useRef(activePhase);
  selectedCityRef.current = selectedCity;
  activePhaseRef.current = activePhase;
  const mountRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<InteractiveChartSurface | null>(null);

  const dragInteraction = useMemo<CanvasInteractionDef>(() => ({
    id: TRAJECTORY_ID,
    eventSource: dragTrigger(),
    affordances: [{ target: 'mark', cursor: 'drag', hover: 'target' }],
    handle(event) {
      if (event.action !== 'drag-element') return null;
      if (event.phase === 'start') setIsPlaying(false);
      const record = event.target?.elements[0]?.records?.[0] ?? event.target?.elements[0]?.value;
      const targetCity = typeof record?.City === 'string' ? record.City : undefined;
      if (event.phase === 'start' && targetCity) {
        const city = CLIMATE_CITIES.find((candidate) => candidate.name === targetCity);
        if (!city) return null;
        selectedCityRef.current = city.name;
        setSelectedCity(city.name);
        return trajectoryOverlayUpdate(city, activePhaseRef.current);
      }

      const segment = event.geometry.projection?.segment;
      if (!segment) return null;
      const start = Number(segment.start.value.Phase);
      const end = Number(segment.end.value.Phase);
      if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
      const phase = wrapPhase(start + (end - start) * segment.t);
      const city = CLIMATE_CITIES.find((candidate) => candidate.name === selectedCityRef.current);
      if (!city) return null;
      activePhaseRef.current = phase;
      setActivePhase(phase);
      return trajectoryFrameUpdate(city, phase);
    },
  }), []);

  const playbackInteraction = useMemo(() => externalInteraction<{ city: string; phase: number }>({
    id: PLAYBACK_ID,
    handle({ city: cityName, phase }) {
      const city = CLIMATE_CITIES.find((candidate) => candidate.name === cityName);
      if (!city) return null;
      selectedCityRef.current = city.name;
      activePhaseRef.current = wrapPhase(phase);
      setSelectedCity(city.name);
      setActivePhase(wrapPhase(phase));
      return trajectoryFrameUpdate(city, phase);
    },
  }), []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;

    const selectCity = (cityName: string) => {
      const city = CLIMATE_CITIES.find((candidate) => candidate.name === cityName);
      if (!city) return;
      selectedCityRef.current = city.name;
      setSelectedCity(city.name);
      setIsPlaying(false);
      void surfaceRef.current?.applyUpdate(trajectoryOverlayUpdate(city, activePhaseRef.current));
    };
    const handleInteraction = (event: Event) => {
      const detail = (event as CustomEvent<FlintInteractionEventDetail>).detail;
      if (detail.event.phase !== 'commit') return;
      const cityName = cityFromLegend(detail) ?? cityFromPoint(detail);
      if (cityName) selectCity(cityName);
    };

    mount.addEventListener('flint-interaction', handleInteraction);
    const surface = buildInteractiveChart(mount, CHART_INPUT, {
      backend: 'vegalite',
      renderer: 'svg',
      interactions: [MARK_CLICK, LEGEND_CLICK, dragInteraction, playbackInteraction],
      ariaLabel: 'Seasonal climate phase portrait',
      chartId: 'climate-phase-main',
    });
    surfaceRef.current = surface;
    void surface.ready.then(() => {
      const city = CLIMATE_CITIES.find((candidate) => candidate.name === selectedCityRef.current);
      return city ? surface.applyUpdate(trajectoryFrameUpdate(city, activePhaseRef.current)) : undefined;
    });

    return () => {
      mount.removeEventListener('flint-interaction', handleInteraction);
      surfaceRef.current = null;
      surface.destroy();
    };
  }, [dragInteraction, playbackInteraction]);

  useEffect(() => {
    if (!isPlaying) return undefined;
    let cancelled = false;
    let animationFrame: number | undefined;
    const play = async () => {
      const surface = surfaceRef.current;
      if (!surface) return;
      await surface.ready;
      const cityName = selectedCityRef.current;
      const startPhase = activePhaseRef.current;
      let startTime: number | undefined;
      const tick = async (time: number) => {
        if (cancelled) return;
        startTime ??= time;
        const elapsedPhase = (time - startTime) / 400;
        const phase = startPhase + Math.min(12, elapsedPhase);
        await surface.dispatch(PLAYBACK_ID, { city: cityName, phase });
        if (cancelled) return;
        if (elapsedPhase >= 12) {
          setIsPlaying(false);
          return;
        }
        animationFrame = window.requestAnimationFrame((nextTime) => void tick(nextTime));
      };
      animationFrame = window.requestAnimationFrame((time) => void tick(time));
    };
    void play();
    return () => {
      cancelled = true;
      if (animationFrame !== undefined) window.cancelAnimationFrame(animationFrame);
    };
  }, [isPlaying]);

  return (
    <div className="ic-flint-dimpvis-shell climate-phase-shell">
      <div className="ic-stage-meta">
        <strong>One year hidden in a scatterplot</strong>
        <span>
          Select a city, then drag its closed climate loop. Crossing December into January wraps
          every city through the same interpolated point in the annual cycle.
        </span>
      </div>
      <div className="ic-toolbar">
        <span className="ic-pill" data-active="true">City: {selectedCity}</span>
        <span className="ic-pill" data-active="true">Month: {monthLabel(activePhase)}</span>
      </div>
      <div className="ic-flint-dimpvis-panel">
        <ScaleToFit height={540} minHeight={400} adaptiveHeight padding={8}>
          <div className="ic-flint-dimpvis-mount" ref={mountRef} />
        </ScaleToFit>
      </div>
      <div className="ic-toolbar climate-phase-footer">
        <button
          type="button"
          className="ic-pill"
          data-active={isPlaying}
          aria-pressed={isPlaying}
          onClick={() => setIsPlaying((playing) => !playing)}
        >
          {isPlaying ? 'Pause' : `▶ Play ${selectedCity}`}
        </button>
        <a
          href="https://power.larc.nasa.gov/docs/services/api/temporal/climatology/"
          target="_blank"
          rel="noreferrer"
        >
          NASA POWER · MERRA-2 · 1991–2020
        </a>
      </div>
    </div>
  );
}
