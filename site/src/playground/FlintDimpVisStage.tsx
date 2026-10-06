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
import { TRAJECTORY_SERIES as SERIES } from './bespoke-interaction-data';
import './interaction-candidates.css';



type CountrySeries = (typeof SERIES)[number];
type Frame = CountrySeries['frames'][number];

const SEMANTIC_TYPES: ChartAssemblyInput['semantic_types'] = {
  Country: 'Country',
  Fertility: { semanticType: 'Quantity', intrinsicDomain: [1, 8] },
  Life: { semanticType: 'Quantity', intrinsicDomain: [30, 85] },
  Population: { semanticType: 'Quantity', intrinsicDomain: [0, 1_400_000_000] },
};

const MAIN_MARK_INTERACTION_ID = 'flint-dimpvis-country-mark';
const MAIN_LEGEND_INTERACTION_ID = 'flint-dimpvis-country-legend';
const TRAJECTORY_UPDATE_ID = 'flint-dimpvis-trajectory';
const PLAYBACK_INTERACTION_ID = 'flint-dimpvis-playback';

const MAIN_MARK_CLICK_INTERACTION: CanvasInteractionDef = {
  id: MAIN_MARK_INTERACTION_ID,
  eventSource: { ...clickTrigger, defaultAssistDistance: 12 },
  affordances: { mark: { cursor: 'activate', hover: 'target' } },
  handle() {
    return null;
  },
};

const MAIN_LEGEND_CLICK_INTERACTION: CanvasInteractionDef = {
  id: MAIN_LEGEND_INTERACTION_ID,
  eventSource: clickTrigger,
  affordances: { 'legend-item': { cursor: 'activate', hover: 'cohort' } },
  handle() {
    return null;
  },
};

function interpolateFrame(frames: readonly Frame[], year: number): Frame {
  if (year <= frames[0].year) return { ...frames[0], year };
  if (year >= frames[frames.length - 1].year) return { ...frames[frames.length - 1], year };
  const upperIndex = frames.findIndex((frame) => frame.year >= year);
  const lower = frames[upperIndex - 1];
  const upper = frames[upperIndex];
  const t = (year - lower.year) / (upper.year - lower.year);
  return {
    year,
    fertility: lower.fertility + (upper.fertility - lower.fertility) * t,
    life: lower.life + (upper.life - lower.life) * t,
    population: lower.population + (upper.population - lower.population) * t,
  };
}

function chartRow(series: CountrySeries, frame: Frame) {
  return {
    Country: series.name,
    Year: frame.year,
    YearLabel: String(frame.year),
    Fertility: frame.fertility,
    Life: frame.life,
    Population: frame.population,
  };
}

function snapshotRows(year: number) {
  return SERIES.map((series) => chartRow(series, interpolateFrame(series.frames, year)));
}

function trajectoryOverlayUpdate(series: CountrySeries, year: number): ChartUpdate {
  const trajectoryRows = series.frames.map((frame) => chartRow(series, frame));
  return {
    id: TRAJECTORY_UPDATE_ID,
    ops: [
      {
        op: 'set-overlay' as const,
        name: 'active-year',
        value: {
          mark: 'text' as const,
          role: 'year-watermark',
          data: {
            values: [{ Fertility: 4.5, Life: 57.5, YearLabel: String(Math.round(year)) }],
          },
          encodings: {
            x: { field: 'Fertility' },
            y: { field: 'Life' },
            text: { field: 'YearLabel' },
          },
          style: { fill: '#69737d', fontSize: 144, fontWeight: 'bold', opacity: 0.11 },
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
          data: { values: trajectoryRows },
          encodings: {
            x: { field: 'Fertility' },
            y: { field: 'Life' },
            order: { field: 'Year' },
            color: { field: 'Country' },
          },
          style: { strokeWidth: 2.25, strokeDash: [6, 4], opacity: 0.72 },
        },
      },
      {
        op: 'set-overlay' as const,
        name: 'trajectory-years',
        value: {
          mark: 'text' as const,
          role: 'trajectory-label',
          data: { values: trajectoryRows },
          encodings: {
            x: { field: 'Fertility' },
            y: { field: 'Life' },
            color: { field: 'Country' },
            text: { field: 'YearLabel' },
          },
          style: { dx: 7, dy: -5, textAlign: 'start', fontSize: 10, opacity: 0.68 },
        },
      },
    ],
  };
}

