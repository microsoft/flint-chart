/**
 * Backend layout: the Vega-Lite layout labs' cases drawn by ECharts, Chart.js or Plotly, one page per
 * backend, with what each backend's frame measured and the cases to check by eye at the top.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import type { ChartAssemblyInput } from 'flint-chart';
import { FlintView } from '../../components/FlintView';
import { ScaleToFit } from '../../components/ScaleToFit';
import { BACKENDS, type PreviewBackend } from '../../shared/supported-backends';
import { SECTIONS, SETUPS, LEGEND_SIZES, setupLabel, sectionCases, type LayoutCase, type SectionId } from './cases';
import { REVIEW_NOTES, type ReviewBackend } from './review-notes';
import './backend-layout.css';

const PAGE_BACKENDS: ReviewBackend[] = ['echarts', 'chartjs', 'plotly'];
const THEMED: Record<ReviewBackend, boolean> = { echarts: false, chartjs: false, plotly: true };

/** Defer a chart until its card scrolls near the viewport. */
function Lazy({ children, minHeight = 220 }: { children: ReactNode; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) { setVisible(true); observer.disconnect(); }
    }, { rootMargin: '400px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} style={{ minHeight: visible ? undefined : minHeight }}>{visible ? children : null}</div>;
}

interface Compiled { width?: number; height?: number; fit?: any; planned?: any; warnings: number; error?: string }

function compile(backend: PreviewBackend, input: ChartAssemblyInput): Compiled {
  try {
    const spec: any = BACKENDS[backend].assemble(input);
    return {
      width: spec?._width ?? spec?.layout?.width ?? spec?.width,
      height: spec?._height ?? spec?.layout?.height ?? spec?.height,
      fit: spec?._canvasFit,
      planned: spec?._planned,
      warnings: Array.isArray(spec?._warnings) ? spec._warnings.length : 0,
    };
  } catch (error) {
    return { warnings: 0, error: String(error) };
  }
}

function FitLine({ compiled }: { compiled: Compiled }) {
  if (compiled.error) return <span className="bl-fit is-error">{compiled.error}</span>;
  const fit = compiled.fit;
  const size = compiled.width && compiled.height ? `${Math.round(compiled.width)} × ${Math.round(compiled.height)}` : '';
  if (!fit) return <span className="bl-fit">{size}</span>;
  const tone = fit.scale < 0.7 ? 'is-bad' : fit.scale < 0.97 ? 'is-warn' : 'is-ok';
  return (
    <span className={`bl-fit ${tone}`} title={fit.flags?.join('; ') || 'reads well'}>
      {size} in {fit.box.width} × {fit.box.height} · {fit.scale >= 0.995 ? 'inside its box' : `host scales to ${Math.round(fit.scale * 100)}%`}
      {fit.plotScale ? ` · plot laid out at ${Math.round(fit.plotScale * 100)}%` : ''}
      {fit.treatment?.names ? ` · key names held to ${fit.treatment.names.keyWidth}px` : ''}
      {fit.flags?.length ? ` · ${fit.flags.length} flag${fit.flags.length > 1 ? 's' : ''}` : ''}
    </span>
  );
}

/** A chart at its natural size in focus mode, else shrunk into its card. */
function Chart({ input, backend, focus, width }: { input: ChartAssemblyInput; backend: PreviewBackend; focus: boolean; width?: number }) {
  const view = <FlintView spec={input} backend={backend} renderer="svg" compact />;
  // A renderer that fills its container (Chart.js) is given the width it was planned at.
  if (focus) return <div className="bl-natural" style={width ? { width } : undefined}>{view}</div>;
  return (
    <Lazy>
      <ScaleToFit adaptiveHeight height={520} minHeight={160} padding={0}>{view}</ScaleToFit>
    </Lazy>
  );
}

function CaseCard({ c, backend, reference, flagged, focus = false }: { c: LayoutCase; backend: ReviewBackend; reference: boolean; flagged: boolean; focus?: boolean }) {
  const supported = Boolean(BACKENDS[backend].getTemplateDef(c.input.chart_spec.chartType));
  const compiled = useMemo(() => (supported ? compile(backend, c.input) : { warnings: 0 }), [backend, c.input, supported]);
  const themeIgnored = c.theme && !THEMED[backend];
  if (!supported) {
    return (
      <article id={c.id} className="bl-case is-unsupported">
        <header><h3>{c.title}</h3><div className="bl-tags"><code>{c.id}</code></div></header>
        <p className="bl-note">{BACKENDS[backend].label} has no {c.input.chart_spec.chartType} template; this case is drawn by Vega-Lite only.</p>
      </article>
    );
  }
  return (
    <article id={c.id} className={`bl-case${c.wide ? ' is-wide' : ''}${flagged ? ' is-flagged' : ''}`} data-planned={compiled.planned ? JSON.stringify(compiled.planned) : undefined}>
      <header>
        <h3>{c.title}</h3>
        <div className="bl-tags">
          <Link to={`?case=${c.id}`} title="Show this case alone, at its natural size"><code>{c.id}</code></Link>
          {c.theme && <span className={`bl-tag${themeIgnored ? ' is-muted' : ''}`}>{c.theme}{themeIgnored ? ' (no themes here)' : ''}</span>}
          {flagged && <span className="bl-tag is-flag">review</span>}
        </div>
      </header>
      {c.note && <p className="bl-note">{c.note}</p>}
      <div className={reference ? 'bl-pair' : 'bl-single'}>
        <figure>
          <figcaption>{BACKENDS[backend].label} · <FitLine compiled={compiled} />{compiled.warnings ? ` · ${compiled.warnings} warning${compiled.warnings > 1 ? 's' : ''}` : ''}</figcaption>
          <Chart input={c.input} backend={backend} focus={focus} width={compiled.width ? Math.ceil(compiled.width) : undefined} />
        </figure>
        {reference && (
          <figure className="bl-reference">
            <figcaption>Vega-Lite reference</figcaption>
            <Chart input={c.input} backend="vegalite" focus={focus} />
          </figure>
        )}
      </div>
    </article>
  );
}

