import { useEffect, useMemo, useRef, useState } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import {
  hoverTrigger,
  navigate,
  type CanvasInteractionDef,
  type FlintInteractionEventDetail,
} from 'flint-chart/interactive';
import { FlintChart, type FlintChartHandle } from 'flint-chart/react';
import { expressionInterpreter } from 'vega-interpreter';
import { ScaleToFit } from '../components/ScaleToFit';
import {
  CHINA_CHANGE_MAP_URL,
  CHINA_PROVINCES_URL,
  loadChinaChangeData,
  type ChinaChangeData,
  type ChinaChangeRow,
  type ChinaLevel,
} from './china-semantic-zoom-data';
import './interaction-candidates.css';
import './map-semantic-zoom-stage.css';
import './china-semantic-zoom-stage.css';

/**
 * Semantic zoom on a three-level choropleth of China: what a province's total hides.
 *
 * China grew by 5.6% between the 2010 and 2020 censuses, and only six provinces shrank. Yet more
 * than half its counties lost people: growth gathered in the cities while the countryside emptied.
 * The province map cannot show that; the county map shows little else. One Choropleth holds all
 * three levels — each its own layer of boundaries over one join table, gated behind Flint's level
 * signal — and `navigate()` flips from provinces to prefectures to counties as the zoom closes in.
 *
 * Each navigation event names the province under the centre (`geometry.domain.focus`), and the host
 * reads out how many of its counties shrank. Hovering a region reads that region out instead.
 */

/** Degrees of visible longitude at which the zoom enters and leaves each finer level. */
const PREFECTURE_SPANS = { enter: 24, exit: 30 } as const;
const COUNTY_SPANS = { enter: 9, exit: 12 } as const;
/** Milliseconds the Reset fly back to the full frame takes. */
const FLY_MS = 700;
const HOVER_ID = 'china-change-hover';
const LEVEL_NAMES: Record<ChinaLevel, string> = { province: 'Provinces', prefecture: 'Prefectures', county: 'Counties' };

function chartInput(data: ChinaChangeData): ChartAssemblyInput {
  return {
    theme_spec: {
      extends: 'datawrapper',
      id: 'china-census',
      label: 'China census',
      furniture: [],
      legend: { title: 'whenAmbiguous' },
      ink: {
        series: {
          // Six steps of ten points with no neutral middle: the line between losing and gaining people
          // is the reading, so no county sits on it. Loss is the warm side.
          diverging: {
            stops: ['#a63603', '#e6550d', '#fdae6b', '#9ecae1', '#4292c6', '#08519c'],
            space: 'lab',
            consumption: 'quantize',
            quantizeCount: 6,
          },
        },
      },
    },
    data: { values: data.rows },
    semantic_types: {
      Key: 'Category',
      Place: 'Category',
      // Capped at 30% either way: a handful of new districts more than doubled, and would otherwise
      // wash every other county out to the middle of the ramp.
      Change: { semanticType: 'PercentageChange', intrinsicDomain: [-0.3, 0.3] },
    },
    field_display_names: { Change: 'Population change, 2010–2020' },
    chart_spec: {
      chartType: 'Choropleth',
      title: 'China grew, most of its counties shrank',
      subtitle: 'Population change between the 2010 and 2020 censuses',
      baseSize: { width: 920, height: 600 },
      encodings: { id: 'Key', color: 'Change', detail: 'Place' },
      chartProperties: {
        projection: 'mercator',
        baseMapUrl: CHINA_PROVINCES_URL,
        levels: [
          { value: 'province', url: CHINA_CHANGE_MAP_URL, feature: 'provinces' },
          { value: 'prefecture', url: CHINA_CHANGE_MAP_URL, feature: 'prefectures', ...PREFECTURE_SPANS },
          { value: 'county', url: CHINA_CHANGE_MAP_URL, feature: 'counties', ...COUNTY_SPANS },
        ],
      },
    },
  } as ChartAssemblyInput;
}

/**
 * Reads the region under the pointer. A hover reaches the host only through a hover affordance; the
 * handler returns no update, so nothing on the map recedes as the pointer moves.
 */
const HOVER_REGION: CanvasInteractionDef = {
  id: HOVER_ID,
  eventSource: hoverTrigger,
  // No cursor of its own: the map is for dragging, so navigate()'s grab cursor stays.
  affordances: { mark: { hover: 'target' } },
  handle() {
    return null;
  },
};

const INTERACTIONS = [
  navigate({
    domainGuard: { minVisibleFraction: 0.03, maxVisibleFraction: 1, overscrollFraction: 0 },
    // A click on empty map, not a double-click, flies home.
    reset: ['click-none'],
    transition: { duration: FLY_MS },
  }),
  HOVER_REGION,
];

const percent = (change: number) => `${change > 0 ? '+' : change < 0 ? '−' : ''}${Math.abs(change * 100).toFixed(1)}%`;
const millions = (people: number) => people >= 1e6 ? `${(people / 1e6).toFixed(1)}M` : `${Math.round(people / 1e3)}k`;

