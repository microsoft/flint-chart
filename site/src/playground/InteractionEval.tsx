import { useEffect, useMemo, useRef, useState } from 'react';
import { FlintChart } from 'flint-chart/react';
import type { ChartAssemblyInput } from 'flint-chart';
import './interaction-eval.css';

// Review page for experiments/interaction: each task's request, the data the agent drew, the
// chart each skill arm produced (mounted with its interaction_spec and updates) and the grade.

interface Grade { grade: 'good' | 'ok' | 'bad'; tags?: string[]; note?: string }
interface Run {
  status: string;
  chartType: string | null;
  interactions: string[];
  spec: Record<string, unknown> | null;
  table: string | null;
  updates: unknown[];
  answer: string | null;
  calls: number;
  grade?: Grade | null;
}
interface Task {
  id: string;
  dataset: string;
  family: string;
  ask: string;
  style: string;
  text: string;
  want: string[];
  wantAll?: boolean;
  wantUpdates?: boolean;
  ok: string[];
  note?: string;
  runs: Record<string, Run>;
}
interface Summary { title?: string; findings?: string[]; arms?: Record<string, string> }
interface Payload {
  arms: string[];
  model: string;
  summary?: Summary | null;
  datasets: Record<string, string>;
  tables: Record<string, Record<string, unknown>[]>;
  tasks: Task[];
}

const ASKS = ['none', 'direct', 'indirect', 'indirect-hard', 'updates', 'muted'] as const;
// The arm that carries the skill as it stands in agent-skills/.
const CURRENT_ARM = 'final';
const ASK_LABEL: Record<string, string> = {
  none: 'No ask',
  direct: 'Direct ask',
  indirect: 'Indirect ask',
  'indirect-hard': 'Indirect, harder',
  updates: 'Updates (notes, emphasis)',
  muted: 'Muted annotations',
};
const ARM_LABEL: Record<string, string> = {
  base: 'base (HEAD skill)',
  edited: 'edited (inspect-index rule)',
  edited2: 'edited2 (+ question ≠ explore)',
  principles: 'principles (interaction principles)',
  'clean-updates': 'clean-updates (updates on request)',
  muted: 'muted (muted annotations)',
  final: 'final (current skill, new datasets)',
};

function LazyChart({ spec, updates, label }: { spec: ChartAssemblyInput; updates: unknown[]; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setVisible(true);
        observer.disconnect();
      }
    }, { rootMargin: '400px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  return (
    <div ref={ref} className="ie-mount">
      {visible ? <FlintChart spec={spec} updates={updates as never} renderer="svg" width="100%" height={400} fit="relayout" ariaLabel={label} /> : <div className="ie-placeholder">…</div>}
    </div>
  );
}

