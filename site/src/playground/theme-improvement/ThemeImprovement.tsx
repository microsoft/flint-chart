/**
 * Theme improvement: fixes grouped by area (colour first), stage by stage. Each stage shows the cases
 * it added, then every chart of the theme matrix it changed — before and after, side by side — so a
 * fix can be reviewed for what it improves and what it moves in existing themes. The matrix holds the
 * preview cases, presets, houses and every case added so far, compiled before and after each stage;
 * only charts whose rendered SVG changed are listed as visual, the rest as spec-only.
 */
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import { ScaleToFit } from '../../components/ScaleToFit';
import { VegaLiteView } from '../../components/VegaLiteView';
import { siteTheme } from '../../shared/theme';
import { useHouseFonts } from '../house-fonts';
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

const card: CSSProperties = { background: siteTheme.surface, border: `1px solid ${siteTheme.border}`, borderRadius: siteTheme.radius, padding: 14 };
const GROUP_LABEL: Record<Change['group'], string> = { preset: 'Shipped preset', 'no-theme': 'No theme', house: 'Style-guide house', case: 'Earlier case' };
const GROUP_COLOR: Record<Change['group'], string> = { preset: '#b42318', 'no-theme': '#6941c6', house: '#0e7090', case: '#b54708' };

function Badge({ color, children }: { color: string; children: ReactNode }) {
  return <span style={{ fontSize: 11, padding: '0 8px', borderRadius: 999, border: `1px solid ${color}`, color, whiteSpace: 'nowrap' }}>{children}</span>;
}

function Swatch({ color }: { color: string }) {
  return (
    <span title={color} style={{ display: 'inline-flex', alignItems: 'center', gap: 3, marginRight: 6 }}>
      <span style={{ width: 14, height: 14, background: color, border: '1px solid rgba(0,0,0,0.15)', borderRadius: 2, display: 'inline-block' }} />
      <code style={{ fontSize: 10.5, color: siteTheme.textMuted }}>{color}</code>
    </span>
  );
}

const md = (source: string) => <div className="ti-md"><ReactMarkdown>{source}</ReactMarkdown></div>;

