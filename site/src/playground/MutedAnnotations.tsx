import { FlintChart } from 'flint-chart/react';
import type { ChartAssemblyInput } from 'flint-chart';
import DATA from './muted-annotations/cases.json';
import './muted-annotations/muted-annotations.css';

// Muted annotations: what an agent may put on a chart, unasked, to point at the answer to a
// concrete question. Built by experiments/interaction/code/build-muted-cases.py from charts agents
// made in the interaction runs.

interface Case {
  id: string;
  group: string;
  question: string;
  technique: string;
  verdict: 'muted' | 'opt-in' | 'avoid';
  why: string;
  spec: { data: Record<string, unknown> } & Record<string, unknown>;
  table: string;
  updates: { id: string; ops: { op: string }[] }[];
}

const GROUPS: { id: string; title: string; text: string }[] = [
  {
    id: 'one',
    title: 'One mark: a point on a line, a bar, a scatter point',
    text: 'The answer is one mark. A light highlight finds it and a label of a few words says what it is: the value, and the name or date where the axis does not already give it.',
  },
  {
    id: 'two',
    title: 'Two marks: a difference, a crossing, A against B',
    text: 'The title states the difference or the crossing. Each of the two marks gets its own short label so the reader can tell which is which.',
  },
  {
    id: 'threshold',
    title: 'A value the question names',
    text: 'A plain rule at the value the question names, and at most one point that answers it. The rule needs no caption when the title names the value.',
  },
  {
    id: 'span',
    title: 'Spans and sets: the answer is a stretch or a group',
    text: 'A period or a band of values gets one light shade under the marks; a caption only when the title does not give the range and there is open plot for it. A small set gets light emphasis or an outline per member, with labels only when there are a few and room round them. A clear cluster can take one light enclosure.',
  },
  {
    id: 'room',
    title: 'Room decides: a label where there is open space, an outline where there is none',
    text: 'What limits a label is the space around the answer, not the chart type. A pie slice or a map region with open canvas beside it takes a short label; a cell in a full grid, or a bar that already prints its value, takes an outline (a note with text "") and no label or leader.',
  },
  {
    id: 'style',
    title: 'Text and highlight style',
    text: 'A note takes the theme\'s annotation type; without one, the axis labels\' face and weight a size up, in the primary ink. Rings, outlines and enclosures take the theme\'s interaction.highlight; without one, the neutral annotation grey. One update can set its own: value.style for text, value.highlightStyle for the ring or outline, color and width on an enclosure.',
  },
  {
    id: 'outside',
    title: 'Outside the muted tier',
    text: 'Notes that tell a story are for a user who asks for an explaining chart. A bare tag says nothing; a sentence repeats the title and crowds the plot.',
  },
];

const VERDICT_LABEL: Record<Case['verdict'], string> = { muted: 'Muted: allowed unasked', 'opt-in': 'Full: only when asked', avoid: 'Avoid' };

function CaseCard({ item }: { item: Case }) {
  const tables = (DATA as { tables: Record<string, unknown[]> }).tables;
  const spec = { ...item.spec, data: { ...item.spec.data, values: tables[item.table] } } as unknown as ChartAssemblyInput;
  const ops = item.updates.flatMap((u) => u.ops);
  return (
    <article className={`ma-card ma-${item.verdict}`} data-case={item.id}>
      <header className="ma-card-head">
        <span className={`ma-verdict ma-verdict-${item.verdict}`}>{VERDICT_LABEL[item.verdict]}</span>
        <span className="ma-technique">{item.technique}</span>
      </header>
      <p className="ma-question">“{item.question}”</p>
      <div className="ma-mount">
        <FlintChart spec={spec} updates={item.updates as never} renderer="svg" width="100%" height={360} fit="relayout" ariaLabel={item.question} />
      </div>
      <p className="ma-why">{item.why}</p>
      <details className="ma-ops">
        <summary>{ops.map((o) => o.op).join(' + ')}</summary>
        <pre>{JSON.stringify(ops, null, 1)}</pre>
      </details>
    </article>
  );
}

export function MutedAnnotations() {
  const cases = (DATA as unknown as { cases: Case[] }).cases;
  return (
    <div className="ma-page">
      <header className="ma-heading">
        <h1>Muted annotations</h1>
        <p>
          A chart opens clean. When the user asks a concrete question (a peak, a value at a date, a difference, a
          crossing, a threshold), the agent may point at the answer without being asked, in a muted way. The message
          goes in the title; the annotation only points.
        </p>
        <p><b>One rule for every form:</b> annotate only what directly answers the question, and let the density around it decide how: a label where there is open space, a shorter label or none where it is tighter, an outline or a light shade where marks fill the space.</p>
        <ol className="ma-rules">
          <li><b>The question is concrete.</b> It asks about particular values. An overview question (“how did prices move”) gets none.</li>
          <li><b>It points only at the answer</b>, and only when it directly answers the question: one mark, two for a difference or a crossing, one span, or one small set.</li>
          <li><b>The title says it, the mark points at it.</b> A label of a few words that still means something: the value and what identifies it (“$5.01 · Jun 13, 2022”), not a bare tag (“Peak”) and not a sentence.</li>
          <li><b>There is room for it.</b> A short label goes where there is open space beside the answer, on any chart. Where marks fill the space round it (a full grid, a dense cluster, a bar that already prints its value), the answer gets an outline and no text: <code>annotate-text</code> with <code>text: ""</code>.</li>
        </ol>
      </header>
      {GROUPS.map((group) => {
        const items = cases.filter((c) => c.group === group.id);
        if (!items.length) return null;
        return (
          <section key={group.id} className="ma-section">
            <h2>{group.title}</h2>
            <p>{group.text}</p>
            <div className="ma-grid">
              {items.map((item) => <CaseCard key={item.id} item={item} />)}
            </div>
          </section>
        );
      })}
    </div>
  );
}
