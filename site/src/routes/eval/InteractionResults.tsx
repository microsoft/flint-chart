import { useEffect, useMemo, useRef, useState } from 'react';
import { FlintChart } from 'flint-chart/react';
import type { ChartAssemblyInput } from 'flint-chart';
import { Method } from './Eval';
import {
  GRADES, currentArm, gradeCounts, type InteractionPayload, type InteractionRun, type InteractionTask,
  useInteractionEval,
} from './eval-data';

const ASKS = [
  { id: 'none', label: 'No ask' },
  { id: 'direct', label: 'Direct ask' },
  { id: 'indirect', label: 'Indirect ask' },
  { id: 'indirect-hard', label: 'Indirect, harder' },
  { id: 'updates', label: 'Updates' },
  { id: 'muted', label: 'Muted annotations' },
];
const askLabel = (id: string) => ASKS.find((a) => a.id === id)?.label ?? id;

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

function expectation(task: InteractionTask) {
  if (task.ask === 'none') return 'No interaction asked: none expected, and a clean chart (no updates).';
  if (task.ask === 'muted') return task.expect === 'none'
    ? 'An overview question: chart left clean (no updates).'
    : `A concrete question: may point at the answer, muted (${task.form ?? ''}).`;
  if (task.ask === 'updates') return task.wantUpdates ? 'Marks on the chart asked for: updates expected.' : 'A question: answered in the reply, chart left clean (no updates).';
  const want = task.want.length ? `${task.wantAll ? 'all of' : 'one of'} ${task.want.join(', ')}` : 'nothing required';
  const extra = task.ok.filter((p) => !task.want.includes(p));
  return `Want ${want}${extra.length ? `; also fine: ${extra.join(', ')}` : ''}.`;
}

const updateOps = (updates: unknown[]) => (updates as { ops?: { op?: string }[] }[]).flatMap((u) => (u.ops ?? []).map((o) => o.op ?? '?'));

