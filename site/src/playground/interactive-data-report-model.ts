import { assembleVegaLite, type ChartAssemblyInput } from 'flint-chart';
import type {
  CanvasInteractionDef,
  ChartUpdateOp,
  SemanticElement,
  UpdateDomain,
  UpdateTarget,
} from 'flint-chart/interactive';
import {
  axisHighlight,
  brushZoom,
  clickAnnotate,
  clickHighlight,
  contextActivate,
  doubleActivate,
  dragReorder,
  hoverGroupFocus,
  lassoSelect,
  legendToggle,
  longPress,
  navigate,
  select,
} from 'flint-chart/interactive';
import {
  EyeOff, GripVertical, Lasso, Menu, MessageSquareText, MousePointerClick, Move, Scan, Tag, Target, Timer, ZoomIn,
  type LucideIcon,
} from 'lucide-react';
import type { InteractionDemoFixture } from './interaction-demo-data';

/*
 * The model of the interactive data report, with no React in it:
 *   1. sentences, presets, and sections, and the builders that write them;
 *   2. the data rows a sentence or a chart state points at, and the match between them;
 *   3. the agent's wire format, and how an answer becomes sentences.
 * A sentence is its text and the chart update it carries. Nothing else is stored.
 */

/* ======================================================================================
 * 1. Sentences, presets, sections
 * ====================================================================================== */

export type Selector = Record<string, unknown>;
export type Domain = [number, number];
export type ViewportAxes = 'x' | 'y' | 'xy';

/** A span of report text bound to one chart update: the ops are the sentence. */
export interface Sentence {
  id: string;
  text: string;
  /** Renderer-neutral update JSON, applied together as one retained ChartUpdate. */
  ops: ChartUpdateOp[];
}

/** Plain text between sentences, or a bound sentence. */
export type ReportPart = string | Sentence;
export type Paragraph = ReportPart[];

/** One chat message, from the user or the agent, as paragraphs of bound sentences and plain text. */
export interface Message {
  from: 'user' | 'agent';
  paragraphs: Paragraph[];
}

/** The update op an interaction preset produces, and the kind of op a sentence carries. */
export type PresetOp = 'set-style' | 'set-viewport' | 'set-order' | 'set-annotation';

export interface Preset {
  op: PresetOp;
  /** Gesture label and icon, shared with the interaction gallery. */
  label: string;
  icon: LucideIcon;
  def: CanvasInteractionDef;
}

/** One chart with the interactions it hosts and the paragraphs written about it. */
export interface SectionSpec {
  id: string;
  title: string;
  lede: string;
  fixture: InteractionDemoFixture;
  presets: Preset[];
  paragraphs: Paragraph[];
}

/** A short name for each update op, for the chips. */
export const OPS: Record<PresetOp, { title: string; description: string }> = {
  'set-style': { title: 'Emphasis', description: 'Emphasizes the rows it names and mutes the rest.' },
  'set-viewport': { title: 'Viewport', description: 'Sets the visible domain on x, y, or both.' },
  'set-order': { title: 'Order', description: 'Sets the category order along an axis.' },
  'set-annotation': { title: 'Annotation', description: 'Attaches a note to one data key.' },
};

/** CSS hook for an op: `idr-op-style`, `idr-op-viewport`, and so on. */
export const opClass = (op: PresetOp): string => `idr-op-${op.slice('set-'.length)}`;

export const isSentence = (part: ReportPart): part is Sentence => typeof part !== 'string';

export const sentencesOf = (paragraphs: readonly Paragraph[]): Sentence[] => paragraphs.flat().filter(isSentence);

/** A clause out of a longer text becomes a sentence of its own: a capital and a full stop. */
export function asSentence(text: string): string {
  const trimmed = text.trim().replace(/^[\s,;:.]+/, '').replace(/[,;:]$/, '');
  const capital = trimmed.charAt(0).toUpperCase() + trimmed.slice(1);
  return /[.!?]$/.test(capital) ? capital : `${capital}.`;
}

