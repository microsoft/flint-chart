import { useMemo, useState } from 'react';
import { assembleVegaLite } from 'flint-chart';
import { VegaLiteView } from '../components/VegaLiteView';
import { siteTheme } from '../shared/theme';

/**
 * Dev-playground section demonstrating the color/group band-dodge heuristic and
 * the `colorLayout` toggle. Three regimes render side by side and all respond to
 * the toggle:
 *   - redundant  (color == x)          → Auto: nested (full-width boxes)
 *   - sparse     (dept × level subset) → Auto: dodge, sized by global lane count
 *   - full       (country × gender)    → Auto: dodge
 * Forcing `dodge` / `nested` overrides Auto in every regime.
 */

type Dodge = 'auto' | 'local' | 'global';

interface Row { cat: string; sub: string; val: number }

// Tiny deterministic PRNG so the demo is stable across renders.
function makeRand(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
}

function buildRows(bands: Record<string, string[]>, seed: number): Row[] {
  const rand = makeRand(seed);
  const rows: Row[] = [];
  for (const [cat, subs] of Object.entries(bands)) {
    for (const sub of subs) {
      const center = 30 + (sub.charCodeAt(sub.length - 1) % 7) * 8;
      for (let i = 0; i < 18; i++) rows.push({ cat, sub, val: Math.round(center + rand() * 40) });
    }
  }
  return rows;
}

// Regime 1: color == x (redundant). Each band has exactly one color.
const REDUNDANT: Record<string, string[]> = {
  G: ['G'], PG: ['PG'], 'PG-13': ['PG-13'], R: ['R'], Other: ['Other'],
};
// Regime 2: sparse cross-product. 5 global levels, each dept holds 2.
const SPARSE: Record<string, string[]> = {
  Eng: ['L1', 'L2'], Sales: ['L2', 'L3'], HR: ['L3', 'L4'], Ops: ['L4', 'L5'], Legal: ['L5', 'L1'],
};
// Regime 3: full cross-product. Every band has both colors.
const FULL: Record<string, string[]> = {
  USA: ['M', 'F'], Japan: ['M', 'F'], Brazil: ['M', 'F'], Kenya: ['M', 'F'],
};

interface Regime { key: string; title: string; note: string; bands: Record<string, string[]>; seed: number }

const REGIMES: Regime[] = [
  { key: 'redundant', title: 'Redundant  (color = x)', note: 'maxPerBand 1 → Auto: none', bands: REDUNDANT, seed: 11 },
  { key: 'sparse', title: 'Sparse  (dept × level)', note: '1 < maxPerBand < global → Auto: local', bands: SPARSE, seed: 23 },
  { key: 'full', title: 'Full  (country × gender)', note: 'maxPerBand = global → Auto: global', bands: FULL, seed: 37 },
];

function boxplotSpec(bands: Record<string, string[]>, seed: number, dodge: Dodge): unknown {
  const rows = buildRows(bands, seed);
  return assembleVegaLite({
    data: { values: rows },
    semantic_types: { cat: 'Category', sub: 'Category', val: 'Quantity' },
    chart_spec: {
      chartType: 'Boxplot',
      encodings: { x: { field: 'cat' }, y: { field: 'val' }, color: { field: 'sub' } },
      chartProperties: { dodge },
      baseSize: { width: 260, height: 220 },
    },
  } as never);
}

const TOGGLE: { value: Dodge; label: string }[] = [
  { value: 'auto', label: 'Auto' },
  { value: 'local', label: 'Local' },
  { value: 'global', label: 'Global' },
];

export function DodgeToggleFigure() {
  const [dodge, setDodge] = useState<Dodge>('auto');
  const specs = useMemo(
    () => REGIMES.map((r) => ({ ...r, spec: boxplotSpec(r.bands, r.seed, dodge) })),
    [dodge],
  );

  return (
    <section style={wrapStyle}>
      <div style={headerRowStyle}>
        <div>
          <h3 style={titleStyle}>Color / group band-dodge</h3>
          <p style={subtitleStyle}>
            One rule (<code>planBandDodge</code>) decides dodge vs. full-width: gate on max distinct
            colors within any single band, lane count = global distinct. The <code>dodge</code>{' '}
            toggle overrides Auto.
          </p>
        </div>
        <div style={toggleStyle} role="tablist" aria-label="Color layout">
          {TOGGLE.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setDodge(t.value)}
              style={t.value === dodge ? toggleBtnActive : toggleBtn}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={gridStyle}>
        {specs.map((r) => (
          <figure key={r.key} style={cardStyle}>
            <figcaption style={captionStyle}>
              <span style={captionTitle}>{r.title}</span>
              <span style={captionNote}>{r.note}</span>
            </figcaption>
            <VegaLiteView spec={r.spec} />
          </figure>
        ))}
      </div>
    </section>
  );
}

const wrapStyle: React.CSSProperties = {
  width: 960,
  boxSizing: 'border-box',
  background: '#fff',
  border: '1px solid rgba(0,0,0,0.08)',
  borderRadius: 10,
  padding: 20,
  fontFamily: siteTheme.fontSans,
  color: siteTheme.text,
};
const headerRowStyle: React.CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  gap: 16,
  marginBottom: 16,
};
const titleStyle: React.CSSProperties = { margin: '0 0 4px', fontSize: 16, fontWeight: 600 };
const subtitleStyle: React.CSSProperties = { margin: 0, fontSize: 12.5, lineHeight: 1.5, color: 'rgba(0,0,0,0.6)', maxWidth: 560 };
const toggleStyle: React.CSSProperties = {
  display: 'inline-flex',
  border: '1px solid rgba(0,0,0,0.12)',
  borderRadius: 8,
  overflow: 'hidden',
  flexShrink: 0,
};
const toggleBtn: React.CSSProperties = {
  padding: '6px 12px',
  fontSize: 12.5,
  border: 'none',
  background: '#fff',
  color: 'rgba(0,0,0,0.65)',
  cursor: 'pointer',
};
const toggleBtnActive: React.CSSProperties = {
  ...toggleBtn,
  background: siteTheme.accent ?? '#4c78a8',
  color: '#fff',
  fontWeight: 600,
};
const gridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(3, 1fr)',
  gap: 16,
};
const cardStyle: React.CSSProperties = {
  margin: 0,
  border: '1px solid rgba(0,0,0,0.06)',
  borderRadius: 8,
  padding: 10,
  background: '#fcfcfd',
};
const captionStyle: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 6 };
const captionTitle: React.CSSProperties = { fontSize: 12.5, fontWeight: 600 };
const captionNote: React.CSSProperties = { fontSize: 11, color: 'rgba(0,0,0,0.5)' };
