import { useMemo, useState } from 'react';
import { assembleVegaLite, assembleECharts, type ChartAssemblyInput } from 'flint-chart';
import { VegaLiteView } from './VegaLiteView';
import { EChartsView } from './EChartsView';
import { SiteRange } from './SiteRange';
import { siteTheme } from '../shared/theme';

/**
 * Interactive sizing playground embedded in the layout-model doc.
 *
 * One mode per layout model:
 *   - `discrete`      — elastic-budget model on a banded (bar) axis
 *   - `continuous`    — gas-pressure model on a line chart's time axis
 *   - `circumference` — radial-pressure model on a pie chart's closed loop
 *   - `area`          — 2D area-pressure model on a treemap
 *
 * Users drag the number of items, the elasticity (where it applies),
 * and the base size, then watch the assembled plot size respond live. The
 * default growth ceiling stays internal; a spec may instead pin a hard
 * `canvasSize` ceiling.
 */
type Mode = 'discrete' | 'continuous' | 'circumference' | 'area';

/** Deterministic RNG so the demo data is stable across re-renders. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function categoryRows(n: number, seed: number): { Category: string; Value: number }[] {
  const rng = mulberry32(seed);
  return Array.from({ length: n }, (_, i) => ({
    Category: `Cat ${String(i + 1).padStart(2, '0')}`,
    Value: Math.round(20 + rng() * 80),
  }));
}

type BuildArgs = {
  count: number;
  seriesCount: number;
  canvas: { width: number; height: number };
  elasticity: number;
};

function buildDiscreteInput({ count, canvas, elasticity }: BuildArgs): ChartAssemblyInput {
  return {
    data: { values: categoryRows(count, 1234) },
    semantic_types: { Category: 'Category', Value: 'Quantity' },
    chart_spec: { chartType: 'Bar Chart', encodings: { x: 'Category', y: 'Value' }, baseSize: canvas },
    options: { elasticity },
  };
}

function buildContinuousInput({ count, seriesCount, canvas, elasticity }: BuildArgs): ChartAssemblyInput {
  const rng = mulberry32(5678);
  const start = Date.UTC(2020, 0, 1);
  const dayMs = 86400000;
  const values: { Date: string; Series: string; Value: number }[] = [];
  for (let seriesIndex = 0; seriesIndex < seriesCount; seriesIndex += 1) {
    let v = 100 + seriesIndex * 18;
    const drift = (seriesIndex - (seriesCount - 1) / 2) * 0.08;
    for (let pointIndex = 0; pointIndex < count; pointIndex += 1) {
      v += (rng() - 0.5) * 20 + drift;
      values.push({
        Date: new Date(start + pointIndex * dayMs).toISOString().slice(0, 10),
        Series: `Series ${seriesIndex + 1}`,
        Value: Math.round(v * 100) / 100,
      });
    }
  }
  return {
    data: { values },
    semantic_types: { Date: 'Date', Series: 'Category', Value: 'Quantity' },
    chart_spec: { chartType: 'Line Chart', encodings: { x: 'Date', y: 'Value', color: 'Series' }, baseSize: canvas },
    options: { continuousMarkCrossSection: { x: 80, y: 0, elasticity } },
  };
}

function buildCircumferenceInput({ count, canvas }: BuildArgs): ChartAssemblyInput {
  return {
    data: { values: categoryRows(count, 4321) },
    semantic_types: { Category: 'Category', Value: 'Quantity' },
    chart_spec: { chartType: 'Pie Chart', encodings: { color: 'Category', size: 'Value' }, baseSize: canvas },
  };
}

function buildAreaInput({ count, canvas }: BuildArgs): ChartAssemblyInput {
  return {
    data: { values: categoryRows(count, 8765) },
    semantic_types: { Category: 'Category', Value: 'Quantity' },
    chart_spec: { chartType: 'Treemap', encodings: { color: 'Category', size: 'Value' }, baseSize: canvas },
  };
}

type Control = 'elasticity';

interface ModeConfig {
  backend: 'vl' | 'echarts';
  build: (args: BuildArgs) => ChartAssemblyInput;
  countLabel: string;
  countMin: number;
  countMax: number;
  countStep: number;
  countDefault: number;
  seriesLabel?: string;
  seriesMin?: number;
  seriesMax?: number;
  seriesStep?: number;
  seriesDefault?: number;
  elasticityDefault: number;
  controls: Control[];
}

const MODES: Record<Mode, ModeConfig> = {
  discrete: {
    backend: 'vl',
    build: buildDiscreteInput,
    countLabel: 'Number of items',
    countMin: 3, countMax: 120, countStep: 1, countDefault: 12,
    elasticityDefault: 0.5,
    controls: ['elasticity'],
  },
  continuous: {
    backend: 'vl',
    build: buildContinuousInput,
    countLabel: 'Points per series',
    countMin: 8, countMax: 600, countStep: 4, countDefault: 60,
    seriesLabel: 'Number of series',
    seriesMin: 1, seriesMax: 12, seriesStep: 1, seriesDefault: 2,
    elasticityDefault: 0.3,
    controls: ['elasticity'],
  },
  circumference: {
    backend: 'vl',
    build: buildCircumferenceInput,
    countLabel: 'Number of slices',
    countMin: 2, countMax: 40, countStep: 1, countDefault: 6,
    elasticityDefault: 0.5,
    controls: [],
  },
  area: {
    backend: 'echarts',
    build: buildAreaInput,
    countLabel: 'Number of cells',
    countMin: 3, countMax: 120, countStep: 1, countDefault: 12,
    elasticityDefault: 0.5,
    controls: [],
  },
};

const PARAM_HELP: { symbol: string; name: string; desc: string; control: Control | 'count' | 'series' | 'canvas' }[] = [
  { symbol: 'Count', name: 'Data marks', desc: 'how many bars, points, slices, or cells compete for space.', control: 'count' },
  { symbol: 'Series', name: 'Line groups', desc: 'how many separate lines share the same time axis.', control: 'series' },
  { symbol: 'elasticity', name: 'Stretch response', desc: 'how quickly extra data turns into extra space. Higher reacts faster.', control: 'elasticity' },
  { symbol: 'baseSize', name: 'Target size', desc: 'the comfortable size the layout aims for before any growth is applied.', control: 'canvas' },
];

function Slider({ label, value, min, max, step, onChange, suffix }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13, color: siteTheme.textMuted, minWidth: 0 }}>
      <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
        <span>{label}</span>
        <span style={{ color: siteTheme.text, fontFamily: siteTheme.fontMono, fontWeight: 600 }}>
          {value}{suffix ?? ''}
        </span>
      </span>
      <SiteRange
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}

export function SizingPlayground({ mode }: { mode: Mode }) {
  const cfg = MODES[mode];
  const [count, setCount] = useState(cfg.countDefault);
  const [seriesCount, setSeriesCount] = useState(cfg.seriesDefault ?? 1);
  const [elasticity, setElasticity] = useState(cfg.elasticityDefault);
  const [width, setWidth] = useState(480);
  const [height, setHeight] = useState(320);

  const showSeries = cfg.seriesLabel != null;
  const showElasticity = cfg.controls.includes('elasticity');

  const { spec, resolvedWidth, resolvedHeight, error } = useMemo(() => {
    const canvas = { width, height };
    try {
      const input = cfg.build({ count, seriesCount, canvas, elasticity });
      const s = (cfg.backend === 'vl' ? assembleVegaLite(input) : assembleECharts(input)) as any;
      return {
        spec: s,
        resolvedWidth: typeof s._width === 'number' ? Math.round(s._width) : null,
        resolvedHeight: typeof s._height === 'number' ? Math.round(s._height) : null,
        error: null as string | null,
      };
    } catch (err) {
      return { spec: null, resolvedWidth: null, resolvedHeight: null, error: String((err as Error)?.message ?? err) };
    }
  }, [cfg, count, seriesCount, elasticity, width, height]);

  const stretchedW = resolvedWidth != null ? Math.round((resolvedWidth / width) * 100) : null;
  const help = PARAM_HELP.filter((p) =>
    p.control === 'count' ||
    (p.control === 'series' && showSeries) ||
    p.control === 'canvas' ||
    (p.control === 'elasticity' && showElasticity),
  );

  return (
    <div
      style={{
        boxSizing: 'border-box',
        maxWidth: '100%',
        border: `1px solid ${siteTheme.border}`,
        borderRadius: siteTheme.radius,
        background: siteTheme.surface,
        padding: 16,
        margin: '20px 0',
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: 14,
          marginBottom: 14,
        }}
      >
        <Slider label={cfg.countLabel} value={count} min={cfg.countMin} max={cfg.countMax} step={cfg.countStep} onChange={setCount} />
        {showSeries && (
          <Slider
            label={cfg.seriesLabel ?? 'Number of series'}
            value={seriesCount}
            min={cfg.seriesMin ?? 1}
            max={cfg.seriesMax ?? 12}
            step={cfg.seriesStep ?? 1}
            onChange={setSeriesCount}
          />
        )}
        {showElasticity && <Slider label="elasticity" value={elasticity} min={0} max={1} step={0.05} onChange={setElasticity} />}
        <Slider label="baseSize width" value={width} min={240} max={720} step={20} onChange={setWidth} suffix=" px" />
        <Slider label="baseSize height" value={height} min={160} max={480} step={20} onChange={setHeight} suffix=" px" />
      </div>

      <dl
        style={{
          display: 'grid',
          gridTemplateColumns: 'auto 1fr',
          gap: '2px 10px',
          margin: '0 0 14px',
          fontSize: 12,
          lineHeight: 1.45,
          color: siteTheme.textMuted,
        }}
      >
        {help.map((p) => (
          <div key={p.symbol} style={{ display: 'contents' }}>
            <dt style={{ fontFamily: siteTheme.fontMono, color: siteTheme.text, whiteSpace: 'nowrap' }}>
              {p.symbol} <span style={{ color: siteTheme.textMuted, fontFamily: siteTheme.fontSans }}>· {p.name}</span>
            </dt>
            <dd style={{ margin: 0 }}>{p.desc}</dd>
          </div>
        ))}
      </dl>

      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: 16,
          fontSize: 12,
          color: siteTheme.textMuted,
          fontFamily: siteTheme.fontMono,
          marginBottom: 12,
          paddingBottom: 12,
          borderBottom: `1px solid ${siteTheme.border}`,
        }}
      >
        <span>base: {width} × {height} px</span>
        {resolvedWidth != null && (
          <span style={{ color: siteTheme.text }}>
            plot width: {resolvedWidth} px{stretchedW != null ? ` (${stretchedW}% of base)` : ''}
          </span>
        )}
        {resolvedHeight != null && <span>plot height: {resolvedHeight} px</span>}
      </div>

      {error ? (
        <div style={{ color: siteTheme.error, fontFamily: siteTheme.fontMono, fontSize: 13 }}>{error}</div>
      ) : (
        <div style={{ overflowX: 'auto', maxWidth: '100%' }}>
          {spec && (cfg.backend === 'vl' ? <VegaLiteView spec={spec} /> : <EChartsView option={spec} />)}
        </div>
      )}
    </div>
  );
}