function trajectoryFrameUpdate(series: CountrySeries, year: number): ChartUpdate {
  return {
    id: TRAJECTORY_UPDATE_ID,
    ops: [
      ...trajectoryOverlayUpdate(series, year).ops,
      { op: 'set-data', source: 'main', value: { rows: snapshotRows(year) } },
    ],
  };
}

function pointCountry(detail: FlintInteractionEventDetail): string | null {
  if (detail.event.target?.visual.role !== 'symbol') return null;
  const element = detail.event.target?.elements[0];
  const row = (element?.records?.[0] ?? element?.value) as Record<string, unknown> | undefined;
  return typeof row?.Country === 'string' ? row.Country : null;
}

function legendCountry(detail: FlintInteractionEventDetail): string | null {
  if (detail.event.target?.visual.role !== 'legend-item') return null;
  const element = detail.event.target.elements[0];
  const value = element?.value as {
    field?: unknown;
    domain?: { kind?: unknown; value?: unknown };
  } | undefined;
  if (value?.field === 'Country' && value.domain?.kind === 'value' && typeof value.domain.value === 'string') {
    return value.domain.value;
  }
  return null;
}

function mainInput(large: boolean): ChartAssemblyInput {
  const size = large ? { width: 900, height: 520 } : { width: 620, height: 380 };
  return {
    data: { values: snapshotRows(1980) },
    semantic_types: SEMANTIC_TYPES,
    theme_spec: 'powerbi-light',
    options: { addTooltips: false },
    chart_spec: {
      chartType: 'Scatter Plot',
      title: 'Global health trajectories',
      encodings: { x: 'Fertility', y: 'Life', color: 'Country', size: 'Population' },
      baseSize: size,
      canvasSize: size,
      chartProperties: { includeZero_x: false, includeZero_y: false },
    },
  };
}

