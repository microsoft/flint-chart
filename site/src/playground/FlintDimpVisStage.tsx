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
import './interaction-candidates.css';

const SERIES = [
  {
    name: 'Afghanistan',
    frames: [
      { year: 1955, fertility: 7.7, life: 30.332, population: 8891209 },
      { year: 1960, fertility: 7.7, life: 31.997, population: 9829450 },
      { year: 1965, fertility: 7.7, life: 34.02, population: 10997885 },
      { year: 1970, fertility: 7.7, life: 36.088, population: 12430623 },
      { year: 1975, fertility: 7.7, life: 38.438, population: 14132019 },
      { year: 1980, fertility: 7.8, life: 39.854, population: 15112149 },
      { year: 1985, fertility: 7.9, life: 40.822, population: 13796928 },
      { year: 1990, fertility: 8, life: 41.674, population: 14669339 },
      { year: 1995, fertility: 8, life: 41.763, population: 20881480 },
      { year: 2000, fertility: 7.4792, life: 42.129, population: 23898198 },
      { year: 2005, fertility: 7.0685, life: 43.828, population: 29928987 },
    ],
  },
  {
    name: 'Brazil',
    frames: [
      { year: 1955, fertility: 6.1501, life: 53.285, population: 61773546 },
      { year: 1960, fertility: 6.1501, life: 55.665, population: 71694810 },
      { year: 1965, fertility: 5.38, life: 57.632, population: 83092908 },
      { year: 1970, fertility: 4.7175, life: 59.504, population: 95684297 },
      { year: 1975, fertility: 4.305, life: 61.489, population: 108823732 },
      { year: 1980, fertility: 3.8, life: 63.336, population: 122958132 },
      { year: 1985, fertility: 3.1, life: 65.205, population: 137302933 },
      { year: 1990, fertility: 2.6, life: 67.057, population: 151083809 },
      { year: 1995, fertility: 2.45, life: 69.388, population: 163542501 },
      { year: 2000, fertility: 2.345, life: 71.006, population: 175552771 },
      { year: 2005, fertility: 2.245, life: 72.39, population: 186112794 },
    ],
  },
  {
    name: 'China',
    frames: [
      { year: 1955, fertility: 5.59, life: 50.54896, population: 608655000 },
      { year: 1960, fertility: 5.72, life: 44.50136, population: 667070000 },
      { year: 1965, fertility: 6.06, life: 58.38112, population: 715185000 },
      { year: 1970, fertility: 4.86, life: 63.11888, population: 818315000 },
      { year: 1975, fertility: 3.32, life: 63.96736, population: 916395000 },
      { year: 1980, fertility: 2.55, life: 65.525, population: 981235000 },
      { year: 1985, fertility: 2.46, life: 67.274, population: 1051040000 },
      { year: 1990, fertility: 1.92, life: 68.69, population: 1135185000 },
      { year: 1995, fertility: 1.781, life: 70.426, population: 1204855000 },
      { year: 2000, fertility: 1.7, life: 72.028, population: 1262645000 },
      { year: 2005, fertility: 1.725, life: 72.961, population: 1303182268 },
    ],
  },
  {
    name: 'France',
    frames: [
      { year: 1955, fertility: 2.712, life: 68.93, population: 43427669 },
      { year: 1960, fertility: 2.85, life: 70.51, population: 45670000 },
      { year: 1965, fertility: 2.607, life: 71.55, population: 48763000 },
      { year: 1970, fertility: 2.31, life: 72.38, population: 50787000 },
      { year: 1975, fertility: 1.862, life: 73.83, population: 52758427 },
      { year: 1980, fertility: 1.866, life: 74.89, population: 53869743 },
      { year: 1985, fertility: 1.805, life: 76.34, population: 55171224 },
      { year: 1990, fertility: 1.713, life: 77.46, population: 56735161 },
      { year: 1995, fertility: 1.7624, life: 78.64, population: 58149727 },
      { year: 2000, fertility: 1.8833, life: 79.59, population: 59381628 },
      { year: 2005, fertility: 1.8916, life: 80.657, population: 60656178 },
    ],
  },
  {
    name: 'India',
    frames: [
      { year: 1955, fertility: 5.8961, life: 40.249, population: 393000000 },
      { year: 1960, fertility: 5.8216, life: 43.605, population: 434000000 },
      { year: 1965, fertility: 5.6058, life: 47.193, population: 485000000 },
      { year: 1970, fertility: 5.264, life: 50.651, population: 541000000 },
      { year: 1975, fertility: 4.8888, life: 54.208, population: 607000000 },
      { year: 1980, fertility: 4.4975, life: 56.596, population: 679000000 },
      { year: 1985, fertility: 4.15, life: 58.553, population: 755000000 },
      { year: 1990, fertility: 3.8648, life: 60.223, population: 839000000 },
      { year: 1995, fertility: 3.4551, life: 61.765, population: 927000000 },
      { year: 2000, fertility: 3.1132, life: 62.879, population: 1007702000 },
      { year: 2005, fertility: 2.8073, life: 64.698, population: 1080264388 },
    ],
  },
  {
    name: 'Japan',
    frames: [
      { year: 1955, fertility: 2.08, life: 65.5, population: 89815060 },
      { year: 1960, fertility: 2.02, life: 68.73, population: 94091638 },
      { year: 1965, fertility: 2, life: 71.43, population: 98882534 },
      { year: 1970, fertility: 2.07, life: 73.42, population: 104344973 },
      { year: 1975, fertility: 1.81, life: 75.38, population: 111573116 },
      { year: 1980, fertility: 1.76, life: 77.11, population: 116807309 },
      { year: 1985, fertility: 1.66, life: 78.67, population: 120754335 },
      { year: 1990, fertility: 1.49, life: 79.36, population: 123537399 },
      { year: 1995, fertility: 1.39, life: 80.69, population: 125341354 },
      { year: 2000, fertility: 1.291, life: 82, population: 126699784 },
      { year: 2005, fertility: 1.27, life: 82.603, population: 127417244 },
    ],
  },
  {
    name: 'Nigeria',
    frames: [
      { year: 1955, fertility: 6.9, life: 37.802, population: 35458978 },
      { year: 1960, fertility: 6.9, life: 39.36, population: 39914593 },
      { year: 1965, fertility: 6.9, life: 41.04, population: 45020052 },
      { year: 1970, fertility: 6.9, life: 42.821, population: 51027516 },
      { year: 1975, fertility: 6.9, life: 44.514, population: 58522112 },
      { year: 1980, fertility: 6.9, life: 45.826, population: 68550274 },
      { year: 1985, fertility: 6.834, life: 46.886, population: 77573154 },
      { year: 1990, fertility: 6.635, life: 47.472, population: 88510354 },
      { year: 1995, fertility: 6.246, life: 47.464, population: 100960105 },
      { year: 2000, fertility: 5.845, life: 46.608, population: 114306700 },
      { year: 2005, fertility: 5.322, life: 46.859, population: 128765768 },
    ],
  },
  {
    name: 'United States',
    frames: [
      { year: 1955, fertility: 3.706, life: 69.49, population: 165931000 },
      { year: 1960, fertility: 3.314, life: 70.21, population: 180671000 },
      { year: 1965, fertility: 2.545, life: 70.76, population: 194303000 },
      { year: 1970, fertility: 2.016, life: 71.34, population: 205052000 },
      { year: 1975, fertility: 1.788, life: 73.38, population: 215973000 },
      { year: 1980, fertility: 1.825, life: 74.65, population: 227726463 },
      { year: 1985, fertility: 1.924, life: 75.02, population: 238466283 },
      { year: 1990, fertility: 2.025, life: 76.09, population: 250131894 },
      { year: 1995, fertility: 1.994, life: 76.81, population: 266557091 },
      { year: 2000, fertility: 2.038, life: 77.31, population: 282338631 },
      { year: 2005, fertility: 2.054, life: 78.242, population: 295734134 },
    ],
  },
];

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
  affordances: [
    { target: 'mark', cursor: 'activate', hover: 'target' },
  ],
  handle() {
    return null;
  },
};

const MAIN_LEGEND_CLICK_INTERACTION: CanvasInteractionDef = {
  id: MAIN_LEGEND_INTERACTION_ID,
  eventSource: clickTrigger,
  claimsLegendActivation: true,
  affordances: [
    { target: 'legend-item', cursor: 'activate', hover: 'cohort' },
  ],
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
          style: { fill: '#69737d', fontSize: 104, fontWeight: 'bold', opacity: 0.11 },
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
    theme_spec: 'swiss',
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
    affordances: [{ target: 'mark', cursor: 'drag', hover: 'target' }],
    handle(event) {
      if (event.action !== 'drag-element') return null;
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
      if (!projection?.segment) return null;
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
      <div className="ic-toolbar">
        <span className="ic-pill" data-active="true">Country: {selectedCountry}</span>
        <span className="ic-pill" data-active="true">Year: {activeYear.toFixed(1)}</span>
      </div>
      <div className="ic-flint-dimpvis-panel">
        <ScaleToFit
          height={large ? 540 : 390}
          minHeight={large ? 400 : 285}
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
