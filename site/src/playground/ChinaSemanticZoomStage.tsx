import { useCallback, useEffect, useRef, useState } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import {
  buildInteractiveChart,
  navigate,
  type InteractiveChartSurface,
} from 'flint-chart/interactive';
import { expressionInterpreter } from 'vega-interpreter';
import { ScaleToFit } from '../components/ScaleToFit';
import { loadChinaCensusData, type ChinaCensusData } from './china-semantic-zoom-data';
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
const PREFECTURE_SPANS = { enter: 24, exit: 30 } as const;
const COUNTY_SPANS = { enter: 7, exit: 9 } as const;
/** Milliseconds the Reset fly back to the full frame takes. */
const FLY_MS = 700;

function chartInput(census: ChinaCensusData): ChartAssemblyInput {
  return {
    theme_spec: {
      extends: 'datawrapper',
      id: 'china-census',
      label: 'China census',
      furniture: [],
      legend: { title: 'whenAmbiguous' },
    },
    data: { values: census.rows },
    semantic_types: {
      Id: 'Category',
      Place: 'Category',
      Province: 'Category',
      Prefecture: 'Category',
      Level: 'Category',
      Lon: 'Longitude',
      Lat: 'Latitude',
      PopulationM: { semanticType: 'Quantity', intrinsicDomain: [0, 130], unit: 'M' },
      Age65Pct: { semanticType: 'Quantity', intrinsicDomain: [0, 40], unit: '%' },
      AgeCoveragePct: { semanticType: 'Quantity', intrinsicDomain: [0, 100], unit: '%' },
      CountyCount: 'Quantity',
    },
    field_display_names: {
      PopulationM: 'Included population (M)',
      Age65Pct: 'Residents aged 65+ (%)',
      AgeCoveragePct: 'Age-data population coverage (%)',
      CountyCount: 'Included county units',
    },
    chart_spec: {
      chartType: 'Map',
      title: 'Where China\'s population is aging',
      subtitle: '2020 census: province, prefecture and county aggregates',
      baseSize: { width: 920, height: 560 },
      encodings: { longitude: 'Lon', latitude: 'Lat', size: 'PopulationM', color: 'Age65Pct' },
      chartProperties: {
        region: 'world',
        projection: 'mercator',
        baseMapUrl: `${import.meta.env.BASE_URL}map-data/china-provinces.geojson`,
        levelField: 'Level',
        levels: [
          { value: 'province' },
          { value: 'prefecture', ...PREFECTURE_SPANS },
          { value: 'county', ...COUNTY_SPANS },
        ],
      },
    },
  } as ChartAssemblyInput;
}

export function ChinaSemanticZoomStage() {
  const mountRef = useRef<HTMLDivElement>(null);
  const surfaceRef = useRef<InteractiveChartSurface | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');

  const flyHome = useCallback(() => {
    void surfaceRef.current?.applyUpdate(
      { id: 'china-semantic-zoom-reset', ops: [{ op: 'set-viewport', axes: 'xy', value: {} }] },
      { transition: { duration: FLY_MS } },
    );
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return undefined;
    let cancelled = false;
    let surface: InteractiveChartSurface | undefined;
    void loadChinaCensusData().then(async census => {
      if (cancelled) return;
      surface = buildInteractiveChart(mount, chartInput(census), {
      backend: 'vegalite',
      renderer: 'canvas',
      interactions: [navigate({
        domainGuard: { minVisibleFraction: 0.04, maxVisibleFraction: 1, overscrollFraction: 0.15 },
        // A click on empty map, not a double-click, flies home.
        reset: ['click-none'],
        resetTransition: { duration: FLY_MS },
      })],
      expressionInterpreter,
      ariaLabel: '2020 census map of included population and residents aged 65+ in Chinese provinces, prefectures, and counties',
      chartId: 'china-semantic-zoom',
      });
      surfaceRef.current = surface;
      await surface.ready;
      if (!cancelled) setStatus('ready');
    }).catch((error) => {
      if (cancelled) return;
      setStatus('error');
      console.error('China semantic zoom stage failed to build', error);
    });
    return () => {
      cancelled = true;
      surfaceRef.current = null;
      surface?.destroy();
    };
  }, []);

  const reset = () => flyHome();

  return (
    <div className="ic-flint-dimpvis-shell map-semantic-zoom-shell">
      <div className="ic-stage-meta">
        <strong>Semantic zoom on a two-level bubble map of China</strong>
        <span>
          Wheel or pinch to zoom, drag to pan; Reset or a click on empty map flies home.
          One Map chart carries province
          centroids and city points in one table; the template gates the point layer by level, and once
          fewer than {PREFECTURE_SPANS.enter}° of longitude are on screen the navigation flips it to prefectures,
          then counties below {COUNTY_SPANS.enter}°. The
          province under the centre comes from the base map&apos;s own features.
        </span>
      </div>
      <div className="ic-toolbar">
        <button type="button" className="ic-pill" disabled={status !== 'ready'} onClick={reset}>Reset</button>
      </div>
      <div className="ic-flint-dimpvis-panel">
        {status !== 'ready' && <div role="status" className="china-census-loading">
          {status === 'loading' ? <progress aria-label="Loading census map" /> : 'Census map could not be loaded.'}
        </div>}
        <ScaleToFit height={720} adaptiveHeight padding={8}>
          <div className="ic-flint-dimpvis-mount map-semantic-zoom-mount" ref={mountRef} />
        </ScaleToFit>
      </div>
    </div>
  );
}
