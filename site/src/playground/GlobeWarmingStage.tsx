import { useCallback, useMemo, useRef, useState } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import {
  clickTrigger,
  navigate,
  type CanvasInteractionDef,
  type FlintInteractionEventDetail,
} from 'flint-chart/interactive';
import { FlintChart, type FlintChartHandle } from 'flint-chart/react';
import { expressionInterpreter } from 'vega-interpreter';
import { ScaleToFit } from '../components/ScaleToFit';
import warming from '../data/country-warming.json';
import './interaction-candidates.css';
import './globe-warming-stage.css';

/**
 * A globe that turns under the pointer, and whatever faces the reader is the focus.
 *
 * The chart is an ordinary world Choropleth with `projection: 'orthographic'`.
 * Flint's `navigate()` knows a globe from a flat map: a drag turns the sphere
 * instead of sliding it, the wheel zooms about its centre, and every navigation
 * event reports the country under the centre as `geometry.domain.focus`. The
 * host does the rest: it draws that country's edge, and its warming stripes
 * beside the globe.
 *
 * A click on a country, or a chip, turns the globe to face it: one `set-viewport`
 * op naming a region (or a box), with a transition. Flint moves the rotation the
 * short way round.
 *
 * Data: average surface temperature in 2016–2025 against 1951–1980, by country,
 * from Copernicus ERA5 via Our World in Data.
 */

const CLICK_ID = 'globe-warming-click';
const FOCUS_ID = 'globe-warming-focus';
const TURN_ID = 'globe-warming-turn';
/** Milliseconds a turn to a country, a chip, or home takes. */
const TURN_MS = 900;
/** The place the globe faces first: Europe, with the Arctic over its shoulder. */
const HOME: [number, number] = [10, 50];

interface CountryWarming {
  Country: string;
  Code: string;
  Warming: number;
  anomalies: (number | null)[];
}

const COUNTRIES = warming.countries as CountryWarming[];
const BY_CODE = new Map(COUNTRIES.map((country) => [country.Code, country]));
/** Countries ranked warmest first, for "the nth fastest-warming". */
const RANKED = [...COUNTRIES].sort((a, b) => b.Warming - a.Warming).map((country) => country.Code);

function chartInput(): ChartAssemblyInput {
  return {
    data: { values: COUNTRIES.map(({ Country, Code, Warming }) => ({ Country, Code, Warming })) },
    semantic_types: { Country: 'Country', Code: 'Country', Warming: 'Temperature' },
    chart_spec: {
      chartType: 'Choropleth',
      title: 'The north warmed fastest',
      subtitle: '2016–2025 against 1951–1980, °C',
      encodings: {
        id: { field: 'Code' },
        detail: { field: 'Country' },
        color: { field: 'Warming', scheme: 'orangered', title: 'Warming (°C)' },
      },
      chartProperties: { region: 'world', projection: 'orthographic', projectionCenter: HOME },
    },
  } as ChartAssemblyInput;
}

/** The globe's chart, as a spec pane shows it. */
export const GLOBE_INPUT = chartInput();

const CLICK_COUNTRY: CanvasInteractionDef = {
  id: CLICK_ID,
  eventSource: clickTrigger,
  // No hover cue: on a continuous-colour map it greys every other country, and a drag passes over many.
  affordances: { mark: { cursor: 'activate' } },
  handle() {
    return null;
  },
};

/** Where each chip turns the globe: a land mass at the centre, so a country is always in focus. */
const VIEWS: { label: string; center: [number, number] }[] = [
  { label: 'North', center: [60, 62] },
  { label: 'South', center: [25, -25] },
  { label: 'Americas', center: [-60, -8] },
];

/** A box centred on a place, as wide as a hemisphere: the globe turns to face it without zooming. */
function hemisphere([lon, lat]: [number, number]) {
  return { x: [lon - 90, lon + 90], y: [lat - 90, lat + 90] };
}

// Ed Hawkins's warming-stripes ramp: blue below the baseline, red above.
const STRIPE_INKS = ['#08306b', '#2171b5', '#6baed6', '#c6dbef', '#f7f7f7', '#fcbba1', '#fb6a4a', '#cb181d', '#67000d'];
/** Anomalies past this many °C take the end inks, so every country is drawn on one scale. */
const STRIPE_RANGE = 2.5;

function stripeInk(anomaly: number): string {
  const t = Math.max(0, Math.min(1, (anomaly + STRIPE_RANGE) / (2 * STRIPE_RANGE)));
  return STRIPE_INKS[Math.round(t * (STRIPE_INKS.length - 1))];
}

function WarmingStripes({ country }: { country: CountryWarming }) {
  const years = country.anomalies.length;
  return (
    <svg className="globe-warming-stripes" viewBox={`0 0 ${years} 1`} preserveAspectRatio="none" role="img"
      aria-label={`Warming stripes for ${country.Country}, ${warming.firstYear} to ${warming.lastYear}`}>
      {country.anomalies.map((anomaly, index) => (
        <rect key={index} x={index} y={0} width={1.02} height={1}
          fill={anomaly === null ? '#e5e5e5' : stripeInk(anomaly)} />
      ))}
    </svg>
  );
}

