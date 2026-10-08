import type {
    ChartUpdate,
    FilterValue,
    InteractionContext,
    SemanticElement,
} from '../core/interaction-contracts';
import type { ChartAssemblyInput } from '../core/types';
import { getVisCategory, inferVisCategory } from '../core/semantic-types';
import { normalizeAnnotation, resolveFormat } from '../core/field-semantics';
import { resolveTemporalFormat } from '../core/resolve-semantics';
import { timeFormat, utcFormat } from 'd3-time-format';
import type { ExternalInteractionDef, InteractionDef } from './interactions';
import { normalizedOpacity } from './presets/utils';

export type { FilterValue } from '../core/interaction-contracts';

/** The control a field gets. `auto` infers it from the field's semantic type and values. */
export type FilterWidget = 'auto' | 'checkboxes' | 'select' | 'range' | 'toggle';

/**
 * Where the rows of controls sit: `auto` and `bottom` under the chart, `top` above it.
 * Under 280px wide each label goes above its control. With `render: false` the host draws its own.
 */
export type FilterPlacement = 'auto' | 'top' | 'bottom';

export interface FilterFieldOptions {
    field: string;
    widget?: FilterWidget;
    /** The chip's name for the field. Defaults to the field name. */
    label?: string;
    /**
     * Whether a single-choice dropdown offers All. Defaults to true, except in `filter` mode for a
     * field the chart needs to tell its rows apart (each value is another version of the same marks,
     * such as a year or a population group): there All would draw every version at once, so the
     * field gets a dropdown that always holds one value, the first in the data unless `initial` sets it.
     */
    all?: boolean;
}

export interface FilterControlsOptions {
    id?: string;
    /**
     * The fields that get a control. Listed fields always get one. When absent, the
     * categorical, boolean, and temporal fields are chosen, up to four, skipping a
     * field another interaction already filters: the color field under `legend-toggle`,
     * a continuous axis field under `navigate` or `brush-zoom`.
     */
    fields?: readonly (string | FilterFieldOptions)[];
    /** `filter` removes the rows that fail; `highlight` keeps them and mutes their marks. Defaults to `filter`. */
    mode?: 'filter' | 'highlight';
    /** Defaults to `auto`. */
    placement?: FilterPlacement;
    /** False draws nothing; the host draws its own controls and drives the preset through `dispatch`. Defaults to true. */
    render?: boolean;
    /** Filters applied when the chart mounts. */
    initial?: Readonly<Record<string, FilterValue>>;
    /** Opacity of the marks that fail in `highlight` mode. */
    dimOpacity?: number;
}

/**
 * What `dispatch(id, payload)` accepts: one field's filter (`null` clears it),
 * the whole set of filters, or a reset.
 */
export type FilterControlsPayload =
    | { readonly field: string; readonly value: FilterValue | null }
    | { readonly filters: Readonly<Record<string, FilterValue>> }
    | { readonly reset: true };

/** A field the controls offer, with the values its widget lists. */
export interface FilterFieldDescriptor {
    readonly field: string;
    readonly label: string;
    readonly widget: Exclude<FilterWidget, 'auto'>;
    /** Distinct values in data order, or sorted for a range. */
    readonly values: readonly unknown[];
    /** For a range over numbers: the low and high ends. Absent when the range steps through `values`. */
    readonly extent?: readonly [number, number];
    /** A dropdown without All: the field always holds one value. */
    readonly required?: boolean;
    /** Writes a value as the chart does, from the field's semantic type: `Aug 2015`, `$1.20`, `2007`. */
    readonly format?: (value: unknown) => string;
    /** Writes a number in a few characters (`266K`), keeping the type's prefix and suffix. */
    readonly formatCompact?: (value: unknown) => string;
}

