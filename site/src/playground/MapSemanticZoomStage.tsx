import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildInteractiveChart,
  clickTrigger,
  navigate,
  type CanvasInteractionDef,
  type FlintInteractionEventDetail,
  type InteractiveChartSurface,
} from 'flint-chart/interactive';
import { expressionInterpreter } from 'vega-interpreter';
import { ScaleToFit } from '../components/ScaleToFit';
import mobility from '../data/county-mobility.json';
import { COUNTY_ENTER_SPAN, chartInput, isLevel, longitudeSpan, type Level } from './map-semantic-zoom-input';
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
 * A click on a state flies into it: the host answers the click with a
 * `set-viewport` op that names the region and asks for a transition. Flint
 * fits the extent to the state's own shape, tweens the projection there, and
 * flips to the county level on the last frame. The breadcrumb flies back.
 *
 * Data: Chetty & Hendren (2018), causal place effects by county — the study
 * behind the NYT Upshot piece "The Best and Worst Places to Grow Up".
 */

const CLICK_ID = 'map-semantic-zoom-click';
/** Milliseconds a fly into a state, or back home, takes. */
const FLY_MS = 700;

const CLICK_REGION: CanvasInteractionDef = {
  id: CLICK_ID,
  eventSource: clickTrigger,
  affordances: [{ target: 'mark', cursor: 'activate', hover: 'target' }],
  handle() {
    return null;
  },
};

export function MapSemanticZoomStage() {
  const [level, setLevel] = useState<Level>('state');
  const [lonSpan, setLonSpan] = useState<number | undefined>(undefined);
  const [focusState, setFocusState] = useState<string | undefined>(undefined);
  const mountRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<InteractiveChartSurface | null>(null);
  const levelRef = useRef<Level>('state');
  levelRef.current = level;

  /** Fly the viewport to a region, or home with an empty value. */
  const flyTo = useCallback((value: { region: { key: Record<string, unknown> } } | Record<string, never>) => {
    void surfaceRef.current?.applyUpdate(
      { id: 'map-semantic-zoom-fly', ops: [{ op: 'set-viewport', axes: 'xy', value }] },
      { transition: { duration: FLY_MS } },
    );
  }, []);

  const handleInteraction = useCallback((event: Event) => {
    const detail = (event as CustomEvent<FlintInteractionEventDetail>).detail;
    const { phase, action, operation, geometry, target } = detail.event;
    if (phase === 'start' || phase === 'cancel') return;
    if (detail.interactionId === CLICK_ID) {
      // Only a state at the overview level flies in; a county click is a plain click.
      if (phase !== 'commit' || target?.visual.kind !== 'region' || levelRef.current !== 'state') return;
      const code = target.elements[0]?.value?.Region;
      if (typeof code !== 'string') return;
      flyTo({ region: { key: { Region: code } } });
      return;
    }
    if (!action.endsWith('-viewport')) return;
    // Every navigation event reports the level the chart settled on; the swap
    // itself already happened inside the chart.
    if (isLevel(geometry.domain?.level)) setLevel(geometry.domain.level);
    setLonSpan(operation === 'reset' ? undefined : longitudeSpan(geometry.domain));
    // The state under the plot centre, read from the state layer's joined row.
    const place = geometry.domain?.focus?.Place;
    setFocusState(operation !== 'reset' && typeof place === 'string' ? place : undefined);
  }, [flyTo]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    mount.addEventListener('flint-interaction', handleInteraction);
    const surface = buildInteractiveChart(mount, chartInput(), {
      backend: 'vegalite',
      // Thousands of county shapes redraw on every pan/zoom frame; canvas
      // avoids the per-path SVG DOM churn.
      renderer: 'canvas',
      interactions: [
        navigate({
          domainGuard: { minVisibleFraction: 0.04, maxVisibleFraction: 1, overscrollFraction: 0.15 },
        }),
        CLICK_REGION,
      ],
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

  const reset = () => flyTo({});

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
          flips the visible layer in place. Click a state to fly into its counties over {FLY_MS} ms; Reset
          flies back. The host only reads the level, the visible box, and the state under the
          centre from each event.
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
