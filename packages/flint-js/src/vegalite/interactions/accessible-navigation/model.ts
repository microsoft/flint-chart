import type { AccessibleElementDescription } from '../../../interactive/language/events';
import type { AccessibleNavigationSection, AccessibleNavigationSettings } from '../../../interactive/triggers';
import type { RenderHit } from '../../../core/interaction-contracts';
import {
    INTERACTION_KEY,
    INTERACTION_ROLE,
    legendTarget,
    renderHit,
    shapeReadingBounds,
    type LegendHitIdentity,
} from '../hit-adapter';

/**
 * The semantic structure accessible navigation walks: a tree read from the
 * rendered Vega scenegraph, so it holds exactly what the reader sees. Pure data
 * and pure functions; the DOM controller lives beside it.
 */

export type AccessibleNodeKind =
    | 'chart'
    | 'title'
    | 'subtitle'
    | 'axis'
    | 'axis-title'
    | 'axis-label'
    | 'legend'
    | 'legend-title'
    | 'legend-item'
    | 'headers'
    | 'header'
    | 'data'
    | 'panel'
    | 'series'
    | 'mark'
    | 'labels'
    | 'text-label';

export interface AccessibleBounds {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

/** A keyed mark the walk can emphasise: its scene item and the hit the resolver reads. */
export interface AccessibleMarkRef {
    readonly item: any;
    readonly hit: RenderHit;
    readonly key: string;
}

export interface AccessibleNode {
    /** Stable path id, such as `chart/legend:0/item:USA`; the same chart rebuilds the same ids. */
    id: string;
    localId: string;
    readonly kind: AccessibleNodeKind;
    /** What the element is, as spoken: "Bar", "X axis label", "Legend item". */
    readonly type: string;
    /** What the element represents: "Category: Laptop, Value: 11". */
    readonly content: string;
    /** Plot-space bounds, the space `sceneItems` uses. */
    readonly bounds?: AccessibleBounds;
    readonly readingBounds?: AccessibleBounds;
    /** A point-like element gets a round focus ring. */
    readonly shape?: 'rect' | 'point';
    readingDirection?: 'horizontal' | 'vertical';
    children: AccessibleNode[];
    parent?: AccessibleNode;
    /** The scene item behind a label, legend entry, or mark. */
    readonly item?: any;
    /** The data marks this element stands for, which a focus emphasises. */
    readonly members: readonly AccessibleMarkRef[];
    readonly axis?: { channel: 'x' | 'y'; scale: string; field?: string; value?: unknown; discrete: boolean };
    readonly legend?: LegendHitIdentity;
}

export interface AccessibleTreeInput {
    /** `view.scenegraph().root`. */
    readonly root: any;
    readonly chartType: string;
    readonly axisFields?: Partial<Record<'x' | 'y', { field: string; type: string }>>;
    readonly legendFields?: Readonly<Record<string, string>>;
    readonly rangeLegendChannels?: readonly string[];
    readonly seriesField?: string;
    /** The chart's semantic fields; a mark reads any its tooltip leaves out. */
    readonly fields?: readonly string[];
    readonly temporalFields?: readonly string[];
    /** The type of a Vega scale by name, when a view is at hand. */
    readonly scaleType?: (name: string) => string | undefined;
    readonly settings?: Partial<AccessibleNavigationSettings>;
}

const DEFAULT_SECTIONS: readonly AccessibleNavigationSection[] = ['titles', 'axes', 'legends', 'headers', 'data', 'labels'];
const EMPTY_BOUNDS: AccessibleBounds = { x1: 0, y1: 0, x2: 0, y2: 0 };

interface MarkEntry extends AccessibleMarkRef {
    readonly bounds: AccessibleBounds;
    readonly readingBounds: AccessibleBounds;
    /** A path vertex's full extent, the area's baseline included. */
    readonly extent: AccessibleBounds;
    /** Every vertex of a path shares one key, so the path is one mark: a violin, not its points. */
    readonly wholePath?: boolean;
    readonly vertices?: readonly MarkEntry[];
    readonly scope?: any;
    readonly path?: any;
    readonly pathIndex: number;
    readonly rank: number;
    readonly pathOwner?: MarkEntry;
}

interface TextRecord {
    item: any;
    bounds: AccessibleBounds;
    text: string;
}

interface AxisRecord {
    item: any;
    bounds: AccessibleBounds;
    scale: string;
    orient: string;
    scope?: any;
    labels: (TextRecord & { value: unknown; index: number })[];
    title?: TextRecord;
}

interface LegendEntryRecord {
    value: unknown;
    labelItem?: any;
    text: string;
    bounds: AccessibleBounds;
    index: number;
}

interface LegendRecord {
    item?: any;
    bounds: AccessibleBounds;
    channel?: string;
    gradient: boolean;
    title?: TextRecord;
    entries: Map<unknown, LegendEntryRecord>;
}

interface HeaderRecord {
    item: any;
    bounds: AccessibleBounds;
    datum: Record<string, unknown>;
    text: string[];
}

interface ScopeRecord {
    item: any;
    bounds: AccessibleBounds;
    title?: TextRecord;
}

interface SceneFacts {
    titles: (TextRecord & { subtitle: boolean })[];
    axes: AxisRecord[];
    legends: LegendRecord[];
    headers: Record<'column' | 'row', HeaderRecord[]>;
    headerTitles: Record<'column' | 'row', TextRecord | undefined>;
    scopes: Map<any, ScopeRecord>;
    marks: MarkEntry[];
    texts: TextRecord[];
    rootBounds: AccessibleBounds;
}

interface WalkContext {
    scope?: any;
    axis?: AxisRecord;
    legend?: LegendRecord;
    title?: 'chart' | 'scope' | 'header' | 'header-title';
    header?: HeaderRecord;
    headerKind?: 'column' | 'row';
}

function absoluteBounds(item: any, offsetX: number, offsetY: number): AccessibleBounds | undefined {
    const bounds = item?.bounds;
    if (!bounds || ![bounds.x1, bounds.x2, bounds.y1, bounds.y2].every(Number.isFinite)) return undefined;
    return { x1: bounds.x1 + offsetX, y1: bounds.y1 + offsetY, x2: bounds.x2 + offsetX, y2: bounds.y2 + offsetY };
}

function unionBounds(left: AccessibleBounds | undefined, right: AccessibleBounds | undefined): AccessibleBounds | undefined {
    if (!left) return right;
    if (!right) return left;
    return {
        x1: Math.min(left.x1, right.x1), y1: Math.min(left.y1, right.y1),
        x2: Math.max(left.x2, right.x2), y2: Math.max(left.y2, right.y2),
    };
}

function boundsOf(values: readonly (AccessibleBounds | undefined)[]): AccessibleBounds | undefined {
    return values.reduce<AccessibleBounds | undefined>((result, value) => unionBounds(result, value), undefined);
}

function center(bounds: AccessibleBounds): { x: number; y: number } {
    return { x: (bounds.x1 + bounds.x2) / 2, y: (bounds.y1 + bounds.y2) / 2 };
}

function textOf(item: any): string {
    const text = item?.text;
    if (Array.isArray(text)) return text.map((line) => String(line ?? '')).join(' ').replace(/\s+/g, ' ').trim();
    return text === undefined || text === null ? '' : String(text).replace(/\s+/g, ' ').trim();
}

function rawKey(datum: unknown): string | undefined {
    const key = datum && typeof datum === 'object' ? (datum as Record<string, unknown>)[INTERACTION_KEY] : undefined;
    return typeof key === 'string' ? key : undefined;
}

function markRank(marktype: string | undefined): number {
    if (marktype === 'symbol' || marktype === 'rect' || marktype === 'arc' || marktype === 'shape') return 3;
    if (marktype === 'line' || marktype === 'area') return 2;
    if (marktype === 'rule') return 1;
    return 0;
}

function area(bounds: AccessibleBounds): number {
    return Math.max(0, bounds.x2 - bounds.x1) * Math.max(0, bounds.y2 - bounds.y1);
}

function comparableValue(value: unknown): unknown {
    return value instanceof Date ? value.getTime() : value;
}

function sameValue(left: unknown, right: unknown): boolean {
    const a = comparableValue(left);
    const b = comparableValue(right);
    if (Object.is(a, b)) return true;
    if (a === null || a === undefined || b === null || b === undefined) return false;
    return String(a) === String(b);
}

const NUMBER_FORMAT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
// Below 1 a fixed number of decimals would read a density of 0.0049 as 0.
const SMALL_NUMBER_FORMAT = new Intl.NumberFormat('en-US', { maximumSignificantDigits: 3 });

export function formatNumber(value: number): string {
    if (!Number.isFinite(value)) return String(value);
    if (Math.abs(value) >= 1 || value === 0) return NUMBER_FORMAT.format(value);
    if (Math.abs(value) < 1e-4) return value.toExponential(2).replace(/\.?0+e/, 'e');
    return SMALL_NUMBER_FORMAT.format(value);
}

/** A tooltip string that is a bare number printed to full precision, such as "0.0333333333333". */
function tidyNumericText(text: string): string {
    if (!/^[−-]?[\d,]*\.\d{5,}$/.test(text) && !/^[−-]?\d\.\d{3,}e[−+-]?\d+$/i.test(text)) return text;
    const value = Number(text.replace(/,/g, '').replace('−', '-'));
    if (!Number.isFinite(value)) return text;
    return formatNumber(value).replace(/^-/, text.startsWith('−') ? '−' : '-');
}

function formatValue(value: unknown, temporal = false): string {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'number') {
        if (temporal && Number.isFinite(value)) return new Date(value).toISOString().slice(0, 10);
        return formatNumber(value);
    }
    if (value === null || value === undefined) return 'none';
    if (typeof value === 'object') return '';
    return String(value);
}

