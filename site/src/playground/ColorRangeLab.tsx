import { useMemo, type CSSProperties } from 'react';
import { assembleVegaLite, type ChartAssemblyInput } from 'flint-chart';
import { VegaLiteView } from '../components/VegaLiteView';
import { siteTheme } from '../shared/theme';
import { ANOMALY_MONTHS, anomalyInput, anomalyRows } from './anomaly-data';

/** The scheme Flint picks for a diverging temperature field, so every row reads the same ramp. */
const SCHEME = 'blueorange';
const RAMP_REACH = 1.3;
const FIRST_YEAR = 1880;
const LAST_YEAR = 2023;

type Policy = {
  id: string;
  title: string;
  note: string;
  /** Two ends about the pivot, or three stops [low, pivot, high] for arms fitted apart. */
  domain: number[];
  clamp: boolean;
  verdict: 'bug' | 'now' | 'option' | 'rejected';
};

const values = anomalyRows.map((row) => row.Anomaly);
const reach = (rows: readonly { Anomaly: number }[]) => Math.max(...rows.map((row) => Math.abs(row.Anomaly)));

function quantile(sorted: readonly number[], q: number): number {
  const at = (sorted.length - 1) * q;
  const low = Math.floor(at);
  return sorted[low] + (sorted[Math.min(low + 1, sorted.length - 1)] - sorted[low]) * (at - low);
}

/** The chart as the eval card mounts it, compiled now: the window it keeps and the colour range it states. */
function flintToday() {
  const sized = { ...anomalyInput, chart_spec: { ...anomalyInput.chart_spec, canvasSize: { width: 580, height: 400 } } } as ChartAssemblyInput;
  const spec = assembleVegaLite(sized) as any;
  const visible = spec._viewports?.[0]?.visibleCount ?? 65;
  return { visible, scale: spec.encoding?.color?.scale ?? {} };
}

function buildPolicies(firstWindowEnd: number, flint: { domain?: number[]; clamp?: boolean }): Policy[] {
  const windowReach = reach(anomalyRows.filter((row) => row.Year <= firstWindowEnd));
  const allReach = reach(anomalyRows);
  const robust = quantile(values.map(Math.abs).sort((a, b) => a - b), 0.98);
  const rounded = Math.ceil(allReach * 10) / 10;
  const round2 = (value: number) => Math.round(value * 100) / 100;
  return [
    {
      id: 'window', verdict: 'bug', domain: [-round2(windowReach), round2(windowReach)], clamp: false,
      title: 'Fitted to the first window, not clamped (the bug)',
      note: `The scrolling chart was compiled from 1880–${firstWindowEnd} only. Every later value past the range's end is extrapolated off the ramp, into colours the legend never shows.`,
    },
    {
      id: 'window-clamped', verdict: 'option', domain: [-round2(windowReach), round2(windowReach)], clamp: true,
      title: 'Same range, clamped',
      note: 'Clamping alone stops the black: everything past the end takes the end colour. But half a century of warming then reads as one flat brown.',
    },
    {
      id: 'now', verdict: 'now', domain: (flint.domain ?? [-allReach, allReach]).map(round2), clamp: !!flint.clamp,
      title: 'Fitted to every row (Flint now)',
      note: 'Read from Flint\'s compile of the eval chart. Nothing falls past the ends, and the same colour means the same value in every window, but one hot decade sets the scale: the early years wash out.',
    },
    {
      id: 'rounded', verdict: 'option', domain: [-rounded, rounded], clamp: true,
      title: 'Every row, ends rounded outward, clamped',
      note: 'The same, with legend ends on round numbers. Clamping is a safety net here: should the range ever be fitted to fewer rows than the chart shows, nothing turns black.',
    },
    {
      id: 'robust', verdict: 'option', domain: [-round2(robust), round2(robust)], clamp: true,
      title: 'Robust ends (98th percentile of the distance from 0), clamped',
      note: 'The bulk of the data keeps its contrast; the hottest 2% of cells share the end colour, and the legend would mark that end "≥".',
    },
    {
      id: 'arms', verdict: 'rejected', domain: [round2(Math.min(...values)), 0, round2(Math.max(...values))], clamp: true,
      title: 'Each arm fitted to its own extreme (rejected)',
      note: 'Blue reaches its darkest at −0.45 while orange needs 1.08: the same 0.45° reads deep blue below zero and pale orange above it.',
    },
  ];
}