function Readout({ row, heading }: { row: ChinaChangeRow; heading: string }) {
  const shrinking = row.CountiesShrinking / row.Counties;
  const hidden = row.Level !== 'county' && row.Change > 0 && shrinking > 0.5;
  return (
    <div className="china-change-readout" data-change={row.Change < 0 ? 'down' : 'up'}>
      <span className="china-change-kicker">{heading}</span>
      <strong className="china-change-place">{row.Place}</strong>
      {row.Level === 'county' && <span className="china-change-parent">{row.Prefecture}, {row.Province}</span>}
      <span className="china-change-value">{percent(row.Change)}</span>
      <span className="china-change-people">{millions(row.Pop2010)} → {millions(row.Pop2020)} people</span>
      {row.Level !== 'county' && (
        <span className="china-change-counties">
          {hidden ? 'Yet ' : ''}{row.CountiesShrinking} of its {row.Counties} counties shrank
          {hidden ? ` (${Math.round(shrinking * 100)}%)` : ''}
        </span>
      )}
    </div>
  );
}

export function ChinaSemanticZoomStage() {
  const chartRef = useRef<FlintChartHandle>(null);
  const [data, setData] = useState<ChinaChangeData | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [level, setLevel] = useState<ChinaLevel>('province');
  const [centreKey, setCentreKey] = useState<string | undefined>(undefined);
  const [hoverKey, setHoverKey] = useState<string | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    void loadChinaChangeData().then((loaded) => {
      if (!cancelled) setData(loaded);
    }).catch((error) => {
      if (cancelled) return;
      setStatus('error');
      console.error('China semantic zoom stage failed to build', error);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const spec = useMemo(() => data && chartInput(data), [data]);
  const byKey = useMemo(() => new Map(data?.rows.map((row) => [row.Key, row]) ?? []), [data]);

  const handleInteraction = (detail: FlintInteractionEventDetail) => {
    const { phase, action, geometry, target } = detail.event;
    if (detail.interactionId === HOVER_ID) {
      const key = target?.elements[0]?.value?.Key;
      setHoverKey(phase !== 'cancel' && typeof key === 'string' ? key : undefined);
      return;
    }
    if (phase === 'start' || phase === 'cancel' || !action.endsWith('-viewport')) return;
    const nextLevel = geometry.domain?.level;
    if (nextLevel === 'province' || nextLevel === 'prefecture' || nextLevel === 'county') setLevel(nextLevel);
    const key = geometry.domain?.focus?.Key;
    setCentreKey(typeof key === 'string' ? key : undefined);
  };

  const reset = () => {
    void chartRef.current?.applyUpdate(
      { id: 'china-semantic-zoom-reset', ops: [{ op: 'set-viewport', axes: 'xy', value: {} }] },
      { transition: { duration: FLY_MS } },
    );
  };

  const hovered = hoverKey ? byKey.get(hoverKey) : undefined;
  const centre = centreKey ? byKey.get(centreKey) : undefined;
  const meta = data?.metadata;

  return (
    <div className="ic-flint-dimpvis-shell map-semantic-zoom-shell">
      <div className="ic-toolbar">
        <span className="ic-pill" data-active="true">Showing: {LEVEL_NAMES[level]}</span>
        <button type="button" className="ic-pill" disabled={status !== 'ready'} onClick={reset}>Reset</button>
      </div>
      <div className="china-change-layout">
        <div className="ic-flint-dimpvis-panel">
          {status !== 'ready' && <div role="status" className="china-census-loading">
            {status === 'loading' ? <progress aria-label="Loading census map" /> : 'Census map could not be loaded.'}
          </div>}
          <ScaleToFit height={720} adaptiveHeight padding={8}>
            <div className="ic-flint-dimpvis-mount map-semantic-zoom-mount">
              {spec && <FlintChart
                ref={chartRef}
                spec={spec}
                interactions={INTERACTIONS}
                // Thousands of county shapes redraw on every pan and zoom frame; canvas skips the SVG churn.
                renderer="canvas"
                expressionInterpreter={expressionInterpreter}
                ariaLabel="Population change between the 2010 and 2020 censuses in Chinese provinces, prefectures, and counties"
                chartId="china-semantic-zoom"
                onInteraction={handleInteraction}
                onRender={() => setStatus('ready')}
                onError={(error) => {
                  setStatus('error');
                  console.error('China semantic zoom stage failed to build', error);
                }}
              />}
            </div>
          </ScaleToFit>
        </div>
        <aside className="china-change-side" aria-live="polite">
          {hovered
            ? <Readout row={hovered} heading="Under the pointer" />
            : centre
              ? <Readout row={centre} heading="In the middle of the map" />
              : meta && (
                <div className="china-change-readout">
                  <span className="china-change-kicker">All of China</span>
                  <span className="china-change-value">+{meta.nationalChangePct}%</span>
                  <span className="china-change-counties">
                    Yet {meta.countiesShrinking.toLocaleString()} of {meta.counts.county.toLocaleString()} counties
                    shrank ({Math.round(meta.countiesShrinking / meta.counts.county * 100)}%)
                  </span>
                </div>
              )}
          <p className="china-change-hint">
            Scroll to zoom: provinces give way to prefectures, then counties. Hover a region to read it.
            Grey land has no matched count.
          </p>
        </aside>
      </div>
    </div>
  );
}
