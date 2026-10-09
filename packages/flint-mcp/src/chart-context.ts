import type { ChartAssemblyInput, ChartUpdate, ChartUpdateOp, ChartWarning, PivotSurface, UpdateCheck, UpdateOpCheck } from 'flint-chart';
import type { ChartChange, ChartState, DomainCoordinate, SemanticElement } from 'flint-chart/interactive';

/** The most marks the context names one by one; the text then says how many more there are. */
export const MARK_LIMIT = 20;

type Row = Record<string, unknown>;
type Annotation = NonNullable<ChartState['annotations']>[number];
type Filter = NonNullable<ChartState['filters']>[string];

/** The committed gesture a change came from: its action and the domain it drew. */
export type ChartGesture = Pick<ChartChange, 'action' | 'geometry'>;

/** The chart type and arrangement a spec draws, after the panel's transform controls. */
export interface ChartView {
  chartType: string;
  /** The arrangement, when it is not the default one. */
  arrange?: string;
}

/** The view of a spec from its transform surface (`getChartTransform`); without one, the authored chart type. */
export function chartView(
  input: ChartAssemblyInput,
  transform?: { chartType?: PivotSurface; arrange?: PivotSurface },
): ChartView {
  const type = transform?.chartType;
  const arrange = transform?.arrange;
  return {
    chartType: type?.labels[type.index] ?? input.chart_spec.chartType,
    ...(arrange && arrange.index > 0 ? { arrange: arrange.labels[arrange.index] } : {}),
  };
}

/** The `chartProperties` keys the transform controls write; the view reports them. */
const VIEW_KEYS = new Set(['chartType', 'arrange', 'pivot']);

export interface ChartContextSource {
  /** What the drawn chart holds; absent before it is drawn, when the report is the checks alone. */
  state?: ChartState;
  /** The spec the agent sent. */
  agent: ChartAssemblyInput;
  /** The spec the chart shows: the agent's, with the reader's panel edits. */
  shown: ChartAssemblyInput;
  agentView?: ChartView;
  shownView?: ChartView;
  /** The agent's updates. */
  updates?: readonly ChartUpdate[];
  /** What each update will do on `shown`: `validateChart(shown, 'vegalite', { updates }).updates`. */
  checks?: readonly UpdateCheck[];
  /** On a drawn chart, an update warning carrying `update` marks the ops the chart left out. */
  warnings?: readonly ChartWarning[];
  /** The updates the drawn chart mounted with, whose outcome `warnings` reports; others fall back to `checks`. */
  drawnUpdates?: readonly ChartUpdate[];
  /** The last committed gesture of each reader interaction, by interaction id. */
  gestures?: ReadonlyMap<string, ChartGesture>;
}

export interface ChartContext {
  /** What the chart shows now, as text for the model. */
  text: string;
  /** The same, as data, for a host that reads the structured content. */
  data: Record<string, unknown>;
}

function cell(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const range = value as { start?: unknown; end?: unknown };
    if ('start' in range && 'end' in range) return `${bound(range.start)} to ${bound(range.end)}`;
    return JSON.stringify(value);
  }
  return String(value).replace(/\s+/g, ' ');
}

