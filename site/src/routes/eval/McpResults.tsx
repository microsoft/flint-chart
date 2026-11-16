import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ChartView } from '../../../../packages/flint-mcp/ui/src/ChartView';
import { BoardView, type Board } from '../../../../packages/flint-mcp/ui/src/BoardView';
import { useHostPage, useMcpStyles, useMockApp } from '../../components/mcp-embed';
import { Method } from './Eval';
import { EVAL_ROOT, mcpModelStats, pct, useMcpEval, type McpRun, type McpTurn } from './eval-data';

const SCOPE = 'ev-mcp-card';

const CATEGORIES = [
  { id: 'open-question', label: 'Open questions' },
  { id: 'concrete-dashboard', label: 'Concrete dashboards' },
  { id: 'open-dashboard', label: 'Open dashboards' },
  { id: 'follow-up', label: 'Two-turn follow-ups' },
];


function toolChip(name: string, at: number) {
  const failed = name.endsWith('!');
  const base = failed ? name.slice(0, -1) : name;
  const kind = base === 'show' ? 'show' : base === 'run_python' ? 'python' : base.startsWith('validate') ? 'validate' : base === 'get_flint_skill' ? 'skill' : 'other';
  return <span key={at} className={`ev-tool ev-tool-${kind}${failed ? ' is-failed' : ''}`}>{base}</span>;
}

function Card({ kind, file }: { kind: string; file: string }) {
  const [board, setBoard] = useState<Board | null>(null);
  const app = useMockApp();
  useEffect(() => {
    fetch(`${EVAL_ROOT}mcp/${file}`).then((r) => r.json()).then(setBoard).catch(() => setBoard(null));
  }, [file]);
  if (!board) return <div className="ie-muted">loading…</div>;
  return kind === 'board'
    ? <div className="ev-board"><BoardView app={app as never} initial={board} /></div>
    : <div className="ev-chart"><ChartView app={app as never} shown={board} /></div>;
}

/** Draws the card only once it scrolls near the screen: many live boards at once are slow. */
function Lazy({ children }: { children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) setSeen(true); }, { rootMargin: '600px' });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, []);
  return <div ref={ref} style={{ minHeight: 200 }}>{seen ? children : null}</div>;
}

function TurnCell({ turn, at }: { turn: McpTurn; at: number }) {
  const held = turn.shows.filter((show) => show.isError).length;
  return (
    <div className="ev-turn">
      <div className="ev-turn-text">
        <b>Turn {at + 1}</b> “{turn.text}”
        <div className="ev-dim">Expected: <b>{turn.expect}</b> — {turn.expectNote}</div>
        <div className="ev-dim">
          Got: <b>{turn.kind ?? 'nothing'}</b>{turn.charts.length > 0 && <> · {turn.charts.join(', ')}</>}
          {turn.linked && <> · linked on {turn.linked.join(', ')}</>}{turn.theme && <> · theme {turn.theme}</>}{held > 0 && <> · held {held}×</>}
        </div>
        {turn.issues.length
          ? <div className="ev-issues">{turn.issues.map((issue) => <span key={issue}>{issue}</span>)}</div>
          : <div className="ev-pass">passes the checks</div>}
      </div>
      {turn.file && turn.kind ? <Lazy><Card file={turn.file} kind={turn.kind} /></Lazy> : turn.kind ? null : <div className="ev-error">Nothing on screen.</div>}
    </div>
  );
}

function RunRow({ run, onOpen }: { run: McpRun; onOpen: (run: string) => void }) {
  const [open, setOpen] = useState(false);
  const failed = run.turns.some((turn) => turn.issues.length);
  return (
    <article id={run.run} className={`ev-run${failed ? ' has-issues' : ''}`}>
      <div className="ev-run-head">
        <b>{run.task}</b><span>r{run.rep}</span><span className="ev-dim">{run.model} · {run.dataset}</span>
        <span className="ev-dim">{run.seconds}s · {run.modelCalls} calls · {Math.round(run.tokens / 1000)}k tokens</span>
        {run.status !== 'done' && <span className="ev-error">{run.status}</span>}
        <button type="button" className="ev-link" onClick={() => onOpen(run.run)}>link</button>
      </div>
      <div className="ev-turns" style={{ gridTemplateColumns: `repeat(${run.turns.length}, minmax(0, 1fr))` }}>
        {run.turns.map((turn, at) => <TurnCell key={at} turn={turn} at={at} />)}
      </div>
      <div className="ev-tools">{run.tools.map(toolChip)}</div>
      <button type="button" className="ev-toggle" onClick={() => setOpen(!open)}>{open ? 'Hide' : 'Show'} replies and reports</button>
      {open && run.turns.map((turn, at) => (
        <div key={at} className="ev-reply">
          <div><b>Turn {at + 1} reply:</b> <span style={{ whiteSpace: 'pre-wrap' }}>{turn.finalText ?? '—'}</span></div>
          {turn.shows.map((show, i) => <pre key={i}>{`show #${i + 1}${show.isError ? ' (held)' : ''}\n${show.report}`}</pre>)}
        </div>
      ))}
    </article>
  );
}