function colorScale(policy: Policy) {
  return policy.domain.length === 3
    ? { scheme: SCHEME, domain: policy.domain, clamp: policy.clamp }
    : { scheme: SCHEME, domain: policy.domain, domainMid: 0, clamp: policy.clamp };
}

function heatmapSpec(policy: Policy, firstWindowEnd: number) {
  return {
    width: 720, height: 120,
    config: { view: { stroke: null }, axis: { labelFontSize: 9, tickSize: 3 } },
    layer: [
      {
        data: { values: anomalyRows },
        transform: [{ calculate: 'datum.Year + 1', as: 'YearEnd' }],
        mark: { type: 'rect' },
        encoding: {
          x: {
            field: 'Year', type: 'quantitative', title: null,
            scale: { domain: [FIRST_YEAR, LAST_YEAR + 1], nice: false, zero: false },
            axis: { format: 'd', values: Array.from({ length: 15 }, (_, index) => FIRST_YEAR + index * 10) },
          },
          x2: { field: 'YearEnd' },
          y: { field: 'Month', type: 'ordinal', sort: ANOMALY_MONTHS, title: null },
          color: { field: 'Anomaly', type: 'quantitative', scale: colorScale(policy), legend: { title: '°C', gradientLength: 110, direction: 'vertical' } },
          tooltip: [{ field: 'Year' }, { field: 'Month' }, { field: 'Anomaly' }],
        },
      },
      {
        data: { values: [{ from: FIRST_YEAR, to: firstWindowEnd + 1, label: 'first window' }] },
        mark: { type: 'rect', fill: null, stroke: '#111', strokeDash: [4, 3], strokeWidth: 1.5 },
        encoding: { x: { field: 'from', type: 'quantitative' }, x2: { field: 'to' } },
      },
      {
        data: { values: [{ at: FIRST_YEAR + 1, label: `first window (1880–${firstWindowEnd})` }] },
        mark: { type: 'text', align: 'left', baseline: 'bottom', dy: -3, fontSize: 9, color: '#111' },
        encoding: { x: { field: 'at', type: 'quantitative' }, y: { value: 0 }, text: { field: 'label' } },
      },
    ],
  };
}

/** Every value the scale could meet, coloured as it would draw it, over the data's own spread. */
function rampSpec(policy: Policy) {
  const step = 0.01;
  const ramp = Array.from({ length: Math.round(RAMP_REACH * 2 / step) }, (_, index) => ({ v: -RAMP_REACH + index * step }));
  const ends = [policy.domain[0], policy.domain[policy.domain.length - 1]];
  const x = { field: 'v', type: 'quantitative', title: null, scale: { domain: [-RAMP_REACH, RAMP_REACH], nice: false } };
  return {
    config: { view: { stroke: null }, axis: { labelFontSize: 9, tickSize: 3 } },
    vconcat: [
      {
        width: 720, height: 18,
        layer: [
          {
            data: { values: ramp },
            transform: [{ calculate: `datum.v + ${step}`, as: 'v2' }],
            mark: { type: 'rect' },
            encoding: { x: { ...x, axis: null }, x2: { field: 'v2' }, color: { field: 'v', type: 'quantitative', scale: colorScale(policy), legend: null } },
          },
          {
            data: { values: ends.map((v) => ({ v })) },
            mark: { type: 'rule', color: '#111', strokeWidth: 1.5, y: -4, y2: 22 },
            encoding: { x: { ...x, axis: null } },
          },
        ],
      },
      {
        width: 720, height: 46,
        data: { values: anomalyRows },
        transform: [
          { bin: { step: 0.04 }, field: 'Anomaly', as: ['b0', 'b1'] },
          { aggregate: [{ op: 'count', as: 'cells' }], groupby: ['b0', 'b1'] },
          { calculate: '(datum.b0 + datum.b1) / 2', as: 'v' },
        ],
        mark: { type: 'bar', binSpacing: 0 },
        encoding: {
          x: { field: 'b0', type: 'quantitative', title: 'value (°C): the bar above draws every value as this scale would; bars below count the cells', scale: { domain: [-RAMP_REACH, RAMP_REACH], nice: false } },
          x2: { field: 'b1' },
          y: { field: 'cells', type: 'quantitative', title: null, axis: { tickCount: 2, labelFontSize: 8 } },
          color: { field: 'v', type: 'quantitative', scale: colorScale(policy), legend: null },
        },
      },
    ],
    resolve: { scale: { color: 'independent' } },
  };
}

