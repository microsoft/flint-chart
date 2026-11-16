// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

// Debug lab for a chart of few x bands drawn much narrower than its title, after the fix: both
// levers on — `sparseFill` grows the bands until the plot fills a share of its room (capped per
// mark), and `titleWrap` wraps a themed title to the drawing instead of the canvas (with a floor).
// Each case renders at every chosen base size and stretch ratio, so tight bases can be read against
// roomy ones. Each tile reports the drawn title and chart widths, measured from the rendered SVG.

import { useEffect, useMemo, useRef, useState } from 'react';
import { THEME_PRESETS, assembleVegaLite, type ChartAssemblyInput } from 'flint-chart';
import { FlintView } from '../components/FlintView';
import { siteTheme } from '../shared/theme';
import realCases from './title-balance-cases.json';

type Kind = 'bar' | 'strip' | 'grouped' | 'hbar';

interface Size {
  width: number;
  height: number;
}

interface Settings {
  theme: string;
  kind: Kind;
  sizes: string[];
  stretches: number[];
}

interface Case {
  id: string;
  label: string;
  input: ChartAssemblyInput;
}

const SIZES: Record<string, Size> = {
  '240×180': { width: 240, height: 180 },
  '320×240': { width: 320, height: 240 },
  '400×300': { width: 400, height: 300 },
  '480×320': { width: 480, height: 320 },
  '560×360': { width: 560, height: 360 },
  '640×400': { width: 640, height: 400 },
};
const STRETCHES = [1.2, 1.5];
const DEFAULTS: Settings = { theme: 'economist', kind: 'bar', sizes: ['320×240', '400×300', '560×360'], stretches: [1.2] };
const THEMES = ['flint', ...Object.keys(THEME_PRESETS)];
const TITLE = 'Nov 3, 2007 was deadliest; Christmas was safest on average';
const SUBTITLE = 'US traffic fatalities per day: single-day maximum vs. calendar-date average, 1992–2016';
const NAMES = ['Deadliest single day', 'Safest calendar date', 'Median weekday', 'New Year’s Day', 'Independence Day', 'Labor Day', 'Thanksgiving', 'Memorial Day', 'Halloween', 'Easter'];
const COUNTS = [1, 2, 3, 4, 6, 10];

function prepare(input: ChartAssemblyInput, settings: Settings): ChartAssemblyInput {
  const preset = settings.theme === 'flint' ? undefined : (THEME_PRESETS as any)[settings.theme];
  const { theme_spec: _drop, ...rest } = input as any;
  return { ...rest, ...(preset ? { theme_spec: preset.spec } : {}) };
}

function synthetic(settings: Settings, count: number): Case {
  const names = NAMES.slice(0, count);
  const chart_spec: any = { title: TITLE, subtitle: SUBTITLE };
  let values: any[];
  if (settings.kind === 'strip') {
    values = names.flatMap((name, i) => Array.from({ length: 60 }, (_, k) => ({ Day: name, Deaths: 80 + ((k * 37 + i * 11) % 220) })));
    Object.assign(chart_spec, { chartType: 'Strip Plot', encodings: { x: { field: 'Day' }, y: { field: 'Deaths' } } });
  } else if (settings.kind === 'grouped') {
    values = names.flatMap((name, i) => ['2015', '2016'].map((year, j) => ({ Day: name, Year: year, Deaths: 110 + ((i * 53 + j * 29) % 190) })));
    Object.assign(chart_spec, { chartType: 'Grouped Bar Chart', encodings: { x: { field: 'Day' }, y: { field: 'Deaths' }, group: { field: 'Year' } } });
  } else {
    values = names.map((name, i) => ({ Day: name, Deaths: 112 + ((i * 61) % 187) }));
    Object.assign(chart_spec, {
      chartType: 'Bar Chart',
      encodings: settings.kind === 'hbar' ? { y: { field: 'Day' }, x: { field: 'Deaths' } } : { x: { field: 'Day' }, y: { field: 'Deaths' } },
      chartProperties: { showValueLabels: true },
    });
  }
  return {
    id: `syn-${settings.kind}-${count}`,
    label: `${settings.kind} · ${count} ${count === 1 ? 'band' : 'bands'}`,
    input: { data: { values }, semantic_types: { Day: 'Category', Year: 'Category', Deaths: 'Count' }, chart_spec } as any,
  };
}

/** The case at one base size and stretch ratio, with both levers on. */
function variant(input: ChartAssemblyInput, size: Size, stretch: number): ChartAssemblyInput {
  return {
    ...input,
    chart_spec: { ...(input as any).chart_spec, baseSize: size },
    options: { ...(input as any).options, maxStretch: stretch, sparseFill: true, titleWrap: true },
  } as ChartAssemblyInput;
}

interface Measured {
  title: number;
  chart: number;
  width: number;
  height: number;
}

