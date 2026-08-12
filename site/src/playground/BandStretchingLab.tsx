// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { useMemo, useState, type CSSProperties } from 'react';
import { Check, Copy, RotateCcw } from 'lucide-react';
import { THEME_PRESETS, assembleVegaLite, type ChartAssemblyInput } from 'flint-chart';
import { VegaLiteView } from '../components/VegaLiteView';
import { ScaleToFit } from '../components/ScaleToFit';
import { siteTheme } from '../shared/theme';
import './band-stretching-lab.css';

type CaseId = 'bar' | 'waterfall';
type ThemeId = 'flint' | string;

interface LabSettings {
  caseId: CaseId;
  count: number;
  baseSize: number;
  capacityWidth: number;
}

interface CellResult {
  spec?: any;
  error?: string;
  step: number;
  solid: number;
  gap: number;
  plotWidth: number;
  plotHeight: number;
}

const COLUMNS: ThemeId[] = ['flint', ...Object.keys(THEME_PRESETS)];
const DEFAULT_SETTINGS: LabSettings = {
  caseId: 'waterfall',
  count: 12,
  baseSize: 440,
  capacityWidth: 720,
};
const TILE_WIDTH = 340;
const TILE_HEIGHT = 300;

function preset(themeId: ThemeId): any | undefined {
  return themeId === 'flint' ? undefined : (THEME_PRESETS as any)[themeId];
}

function initialFits(): Record<string, number> {
  return Object.fromEntries(COLUMNS.map((themeId) => [
    themeId,
    preset(themeId)?.spec?.layout?.bandStepFit ?? 0,
  ]));
}

function rows(count: number): Array<Record<string, string | number>> {
  return Array.from({ length: count }, (_, index) => ({
    Category: `P${String(index + 1).padStart(2, '0')}`,
    Value: index === 0
      ? 40
      : Math.round((14 + ((index * 17) % 31)) * (index % 4 === 0 ? -1 : 1)),
  }));
}

function inputFor(settings: LabSettings, themeId: ThemeId, fit: number): ChartAssemblyInput {
  const chartType = settings.caseId === 'waterfall' ? 'Waterfall Chart' : 'Bar Chart';
  const input: ChartAssemblyInput = {
    data: { values: rows(settings.count) },
    semantic_types: { Category: 'Category', Value: settings.caseId === 'waterfall' ? 'Profit' : 'Quantity' },
    chart_spec: {
      chartType,
      encodings: { x: 'Category', y: 'Value' },
      title: settings.caseId === 'waterfall' ? 'Cumulative change' : 'Value by period',
      subtitle: `${settings.count} categories · band X, continuous Y`,
      baseSize: { width: settings.baseSize, height: settings.baseSize },
      canvasSize: { width: settings.capacityWidth, height: settings.baseSize },
    },
    options: { bandStepFit: fit },
  };
  const theme = preset(themeId);
  return theme ? { ...input, theme_spec: theme.spec } : input;
}

function findPaddingInner(node: any): number | undefined {
  if (!node || typeof node !== 'object') return undefined;
  if (node.encoding?.x?.scale && typeof node.encoding.x.scale.paddingInner === 'number') {
    return node.encoding.x.scale.paddingInner;
  }
  for (const value of Object.values(node)) {
    const found = findPaddingInner(value);
    if (found != null) return found;
  }
  return undefined;
}

function stripInternal(node: any): void {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    node.forEach(stripInternal);
    return;
  }
  for (const key of Object.keys(node)) {
    if (/^_[^_]/.test(key)) delete node[key];
    else stripInternal(node[key]);
  }
}

function compile(settings: LabSettings, themeId: ThemeId, fit: number): CellResult {
  try {
    const spec = assembleVegaLite(inputFor(settings, themeId, fit) as any) as any;
    const step = Number(spec.width?.step ?? 0);
    const padding = findPaddingInner(spec) ?? 0.2;
    const gap = step * padding;
    const solid = step - gap;
    const result = {
      spec,
      step,
      solid,
      gap,
      plotWidth: step * settings.count,
      plotHeight: Number(spec._height ?? settings.baseSize),
    };
    stripInternal(spec);
    delete spec.$schema;
    return result;
  } catch (error) {
    return {
      error: String((error as Error)?.message ?? error),
      step: 0,
      solid: 0,
      gap: 0,
      plotWidth: 0,
      plotHeight: 0,
    };
  }
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  suffix = '',
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  onChange: (value: number) => void;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <label style={{ display: 'grid', gridTemplateColumns: '110px minmax(120px, 1fr) 54px', gap: 10, alignItems: 'center' }}>
      <span style={{ fontSize: 12, color: siteTheme.textMuted }}>{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="site-range"
        style={{ '--pct': `${pct}%`, width: '100%' } as CSSProperties}
      />
      <output style={{ fontFamily: siteTheme.fontMono, fontSize: 12, color: siteTheme.text, textAlign: 'right' }}>
        {value}{suffix}
      </output>
    </label>
  );
}

