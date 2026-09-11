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
import {
  CHINA_LEVEL_COUNTS,
  CHINA_PLACE_ROWS,
  PROVINCE_NAME_BY_ADCODE,
  type ChinaLevel,
} from './china-semantic-zoom-data';
import './interaction-candidates.css';
import './map-semantic-zoom-stage.css';

/**
 * Semantic zoom on a two-level bubble map of China.
 *
 * Map chart carries both levels: the base map is the DataV
 * province GeoJSON, the rows of both levels sit in one table with a `Level`
 * column, and the template's `levelField` + `levels` properties gate the point
 * layer behind Flint's level signal. `navigate()` pans and zooms the
 * projection and flips the level once fewer than 24° of longitude are on
 * screen. Each event also names the province under the plot centre, resolved
 * from the base map's own features.
 */

/** Degrees of visible longitude at which the zoom enters and leaves the city level. */
const CITY_SPANS = { enter: 24, exit: 30 } as const;
/** Milliseconds the Reset fly back to the full frame takes. */
const FLY_MS = 700;

function chartInput(): ChartAssemblyInput {
  return {
    data: { values: [...CHINA_PLACE_ROWS] },
    semantic_types: {
      Place: 'Category',
      Province: 'Category',
      Level: 'Category',
      Role: 'Category',
      Lon: 'Longitude',
      Lat: 'Latitude',
      PopulationM: { semanticType: 'Quantity', intrinsicDomain: [0, 130], unit: 'M' },
    },
    field_display_names: { PopulationM: 'Population (M)' },
    chart_spec: {
      chartType: 'Map',
      title: 'China: provinces, then cities',
      subtitle: 'Population of eight provinces; zoom in for the cities of Zhejiang, Guangdong, Sichuan, and Hubei',
      baseSize: { width: 920, height: 560 },
      encodings: { longitude: 'Lon', latitude: 'Lat', size: 'PopulationM', color: 'Province' },
      chartProperties: {
        region: 'world',
        projection: 'mercator',
        baseMapUrl: `${import.meta.env.BASE_URL}map-data/china-provinces.geojson`,
        levelField: 'Level',
        levels: [{ value: 'province' }, { value: 'city', ...CITY_SPANS }],
      },
    },
  } as ChartAssemblyInput;
}

const isLevel = (value: unknown): value is ChinaLevel => value === 'province' || value === 'city';

/** Degrees of longitude across the plot's middle row, from a navigation event's domain. */
function longitudeSpan(domain: { x?: unknown } | undefined): number | undefined {
  const x = domain?.x as { kind?: string; start?: unknown; end?: unknown } | undefined;
  if (x?.kind !== 'interval') return undefined;
  const span = Number(x.end) - Number(x.start);
  return Number.isFinite(span) ? span : undefined;
}

/** The province under the plot centre: the English name where the table has one, and the base map's own. */
function focusLabel(focus: Record<string, unknown> | undefined): string | undefined {
  if (!focus) return undefined;
  const native = typeof focus.name === 'string' ? focus.name : undefined;
  const english = PROVINCE_NAME_BY_ADCODE.get(Number(focus.adcode));
  if (english && native) return `${english} (${native})`;
  return english ?? native;
}

export function ChinaSemanticZoomStage() {
  const [level, setLevel] = useState<ChinaLevel>('province');
  const [lonSpan, setLonSpan] = useState<number | undefined>(undefined);
  const [focus, setFocus] = useState<string | undefined>(undefined);
  const mountRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<InteractiveChartSurface | null>(null);

  const flyHome = useCallback(() => {
    void surfaceRef.current?.applyUpdate(
      { id: 'china-semantic-zoom-reset', ops: [{ op: 'set-viewport', axes: 'xy', value: {} }] },
      { transition: { duration: FLY_MS } },
    );
  }, []);

  const handleInteraction = useCallback((event: Event) => {
    const detail = (event as CustomEvent<FlintInteractionEventDetail>).detail;
    const { phase, action, operation, geometry } = detail.event;
    if (phase === 'start' || phase === 'cancel' || !action.endsWith('-viewport')) return;
    if (isLevel(geometry.domain?.level)) setLevel(geometry.domain.level);
    // A fly home reports each frame as a reset; the span counts down until the last one.
    const home = operation === 'reset' && phase === 'commit';
    setLonSpan(home ? undefined : longitudeSpan(geometry.domain));
    setFocus(home ? undefined : focusLabel(geometry.domain?.focus));
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    mount.addEventListener('flint-interaction', handleInteraction);
    const surface = buildInteractiveChart(mount, chartInput(), {
      backend: 'vegalite',
      renderer: 'canvas',
      interactions: [navigate({
        domainGuard: { minVisibleFraction: 0.04, maxVisibleFraction: 1, overscrollFraction: 0.15 },
        // A click on empty map, not a double-click, flies home.
        reset: ['click-background'],
        resetTransition: { duration: FLY_MS },
      })],
      expressionInterpreter,
      ariaLabel: 'Bubble map of Chinese provinces and cities by population',
      chartId: 'china-semantic-zoom',
    });
    surfaceRef.current = surface;
    void surface.ready.catch((error) => {
      console.error('China semantic zoom stage failed to build', error);
    });
    return () => {
      mount.removeEventListener('flint-interaction', handleInteraction);
      surfaceRef.current = null;
      surface.destroy();
    };
  }, [handleInteraction]);

  // The fly home reports as a reset on its last frame, which clears the pills.
  const reset = () => flyHome();

  const levelLabel = level === 'city'
    ? `Cities${focus ? ` · ${focus}` : ''}`
    : 'Provinces';

  return (
    <div className="ic-flint-dimpvis-shell map-semantic-zoom-shell">
      <div className="ic-stage-meta">
        <strong>Semantic zoom on a two-level bubble map of China</strong>
        <span>
          Wheel or pinch to zoom, drag to pan; Reset or a click on empty map flies home.
          One Map chart carries province
          centroids and city points in one table; the template gates the point layer by level, and once
          fewer than {CITY_SPANS.enter}° of longitude are on screen the navigation flips it to cities. The
          province under the centre comes from the base map&apos;s own features.
        </span>
      </div>
      <div className="ic-toolbar">
        <span className="ic-pill" data-active="true">Current Level: {levelLabel}</span>
        <span className="ic-pill" data-active={lonSpan !== undefined}>
          {lonSpan !== undefined ? `Visible: ${lonSpan.toFixed(1)}° of longitude` : 'Visible: full frame'}
        </span>
        <button type="button" className="ic-pill" onClick={reset}>Reset</button>
      </div>
      <div className="ic-flint-dimpvis-panel">
        <ScaleToFit height={720} minHeight={320} adaptiveHeight padding={8}>
          <div className="ic-flint-dimpvis-mount map-semantic-zoom-mount" ref={mountRef} />
        </ScaleToFit>
      </div>
      <div className="map-semantic-zoom-credit">
        <strong>Data</strong>
        <span>Base map: DataV.GeoAtlas province boundaries (100000_full), Alibaba Cloud.</span>
      </div>
    </div>
  );
}
