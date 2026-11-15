/**
 * Style guides: published data-visualisation style guides, each mapped onto a Flint ThemeSpec. A house page
 * reads in three steps: what the guide is and where it comes from, what Flint draws with the theme today,
 * and the gaps between the two. The issues those gaps add up to live on the Theme improvement page.
 */
import { useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import { FlintView } from '../../components/FlintView';
import { ScaleToFit } from '../../components/ScaleToFit';
import { PREVIEW_CASES } from '../../shared/preview-cases';
import { useHouseFonts } from '../house-fonts';
import { STYLE_GUIDE_THEMES } from './themes';
import { Badge, GapRow, Md, isDeferred } from './gaps';
import type { ResearchRecord, StyleGuideTheme } from './types';

const RESEARCH = Object.values(
  import.meta.glob('./research/*.json', { eager: true, import: 'default' }) as Record<string, ResearchRecord>,
).sort((a, b) => a.org.localeCompare(b.org));

const THEME_BY_ID = new Map(STYLE_GUIDE_THEMES.map((theme) => [theme.id, theme]));

const DEFAULT_GALLERY = [
  'population', 'temp-anomaly', 'medals-grouped', 'electricity-stacked', 'ev-share',
  'us-unemployment', 'electricity-mix-area', 'browser-pie', 'gapminder-bubble', 'temp-heatmap',
];

const RULES_SHOWN = 5;
const HEX = /^#[0-9a-f]{3,8}$/i;
const hexes = (value: unknown): string[] => (Array.isArray(value) ? value : [value]).filter((c): c is string => typeof c === 'string' && HEX.test(c));

function Swatches({ colors, size = 'md' }: { colors: string[]; size?: 'sm' | 'md' }) {
  if (!colors.length) return null;
  return <span className={`tp-swatches tp-swatches-${size}`}>{colors.map((c, i) => <span key={`${c}-${i}`} title={c} style={{ background: c }} />)}</span>;
}

const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');

/** A research block as label / value lines, for the full notes. */
function Facts({ title, value }: { title: string; value: unknown }) {
  if (value == null || value === '') return null;
  const entries: [string, unknown][] = typeof value === 'object' && !Array.isArray(value)
    ? Object.entries(value as Record<string, unknown>)
    : [['', value]];
  const shown = entries.filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length));
  if (!shown.length) return null;
  const text = (v: unknown): string => typeof v === 'string' ? v
    : Array.isArray(v) ? v.map(text).join(', ')
      : typeof v === 'object' ? Object.entries(v as Record<string, unknown>).filter(([, x]) => x != null).map(([k, x]) => `${k}: ${text(x)}`).join('; ')
        : String(v);
  return (
    <div className="tp-facts">
      <h4>{title}</h4>
      <dl className="tp-kv">
        {shown.map(([k, v]) => <div key={k} className="tp-kv-row">{k && <dt>{k}</dt>}<dd>{text(v)}</dd></div>)}
      </dl>
    </div>
  );
}

