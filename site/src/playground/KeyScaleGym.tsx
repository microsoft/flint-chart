import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import { FlintView } from '../components/FlintView';
import { PREVIEW_CASES } from '../shared/preview-cases';
import { siteTheme } from '../shared/theme';

/**
 * Keys as the chart shrinks. A colour ramp drawn at Vega's fixed 16 px outweighs the marks of a small
 * plot; the plan keeps 16 px on a canvas of the house's own size or larger and slims it below that (to 8 px).
 * The key's text is never set larger than the axis labels beside it.
 * Each row draws one chart at shrinking sizes, at its own size, and reads the plot, the key and the ramp off the drawing.
 */

const SIZES = [
  { width: 640, height: 420 },
  { width: 480, height: 320 },
  { width: 360, height: 240 },
  { width: 260, height: 180 },
] as const;

type Row = Record<string, unknown>;

const caseRows = (id: string) => PREVIEW_CASES.find((c) => c.id === id)!;

/** The Big Mac index with each price against the US price: a stepped (threshold) ramp. */
const BIG_MAC = caseRows('big-mac').data.map((row) => ({ ...row, 'vs US price': Math.round(((row['Price (USD)'] as number) / 5.7 - 1) * 100) / 100 }));

interface KeyCase {
  id: string;
  label: string;
  note: string;
  input: (size: { width: number; height: number }) => ChartAssemblyInput;
}

const sized = (size: { width: number; height: number }) => ({ baseSize: size, canvasSize: size });

const fromPreview = (id: string, theme: string, title: string) => (size: { width: number; height: number }) => {
  const c = caseRows(id);
  return {
    data: { values: c.data as Row[] }, semantic_types: c.semantic_types, theme_spec: theme,
    chart_spec: { chartType: c.chartType, title, encodings: c.encodings, ...(c.chartProperties ? { chartProperties: c.chartProperties } : {}), ...sized(size) },
  } as ChartAssemblyInput;
};

const CASES: KeyCase[] = [
  {
    id: 'binned', label: 'Stepped ramp · Datawrapper', note: 'Threshold colour on bars; the README wall case.',
    input: (size) => ({
      data: { values: BIG_MAC }, theme_spec: 'datawrapper',
      semantic_types: { Country: 'Country', 'Price (USD)': 'Quantity', 'vs US price': 'PercentageChange' },
      chart_spec: { chartType: 'Bar Chart', title: 'The Big Mac index, 2023', encodings: { x: 'Price (USD)', y: 'Country', color: 'vs US price' }, ...sized(size) },
    }) as ChartAssemblyInput,
  },
  { id: 'ramp', label: 'Continuous ramp · Swiss', note: 'A heatmap\'s gradient key.', input: fromPreview('temp-heatmap', 'swiss', 'Monthly temperature by city') },
  { id: 'symbols', label: 'Category key · Economist', note: 'Swatches and names above a stacked bar.', input: fromPreview('electricity-stacked', 'economist', 'How countries make electricity') },
];

interface Reading { plot: number; plotHeight: number; key: number; ramp: number; keyLabel: number; axisLabel: number }

/** Reads the plot's width (its x axis), the key's width and both label sizes off a drawn Vega SVG. */
function read(svg: SVGSVGElement): Reading | null {
  const box = (selector: string) => {
    const nodes = [...svg.querySelectorAll<SVGGraphicsElement>(selector)];
    return nodes.length ? Math.max(...nodes.map((node) => node.getBBox().width)) : 0;
  };
  const size = (selector: string) => {
    const text = svg.querySelector<SVGTextElement>(selector);
    return text ? Number.parseFloat(text.getAttribute('font-size') ?? getComputedStyle(text).fontSize) : 0;
  };
  const plot = box('.role-axis-grid') || box('.role-axis-domain') || box('.role-axis');
  const tall = (selector: string) => {
    const nodes = [...svg.querySelectorAll<SVGGraphicsElement>(selector)];
    return nodes.length ? Math.max(...nodes.map((node) => node.getBBox().height)) : 0;
  };
  const plotHeight = tall('.role-axis-grid') || tall('.role-axis-domain');
  const key = box('.role-legend');
  // A ramp's thickness is the short side of its drawn bar, continuous or stepped.
  const bar = svg.querySelector<SVGGraphicsElement>('.role-legend-gradient, .role-legend-band');
  const ramp = bar ? Math.min(bar.getBBox().width, bar.getBBox().height) : 0;
  if (!plot && !key) return null;
  return { plot, plotHeight, key, ramp, keyLabel: size('.role-legend-label text'), axisLabel: size('.role-axis-label text') };
}

