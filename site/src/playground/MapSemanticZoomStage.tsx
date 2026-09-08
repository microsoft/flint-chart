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
 * One chart holds both levels. The Choropleth's `level: 'auto'` draws a state
 * layer and a county layer over one join table, each gated behind a level
 * signal, and Flint's `navigate()` flips that signal as the zoom crosses the
 * county threshold. The chart never rebuilds: the projection extent carries
 * the viewer's place across the swap, and the host only reads the level and
 * the visible longitude/latitude box from each navigation event.
 *
 * Data: Chetty & Hendren (2018), causal place effects by county — the study
 * behind the NYT Upshot piece "The Best and Worst Places to Grow Up".
 */

type Level = 'state' | 'county';

/** Degrees of visible longitude below which the template swaps states for counties. */
const COUNTY_ENTER_SPAN = 20;
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

/**
 * One table for both levels: state rows carry the USPS code, county rows the
 * FIPS id. Both resolve into the TopoJSON's numeric id space, where state ids
 * (1–56) and county ids (1001 and up) never collide.
 */
function chartInput(): ChartAssemblyInput {
  const states = mobility.states.map((row) => ({
    Region: row.state,
    Place: row.stateName,
    [MEASURE]: row.p25,
    [MEASURE_P75]: row.p75,
    Population: row.pop,
  }));
  const counties = mobility.counties.map((row) => ({
    Region: row.fips,
    Place: `${row.county}, ${row.state}`,
    [MEASURE]: row.p25,
    [MEASURE_P75]: row.p75,
    Population: row.pop,
  }));
  return {
    data: { values: [...states, ...counties] },
    semantic_types: { Region: 'State', Place: 'Category', ...MEASURE_TYPES },
    chart_spec: {
      chartType: 'Choropleth',
      title: 'Where a year of childhood pays off',
      subtitle: 'Change in income at age 26 per year of childhood in the place, children of low-income parents (25th percentile), % vs national mean',
      baseSize: { width: 920, height: 560 },
      encodings: { id: 'Region', color: MEASURE, detail: 'Place' },
      chartProperties: { region: 'us', level: 'auto' },
    },
  } as ChartAssemblyInput;
}

const isLevel = (value: unknown): value is Level => value === 'state' || value === 'county';

/** Degrees of longitude across the plot's middle row, from a navigation event's domain. */
function longitudeSpan(domain: { x?: unknown } | undefined): number | undefined {
  const x = domain?.x as { kind?: string; start?: unknown; end?: unknown } | undefined;
  if (x?.kind !== 'interval') return undefined;
  const span = Number(x.end) - Number(x.start);
  return Number.isFinite(span) ? span : undefined;
}

export function MapSemanticZoomStage() {
  const [level, setLevel] = useState<Level>('state');
  const [lonSpan, setLonSpan] = useState<number | undefined>(undefined);
  const [focusState, setFocusState] = useState<string | undefined>(undefined);
  const mountRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<InteractiveChartSurface | null>(null);

  const handleInteraction = useCallback((event: Event) => {
    const detail = (event as CustomEvent<FlintInteractionEventDetail>).detail;
    const { phase, action, operation, geometry } = detail.event;
    if (phase === 'start' || phase === 'cancel' || !action.endsWith('-viewport')) return;
    // Every navigation event reports the level the chart settled on; the swap
    // itself already happened inside the chart.
    if (isLevel(geometry.domain?.level)) setLevel(geometry.domain.level);
    setLonSpan(operation === 'reset' ? undefined : longitudeSpan(geometry.domain));
    // The state under the plot centre, read from the state layer's joined row.
    const place = geometry.domain?.focus?.Place;
    setFocusState(operation !== 'reset' && typeof place === 'string' ? place : undefined);
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    mount.addEventListener('flint-interaction', handleInteraction);
    const surface = buildInteractiveChart(mount, chartInput(), {
      backend: 'vegalite',
      // Thousands of county shapes redraw on every pan/zoom frame; canvas
      // avoids the per-path SVG DOM churn.
      renderer: 'canvas',
      interactions: [navigate({
        domainGuard: { minVisibleFraction: 0.04, maxVisibleFraction: 1, overscrollFraction: 0.15 },
      })],
      expressionInterpreter,
      ariaLabel: 'US map of childhood income gain by place',
      chartId: 'map-semantic-zoom',
    });
    surfaceRef.current = surface;
    void surface.ready.catch((error) => {
      console.error('Semantic zoom stage failed to build', error);
    });
    return () => {
      mount.removeEventListener('flint-interaction', handleInteraction);
      surfaceRef.current = null;
      surface.destroy();
    };
  }, [handleInteraction]);

  const reset = () => {
    setLevel('state');
    setLonSpan(undefined);
    setFocusState(undefined);
    void surfaceRef.current?.applyUpdate({
      id: 'map-semantic-zoom-reset',
      ops: [{ op: 'set-viewport', axes: 'xy', value: {} }],
    });
  };

  const levelLabel = level === 'county'
    ? `Counties${focusState ? ` - ${focusState}` : ''}`
    : 'States';

  return (
    <div className="ic-flint-dimpvis-shell map-semantic-zoom-shell">
      <div className="ic-stage-meta">
        <strong>Semantic zoom on a two-level US choropleth</strong>
        <span>
          Wheel or pinch to zoom, drag to pan, double-click to reset. One chart holds a state layer and a
          county layer; once fewer than {COUNTY_ENTER_SPAN}° of longitude are on screen, Flint&apos;s navigation
          flips the visible layer in place. The host only reads the level, the visible box, and the state under
          the centre from each event.
        </span>
      </div>
      <div className="ic-toolbar">
        <span className="ic-pill" data-active="true">Level: {levelLabel}</span>
        <span className="ic-pill" data-active={lonSpan !== undefined}>
          {lonSpan !== undefined ? `Visible: ${lonSpan.toFixed(1)}° of longitude` : 'Visible: full frame'}
        </span>
        <button type="button" className="ic-pill" onClick={reset}>Reset</button>
      </div>
      <div className="ic-flint-dimpvis-panel">
        <ScaleToFit height={800} minHeight={320} adaptiveHeight padding={8}>
          <div className="ic-flint-dimpvis-mount map-semantic-zoom-mount" ref={mountRef} />
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