/* ---------- ops: a sentence carries any number, applied in the order listed ---------- */

const EMPHASIS = { state: 'emphasized', mutedOpacity: 0.25 } as const;

/** Emphasizes the rows the selectors name and mutes the rest. */
export const emphasis = (...match: Selector[]): ChartUpdateOp =>
  ({ op: 'set-style', targets: match.map((key) => ({ select: { key } })), value: EMPHASIS });
/** Attaches a note to one data key. The key must resolve to exactly one element. */
export const note = (match: Selector, text: string): ChartUpdateOp =>
  ({ op: 'set-annotation', target: { select: { key: match } }, value: { text } });
/** Sets the visible domain on x, y, or both. */
export const view = (range: { x?: Domain; y?: Domain }): ChartUpdateOp => ({
  op: 'set-viewport',
  axes: range.x && range.y ? 'xy' : range.x ? 'x' : 'y',
  value: { ...(range.x ? { x: range.x } : {}), ...(range.y ? { y: range.y } : {}) },
});
/** Restores the full domain on the axes given. */
export const fullView = (axes: ViewportAxes): ChartUpdateOp => ({ op: 'set-viewport', axes, value: {} });

/** A sentence: its text and the ops it carries. */
export const sentence = (id: string, text: string, ...ops: ChartUpdateOp[]): Sentence => ({ id, text, ops });

export const preset = (op: PresetOp, label: string, icon: LucideIcon, def: CanvasInteractionDef): Preset =>
  ({ op, label, icon, def });

/* ---------- the presets a chart can host ---------- */

function encodedField(input: ChartAssemblyInput, channel: string): string | undefined {
  const encodings = ((input.chart_spec as { encodings?: unknown }).encodings ?? {}) as Record<string, unknown>;
  const encoding = encodings[channel];
  if (typeof encoding === 'string') return encoding;
  const named = encoding as { field?: unknown } | undefined;
  return typeof named?.field === 'string' ? named.field : undefined;
}


/** Flint semantic types that make a column a measure; every other column is discrete. */
const QUANTITATIVE_TYPES = new Set([
  'Quantity', 'Count', 'Amount', 'Price', 'Percentage', 'Temperature', 'Profit', 'PercentageChange',
  'Sentiment', 'Correlation', 'Rank', 'Score', 'Number', 'Currency',
]);

/** One interaction the reader can mount on a chart. */
export interface PresetOption {
  /** The interaction id, unique on the chart, and the id of the preset it makes. */
  id: string;
  op: PresetOp;
  label: string;
  icon: LucideIcon;
  make: () => CanvasInteractionDef;
}

interface ChartSemantics {
  navigationAxes: readonly ('x' | 'y')[];
  reorderAxes: readonly { axis: 'x' | 'y'; field: string }[];
}

function semanticsOf(fixture: InteractionDemoFixture): ChartSemantics {
  try {
    const spec = assembleVegaLite(fixture.input) as { _interactionSemantics?: Partial<ChartSemantics> };
    return { navigationAxes: spec._interactionSemantics?.navigationAxes ?? [], reorderAxes: spec._interactionSemantics?.reorderAxes ?? [] };
  } catch {
    return { navigationAxes: [], reorderAxes: [] };
  }
}

/**
 * The interactions that fit a chart: point gestures on every chart, a legend gesture when
 * the color is discrete, navigation when an axis can pan, reorder when an axis is nominal.
 * Section content picks its starting presets from here by id.
 */
