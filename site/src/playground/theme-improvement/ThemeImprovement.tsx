/**
 * Theme improvement: what the style-guide houses add up to, and what was done about it.
 *
 * - Issues: every gap the houses left, grouped by the part of Flint a fix would change.
 * - Findings and bugs: what the review learned, and the Flint bugs it found.
 * - Fixes: the work, area by area and stage by stage. Each stage shows the cases it added, then every chart
 *   of the theme matrix it changed, before and after, so a fix can be reviewed for what it improves and what
 *   it moves in existing themes. Only charts whose rendered SVG changed are listed as visual.
 */
import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ScaleToFit } from '../../components/ScaleToFit';
import { VegaLiteView } from '../../components/VegaLiteView';
import { useHouseFonts } from '../house-fonts';
import { FindingsView, IssuesView } from '../new-theme-test/IssuesView';
import { Badge, Md, issueHref } from '../new-theme-test/gaps';
import { AREAS, type Area, type Stage } from './stages';
import { AREA_CASES, type FixCase } from './cases';
import summary from './stages/summary.json';

export interface Change {
  key: string;
  group: 'preset' | 'no-theme' | 'house' | 'case';
  theme: string;
  label: string;
  visual: boolean;
  paths: string[];
  coloursRemoved: string[];
  coloursAdded: string[];
  reportsRemoved: string[];
  reportsAdded: string[];
  before?: Record<string, unknown>;
  after?: Record<string, unknown>;
}
interface StageData { total: number; byGroup: Record<string, number>; changes: Change[] }

const STAGE_FILES = import.meta.glob(['./stages/*.json', '!./stages/summary.json'], { import: 'default' }) as Record<string, () => Promise<StageData>>;
interface CaseResult { visual: boolean; paths: string[]; coloursRemoved: string[]; coloursAdded: string[]; reportsRemoved: string[]; reportsAdded: string[]; before?: Record<string, unknown>; after?: Record<string, unknown> }
interface CaseFile { baselines?: Record<string, string>; cases: Record<string, CaseResult> }
const CASE_FILES = import.meta.glob('./cases/*.results.json', { import: 'default' }) as Record<string, () => Promise<CaseFile>>;
const SUMMARY = summary as Record<string, { total: number; byGroup: Record<string, number>; changed: Record<string, number> }>;

/** Undo the pack step's de-duplication: data rows shared with `before` are stored once. */
function restore(before: any, after: any): any {
  if (after === '__same_as_before__') return before;
  if (!after || typeof after !== 'object') return after;
  if (Array.isArray(after)) return after.map((item, i) => restore(before?.[i], item));
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(after)) out[key] = restore(before?.[key], value);
  return out;
}

const GROUP_LABEL: Record<Change['group'], string> = { preset: 'Shipped preset', 'no-theme': 'No theme', house: 'Style-guide house', case: 'Earlier case' };

function Swatch({ color }: { color: string }) {
  return (
    <span title={color} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 8 }}>
      <span style={{ width: 13, height: 13, background: color, border: '1px solid rgba(0,0,0,0.12)', borderRadius: 2 }} />
      <code>{color}</code>
    </span>
  );
}

