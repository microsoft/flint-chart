import type { ReactNode } from 'react';
import { NavLink, Outlet } from 'react-router-dom';
import './eval.css';

// Dev-only Eval tab of the dev shell (#/playground/eval): how we evaluate agents working with Flint, and the latest
// run's results. Runs live in experiments/ (gitignored) and reach this page through the exports in site/public/eval/.

export function EvalPage() {
  return (
    <div className="ev-page">
      <header className="ev-head">
        <h1>Eval</h1>
        <nav className="ev-tabs" aria-label="Evals">
          <NavLink to="interactions">Interactions</NavLink>
          <NavLink to="mcp">MCP app</NavLink>
        </nav>
      </header>
      <Outlet />
    </div>
  );
}

/** What the eval asks, how a run goes and how it is judged, in a few lines; the SOP has the commands. */
export function Method({ question, rows, sop }: { question: ReactNode; rows: [string, ReactNode][]; sop: string }) {
  return (
    <section className="ev-method">
      <p className="ev-lead">{question}</p>
      <dl>
        {rows.map(([term, text]) => (
          <div key={term}><dt>{term}</dt><dd>{text}</dd></div>
        ))}
      </dl>
      <p className="ie-muted">Commands and details: <code>{sop}</code>.</p>
    </section>
  );
}