export function presetCatalog(fixture: InteractionDemoFixture): PresetOption[] {
  const input = fixture.input;
  const types = (input.semantic_types ?? {}) as Record<string, string>;
  const chartType = (input.chart_spec as { chartType: string }).chartType;
  const discrete = (field: string | undefined): field is string =>
    field !== undefined && field in types && !QUANTITATIVE_TYPES.has(types[field]);
  const [x, y, color] = ['x', 'y', 'color'].map((channel) => encodedField(input, channel));
  const group = discrete(color) ? color : undefined;
  const axisField = chartType === 'Line Chart' ? undefined : discrete(y) ? y : discrete(x) ? x : undefined;
  const semantics = semanticsOf(fixture);
  const reorder = semantics.reorderAxes.find((axis) => axis.field === axisField) ?? semantics.reorderAxes[0];
  const options: PresetOption[] = [
    { id: 'focus', op: 'set-style', label: 'Click highlight', icon: MousePointerClick, make: () => clickHighlight({ id: 'focus', targets: group ? ['mark', 'legend'] : ['mark'] }) },
    { id: 'hold', op: 'set-style', label: 'Long press', icon: Timer, make: () => longPress({ id: 'hold' }) },
    { id: 'drill', op: 'set-style', label: 'Double click', icon: MousePointerClick, make: () => doubleActivate({ id: 'drill' }) },
    { id: 'context', op: 'set-style', label: 'Context menu', icon: Menu, make: () => contextActivate({ id: 'context' }) },
  ];
  if (axisField) options.push({ id: 'axis', op: 'set-style', label: 'Axis label click', icon: Tag, make: () => axisHighlight({ id: 'axis' }) });
  if (group) options.push({ id: 'group-hover', op: 'set-style', label: 'Hover group focus', icon: Target, make: () => hoverGroupFocus({ id: 'group-hover', groupBy: group }) });
  options.push({ id: 'select', op: 'set-style', label: 'Select', icon: Scan, make: () => select({ id: 'select' }) });
  if (chartType === 'Scatter Plot') options.push({ id: 'lasso', op: 'set-style', label: 'Lasso', icon: Lasso, make: () => lassoSelect({ id: 'lasso' }) });
  if (semantics.navigationAxes.length > 0) {
    const axes = semantics.navigationAxes.includes('x') ? 'x' : 'y';
    options.push({ id: 'navigate', op: 'set-viewport', label: 'Pan & zoom', icon: Move, make: () => navigate({ id: 'navigate' }) });
    options.push({ id: 'zoom', op: 'set-viewport', label: 'Brush zoom', icon: ZoomIn, make: () => brushZoom({ id: 'zoom', axes }) });
  }
  if (reorder) options.push({ id: 'reorder', op: 'set-order', label: 'Drag reorder', icon: GripVertical, make: () => dragReorder({ id: 'reorder' }) });
  if (group) options.push({ id: 'legend', op: 'set-style', label: 'Legend toggle', icon: EyeOff, make: () => legendToggle({ id: 'legend' }) });
  options.push({ id: 'annotate', op: 'set-annotation', label: 'Annotate', icon: MessageSquareText, make: () => clickAnnotate({ id: 'annotate' }) });
  return options;
}

/** A plain drag pans when navigation is mounted, so the drag-to-select gestures cannot share the chart with it. */
const DRAG_REGION = new Set(['select', 'lasso', 'zoom']);

/** The options that can still join the mounted presets without a gesture conflict. */
export function availablePresets(options: readonly PresetOption[], mounted: readonly Preset[]): PresetOption[] {
  const ids = new Set(mounted.map((entry) => entry.def.id));
  return options.filter((option) => {
    if (ids.has(option.id)) return false;
    if (option.id === 'navigate') return ![...ids].some((id) => DRAG_REGION.has(id));
    if (DRAG_REGION.has(option.id)) return !ids.has('navigate');
    return true;
  });
}

/** The preset an option mounts. */
export const presetOf = (option: PresetOption): Preset => preset(option.op, option.label, option.icon, option.make());

/** The kinds of op a sentence carries, in order and without repeats, for its chips. */
export function sentenceOps(item: Sentence): PresetOp[] {
  const kinds: PresetOp[] = [];
  for (const { op } of item.ops) {
    const kind: PresetOp = op === 'set-viewport' || op === 'set-order' || op === 'set-annotation' ? op : 'set-style';
    if (!kinds.includes(kind)) kinds.push(kind);
  }
  return kinds.length > 0 ? kinds : ['set-style'];
}