/** 1. What the guide is: its summary, sources, palette, type and the rules that make it recognisable. */
function About({ r }: { r: ResearchRecord }) {
  const [allRules, setAllRules] = useState(false);
  const colors = (r.colors ?? {}) as Record<string, unknown>;
  const typography = (r.typography ?? {}) as Record<string, unknown>;
  const rules = r.distinctiveRules ?? [];
  const palette: [string, string[]][] = ([
    ['Categorical', hexes(colors.categorical)],
    ['Sequential', hexes(colors.sequential)],
    ['Diverging', hexes(colors.diverging)],
    ['Surface and text', hexes([colors.background, colors.text, colors.gridline])],
  ] as [string, string[]][]).filter(([, list]) => list.length);
  return (
    <section className="tp-section">
      <h2><span className="tp-step">1</span> The guide</h2>
      <div className="tp-about">
        <div>
          <p className="tp-lead">{r.summary}</p>
          <p className="tp-sources">
            Sources: {r.urls.map((url, i) => <span key={url}>{i ? ' · ' : ''}<a href={url} target="_blank" rel="noreferrer">{shortUrl(url)}</a></span>)}
            {r.access !== 'full' && <> <Badge tone={r.access === 'partial' ? 'warn' : 'bad'}>{r.access} access</Badge></>}
          </p>
        </div>
        <dl className="tp-kv tp-about-side">
          {palette.map(([label, list]) => <div key={label} className="tp-kv-row"><dt>{label}</dt><dd><Swatches colors={list} /></dd></div>)}
          {typeof typography.family === 'string' && <div className="tp-kv-row"><dt>Type</dt><dd>{typography.family}</dd></div>}
        </dl>
      </div>
      {rules.length > 0 && (
        <>
          <h3>What makes it recognisable</h3>
          <ol className="tp-rules">
            {(allRules ? rules : rules.slice(0, RULES_SHOWN)).map((rule, i) => (
              <li key={i}>{rule.rule}{rule.source && <> <a href={rule.source} target="_blank" rel="noreferrer" className="tp-source-link">source</a></>}</li>
            ))}
          </ol>
          {rules.length > RULES_SHOWN && (
            <button type="button" className="tp-link-button" onClick={() => setAllRules((v) => !v)}>
              {allRules ? 'Fewer rules' : `All ${rules.length} rules`}
            </button>
          )}
        </>
      )}
      <details className="tp-more">
        <summary>Full research notes</summary>
        {r.accessNotes && <p className="tp-muted">{r.accessNotes}</p>}
        <div className="tp-facts-grid">
          <Facts title="Colour notes" value={[colors.categoricalNotes, colors.notes].filter(Boolean).join(' ')} />
          <Facts title="Typography" value={r.typography} />
          <Facts title="Structure" value={r.structure} />
          <Facts title="Legend" value={r.legend} />
          <Facts title="Marks" value={r.marks} />
          <Facts title="Labels" value={r.labels} />
          <Facts title="Furniture" value={r.furniture} />
          <Facts title="Annotations" value={r.annotations} />
          <Facts title="Layout" value={r.layout} />
          <Facts title="Interaction" value={r.interaction} />
          <Facts title="Accessibility" value={r.accessibility} />
          <Facts title="Chart types" value={r.chartTypes} />
        </div>
        {r.referenceImages?.some((image) => image.describes) && (
          <div className="tp-facts">
            <h4>Reference charts in the guide</h4>
            <ul>
              {r.referenceImages.filter((image) => image.describes).map((image, i) => (
                <li key={i}>{image.describes} {image.url && <a href={image.url} target="_blank" rel="noreferrer" className="tp-source-link">image</a>}</li>
              ))}
            </ul>
          </div>
        )}
      </details>
    </section>
  );
}