function ThemeCell({
  themeId,
  settings,
  fit,
  onFit,
}: {
  themeId: ThemeId;
  settings: LabSettings;
  fit: number;
  onFit: (fit: number) => void;
}) {
  const theme = preset(themeId);
  const built = useMemo(() => compile(settings, themeId, fit), [settings, themeId, fit]);
  const baseStep = theme?.spec?.layout?.bandStep ?? 20;
  const occupancy = theme?.spec?.marks?.bandFraction;
  const ratio = built.plotHeight > 0 ? built.plotWidth / built.plotHeight : 0;

  return (
    <article style={{ width: TILE_WIDTH, flex: `0 0 ${TILE_WIDTH}px`, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline' }}>
        <strong style={{ color: siteTheme.text, fontSize: 13 }}>{theme?.label ?? 'Flint default'}</strong>
        <span style={{ color: siteTheme.textMuted, fontFamily: siteTheme.fontMono, fontSize: 10 }}>
          base {baseStep}px{occupancy != null ? ` · fill ${Math.round(occupancy * 100)}%` : ''}
        </span>
      </header>

      <div style={{ height: TILE_HEIGHT, border: `1px solid ${siteTheme.border}`, background: '#fff', overflow: 'hidden' }}>
        {built.error ? (
          <div style={{ padding: 16, color: siteTheme.error, fontSize: 11 }}>{built.error}</div>
        ) : (
          <ScaleToFit height={TILE_HEIGHT} padding={6}>
            <VegaLiteView spec={built.spec} renderer="svg" />
          </ScaleToFit>
        )}
      </div>

      <Slider label="Band fit" value={fit} min={0} max={1} step={0.05} onChange={onFit} />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', borderTop: `1px solid ${siteTheme.border}`, paddingTop: 7 }}>
        {[
          ['pitch', built.step],
          ['solid', built.solid],
          ['gap', built.gap],
          ['plot W', built.plotWidth],
          ['AR', ratio],
        ].map(([label, value]) => (
          <div key={label as string} style={{ minWidth: 0 }}>
            <div style={{ color: siteTheme.textMuted, fontSize: 9, textTransform: 'uppercase' }}>{label}</div>
            <div style={{ color: siteTheme.text, fontFamily: siteTheme.fontMono, fontSize: 11 }}>
              {typeof value === 'number' ? (label === 'AR' ? value.toFixed(2) : `${value.toFixed(1)}px`) : value}
            </div>
          </div>
        ))}
      </div>
    </article>
  );
}

export function BandStretchingLab() {
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [fits, setFits] = useState<Record<string, number>>(initialFits);
  const [copied, setCopied] = useState(false);

  const patch = (next: Partial<LabSettings>) => setSettings((current) => ({ ...current, ...next }));
  const reset = () => {
    setSettings(DEFAULT_SETTINGS);
    setFits(initialFits());
  };
  const copyFits = async () => {
    const values = Object.fromEntries(
      Object.entries(fits)
        .filter(([themeId]) => themeId !== 'flint')
        .map(([themeId, fit]) => [themeId, { bandStepFit: fit }]),
    );
    await navigator.clipboard.writeText(JSON.stringify(values, null, 2));
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  return (
    <div style={{ padding: '10px 4px 64px' }}>
      <header style={{ marginBottom: 18 }}>
        <h1 style={{ margin: '0 0 5px', fontSize: 20, letterSpacing: 0, color: siteTheme.text }}>Band stretching lab</h1>
        <p style={{ margin: 0, maxWidth: 820, color: siteTheme.textMuted, fontSize: 13, lineHeight: 1.55 }}>
          Calibrate each house independently on the same Vega-Lite band-X / continuous-Y geometry. <code>bandStepFit</code> only broadens sparse bands toward an explicit canvas capacity, up to a fixed readability ceiling; dense pressure and two-banded grids are outside this surface.
        </p>
      </header>

      <section className="band-stretching-controls" style={{ position: 'sticky', top: 0, zIndex: 3, background: siteTheme.surface, borderTop: `1px solid ${siteTheme.border}`, borderBottom: `1px solid ${siteTheme.border}`, padding: '12px 0', marginBottom: 18 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 18, alignItems: 'center' }}>
          <div role="tablist" aria-label="Chart case" style={{ display: 'inline-flex', border: `1px solid ${siteTheme.border}`, padding: 2 }}>
            {([['bar', 'Bar'], ['waterfall', 'Waterfall']] as const).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={settings.caseId === id}
                onClick={() => patch({ caseId: id })}
                style={{ border: 0, padding: '5px 12px', cursor: 'pointer', background: settings.caseId === id ? siteTheme.accent : 'transparent', color: settings.caseId === id ? '#fff' : siteTheme.text, fontSize: 12 }}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="band-stretching-control-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(260px, 1fr))', gap: '7px 24px', flex: '1 1 620px' }}>
            <Slider label="Categories" value={settings.count} min={2} max={30} onChange={(count) => patch({ count })} />
            <Slider label="Base size" value={settings.baseSize} min={280} max={720} step={20} suffix="px" onChange={(baseSize) => patch({ baseSize, capacityWidth: Math.max(baseSize, settings.capacityWidth) })} />
            <Slider label="Canvas capacity" value={settings.capacityWidth} min={settings.baseSize} max={960} step={20} suffix="px" onChange={(capacityWidth) => patch({ capacityWidth })} />
          </div>

          <div style={{ display: 'flex', gap: 6 }}>
            <button type="button" title="Reset lab" onClick={reset} style={{ width: 32, height: 32, display: 'grid', placeItems: 'center', border: `1px solid ${siteTheme.border}`, background: siteTheme.surface, color: siteTheme.text, cursor: 'pointer' }}>
              <RotateCcw size={15} />
            </button>
            <button type="button" title="Copy theme bandStepFit JSON" onClick={copyFits} style={{ width: 32, height: 32, display: 'grid', placeItems: 'center', border: `1px solid ${siteTheme.border}`, background: siteTheme.surface, color: siteTheme.text, cursor: 'pointer' }}>
              {copied ? <Check size={15} /> : <Copy size={15} />}
            </button>
          </div>
        </div>
      </section>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px 12px', alignItems: 'flex-start' }}>
        {COLUMNS.map((themeId) => (
          <ThemeCell
            key={themeId}
            themeId={themeId}
            settings={settings}
            fit={fits[themeId] ?? 0}
            onFit={(fit) => setFits((current) => ({ ...current, [themeId]: fit }))}
          />
        ))}
      </div>
    </div>
  );
}