function isInternalField(field: string): boolean {
    return field.startsWith('_')
        || field.endsWith('_sort_index')
        || field === 'type' || field === 'geometry' || field === 'properties';
}

function isDiscreteType(type: string | undefined): boolean {
    return type === 'nominal' || type === 'ordinal' || type === 'band' || type === 'point';
}

function capitalize(text: string): string {
    return text ? `${text[0].toUpperCase()}${text.slice(1)}` : text;
}

/** One noun per mark: what a sighted reader would call it on this chart type. */
export function markNoun(marktype: string | undefined, chartType: string, wholePath = false): [string, string] {
    const chart = chartType.toLowerCase();
    if (chart.includes('kpi')) return ['KPI tile', 'KPI tiles'];
    if (wholePath && marktype === 'area') return chart.includes('violin') ? ['Violin', 'Violins'] : ['Area', 'Areas'];
    if (wholePath && marktype === 'line') return ['Line', 'Lines'];
    switch (marktype) {
        case 'rect':
            if (chart.includes('calendar')) return ['Day cell', 'Day cells'];
            if (chart.includes('heatmap')) return ['Cell', 'Cells'];
            if (chart.includes('boxplot')) return ['Box', 'Boxes'];
            if (chart.includes('candlestick')) return ['Candle', 'Candles'];
            if (chart.includes('gantt')) return ['Task bar', 'Task bars'];
            if (chart.includes('histogram')) return ['Bin', 'Bins'];
            if (chart.includes('waterfall')) return ['Step', 'Steps'];
            return ['Bar', 'Bars'];
        case 'arc':
            if (chart.includes('pie') || chart.includes('donut')) return ['Slice', 'Slices'];
            if (chart.includes('rose')) return ['Wedge', 'Wedges'];
            return ['Arc', 'Arcs'];
        case 'symbol':
            if (chart.includes('lollipop')) return ['Lollipop', 'Lollipops'];
            if (chart.includes('map')) return ['Location', 'Locations'];
            return ['Point', 'Points'];
        case 'line': return ['Point on line', 'Points on line'];
        case 'area': return ['Point on area', 'Points on area'];
        case 'shape': return ['Region', 'Regions'];
        case 'rule': return ['Rule', 'Rules'];
        case 'text': return ['Text label', 'Text labels'];
        default: return ['Mark', 'Marks'];
    }
}

function countPhrase(count: number, noun: [string, string]): string {
    return `${count} ${(count === 1 ? noun[0] : noun[1]).toLowerCase()}`;
}

function listPhrase(values: readonly string[], limit = 5): string {
    const shown = values.slice(0, limit).join(', ');
    return values.length > limit ? `${shown}, and ${values.length - limit} more` : shown;
}

/** The count in the placeholder an overflowing axis or legend draws in place of the categories it drops. */
function omittedCount(text: string): number | undefined {
    const match = /^(?:\.\.\.|…)\s*(\d+) items omitted$/.exec(text.trim());
    return match ? Number(match[1]) : undefined;
}

function tickDate(value: unknown): Date | undefined {
    const date = value instanceof Date ? value : typeof value === 'number' ? new Date(value) : undefined;
    return date && Number.isFinite(date.getTime()) ? date : undefined;
}

/**
 * A time axis abbreviates its ticks ("2020", "Apr", "Jul"), so the same label
 * repeats each year. Each tick reads as its full date, at the precision the
 * ticks share: a year, a month, a day, or an hour.
 */