export function FlintDimpVisStage({ large = false }: { large?: boolean } = {}) {
  const chartInput = useMemo(() => mainInput(large), [large]);
  const [selectedCountry, setSelectedCountry] = useState('India');
  const [activeYear, setActiveYear] = useState(1980);
  const [isPlaying, setIsPlaying] = useState(false);
  const selectedCountryRef = useRef(selectedCountry);
  const activeYearRef = useRef(activeYear);
  selectedCountryRef.current = selectedCountry;
  activeYearRef.current = activeYear;
  const mainMountRef = useRef<HTMLDivElement>(null);
  const mainSurfaceRef = useRef<InteractiveChartSurface | null>(null);

  const dragInteraction = useMemo<CanvasInteractionDef>(() => ({
    id: TRAJECTORY_UPDATE_ID,
    eventSource: dragTrigger(),
    affordances: { mark: { cursor: 'drag', hover: 'target' } },
    handle(event) {
      if (event.action !== 'drag') return null;
      if (event.phase === 'start') setIsPlaying(false);
      const targetRecord = event.target?.elements[0]?.records?.[0]
        ?? event.target?.elements[0]?.value;
      const targetCountry = typeof targetRecord?.Country === 'string'
        ? targetRecord.Country
        : undefined;
      if (event.phase === 'start' && targetCountry) {
        const series = SERIES.find((candidate) => candidate.name === targetCountry);
        if (!series) return null;
        selectedCountryRef.current = series.name;
        setSelectedCountry(series.name);
        return trajectoryOverlayUpdate(series, activeYearRef.current);
      }

      const projection = event.geometry.projection;
      if (projection?.kind !== 'path') return null;
      const startYear = Number(projection.segment.start.value.Year);
      const endYear = Number(projection.segment.end.value.Year);
      if (!Number.isFinite(startYear) || !Number.isFinite(endYear)) return null;
      const year = startYear + (endYear - startYear) * projection.segment.t;
      const series = SERIES.find((candidate) => candidate.name === selectedCountryRef.current);
      if (!series) return null;
      activeYearRef.current = year;
      setActiveYear(year);
      return trajectoryFrameUpdate(series, year);
    },
  }), []);

  const playbackInteraction = useMemo(() => externalInteraction<{
    country: string;
    year: number;
  }>({
    id: PLAYBACK_INTERACTION_ID,
    handle({ country, year }) {
      const series = SERIES.find((candidate) => candidate.name === country);
      if (!series) return null;
      selectedCountryRef.current = country;
      activeYearRef.current = year;
      setSelectedCountry(country);
      setActiveYear(year);
      return trajectoryFrameUpdate(series, year);
    },
  }), []);

  useEffect(() => {
    const mount = mainMountRef.current;
    if (!mount) return undefined;

    const handleInteraction = (event: Event) => {
      const detail = (event as CustomEvent<FlintInteractionEventDetail>).detail;
      if (detail.event.phase !== 'commit') return;
      setIsPlaying(false);
      const legendSelection = legendCountry(detail);
      if (legendSelection) {
        selectedCountryRef.current = legendSelection;
        const series = SERIES.find((candidate) => candidate.name === legendSelection);
        if (series) {
          void mainSurfaceRef.current?.applyUpdate(trajectoryOverlayUpdate(series, activeYearRef.current));
        }
        setSelectedCountry(legendSelection);
        return;
      }
      const country = pointCountry(detail);
      if (!country) return;
      const series = SERIES.find((candidate) => candidate.name === country);
      if (!series) return;
      selectedCountryRef.current = country;
      setSelectedCountry(country);
      void mainSurfaceRef.current?.applyUpdate(trajectoryOverlayUpdate(series, activeYearRef.current));
    };

    mount.addEventListener('flint-interaction', handleInteraction);
    const surface = buildInteractiveChart(mount, chartInput, {
      backend: 'vegalite',
      renderer: 'svg',
      interactions: [
        MAIN_MARK_CLICK_INTERACTION,
        MAIN_LEGEND_CLICK_INTERACTION,
        dragInteraction,
        playbackInteraction,
      ],
      ariaLabel: 'Flint DimVis trajectory chart',
      chartId: 'flint-dimpvis-main',
    });
    mainSurfaceRef.current = surface;

    void surface.ready.then(async () => {
      const initialSeries = SERIES.find((series) => series.name === selectedCountryRef.current);
      if (initialSeries) await surface.applyUpdate(trajectoryOverlayUpdate(initialSeries, activeYearRef.current));
    });

    return () => {
      mount.removeEventListener('flint-interaction', handleInteraction);
      mainSurfaceRef.current = null;
      surface.destroy();
    };
  }, [chartInput, dragInteraction, playbackInteraction]);

  useEffect(() => {
    if (!isPlaying) return undefined;
    let cancelled = false;
    let animationFrame: number | undefined;

    const play = async () => {
      const surface = mainSurfaceRef.current;
      if (!surface) return;
      await surface.ready;
      if (cancelled) return;

      const shouldRestart = selectedCountryRef.current !== 'China' || activeYearRef.current >= 2005;
      const startYear = shouldRestart ? 1955 : activeYearRef.current;
      let startTime: number | undefined;

      const tick = async (time: number) => {
        if (cancelled) return;
        startTime ??= time;
        // Ten data-years per second preserves the old five-second full run,
        // while animation frames provide fractional years between observations.
        const year = Math.min(2005, startYear + (time - startTime) / 100);
        await surface.dispatch(PLAYBACK_INTERACTION_ID, { country: 'China', year });
        if (cancelled) return;
        if (year >= 2005) {
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
    <div className="ic-flint-dimpvis-shell">
      <div className="ic-stage-meta">
        <strong>Discrete Flint approximation</strong>
        <span>
          Click any country point to reveal its trajectory, then drag the trajectory to interpolate the
          shared year and update every country in place.
        </span>
      </div>
      <div className="ic-flint-dimpvis-panel">
        <ScaleToFit
          height={large ? 540 : 390}
          adaptiveHeight
          padding={8}
        >
          <div className="ic-flint-dimpvis-mount" ref={mainMountRef} />
        </ScaleToFit>
      </div>
      <div className="ic-toolbar">
        <button
          type="button"
          className="ic-pill"
          data-active={isPlaying}
          aria-pressed={isPlaying}
          onClick={() => setIsPlaying((playing) => !playing)}
        >
          {isPlaying ? 'Pause' : '▶ Play China'}
        </button>
      </div>
    </div>
  );
}