export function ChangeCard({ change, look, beforeLabel = 'Before' }: { change: Change; look?: string; beforeLabel?: string }) {
  const after = useMemo(() => (change.after ? restore(change.before, change.after) : undefined), [change]);
  return (
    <article style={{ ...card, marginBottom: 14 }} data-change={change.key}>
      <header style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 6 }}>
        <strong style={{ fontSize: 14 }}>{change.theme}</strong>
        <span style={{ fontSize: 13, color: siteTheme.textMuted }}>{change.label}</span>
        {!look && <Badge color={GROUP_COLOR[change.group]}>{GROUP_LABEL[change.group]}</Badge>}
        <Badge color={change.visual ? '#b54708' : siteTheme.navInactive}>{change.visual ? 'visual change' : look ? 'no visible change' : 'spec only — renders the same'}</Badge>
      </header>
      {look && <p style={{ fontSize: 13, margin: '0 0 6px' }}><strong>Look at:</strong> {look}</p>}
      <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
        {change.coloursRemoved.length > 0 && <div><span style={{ color: siteTheme.navInactive }}>Colours gone: </span>{change.coloursRemoved.map((c) => <Swatch key={c} color={c} />)}</div>}
        {change.coloursAdded.length > 0 && <div><span style={{ color: siteTheme.navInactive }}>Colours new: </span>{change.coloursAdded.map((c) => <Swatch key={c} color={c} />)}</div>}
        {change.reportsAdded.map((r, i) => <div key={`${i}-${r}`} style={{ color: '#065986' }}>+ report — {r}</div>)}
        {change.reportsRemoved.map((r, i) => <div key={`${i}-${r}`} style={{ color: siteTheme.textMuted }}>− report — {r}</div>)}
        <details>
          <summary style={{ cursor: 'pointer', color: siteTheme.navInactive }}>What changed in the spec ({change.paths.length}{change.paths.length > 12 ? '+' : ''})</summary>
          <pre style={{ fontSize: 11, whiteSpace: 'pre-wrap', margin: '4px 0', background: siteTheme.bg, padding: 6 }}>{change.paths.join('\n')}</pre>
        </details>
      </div>
      {change.before && after && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) minmax(0,1fr)', gap: 12, marginTop: 8 }}>
          {[[beforeLabel, change.before], ['After', after]].map(([label, spec]) => (
            <div key={label as string} style={{ minWidth: 0 }}>
              <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.4, color: siteTheme.navInactive, marginBottom: 4 }}>{label as string}</div>
              <div style={{ border: `1px dashed ${siteTheme.borderMuted}`, borderRadius: 4, padding: 6, background: '#fff' }}>
                <ScaleToFit height={360} minHeight={120} adaptiveHeight padding={2}>
                  <VegaLiteView spec={spec} renderer="svg" />
                </ScaleToFit>
              </div>
            </div>
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
    ? (file?.baselines?.[c.stage] ? `Before — the code just before ${c.stage.toUpperCase()}` : `Before — code before the ${area.label.toLowerCase()} work${file?.baselines?.[area.id] ? ` (${file.baselines[area.id].slice(0, 7)})` : ''}`)
    : 'input' in c.before ? 'Before — the house as it was written'
    : `Before — the theme without ${c.before.strip.map((p) => p.split('.').pop()).join(', ')}`);
  return (
    <section>
      <h2 style={{ fontSize: 17, margin: '18px 0 4px' }}>Cases this fix added ({cases.length})</h2>
      <p style={{ fontSize: 12.5, color: siteTheme.textMuted, margin: '0 0 10px', maxWidth: 950 }}>
        Each case is a chart picked to show the rule. It stays in the theme matrix from now on, so a later stage that moves it is listed in that stage under “Earlier case”.
        {cases.some((c) => c.before === 'baseline') ? (file?.baselines?.[stage.id] ? ' This stage changed a default, so its cases compare against a snapshot of the code taken just before the stage; “after” is the code as it stands now, so later stages show in it too.' : ' This stage changed a default, so its cases compare against the code before the area’s work began (they were added after review, so “after” also includes later stages).') : (cases.some((c) => c.before !== 'baseline' && 'input' in c.before) ? ' This stage is an option the houses now use: “before” is the house as it was written before the stage opted it in.' : ' This stage is an option, so “before” is the same theme with the option’s fields removed — the matrix confirms that without them the code draws exactly what it drew before.')}
      </p>
      {!file && <p style={{ fontSize: 13 }}>loading…</p>}
      {file && cases.map((c) => {
        const r = file.cases[c.id];
        if (!r) return <p key={c.id} style={{ fontSize: 13, color: '#b42318' }}>{c.id}: not generated</p>;
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
      <h1 style={{ margin: '0 0 4px', fontSize: 22 }}>{stage.title}</h1>
      <p style={{ fontSize: 14, margin: '0 0 12px', maxWidth: 950 }}><strong>Rule, as reviewed:</strong> {stage.rule}</p>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 14 }}>
        {stage.kind === 'option' && (
          <div style={{ ...card, padding: '8px 12px', borderColor: '#067647' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#067647' }}>Option</div>
            <div style={{ fontSize: 12, color: siteTheme.textMuted }}>nothing changes until a theme states it</div>
          </div>
        )}
        {(['preset', 'no-theme', 'house', 'case'] as const).filter((g) => g !== 'case' || count(g, 'visual') > 0).map((g) => (
          <div key={g} style={{ ...card, padding: '8px 12px' }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: GROUP_COLOR[g] }}>{count(g, 'visual')}<span style={{ fontSize: 12, color: siteTheme.navInactive, fontWeight: 400 }}> / {s?.byGroup?.[g] ?? 0}</span></div>
            <div style={{ fontSize: 12, color: siteTheme.textMuted }}>{g === 'case' ? 'Earlier cases that moved' : `${GROUP_LABEL[g]} charts that look different`}{count(g, 'spec') ? ` (+${count(g, 'spec')} spec-only)` : ''}</div>
          </div>
        ))}
      </div>
      <div style={{ ...card, marginBottom: 14 }}>{md(stage.doc)}</div>
      {stage.decisions?.length ? (
        <div style={{ ...card, borderColor: '#b54708', marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#b54708', marginBottom: 4 }}>For review</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.5 }}>{stage.decisions.map((d) => <li key={d}><span className="ti-inline"><ReactMarkdown>{d}</ReactMarkdown></span></li>)}</ul>
        </div>
      ) : null}
      <p style={{ fontSize: 12.5, color: siteTheme.textMuted }}>
        Cases this answers: <a href={`#/playground/new-theme-test?theme=issues&issue=${stage.issue}`}>Issues → {stage.issue}</a>
      </p>

      <StageCases area={area} stage={stage} />

      <h2 style={{ fontSize: 17, margin: '18px 0 8px' }}>Every other chart this stage changed</h2>
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', fontSize: 13, marginBottom: 10 }}>
        <label>Group{' '}
          <select value={group} onChange={(e) => { setGroup(e.target.value as typeof group); setTheme('all'); }}>
            <option value="all">All</option><option value="preset">Shipped presets</option><option value="no-theme">No theme</option><option value="house">Style-guide houses</option><option value="case">Earlier cases</option>
          </select>
        </label>
        <label>Theme{' '}
          <select value={theme} onChange={(e) => setTheme(e.target.value)}>
            <option value="all">All ({themes.length})</option>
            {themes.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>
        <label><input type="checkbox" checked={specOnly} onChange={(e) => setSpecOnly(e.target.checked)} /> include spec-only changes</label>
        <span style={{ color: siteTheme.navInactive }}>{data ? `${shown.length} shown` : 'loading…'}</span>
      </div>
      {shown.slice(page * PAGE, (page + 1) * PAGE).map((change) => <ChangeCard key={change.key} change={change} />)}
      {shown.length > PAGE && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13 }}>
          <button type="button" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>
          <span>Page {page + 1} of {Math.ceil(shown.length / PAGE)}</span>
          <button type="button" disabled={(page + 1) * PAGE >= shown.length} onClick={() => setPage((p) => p + 1)}>Next</button>
        </div>
      )}
    </div>
  );
}

function Overview({ area, onOpen }: { area: Area; onOpen: (id: string) => void }) {
  const first = SUMMARY[area.stages[0]?.id];
  const cases = AREA_CASES[area.id] ?? [];
  const optionStages = area.stages.filter((st) => st.kind === 'option');
  return (
    <div>
      <h1 style={{ margin: '0 0 6px', fontSize: 24 }}>Theme improvement — {area.title.toLowerCase()}</h1>
      <p style={{ fontSize: 14, maxWidth: 950, color: siteTheme.textMuted }}>
        {area.intro} Every stage is measured on the same theme matrix — the {first?.byGroup?.['no-theme']} preview cases with no theme, the same cases under
        all {Math.round((first?.byGroup?.preset ?? 0) / Math.max(1, first?.byGroup?.['no-theme'] ?? 1))} shipped presets, the charts of the 69 style-guide houses,
        and every case added so far ({cases.length}) — compiled before and after the stage and compared as rendered SVG. A chart is listed as a visual change only
        if its SVG differs. Stages are cumulative: each “before” is the previous stage’s “after”. A stage that adds a theme option is measured twice: with no theme
        stating it (which must change nothing) and with the houses whose guides call for it opted in.
      </p>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13, marginTop: 10 }}>
        <thead>
          <tr style={{ textAlign: 'left', borderBottom: `1px solid ${siteTheme.border}` }}>
            <th style={{ padding: 6 }}>Stage</th><th style={{ padding: 6 }}>Kind</th><th style={{ padding: 6 }}>Rule</th><th style={{ padding: 6 }}>Cases</th>
            <th style={{ padding: 6 }}>Presets</th><th style={{ padding: 6 }}>No theme</th><th style={{ padding: 6 }}>Houses</th><th style={{ padding: 6 }}>Earlier cases moved</th>
          </tr>
        </thead>
        <tbody>
          {area.stages.map((stage) => {
            const st = SUMMARY[stage.id];
            const n = (g: string) => st?.changed?.[`${g}:visual`] ?? 0;
            return (
              <tr key={stage.id} style={{ borderBottom: `1px solid ${siteTheme.border}`, verticalAlign: 'top' }}>
                <td style={{ padding: 6, whiteSpace: 'nowrap' }}><button type="button" onClick={() => onOpen(stage.id)} style={{ cursor: 'pointer' }}>{stage.label}</button></td>
                <td style={{ padding: 6, color: stage.kind === 'option' ? '#067647' : siteTheme.text }}>{stage.kind === 'option' ? 'option' : 'default'}</td>
                <td style={{ padding: 6 }}>{stage.rule}</td>
                <td style={{ padding: 6 }}>{cases.filter((c) => c.stage === stage.id).length}</td>
                <td style={{ padding: 6, color: n('preset') ? GROUP_COLOR.preset : siteTheme.navInactive }}>{n('preset')}{st?.changed?.['preset:spec'] ? ` (+${st.changed['preset:spec']} spec)` : ''}</td>
                <td style={{ padding: 6, color: n('no-theme') ? GROUP_COLOR['no-theme'] : siteTheme.navInactive }}>{n('no-theme')}</td>
                <td style={{ padding: 6 }}>{n('house')}{stage.kind === 'option' ? ' opted in' : ''}</td>
                <td style={{ padding: 6, color: n('case') ? GROUP_COLOR.case : siteTheme.navInactive }}>{stage.kind === 'option' || n('case') ? n('case') : '—'}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <div style={{ ...card, marginTop: 16, fontSize: 13.5, lineHeight: 1.55 }}>
        {md(area.note)}
      </div>
    </div>
  );
}

export function ThemeImprovement() {
  // The house faces load before any chart measures its text, so before and after draw in the house's type.
  const fontsReady = useHouseFonts();
  const [params, setParams] = useSearchParams();
  const active = params.get('stage') ?? 'overview';
  // A link may name only the stage (the gap cards do): the area is the one that holds it.
  const area = AREAS.find((a) => a.id === params.get('area'))
    ?? AREAS.find((a) => a.stages.some((st) => st.id === active)) ?? AREAS[0];
  const stage = area.stages.find((st) => st.id === active);
  const open = (id: string, areaId = area.id) => { setParams({ area: areaId, stage: id }); window.scrollTo({ top: 0 }); };
  const tab = (selected: boolean, big = false): CSSProperties => ({
    border: 'none', borderBottom: `${big ? 3 : 2}px solid ${selected ? siteTheme.accent : 'transparent'}`, background: 'none', padding: big ? '8px 14px' : '6px 10px',
    cursor: 'pointer', fontSize: big ? 15 : 13, color: selected ? siteTheme.accent : siteTheme.text, fontWeight: selected || big ? 600 : 400,
  });
  return (
    <div>
      <style>{'.ti-md p{margin:0 0 8px}.ti-md ul,.ti-md ol{margin:0 0 8px;padding-left:20px}.ti-md code{font-size:12px;background:#f2f4f7;padding:0 3px;border-radius:3px}.ti-inline p{display:inline;margin:0}.ti-md{font-size:13.5px;line-height:1.55}'}</style>
      <nav style={{ display: 'flex', gap: 4, borderBottom: `1px solid ${siteTheme.border}`, marginBottom: 6 }} aria-label="Areas">
        {AREAS.map((a) => <button key={a.id} type="button" style={tab(a.id === area.id, true)} onClick={() => open('overview', a.id)} data-area={a.id}>{a.label}</button>)}
      </nav>
      <nav style={{ display: 'flex', gap: 2, borderBottom: `1px solid ${siteTheme.border}`, marginBottom: 16, flexWrap: 'wrap' }} aria-label="Stages">
        <button type="button" style={tab(active === 'overview')} onClick={() => open('overview')}>Overview</button>
        {area.stages.map((st) => <button key={st.id} type="button" style={tab(active === st.id)} onClick={() => open(st.id)} data-stage={st.id}>{st.label}</button>)}
      </nav>
      {!fontsReady ? <p style={{ fontSize: 13 }}>Loading house fonts…</p>
        : stage ? <StageView key={stage.id} area={area} stage={stage} /> : <Overview area={area} onOpen={(id) => open(id)} />}
    </div>
  );
}