function bound(value: unknown): string {
  return typeof value === 'number' ? String(Number(value.toPrecision(6))) : cell(value);
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function same(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

function fieldsOf(encoding: ChartAssemblyInput['chart_spec']['encodings'][string] | undefined): string[] {
  const items = Array.isArray(encoding) ? encoding : encoding === undefined ? [] : [encoding];
  return items
    .map((item) => (typeof item === 'string' ? item : item.field ?? item.aggregate))
    .filter((field): field is string => field !== undefined);
}

function encodedField(input: ChartAssemblyInput, channel: 'x' | 'y'): string | undefined {
  return fieldsOf(input.chart_spec.encodings?.[channel])[0];
}

function themeName(input: ChartAssemblyInput): string {
  const theme = input.theme_spec;
  if (theme === undefined) return 'default';
  if (typeof theme === 'string') return theme;
  if (theme.extends) return `${theme.extends} (customized)`;
  return theme.id ?? 'custom';
}

function encodingsText(input: ChartAssemblyInput): string {
  return Object.entries(input.chart_spec.encodings ?? {})
    .map(([channel, encoding]) => `${channel} = ${fieldsOf(encoding).join(' + ') || '(none)'}`)
    .join(', ');
}

/** What the reader changed in the panel: the main fields by value, the rest as a count of options. */
function panelEdits(agent: ChartAssemblyInput, shown: ChartAssemblyInput, agentView: ChartView, shownView: ChartView): string[] {
  const from = agent.chart_spec;
  const to = shown.chart_spec;
  const edits: string[] = [];
  if (agentView.chartType !== shownView.chartType) edits.push(`chart type ${agentView.chartType} → ${shownView.chartType}`);
  if (agentView.arrange !== shownView.arrange) edits.push(`view ${agentView.arrange ?? 'default'} → ${shownView.arrange ?? 'default'}`);
  if (!same(from.title, to.title)) edits.push(`title "${from.title ?? ''}" → "${to.title ?? ''}"`);
  if (!same(agent.theme_spec, shown.theme_spec)) edits.push(`theme ${themeName(agent)} → ${themeName(shown)}`);
  for (const channel of new Set([...Object.keys(from.encodings ?? {}), ...Object.keys(to.encodings ?? {})])) {
    const before = fieldsOf(from.encodings?.[channel]).join(' + ') || '(none)';
    const after = fieldsOf(to.encodings?.[channel]).join(' + ') || '(none)';
    if (before !== after) edits.push(`${channel} ${before} → ${after}`);
  }
  const options = new Set([...Object.keys(from.chartProperties ?? {}), ...Object.keys(to.chartProperties ?? {})]
    .filter((key) => !VIEW_KEYS.has(key)));
  let changed = [...options].filter((key) => !same(from.chartProperties?.[key], to.chartProperties?.[key])).length;
  for (const key of ['subtitle', 'baseSize', 'canvasSize'] as const) {
    if (!same(from[key], to[key])) changed += 1;
  }
  if (changed > 0) edits.push(`${edits.length > 0 ? 'and ' : ''}${plural(changed, 'style option')}`);
  return edits;
}

function ordinal(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') {
    const time = Date.parse(value);
    return Number.isNaN(time) ? undefined : time;
  }
  return undefined;
}

/** Whether an interval covers every value of a field, so the axis shows its whole domain. */
function coversField(rows: Row[], field: string | undefined, start: unknown, end: unknown): boolean {
  if (!field) return false;
  const low = ordinal(start);
  const high = ordinal(end);
  if (low === undefined || high === undefined) return false;
  const values = rows.map((row) => ordinal(row[field])).filter((value): value is number => value !== undefined);
  if (values.length === 0) return false;
  return Math.min(low, high) <= Math.min(...values) && Math.max(low, high) >= Math.max(...values);
}

function intervalText(field: string | undefined, axis: 'x' | 'y', coordinate: DomainCoordinate | undefined): string | undefined {
  if (coordinate?.kind !== 'interval') return undefined;
  return `${field ?? axis} from ${bound(coordinate.start)} to ${bound(coordinate.end)}`;
}

function axisText(axis: 'x' | 'y', coordinate: DomainCoordinate | undefined, rows: Row[], input: ChartAssemblyInput): string | undefined {
  if (coordinate?.kind !== 'interval') return undefined;
  const field = encodedField(input, axis);
  if (coversField(rows, field, coordinate.start, coordinate.end)) return undefined;
  return `The ${axis} axis shows ${intervalText(field, axis, coordinate)}.`;
}

/** The data's own columns, so a mark's value leaves out the fields assembly derives, such as sort indexes and stack ends. */
type Columns = ReadonlySet<string>;

function columnsOf(input: ChartAssemblyInput): Columns {
  return new Set(((input.data.values ?? []) as Row[]).flatMap((row) => Object.keys(row)));
}

/** The value of each mark in data columns; a mark with none of them, such as a histogram bin, keeps its own fields. */
function valuesOf(elements: readonly SemanticElement[], columns: Columns): Row[] {
  return elements.map((element) => {
    const own = Object.entries(element.value).filter(([field]) => !field.startsWith('__'));
    const inData = own.filter(([field]) => columns.has(field));
    return Object.fromEntries(inData.length > 0 ? inData : own);
  });
}

function pairs(value: Row): string {
  return Object.entries(value).map(([field, item]) => `${field} = ${cell(item)}`).join(', ');
}

/** The fields every mark agrees on: what a series or group click emphasized. */
function sharedFields(values: Row[]): Row {
  const [first, ...rest] = values;
  if (!first) return {};
  return Object.fromEntries(Object.entries(first).filter(([field, item]) =>
    rest.every((value) => JSON.stringify(value[field]) === JSON.stringify(item))));
}

const REGION_ACTIONS = new Set<ChartChange['action']>(['brush-x', 'brush-y', 'select-region']);

/** The range a brush drew, in the fields of the axes; only its own axis for a one-axis brush. */
function regionText(gesture: ChartGesture | undefined, input: ChartAssemblyInput): string | undefined {
  if (!gesture?.action || !REGION_ACTIONS.has(gesture.action)) return undefined;
  const plot = gesture.geometry?.plot;
  const axis = plot?.kind === 'rect' ? plot.axis : 'xy';
  const parts = (['x', 'y'] as const)
    .filter((channel) => axis === 'xy' || axis === channel)
    .map((channel) => intervalText(encodedField(input, channel), channel, gesture.geometry?.domain?.[channel]))
    .filter((part): part is string => part !== undefined);
  return parts.length > 0 ? parts.join(' and ') : undefined;
}

/** "emphasizes N marks where …", or the marks listed one per line when they share nothing. */
function emphasisLines(values: Row[], where: string | undefined): string[] {
  const marks = plural(values.length, 'mark');
  const shared = values.length > 1 ? sharedFields(values) : values[0];
  const said = where ?? (Object.keys(shared).length > 0 ? pairs(shared) : undefined);
  if (said) return [`emphasizes ${marks} where ${said}`];
  const listed = values.slice(0, MARK_LIMIT);
  const lines = [`emphasizes ${marks}:`, ...listed.map((value) => `  - ${pairs(value)}`)];
  if (values.length > listed.length) lines.push(`  … and ${plural(values.length - listed.length, 'more mark')}`);
  return lines;
}

function targetText(target: Annotation['target'], columns: Columns): string {
  if ('select' in target) return pairs(target.select.key);
  const values = valuesOf(target.elements, columns);
  const shared = values.length > 1 ? sharedFields(values) : values[0] ?? {};
  return Object.keys(shared).length > 0 ? pairs(shared) : plural(values.length, 'mark');
}

function noteText(annotation: Annotation, columns: Columns): string {
  const text = annotation.text !== undefined ? ` "${annotation.text}"` : '';
  return `note${text} at ${targetText(annotation.target, columns)}`;
}

function filterText(field: string, filter: Filter): string {
  if ('in' in filter) return `${field} in [${filter.in.map(cell).join(', ')}]`;
  return `${field} from ${bound(filter.range[0])} to ${bound(filter.range[1])}`;
}

/** The targets an op aims at, to match the ones a drawn chart could not resolve. */
function opTargets(op: ChartUpdateOp): readonly unknown[] {
  switch (op.op) {
    case 'set-style':
      return op.targets;
    case 'set-annotation':
      return [op.target];
    case 'set-freeform-overlay':
      return op.value?.body.flatMap((body) => (body.type === 'clone' ? body.targets : [])) ?? [];
    default:
      return [];
  }
}

/** Whether a drawn chart applied an op, and why not when it did not. */
function drawnOutcome(op: ChartUpdateOp, check: UpdateOpCheck, left: ChartWarning['update']): { ok: boolean; reason?: string } {
  if (!left) return { ok: true };
  if (left.unsupportedOps.includes(op.op)) return { ok: false, reason: check.reason ?? 'the chart could not apply it.' };
  const unresolved = new Set(left.unresolvedTargets.map((target) => JSON.stringify(target)));
  if (opTargets(op).some((target) => unresolved.has(JSON.stringify(target)))) {
    return { ok: false, reason: check.reason ?? 'its target matched no mark.' };
  }
  return { ok: true };
}

/** One line per op of an agent update: ✓ with what it does, or ✗ with why it did not apply. */
function updateLines(
  update: ChartUpdate,
  check: UpdateCheck | undefined,
  state: ChartState | undefined,
  drawn: boolean,
  left: ChartWarning['update'],
  columns: Columns,
): string[] {
  const lines = [`- ${update.id}:`];
  update.ops.forEach((op, index) => {
    const opCheck = check?.ops[index] ?? { op: op.op, text: op.op, ok: true };
    const outcome = drawn ? drawnOutcome(op, opCheck, left) : { ok: opCheck.ok, reason: opCheck.reason };
    let text = opCheck.text;
    let more: string[] = [];
    if (outcome.ok && state && op.op === 'set-style' && (op.value.state === 'emphasized' || op.value.state === 'focused') && op.targets.length > 0) {
      const values = valuesOf(state.entries?.get(update.id)?.elements ?? [], columns);
      if (values.length === 0) {
        outcome.ok = false;
        outcome.reason = opCheck.reason ?? 'its targets matched no mark.';
      } else {
        [text, ...more] = emphasisLines(values, undefined);
      }
    }
    lines.push(outcome.ok ? `  ✓ ${text}` : `  ✗ ${text}: ${outcome.reason}`, ...more.map((line) => `  ${line}`));
  });
  return lines;
}

/** The interaction presets the spec asks for, by type. */
function interactionsText(input: ChartAssemblyInput): string | undefined {
  const entries = (input.interaction_spec as { interactions?: readonly unknown[] } | undefined)?.interactions ?? [];
  const types = entries
    .map((entry) => (typeof entry === 'string' ? entry : (entry as { type?: unknown } | null)?.type))
    .filter((type): type is string => typeof type === 'string');
  return types.length > 0 ? types.join(', ') : undefined;
}

/**
 * What the chart shows now, for the model: which chart, what the reader changed in
 * the panel, what each of the agent's updates does, and what the reader did on the
 * chart. Each send replaces the last, so every send carries all of it.
 */
export function chartContext(source: ChartContextSource): ChartContext {
  const { agent, shown, updates = [], warnings = [], gestures } = source;
  const state = source.state;
  const checks = source.checks ?? [];
  const agentView = source.agentView ?? chartView(agent);
  const shownView = source.shownView ?? chartView(shown);
  const spec = shown.chart_spec;
  const dataRows = (shown.data.values ?? []) as Row[];
  const agentIds = new Set(updates.map((update) => update.id));
  const columns = columnsOf(shown);
  const lines: string[] = [];

  const arranged = shownView.arrange ? `, view ${shownView.arrange}` : '';
  lines.push(`Chart "${spec.title ?? shownView.chartType}": ${shownView.chartType}${arranged}, theme ${themeName(shown)}.`);
  const edits = panelEdits(agent, shown, agentView, shownView);
  if (edits.length > 0) lines.push(`Edited in panel: ${edits.join(', ')}.`);
  lines.push(`Encodings: ${encodingsText(shown)}.`);
  const interactions = interactionsText(shown);
  if (interactions) lines.push(`Interactions: ${interactions}.`);

  const leftOut = new Map(warnings.flatMap((warning) => (warning.update ? [[warning.update.id, warning.update] as const] : [])));
  const drawnKeys = new Set((source.drawnUpdates ?? []).map((update) => JSON.stringify(update)));
  if (updates.length > 0) {
    lines.push('Agent updates (yours):');
    for (const update of updates) {
      const drawn = !!state && drawnKeys.has(JSON.stringify(update));
      const check = checks.find((entry) => entry.id === update.id);
      lines.push(...updateLines(update, check, state, drawn, leftOut.get(update.id), columns));
    }
  }

  const user: string[] = [];
  const userInteractions: { id: string; marks: Row[] }[] = [];
  for (const [id, entry] of state?.entries ?? []) {
    if (agentIds.has(id) || entry.layer !== 'retained' || entry.elements.length === 0) continue;
    const values = valuesOf(entry.elements, columns);
    userInteractions.push({ id, marks: values });
    const [head, ...rest] = emphasisLines(values, regionText(gestures?.get(id), shown));
    user.push(`- ${id}: ${head}${rest.length > 0 ? '' : '.'}`, ...rest);
  }
  const userNotes = (state?.annotations ?? []).filter((annotation) => !agentIds.has(annotation.id));
  for (const annotation of userNotes) user.push(`- ${annotation.id}: ${noteText(annotation, columns)}.`);
  const hidden = state?.hidden ?? [];
  if (hidden.length > 0) user.push(`- Hidden: ${hidden.map((value) => cell(value.value)).join(', ')}.`);
  const filters = Object.entries(state?.filters ?? {});
  if (filters.length > 0) user.push(`- Filters: ${filters.map(([field, filter]) => filterText(field, filter)).join('; ')}.`);
  lines.push(user.length > 0 ? 'User interactions:' : 'User interactions: none.', ...user);

  for (const axis of ['x', 'y'] as const) {
    const text = axisText(axis, state?.viewport?.[axis], dataRows, shown);
    if (text) lines.push(text);
  }
  const shownWarnings = warnings.filter((warning) => !warning.update && warning.code !== 'update_not_applied');
  if (shownWarnings.length > 0) lines.push('Warnings:', ...shownWarnings.map((warning) => `- ${warning.message}`));

  return {
    text: lines.join('\n'),
    data: {
      chartType: shownView.chartType,
      ...(shownView.arrange ? { view: shownView.arrange } : {}),
      title: spec.title,
      theme: themeName(shown),
      encodings: Object.fromEntries(Object.entries(spec.encodings ?? {}).map(([channel, encoding]) => [channel, fieldsOf(encoding)])),
      editedInPanel: edits,
      agentUpdates: updates.map((update) => ({
        id: update.id,
        ops: checks.find((check) => check.id === update.id)?.ops ?? [],
        marks: valuesOf(state?.entries?.get(update.id)?.elements ?? [], columns),
        annotations: (state?.annotations ?? []).filter((annotation) => annotation.id === update.id),
      })),
      userInteractions,
      userAnnotations: userNotes,
      hidden,
      filters: state?.filters ?? {},
      viewport: state?.viewport,
      warnings: shownWarnings.map(({ code, message }) => ({ code, message })),
    },
  };
}