/** The live state behind one filter-controls definition, shared by its handler, its controls, and the chart state. */
export interface FilterControlsRuntime {
    readonly options: Readonly<FilterControlsOptions>;
    getFilters(): Readonly<Record<string, FilterValue>>;
    subscribe(listener: () => void): () => void;
    /** The rows `filter` mode narrows; the surface binds them at mount. */
    bindRows(rows: readonly Record<string, unknown>[]): void;
    /** True when filters are set and no bound row passes them all. */
    isEmpty(): boolean;
    /** The filters a required field always holds; a reset or a cleared field returns to them. */
    setDefaults(defaults: Readonly<Record<string, FilterValue>>): void;
    getDefaults(): Readonly<Record<string, FilterValue>>;
}

export interface FilterControlsDef extends ExternalInteractionDef<FilterControlsPayload> {
    readonly preset: 'filter-controls';
    readonly filterControls: FilterControlsRuntime;
}

export function isFilterControls(interaction: InteractionDef): interaction is FilterControlsDef {
    return 'filterControls' in interaction && !!(interaction as Partial<FilterControlsDef>).filterControls;
}

export function sameFilterValue(left: unknown, right: unknown): boolean {
    if (Object.is(left, right)) return true;
    if (left instanceof Date || right instanceof Date) return filterNumber(left) === filterNumber(right);
    return left != null && right != null && String(left) === String(right);
}

/** A comparable number for a range end or a cell: numbers as is, dates as time, numeric strings parsed. */
export function filterNumber(value: unknown): number {
    if (typeof value === 'number') return value;
    if (value instanceof Date) return value.getTime();
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'string') {
        const trimmed = value.trim();
        if (trimmed !== '' && !Number.isNaN(Number(trimmed))) return Number(trimmed);
        const time = Date.parse(trimmed);
        return Number.isNaN(time) ? Number.NaN : time;
    }
    return Number.NaN;
}

export function valueMatchesFilter(value: unknown, filter: FilterValue): boolean {
    if ('in' in filter) return filter.in.some((candidate) => sameFilterValue(candidate, value));
    const number = filterNumber(value);
    if (Number.isNaN(number)) return false;
    const low = filterNumber(filter.range[0]);
    const high = filterNumber(filter.range[1]);
    return (Number.isNaN(low) || number >= low) && (Number.isNaN(high) || number <= high);
}

export function rowMatchesFilters(
    row: Readonly<Record<string, unknown>>,
    filters: Readonly<Record<string, FilterValue>>,
): boolean {
    return Object.entries(filters).every(([field, filter]) => valueMatchesFilter(row[field], filter));
}

function isFilterValue(value: unknown): value is FilterValue {
    if (!value || typeof value !== 'object') return false;
    if ('in' in value) return Array.isArray((value as { in: unknown }).in);
    if ('range' in value) {
        const range = (value as { range: unknown }).range;
        return Array.isArray(range) && range.length === 2;
    }
    return false;
}

function validFilters(filters: Readonly<Record<string, unknown>> | undefined, label: string): Record<string, FilterValue> {
    const result: Record<string, FilterValue> = {};
    for (const [field, value] of Object.entries(filters ?? {})) {
        if (!isFilterValue(value)) {
            throw new Error(`${label}: the filter on "${field}" must be { in: [...] } or { range: [low, high] }.`);
        }
        result[field] = value;
    }
    return result;
}

/** An element passes when any row behind it passes, so an aggregate stays lit while part of it remains. */
function elementMatches(element: SemanticElement, filters: Readonly<Record<string, FilterValue>>): boolean {
    const records = element.records?.length ? element.records : [element.value];
    return records.some((record) => rowMatchesFilters(record, filters));
}

/**
 * Controls beside the chart that narrow the data a reader sees: checkboxes or a
 * dropdown for categories, a range for numbers and dates, a switch for booleans.
 * `filter` mode swaps in the passing rows through `set-data`, so aggregates and
 * scales follow inside the chart's compiled size; `highlight` mode mutes the
 * marks that fail instead. The current filters are the chart state's `filters`.
 */