/** A chart fixture from rows and a chart spec, as the interaction demos define them. */
export function makeFixture(
  id: string,
  title: string,
  source: string,
  chartType: string,
  values: Record<string, unknown>[],
  semanticTypes: Record<string, string>,
  encodings: Record<string, unknown>,
  chartProperties?: Record<string, unknown>,
  baseSize = { width: 430, height: 270 },
): InteractionDemoFixture {
  return {
    id,
    title,
    source,
    input: {
      data: { values },
      semantic_types: semanticTypes,
      chart_spec: { chartType, title, encodings, baseSize, chartProperties },
    } as ChartAssemblyInput,
  };
}

/* ======================================================================================
 * 2. Rows: what a sentence and a chart state point at, and how well they match
 * ====================================================================================== */

export type Row = Record<string, unknown>;
/** Row identities, see `rowId`. */
export type RowSet = Set<string>;
export type MatchLevel = 'full' | 'partial' | null;

export function numeric(value: unknown): unknown {
  return value instanceof Date ? value.getTime() : value;
}

/** A date may arrive as a Date, a timestamp, or the source text; all three name the same day. */
export function sameValue(left: unknown, right: unknown): boolean {
  const a = numeric(left);
  const b = numeric(right);
  if (Object.is(a, b)) return true;
  if (typeof a === 'number' && typeof b === 'number') return a === b;
  if (typeof a === 'number' && typeof b === 'string') return Date.parse(b) === a;
  if (typeof a === 'string' && typeof b === 'number') return Date.parse(a) === b;
  return false;
}

/** Text against a number or a date, as a model writes values: "84.2" matches 84.2. */
export function looseEqual(left: unknown, right: unknown): boolean {
  return sameValue(left, right) || String(left).trim().toLowerCase() === String(right).trim().toLowerCase();
}

/** A number for a range test. A Date, or a date string, becomes its timestamp. */
export function asNumber(value: unknown): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const direct = Number(value);
    return Number.isFinite(direct) ? direct : Date.parse(value);
  }
  return NaN;
}

/** One identity for a row, whichever object carries it. Dates and timestamps agree. */
export function rowId(row: Row): string {
  return JSON.stringify(Object.keys(row).sort().map((key) => [key, numeric(row[key])]));
}

export function rowMatches(row: Row, selector: Selector): boolean {
  return Object.entries(selector).every(([field, expected]) => sameValue(row[field], expected));
}

/** The rows of a chart and the fields on its position axes. */
export interface ChartRows {
  rows: Row[];
  x?: string;
  y?: string;
}

export function chartRows(input: ChartAssemblyInput): ChartRows {
  const rows = ((input.data as { values?: unknown }).values ?? []) as Row[];
  return { rows, x: encodedField(input, 'x'), y: encodedField(input, 'y') };
}

/**
 * Rows an element stands for. Source records when the chart knows them; otherwise the
 * element's value acts as a selector over the chart's rows. A legend entry selects its
 * series, and a mark's channel values select the row that carries them.
 */
export function elementRows(element: SemanticElement, chart: ChartRows): Row[] {
  if (element.records?.length) return [...element.records];
  const legend = element.value as { field?: unknown; domain?: { kind?: string; value?: unknown } };
  const selector: Selector = typeof legend.field === 'string' && legend.domain?.kind === 'value'
    ? { [legend.field]: legend.domain.value }
    : element.value;
  const rows = chart.rows.filter((row) => rowMatches(row, selector));
  return rows.length > 0 ? rows : [element.value];
}

/** The identities of the rows a set of elements stands for. */
export function rowsOf(elements: readonly SemanticElement[], chart: ChartRows): RowSet {
  return new Set(elements.flatMap((element) => elementRows(element, chart)).map(rowId));
}

const cleanRow = (row: Row): Row => Object.fromEntries(Object.entries(row).filter(([field]) => !field.startsWith('__')));

