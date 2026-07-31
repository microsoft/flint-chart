import { useMemo, useState, type CSSProperties } from 'react';
import { assembleVegaLite, THEME_PRESETS, type ChartAssemblyInput } from 'flint-chart';
import { VegaLiteView } from '../components/VegaLiteView';
import { siteTheme } from '../shared/theme';

/**
 * Interactive dev-labs panel for the categorical colour-overflow decision.
 *
 * Pick a chart type, drag the category count up, and switch colour schemes to
 * watch how Flint hands out inks when the field has more categories than a
 * house owns colours:
 *
 *  - a *discrete* house palette keeps its indexed set (auto-upsized to the
 *    house's extended tier where it has one), then folds the long tail onto one
 *    muted overflow ink with an explicit "Others (N)" legend row — the top
 *    categories by share stay named, the rest read as "everything else";
 *  - a *continuous* ramp samples every category along the scheme, so all N are
 *    accommodated and the legend is the standard categorical list.
 *
 * The decision lives in the Vega-Lite theme realizer, so this panel drives that
 * backend directly rather than the multi-backend adapter.
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

type ChartKind = 'Bar Chart' | 'Scatter Plot' | 'Pie Chart';

const CHART_KINDS: ChartKind[] = ['Bar Chart', 'Scatter Plot', 'Pie Chart'];

/** N categories, each with a value (skewed so a share ordering is meaningful)
 * and an X/Y position for the scatter case. */
function categoryRows(n: number, kind: ChartKind): Record<string, unknown>[] {
  const rng = mulberry32(0x51c0 + n);
  return Array.from({ length: n }, (_, i) => {
    const Category = `Cat ${String(i + 1).padStart(2, '0')}`;
    if (kind === 'Scatter Plot') {
      return { Category, X: Math.round(rng() * 100), Y: Math.round(rng() * 100) };
    }
    // A gentle decreasing skew so the earliest categories are the biggest —
    // gives the "top by share keep a colour" fold something to rank.
    return { Category, Value: Math.round(12 + (n - i) * (3 + rng() * 5)) };
  });
}

const BASE = { width: 520, height: 400 } as const;

function buildInput(kind: ChartKind, n: number): ChartAssemblyInput {
  const values = categoryRows(n, kind);
  if (kind === 'Scatter Plot') {
    return {
      data: { values },
      semantic_types: { Category: 'Category', X: 'Quantity', Y: 'Quantity' },
      chart_spec: {
        chartType: kind,
        encodings: { x: { field: 'X' }, y: { field: 'Y' }, color: { field: 'Category' } },
        baseSize: BASE,
      },
    };
  }
  if (kind === 'Pie Chart') {
    return {
      data: { values },
      semantic_types: { Category: 'Category', Value: 'Quantity' },
      chart_spec: {
        chartType: kind,
        encodings: { size: { field: 'Value' }, color: { field: 'Category' } },
        baseSize: BASE,
      },
    };
  }
  return {
    data: { values },
    semantic_types: { Category: 'Category', Value: 'Quantity' },
    chart_spec: {
      chartType: kind,
      encodings: { x: { field: 'Category' }, y: { field: 'Value' }, color: { field: 'Category' } },
      baseSize: BASE,
    },
  };
}

/** House themes carry the categorical set + extended tier + overflow ink that
 * the fold reads; "continuous" is a synthetic option handled separately. */
const CONTINUOUS = 'continuous';
type SchemeId = string;

const SCHEMES: { id: SchemeId; label: string }[] = [
  { id: 'nyt', label: 'NYT — discrete (5 → 12 + Others)' },
  { id: 'nature', label: 'Nature — discrete (6 → 12 + Others)' },
  { id: 'datawrapper', label: 'Datawrapper — discrete (5 → 12 + Others)' },
  { id: 'powerbi-light', label: 'Power BI Light — discrete (6 → 12 + Others)' },
  { id: 'economist', label: 'Economist — discrete, restrained (6 + Others)' },
  { id: CONTINUOUS, label: 'Continuous ramp (viridis) — accommodate all' },
];

/** Walk the assembled spec and point every categorical colour channel at a
 * continuous scheme, so a nominal field is sampled across the whole ramp. */
function applyContinuousScheme(spec: any, ramp: string): void {
  const visit = (node: any) => {
    if (!node || typeof node !== 'object') return;
    for (const channel of ['color', 'fill', 'stroke']) {
      const enc = node.encoding?.[channel];
      if (enc && enc.field) {
        enc.scale = { scheme: ramp };
        if (enc.legend && typeof enc.legend === 'object') delete enc.legend.values;
      }
    }
    for (const key of Object.keys(node)) {
      const v = node[key];
      if (Array.isArray(v)) v.forEach(visit);
      else if (v && typeof v === 'object') visit(v);
    }
  };
  visit(spec);
}