function Drawn({ keyCase, size }: { keyCase: KeyCase; size: { width: number; height: number } }) {
  const ref = useRef<HTMLDivElement>(null);
  const [reading, setReading] = useState<Reading | null>(null);
  useLayoutEffect(() => {
    const host = ref.current;
    if (!host) return;
    let frame = 0;
    const measure = () => {
      const svg = host.querySelector('svg');
      const next = svg ? read(svg as SVGSVGElement) : null;
      if (next) setReading(next);
      else frame = requestAnimationFrame(measure);
    };
    const observer = new MutationObserver(() => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); });
    observer.observe(host, { childList: true, subtree: true });
    measure();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [keyCase, size]);
  const short = reading ? Math.min(reading.plot, reading.plotHeight || reading.plot) : 0;
  const heavy = reading ? reading.ramp > 0 && short > 0 && reading.ramp / short > 0.06 : false;
  return (
    <figure style={{ margin: 0, display: 'grid', gap: 4, alignContent: 'start' }} data-key-case={`${keyCase.id}-${size.width}`}>
      <div ref={ref} style={{ border: `1px dashed ${siteTheme.border}`, width: size.width, height: size.height, overflow: 'visible' }}>
        <FlintView spec={keyCase.input(size)} renderer="svg" compact />
      </div>
      <figcaption style={{ fontSize: 11, color: siteTheme.textMuted, lineHeight: 1.45 }}>
        <strong style={{ color: siteTheme.text }}>{size.width}×{size.height}</strong>
        {reading && <>
          {' '}· plot {Math.round(reading.plot)}×{Math.round(reading.plotHeight)} · key {Math.round(reading.key)}
          <br />ramp{' '}
          <span style={{ color: heavy ? '#b42318' : undefined, fontWeight: heavy ? 600 : undefined }}>
            {reading.ramp ? `${Math.round(reading.ramp)} px (${Math.round((reading.ramp / short) * 100)}% of short side)` : 'none'}
          </span>
          {' '}· labels: axis {reading.axisLabel || '–'} · key {reading.keyLabel || '–'}
        </>}
      </figcaption>
    </figure>
  );
}

const row: CSSProperties = { display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-start' };

export function KeyScaleGym() {
  return (
    <section style={{ width: 'min(100%, 1080px)' }} data-gym="key-scale">
      <header style={{ marginBottom: 8, maxWidth: 1080 }}>
        <h2 style={{ margin: 0, fontSize: 16 }}>Colour ramps as the chart shrinks</h2>
        <p style={{ margin: '2px 0 0', fontSize: 11, color: siteTheme.textMuted }}>
          Each chart is laid out for the canvas under it (<code>baseSize</code> = <code>canvasSize</code>). A ramp is
          Vega&apos;s 16 px on a canvas of the house&apos;s own size (else 400×320) or more; smaller, it slims by the share
          of that room the canvas has, to 8 px (<code>RAMP_THICKNESS</code> in <code>core/legend-plan.ts</code>). The key&apos;s
          text is never larger than the axis labels. Red marks a ramp thicker than 6% of the plot&apos;s shorter side.
        </p>
      </header>
      <div style={{ display: 'grid', gap: 16 }}>
        {CASES.map((keyCase) => (
          <div key={keyCase.id}>
            <h3 style={{ margin: '0 0 6px', fontSize: 13 }}>
              {keyCase.label} <span style={{ fontWeight: 400, color: siteTheme.textMuted }}>· {keyCase.note}</span>
            </h3>
            <div style={row}>
              {SIZES.map((size) => <Drawn key={size.width} keyCase={keyCase} size={size} />)}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