/** The source rows behind a set of elements, once each and without render fields: what leaves the chart. */
export function recordsOf(elements: readonly SemanticElement[], chart: ChartRows): Row[] {
  const seen = new Set<string>();
  const records: Row[] = [];
  for (const element of elements) {
    for (const row of elementRows(element, chart)) {
      const id = rowId(row);
      if (seen.has(id)) continue;
      seen.add(id);
      records.push(cleanRow(row));
    }
  }
  return records;
}

const toDomain = (value: UpdateDomain | undefined): Domain | undefined => {
  if (!value) return undefined;
  const [start, end] = [asNumber(value[0]), asNumber(value[1])];
  return Number.isFinite(start) && Number.isFinite(end) ? [Math.min(start, end), Math.max(start, end)] : undefined;
};

/** The rows inside a viewport. An axis without a domain, or without a field, keeps every row. */
export function rowsInView(chart: ChartRows, viewportRange: { x?: Domain; y?: Domain }): Row[] {
  const within = (row: Row, field: string | undefined, domain: Domain | undefined): boolean => {
    if (!field || !domain) return true;
    const value = asNumber(row[field]);
    return Number.isFinite(value) && value >= domain[0] && value <= domain[1];
  };
  return chart.rows.filter((row) => within(row, chart.x, viewportRange.x) && within(row, chart.y, viewportRange.y));
}

function targetRows(target: UpdateTarget, chart: ChartRows): Row[] {
  return 'select' in target
    ? chart.rows.filter((row) => rowMatches(row, target.select.key))
    : target.elements.flatMap((element) => elementRows(element, chart));
}

/** The rows a sentence points at: the rows its targets name, plus the rows inside its viewport. */
export function sentenceRows(item: Sentence, chart: ChartRows): RowSet {
  const rows: Row[] = [];
  for (const op of item.ops) {
    if (op.op === 'set-style') for (const target of op.targets) rows.push(...targetRows(target, chart));
    else if (op.op === 'set-annotation') rows.push(...targetRows(op.target, chart));
    else if (op.op === 'set-viewport') rows.push(...rowsInView(chart, { x: toDomain(op.value.x), y: toDomain(op.value.y) }));
  }
  return new Set(rows.map(rowId));
}