export function ChangeCard({ change, look, beforeLabel = 'Before' }: { change: Change; look?: string; beforeLabel?: string }) {
  const after = useMemo(() => (change.after ? restore(change.before, change.after) : undefined), [change]);
  return (
    <article className="tp-card tp-change" data-change={change.key}>
      <header className="tp-change-head">
        <strong>{change.theme}</strong>
        <span className="tp-muted">{change.label}</span>
        {!look && <Badge>{GROUP_LABEL[change.group]}</Badge>}
        <Badge tone={change.visual ? 'warn' : undefined}>{change.visual ? 'visual change' : look ? 'no visible change' : 'spec only'}</Badge>
      </header>
      {look && <p style={{ margin: '0 0 6px' }}><strong>Look at:</strong> {look}</p>}
      <div style={{ fontSize: 12.5 }}>
        {change.coloursRemoved.length > 0 && <div><span className="tp-muted">Colours gone: </span>{change.coloursRemoved.map((c) => <Swatch key={c} color={c} />)}</div>}
        {change.coloursAdded.length > 0 && <div><span className="tp-muted">Colours new: </span>{change.coloursAdded.map((c) => <Swatch key={c} color={c} />)}</div>}
        {change.reportsAdded.map((r, i) => <div key={`${i}-${r}`}>+ report: {r}</div>)}
        {change.reportsRemoved.map((r, i) => <div key={`${i}-${r}`} className="tp-muted">− report: {r}</div>)}
        <details>
          <summary className="tp-muted" style={{ cursor: 'pointer' }}>Spec paths changed ({change.paths.length}{change.paths.length > 12 ? '+' : ''})</summary>
          <pre className="tp-json">{change.paths.join('\n')}</pre>
        </details>
      </div>
      {change.before && after && (
        <div className="tp-panels" style={{ marginTop: 10 }}>
          {[[beforeLabel, change.before], ['After', after]].map(([label, spec]) => (
            <figure key={label as string}>
              <figcaption>{label as string}</figcaption>
              <ScaleToFit height={360} minHeight={120} adaptiveHeight padding={2}>
                <VegaLiteView spec={spec} renderer="svg" />
              </ScaleToFit>
            </figure>
          ))}
        </div>
      )}
    </article>
  );
}

const PAGE = 8;

/** The cases a stage added, before and after. */
function StageCases({ area, stage }: { area: Area; stage: Stage }) {
  const [file, setFile] = useState<CaseFile | undefined>();
  useEffect(() => {
    let live = true;
    void CASE_FILES[`./cases/${area.id}.results.json`]?.().then((f) => { if (live) setFile(f); });
    return () => { live = false; };
  }, [area.id]);
  const cases = (AREA_CASES[area.id] ?? []).filter((c) => c.stage === stage.id);
  if (!cases.length) return null;
  const beforeLabel = (c: FixCase) => (c.before === 'baseline'
    ? (file?.baselines?.[c.stage] ? `Before (code just before ${c.stage.toUpperCase()})` : `Before (code before the ${area.label.toLowerCase()} work)`)
    : 'input' in c.before ? 'Before (the house as written)'
      : `Before (without ${c.before.strip.map((p) => p.split('.').pop()).join(', ')})`);
  return (
    <section className="tp-section">
      <h2>Cases this fix added <span className="tp-count">{cases.length}</span></h2>
      <p className="tp-muted" style={{ maxWidth: 860 }}>
        Each case is a chart picked to show the rule. It stays in the theme matrix, so a later stage that moves it lists it under “Earlier case”.
      </p>
      {!file && <p className="tp-muted">Loading…</p>}
      {file && cases.map((c) => {
        const r = file.cases[c.id];
        if (!r) return <p key={c.id} className="tp-open">{c.id}: not generated</p>;
        const change: Change = { key: c.id, group: 'case', theme: c.theme, label: c.title, ...r };
        return <ChangeCard key={c.id} change={change} look={c.look} beforeLabel={beforeLabel(c)} />;
      })}
    </section>
  );
}