/** Sizes as drawn, in the chart's own px: the title block, the axes, marks and keys under it, and the whole drawing. */
function measure(root: HTMLElement): Measured | undefined {
  const svg = root.querySelector('svg.marks') as SVGSVGElement | null;
  if (!svg) return undefined;
  const width = svg.width.baseVal.value || svg.getBoundingClientRect().width;
  const height = svg.height.baseVal.value || svg.getBoundingClientRect().height;
  const scale = svg.getBoundingClientRect().width / width || 1;
  const span = (nodes: Element[]) => {
    let lo = Infinity, hi = -Infinity;
    for (const node of nodes) {
      const box = node.getBoundingClientRect();
      if (box.width <= 0) continue;
      lo = Math.min(lo, box.left);
      hi = Math.max(hi, box.right);
    }
    return hi > lo ? (hi - lo) / scale : 0;
  };
  const title = span([...svg.querySelectorAll('g.role-title-text, g.role-title-subtitle')]);
  const chart = span([...svg.querySelectorAll('g.role-axis, g.role-legend, g.role-mark')].filter((node) => !node.closest('g.role-title')));
  return { title, chart, width, height };
}

function compiled(input: ChartAssemblyInput): { step?: number; lines?: number } {
  try {
    const spec: any = assembleVegaLite(input);
    const width = spec?.width ?? spec?.spec?.width;
    const text = spec?.title?.text;
    return { step: typeof width === 'object' && width ? width.step : undefined, lines: Array.isArray(text) ? text.length : text ? 1 : 0 };
  } catch {
    return {};
  }
}

function Tile({ input, label, size, stretch }: { input: ChartAssemblyInput; label: string; size: Size; stretch: number }) {
  const root = useRef<HTMLDivElement>(null);
  const [measured, setMeasured] = useState<Measured>();
  const facts = useMemo(() => compiled(input), [input]);
  // Overlays settle and fonts load after mount; measure a few times after each change.
  useEffect(() => {
    setMeasured(undefined);
    let ticks = 0;
    const timer = window.setInterval(() => {
      if (root.current) setMeasured(measure(root.current));
      if (++ticks >= 8) window.clearInterval(timer);
    }, 400);
    return () => window.clearInterval(timer);
  }, [input]);
  const ratio = measured && measured.title ? measured.chart / measured.title : undefined;
  const ratioInk = ratio === undefined ? siteTheme.textMuted : ratio >= 0.8 ? '#1a7f37' : ratio >= 0.6 ? '#9a6700' : siteTheme.error;
  // The drawing against its base, and against the most it may stretch to.
  const grow = measured ? { w: measured.width / size.width, h: measured.height / size.height } : undefined;
  const over = grow && (grow.w > stretch + 0.01 || grow.h > stretch + 0.01);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: siteTheme.text }}>{label}</div>
      <div style={{ position: 'relative', alignSelf: 'flex-start', minWidth: size.width * stretch + 10, minHeight: size.height * stretch + 10 }}>
        {/* The base box and the stretch ceiling, for scale. */}
        <div title="base size" style={{ position: 'absolute', left: 5, top: 5, width: size.width, height: size.height, outline: `1px dashed ${siteTheme.accent}`, pointerEvents: 'none', zIndex: 1 }} />
        <div title="base × stretch" style={{ position: 'absolute', left: 5, top: 5, width: size.width * stretch, height: size.height * stretch, outline: '1px dotted #9a6700', pointerEvents: 'none', zIndex: 1 }} />
        <div ref={root} style={{ border: `1px solid ${siteTheme.border}`, background: '#fff', padding: 4, display: 'inline-block' }}>
          <FlintView spec={input} renderer="svg" compact />
        </div>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', fontFamily: siteTheme.fontMono, fontSize: 11, color: siteTheme.text, maxWidth: Math.max(320, size.width * stretch) }}>
        <span>step {facts.step ?? '—'}</span>
        <span>headline lines {facts.lines ?? '—'}</span>
        <span>title {measured ? Math.round(measured.title) : '—'}</span>
        <span>chart {measured ? Math.round(measured.chart) : '—'}</span>
        <span style={{ color: ratioInk, fontWeight: 600 }}>chart/title {ratio ? ratio.toFixed(2) : '—'}</span>
        <span style={{ color: over ? siteTheme.error : siteTheme.text, fontWeight: over ? 600 : 400 }}>
          drawn {measured ? `${Math.round(measured.width)}×${Math.round(measured.height)}` : '—'}
          {grow ? ` (${grow.w.toFixed(2)}× · ${grow.h.toFixed(2)}×)` : ''}
        </span>
      </div>
    </div>
  );
}