/** Rows in common over rows in either set. Two empty sets share nothing. */
export function overlap(a: RowSet, b: RowSet): number {
  if (a.size === 0 || b.size === 0) return 0;
  let shared = 0;
  for (const id of a) if (b.has(id)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** The same rows on both sides is a full match; any row in common is a partial one. */
export function levelOf(ratio: number): MatchLevel {
  return ratio >= 1 ? 'full' : ratio > 0 ? 'partial' : null;
}

/* ======================================================================================
 * 3. The agent: what it may say about a chart, and how its answer becomes sentences
 * ====================================================================================== */

/*
 * The model cannot write `select.key` selectors: a strict response schema has no room for
 * free-form objects. So it writes where-clauses as lists of field/value pairs, and the
 * page resolves them against the chart's own rows into selectors on the key fields. That
 * is the only place the agent's vocabulary differs from the report's.
 */


/** What the agent needs to know about a chart to bind sentences to it. */
export interface AgentChart {
  rows: Row[];
  columns: string[];
  /** The fields that identify one mark, the target of an emphasis. */
  keyFields: string[];
  /** The fields that identify one element for a note; adds the color field when it is discrete. */
  annotationFields: string[];
  /** Axes a viewport op can set: empty unless a navigation preset is mounted. */
  viewportAxes: readonly ('x' | 'y')[];
}

function navigationAxesOf(fixture: InteractionDemoFixture): readonly ('x' | 'y')[] {
  try {
    const spec = assembleVegaLite(fixture.input) as { _interactionSemantics?: { navigationAxes?: readonly ('x' | 'y')[] } };
    return spec._interactionSemantics?.navigationAxes ?? [];
  } catch {
    return [];
  }
}

/** The agent's view of a section's chart, derived from the fixture and the mounted presets. */
export function agentChartOf(fixture: InteractionDemoFixture, presets: readonly Preset[]): AgentChart {
  const input = fixture.input;
  const types = (input.semantic_types ?? {}) as Record<string, string>;
  const chartType = (input.chart_spec as { chartType: string }).chartType;
  const discrete = (field: string | undefined): field is string =>
    field !== undefined && field in types && !QUANTITATIVE_TYPES.has(types[field]);
  const [x, y, color, detail] = ['x', 'y', 'color', 'detail'].map((channel) => encodedField(input, channel));
  let keyFields: string[] = [];
  if (chartType === 'Line Chart') keyFields = discrete(color) ? [color] : [];
  else if (discrete(detail)) keyFields = [detail];
  else keyFields = [x, y].filter(discrete);
  if (keyFields.length === 0 && discrete(color)) keyFields = [color];
  const annotationFields = discrete(color) && !keyFields.includes(color) ? [...keyFields, color] : keyFields;
  return {
    rows: chartRows(input).rows,
    columns: Object.keys(types),
    keyFields,
    annotationFields,
    viewportAxes: presets.some((entry) => entry.op === 'set-viewport') ? navigationAxesOf(fixture) : [],
  };
}

export type AgentOpKind = 'highlight' | 'annotate' | 'viewport';

/** One update as the model writes it. */
export interface AgentUpdate {
  op: AgentOpKind;
  /** Records the update is about; each is a list of field/value pairs it must match. */
  records: { pairs: { field: string; value: string }[] }[];
  /** The note, for annotate. */
  text: string | null;
  /** [min, max] domains, for viewport. */
  x: number[] | null;
  y: number[] | null;
}

/** One part of an answer as the model writes it: text, the chart it speaks about, and its updates. */
export interface AgentPart {
  text: string;
  /** The id of the chart the updates apply to; null when there are none, or when the page has one chart. */
  chart: string | null;
  updates: AgentUpdate[];
}

const RECORDS_SCHEMA = {
  type: 'array',
  description: 'Records the update is about, for highlight and annotate. Each record is a list of column/value pairs that it must match. Empty for viewport.',
  items: {
    type: 'object',
    additionalProperties: false,
    required: ['pairs'],
    properties: {
      pairs: {
        type: 'array',
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['field', 'value'],
          properties: { field: { type: 'string' }, value: { type: 'string' } },
        },
      },
    },
  },
};

/** The strict schema of one update. */
export const UPDATE_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['op', 'records', 'text', 'x', 'y'],
  properties: {
    op: { type: 'string', enum: ['highlight', 'annotate', 'viewport'] },
    records: RECORDS_SCHEMA,
    text: { type: ['string', 'null'], description: 'Annotation label for annotate, under 40 characters. Null otherwise.' },
    x: { type: ['array', 'null'], items: { type: 'number' }, description: '[min, max] x domain for viewport. Null otherwise.' },
    y: { type: ['array', 'null'], items: { type: 'number' }, description: '[min, max] y domain for viewport. Null otherwise.' },
  },
};

/**
 * The strict schema of an answer: parts in reading order, each with zero or more updates.
 * With `withChart`, a part also names the chart its updates apply to.
 */
export function answerSchema(name: string, withChart: boolean): Record<string, unknown> {
  return {
    type: 'json_schema',
    json_schema: {
      name,
      strict: true,
      schema: {
        type: 'object',
        additionalProperties: false,
        required: ['parts'],
        properties: {
          parts: {
            type: 'array',
            description: 'The answer in reading order. Concatenated, the texts form plain sentences without markdown. Use "\\n\\n" inside a text to start a new paragraph.',
            items: {
              type: 'object',
              additionalProperties: false,
              required: withChart ? ['text', 'chart', 'updates'] : ['text', 'updates'],
              properties: {
                text: { type: 'string' },
                ...(withChart ? { chart: { type: ['string', 'null'], description: 'The id of the chart the updates apply to. Null when updates is empty.' } } : {}),
                updates: {
                  type: 'array',
                  description: 'The updates the sentence carries, applied together on the chart. Usually one; a highlight and an annotation on the same records is a common pair. Empty for connecting words and general statements.',
                  items: UPDATE_SCHEMA,
                },
              },
            },
          },
        },
      },
    },
  };
}