function Scorecard({ runs }: { runs: McpRun[] }) {
  return (
    <table className="ie-summary">
      <thead><tr><th>Model</th><th>Turns passing</th><th>Held shows</th><th>Median time</th><th>Model calls</th></tr></thead>
      <tbody>
        {mcpModelStats(runs).map((s) => (
          <tr key={s.model}>
            <th>{s.model}</th>
            <td><b>{pct(s.cleanTurns, s.turns)}</b> <span className="ie-muted">{s.cleanTurns}/{s.turns}</span></td>
            <td>{s.heldShows}</td>
            <td>{Math.round(s.medianSeconds)}s</td>
            <td>{s.meanCalls.toFixed(1)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function Failures({ runs, onOpen }: { runs: McpRun[]; onOpen: (run: string) => void }) {
  const rows = runs.flatMap((run) => run.turns.map((turn, at) => ({ run, at, turn }))).filter(({ turn }) => turn.issues.length);
  if (!rows.length) return <p>Every turn passes the checks.</p>;
  return (
    <ul className="ev-failures">
      {rows.map(({ run, at, turn }) => (
        <li key={`${run.run}-${at}`}>
          {turn.file ? <button type="button" className="ev-link" onClick={() => onOpen(run.run)}>{run.run}</button> : run.run}
          {run.turns.length > 1 ? ` turn ${at + 1}` : ''}: {turn.issues.join('; ')}
        </li>
      ))}
    </ul>
  );
}

export function McpResults() {
  useMcpStyles(SCOPE);
  useHostPage();
  const { data, error } = useMcpEval();
  const [params, setParams] = useSearchParams();
  const target = params.get('run');
  if (error) return <p className="ev-error">{error}</p>;
  if (!data) return <p>Loading…</p>;
  const { runs } = data;
  const models = [...new Set(runs.map((r) => r.model))].sort();
  const reps = Math.max(...runs.map((r) => r.rep));
  const model = params.get('model') ?? 'all';
  const category = params.get('category') ?? 'all';
  const onlyIssues = params.get('issues') === '1';
  const set = (key: string, value: string) => {
    const next = Object.fromEntries(params);
    delete next.run;
    setParams({ ...next, [key]: value });
  };
  const open = (run: string) => {
    setParams({ run });
    window.scrollTo({ top: 0 });
  };
  const opened = target ? runs.find((r) => r.run === target) : undefined;
  if (opened) {
    return (
      <div className={`${SCOPE} ev-stack`}>
        <div><button type="button" onClick={() => setParams({})}>← All runs</button></div>
        <RunRow run={opened} onOpen={open} />
      </div>
    );
  }
  const shown = runs.filter((r) => data.cardReps.includes(r.rep) && (model === 'all' || r.model === model)
      && (category === 'all' || r.category === category) && (!onlyIssues || r.turns.some((t) => t.issues.length)));
  const select = (key: string, value: string, label: string, options: [string, string][]) => (
    <select value={value} onChange={(e) => set(key, e.target.value)} aria-label={label}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
  );

  return (
    <div className={`${SCOPE} ev-stack`}>
      <Method
        question="Does what an agent puts on screen through the Flint MCP app fit the request: a light answer to a question, a board for a dashboard, the same board changed on a follow-up?"
        sop="experiments/mcp-app/SOP.md"
        rows={[
          ['Tasks', <>{new Set(runs.map((r) => r.task)).size} requests: {CATEGORIES.map((c) => c.label.toLowerCase()).join(', ')}.</>],
          ['Run', <>{models.join(' and ')}, {reps} repeats each ({runs.length} runs), with the server&apos;s instructions as the prompt and every tool it serves, <code>show</code> included.</>],
          ['Checks', <>Structural, per turn (<code>code/checks.py</code>): the kind of card fits the request, links and follow-ups are kept. They do not grade chart quality.</>],
        ]}
      />

      <section>
        <h2 className="ev-h2">Results <span className="ie-muted">arm {data.arm} · run {data.ranOn ?? '?'}</span></h2>
        <div className="ev-results">
          <Scorecard runs={runs} />
          <div>
            <h3 className="ev-h3">Turns that fail a check</h3>
            <Failures runs={runs} onOpen={open} />
          </div>
        </div>
      </section>

      <div className="ie-controls">
        {select('model', model, 'Model', [['all', 'All models'], ...models.map((m): [string, string] => [m, m])])}
        {select('category', category, 'Category', [['all', 'All categories'], ...CATEGORIES.map((c): [string, string] => [c.id, c.label])])}
        <label><input type="checkbox" checked={onlyIssues} onChange={(e) => set('issues', e.target.checked ? '1' : '0')} /> only runs with issues</label>
        <span className="ie-muted">{shown.length} runs · cards for repeat {data.cardReps.join(', ')}</span>
      </div>
      {CATEGORIES.filter((c) => shown.some((r) => r.category === c.id)).map((c) => (
        <section key={c.id} className="ev-category">
          <h3 className="ev-h3">{c.label}</h3>
          {shown.filter((r) => r.category === c.id).map((r) => <RunRow key={r.run} run={r} onOpen={open} />)}
        </section>
      ))}
    </div>
  );
}