export function filterControls(options: FilterControlsOptions = {}): FilterControlsDef {
    const id = options.id ?? 'filter-controls';
    const mode = options.mode ?? 'filter';
    let filters: Record<string, FilterValue> = validFilters(options.initial, `filterControls "${id}" initial`);
    let rows: readonly Record<string, unknown>[] = [];
    // The rows on screen before a filter matched nothing; an empty result keeps them, dimmed under a notice.
    let lastShown: readonly Record<string, unknown>[] | undefined;
    let defaults: Readonly<Record<string, FilterValue>> = {};
    const listeners = new Set<() => void>();
    const matching = (): Record<string, unknown>[] => rows.filter((row) => rowMatchesFilters(row, filters));
    const runtime: FilterControlsRuntime = {
        options,
        getFilters: () => filters,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        bindRows(next) {
            rows = next;
            lastShown = undefined;
        },
        isEmpty: () => Object.keys(filters).length > 0 && rows.length > 0 && !rows.some((row) => rowMatchesFilters(row, filters)),
        setDefaults(next) {
            defaults = next;
            filters = { ...defaults, ...filters };
        },
        getDefaults: () => defaults,
    };
    const updateFor = (context: InteractionContext): ChartUpdate => {
        const active = Object.keys(filters).length > 0;
        if (!active) {
            lastShown = undefined;
            return { id, ops: [] };
        }
        if (mode === 'highlight') {
            const available = context.available ?? [];
            const passing = available.filter((element) => elementMatches(element, filters));
            return {
                id,
                ops: [{
                    op: 'set-style',
                    targets: passing.length > 0 ? [{ visual: { kind: 'mark', role: 'mark' }, elements: passing }] : [],
                    // No mark passing still mutes them all, so an empty result reads as empty.
                    value: { state: 'emphasized', mutedOpacity: normalizedOpacity(options.dimOpacity) },
                }],
            };
        }
        // No rows bound means no surface mounted this instance; swapping in nothing would blank the chart.
        if (rows.length === 0) return { id, ops: [] };
        const passing = matching();
        if (passing.length > 0) lastShown = passing;
        // An empty dataset collapses the axes, so the last frame with data stays instead.
        const shown = passing.length > 0 ? passing : lastShown ?? rows;
        return { id, ops: [{ op: 'set-data', source: 'main', value: { rows: shown } }] };
    };
    return {
        id,
        external: true,
        preset: 'filter-controls',
        filterControls: runtime,
        handle(payload, context) {
            if (!payload || typeof payload !== 'object') {
                throw new Error(`filterControls "${id}": expected { field, value }, { filters }, or { reset: true }.`);
            }
            if ('reset' in payload) {
                filters = { ...defaults };
            } else if ('filters' in payload) {
                filters = { ...defaults, ...validFilters(payload.filters, `filterControls "${id}"`) };
            } else if ('field' in payload) {
                const next = { ...filters };
                if (payload.value === null && defaults[payload.field]) next[payload.field] = defaults[payload.field]!;
                else if (payload.value === null) delete next[payload.field];
                else next[payload.field] = validFilters({ [payload.field]: payload.value }, `filterControls "${id}"`)[payload.field]!;
                filters = next;
            } else {
                throw new Error(`filterControls "${id}": expected { field, value }, { filters }, or { reset: true }.`);
            }
            for (const listener of listeners) listener();
            return updateFor(context);
        },
    };
}

/** The filters of every filter-controls definition, merged; undefined when none has one. */
export function currentFilters(interactions: readonly InteractionDef[]): Record<string, FilterValue> | undefined {
    const controls = interactions.filter(isFilterControls);
    if (controls.length === 0) return undefined;
    return Object.assign({}, ...controls.map((control) => control.filterControls.getFilters()));
}

function encodedFields(input: ChartAssemblyInput): Map<string, string> {
    const channels = new Map<string, string>();
    for (const [channel, encoding] of Object.entries(input.chart_spec.encodings ?? {})) {
        const list = Array.isArray(encoding) ? encoding : [encoding];
        for (const entry of list) {
            const field = typeof entry === 'string' ? entry : (entry as { field?: string } | undefined)?.field;
            if (field && !channels.has(field)) channels.set(field, channel);
        }
    }
    return channels;
}

/**
 * True when the chart needs `field` to tell its rows apart: some mark the encodings name
 * appears once for each of the field's values, so they would overdraw or add up together.
 * A plotted measure does not name a mark, except that a line or area runs along its x.
 */