/** 2. What Flint draws with the house theme over the standard charts, and how the guide was mapped. */
function FlintToday({ theme }: { theme: StyleGuideTheme }) {
  const [showSpec, setShowSpec] = useState(false);
  const cases = (theme.gallery ?? DEFAULT_GALLERY)
    .map((id) => PREVIEW_CASES.find((c) => c.id === id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  return (
    <section className="tp-section">
      <h2><span className="tp-step">2</span> In Flint today</h2>
      <div className="tp-gallery">
        {cases.map((c) => (
          <div key={c.id} className="tp-gallery-cell" data-gallery={c.id}>
            <ScaleToFit height={210} minHeight={110} adaptiveHeight padding={2}>
              <FlintView
                spec={{
                  data: { values: c.data },
                  semantic_types: c.semantic_types,
                  chart_spec: { chartType: c.chartType, encodings: c.encodings, baseSize: { width: 320, height: 210 }, title: c.title, ...(c.chartProperties ? { chartProperties: c.chartProperties } : {}) },
                  theme_spec: theme.theme,
                } as any}
                renderer="svg"
                compact
              />
            </ScaleToFit>
          </div>
        ))}
      </div>
      <details className="tp-more">
        <summary>How the guide maps onto the ThemeSpec</summary>
        <Md>{theme.notes}</Md>
        <button type="button" className="tp-link-button" onClick={() => setShowSpec((v) => !v)}>{showSpec ? 'Hide' : 'Show'} ThemeSpec JSON</button>
        {showSpec && <pre className="tp-json">{JSON.stringify(theme.theme, null, 2)}</pre>}
      </details>
    </section>
  );
}

/** 3. Where the theme falls short of the guide, most severe first. */
function Gaps({ theme }: { theme: StyleGuideTheme }) {
  const rank = { high: 0, medium: 1, low: 2 } as const;
  const gaps = theme.gaps.filter((gap) => !isDeferred(gap)).sort((a, b) => rank[a.severity] - rank[b.severity]);
  const deferred = theme.gaps.filter(isDeferred);
  return (
    <section className="tp-section">
      <h2><span className="tp-step">3</span> Gaps <span className="tp-count">{gaps.length}</span></h2>
      {gaps.length ? gaps.map((gap) => <GapRow key={gap.id} gap={gap} />) : <p className="tp-muted">None found.</p>}
      {deferred.length > 0 && (
        <details className="tp-more">
          <summary>{deferred.length} more about chart annotations (emphasis, callouts, in-text keys), left for the annotation layer</summary>
          {deferred.map((gap) => <GapRow key={gap.id} gap={gap} />)}
        </details>
      )}
    </section>
  );
}

function HousePage({ r }: { r: ResearchRecord }) {
  const theme = THEME_BY_ID.get(r.id);
  return (
    <article>
      <header className="tp-house-head">
        <h1>{r.org}</h1>
        {r.context && <Badge>{r.context}</Badge>}
      </header>
      <About r={r} />
      {theme ? <><FlintToday theme={theme} /><Gaps theme={theme} /></> : <p className="tp-muted">Not yet mapped onto a ThemeSpec.</p>}
    </article>
  );
}

function Index({ onOpen }: { onOpen: (id: string) => void }) {
  return (
    <div>
      <h1>Style guides</h1>
      <p className="tp-lead">
        {RESEARCH.length} published data-visualisation style guides (from datavizstyleguide.com), {STYLE_GUIDE_THEMES.length} of them mapped onto a
        Flint ThemeSpec. Each page shows the guide, what Flint draws with it, and the gaps. The issues across houses, and the fixes
        made for them, are on <a href="#/playground/theme-improvement">Theme improvement</a>.
      </p>
      <div className="tp-house-grid">
        {RESEARCH.map((r) => {
          const theme = THEME_BY_ID.get(r.id);
          const gaps = theme?.gaps.filter((gap) => !isDeferred(gap)).length;
          return (
            <button key={r.id} type="button" className="tp-house-card" onClick={() => onOpen(r.id)}>
              <span className="tp-house-card-name">{r.org}</span>
              <Swatches colors={hexes((r.colors as Record<string, unknown> | null)?.categorical).slice(0, 8)} size="sm" />
              <span className="tp-muted">{r.context ?? '—'}{gaps != null ? ` · ${gaps} gaps` : ''}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function NewThemeTest() {
  const fontsReady = useHouseFonts();
  const [params, setParams] = useSearchParams();
  const active = params.get('theme');
  const [filter, setFilter] = useState('');
  const open = (id: string | null) => {
    setParams(id ? { theme: id } : {});
    window.scrollTo({ top: 0 });
  };
  const record = RESEARCH.find((r) => r.id === active);
  const list = useMemo(
    () => RESEARCH.filter((r) => r.org.toLowerCase().includes(filter.toLowerCase()) || r.id.includes(filter.toLowerCase())),
    [filter],
  );
  // The issues once lived here; old links to them open them on Theme improvement.
  if (active === 'issues') {
    const issue = params.get('issue');
    return <Navigate to={`../theme-improvement?view=issues${issue ? `&issue=${issue}` : ''}`} replace />;
  }
  return (
    <div className="tp-page tp-with-sidebar">
      <nav className="tp-sidebar" aria-label="Style guides">
        <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Filter houses" />
        <button type="button" className={!record ? 'is-on' : undefined} onClick={() => open(null)}>All guides</button>
        {list.map((r) => (
          <button key={r.id} type="button" className={active === r.id ? 'is-on' : undefined} onClick={() => open(r.id)} data-tab={r.id}>{r.org}</button>
        ))}
      </nav>
      <main>
        {!fontsReady ? <p className="tp-muted">Loading house fonts…</p>
          : record ? <HousePage key={record.id} r={record} /> : <Index onOpen={open} />}
      </main>
    </div>
  );
}