function StageView({ area, stage }: { area: Area; stage: Stage }) {
  const [data, setData] = useState<StageData | undefined>();
  const [group, setGroup] = useState<'all' | Change['group']>('all');
  const [theme, setTheme] = useState('all');
  const [specOnly, setSpecOnly] = useState(false);
  const [page, setPage] = useState(0);
  useEffect(() => {
    let live = true;
    setData(undefined);
    void STAGE_FILES[`./stages/${stage.id}.json`]?.().then((d) => { if (live) setData(d); });
    return () => { live = false; };
  }, [stage.id]);
  useEffect(() => setPage(0), [group, theme, specOnly, stage.id]);

  const changes = data?.changes ?? [];
  const themes = [...new Set(changes.filter((c) => group === 'all' || c.group === group).map((c) => c.theme))].sort();
  const shown = changes.filter((c) => (group === 'all' || c.group === group) && (theme === 'all' || c.theme === theme) && (specOnly || c.visual));
  const s = SUMMARY[stage.id];
  const count = (g: string, kind: 'visual' | 'spec') => s?.changed?.[`${g}:${kind}`] ?? 0;

  return (
    <div>
      <h1>{stage.title}</h1>
      <p className="tp-lead"><strong>Rule:</strong> {stage.rule}</p>
      <div className="tp-stats">
        {stage.kind === 'option' && <div className="tp-stat"><strong className="tp-done">Option</strong>nothing changes until a theme states it</div>}
        {(['preset', 'no-theme', 'house', 'case'] as const).filter((g) => g !== 'case' || count(g, 'visual') > 0).map((g) => (
          <div key={g} className="tp-stat">
            <strong>{count(g, 'visual')}<span className="tp-muted" style={{ fontSize: 12, fontWeight: 400 }}> / {s?.byGroup?.[g] ?? 0}</span></strong>
            {g === 'case' ? 'earlier cases moved' : `${GROUP_LABEL[g].toLowerCase()} charts changed`}
          </div>
        ))}
      </div>
      <Md>{stage.doc}</Md>
      {stage.decisions?.length ? (
        <div className="tp-review">
          <strong>For review</strong>
          <ul>{stage.decisions.map((d) => <li key={d}><Md inline>{d}</Md></li>)}</ul>
        </div>
      ) : null}
      <p className="tp-muted">Answers the issue <a href={issueHref(stage.issue)}><code>{stage.issue}</code></a>.</p>

      <StageCases area={area} stage={stage} />

      <section className="tp-section">
        <h2>Every other chart this stage changed</h2>
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', fontSize: 13, marginBottom: 12 }}>
          <select value={group} onChange={(e) => { setGroup(e.target.value as typeof group); setTheme('all'); }} aria-label="Group">
            <option value="all">All groups</option><option value="preset">Shipped presets</option><option value="no-theme">No theme</option><option value="house">Style-guide houses</option><option value="case">Earlier cases</option>
          </select>
          <select value={theme} onChange={(e) => setTheme(e.target.value)} aria-label="Theme">
            <option value="all">All themes ({themes.length})</option>
            {themes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <label><input type="checkbox" checked={specOnly} onChange={(e) => setSpecOnly(e.target.checked)} /> include spec-only changes</label>
          <span className="tp-muted">{data ? `${shown.length} shown` : 'Loading…'}</span>
        </div>
        {shown.slice(page * PAGE, (page + 1) * PAGE).map((change) => <ChangeCard key={change.key} change={change} />)}
        {shown.length > PAGE && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
            <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
            <span>Page {page + 1} of {Math.ceil(shown.length / PAGE)}</span>
            <button type="button" disabled={(page + 1) * PAGE >= shown.length} onClick={() => setPage((p) => p + 1)}>Next</button>
          </div>
        )}
      </section>
    </div>
  );
}

