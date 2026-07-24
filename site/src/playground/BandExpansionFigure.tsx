import { useMemo, useState, type CSSProperties } from 'react';
import type { ChartAssemblyInput } from 'flint-chart';
import { BACKENDS, ALL_BACKENDS, type PreviewBackend } from '../shared/supported-backends';
import { VegaLiteView } from '../components/VegaLiteView';
import { EChartsView } from '../components/EChartsView';
import { ChartjsView } from '../components/ChartjsView';
import { PlotlyView } from '../components/PlotlyView';
import { siteTheme } from '../shared/theme';

/**
 * Interactive dev-labs panel for the band min/base/max sizing model.
 *
 * A single bar chart driven by a category-count slider (same widget pattern as
 * the doc-page SizingPlayground). Drag it up and watch each band expand to fill
 * the plot (sparse) then compress as categories crowd the axis (dense). Backend
 * tabs switch renderers so the per-backend expansion ceilings are comparable.
 */

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

function categoryRows(n: number): { Category: string; Value: number }[] {
  const rng = mulberry32(20260722);
  return Array.from({ length: n }, (_, i) => ({
    Category: `C${String(i + 1).padStart(2, '0')}`,
    Value: Math.round(20 + rng() * 80),
  }));
}

const BASE = { width: 560, height: 340 } as const;

function buildInput(count: number): ChartAssemblyInput {
  return {
    data: { values: categoryRows(count) },
    semantic_types: { Category: 'Category', Value: 'Quantity' },
    chart_spec: { chartType: 'Bar Chart', encodings: { x: 'Category', y: 'Value' }, baseSize: BASE },
  };
}

function BackendChart({ backend, spec }: { backend: PreviewBackend; spec: unknown }) {
  if (backend === 'vegalite') return <VegaLiteView spec={spec} />;
  if (backend === 'echarts') return <EChartsView option={spec} constrain={false} />;
  if (backend === 'chartjs') return <ChartjsView config={spec} constrain={false} />;
  return <PlotlyView figure={spec} constrain={false} />;
}

const labelStyle: CSSProperties = { fontSize: 13, color: siteTheme.textMuted, fontWeight: 500 };

export function BandExpansionFigure() {
  const [backend, setBackend] = useState<PreviewBackend>('plotly');
  const [count, setCount] = useState(5);

  const { spec, width, error } = useMemo(() => {
    try {
      const s = BACKENDS[backend].assemble(buildInput(count)) as any;
      return {
        spec: s,
        width: typeof s?._width === 'number' ? Math.round(s._width) : 0,
        error: null as string | null,
      };
    } catch (err) {
      return { spec: null, width: 0, error: String((err as Error)?.message ?? err) };
    }
  }, [backend, count]);

  const pct = ((count - 2) / (40 - 2)) * 100;

  return (
    <section
      style={{
        border: `1px solid ${siteTheme.border}`,
        borderRadius: siteTheme.radius,
        background: siteTheme.surface,
        padding: 24,
        margin: '20px 0',
      }}
    >
      <header style={{ marginBottom: 20 }}>
        <h2 style={{ margin: '0 0 6px', fontSize: 18, color: siteTheme.text }}>Band expansion — min / base / max</h2>
        <p style={{ margin: 0, fontSize: 13, color: siteTheme.textMuted, lineHeight: 1.55, maxWidth: 680 }}>
          Drag the slider to add categories. Sparse charts expand each band up to the backend's
          {' '}<code>maxBandSize</code>; dense charts compress bands to fit. Vega-Lite keeps its
          native step size; ECharts, Chart.js, and Plotly fill their plot area.
        </p>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        {/* Controls toolbar */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center' }}>
          <div
            role="tablist"
            aria-label="Backend"
            style={{
              display: 'inline-flex',
              gap: 2,
              padding: 3,
              borderRadius: 9,
              background: siteTheme.hover,
              border: `1px solid ${siteTheme.border}`,
            }}
          >
            {ALL_BACKENDS.map((id) => {
              const active = id === backend;
              return (
                <button
                  key={id}
                  role="tab"
                  aria-selected={active}
                  onClick={() => setBackend(id)}
                  style={{
                    cursor: 'pointer',
                    fontSize: 12,
                    padding: '5px 12px',
                    borderRadius: 7,
                    border: 'none',
                    whiteSpace: 'nowrap',
                    background: active ? siteTheme.surface : 'transparent',
                    boxShadow: active ? '0 1px 2px rgba(0,0,0,0.12)' : 'none',
                    color: active ? siteTheme.text : siteTheme.textMuted,
                    fontWeight: active ? 600 : 500,
                  }}
                >
                  {BACKENDS[id].label}
                </button>
              );
            })}
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 260 }}>
            <span style={{ ...labelStyle, whiteSpace: 'nowrap' }}>Categories</span>
            <input
              type="range"
              min={2}
              max={40}
              step={1}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="site-range"
              style={{ '--pct': `${pct}%`, flex: 1 } as CSSProperties}
            />
            <span style={{ fontFamily: siteTheme.fontMono, fontWeight: 700, fontSize: 18, color: siteTheme.text, minWidth: 22, textAlign: 'right' }}>
              {count}
            </span>
          </label>

          <span style={{ fontSize: 13, color: siteTheme.textMuted }}>
            plot <span style={{ fontFamily: siteTheme.fontMono, color: siteTheme.text }}>{width}px</span>
            {' · '}
            <span style={{ fontFamily: siteTheme.fontMono, color: siteTheme.text }}>~{Math.round(width / count)}px</span>/band
          </span>
        </div>

        {/* Chart — fixed-size stage so the panel never reflows as N changes */}
        <div
          style={{
            width: '100%',
            height: 460,
            boxSizing: 'border-box',
            border: `1px solid ${siteTheme.border}`,
            borderRadius: 10,
            background: siteTheme.surface,
            padding: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'auto',
          }}
        >
          {error ? (
            <div style={{ color: siteTheme.error, fontSize: 13, fontFamily: siteTheme.fontMono }}>{error}</div>
          ) : (
            spec && <BackendChart backend={backend} spec={spec} />
          )}
        </div>
      </div>
    </section>
  );
}