/** The rules every agent gets on how to shape an answer. */
export const ANSWER_RULES = [
  'Answer as JSON with an ordered list of parts. Read together, the texts form two to five plain sentences without markdown.',
  'A part whose text makes a claim about specific records or a visible range carries one or more updates, so the reader can hover that sentence to see it on the chart. A highlight and an annotation on the same records may go together. Keep such a part to the clause the reader can point at, and give each claim its own part.',
  'Connecting words and general statements are parts with an empty updates list. Only use the update abilities the context lists. Where-clauses use column names and values exactly as in the chart\'s rows, as strings.',
];

/** The abilities line for one chart, as the context tells the model. */
export function abilitiesText(chart: AgentChart): string {
  const abilities = [`highlight and annotate take where-clauses on these columns: ${chart.columns.join(', ')}`];
  if (chart.viewportAxes.length > 0) abilities.push(`viewport takes numeric [min, max] domains for: ${chart.viewportAxes.join(', ')}`);
  return abilities.join('; ');
}

function normalizePart(raw: { text?: unknown; chart?: unknown; updates?: unknown }): AgentPart {
  return {
    text: String(raw.text ?? ''),
    chart: typeof raw.chart === 'string' ? raw.chart : null,
    updates: Array.isArray(raw.updates) ? (raw.updates as AgentUpdate[]) : [],
  };
}

/** The parts of a complete answer, whatever shape the model gave them. */
export function parseParts(content: string): AgentPart[] {
  const parsed = JSON.parse(content) as { parts?: unknown };
  return (Array.isArray(parsed.parts) ? parsed.parts : [])
    .filter((raw): raw is { text: unknown } => typeof raw === 'object' && raw !== null && 'text' in raw)
    .map(normalizePart);
}

/**
 * The complete parts inside a partial JSON answer while it streams, so the sentences
 * appear one by one. A part still being written is left out.
 */
export function extractParts(partial: string): AgentPart[] {
  const start = partial.indexOf('"parts"');
  if (start === -1) return [];
  const open = partial.indexOf('[', start);
  if (open === -1) return [];
  const parts: AgentPart[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let objectStart = -1;
  for (let index = open + 1; index < partial.length; index += 1) {
    const char = partial[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') { inString = true; continue; }
    if (char === '{') {
      if (depth === 0) objectStart = index;
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0 && objectStart !== -1) {
        try {
          const raw = JSON.parse(partial.slice(objectStart, index + 1)) as { text?: unknown };
          if (typeof raw.text === 'string') parts.push(normalizePart(raw));
        } catch {
          // An incomplete part is skipped until more text arrives.
        }
        objectStart = -1;
      }
    } else if (char === ']' && depth === 0) {
      break;
    }
  }
  return parts;
}

/** The model sometimes runs two parts together; a space goes between them. */
export function leadFor(previous: string | undefined, text: string): string {
  if (!previous || /\s$/.test(previous) || /^[\s.,;:!?)]/.test(text)) return '';
  return /[.!?]$/.test(previous) ? ' ' : '';
}

function isDomain(value: unknown): value is Domain {
  return Array.isArray(value) && value.length === 2 && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry));
}

/** Selectors on the given fields for the rows any where-clause of the update names, once each. */
function selectorsFor(update: AgentUpdate, chart: AgentChart, fields: readonly string[]): Selector[] {
  const clauses = (update.records ?? [])
    .map((record) => Object.fromEntries((record.pairs ?? []).map((pair) => [pair.field, pair.value])))
    .filter((clause) => Object.keys(clause).length > 0);
  const matched = chart.rows.filter((row) => clauses.some((clause) =>
    Object.entries(clause).every(([field, value]) => field in row && looseEqual(row[field], value))));
  const seen = new Map<string, Selector>();
  for (const row of matched) {
    const selector = Object.fromEntries(fields.map((field) => [field, row[field]]));
    seen.set(JSON.stringify(selector), selector);
  }
  return [...seen.values()];
}