function RunResult({ task, run, tables }: { task: InteractionTask; run: InteractionRun | undefined; tables: InteractionPayload['tables'] }) {
  if (!run) return <div className="ie-run ie-run-missing">No run.</div>;
  const spec = run.spec && run.table
    ? ({ ...run.spec, data: { ...(run.spec.data as object), values: tables[run.table] } } as unknown as ChartAssemblyInput)
    : null;
  const grade = run.grade?.grade ?? 'ungraded';
  const ops = updateOps(run.updates);
  return (
    <div className={`ie-run ie-grade-${grade}`}>
      <div className="ie-run-head">
        <span className="ie-chart-type">{run.chartType ?? run.status}</span>
        <span className={`ie-badge ie-badge-${grade}`}>{grade}</span>
      </div>
      <div className="ie-chips">
        {run.interactions.length
          ? run.interactions.map((p, i) => (
            <span key={i} className={`ie-chip${task.want.includes(p) ? ' ie-chip-want' : task.ok.includes(p) ? ' ie-chip-ok' : ' ie-chip-extra'}`}>{p}</span>
          ))
          : <span className="ie-chip ie-chip-none">no interaction</span>}
        {ops.length
          ? ops.map((op, i) => <span key={`u${i}`} className="ie-chip ie-chip-update">{op}</span>)
          : <span className="ie-chip ie-chip-none">no updates</span>}
      </div>
      {run.grade?.tags?.length ? <div className="ie-tags">{run.grade.tags.map((t) => <span key={t}>{t}</span>)}</div> : null}
      {run.grade?.note ? <p className="ie-note">{run.grade.note}</p> : null}
      {spec ? <LazyChart spec={spec} updates={run.updates} label={task.id} /> : <p className="ie-muted">No chart.</p>}
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

function ByAsk({ data, arm }: { data: InteractionPayload; arm: string }) {
  const rows = ASKS.filter((a) => data.tasks.some((t) => t.ask === a.id))
    .map((a) => ({ label: a.label, tasks: data.tasks.filter((t) => t.ask === a.id) }))
    .concat([{ label: 'All', tasks: data.tasks }]);
  return (
    <table className="ie-summary">
      <thead><tr><th>Ask</th><th>Tasks</th>{GRADES.map((g) => <th key={g}>{g}</th>)}</tr></thead>
      <tbody>
        {rows.map(({ label, tasks }) => {
          const counts = gradeCounts(tasks, arm);
          return (
            <tr key={label} className={label === 'All' ? 'ev-total' : undefined}>
              <th>{label}</th>
              <td>{tasks.length}</td>
              {GRADES.map((g) => <td key={g}>{counts[g] ? <span className={`ie-badge ie-badge-${g}`}>{counts[g]}</span> : '·'}</td>)}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function InteractionResults() {
  const { data, error } = useInteractionEval();
  const [ask, setAsk] = useState('all');
  const [notGood, setNotGood] = useState(false);
  const arm = data ? currentArm(data) : '';
  const shown = useMemo(() => (data?.tasks ?? []).filter((task) => (ask === 'all' || task.ask === ask)
    && (!notGood || task.runs[arm]?.grade?.grade !== 'good')), [data, arm, ask, notGood]);

  if (error) return <p className="ev-error">{error}</p>;
  if (!data) return <p>Loading…</p>;
  const asks = ASKS.filter((a) => data.tasks.some((t) => t.ask === a.id));

  return (
    <>
      <Method
        question="Does the interaction skill make an agent add the interactions a request needs, and only those?"
        sop="experiments/interaction/SOP.md"
        rows={[
          ['Tasks', <>{data.tasks.length} chart requests over {new Set(data.tasks.map((t) => t.dataset)).size} TidyTuesday datasets, from asking for no behaviour to naming it, describing a need, or asking a question.</>],
          ['Run', <>{data.model} makes one chart per request with the Flint MCP tools and both skills (<code>input/skills/{arm}/</code>) in its prompt; it is told the chart is shown in a live view and nothing about interactions.</>],
          ['Grading', <>By hand. <b>good</b>: the asked behaviour, nothing unwanted. <b>ok</b>: one harmless extra or a near pick. <b>bad</b>: unrequested presets, a preset unfit for the chart, or the asked behaviour missing.</>],
        ]}
      />

      <section>
        <h2 className="ev-h2">Results <span className="ie-muted">{data.model} · run {data.ranOn ?? '?'}</span></h2>
        <div className="ev-results">
          <ByAsk data={data} arm={arm} />
          {data.summary.findings.length ? <ul className="ie-findings">{data.summary.findings.map((f, i) => <li key={i}>{f}</li>)}</ul> : null}
        </div>
      </section>

      <div className="ie-controls">
        <select value={ask} onChange={(e) => setAsk(e.target.value)} aria-label="Ask">
          <option value="all">All asks</option>
          {asks.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        <label><input type="checkbox" checked={notGood} onChange={(e) => setNotGood(e.target.checked)} /> only ok or bad</label>
        <span className="ie-muted">{shown.length} tasks</span>
      </div>

      {shown.map((task) => {
        const run = task.runs[arm];
        return (
          <article key={task.id} className="ie-task ev-task" id={task.id}>
            <header className="ie-task-head">
              <div className="ie-task-meta">
                <span className={`ie-ask ie-ask-${task.ask}`}>{askLabel(task.ask)}</span>
                <span>{task.id}</span>
                <span>{task.dataset}</span>
              </div>
              <p className="ie-request">“{task.text}”</p>
              <p className="ie-expect">{expectation(task)}{task.note ? ` Note: ${task.note}.` : ''}</p>
              <details>
                <summary>Data</summary>
                <div className="ie-data">
                  <pre className="ie-readme">{data.datasets[task.dataset]}</pre>
                  <DataPreview rows={run?.table ? data.tables[run.table] : undefined} />
                </div>
              </details>
            </header>
            <RunResult task={task} run={run} tables={data.tables} />
          </article>
        );
      })}
    </>
  );
}