function splitsMarks(
    input: ChartAssemblyInput,
    channels: Map<string, string>,
    rows: readonly Record<string, unknown>[],
    field: string,
): boolean {
    if (channels.has(field)) return false;
    const chartType = input.chart_spec.chartType ?? '';
    const connected = /line|area/i.test(chartType);
    const keys = [...channels].filter(([name, channel]) => {
        if (channel !== 'x' && channel !== 'y') return true;
        if (semanticCategory(input, name, rows.map((row) => row[name])) !== 'quantitative') return true;
        return connected && channel === 'x';
    }).map(([name]) => name);
    if (keys.length === 0) return false;
    const seen = new Map<string, unknown>();
    for (const row of rows) {
        const key = JSON.stringify(keys.map((name) => row[name]));
        if (!seen.has(key)) seen.set(key, row[field]);
        else if (!Object.is(seen.get(key), row[field])) return true;
    }
    return false;
}

function semanticCategory(input: ChartAssemblyInput, field: string, values: readonly unknown[]): string {
    const annotation = input.semantic_types?.[field];
    const semanticType = typeof annotation === 'string' ? annotation : annotation?.semanticType;
    return (semanticType ? getVisCategory(semanticType) : null) ?? inferVisCategory([...values]);
}

const DATE_ONLY = /^\d{4}(-\d\d){0,2}$/;

/**
 * How a field's values read in its controls, from the same semantic processing the chart uses:
 * dates at the grain the axis would show, numbers with the type's currency, unit, and precision.
 */
function valueFormatters(
    input: ChartAssemblyInput,
    field: string,
    values: readonly unknown[],
    category: string,
): Pick<FilterFieldDescriptor, 'format' | 'formatCompact'> {
    const annotation = normalizeAnnotation(input.semantic_types?.[field]);
    const semanticType = annotation.semanticType;
    if (category === 'temporal' && values.every((value) => typeof value === 'string' || value instanceof Date)) {
        const pattern = resolveTemporalFormat([...values], semanticType);
        if (!pattern) return {};
        // A bare date is midnight UTC when parsed, so it is written in UTC too; a timestamp in local time.
        const utc = utcFormat(pattern);
        const local = timeFormat(pattern);
        const format = (value: unknown): string => {
            const date = value instanceof Date ? value : new Date(String(value));
            if (Number.isNaN(date.getTime())) return String(value);
            return (typeof value === 'string' && DATE_ONLY.test(value) ? utc : local)(date);
        };
        return { format, formatCompact: format };
    }
    if (!values.every((value) => typeof value === 'number')) return {};
    const { format: axis, tooltipFormat } = resolveFormat(semanticType, annotation, [...values]);
    const spec = tooltipFormat ?? axis ?? {};
    const pattern = spec.pattern ?? '';
    const percent = pattern.endsWith('%');
    const digits = /\.(\d+)/.exec(pattern)?.[1];
    // Years and other plain integers have no grouping pattern and read as written: 2007, not 2,007.
    const grouping = pattern === '' ? !/^(Year|Decade)$/.test(semanticType) : pattern.includes(',');
    const wrap = (text: string): string => `${spec.prefix ?? ''}${text}${percent ? '%' : spec.suffix ?? ''}`;
    const scaled = (value: number): number => percent ? value * 100 : value;
    const format = (value: unknown): string => typeof value === 'number'
        ? wrap(scaled(value).toLocaleString(undefined, {
            useGrouping: grouping && Math.abs(scaled(value)) >= 10000,
            minimumFractionDigits: digits && !pattern.includes('~') ? Number(digits) : 0,
            maximumFractionDigits: digits ? Number(digits) : 2,
        }))
        : String(value);
    const formatCompact = (value: unknown): string => typeof value === 'number' && Math.abs(scaled(value)) >= 10000 && grouping
        ? wrap(scaled(value).toLocaleString(undefined, { notation: 'compact', maximumSignificantDigits: 3 }))
        : format(value);
    return { format, formatCompact };
}