function fullDateLabels<T extends { value: unknown }>(labels: readonly T[], utcScale: boolean): Map<T, string> {
    const dated = labels
        .map((label) => ({ label, date: tickDate(label.value) }))
        .filter((entry): entry is { label: T; date: Date } => !!entry.date);
    const result = new Map<T, string>();
    if (dated.length === 0) return result;
    // Ticks of date-only data sit on UTC midnights even on a local scale; read them on that calendar.
    const atMidnight = (date: Date, inUtc: boolean) => inUtc
        ? !date.getUTCHours() && !date.getUTCMinutes() && !date.getUTCSeconds()
        : !date.getHours() && !date.getMinutes() && !date.getSeconds();
    const utc = utcScale || (dated.every(({ date }) => atMidnight(date, true))
        && !dated.every(({ date }) => atMidnight(date, false)));
    const part = (date: Date, unit: 'month' | 'date' | 'hours' | 'minutes' | 'seconds'): number => {
        switch (unit) {
            case 'month': return utc ? date.getUTCMonth() : date.getMonth();
            case 'date': return utc ? date.getUTCDate() : date.getDate();
            case 'hours': return utc ? date.getUTCHours() : date.getHours();
            case 'minutes': return utc ? date.getUTCMinutes() : date.getMinutes();
            default: return utc ? date.getUTCSeconds() : date.getSeconds();
        }
    };
    const all = (test: (date: Date) => boolean) => dated.every(({ date }) => test(date));
    const midnight = all((date) => part(date, 'hours') === 0 && part(date, 'minutes') === 0 && part(date, 'seconds') === 0);
    const options: Intl.DateTimeFormatOptions = midnight && all((date) => part(date, 'date') === 1)
        ? all((date) => part(date, 'month') === 0) ? { year: 'numeric' } : { year: 'numeric', month: 'long' }
        : midnight ? { year: 'numeric', month: 'long', day: 'numeric' }
        : all((date) => part(date, 'minutes') === 0 && part(date, 'seconds') === 0)
            ? { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric' }
            : { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit' };
    const format = new Intl.DateTimeFormat('en-US', { ...options, ...(utc ? { timeZone: 'UTC' } : {}) });
    for (const { label, date } of dated) result.set(label, format.format(date));
    return result;
}

function collectScene(root: any, input: AccessibleTreeInput): SceneFacts {
    const facts: SceneFacts = {
        titles: [],
        axes: [],
        legends: [],
        headers: { column: [], row: [] },
        headerTitles: { column: undefined, row: undefined },
        scopes: new Map(),
        marks: [],
        texts: [],
        rootBounds: EMPTY_BOUNDS,
    };
    // Legends a template draws as marks rather than as a Vega legend.
    const generatedLegend: LegendRecord = { bounds: EMPTY_BOUNDS, gradient: false, entries: new Map() };
    const addLegendEntry = (legend: LegendRecord, value: unknown, bounds: AccessibleBounds, labelItem: any, index: number): void => {
        const key = comparableValue(value);
        const existing = legend.entries.get(key);
        if (existing) {
            existing.bounds = unionBounds(existing.bounds, bounds)!;
            if (labelItem && !existing.labelItem) {
                existing.labelItem = labelItem;
                existing.text = textOf(labelItem) || existing.text;
            }
            return;
        }
        legend.entries.set(key, {
            value, labelItem, bounds, index,
            text: (labelItem ? textOf(labelItem) : '') || formatValue(value),
        });
    };

    const descend = (item: any, offsetX: number, offsetY: number, context: WalkContext): void => {
        const childX = offsetX + (typeof item.x === 'number' ? item.x : 0);
        const childY = offsetY + (typeof item.y === 'number' ? item.y : 0);
        for (const childMark of item.items ?? []) {
            (childMark?.items ?? []).forEach((child: any, index: number) => visitItem(child, childX, childY, context, index));
        }
    };

    const visitGroup = (item: any, bounds: AccessibleBounds | undefined, offsetX: number, offsetY: number, context: WalkContext): void => {
        const role: string | undefined = item.mark.role;
        if (role === 'axis') {
            const record: AxisRecord = {
                item, bounds: bounds ?? EMPTY_BOUNDS,
                scale: String(item.datum?.scale ?? ''), orient: String(item.orient ?? ''),
                scope: context.scope, labels: [],
            };
            descend(item, offsetX, offsetY, { ...context, axis: record });
            if (record.labels.length > 0 || record.title) facts.axes.push(record);
            return;
        }
        if (role === 'legend') {
            const scales = item.datum?.scales;
            const scaleChannel = scales && typeof scales === 'object' ? Object.keys(scales)[0] : undefined;
            const record: LegendRecord = {
                item, bounds: bounds ?? EMPTY_BOUNDS,
                channel: scaleChannel === 'fill' || scaleChannel === 'stroke' ? 'color' : scaleChannel,
                gradient: item.datum?.type === 'gradient',
                entries: new Map(),
            };
            descend(item, offsetX, offsetY, { ...context, legend: record });
            if (record.entries.size > 0 || record.title) facts.legends.push(record);
            return;
        }
        if (role === 'column-header' || role === 'row-header') {
            const kind = role === 'column-header' ? 'column' : 'row';
            const record: HeaderRecord = {
                item, bounds: bounds ?? EMPTY_BOUNDS, datum: (item.datum ?? {}) as Record<string, unknown>, text: [],
            };
            descend(item, offsetX, offsetY, { ...context, header: record, headerKind: kind });
            if (record.text.length > 0) facts.headers[kind].push(record);
            return;
        }
        let next = context;
        if (role === 'title') {
            next = {
                ...context,
                title: context.header ? 'header'
                    : context.headerKind ? 'header-title'
                    : context.scope ? 'scope'
                    : 'chart',
            };
        } else if (role === 'column-title' || role === 'row-title') {
            next = { ...context, headerKind: role === 'column-title' ? 'column' : 'row', header: undefined };
        } else if (role === 'column-footer' || role === 'row-footer') {
            next = { ...context, header: undefined };
        } else if (role === 'scope' && !context.legend && item.mark.name !== '__flint_legend_entry'
            // Vega-Lite groups one path per series in a scope of its own; that is a series, not a view.
            && !String(item.mark.name ?? '').endsWith('pathgroup')) {
            if (bounds) facts.scopes.set(item, { item, bounds });
            next = { ...context, scope: item };
        }
        descend(item, offsetX, offsetY, next);
    };

    const visitItem = (item: any, offsetX: number, offsetY: number, context: WalkContext, index: number): void => {
        if (!item?.mark) return;
        const mark = item.mark;
        const role: string | undefined = mark.role;
        const marktype: string | undefined = mark.marktype;
        const bounds = absoluteBounds(item, offsetX, offsetY);
        if (marktype === 'group') {
            visitGroup(item, bounds, offsetX, offsetY, context);
            return;
        }
        if (!bounds) return;
        if (context.axis) {
            const text = textOf(item);
            if (role === 'axis-label' && text) {
                context.axis.labels.push({
                    item, bounds, text, value: item.datum?.value,
                    index: typeof item.datum?.index === 'number' ? item.datum.index : context.axis.labels.length,
                });
            } else if (role === 'axis-title' && text) {
                context.axis.title = { item, bounds, text };
            }
            return;
        }
        if (context.legend) {
            if (role === 'legend-title') {
                const text = textOf(item);
                if (text) context.legend.title = { item, bounds, text };
            } else if (role === 'legend-label' && item.datum?.value !== undefined) {
                addLegendEntry(context.legend, item.datum.value, bounds, item, item.datum.index ?? index);
            } else if (role === 'legend-symbol' && item.datum?.value !== undefined && !context.legend.gradient) {
                addLegendEntry(context.legend, item.datum.value, bounds, undefined, item.datum.index ?? index);
            }
            return;
        }
        if (context.title && (role === 'title-text' || role === 'title-subtitle')) {
            const text = textOf(item);
            if (!text) return;
            if (context.title === 'header' && context.header) context.header.text.push(text);
            else if (context.title === 'header-title' && context.headerKind) {
                facts.headerTitles[context.headerKind] = { item, bounds, text };
            } else if (context.title === 'scope' && context.scope) {
                const scope = facts.scopes.get(context.scope);
                if (scope && !scope.title) scope.title = { item, bounds, text };
            } else {
                facts.titles.push({ item, bounds, text, subtitle: role === 'title-subtitle' });
            }
            return;
        }
        if (item.datum?.[INTERACTION_ROLE] === 'legend-label') {
            const legend = legendTarget(item, input.legendFields, input.rangeLegendChannels);
            if (legend) {
                generatedLegend.channel ??= legend.channel;
                addLegendEntry(generatedLegend, legend.value, bounds, item, generatedLegend.entries.size);
            }
            return;
        }
        const hit = renderHit(item);
        const key = rawKey(item.datum);
        if (hit && key) {
            const path = marktype === 'line' || marktype === 'area' ? mark : undefined;
            // A path's vertex is a point on it; its scene bounds cover the whole path.
            const vertex = path && typeof item.x === 'number' && typeof item.y === 'number';
            const markBounds = vertex
                ? {
                    x1: item.x + offsetX - 3, x2: item.x + offsetX + 3,
                    y1: item.y + offsetY - 3, y2: item.y + offsetY + 3,
                }
                : bounds;
            const readingBounds = (vertex || marktype === 'symbol') && Number.isFinite(item.x) && Number.isFinite(item.y)
                ? {
                    x1: item.x + offsetX, x2: item.x + offsetX,
                    y1: item.y + offsetY, y2: item.y + offsetY,
                }
                : shapeReadingBounds(item, markBounds);
            const extent = vertex
                ? unionBounds(markBounds, typeof item.x2 === 'number' || typeof item.y2 === 'number'
                    ? {
                        x1: (item.x2 ?? item.x) + offsetX, x2: (item.x2 ?? item.x) + offsetX,
                        y1: (item.y2 ?? item.y) + offsetY, y2: (item.y2 ?? item.y) + offsetY,
                    }
                    : undefined)!
                : bounds;
            facts.marks.push({
                item: vertex ? { ...item, bounds: markBounds } : item,
                hit, key, bounds: markBounds, readingBounds, extent, scope: context.scope, path,
                pathIndex: index, rank: markRank(marktype),
            });
            return;
        }
        if (marktype === 'text' && role === 'mark') {
            const text = textOf(item);
            if (text) facts.texts.push({ item, bounds, text });
        }
    };

    for (const item of root?.items ?? []) {
        visitItem(item, 0, 0, {}, 0);
        facts.rootBounds = unionBounds(facts.rootBounds, absoluteBounds(item, 0, 0))!;
    }
    if (generatedLegend.entries.size > 0) {
        generatedLegend.bounds = boundsOf([...generatedLegend.entries.values()].map((entry) => entry.bounds))!;
        facts.legends.push(generatedLegend);
    }
    return facts;
}

/** One representative per key: a symbol over the line vertex it sits on, the larger of two rects. */
function representativeMarks(marks: readonly MarkEntry[]): MarkEntry[] {
    // Keys need not name the facet field, so equal keys in two panels are two marks.
    const scopeIds = new Map<unknown, number>();
    const byKey = new Map<string, MarkEntry[]>();
    for (const mark of marks) {
        if (!scopeIds.has(mark.scope)) scopeIds.set(mark.scope, scopeIds.size);
        const id = `${scopeIds.get(mark.scope)}\u0000${mark.key}`;
        const group = byKey.get(id);
        if (group) group.push(mark);
        else byKey.set(id, [mark]);
    }
    const result: MarkEntry[] = [];
    for (const group of byKey.values()) {
        const best = group.reduce((current, candidate) =>
            candidate.rank > current.rank || (candidate.rank === current.rank && area(candidate.bounds) > area(current.bounds))
                ? candidate
                : current);
        const pathOwner = group.find((candidate) => candidate.path);
        const vertices = pathOwner ? group.filter((candidate) => candidate.path === pathOwner.path) : [];
        const pathLength = (pathOwner?.path?.items ?? []).length;
        if (vertices.length > 1 && vertices.length >= pathLength) {
            const bounds = boundsOf(vertices.map((vertex) => vertex.extent))!;
            result.push({ ...pathOwner!, item: { ...pathOwner!.item, bounds }, bounds, readingBounds: bounds, extent: bounds, wholePath: true, vertices });
        } else if (vertices.length > 1) {
            // Tied values on one path (an ECDF step, a repeated x) share a key but are separate points.
            const others = group.filter((candidate) => !candidate.path);
            for (const vertex of vertices) {
                const at = center(vertex.bounds);
                const over = others.reduce<MarkEntry | undefined>((nearest, candidate) => {
                    const distance = Math.hypot(center(candidate.bounds).x - at.x, center(candidate.bounds).y - at.y);
                    return distance < 4 && (!nearest || distance < Math.hypot(center(nearest.bounds).x - at.x, center(nearest.bounds).y - at.y))
                        ? candidate : nearest;
                }, undefined);
                result.push({ ...(over ?? vertex), pathOwner: vertex });
            }
        } else {
            result.push(pathOwner ? { ...best, pathOwner } : best);
        }
    }
    return result;
}

interface BuildContext {
    input: AccessibleTreeInput;
    /** The name the chart shows for a field: its legend or axis title. */
    label: (field: string) => string;
    noun: (marktype: string | undefined, wholePath?: boolean) => [string, string];
    temporal: Set<string>;
    maxFields: number;
}

function fieldEntries(mark: AccessibleMarkRef, context: BuildContext): [string, string][] {
    const tooltip = mark.item?.tooltip;
    const entries: [string, string][] = [];
    if (tooltip && typeof tooltip === 'object' && !Array.isArray(tooltip)) {
        for (const [field, value] of Object.entries(tooltip as Record<string, unknown>)) {
            if (isInternalField(field)) continue;
            const text = typeof value === 'string' ? tidyNumericText(value.trim()) : formatValue(value);
            if (text) entries.push([field, text]);
        }
    }
    const datum = (mark.hit.datum ?? {}) as Record<string, unknown>;
    if (entries.length === 0) {
        for (const [field, value] of Object.entries(datum)) {
            if (isInternalField(field) || field.endsWith('_start') || field.endsWith('_end')) continue;
            const text = formatValue(value, context.temporal.has(field));
            if (text) entries.push([field, text]);
        }
    } else if (entries.every(([field]) => field in datum)) {
        // A tooltip may leave out a field the chart encodes, such as a candle's high and low. When it
        // renames fields for display, a raw name cannot be matched to its entry, so nothing is added.
        const shown = new Set(entries.map(([field]) => field));
        for (const field of context.input.fields ?? []) {
            if (shown.has(field) || !(field in datum) || isInternalField(field)) continue;
            const text = formatValue(datum[field], context.temporal.has(field));
            if (text) entries.push([field, text]);
        }
    }
    return entries.slice(0, context.maxFields);
}

/** A whole path reads as the values its vertices share, and the span of the measure along it. */
function wholePathContent(mark: MarkEntry, context: BuildContext): string {
    const vertices = mark.vertices ?? [mark];
    const first = (vertices[0]?.hit.datum ?? {}) as Record<string, unknown>;
    const shared = Object.entries(first)
        .filter(([field, value]) => !isInternalField(field) && !field.endsWith('_start') && !field.endsWith('_end')
            && vertices.every((vertex) => sameValue(vertex.hit.datum?.[field], value)))
        .map(([field, value]) => `${field}: ${formatValue(value, context.temporal.has(field))}`)
        .filter((entry) => !entry.endsWith(': '));
    return [shared.join(', '), `${vertices.length} points${measureRange(vertices, context.input, context.label)}`]
        .filter(Boolean).join('. ');
}

function markContent(mark: MarkEntry, context: BuildContext): string {
    if (mark.wholePath) return wholePathContent(mark, context);
    const entries = fieldEntries(mark, context);
    if (entries.length > 0) return entries.map(([field, value]) => `${field}: ${value}`).join(', ');
    const text = mark.item?.mark?.marktype === 'text' ? textOf(mark.item) : '';
    return text || 'No data values';
}

/** The span of the chart's measure across some marks, as a clause. */
function measureRange(
    members: readonly AccessibleMarkRef[],
    input: AccessibleTreeInput,
    label: (field: string) => string = (field) => field,
): string {
    const axes = input.axisFields ?? {};
    const measure = axes.y?.type === 'quantitative' ? axes.y.field
        : axes.x?.type === 'quantitative' ? axes.x.field
        : undefined;
    if (!measure) return '';
    const values = members
        .map((member) => member.hit.datum?.[measure])
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
    if (values.length < 2) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const name = label(measure);
    return min === max ? `, ${name} ${formatValue(min)}` : `, ${name} from ${formatValue(min)} to ${formatValue(max)}`;
}

function nodeOf(
    kind: AccessibleNodeKind,
    localId: string,
    type: string,
    content: string,
    extra: Partial<Pick<AccessibleNode, 'bounds' | 'readingBounds' | 'shape' | 'children' | 'item' | 'members' | 'axis' | 'legend' | 'readingDirection'>> = {},
): AccessibleNode {
    return { id: localId, localId, kind, type, content, children: [], members: [], ...extra };
}

/** A structural copy placed under another parent; ids are assigned when the tree is finalised. */
function cloneNode(node: AccessibleNode): AccessibleNode {
    return { ...node, parent: undefined, children: node.children.map(cloneNode) };
}

function chartReadingDirection(input: AccessibleTreeInput): 'horizontal' | 'vertical' {
    const axes = input.axisFields ?? {};
    if (axes.y && axes.y.type !== 'quantitative' && (!axes.x || axes.x.type === 'quantitative')) return 'vertical';
    if (['Bar Table', 'Sparkline', 'Gantt Chart', 'Bullet Chart', 'Pyramid Chart'].includes(input.chartType)) return 'vertical';
    return 'horizontal';
}

function compareReadingBounds(
    left: Pick<AccessibleNode, 'bounds' | 'readingBounds'>,
    right: Pick<AccessibleNode, 'bounds' | 'readingBounds'>,
    vertical: boolean,
): number {
    const leftBounds = left.readingBounds ?? left.bounds;
    const rightBounds = right.readingBounds ?? right.bounds;
    if (!leftBounds || !rightBounds) return Number(!leftBounds) - Number(!rightBounds);
    return vertical
        ? leftBounds.y1 - rightBounds.y1 || leftBounds.x1 - rightBounds.x1
        : leftBounds.x1 - rightBounds.x1 || leftBounds.y1 - rightBounds.y1;
}

function finalize(node: AccessibleNode, direction: 'horizontal' | 'vertical', parent?: AccessibleNode): void {
    node.parent = parent;
    node.id = parent ? `${parent.id}/${node.localId}` : node.localId;
    node.readingDirection ??= node.kind === 'axis' && node.axis
        ? node.axis.channel === 'y' ? 'vertical' : 'horizontal'
        : node.kind === 'legend'
            ? isVerticalList(node.children.filter((child) => child.kind === 'legend-item')) ? 'vertical' : 'horizontal'
            : direction;
    const vertical = node.readingDirection === 'vertical';
    node.children.sort((left, right) => compareReadingBounds(left, right, vertical));
    const seen = new Map<string, number>();
    for (const child of node.children) {
        const count = seen.get(child.localId) ?? 0;
        seen.set(child.localId, count + 1);
        if (count > 0) child.localId = `${child.localId}#${count}`;
        finalize(child, direction, node);
    }
}

function sortReadingOrder(marks: readonly MarkEntry[], input: AccessibleTreeInput): MarkEntry[] {
    const yFirst = chartReadingDirection(input) === 'vertical';
    return [...marks].sort((left, right) => compareReadingBounds(left, right, yFirst));
}

function markNode(mark: MarkEntry, context: BuildContext): AccessibleNode {
    const marktype = mark.item.mark?.marktype;
    return nodeOf('mark', `mark:${mark.key}`, context.noun(marktype, mark.wholePath)[0], markContent(mark, context), {
        bounds: mark.bounds,
        readingBounds: mark.readingBounds,
        shape: (mark.path && !mark.wholePath) || marktype === 'symbol' ? 'point' : 'rect',
        item: mark.item,
        members: [mark],
    });
}

function seriesLabel(marks: readonly MarkEntry[], context: BuildContext, index: number): string {
    const datum = marks[0]?.hit.datum ?? {};
    const fields = [context.input.seriesField, context.input.legendFields?.color].filter((field): field is string => !!field);
    for (const field of fields) {
        const value = datum[field];
        if (value !== undefined && value !== null && value !== '') return `${context.label(field)}: ${formatValue(value)}`;
    }
    // A series drawn apart by an unkeyed channel, such as a stroke dash: name it by the
    // text field that holds one value along it.
    const axisFields = new Set(Object.values(context.input.axisFields ?? {}).map((axis) => axis.field));
    for (const [field, value] of Object.entries(datum)) {
        if (isInternalField(field) || axisFields.has(field) || typeof value !== 'string' || value === '') continue;
        if (marks.every((mark) => (mark.hit.datum ?? {})[field] === value)) return `${context.label(field)}: ${value}`;
    }
    return `Series ${index + 1}`;
}

/** The marks of one panel: a series per path, then the marks that sit on no path. */
function panelChildren(marks: readonly MarkEntry[], context: BuildContext): AccessibleNode[] {
    const paths = new Map<any, MarkEntry[]>();
    const loose: MarkEntry[] = [];
    for (const mark of marks) {
        const owner = mark.pathOwner;
        if (owner?.path) {
            const placed = { ...mark, pathIndex: owner.pathIndex };
            const group = paths.get(owner.path);
            if (group) group.push(placed);
            else paths.set(owner.path, [placed]);
        } else loose.push(mark);
    }
    const looseNodes = sortReadingOrder(loose, context.input).map((mark) => markNode(mark, context));
    const ordered = [...paths.entries()].map(([path, members]) =>
        [path, [...members].sort((left, right) => left.pathIndex - right.pathIndex)] as const);
    if (ordered.length === 1 && loose.length === 0) return ordered[0][1].map((mark) => markNode(mark, context));
    const seriesNodes = ordered.map(([path, members], index) => {
        const noun = context.noun(members[0]?.item.mark?.marktype);
        const label = seriesLabel(members, context, index);
        return nodeOf('series', `series:${label}`, path?.marktype === 'area' ? 'Area series' : 'Line series',
            `${label}. ${countPhrase(members.length, noun)}${measureRange(members, context.input, context.label)}`, {
                bounds: boundsOf(members.map((mark) => mark.bounds)),
                readingBounds: boundsOf(members.map((mark) => mark.readingBounds)),
                members,
                children: members.map((mark) => markNode(mark, context)),
            });
    });
    return [...seriesNodes, ...looseNodes];
}

function nounSummary(marks: readonly MarkEntry[], context: BuildContext): string {
    const counts = new Map<string, { noun: [string, string]; count: number }>();
    for (const mark of marks) {
        const noun = context.noun(mark.item.mark?.marktype, mark.wholePath);
        const entry = counts.get(noun[0]) ?? { noun, count: 0 };
        entry.count += 1;
        counts.set(noun[0], entry);
    }
    return [...counts.values()].map(({ noun, count }) => countPhrase(count, noun)).join(' and ') || 'no marks';
}

function scopeLabel(scope: ScopeRecord | undefined, index: number): string {
    const datum = (scope?.item?.datum ?? {}) as Record<string, unknown>;
    const facetFields = Object.entries(datum)
        .filter(([field, value]) => !isInternalField(field) && field !== 'count' && field !== 'data'
            && ((typeof value === 'string' && value !== '') || typeof value === 'number' || value instanceof Date));
    if (facetFields.length > 0) return facetFields.map(([field, value]) => `${field}: ${formatValue(value)}`).join(', ');
    return scope?.title?.text ?? `View ${index + 1}`;
}

/** The field marks carry for `field`: itself, or its aggregate, such as `sum_Activity`. */
function markField(marks: readonly MarkEntry[], field: string): string {
    const datum = marks.find((mark) => mark.hit.datum && field in mark.hit.datum)?.hit.datum;
    if (datum) return field;
    const aggregate = new RegExp(`^[a-z0-9]+_${field.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`);
    for (const mark of marks) {
        const alias = Object.keys(mark.hit.datum ?? {}).find((key) => aggregate.test(key));
        if (alias) return alias;
    }
    return field;
}

function membersWhere(marks: readonly MarkEntry[], predicate: (datum: Record<string, unknown>) => boolean): MarkEntry[] {
    return marks.filter((mark) => predicate((mark.hit.datum ?? {}) as Record<string, unknown>));
}

/** The whole walk for one rendered chart. */
export function buildAccessibleTree(input: AccessibleTreeInput): AccessibleNode {
    const facts = collectScene(input.root, input);
    const sections = input.settings?.sections ?? DEFAULT_SECTIONS;
    const context: BuildContext = {
        input,
        noun: (marktype, wholePath) => markNoun(marktype, input.chartType, wholePath),
        temporal: new Set<string>([
            ...(input.temporalFields ?? []),
            ...Object.values(input.axisFields ?? {})
                .filter((axis) => axis?.type === 'temporal')
                .map((axis) => axis!.field),
        ]),
        maxFields: input.settings?.maxFields ?? 8,
        label: (field) => displayNames.get(field) ?? field,
    };
    const displayNames = new Map<string, string>();
    for (const legend of facts.legends) {
        const field = legend.channel ? input.legendFields?.[legend.channel] : undefined;
        if (field && legend.title?.text) displayNames.set(field, legend.title.text);
    }
    for (const axis of facts.axes) {
        const channel = axis.orient === 'left' || axis.orient === 'right' ? 'y' : 'x';
        const field = input.axisFields?.[channel]?.field;
        if (field && axis.title?.text && !displayNames.has(field)) displayNames.set(field, axis.title.text);
    }
    const marks = representativeMarks(facts.marks);
    const children: AccessibleNode[] = [];
    const axisSummaries: string[] = [];
    const legendSummaries: string[] = [];

    // Panels: facet cells or concatenated views, when more than one holds marks.
    const scopesWithMarks = [...new Set(marks.map((mark) => mark.scope).filter(Boolean))];
    const panelled = scopesWithMarks.length > 1
        && scopesWithMarks.some((scope) => marks.filter((mark) => mark.scope === scope).length > 1);
    const orderedScopes = [...scopesWithMarks].sort((left, right) => {
        const a = facts.scopes.get(left)?.bounds;
        const b = facts.scopes.get(right)?.bounds;
        if (!a || !b) return 0;
        return Math.abs(a.y1 - b.y1) > 1 ? a.y1 - b.y1 : a.x1 - b.x1;
    });
    const panelNodes = new Map<any, AccessibleNode>();
    if (panelled) {
        orderedScopes.forEach((scope, index) => {
            const record = facts.scopes.get(scope);
            const members = marks.filter((mark) => mark.scope === scope);
            const label = scopeLabel(record, index);
            panelNodes.set(scope, nodeOf('panel', `panel:${label}`, 'Panel',
                `${label}. ${nounSummary(members, context)}${measureRange(members, input, context.label)}`, {
                    bounds: record?.bounds ?? boundsOf(members.map((mark) => mark.bounds)),
                    readingBounds: boundsOf(members.map((mark) => mark.readingBounds)),
                    members,
                    children: panelChildren(members, context),
                }));
        });
    }

    if (sections.includes('titles')) {
        facts.titles.forEach((title, index) => {
            const kind = title.subtitle ? 'subtitle' : 'title';
            children.push(nodeOf(kind, `${kind}:${index}`, title.subtitle ? 'Subtitle' : 'Title', title.text, {
                bounds: title.bounds, item: title.item,
            }));
        });
    }

    // Axes, one per scale and side: facets repeat an axis per panel.
    const seenAxes = new Set<string>();
    const axes = facts.axes
        .filter((axis) => {
            const identity = `${axis.scale}|${axis.orient}`;
            if (seenAxes.has(identity)) return false;
            seenAxes.add(identity);
            return true;
        })
        .map((axis) => ({ axis, channel: (axis.orient === 'left' || axis.orient === 'right' ? 'y' : 'x') as 'x' | 'y' }))
        .sort((left, right) => (left.channel === right.channel ? 0 : left.channel === 'x' ? -1 : 1));
    const axesPerChannel = (channel: 'x' | 'y') => axes.filter((entry) => entry.channel === channel).length;
    for (const { axis, channel } of axes) {
        const field = input.axisFields?.[channel];
        const scaleType = input.scaleType?.(axis.scale);
        const discrete = scaleType ? isDiscreteType(scaleType) : isDiscreteType(field?.type);
        const kindWord = discrete ? 'Categorical'
            : field?.type === 'temporal' || scaleType === 'time' || scaleType === 'utc' ? 'Time'
            : 'Numeric';
        const labels = [...axis.labels].sort((left, right) =>
            channel === 'x' ? left.bounds.x1 - right.bounds.x1 : left.bounds.y1 - right.bounds.y1);
        const title = axis.title?.text ?? field?.field ?? '';
        const scopeTitle = axesPerChannel(channel) > 1 && axis.scope ? facts.scopes.get(axis.scope)?.title?.text : undefined;
        const axisType = `${channel.toUpperCase()} axis`;
        const shown = labels.filter((label) => omittedCount(label.text) === undefined);
        const omitted = labels.reduce((total, label) => total + (omittedCount(label.text) ?? 0), 0);
        const temporalAxis = field?.type === 'temporal' || scaleType === 'time' || scaleType === 'utc';
        const fullDates = temporalAxis ? fullDateLabels(shown, scaleType === 'utc') : undefined;
        const spoken = (label: typeof labels[number]): string => {
            const full = fullDates?.get(label);
            if (!full || full.toLowerCase() === label.text.toLowerCase()) return label.text;
            // A year tick among month ticks reads "January 2020", not "2020 (January 2020)".
            const words = full.toLowerCase().split(/[\s,]+/);
            return words.includes(label.text.toLowerCase()) ? full : `${label.text} (${full})`;
        };
        const endText = (label: typeof labels[number]): string => fullDates?.get(label) ?? label.text;
        const range = (shown.length === 0 ? 'no labels'
            : shown.length === 1 ? `1 label: ${endText(shown[0])}`
            : `${shown.length} labels, from ${endText(shown[0])} to ${endText(shown[shown.length - 1])}`)
            + (omitted > 0 ? `, and ${omitted} more not shown` : '');
        const axisChildren: AccessibleNode[] = [];
        if (axis.title) {
            axisChildren.push(nodeOf('axis-title', 'title', `${axisType} title`, axis.title.text, {
                bounds: axis.title.bounds, item: axis.title.item,
            }));
        }
        const labelField = discrete && field ? markField(marks, field.field) : undefined;
        const labelMembers = new Map(labels.map((label) => [label, labelField && omittedCount(label.text) === undefined
            ? sortReadingOrder(membersWhere(marks, (datum) => sameValue(datum[labelField], label.value)), input)
            : []]));
        // When no label matches any mark, the labels are not categories of the data (a calendar's
        // month names over week columns), so an empty label says nothing rather than "No cells".
        const labelsMatch = [...labelMembers.values()].some((members) => members.length > 0);
        for (const label of labels) {
            const hidden = omittedCount(label.text);
            if (hidden !== undefined) {
                axisChildren.push(nodeOf('axis-label', `label:${label.text}`, `${axisType} label`,
                    `${hidden} more ${hidden === 1 ? 'value' : 'values'} not shown`, {
                        bounds: label.bounds,
                        item: label.item,
                        axis: { channel, scale: axis.scale, field: field?.field, value: label.value, discrete: false },
                    }));
                continue;
            }
            const members = labelMembers.get(label) ?? [];
            const summary = members.length > 0 ? `. ${nounSummary(members, context)}`
                : labelsMatch ? `. No ${context.noun(marks[0].item.mark?.marktype, marks[0].wholePath)[1].toLowerCase()}`
                : '';
            axisChildren.push(nodeOf('axis-label', `label:${label.text}`, `${axisType} label`,
                `${spoken(label)}${summary}`, {
                    bounds: label.bounds,
                    item: label.item,
                    members,
                    children: members.map((mark) => markNode(mark, context)),
                    axis: { channel, scale: axis.scale, field: field?.field, value: label.value, discrete },
                }));
        }
        const named = `${title}${scopeTitle ? ` (${scopeTitle})` : ''}`;
        axisSummaries.push(`${axisType} ${named}`.trim());
        if (sections.includes('axes')) {
            children.push(nodeOf('axis', `axis:${channel}:${axis.scale}:${axis.orient}`, axisType,
                `${named ? `${named}. ` : ''}${kindWord}, ${range}`, {
                    bounds: axis.bounds,
                    item: axis.item,
                    children: axisChildren,
                    axis: { channel, scale: axis.scale, field: field?.field, discrete },
                }));
        }
    }

    facts.legends.forEach((legend, legendIndex) => {
        const legendType = legend.channel === 'color' ? 'Color legend'
            : legend.channel ? `${capitalize(legend.channel.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase())} legend`
            : 'Legend';
        const entries = [...legend.entries.values()].sort((left, right) => left.index - right.index);
        const field = legend.channel ? input.legendFields?.[legend.channel] : undefined;
        const spokenField = field && !isInternalField(field) ? field : undefined;
        const legendChildren: AccessibleNode[] = [];
        if (legend.title) {
            legendChildren.push(nodeOf('legend-title', 'title', 'Legend title', legend.title.text, {
                bounds: legend.title.bounds, item: legend.title.item,
            }));
        }
        const itemDrafts: {
            entry: typeof entries[number];
            identity?: ReturnType<typeof legendTarget>;
            members: MarkEntry[];
            text: string;
            placeholder?: boolean;
        }[] = [];
        for (const entry of entries) {
            const hidden = omittedCount(entry.text);
            if (hidden !== undefined) {
                itemDrafts.push({ entry, members: [], text: `${hidden} more ${hidden === 1 ? 'item' : 'items'} not shown`, placeholder: true });
                continue;
            }
            const identity = entry.labelItem
                ? legendTarget(entry.labelItem, input.legendFields, input.rangeLegendChannels) ?? undefined
                : undefined;
            const identityField = identity?.field ?? field;
            const dataField = identityField ? markField(marks, identityField) : undefined;
            const domain = identity?.domain;
            const members = dataField
                ? sortReadingOrder(membersWhere(marks, (datum) => {
                    const value = datum[dataField];
                    if (domain?.kind === 'interval') {
                        const numeric = Number(comparableValue(value));
                        return Number.isFinite(numeric)
                            && (domain.start === undefined || numeric >= domain.start)
                            && (domain.end === undefined || numeric < domain.end);
                    }
                    return sameValue(value, entry.value);
                }), input)
                : [];
            const prefix = identityField && !isInternalField(identityField) && !legend.gradient
                ? `${legend.title?.text ?? context.label(identityField)}: `
                : '';
            const rangeText = domain?.kind !== 'interval' ? ''
                : domain.start === undefined && domain.end !== undefined ? `, covering below ${formatValue(domain.end)}`
                : domain.end === undefined && domain.start !== undefined ? `, covering ${formatValue(domain.start)} and above`
                : domain.start !== undefined && domain.end !== undefined
                    ? `, covering ${formatValue(domain.start)} to ${formatValue(domain.end)}`
                    : '';
            itemDrafts.push({ entry, identity, members, text: `${prefix}${entry.text}${rangeText}` });
        }
        // As with axis labels: if no item matches any mark, membership is unknown, not empty.
        const itemsMatch = itemDrafts.some((draft) => draft.members.length > 0);
        for (const { entry, identity, members, text, placeholder } of itemDrafts) {
            if (placeholder) {
                legendChildren.push(nodeOf('legend-item', `item:${entry.text}`, 'Legend item', text, { bounds: entry.bounds, item: entry.labelItem }));
                continue;
            }
            legendChildren.push(nodeOf('legend-item', `item:${entry.text}`, legend.gradient ? 'Legend value' : 'Legend item',
                `${text}${members.length > 0 ? `. ${nounSummary(members, context)}`
                    : itemsMatch ? `. No ${context.noun(marks[0].item.mark?.marktype, marks[0].wholePath)[1].toLowerCase()}`
                    : ''}`, {
                    bounds: entry.bounds,
                    item: entry.labelItem,
                    members,
                    children: members.map((mark) => markNode(mark, context)),
                    ...(identity ? { legend: identity } : {}),
                }));
        }
        const values = entries.map((entry) => entry.text).filter((text) => omittedCount(text) === undefined);
        const omitted = entries.reduce((total, entry) => total + (omittedCount(entry.text) ?? 0), 0);
        const summary = (legend.gradient
            ? values.length > 1 ? `Scale from ${values[0]} to ${values[values.length - 1]}` : `${values.length} values`
            : `${values.length} ${values.length === 1 ? 'item' : 'items'}: ${listPhrase(values)}`)
            + (omitted > 0 ? `, and ${omitted} more not shown` : '');
        const named = legend.title?.text ?? spokenField;
        legendSummaries.push(named ? `${legendType.toLowerCase()} ${named}` : legendType.toLowerCase());
        if (sections.includes('legends')) {
            const vertical = isVerticalList(legendChildren.filter((node) => node.kind === 'legend-item'));
            children.push(nodeOf('legend', `legend:${legendIndex}`, legendType, named ? `${named}. ${summary}` : summary, {
                bounds: legend.bounds,
                item: legend.item,
                children: vertical ? legendChildren.map((node) => ({
                    ...node,
                    readingBounds: node.bounds ? { ...node.bounds, x1: legend.bounds.x1 } : undefined,
                })) : legendChildren,
            }));
        }
    });

    if (sections.includes('headers')) {
        for (const kind of ['column', 'row'] as const) {
            const headers = facts.headers[kind];
            if (headers.length === 0) continue;
            const headerTitle = facts.headerTitles[kind];
            const type = kind === 'column' ? 'Column header' : 'Row header';
            const values: string[] = [];
            const headerChildren = [...headers]
                .sort((left, right) => kind === 'column'
                    ? center(left.bounds).y - center(right.bounds).y || center(left.bounds).x - center(right.bounds).x
                    : center(left.bounds).y - center(right.bounds).y)
                .map((header) => {
                    const fields = Object.entries(header.datum).filter(([field]) => field !== 'count' && !isInternalField(field));
                    const panels = orderedScopes.filter((scope) => {
                        const datum = (facts.scopes.get(scope)?.item?.datum ?? {}) as Record<string, unknown>;
                        return fields.length > 0 && fields.every(([field, value]) => sameValue(datum[field], value));
                    });
                    const members = marks.filter((mark) => panels.includes(mark.scope));
                    const text = header.text.join(' ');
                    values.push(text);
                    return nodeOf('header', `header:${text}`, type,
                        `${fields.length > 0 ? `${fields[0][0]}: ` : ''}${text}. ${panels.length} ${panels.length === 1 ? 'panel' : 'panels'}, ${nounSummary(members, context)}`, {
                            bounds: header.bounds,
                            item: header.item,
                            members,
                            children: panels
                                .map((scope) => panelNodes.get(scope))
                                .filter((panel): panel is AccessibleNode => !!panel)
                                .map(cloneNode),
                        });
                });
            children.push(nodeOf('headers', `headers:${kind}`, kind === 'column' ? 'Column headers' : 'Row headers',
                `${headerTitle?.text ?? 'Facets'}. ${headerChildren.length} headers: ${listPhrase(values)}`, {
                    bounds: boundsOf([headerTitle?.bounds, ...headerChildren.map((header) => header.bounds)]),
                    item: headerTitle?.item,
                    children: headerChildren,
                    readingDirection: kind === 'row' ? 'vertical' : 'horizontal',
                }));
        }
        // A wrapped facet titles each cell instead of drawing header rows.
        const cellTitles = facts.headers.column.length === 0 && facts.headers.row.length === 0
            ? orderedScopes
                .map((scope) => facts.scopes.get(scope))
                .filter((scope): scope is ScopeRecord => !!scope?.title && panelNodes.has(scope.item)
                    && String(scope.item?.mark?.name ?? '').endsWith('cell'))
            : [];
        if (cellTitles.length > 0) {
            children.push(nodeOf('headers', 'headers:facets', 'Facet headers',
                `${cellTitles.length} headers: ${listPhrase(cellTitles.map((scope) => scope.title!.text))}`, {
                    bounds: boundsOf(cellTitles.map((scope) => scope.title!.bounds)),
                    children: cellTitles.map((scope, index) => {
                        const panel = panelNodes.get(scope.item)!;
                        return nodeOf('header', `header:${scope.title!.text}`, 'Facet header',
                            `${scopeLabel(scope, index)}. 1 panel, ${nounSummary(panel.members as MarkEntry[], context)}`, {
                                bounds: scope.title!.bounds,
                                item: scope.title!.item,
                                members: panel.members,
                                children: [cloneNode(panel)],
                            });
                    }),
                }));
        }
        // A concatenated view's title names part of the chart even when the view is not a panel.
        const viewTitles = [...facts.scopes.values()]
            .filter((scope) => scope.title && !panelNodes.has(scope.item) && !String(scope.item?.mark?.name ?? '').endsWith('cell'))
            .sort((left, right) => left.bounds.x1 - right.bounds.x1 || left.bounds.y1 - right.bounds.y1);
        if (viewTitles.length > 0) {
            children.push(nodeOf('headers', 'headers:views', 'View titles',
                `${viewTitles.length} ${viewTitles.length === 1 ? 'title' : 'titles'}: ${listPhrase(viewTitles.map((scope) => scope.title!.text))}`, {
                    bounds: boundsOf(viewTitles.map((scope) => scope.title!.bounds)),
                    children: viewTitles.map((scope) => nodeOf('header', `view:${scope.title!.text}`, 'View title', scope.title!.text, {
                        bounds: scope.title!.bounds, item: scope.title!.item,
                    })),
                }));
        }
    }

    if (sections.includes('data') && marks.length > 0) {
        const dataChildren = panelled
            ? orderedScopes.map((scope) => panelNodes.get(scope)).filter((panel): panel is AccessibleNode => !!panel)
            : panelChildren(marks, context);
        const seriesCount = dataChildren.filter((child) => child.kind === 'series').length;
        children.push(nodeOf('data', 'data', 'Data',
            `${nounSummary(marks, context)}`
            + (panelled ? ` in ${dataChildren.length} panels` : seriesCount > 1 ? ` in ${seriesCount} series` : '')
            + measureRange(marks, input, context.label), {
                bounds: boundsOf(marks.map((mark) => mark.bounds)),
                readingBounds: boundsOf(marks.map((mark) => mark.readingBounds)),
                children: dataChildren,
            }));
    }

    if (sections.includes('labels') && facts.texts.length > 0) {
        const texts = [...facts.texts].sort((left, right) =>
            Math.abs(left.bounds.y1 - right.bounds.y1) > 2 ? left.bounds.y1 - right.bounds.y1 : left.bounds.x1 - right.bounds.x1);
        children.push(nodeOf('labels', 'labels', 'Text labels', `${texts.length} ${texts.length === 1 ? 'label' : 'labels'}`, {
            bounds: boundsOf(texts.map((text) => text.bounds)),
            children: texts.map((text, index) => nodeOf('text-label', `text:${index}`, 'Text label', text.text, {
                bounds: text.bounds, item: text.item,
            })),
        }));
    }

    const title = facts.titles.find((entry) => !entry.subtitle)?.text;
    const subtitle = facts.titles.find((entry) => entry.subtitle)?.text;
    const rootContent = [
        `${input.chartType}${title ? `: ${title}` : ''}`,
        subtitle,
        [...axisSummaries, ...legendSummaries].join('; '),
        marks.length > 0 ? `${nounSummary(marks, context)}${panelled ? ` in ${panelNodes.size} panels` : ''}` : 'No data marks',
    ].filter(Boolean).join('. ');
    const root = nodeOf('chart', 'chart', 'Chart', rootContent, { bounds: facts.rootBounds, children });
    finalize(root, chartReadingDirection(input));
    return root;
}

/** Every node of the tree, depth first. */
export function accessibleNodes(root: AccessibleNode): AccessibleNode[] {
    const result: AccessibleNode[] = [];
    const visit = (node: AccessibleNode): void => {
        result.push(node);
        node.children.forEach(visit);
    };
    visit(root);
    return result;
}

/** Close a sentence without doubling its stop or cutting an ellipsis short. */
function sentence(text: string): string {
    const trimmed = text.trim();
    return /[.!?…:]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

export function describeAccessibleNode(node: AccessibleNode): AccessibleElementDescription {
    const siblings = node.parent?.children;
    const position = siblings ? { index: siblings.indexOf(node) + 1, count: siblings.length } : undefined;
    const path: string[] = [];
    for (let cursor: AccessibleNode | undefined = node; cursor; cursor = cursor.parent) path.unshift(cursor.type);
    const text = node.kind === 'chart'
        ? `${sentence(node.content)} Press Enter to explore ${node.children.length} parts, or H for help.`
        : `${node.type}${position && position.count > 1 ? ` ${position.index} of ${position.count}` : ''}. ${sentence(node.content)}`;
    return {
        kind: node.kind,
        type: node.type,
        content: node.content,
        ...(position ? { position } : {}),
        childCount: node.children.length,
        path,
        // A label that ends in a stop ("Inc.") must not read as "Inc.. 3 bars".
        text: text.replace(/(^|[^.])\.\.(?!\.)/g, '$1.').replace(/\.\s+\.(?!\.)/g, '.'),
    };
}

export const ACCESSIBLE_NAVIGATION_HELP = [
    'Chart navigation keys.',
    'Left and right: previous and next sibling in horizontal order.',
    'Up and down: previous and next sibling in vertical order.',
    'Both arrow pairs visit every sibling, including overlapping items, and stop at the ends.',
    'Enter: go into the focused element. Escape or Backspace: go back out.',
    'Tab and Shift+Tab: next and previous element at this level; past either end, Tab moves on from the chart.',
    'Home and End: first and last element. Page Up and Page Down: jump ten elements.',
    'Space: activate the focused mark, legend item, or axis label.',
    'T: title. X and Y: axes. L: legend. F: facet headers. D: data. I: repeat. H: this help.',
].join(' ');

export type AccessibleCommand =
    | 'next' | 'previous' | 'left' | 'right' | 'up' | 'down' | 'first' | 'last' | 'page-next' | 'page-previous'
    | 'enter' | 'exit' | 'activate' | 'help' | 'repeat'
    | 'jump-title' | 'jump-x' | 'jump-y' | 'jump-legend' | 'jump-headers' | 'jump-data';

export function accessibleCommandForKey(event: {
    key: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean; shiftKey?: boolean;
}): AccessibleCommand | undefined {
    if (event.altKey || event.ctrlKey || event.metaKey) return undefined;
    switch (event.key) {
        case 'Tab': return event.shiftKey ? 'previous' : 'next';
        case 'ArrowRight': return 'right';
        case 'ArrowLeft': return 'left';
        case 'ArrowDown': return 'down';
        case 'ArrowUp': return 'up';
        case 'Home': return 'first';
        case 'End': return 'last';
        case 'PageDown': return 'page-next';
        case 'PageUp': return 'page-previous';
        case 'Enter': return 'enter';
        case ' ': case 'Spacebar': return 'activate';
        case 'Escape': case 'Backspace': return 'exit';
        default:
    }
    switch (event.key.toLowerCase()) {
        case 'h': case '?': return 'help';
        case 'i': return 'repeat';
        case 't': return 'jump-title';
        case 'x': return 'jump-x';
        case 'y': return 'jump-y';
        case 'l': return 'jump-legend';
        case 'f': return 'jump-headers';
        case 'd': return 'jump-data';
        default: return undefined;
    }
}

export interface AccessibleMove {
    readonly node: AccessibleNode;
    readonly moved: boolean;
    /** A message to announce without moving, such as the end of a list. */
    readonly message?: string;
    /** The focused element should be activated like a click. */
    readonly activate?: boolean;
    /** Escape on the chart itself: the reader leaves the walk. */
    readonly exited?: boolean;
}

const ACTIVATABLE: ReadonlySet<AccessibleNodeKind> = new Set(['mark', 'legend-item', 'axis-label']);

function isVerticalList(nodes: readonly AccessibleNode[]): boolean {
    const centers = nodes.filter((node) => node.bounds).map((node) => center(node.bounds!));
    if (centers.length < 2) return false;
    const spreadX = Math.max(...centers.map((point) => point.x)) - Math.min(...centers.map((point) => point.x));
    const spreadY = Math.max(...centers.map((point) => point.y)) - Math.min(...centers.map((point) => point.y));
    return spreadY > spreadX;
}

/**
 * The reader's position in the tree and the moves the keys make. It rebuilds
 * the tree on request and finds the same element again by id, so a re-render
 * (a hidden series, a resize) keeps the reader where they were. Geometry and
 * keys alone cannot detect changed values, tooltip text, or cohort membership.
 */
export class AccessibleNavigator {
    private rootNode: AccessibleNode;
    private currentNode: AccessibleNode;
    private byId = new Map<string, AccessibleNode>();
    constructor(private readonly build: () => AccessibleNode) {
        this.rootNode = build();
        this.currentNode = this.rootNode;
        this.reindex();
    }

    get root(): AccessibleNode {
        return this.rootNode;
    }

    get current(): AccessibleNode {
        return this.currentNode;
    }

    private reindex(): void {
        this.byId = new Map(accessibleNodes(this.rootNode).map((node) => [node.id, node]));
    }

    /** Rebuild the tree, keeping the reader's place. True when it was rebuilt. */
    refresh(): boolean {
        const previous = this.currentNode;
        this.rootNode = this.build();
        this.reindex();
        for (let cursor: AccessibleNode | undefined = previous; cursor; cursor = cursor.parent) {
            const found = this.byId.get(cursor.id);
            if (found) {
                this.currentNode = found;
                return true;
            }
        }
        this.currentNode = this.rootNode;
        return true;
    }

    focus(id: string): AccessibleNode | undefined {
        const node = this.byId.get(id);
        if (node) this.currentNode = node;
        return node;
    }

    private go(node: AccessibleNode | undefined, message: string): AccessibleMove {
        if (!node) return { node: this.currentNode, moved: false, message };
        this.currentNode = node;
        return { node, moved: true };
    }

    private sibling(offset: number, clamp = false, direction?: 'horizontal' | 'vertical'): AccessibleMove {
        const node = this.currentNode;
        const parent = node.parent;
        if (!parent) return { node, moved: false, message: 'Top of the chart. Press Enter to explore.' };
        const siblings = direction
            ? [...parent.children].sort((left, right) => compareReadingBounds(left, right, direction === 'vertical'))
            : parent.children;
        const index = siblings.indexOf(node);
        const target = clamp ? Math.max(0, Math.min(siblings.length - 1, index + offset)) : index + offset;
        if (target === index || target < 0 || target >= siblings.length) {
            return {
                node, moved: false,
                message: `${offset > 0 ? 'End' : 'Start'} of ${parent.kind === 'chart' ? 'the chart' : parent.type.toLowerCase()}.`,
            };
        }
        return this.go(siblings[target], '');
    }

    private directional(direction: 'left' | 'right' | 'up' | 'down'): AccessibleMove {
        const vertical = direction === 'up' || direction === 'down';
        return this.sibling(direction === 'left' || direction === 'up' ? -1 : 1, false, vertical ? 'vertical' : 'horizontal');
    }

    private jump(match: (node: AccessibleNode) => boolean, missing: string): AccessibleMove {
        const candidates = this.rootNode.children.filter(match);
        if (candidates.length === 0) return { node: this.currentNode, moved: false, message: missing };
        let top: AccessibleNode | undefined = this.currentNode;
        while (top?.parent && top.parent !== this.rootNode) top = top.parent;
        const at = top ? candidates.indexOf(top) : -1;
        return this.go(candidates[(at + 1) % candidates.length], missing);
    }

    run(command: AccessibleCommand): AccessibleMove {
        const node = this.currentNode;
        switch (command) {
            case 'next': return this.sibling(1);
            case 'previous': return this.sibling(-1);
            case 'left': case 'right': case 'down': case 'up': return this.directional(command);
            case 'first': return this.sibling(-Infinity, true);
            case 'last': return this.sibling(Infinity, true);
            case 'page-next': return this.sibling(10, true);
            case 'page-previous': return this.sibling(-10, true);
            case 'enter':
                if (node.children.length > 0) return this.go(node.children[0], '');
                return ACTIVATABLE.has(node.kind)
                    ? { node, moved: false, activate: true }
                    : { node, moved: false, message: `${node.type} has nothing inside.` };
            case 'activate':
                return ACTIVATABLE.has(node.kind)
                    ? { node, moved: false, activate: true }
                    : { node, moved: false, message: `${node.type} cannot be activated.` };
            case 'exit':
                return node.parent ? this.go(node.parent, '') : { node, moved: false, exited: true };
            case 'help': return {
                node, moved: false,
                message: `${(node.parent ?? node).readingDirection === 'vertical'
                    ? 'Default reading order is top to bottom.'
                    : 'Default reading order is left to right.'} ${ACCESSIBLE_NAVIGATION_HELP}`,
            };
            case 'repeat': return { node, moved: false, message: describeAccessibleNode(node).text };
            case 'jump-title':
                return this.jump((candidate) => candidate.kind === 'title' || candidate.kind === 'subtitle', 'This chart has no title.');
            case 'jump-x':
                return this.jump((candidate) => candidate.kind === 'axis' && candidate.axis?.channel === 'x', 'This chart has no X axis.');
            case 'jump-y':
                return this.jump((candidate) => candidate.kind === 'axis' && candidate.axis?.channel === 'y', 'This chart has no Y axis.');
            case 'jump-legend': return this.jump((candidate) => candidate.kind === 'legend', 'This chart has no legend.');
            case 'jump-headers': return this.jump((candidate) => candidate.kind === 'headers', 'This chart has no headers.');
            case 'jump-data': return this.jump((candidate) => candidate.kind === 'data', 'This chart has no data marks.');
            default: return { node, moved: false };
        }
    }
}