function DataPreview({ rows }: { rows: Record<string, unknown>[] | undefined }) {
  if (!rows?.length) return <p className="ie-muted">No inline rows.</p>;
  const columns = Object.keys(rows[0]);
  return (
    <div className="ie-table-wrap">
      <p className="ie-muted">{rows.length.toLocaleString()} rows drawn · first 6</p>
      <table className="ie-table">
        <thead><tr>{columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
        <tbody>
          {rows.slice(0, 6).map((row, i) => (
            <tr key={i}>{columns.map((c) => <td key={c}>{String(row[c] ?? '')}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function expectation(task: Task) {
  if (task.ask === 'none') return 'No interaction asked: none expected, and a clean chart (no updates).';
  if (task.ask === 'muted') return (task as Task & { expect?: string; form?: string }).expect === 'none'
    ? 'An overview question: chart left clean (no updates).'
    : `A concrete question: may point at the answer, muted (${(task as Task & { form?: string }).form ?? ''}).`;
  if (task.ask === 'updates') return task.wantUpdates ? 'Marks on the chart asked for: updates expected.' : 'A question: answered in the reply, chart left clean (no updates).';
  const want = task.want.length ? `${task.wantAll ? 'all of' : 'one of'} ${task.want.join(', ')}` : 'nothing required';
  const extra = task.ok.filter((p) => !task.want.includes(p));
  return `Want ${want}${extra.length ? `; also fine: ${extra.join(', ')}` : ''}.`;
}

function updateOps(updates: unknown[]): string[] {
  return (updates as { ops?: { op?: string }[] }[]).flatMap((u) => (u.ops ?? []).map((o) => o.op ?? '?'));
}

function RunColumn({ arm, task, run, tables }: { arm: string; task: Task; run: Run | undefined; tables: Payload['tables'] }) {
  if (!run) return <div className="ie-run ie-run-missing">{arm}: no run</div>;
  const spec = run.spec && run.table
    ? ({ ...run.spec, data: { ...(run.spec.data as object), values: tables[run.table] } } as unknown as ChartAssemblyInput)
    : null;
  const grade = run.grade?.grade ?? 'ungraded';
  return (
    <div className={`ie-run ie-grade-${grade}`}>
      <div className="ie-run-head">
        <span className="ie-arm">{ARM_LABEL[arm] ?? arm}</span>
        <span className={`ie-badge ie-badge-${grade}`}>{grade}</span>
      </div>
      <div className="ie-chips">
        <span className="ie-chart-type">{run.chartType ?? run.status}</span>
        {run.interactions.length
          ? run.interactions.map((p, i) => (
            <span key={i} className={`ie-chip${task.want.includes(p) ? ' ie-chip-want' : task.ok.includes(p) ? ' ie-chip-ok' : ' ie-chip-extra'}`}>{p}</span>
          ))
          : <span className="ie-chip ie-chip-none">no interaction</span>}
      </div>
      <div className="ie-chips">
        {updateOps(run.updates).length
          ? updateOps(run.updates).map((op, i) => <span key={i} className="ie-chip ie-chip-update">{op}</span>)
          : <span className="ie-chip ie-chip-none">no updates</span>}
      </div>
      {run.grade?.tags?.length ? <div className="ie-tags">{run.grade.tags.map((t) => <span key={t}>{t}</span>)}</div> : null}
      {run.grade?.note ? <p className="ie-note">{run.grade.note}</p> : null}
      {spec ? <LazyChart spec={spec} updates={run.updates} label={`${task.id} ${arm}`} /> : <p className="ie-muted">No chart.</p>}
      {run.answer ? (
        <details className="ie-answer">
          <summary>Agent reply</summary>
          <p>{run.answer}</p>
          <details>
            <summary>interaction_spec</summary>
            <pre>{JSON.stringify((run.spec as { interaction_spec?: unknown } | null)?.interaction_spec ?? null, null, 1)}</pre>
          </details>
        </details>
      ) : null}
    </div>
  );
}

function SummaryTable({ data, arms }: { data: Payload; arms: string[] }) {
  const cell = (arm: string, ask: string) => {
    const counts = { good: 0, ok: 0, bad: 0, ungraded: 0 };
    let ii = 0;
    let added = 0;
    let n = 0;
    for (const task of data.tasks) {
      if (task.ask !== ask) continue;
      const run = task.runs[arm];
      if (!run) continue;
      n++;
      counts[run.grade?.grade ?? 'ungraded']++;
      if (run.interactions.includes('inspect-index')) ii++;
      if (run.interactions.length) added++;
    }
    return { counts, ii, added, n };
  };
  return (
    <table className="ie-summary">
      <thead>
        <tr><th>Arm</th>{ASKS.map((a) => <th key={a}>{ASK_LABEL[a]}</th>)}</tr>
      </thead>
      <tbody>
        {arms.map((arm) => (
          <tr key={arm}>
            <th>{ARM_LABEL[arm] ?? arm}</th>
            {ASKS.map((ask) => {
              const c = cell(arm, ask);
              return (
                <td key={ask}>
                  <span className="ie-badge ie-badge-good">{c.counts.good}</span>
                  <span className="ie-badge ie-badge-ok">{c.counts.ok}</span>
                  <span className="ie-badge ie-badge-bad">{c.counts.bad}</span>
                  {c.counts.ungraded ? <span className="ie-badge ie-badge-ungraded">{c.counts.ungraded}</span> : null}
                  <div className="ie-muted">of {c.n} · with interactions {c.added} · inspect-index {c.ii}</div>
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function InteractionEval() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ask, setAsk] = useState<string>('all');
  const [arms, setArms] = useState<string[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'bad' | 'differ' | 'inspect-index'>('all');
  const [view, setView] = useState<'current' | 'all'>('current');

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}dev-data/interaction-eval.json`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`${r.status}: run experiments/interaction/code/export-page.py`))))
      .then((payload: Payload) => {
        setData(payload);
        setArms(payload.arms);
        if (!payload.arms.includes(CURRENT_ARM)) setView('all');
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const shown = useMemo(() => {
    if (!data || !arms) return [];
    const visible = view === 'current' ? [CURRENT_ARM] : arms;
    return data.tasks.filter((task) => {
      if (ask !== 'all' && task.ask !== ask) return false;
      if (view === 'current' && !task.runs[CURRENT_ARM]) return false;
      const runs = visible.map((arm) => task.runs[arm]).filter(Boolean);
      if (filter === 'bad') return runs.some((r) => r.grade?.grade === 'bad');
      if (filter === 'differ') return new Set(runs.map((r) => r.grade?.grade ?? '?')).size > 1;
      if (filter === 'inspect-index') return runs.some((r) => r.interactions.includes('inspect-index'));
      return true;
    });
  }, [data, arms, ask, filter, view]);

  if (error) return <div className="ie-page"><p>Could not load the runs: {error}</p></div>;
  if (!data || !arms) return <div className="ie-page"><p>Loading…</p></div>;
  const shownArms = view === 'current' ? [CURRENT_ARM] : arms;

  return (
    <div className="ie-page">
      <div className="ie-controls">
        <span className="ie-segmented" role="group" aria-label="View">
          <button type="button" className={view === 'current' ? 'is-on' : ''} disabled={!data.arms.includes(CURRENT_ARM)} onClick={() => { setView('current'); if (filter === 'differ') setFilter('all'); }}>Current results</button>
          <button type="button" className={view === 'all' ? 'is-on' : ''} onClick={() => setView('all')}>All versions</button>
        </span>
        <label>Ask
          <select value={ask} onChange={(e) => setAsk(e.target.value)}>
            <option value="all">All</option>
            {ASKS.map((a) => <option key={a} value={a}>{ASK_LABEL[a]}</option>)}
          </select>
        </label>
        <label>Show
          <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
            <option value="all">All tasks</option>
            <option value="bad">Any bad run</option>
            {view === 'all' ? <option value="differ">Versions graded differently</option> : null}
            <option value="inspect-index">Any inspect-index</option>
          </select>
        </label>
        {view === 'all' ? <span className="ie-arms">
          {data.arms.map((arm) => (
            <label key={arm}>
              <input
                type="checkbox"
                checked={arms.includes(arm)}
                onChange={(e) => setArms(e.target.checked ? data.arms.filter((a) => a === arm || arms.includes(a)) : arms.filter((a) => a !== arm))}
              />
              {ARM_LABEL[arm] ?? arm}
            </label>
          ))}
        </span> : null}
        <span className="ie-muted">{shown.length} tasks</span>
      </div>
      <header className="ie-heading">
        <h1>{data.summary?.title ?? 'Interaction experiment'}</h1>
        <p>
          Agents ({data.model}) made one Flint chart per request over TidyTuesday datasets, with the
          flint-chart-author and flint-interaction-author skills in the prompt and the chart shown in a live view.
          Each arm uses a different skill version (<code>experiments/interaction/input/skills</code>). Grades are a
          hand review of each run: <b>good</b> (right behaviour, nothing unwanted), <b>ok</b> (defensible, minor
          extra or a near pick), <b>bad</b> (unrequested or wrong behaviour, or the asked behaviour missing).
        </p>
        {data.summary?.findings?.length ? (
          <ol className="ie-findings">{data.summary.findings.map((f, i) => <li key={i}>{f}</li>)}</ol>
        ) : null}
        <SummaryTable data={data} arms={view === 'current' ? [CURRENT_ARM] : data.arms} />
      </header>


      {shown.map((task) => {
        const firstTable = shownArms.map((arm) => task.runs[arm]?.table).find(Boolean);
        return (
          <article key={task.id} className="ie-task" id={task.id}>
            <header className="ie-task-head">
              <div className="ie-task-meta">
                <span className={`ie-ask ie-ask-${task.ask}`}>{ASK_LABEL[task.ask]}</span>
                <span>{task.id}</span>
                <span>{task.family}</span>
                <span>{task.style}</span>
                <span>{task.dataset}</span>
              </div>
              <p className="ie-request">“{task.text}”</p>
              <p className="ie-expect">{expectation(task)}{task.note ? ` Note: ${task.note}.` : ''}</p>
              <details>
                <summary>Data</summary>
                <div className="ie-data">
                  <pre className="ie-readme">{data.datasets[task.dataset]}</pre>
                  <DataPreview rows={firstTable ? data.tables[firstTable] : undefined} />
                </div>
              </details>
            </header>
            <div className="ie-runs">
              {shownArms.map((arm) => <RunColumn key={arm} arm={arm} task={task} run={task.runs[arm]} tables={data.tables} />)}
            </div>
          </article>
        );
      })}
    </div>
  );
}