function distinct(values: readonly unknown[]): unknown[] {
    const seen: unknown[] = [];
    for (const value of values) {
        if (value == null) continue;
        if (!seen.some((candidate) => sameFilterValue(candidate, value))) seen.push(value);
    }
    return seen;
}

const AUTO_FIELD_LIMIT = 4;
const AUTO_CATEGORY_LIMIT = 30;

/**
 * The fields the controls offer and the widget each gets, read from the data,
 * the semantic types, and the encodings. `siblings` are the chart's other
 * interactions: an auto-chosen field they already filter is skipped.
 */
export function describeFilterFields(
    input: ChartAssemblyInput,
    options: FilterControlsOptions,
    siblings: readonly InteractionDef[] = [],
): FilterFieldDescriptor[] {
    const rows = (input.data as { values?: Record<string, unknown>[] }).values ?? [];
    const channels = encodedFields(input);
    const presets = new Set(siblings.map((interaction) => (interaction as { preset?: string }).preset));
    const filtering = (options.mode ?? 'filter') === 'filter';
    const describe = (field: string, widget: FilterWidget, label?: string, all?: boolean): FilterFieldDescriptor | null => {
        const column = rows.map((row) => row[field]);
        const values = distinct(column);
        if (values.length === 0) return null;
        const category = semanticCategory(input, field, column);
        const formatters = valueFormatters(input, field, values, category);
        const isBoolean = values.every((value) => typeof value === 'boolean');
        const versions = all === undefined && filtering && (widget === 'auto' || widget === 'select')
            && !isBoolean && values.length > 1 && (widget === 'select' || category !== 'quantitative')
            && splitsMarks(input, channels, rows, field);
        const resolved: Exclude<FilterWidget, 'auto'> = widget !== 'auto'
            ? widget
            : isBoolean ? 'toggle'
            : versions ? 'select'
            : category === 'quantitative' || category === 'temporal' ? 'range'
            : 'checkboxes';
        if (resolved === 'select' && (all === false || versions)) {
            return { field, label: label ?? field, widget: resolved, values, required: true, ...formatters };
        }
        if (resolved === 'range') {
            const numbers = values.map(filterNumber);
            const numeric = values.every((value) => typeof value === 'number');
            const sorted = [...values].sort((a, b) => filterNumber(a) - filterNumber(b));
            if (numeric) {
                return {
                    field, label: label ?? field, widget: resolved, values: sorted,
                    extent: [Math.min(...numbers), Math.max(...numbers)], ...formatters,
                };
            }
            return { field, label: label ?? field, widget: resolved, values: sorted, ...formatters };
        }
        return { field, label: label ?? field, widget: resolved, values, ...formatters };
    };
    if (options.fields) {
        return options.fields
            .map((entry) => typeof entry === 'string' ? { field: entry } : entry)
            .map((entry) => describe(entry.field, entry.widget ?? 'auto', entry.label, entry.all))
            .filter((descriptor): descriptor is FilterFieldDescriptor => !!descriptor);
    }
    const fields = rows.length > 0 ? Object.keys(rows[0]!) : [];
    const chosen: FilterFieldDescriptor[] = [];
    for (const field of fields) {
        if (chosen.length >= AUTO_FIELD_LIMIT) break;
        const channel = channels.get(field);
        const descriptor = describe(field, 'auto', undefined);
        if (!descriptor || descriptor.values.length < 2) continue;
        if (descriptor.widget === 'range') {
            // A measure is what the chart plots; filtering it is a choice an author makes by listing it.
            const category = semanticCategory(input, field, rows.map((row) => row[field]));
            if (category !== 'temporal') continue;
            if ((channel === 'x' || channel === 'y') && (presets.has('navigate') || presets.has('brush-zoom'))) continue;
        }
        if (descriptor.widget === 'checkboxes') {
            if (descriptor.values.length > AUTO_CATEGORY_LIMIT) continue;
            if (channel === 'color' && presets.has('legend-toggle')) continue;
        }
        chosen.push(descriptor);
    }
    return chosen;
}
