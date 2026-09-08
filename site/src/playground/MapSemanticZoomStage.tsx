import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import {
  buildInteractiveChart,
  navigate,
  type FlintInteractionEventDetail,
  type InteractiveChartSurface,
} from 'flint-chart/interactive';
import { expressionInterpreter } from 'vega-interpreter';
import { ScaleToFit } from '../components/ScaleToFit';
import mobility from '../data/county-mobility.json';
import './interaction-candidates.css';
import './map-semantic-zoom-stage.css';

/**
 * Semantic zoom on a two-level US choropleth.
 *
 * Flint's `navigate()` pans and zooms the projection. Every navigation event
 * now reports the visible longitude and latitude box, so the host can pick a
 * semantic level from how much of the country is on screen: states for the
 * national view, counties once fewer than ~20° of longitude are visible. A
 * level change rebuilds the chart with the other data and feature set, then
 * restores the same geographic viewport through `set-viewport`.
 *
 * Data: Chetty & Hendren (2018), causal place effects by county — the study
 * behind the NYT Upshot piece "The Best and Worst Places to Grow Up".
 */

type Level = 'state' | 'county';

interface GeoBox {
  west: number;
  east: number;
  south: number;
  north: number;
}

/** Degrees of longitude visible across the plot's middle row. */
const LEVEL_THRESHOLDS = { countyEnter: 20, countyExit: 28 } as const;
const MEASURE = 'Income gain (p25)';
const MEASURE_P75 = 'Income gain (p75)';

type MeasureAnnotation = {
  semanticType: string;
  divergingMidpoint: number;
  intrinsicDomain: [number, number];
  unit: string;
};

/** Both levels share one diverging scale about zero, so colours stay comparable across the swap. */
const MEASURE_ANNOTATION: MeasureAnnotation = {
  semanticType: 'Quantity', divergingMidpoint: 0, intrinsicDomain: [-2, 2], unit: '%',
};
const MEASURE_TYPES: Record<string, string | MeasureAnnotation> = {
  [MEASURE]: MEASURE_ANNOTATION,
  [MEASURE_P75]: MEASURE_ANNOTATION,
  Population: 'Quantity',
};

const CHART_COMMON = {
  title: 'Where a year of childhood pays off',
  subtitle: 'Change in income at age 26 per year of childhood in the place, children of low-income parents (25th percentile), % vs national mean',
  baseSize: { width: 920, height: 560 },
} as const;

function stateInput(): ChartAssemblyInput {
  return {
    data: {
      values: mobility.states.map((row) => ({
        State: row.state,
        'State name': row.stateName,
        [MEASURE]: row.p25,
        [MEASURE_P75]: row.p75,
        Population: row.pop,
      })),
    },
    semantic_types: { State: 'State', 'State name': 'Category', ...MEASURE_TYPES },
    chart_spec: {
      chartType: 'Choropleth',
      ...CHART_COMMON,
      encodings: { id: 'State', color: MEASURE, detail: 'State name' },
      chartProperties: { region: 'us', level: 'state' },
    },
  } as ChartAssemblyInput;
}

function countyInput(): ChartAssemblyInput {
  return {
    data: {
      values: mobility.counties.map((row) => ({
        FIPS: row.fips,
        County: `${row.county}, ${row.state}`,
        [MEASURE]: row.p25,
        [MEASURE_P75]: row.p75,
        Population: row.pop,
      })),
    },
    semantic_types: { FIPS: 'Category', County: 'Category', ...MEASURE_TYPES },
    chart_spec: {
      chartType: 'Choropleth',
      ...CHART_COMMON,
      encodings: { id: 'FIPS', color: MEASURE, detail: 'County' },
      chartProperties: { region: 'us', level: 'county' },
    },
  } as ChartAssemblyInput;
}

const INPUTS: Record<Level, () => ChartAssemblyInput> = { state: stateInput, county: countyInput };

function boxFromDetail(detail: FlintInteractionEventDetail): GeoBox | null {
  const { event } = detail;
  if (!event.action.endsWith('-viewport')) return null;
  const domain = event.geometry.domain;
  const x = domain?.x;
  const y = domain?.y;
  if (x?.kind !== 'interval' || y?.kind !== 'interval') return null;
  const box = { west: Number(x.start), east: Number(x.end), south: Number(y.start), north: Number(y.end) };
  return Object.values(box).every(Number.isFinite) ? box : null;
}

export function resolveMapLevel(lonSpan: number, current: Level): Level {
  if (current === 'county') return lonSpan >= LEVEL_THRESHOLDS.countyExit ? 'state' : 'county';
  return lonSpan <= LEVEL_THRESHOLDS.countyEnter ? 'county' : 'state';
}

const formatDegrees = (value: number): string => `${Math.abs(value).toFixed(1)}°${value < 0 ? 'W' : 'E'}`;
const formatLatitude = (value: number): string => `${Math.abs(value).toFixed(1)}°${value < 0 ? 'S' : 'N'}`;