const labelStyle: CSSProperties = { fontSize: 13, color: siteTheme.textMuted, fontWeight: 500 };

const pill = (active: boolean): CSSProperties => ({
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
});

export function ColorDecisionFigure() {
  const [kind, setKind] = useState<ChartKind>('Pie Chart');
  const [count, setCount] = useState(18);
  const [scheme, setScheme] = useState<SchemeId>('nyt');

  const { spec, error, folded } = useMemo(() => {
    try {
      const input = buildInput(kind, count);
      if (scheme === CONTINUOUS) {
        const s = assembleVegaLite(input) as any;
        applyContinuousScheme(s, 'viridis');
        return { spec: s, error: null as string | null, folded: false };
      }
      const preset = THEME_PRESETS[scheme];
      const s = assembleVegaLite({ ...input, theme_spec: preset.spec }) as any;
      // The realizer adds a `__flintColorKey` transform only when it folds the
      // tail — a cheap signal for the caption.
      const foldedNow = JSON.stringify(s).includes('__flintColorKey');
      return { spec: s, error: null, folded: foldedNow };
    } catch (err) {
      return { spec: null, error: String((err as Error)?.message ?? err), folded: false };
    }
  }, [kind, count, scheme]);

  const pct = ((count - 3) / (40 - 3)) * 100;

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
        <h2 style={{ margin: '0 0 6px', fontSize: 18, color: siteTheme.text }}>
          Colour overflow — top-K + "Others (N)"
        </h2>
        <p style={{ margin: 0, fontSize: 13, color: siteTheme.textMuted, lineHeight: 1.55, maxWidth: 720 }}>
          Add categories past a house's palette and watch the decision. A <strong>discrete</strong> house
          keeps its indexed inks (auto-upsized to its extended tier), then folds the long tail onto one muted
          overflow ink with an explicit <code>Others (N)</code> legend row. A <strong>continuous</strong> ramp
          samples every category, so all N are accommodated with a standard legend. Lines and areas never fold
          (that would thread one path through unrelated series), so this panel uses bars, points, and wedges.
        </p>
      </header>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignItems: 'center' }}>
          {/* Chart-type tabs */}
          <div
            role="tablist"
            aria-label="Chart type"
            style={{
              display: 'inline-flex',
              gap: 2,
              padding: 3,
              borderRadius: 9,
              background: siteTheme.hover,
              border: `1px solid ${siteTheme.border}`,
            }}
          >
            {CHART_KINDS.map((id) => (
              <button key={id} role="tab" aria-selected={id === kind} onClick={() => setKind(id)} style={pill(id === kind)}>
                {id.replace(' Chart', '').replace(' Plot', '')}
              </button>
            ))}
          </div>

          {/* Scheme selector */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ ...labelStyle, whiteSpace: 'nowrap' }}>Colour scheme</span>
            <select
              value={scheme}
              onChange={(e) => setScheme(e.target.value)}
              style={{
                fontSize: 12,
                padding: '6px 10px',
                borderRadius: 8,
                border: `1px solid ${siteTheme.border}`,
                background: siteTheme.surface,
                color: siteTheme.text,
                cursor: 'pointer',
              }}
            >
              {SCHEMES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          {/* Category-count slider */}
          <label style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 240 }}>
            <span style={{ ...labelStyle, whiteSpace: 'nowrap' }}>Categories</span>
            <input
              type="range"
              min={3}
              max={40}
              step={1}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="site-range"
              style={{ '--pct': `${pct}%`, flex: 1 } as CSSProperties}
            />
            <span
              style={{
                fontFamily: siteTheme.fontMono,
                fontWeight: 700,
                fontSize: 18,
                color: siteTheme.text,
                minWidth: 22,
                textAlign: 'right',
              }}
            >
              {count}
            </span>
          </label>

          <span style={{ fontSize: 13, color: siteTheme.textMuted }}>
            {scheme === CONTINUOUS
              ? 'all categories sampled along the ramp'
              : folded
                ? 'folded — top inks kept, tail → Others'
                : 'within palette — every category named'}
          </span>
        </div>

        {/* Chart stage */}
        <div
          style={{
            width: '100%',
            minHeight: 460,
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
            spec && <VegaLiteView spec={spec} />
          )}
        </div>
      </div>
    </section>
  );
}
