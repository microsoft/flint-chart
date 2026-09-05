import { describe, expect, it } from 'vitest';
import { countriesFixture, salesFixture } from '../src/playground/interaction-demo-data';
import {
  agentChartOf,
  extractParts,
  sentenceRows,
  chartRows,
  toParagraphs,
  toSentence,
  type AgentUpdate,
} from '../src/playground/interactive-data-report-model';

const where = (field: string, ...values: string[]): AgentUpdate['records'] =>
  values.map((value) => ({ pairs: [{ field, value }] }));
const highlight = (field: string, ...values: string[]): AgentUpdate =>
  ({ op: 'highlight', records: where(field, ...values), text: null, x: null, y: null });
const annotate = (field: string, value: string, text: string): AgentUpdate =>
  ({ op: 'annotate', records: where(field, value), text, x: null, y: null });

describe('the agent view of a chart', () => {
  it('keys a scatter plot by its detail field', () => {
    const chart = agentChartOf(countriesFixture, []);
    expect(chart.keyFields).toEqual(['Country']);
    expect(chart.annotationFields).toEqual(['Country', 'Continent']);
    expect(chart.viewportAxes).toEqual([]);
  });

  it('keys a grouped bar chart by its discrete axis', () => {
    const chart = agentChartOf(salesFixture, []);
    expect(chart.keyFields).toEqual(['Region']);
  });
});

describe('an agent part becomes a sentence', () => {
  const countries = agentChartOf(countriesFixture, []);

  it('turns a highlight into an emphasis on the key field, whatever column the clause names', () => {
    const item = toSentence('s1', 'Asia stretches far', [highlight('Continent', 'Asia')], countries);
    expect(item?.ops).toEqual([{
      op: 'set-style',
      targets: [{ select: { key: { Country: 'China' } } }, { select: { key: { Country: 'Japan' } } }, { select: { key: { Country: 'India' } } }],
      value: { state: 'emphasized', mutedOpacity: 0.25 },
    }]);
    expect(sentenceRows(item!, chartRows(countriesFixture.input)).size).toBe(3);
  });

  it('matches numbers written as text', () => {
    const item = toSentence('s2', 'the longest', [highlight('Life expectancy', '84.2')], countries);
    expect(item?.ops[0]).toMatchObject({ targets: [{ select: { key: { Country: 'Japan' } } }] });
  });

  it('adds an emphasis to a lone note, and not to a note beside a highlight', () => {
    const alone = toSentence('s3', 'Japan leads', [annotate('Country', 'Japan', '84.2 years')], countries);
    expect(alone?.ops.map((op) => op.op)).toEqual(['set-annotation', 'set-style']);
    const paired = toSentence('s4', 'Japan leads', [highlight('Country', 'Japan'), annotate('Country', 'Japan', '84.2 years')], countries);
    expect(paired?.ops.map((op) => op.op)).toEqual(['set-style', 'set-annotation']);
  });

  it('drops a viewport when no navigation preset is mounted, and the whole sentence when nothing resolves', () => {
    expect(toSentence('s5', 'zoom', [{ op: 'viewport', records: [], text: null, x: [1000, 5000], y: null }], countries)).toBeNull();
    expect(toSentence('s6', 'nowhere', [highlight('Country', 'Atlantis')], countries)).toBeNull();
  });

  it('projects a bar chart clause onto the category axis', () => {
    const sales = agentChartOf(salesFixture, []);
    const item = toSentence('s7', 'Technology leads everywhere', [highlight('Segment', 'Technology')], sales);
    expect(item?.ops[0]).toMatchObject({ targets: [{ select: { key: { Region: 'West' } } }, { select: { key: { Region: 'East' } } }, { select: { key: { Region: 'Central' } } }, { select: { key: { Region: 'South' } } }] });
  });
});

describe('an answer becomes paragraphs', () => {
  const countries = agentChartOf(countriesFixture, []);

  it('keeps plain parts as text, binds the rest, and splits on a blank line', () => {
    const paragraphs = toParagraphs([
      { text: 'Japan leads', chart: null, updates: [highlight('Country', 'Japan')] },
      { text: '.Then', chart: null, updates: [] },
      { text: ' more.\n\nA new paragraph.', chart: null, updates: [] },
    ], 'turn-1', countries);
    expect(paragraphs).toHaveLength(2);
    expect(paragraphs[0].map((part) => (typeof part === 'string' ? part : `[${part.id}]`))).toEqual(['[turn-1-0]', '.Then', ' more.']);
    expect(paragraphs[1]).toEqual(['A new paragraph.']);
  });

  it('reads complete parts out of a streaming answer', () => {
    const partial = '{"parts":[{"text":"Japan leads","updates":[]},{"text":"and then","upd';
    expect(extractParts(partial)).toEqual([{ text: 'Japan leads', chart: null, updates: [] }]);
  });
});