export function MapSemanticZoomStage() {
  const [level, setLevel] = useState<Level>('state');
  const [box, setBox] = useState<GeoBox | null>(null);
  const [status, setStatus] = useState('Compiling');
  const mountRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<InteractiveChartSurface | null>(null);
  const boxRef = useRef<GeoBox | null>(null);
  const levelRef = useRef<Level>(level);
  levelRef.current = level;

  const handleInteraction = useCallback((event: Event) => {
    const detail = (event as CustomEvent<FlintInteractionEventDetail>).detail;
    if (detail.event.phase === 'start' || detail.event.phase === 'cancel') return;
    if (detail.event.operation === 'reset') {
      boxRef.current = null;
      setBox(null);
      if (levelRef.current !== 'state') setLevel('state');
      return;
    }
    const next = boxFromDetail(detail);
    if (!next) return;
    boxRef.current = next;
    setBox(next);
    const nextLevel = resolveMapLevel(next.east - next.west, levelRef.current);
    if (nextLevel !== levelRef.current) setLevel(nextLevel);
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    setStatus('Compiling');
    mount.addEventListener('flint-interaction', handleInteraction);
    const surface = buildInteractiveChart(mount, INPUTS[level](), {
      backend: 'vegalite',
      renderer: 'svg',
      interactions: [navigate({
        domainGuard: { minVisibleFraction: 0.04, maxVisibleFraction: 1, overscrollFraction: 0.15 },
      })],
      expressionInterpreter,
      ariaLabel: 'US map of childhood income gain by place',
      chartId: 'map-semantic-zoom',
    });
    surfaceRef.current = surface;
    void surface.ready.then(async () => {
      // A level swap keeps the viewer's place: refit the new chart to the box
      // the previous chart reported.
      const restore = boxRef.current;
      if (restore) {
        await surface.applyUpdate({
          id: 'map-semantic-zoom-restore',
          ops: [{
            op: 'set-viewport',
            axes: 'xy',
            value: { x: [restore.west, restore.east], y: [restore.south, restore.north] },
          }],
        });
      }
      setStatus('Ready');
    }).catch((error) => {
      setStatus(error instanceof Error ? error.message : String(error));
    });
    return () => {
      mount.removeEventListener('flint-interaction', handleInteraction);
      surfaceRef.current = null;
      surface.destroy();
    };
  }, [level, handleInteraction]);

  const reset = () => {
    boxRef.current = null;
    setBox(null);
    if (level !== 'state') {
      setLevel('state');
      return;
    }
    void surfaceRef.current?.applyUpdate({
      id: 'map-semantic-zoom-restore',
      ops: [{ op: 'set-viewport', axes: 'xy', value: {} }],
    });
  };

  const lonSpan = box ? box.east - box.west : undefined;
  const levelLabel = level === 'county' ? 'Detail · counties' : 'Overview · states';
  const rowCount = level === 'county' ? mobility.counties.length : mobility.states.length;

  return (
    <div className="ic-flint-dimpvis-shell map-semantic-zoom-shell">
      <div className="ic-stage-meta">
        <strong>Semantic zoom on a two-level US choropleth</strong>
        <span>
          Wheel or pinch to zoom, drag to pan, double-click to reset. Each navigation event reports the
          visible longitude and latitude box; when fewer than {LEVEL_THRESHOLDS.countyEnter}° of longitude are on
          screen the host swaps the state layer for counties and refits the new chart to the same box.
        </span>
      </div>
      <div className="ic-toolbar">
        <span className="ic-pill" data-active="true">{levelLabel}</span>
        <span className="ic-pill" data-active="true">{rowCount.toLocaleString()} regions</span>
        <span className="ic-pill" data-active={lonSpan !== undefined}>
          {lonSpan !== undefined ? `Visible: ${lonSpan.toFixed(1)}° of longitude` : 'Visible: full frame'}
        </span>
        {box && (
          <span className="ic-pill">
            {formatDegrees(box.west)} – {formatDegrees(box.east)}, {formatLatitude(box.south)} – {formatLatitude(box.north)}
          </span>
        )}
        <button type="button" className="ic-pill" onClick={reset}>Reset</button>
        <span className="ic-pill map-semantic-zoom-status">{status}</span>
      </div>
      <div className="ic-flint-dimpvis-panel">
        <ScaleToFit height={600} minHeight={440} adaptiveHeight padding={8}>
          <div className="map-semantic-zoom-viewport">
            <div className="ic-flint-dimpvis-mount map-semantic-zoom-mount" ref={mountRef} />
            <div className="map-semantic-zoom-breadcrumbs" aria-label="Semantic zoom level">
              <button type="button" className="map-semantic-zoom-crumb" data-active={level === 'state'} onClick={reset}>
                United States · states
              </button>
              <span>/</span>
              <span className="map-semantic-zoom-crumb" data-active={level === 'county'}>
                Counties
              </span>
            </div>
          </div>
        </ScaleToFit>
      </div>
      <div className="map-semantic-zoom-credit">
        <strong>Data</strong>
        <span>{mobility.measure}</span>
        <span>{mobility.source}</span>
      </div>
    </div>
  );
}
