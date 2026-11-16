/**
 * What the style-guide pages share: the gaps every house left, grouped into issues, and the card that shows one
 * gap. "Style guides" (new-theme-test) shows each house's own gaps; "Theme improvement" shows the issues they
 * add up to and the fixes made against them.
 */
import type { ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import { FlintView } from '../../components/FlintView';
import { ScaleToFit } from '../../components/ScaleToFit';
import { VegaLiteView } from '../../components/VegaLiteView';
import { STYLE_GUIDE_THEMES } from './themes';
import { DEFERRED_PROBES, FLINT_BUGS, ISSUE_FAMILIES, ISSUE_STATUS, PROBES, REPRESENTATIVES, canonicalProbe, type IssueFamily } from './findings';
import type { GapKind, StyleGuideTheme, ThemeGap } from './types';
import './theme-pages.css';

export type Entry = { theme: StyleGuideTheme; gap: ThemeGap; issue: string };

const ENTRIES: Entry[] = STYLE_GUIDE_THEMES.flatMap((theme) => theme.gaps.map((gap) => ({ theme, gap, issue: canonicalProbe(gap.probe) })));
export const isDeferred = (gap: ThemeGap) => DEFERRED_PROBES.has(canonicalProbe(gap.probe));
export const IN_SCOPE = ENTRIES.filter((entry) => !DEFERRED_PROBES.has(entry.issue));
export const DEFERRED = ENTRIES.filter((entry) => DEFERRED_PROBES.has(entry.issue));
export const BY_ISSUE = new Map<string, Entry[]>();
for (const entry of IN_SCOPE) BY_ISSUE.set(entry.issue, [...(BY_ISSUE.get(entry.issue) ?? []), entry]);

/** The families, plus one holding any issue no family names, so nothing in scope goes unlisted. */
export const FAMILIES: IssueFamily[] = (() => {
  const named = new Set(ISSUE_FAMILIES.flatMap((family) => family.issues));
  const rest = [...BY_ISSUE.keys()].filter((issue) => !named.has(issue)).sort();
  const families = ISSUE_FAMILIES.map((family) => ({ ...family, issues: family.issues.filter((issue) => BY_ISSUE.has(issue)) }));
  return rest.length ? [...families, { id: 'other', label: 'Other', principle: 'Issues no family claims yet.', issues: rest }] : families;
})();
export const FAMILY_OF = new Map(FAMILIES.flatMap((family) => family.issues.map((issue) => [issue, family] as const)));
export const houseCount = (entries: Entry[]) => new Set(entries.map((entry) => entry.theme.id)).size;

const SEVERITY_SCORE = { high: 30, medium: 20, low: 10 } as const;

/** Up to `limit` examples from different houses: hand-picked first, then the strongest evidence. */
export function representatives(issue: string, limit = 3): Entry[] {
  const entries = BY_ISSUE.get(issue) ?? [];
  const picked: Entry[] = [];
  for (const ref of REPRESENTATIVES[issue] ?? []) {
    const [house, gapId] = ref.split(':');
    const found = entries.find((entry) => entry.theme.id === house && entry.gap.id === gapId);
    if (found) picked.push(found);
  }
  const hasBug = FLINT_BUGS.some((bug) => bug.issue === issue);
  const score = ({ gap }: Entry) => (gap.flint && gap.expectedSpec ? 100 : 0) + SEVERITY_SCORE[gap.severity]
    + (gap.observed ? 5 : 0) + (hasBug && gap.kind === 'realization' ? 15 : 0);
  for (const entry of [...entries].sort((a, b) => score(b) - score(a))) {
    if (picked.length >= limit) break;
    if (picked.some((p) => p.theme.id === entry.theme.id)) continue;
    picked.push(entry);
  }
  return picked.slice(0, limit);
}

/** How far an issue has come: its gaps addressed, its bugs fixed and still open. */
export function progress(issue: string) {
  const entries = BY_ISSUE.get(issue) ?? [];
  const addressed = entries.filter((entry) => entry.gap.addressed);
  const bugs = FLINT_BUGS.filter((bug) => bug.issue === issue);
  const fixed = bugs.filter((bug) => bug.fixed && !bug.fixed.partly).length;
  const stages = [...new Set([...addressed.map((entry) => entry.gap.addressed!.stage), ...bugs.flatMap((bug) => (bug.fixed ? [bug.fixed.stage] : []))])].sort();
  return { entries, addressed: addressed.length, bugs: bugs.length, fixed, open: bugs.length - fixed, stages };
}

export const houseHref = (house: string) => `#/playground/new-theme-test?theme=${house}`;
export const issueHref = (issue: string) => `#/playground/theme-improvement?view=issues&issue=${issue}`;
/** The theme-improvement stage a link opens; the page finds the area from the stage. */
export const stageHref = (stage: string) => `#/playground/theme-improvement?stage=${stage.toLowerCase()}`;

export const KIND_LABELS: Record<GapKind, string> = {
  expressiveness: 'ThemeSpec cannot state it',
  'chart-spec': 'Chart spec has no slot',
  realization: 'Stated, not drawn',
  'visual-quality': 'Visual quality',
  'product-ui': 'Product UI',
};

export function Badge({ tone = 'neutral', children, title }: { tone?: string; children: ReactNode; title?: string }) {
  return <span className={`tp-badge tp-tone-${tone}`} title={title}>{children}</span>;
}

export const KindBadge = ({ kind }: { kind: GapKind }) => <Badge tone={`kind-${kind}`}>{KIND_LABELS[kind]}</Badge>;

export const Md = ({ children, inline = false }: { children: string; inline?: boolean }) => (
  <div className={inline ? 'tp-md tp-md-inline' : 'tp-md'}><ReactMarkdown>{children}</ReactMarkdown></div>
);

function Expected({ gap }: { gap: ThemeGap }) {
  if (!gap.expectedSpec) return <p className="tp-muted">Described in the notes.</p>;
  const frame = gap.expectedFrame;
  return (
    <ScaleToFit height={420} minHeight={120} adaptiveHeight padding={2}>
      <div style={{ display: 'inline-block', ...(frame?.style ?? {}) }}>
        {frame?.headerHtml && <div dangerouslySetInnerHTML={{ __html: frame.headerHtml }} />}
        <VegaLiteView spec={gap.expectedSpec} renderer="svg" />
        {frame?.footerHtml && <div dangerouslySetInnerHTML={{ __html: frame.footerHtml }} />}
      </div>
    </ScaleToFit>
  );
}

/** One gap in full: what the guide asks, what Flint draws, what it should draw, and the two charts. */
export function GapDetail({ gap }: { gap: ThemeGap }) {
  return (
    <div className="tp-gap-detail">
      <dl className="tp-kv">
        <dt>Guide</dt><dd><Md inline>{gap.rule}</Md></dd>
        <dt>Flint now</dt><dd><Md inline>{gap.current}</Md></dd>
        <dt>Expected</dt><dd><Md inline>{gap.expected}</Md></dd>
        {gap.proposal && <><dt>Proposal</dt><dd><Md inline>{gap.proposal}</Md></dd></>}
        {gap.observed && <><dt>Observed</dt><dd className="tp-muted"><Md inline>{gap.observed}</Md></dd></>}
        {gap.addressed && (
          <><dt className="tp-done">Addressed</dt><dd><a className="tp-done" href={stageHref(gap.addressed.stage)}>{gap.addressed.stage}</a> — {gap.addressed.note} The left chart draws the house as it now stands.</dd></>
        )}
      </dl>
      {(gap.flint || gap.expectedSpec) && (
        <div className="tp-panels">
          <figure>
            <figcaption>Flint with the house theme</figcaption>
            {gap.flint
              ? <ScaleToFit height={420} minHeight={120} adaptiveHeight padding={2}><FlintView spec={gap.flint} renderer="svg" compact showWarnings={false} /></ScaleToFit>
              : <p className="tp-muted">Not drawable in Flint.</p>}
          </figure>
          <figure>
            <figcaption>What the guide asks for (hand-made)</figcaption>
            <Expected gap={gap} />
          </figure>
        </div>
      )}
    </div>
  );
}

/** A gap as one line that opens to its detail; `house` adds the house's name, for lists across houses. */
export function GapRow({ gap, house, open = false }: { gap: ThemeGap; house?: StyleGuideTheme; open?: boolean }) {
  return (
    <details className="tp-gap" id={`gap-${gap.id}`} data-gap={gap.id} open={open}>
      <summary>
        <span className={`tp-sev tp-sev-${gap.severity}`} title={`${gap.severity} severity`} />
        {house && <a className="tp-house-link" href={houseHref(house.id)} onClick={(event) => event.stopPropagation()}>{house.org}</a>}
        <span className="tp-gap-title">{gap.title}</span>
        <KindBadge kind={gap.kind} />
        {gap.addressed && <Badge tone="done">addressed · {gap.addressed.stage}</Badge>}
      </summary>
      <GapDetail gap={gap} />
    </details>
  );
}

export function IssueChip({ issue, selected, onIssue }: { issue: string; selected?: boolean; onIssue: (issue: string) => void }) {
  const p = progress(issue);
  const done = p.entries.length > 0 && p.addressed === p.entries.length && p.open === 0;
  const state = ISSUE_STATUS[issue];
  const classes = ['tp-chip', selected && 'is-on', done && 'is-done', (p.addressed || p.fixed) && 'is-worked', state?.status === 'skip' && 'is-skipped'].filter(Boolean).join(' ');
  return (
    <button type="button" className={classes} onClick={() => onIssue(issue)}
      title={`${PROBES[issue] ?? issue}${p.stages.length ? ` — worked on in ${p.stages.join(', ')}` : ''}${state ? ` — ${state.note}` : ''}`}>
      {issue}
      <span className="tp-chip-count">{houseCount(p.entries)}</span>
      {p.open > 0 && <span className="tp-chip-bug" title={`${p.open} open Flint bug${p.open === 1 ? '' : 's'}`}>●</span>}
    </button>
  );
}
