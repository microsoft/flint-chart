/**
 * The issues the style-guide gaps add up to, for the Theme improvement page: every in-scope gap grouped by the
 * part of the system a principled fix would change, and what was found along the way.
 */
import ReactMarkdown from 'react-markdown';
import { FINDINGS, FLINT_BUGS, ISSUE_STATUS, PROBES } from './findings';
import {
  BY_ISSUE, Badge, DEFERRED, FAMILIES, FAMILY_OF, GapRow, IN_SCOPE, IssueChip, KIND_LABELS, Md, houseCount, issueHref, progress,
  representatives, stageHref,
} from './gaps';
import type { GapKind } from './types';

function IssueDetail({ issue }: { issue: string }) {
  const entries = BY_ISSUE.get(issue) ?? [];
  const family = FAMILY_OF.get(issue);
  const bugs = FLINT_BUGS.filter((bug) => bug.issue === issue);
  const examples = representatives(issue);
  const rest = entries.filter((entry) => !examples.includes(entry));
  const p = progress(issue);
  const state = ISSUE_STATUS[issue];
  const kinds = (Object.keys(KIND_LABELS) as GapKind[]).filter((kind) => entries.some((entry) => entry.gap.kind === kind));
  return (
    <section className="tp-issue" id="issue-detail" data-issue={issue}>
      <p className="tp-eyebrow">{family?.label}</p>
      <h2><code>{issue}</code></h2>
      <p>{PROBES[issue] ?? entries[0]?.gap.title}</p>
      <div className="tp-badges">
        <Badge>{entries.length} gaps · {houseCount(entries)} houses</Badge>
        {kinds.map((kind) => <Badge key={kind} tone={`kind-${kind}`}>{entries.filter((entry) => entry.gap.kind === kind).length} {KIND_LABELS[kind].toLowerCase()}</Badge>)}
        {p.addressed > 0 && <Badge tone="done">{p.addressed} addressed</Badge>}
        {state && <Badge>{state.status === 'skip' ? 'skipped for now' : 'later'}: {state.note}</Badge>}
      </div>
      {bugs.length > 0 && (
        <ul className="tp-bugs">
          {bugs.map((bug) => (
            <li key={bug.id}>
              <span className="tp-md-inline"><ReactMarkdown>{bug.summary}</ReactMarkdown></span>{' '}
              {bug.fixed
                ? <a className="tp-done" href={stageHref(bug.fixed.stage)}>{bug.fixed.partly ? 'partly fixed' : 'fixed'} in {bug.fixed.stage}</a>
                : <Badge tone="kind-realization">open bug</Badge>}
            </li>
          ))}
        </ul>
      )}
      <h3>Examples</h3>
      {examples.map((entry, i) => <GapRow key={`${entry.theme.id}-${entry.gap.id}`} gap={entry.gap} house={entry.theme} open={i === 0} />)}
      {rest.length > 0 && (
        <>
          <h3>Every other case ({rest.length})</h3>
          {rest.map((entry) => <GapRow key={`${entry.theme.id}-${entry.gap.id}`} gap={entry.gap} house={entry.theme} />)}
        </>
      )}
    </section>
  );
}

export function IssuesView({ issue, onIssue }: { issue: string | null; onIssue: (issue: string) => void }) {
  const addressed = IN_SCOPE.filter((entry) => entry.gap.addressed).length;
  const fixed = FLINT_BUGS.filter((bug) => bug.fixed && !bug.fixed.partly).length;
  return (
    <div>
      <p className="tp-lead">
        Every gap the {houseCount(IN_SCOPE)} style-guide houses left, grouped by the part of Flint a fix would change. The number on an issue is how
        many houses hit it; a dot marks an open Flint bug. So far {addressed} of {IN_SCOPE.length} gaps are addressed and {fixed} of {FLINT_BUGS.length} bugs
        fixed. {DEFERRED.length} gaps about chart annotations are left out.
      </p>
      <div className="tp-families">
        {FAMILIES.map((family) => (
          <div key={family.id} className="tp-family">
            <div className="tp-family-name" title={family.principle}>{family.label}</div>
            <div>{family.issues.map((id) => <IssueChip key={id} issue={id} selected={id === issue} onIssue={onIssue} />)}</div>
          </div>
        ))}
      </div>
      {issue && BY_ISSUE.has(issue) ? <IssueDetail key={issue} issue={issue} /> : <p className="tp-muted">Pick an issue to see its cases.</p>}
    </div>
  );
}

export function FindingsView() {
  return (
    <div>
      <section className="tp-section">
        <h2>Findings</h2>
        <Md>{FINDINGS}</Md>
      </section>
      <section className="tp-section">
        <h2>Flint bugs found along the way</h2>
        <table className="tp-table">
          <thead><tr><th>Bug</th><th>Houses</th><th>Status</th><th>Issue</th></tr></thead>
          <tbody>
            {FLINT_BUGS.map((bug) => (
              <tr key={bug.id}>
                <td><span className="tp-md-inline"><ReactMarkdown>{bug.summary}</ReactMarkdown></span></td>
                <td>{bug.houses}</td>
                <td>
                  {bug.fixed
                    ? <a className="tp-done" href={stageHref(bug.fixed.stage)} title={bug.fixed.partly}>{bug.fixed.partly ? 'partly fixed' : 'fixed'} · {bug.fixed.stage}</a>
                    : <span className="tp-open">open</span>}
                </td>
                <td><a href={issueHref(bug.issue)}><code>{bug.issue}</code></a></td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