/** `stacked` puts the readout under the globe, for a narrow frame. */
export function GlobeWarmingStage({ layout = 'side' }: { layout?: 'side' | 'stacked' } = {}) {
  const chartRef = useRef<FlintChartHandle>(null);
  const [focusCode, setFocusCode] = useState<string | undefined>(undefined);
  const focusRef = useRef<string | undefined>(undefined);
  const spec = useMemo(chartInput, []);

  /** Turn the globe to a viewport — a region or a box — or home with an empty value. */
  const turnTo = useCallback((value: Record<string, unknown>) => {
    void chartRef.current?.applyUpdate(
      { id: TURN_ID, ops: [{ op: 'set-viewport', axes: 'xy', value }] },
      { transition: { duration: TURN_MS } },
    );
  }, []);

  /** Draw the edge of the country facing the reader; the rest of the globe keeps its colours, so the pattern still reads. */
  const focus = useCallback((code: string | undefined) => {
    if (code === focusRef.current) return;
    focusRef.current = code;
    setFocusCode(code);
    const chart = chartRef.current;
    if (!chart) return;
    if (!code) {
      void chart.clearUpdate(FOCUS_ID);
      return;
    }
    void chart.applyUpdate({
      id: FOCUS_ID,
      ops: [{
        op: 'set-style',
        targets: [{ select: { key: { Code: code } } }],
        value: { stroke: '#1f2328', strokeWidth: 2.5 },
      }],
    });
  }, []);

  const interactions = useMemo(() => [
    navigate({
      domainGuard: { minVisibleFraction: 0.15, maxVisibleFraction: 1, overscrollFraction: 0 },
      reset: ['double-click'],
      transition: { duration: TURN_MS },
    }),
    CLICK_COUNTRY,
  ], []);

  const handleInteraction = (detail: FlintInteractionEventDetail) => {
    const { phase, action, geometry, target } = detail.event;
    if (phase === 'start' || phase === 'cancel') return;
    if (detail.interactionId === CLICK_ID) {
      if (phase !== 'commit' || target?.visual.kind !== 'region') return;
      const code = target.elements[0]?.value?.Code;
      if (typeof code === 'string') turnTo({ region: { key: { Code: code } } });
      return;
    }
    if (!action.endsWith('-viewport')) return;
    // Every frame of a drag or a turn names the country under the centre; the ocean names none.
    const code = geometry.domain?.focus?.Code;
    focus(typeof code === 'string' && BY_CODE.has(code) ? code : undefined);
  };

  // The first focus: a turn home, which reports the country it lands on.
  const handleRender = useCallback(() => {
    if (focusRef.current === undefined) turnTo(hemisphere(HOME));
  }, [turnTo]);

  const country = focusCode ? BY_CODE.get(focusCode) : undefined;
  const rank = focusCode ? RANKED.indexOf(focusCode) + 1 : 0;

  return (
    <div className={`ic-flint-dimpvis-shell globe-warming-shell${layout === 'stacked' ? ' globe-warming-shell--stacked' : ''}`}>
      <div className="globe-warming-layout">
        <div className="ic-flint-dimpvis-panel globe-warming-globe">
          <ScaleToFit height={560} adaptiveHeight padding={8}>
            <div className="ic-flint-dimpvis-mount globe-warming-mount">
              <FlintChart
                ref={chartRef}
                spec={spec}
                interactions={interactions}
                // Every country is re-projected on each frame of a turn; canvas skips the SVG path churn.
                renderer="canvas"
                expressionInterpreter={expressionInterpreter}
                ariaLabel="Globe of warming by country since 1951–1980"
                chartId="globe-warming"
                onInteraction={handleInteraction}
                onRender={handleRender}
                onError={(error) => console.error('Globe stage failed to build', error)}
              />
            </div>
          </ScaleToFit>
        </div>
        <div className="globe-warming-side">
          <div className="globe-warming-views" role="group" aria-label="Turn to">
            {VIEWS.map((view) => (
              <button key={view.label} type="button" className="ic-pill" onClick={() => turnTo(hemisphere(view.center))}>
                {view.label}
              </button>
            ))}
            <button type="button" className="ic-pill" onClick={() => turnTo({})}>Reset</button>
          </div>
          <aside className="globe-warming-profile" aria-live="polite">
            {country ? (
              <>
                <span className="globe-warming-kicker">Facing you</span>
                <h4>{country.Country}</h4>
                <p className="globe-warming-value">
                  <strong>+{country.Warming.toFixed(1)} °C</strong>
                  <span>{rank === 1 ? 'the fastest-warming country' : `${ordinal(rank)} fastest of ${COUNTRIES.length}`}</span>
                </p>
                <WarmingStripes country={country} />
                <div className="globe-warming-axis">
                  <span>{warming.firstYear}</span>
                  <span>{warming.lastYear}</span>
                </div>
                <p className="globe-warming-note">
                  Each stripe is a year, against the {warming.baseline[0]}–{warming.baseline[1]} average.
                </p>
              </>
            ) : (
              <p className="globe-warming-empty">Turn a country to the middle of the globe to read it.</p>
            )}
          </aside>
        </div>
      </div>
      <p className="globe-warming-hint">
        Drag to turn the globe; the country in the middle is the focus. Scroll to zoom, click a country to turn to it,
        double-click to go home.
      </p>
    </div>
  );
}

function ordinal(n: number): string {
  const suffix = n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th';
  return `${n}${suffix}`;
}