/**
 * The sentence for one part of an answer. Each update becomes the op the report would
 * write itself: a highlight is an emphasis, an annotate is a note (with an emphasis on its
 * key when no highlight accompanies it), a viewport is a view. Null when no update names
 * anything the chart shows.
 */
export function toSentence(id: string, text: string, updates: readonly AgentUpdate[], chart: AgentChart): Sentence | null {
  const ops: ChartUpdateOp[] = [];
  for (const update of updates) {
    switch (update.op) {
      case 'highlight': {
        const selectors = selectorsFor(update, chart, chart.keyFields);
        if (selectors.length > 0) ops.push(emphasis(...selectors));
        break;
      }
      case 'annotate': {
        const [selector] = selectorsFor(update, chart, chart.annotationFields);
        if (!selector) break;
        ops.push(note(selector, String(update.text ?? '').slice(0, 80) || text.trim().slice(0, 40)));
        if (!updates.some((other) => other.op === 'highlight')) ops.push(emphasis(selector));
        break;
      }
      case 'viewport': {
        if (chart.viewportAxes.length === 0) break;
        const range: { x?: Domain; y?: Domain } = {};
        if (isDomain(update.x) && chart.viewportAxes.includes('x')) range.x = update.x;
        if (isDomain(update.y) && chart.viewportAxes.includes('y')) range.y = update.y;
        ops.push(range.x || range.y ? view(range) : fullView(chart.viewportAxes.length === 2 ? 'xy' : chart.viewportAxes[0]));
        break;
      }
      default:
        break;
    }
  }
  return ops.length > 0 ? sentence(id, text.trim(), ...ops) : null;
}

/**
 * An answer as paragraphs of report parts: a part with updates that resolve becomes a
 * sentence, any other part stays plain text. A "\n\n" inside a text starts a paragraph.
 */
export function toParagraphs(parts: readonly AgentPart[], idPrefix: string, chart: AgentChart): Paragraph[] {
  const paragraphs: Paragraph[] = [[]];
  parts.forEach((part, index) => {
    const lead = leadFor(parts[index - 1]?.text, part.text);
    part.text.split(/\n{2,}/).forEach((text, pieceIndex) => {
      if (pieceIndex > 0) paragraphs.push([]);
      if (text.length === 0) return;
      const current = paragraphs[paragraphs.length - 1];
      const bound = pieceIndex === 0 && part.updates.length > 0 ? toSentence(`${idPrefix}-${index}`, text, part.updates, chart) : null;
      if (lead && pieceIndex === 0) current.push(lead);
      current.push(bound ?? text);
    });
  });
  return paragraphs.filter((paragraph) => paragraph.length > 0);
}

/**
 * The selection as a sentence, so a question can carry what it was about: the records the
 * chart pointed at when it went out, named by the key field and bound as an emphasis.
 */
export function selectionSentence(id: string, selected: readonly Row[], chart: AgentChart): Sentence | null {
  if (selected.length === 0 || chart.keyFields.length === 0) return null;
  const seen = new Map<string, Selector>();
  for (const row of selected) {
    const selector = Object.fromEntries(chart.keyFields.map((field) => [field, row[field]]));
    seen.set(JSON.stringify(selector), selector);
  }
  const selectors = [...seen.values()];
  const names = selectors.map((selector) => String(selector[chart.keyFields[0]]));
  const shown = names.length > 4 ? `${names.slice(0, 3).join(', ')}, and ${names.length - 3} more` : names.join(', ');
  return sentence(id, `${shown} selected`, emphasis(...selectors));
}

/** The plain text of an answer, as it goes into the chat history. */
export const paragraphsText = (paragraphs: readonly Paragraph[]): string =>
  paragraphs.map((paragraph) => paragraph.map((part) => (isSentence(part) ? part.text : part)).join('')).join('\n\n');
