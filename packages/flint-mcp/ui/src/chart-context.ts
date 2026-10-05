import type { ChartAssemblyInput } from 'flint-chart';
import type { ChartChange, ChartState, DomainCoordinate, SemanticElement } from 'flint-chart/interactive';

/** The most marks the context names one by one; the text then says how many more there are. */
export const MARK_LIMIT = 20;

type Row = Record<string, unknown>;

/** The committed gesture a change came from: its action and the domain it drew. */
export type ChartGesture = Pick<ChartChange, 'action' | 'geometry'>;

export interface ChartContext {
  /** The state as text for the model: what is emphasized, in field terms, what is hidden, and what the axes show. */
  text: string;
  /** The same state as data, for a host that reads the structured content. */
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

function encodedField(input: ChartAssemblyInput, channel: 'x' | 'y'): string | undefined {
  const encoding = input.chart_spec.encodings?.[channel];
  const first = Array.isArray(encoding) ? encoding[0] : encoding;
  return typeof first === 'string' ? first : first?.field;
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

/** The value of each mark, without the runtime's `__` fields. */
function valuesOf(elements: readonly SemanticElement[]): Row[] {
  return elements.map((element) =>
    Object.fromEntries(Object.entries(element.value).filter(([field]) => !field.startsWith('__'))));
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

/**
 * The chart state for the model, in field terms. The agent owns the data, so the
 * context says which marks are emphasized and what range or value they share;
 * the agent queries its own rows from that.
 */
export function chartContext(state: ChartState, input: ChartAssemblyInput, gesture?: ChartGesture): ChartContext {
  const chart = `chart "${input.chart_spec.title ?? input.chart_spec.chartType}"`;
  const dataRows = (input.data.values ?? []) as Row[];
  const values = valuesOf(state.selected);
  const hidden = state.hidden ?? [];
  const lines: string[] = [];

  if (values.length === 0) {
    lines.push(`Nothing is emphasized on ${chart}.`);
  } else {
    const marks = plural(values.length, 'mark');
    const shared = values.length > 1 ? sharedFields(values) : values[0];
    const where = regionText(gesture, input) ?? (Object.keys(shared).length > 0 ? pairs(shared) : undefined);
    if (where) {
      lines.push(`The ${chart} emphasizes ${marks} where ${where}.`);
    } else {
      const listed = values.slice(0, MARK_LIMIT);
      lines.push(`The ${chart} emphasizes ${marks}:`, ...listed.map((value) => `- ${pairs(value)}`));
      if (values.length > listed.length) lines.push(`… and ${plural(values.length - listed.length, 'more mark')}.`);
    }
  }
  if (hidden.length > 0) lines.push(`Hidden: ${hidden.map((value) => cell(value.value)).join(', ')}.`);
  for (const axis of ['x', 'y'] as const) {
    const text = axisText(axis, state.viewport?.[axis], dataRows, input);
    if (text) lines.push(text);
  }

  return {
    text: lines.join('\n'),
    data: { selected: values, hidden, viewport: state.viewport },
  };
}

export function chartContextText(state: ChartState, input: ChartAssemblyInput, gesture?: ChartGesture): string {
  return chartContext(state, input, gesture).text;
}

export function chartContextData(state: ChartState, input: ChartAssemblyInput, gesture?: ChartGesture): Record<string, unknown> {
  return chartContext(state, input, gesture).data;
}