function Row({ item, settings }: { item: Case; settings: Settings }) {
  const { sizes, stretches } = settings;
  const tiles = useMemo(() => sizes.flatMap((key) => stretches.map((stretch) => ({
    key: `${key}-${stretch}`,
    label: `${key} · stretch ${stretch}`,
    size: SIZES[key]!,
    stretch,
    input: variant(item.input, SIZES[key]!, stretch),
  }))), [item, sizes, stretches]);
  return (
    <section style={{ borderTop: `1px solid ${siteTheme.border}`, padding: '14px 0' }}>
      <h3 style={{ margin: '0 0 8px', fontSize: 13, color: siteTheme.text }}>{item.label}</h3>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, alignItems: 'flex-start' }}>
        {tiles.map((tile) => <Tile key={tile.key} input={tile.input} label={tile.label} size={tile.size} stretch={tile.stretch} />)}
      </div>
    </section>
  );
}

function Chip({ label, on, onClick }: { label: string; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      style={{
        fontSize: 12, padding: '3px 10px', borderRadius: 999, cursor: 'pointer',
        border: `1px solid ${on ? siteTheme.accent : siteTheme.border}`,
        background: on ? siteTheme.accent : 'transparent', color: on ? '#fff' : siteTheme.text,
      }}
    >
      {label}
    </button>
  );
}

function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly T[]; onChange: (value: T) => void }) {
  return (
    <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, color: siteTheme.textMuted }}>
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value as T)} style={{ fontSize: 12 }}>
        {options.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

/** Toggle one value in a chip set, keeping the set's order and at least one value. */
function toggled<T>(all: readonly T[], chosen: T[], value: T): T[] {
  const next = chosen.includes(value) ? chosen.filter((item) => item !== value) : [...chosen, value];
  return next.length ? all.filter((item) => next.includes(item)) : chosen;
}

export function TitleBalanceLab() {
  const [settings, setSettings] = useState(DEFAULTS);
  const patch = (next: Partial<Settings>) => setSettings((current) => ({ ...current, ...next }));
  const real = useMemo<Case[]>(() => (realCases as any[]).map((item) => ({ id: item.id, label: item.label, input: prepare(item.input, settings) })), [settings.theme]);
  const sweep = useMemo<Case[]>(() => COUNTS.map((count) => {
    const item = synthetic(settings, count);
    return { ...item, input: prepare(item.input, settings) };
  }), [settings.theme, settings.kind]);

  return (
    <div style={{ padding: '10px 4px 64px' }}>
      <header style={{ marginBottom: 14 }}>
        <h1 style={{ margin: '0 0 5px', fontSize: 20, color: siteTheme.text }}>Title balance lab</h1>
        <p style={{ margin: 0, maxWidth: 940, color: siteTheme.textMuted, fontSize: 13, lineHeight: 1.55 }}>
          After the fix, with <code>sparseFill</code> (few x bands thicken until the drawing spans 85% of its room, at most 200px a band of bars or 360px of points)
          and <code>titleWrap</code> (a themed title wraps to the drawing, overhanging it by at most 15%, never under 320px or 60% of the canvas) on.
          Each case renders at every chosen base size and stretch ratio: the dashed box is the base, the dotted box the base × stretch; <strong>drawn</strong> turns red past the stretch ceiling.
        </p>
      </header>

      <section style={{ position: 'sticky', top: 0, zIndex: 3, background: siteTheme.surface, borderTop: `1px solid ${siteTheme.border}`, borderBottom: `1px solid ${siteTheme.border}`, padding: '10px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: siteTheme.textMuted, width: 70 }}>Base size</span>
          {Object.keys(SIZES).map((key) => (
            <Chip key={key} label={key} on={settings.sizes.includes(key)} onClick={() => patch({ sizes: toggled(Object.keys(SIZES), settings.sizes, key) })} />
          ))}
          <span style={{ width: 1, height: 18, background: siteTheme.border, margin: '0 8px' }} />
          <span style={{ fontSize: 12, color: siteTheme.textMuted }}>Stretch</span>
          {STRETCHES.map((stretch) => (
            <Chip key={stretch} label={`${stretch}×`} on={settings.stretches.includes(stretch)} onClick={() => patch({ stretches: toggled(STRETCHES, settings.stretches, stretch) })} />
          ))}
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px 18px', alignItems: 'center' }}>
          <Select label="Theme" value={settings.theme} options={THEMES} onChange={(theme) => patch({ theme })} />
          <Select label="Sweep" value={settings.kind} options={['bar', 'strip', 'grouped', 'hbar'] as const} onChange={(kind) => patch({ kind })} />
        </div>
      </section>

      <h2 style={{ fontSize: 15, margin: '18px 0 4px', color: siteTheme.text }}>Runs from the annotation review</h2>
      {real.map((item) => <Row key={item.id} item={item} settings={settings} />)}

      <h2 style={{ fontSize: 15, margin: '18px 0 4px', color: siteTheme.text }}>Sweep: band count</h2>
      {sweep.map((item) => <Row key={item.id} item={item} settings={settings} />)}
    </div>
  );
}