const VERDICT: Record<Policy['verdict'], { label: string; color: string }> = {
  bug: { label: 'the bug', color: '#b42318' },
  now: { label: 'Flint now', color: '#1d4ed8' },
  option: { label: 'option', color: '#475467' },
  rejected: { label: 'rejected', color: '#9a6700' },
};

const card: CSSProperties = {
  border: `1px solid ${siteTheme.border}`, borderRadius: siteTheme.radius, background: siteTheme.surface, padding: 12,
};

function PolicyCard({ policy, firstWindowEnd }: { policy: Policy; firstWindowEnd: number }) {
  const heatmap = useMemo(() => heatmapSpec(policy, firstWindowEnd), [policy, firstWindowEnd]);
  const ramp = useMemo(() => rampSpec(policy), [policy]);
  const [low, high] = [policy.domain[0], policy.domain[policy.domain.length - 1]];
  const past = values.filter((value) => value < low || value > high).length;
  const verdict = VERDICT[policy.verdict];
  return (
    <article style={card} data-policy={policy.id}>
      <header style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 15 }}>{policy.title}</h2>
        <span style={{ fontSize: 11, fontWeight: 600, color: verdict.color, border: `1px solid ${verdict.color}`, borderRadius: 4, padding: '0 5px' }}>
          {verdict.label}
        </span>
      </header>
      <p style={{ margin: '0 0 6px', fontSize: 12, color: siteTheme.textMuted, maxWidth: 820 }}>{policy.note}</p>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', fontSize: 12, marginBottom: 8 }}>
        <span>range <code>{policy.domain.map((value) => value.toFixed(2)).join(' … ')}</code></span>
        <span>clamped <code>{policy.clamp ? 'yes' : 'no'}</code></span>
        <span style={{ color: past && !policy.clamp ? '#b42318' : undefined }}>
          cells past the ends <code>{past}</code> of {values.length}
          {past ? (policy.clamp ? ' (held at the end colour)' : ' (drawn off the ramp)') : ''}
        </span>
      </div>
      <VegaLiteView spec={heatmap} renderer="svg" />
      <VegaLiteView spec={ramp} renderer="svg" />
    </article>
  );
}

export function ColorRangeLab() {
  const flint = useMemo(flintToday, []);
  const firstWindowEnd = FIRST_YEAR + flint.visible - 1;
  const policies = useMemo(() => buildPolicies(firstWindowEnd, flint.scale), [firstWindowEnd, flint.scale]);
  return (
    <div className="dev-page" style={{ gap: 12 }} data-lab="color-range">
      <header className="dev-page-heading" style={{ width: 'min(100%, 980px)' }}>
        <h1>Color range</h1>
        <p style={{ margin: '4px 0 0', fontSize: 12, color: siteTheme.textMuted }}>
          One diverging temperature heatmap (144 years, synthetic values shaped like NASA GISTEMP, scheme{' '}
          <code>{SCHEME}</code> centred on 0) under each way of choosing its colour range. Three things decide what a
          reader sees: which rows the range is fitted to, what happens to a value past its ends, and how far one
          extreme may stretch the scale for everything else. Each card shows the whole chart with the first window the
          scrolling chart keeps (dashed); a bar drawing every value from −{RAMP_REACH} to {RAMP_REACH} as the scale
          would, with the range&apos;s ends as black ticks; and the data&apos;s spread coloured the same way.
        </p>
      </header>
      {policies.map((policy) => (
        <section key={policy.id} style={{ width: 'min(100%, 980px)' }}>
          <PolicyCard policy={policy} firstWindowEnd={firstWindowEnd} />
        </section>
      ))}
    </div>
  );
}