export function BackendLayoutLab() {
  const params = useParams();
  const backend = (PAGE_BACKENDS.includes(params.backend as ReviewBackend) ? params.backend : 'echarts') as ReviewBackend;
  const [search, setSearch] = useSearchParams();
  const section = (SECTIONS.some((s) => s.id === search.get('section')) ? search.get('section') : 'axis-labels') as SectionId;
  const setupId = search.get('setup') ?? SETUPS[0].id;
  const setup = SETUPS.find((s) => s.id === setupId) ?? SETUPS[0];
  const legendKey = search.get('size') ?? 'm';
  const legendSize = LEGEND_SIZES.find((s) => s.key === legendKey) ?? LEGEND_SIZES[1];
  const reference = search.get('reference') !== 'off';
  const update = (key: string, value: string | undefined) => {
    const next = new URLSearchParams(search);
    if (value === undefined) next.delete(key); else next.set(key, value);
    setSearch(next, { replace: true });
  };
  const caseId = search.get('case');
  const focusSection = caseId ? SECTIONS.find((s) => sectionCases(s.id, { setup, legendSize }).some((c) => c.id === caseId))?.id : undefined;
  const cases = useMemo(() => sectionCases(focusSection ?? section, { setup, legendSize }), [focusSection, section, setup, legendSize]);
  const focused = caseId ? cases.find((c) => c.id === caseId) : undefined;
  const notes = REVIEW_NOTES[backend];
  const flagged = new Set(notes.map((n) => n.caseId).filter(Boolean) as string[]);
  const meta = SECTIONS.find((s) => s.id === section)!;

  const goTo = (note: { section: SectionId; caseId?: string }) => {
    const next = new URLSearchParams(search);
    next.set('section', note.section);
    if (note.caseId) next.set('case', note.caseId); else next.delete('case');
    setSearch(next, { replace: true });
  };

  return (
    <section className="bl-lab">
      <header className="bl-heading">
        <div>
          <h1>{BACKENDS[backend].label} layout</h1>
          <p>
            The Vega-Lite layout labs&rsquo; cases, drawn by {BACKENDS[backend].label} in its own style: titles broken with no widow,
            band labels from the shared plan, gutters and keys measured, and the canvas fit judged against each chart&rsquo;s box.
          </p>
        </div>
        <nav className="bl-backends">
          {PAGE_BACKENDS.map((id) => (
            <Link key={id} to={`../backend-layout/${id}?${search.toString()}`} className={id === backend ? 'is-active' : ''}>{BACKENDS[id].label}</Link>
          ))}
        </nav>
      </header>

      <details className="bl-review" open>
        <summary>Needs review · {notes.length} {notes.length === 1 ? 'case' : 'cases'} for {BACKENDS[backend].label}</summary>
        {notes.length === 0 ? <p className="bl-note">Nothing flagged.</p> : (
          <ol>
            {notes.map((note, index) => (
              <li key={index}>
                <button type="button" onClick={() => goTo(note)}>
                  {SECTIONS.find((s) => s.id === note.section)?.label}{note.caseId ? ` · ${note.caseId}` : ''}
                </button>
                <p><strong>{note.question}</strong></p>
                <p className="bl-note">Now: {note.now}</p>
              </li>
            ))}
          </ol>
        )}
      </details>

      <nav className="bl-sections">
        {SECTIONS.map((s) => (
          <button key={s.id} type="button" className={s.id === (focusSection ?? section) ? 'is-active' : ''} onClick={() => { const next = new URLSearchParams(search); next.set('section', s.id); next.delete('case'); setSearch(next, { replace: true }); }}>
            {s.label}{notes.some((n) => n.section === s.id) ? ' •' : ''}
          </button>
        ))}
      </nav>

      <div className="bl-controls">
        <p>{meta.lead}</p>
        {section === 'canvas-squeeze' && (
          <label>Box <select value={setup.id} onChange={(e) => update('setup', e.target.value)}>
            {SETUPS.map((s) => <option key={s.id} value={s.id}>{setupLabel(s)}</option>)}
          </select></label>
        )}
        {section === 'legend' && (
          <label>Canvas <select value={legendSize.key} onChange={(e) => update('size', e.target.value)}>
            {LEGEND_SIZES.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
          </select></label>
        )}
        <label><input type="checkbox" checked={reference} onChange={(e) => update('reference', e.target.checked ? undefined : 'off')} /> Vega-Lite reference</label>
      </div>

      {focused ? (
        <div className="bl-focus">
          <button type="button" onClick={() => update('case', undefined)}>&larr; All {SECTIONS.find((s) => s.id === focusSection)?.label} cases</button>
          <CaseCard key={`${backend}-${focused.id}`} c={focused} backend={backend} reference={reference} flagged={flagged.has(focused.id)} focus />
        </div>
      ) : (
        <div className="bl-grid">
          {cases.map((c) => <CaseCard key={`${backend}-${c.id}`} c={c} backend={backend} reference={reference} flagged={flagged.has(c.id)} />)}
        </div>
      )}
    </section>
  );
}