function AreaOverview({ area, onOpen }: { area: Area; onOpen: (id: string) => void }) {
  const cases = AREA_CASES[area.id] ?? [];
  return (
    <div>
      <h1>{area.title}</h1>
      <p className="tp-lead">
        {area.intro} Every stage is compiled before and after over the same theme matrix (preview cases with no theme and under every
        shipped preset, the style-guide houses' charts, and every case added so far) and compared as rendered SVG. Stages are cumulative.
      </p>
      <table className="tp-table">
        <thead>
          <tr><th>Stage</th><th>Kind</th><th>Rule</th><th>Cases</th><th>Presets changed</th><th>No theme</th><th>Houses</th><th>Earlier cases moved</th></tr>
        </thead>
        <tbody>
          {area.stages.map((stage) => {
            const st = SUMMARY[stage.id];
            const n = (g: string) => st?.changed?.[`${g}:visual`] ?? 0;
            return (
              <tr key={stage.id}>
                <td style={{ whiteSpace: 'nowrap' }}><a href={`#/playground/theme-improvement?area=${area.id}&stage=${stage.id}`} onClick={(e) => { e.preventDefault(); onOpen(stage.id); }}>{stage.label}</a></td>
                <td className={stage.kind === 'option' ? 'tp-done' : undefined}>{stage.kind === 'option' ? 'option' : 'default'}</td>
                <td>{stage.rule}</td>
                <td>{cases.filter((c) => c.stage === stage.id).length}</td>
                <td className={n('preset') ? undefined : 'tp-muted'}>{n('preset')}</td>
                <td className={n('no-theme') ? undefined : 'tp-muted'}>{n('no-theme')}</td>
                <td>{n('house')}{stage.kind === 'option' ? ' opted in' : ''}</td>
                <td className={n('case') ? undefined : 'tp-muted'}>{n('case')}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <section className="tp-section"><Md>{area.note}</Md></section>
    </div>
  );
}

type View = 'issues' | 'findings' | 'fixes';

export function ThemeImprovement() {
  // The house faces load before any chart measures its text, so before and after draw in the house's type.
  const fontsReady = useHouseFonts();
  const [params, setParams] = useSearchParams();
  // A link may name only a stage (gap cards do): that opens the fixes at the area holding it.
  const view: View = params.get('view') === 'findings' ? 'findings'
    : params.get('view') === 'fixes' || params.get('stage') || params.get('area') ? 'fixes' : 'issues';
  const active = params.get('stage') ?? 'overview';
  const area = AREAS.find((a) => a.id === params.get('area'))
    ?? AREAS.find((a) => a.stages.some((st) => st.id === active)) ?? AREAS[0];
  const stage = area.stages.find((st) => st.id === active);
  const go = (next: Record<string, string>) => { setParams(next); window.scrollTo({ top: 0 }); };
  const openStage = (id: string, areaId = area.id) => go({ view: 'fixes', area: areaId, stage: id });

  return (
    <div className="tp-page">
      <h1>Theme improvement</h1>
      <p className="tp-lead tp-muted">
        The issues the <a href="#/playground/new-theme-test">style guides</a> add up to, and the fixes made against them.
      </p>
      <nav className="tp-tabs" aria-label="Views">
        <button type="button" className={view === 'issues' ? 'is-on' : undefined} onClick={() => go({ view: 'issues' })}>Issues</button>
        <button type="button" className={view === 'findings' ? 'is-on' : undefined} onClick={() => go({ view: 'findings' })}>Findings and bugs</button>
        <button type="button" className={view === 'fixes' ? 'is-on' : undefined} onClick={() => go({ view: 'fixes' })}>Fixes</button>
      </nav>
      {!fontsReady ? <p className="tp-muted">Loading house fonts…</p>
        : view === 'issues' ? <IssuesView issue={params.get('issue')} onIssue={(issue) => setParams({ view: 'issues', issue })} />
          : view === 'findings' ? <FindingsView />
            : (
              <>
                <nav className="tp-tabs tp-tabs-sub" aria-label="Areas">
                  {AREAS.map((a) => <button key={a.id} type="button" className={a.id === area.id ? 'is-on' : undefined} onClick={() => openStage('overview', a.id)} data-area={a.id}>{a.label}</button>)}
                </nav>
                <nav className="tp-tabs tp-tabs-sub" aria-label="Stages">
                  <button type="button" className={!stage ? 'is-on' : undefined} onClick={() => openStage('overview')}>Overview</button>
                  {area.stages.map((st) => <button key={st.id} type="button" className={st.id === active ? 'is-on' : undefined} onClick={() => openStage(st.id)} data-stage={st.id}>{st.label}</button>)}
                </nav>
                {stage ? <StageView key={stage.id} area={area} stage={stage} /> : <AreaOverview area={area} onOpen={(id) => openStage(id)} />}
              </>
            )}
    </div>
  );
}
