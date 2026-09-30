import type { AccessibleElementDescription } from '../../../interactive/language/events';
import type { AccessibleNavigationSection, AccessibleNavigationSettings } from '../../../interactive/triggers';
import type { RenderHit } from '../../../core/interaction-contracts';
import {
    INTERACTION_KEY,
    INTERACTION_ROLE,
    legendTarget,
    renderHit,
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
    /** A point-like element gets a round focus ring. */
    readonly shape?: 'rect' | 'point';
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

function formatValue(value: unknown, temporal = false): string {
    if (value instanceof Date) return value.toISOString().slice(0, 10);
    if (typeof value === 'number') {
        if (temporal && Number.isFinite(value)) return new Date(value).toISOString().slice(0, 10);
        return Number.isFinite(value) ? NUMBER_FORMAT.format(value) : String(value);
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
                hit, key, bounds: markBounds, extent, scope: context.scope, path,
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
    const byKey = new Map<string, MarkEntry[]>();
    for (const mark of marks) {
        const group = byKey.get(mark.key);
        if (group) group.push(mark);
        else byKey.set(mark.key, [mark]);
    }
    const result: MarkEntry[] = [];
    for (const group of byKey.values()) {
        const best = group.reduce((current, candidate) =>
            candidate.rank > current.rank || (candidate.rank === current.rank && area(candidate.bounds) > area(current.bounds))
                ? candidate
                : current);
        const pathOwner = group.find((candidate) => candidate.path);
        const vertices = pathOwner ? group.filter((candidate) => candidate.path === pathOwner.path) : [];
        if (vertices.length > 1) {
            const bounds = boundsOf(vertices.map((vertex) => vertex.extent))!;
            result.push({ ...pathOwner!, item: { ...pathOwner!.item, bounds }, bounds, extent: bounds, wholePath: true, vertices });
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
            const text = formatValue(value);
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
    extra: Partial<Pick<AccessibleNode, 'bounds' | 'shape' | 'children' | 'item' | 'members' | 'axis' | 'legend'>> = {},
): AccessibleNode {
    return { id: localId, localId, kind, type, content, children: [], members: [], ...extra };
}

/** A structural copy placed under another parent; ids are assigned when the tree is finalised. */
function cloneNode(node: AccessibleNode): AccessibleNode {
    return { ...node, parent: undefined, children: node.children.map(cloneNode) };
}

function finalize(node: AccessibleNode, parent?: AccessibleNode): void {
    node.parent = parent;
    node.id = parent ? `${parent.id}/${node.localId}` : node.localId;
    const seen = new Map<string, number>();
    for (const child of node.children) {
        const count = seen.get(child.localId) ?? 0;
        seen.set(child.localId, count + 1);
        if (count > 0) child.localId = `${child.localId}#${count}`;
        finalize(child, node);
    }
}

/** Reading order: angle round a pie, down a horizontal bar chart, otherwise left to right. */
function sortReadingOrder(marks: readonly MarkEntry[], input: AccessibleTreeInput): MarkEntry[] {
    const axes = input.axisFields ?? {};
    const yFirst = isDiscreteType(axes.y?.type) && !isDiscreteType(axes.x?.type);
    return [...marks].sort((left, right) => {
        if (left.item.mark?.marktype === 'arc' && right.item.mark?.marktype === 'arc') {
            return (left.item.startAngle ?? 0) - (right.item.startAngle ?? 0);
        }
        const a = center(left.bounds);
        const b = center(right.bounds);
        const primary = yFirst ? a.y - b.y : a.x - b.x;
        if (Math.abs(primary) > 0.5) return primary;
        return yFirst ? a.x - b.x : a.y - b.y;
    });
}

function markNode(mark: MarkEntry, context: BuildContext): AccessibleNode {
    const marktype = mark.item.mark?.marktype;
    return nodeOf('mark', `mark:${mark.key}`, context.noun(marktype, mark.wholePath)[0], markContent(mark, context), {
        bounds: mark.bounds,
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
            channel === 'x' ? center(left.bounds).x - center(right.bounds).x : left.index - right.index);
        const title = axis.title?.text ?? field?.field ?? '';
        const scopeTitle = axesPerChannel(channel) > 1 && axis.scope ? facts.scopes.get(axis.scope)?.title?.text : undefined;
        const axisType = `${channel.toUpperCase()} axis`;
        const range = labels.length === 0 ? 'no labels'
            : labels.length === 1 ? `1 label: ${labels[0].text}`
            : `${labels.length} labels, from ${labels[0].text} to ${labels[labels.length - 1].text}`;
        const axisChildren: AccessibleNode[] = [];
        if (axis.title) {
            axisChildren.push(nodeOf('axis-title', 'title', `${axisType} title`, axis.title.text, {
                bounds: axis.title.bounds, item: axis.title.item,
            }));
        }
        for (const label of labels) {
            const members = discrete && field
                ? sortReadingOrder(membersWhere(marks, (datum) => sameValue(datum[field.field], label.value)), input)
                : [];
            axisChildren.push(nodeOf('axis-label', `label:${label.text}`, `${axisType} label`,
                members.length > 0 ? `${label.text}. ${nounSummary(members, context)}` : label.text, {
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
            : legend.channel ? `${capitalize(legend.channel)} legend`
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
        for (const entry of entries) {
            const identity = entry.labelItem
                ? legendTarget(entry.labelItem, input.legendFields, input.rangeLegendChannels) ?? undefined
                : undefined;
            const identityField = identity?.field ?? field;
            const domain = identity?.domain;
            const members = identityField
                ? sortReadingOrder(membersWhere(marks, (datum) => {
                    const value = datum[identityField];
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
            legendChildren.push(nodeOf('legend-item', `item:${entry.text}`, legend.gradient ? 'Legend value' : 'Legend item',
                `${prefix}${entry.text}${rangeText}${members.length > 0 ? `. ${nounSummary(members, context)}` : ''}`, {
                    bounds: entry.bounds,
                    item: entry.labelItem,
                    members,
                    children: members.map((mark) => markNode(mark, context)),
                    ...(identity ? { legend: identity } : {}),
                }));
        }
        const values = entries.map((entry) => entry.text);
        const summary = legend.gradient
            ? values.length > 1 ? `Scale from ${values[0]} to ${values[values.length - 1]}` : `${values.length} values`
            : `${values.length} ${values.length === 1 ? 'item' : 'items'}: ${listPhrase(values)}`;
        const named = legend.title?.text ?? spokenField ?? 'Untitled';
        legendSummaries.push(`${legendType.toLowerCase()} ${named}`);
        if (sections.includes('legends')) {
            children.push(nodeOf('legend', `legend:${legendIndex}`, legendType, `${named}. ${summary}`, {
                bounds: legend.bounds,
                item: legend.item,
                children: legendChildren,
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
    finalize(root);
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

export function describeAccessibleNode(node: AccessibleNode): AccessibleElementDescription {
    const siblings = node.parent?.children;
    const position = siblings ? { index: siblings.indexOf(node) + 1, count: siblings.length } : undefined;
    const path: string[] = [];
    for (let cursor: AccessibleNode | undefined = node; cursor; cursor = cursor.parent) path.unshift(cursor.type);
    const text = node.kind === 'chart'
        ? `${node.content}. Press Enter to explore ${node.children.length} parts, or H for help.`
        : `${node.type}${position && position.count > 1 ? ` ${position.index} of ${position.count}` : ''}. ${node.content}.`;
    return {
        kind: node.kind,
        type: node.type,
        content: node.content,
        ...(position ? { position } : {}),
        childCount: node.children.length,
        path,
        text: text.replace(/\.(\s*\.)+/g, '.'),
    };
}

export const ACCESSIBLE_NAVIGATION_HELP = [
    'Chart navigation keys.',
    'Left and right arrows: previous and next element.',
    'Up and down arrows: the mark above or below, or previous and next in a list.',
    'Enter: go into the focused element. Escape or Backspace: go back out.',
    'Home and End: first and last element. Page Up and Page Down: jump ten elements.',
    'Space: activate the focused mark, legend item, or axis label.',
    'T: title. X and Y: axes. L: legend. F: facet headers. D: data. I: repeat. H: this help.',
].join(' ');

export type AccessibleCommand =
    | 'next' | 'previous' | 'up' | 'down' | 'first' | 'last' | 'page-next' | 'page-previous'
    | 'enter' | 'exit' | 'activate' | 'help' | 'repeat'
    | 'jump-title' | 'jump-x' | 'jump-y' | 'jump-legend' | 'jump-headers' | 'jump-data';

export function accessibleCommandForKey(event: {
    key: string; altKey?: boolean; ctrlKey?: boolean; metaKey?: boolean;
}): AccessibleCommand | undefined {
    if (event.altKey || event.ctrlKey || event.metaKey) return undefined;
    switch (event.key) {
        case 'ArrowRight': return 'next';
        case 'ArrowLeft': return 'previous';
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

function nearestInDirection(
    candidates: readonly AccessibleNode[],
    from: AccessibleBounds,
    direction: 'up' | 'down',
): AccessibleNode | undefined {
    const origin = center(from);
    let best: { node: AccessibleNode; score: number } | undefined;
    for (const candidate of candidates) {
        if (!candidate.bounds) continue;
        const point = center(candidate.bounds);
        const along = direction === 'down' ? point.y - origin.y : origin.y - point.y;
        if (along <= 0.5) continue;
        const across = Math.abs(point.x - origin.x);
        // A mark in the same column wins over a nearer one beside it; nothing past 45° counts as above or below.
        const overlaps = candidate.bounds.x1 <= from.x2 + 0.5 && candidate.bounds.x2 >= from.x1 - 0.5;
        if (!overlaps && across > along) continue;
        const score = (overlaps ? 0 : 1e6) + along + across * 3;
        if (!best || score < best.score) best = { node: candidate, score };
    }
    return best?.node;
}

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
 * (a hidden series, a resize) keeps the reader where they were.
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

    refresh(): void {
        const previous = this.currentNode;
        this.rootNode = this.build();
        this.reindex();
        for (let cursor: AccessibleNode | undefined = previous; cursor; cursor = cursor.parent) {
            const found = this.byId.get(cursor.id);
            if (found) {
                this.currentNode = found;
                return;
            }
        }
        this.currentNode = this.rootNode;
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

    private sibling(offset: number, clamp = false): AccessibleMove {
        const node = this.currentNode;
        const parent = node.parent;
        if (!parent) return { node, moved: false, message: 'Top of the chart. Press Enter to explore.' };
        const siblings = parent.children;
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

    private vertical(direction: 'up' | 'down'): AccessibleMove {
        const node = this.currentNode;
        const parent = node.parent;
        if (!parent) return { node, moved: false, message: 'Top of the chart. Press Enter to explore.' };
        if (node.kind === 'mark' && node.bounds) {
            // On a series, up and down switch to the series above or below; elsewhere marks move in space.
            const pool = parent.kind === 'series' && parent.parent
                ? parent.parent.children.flatMap((child) =>
                    child === parent ? [] : child.kind === 'series' ? child.children : [child])
                : parent.children;
            const target = nearestInDirection(
                pool.filter((candidate) => candidate !== node && candidate.kind === 'mark'), node.bounds, direction);
            return this.go(target, `No mark ${direction === 'up' ? 'above' : 'below'}.`);
        }
        if (parent.kind !== 'chart' && node.bounds && isVerticalList(parent.children)) {
            const target = nearestInDirection(parent.children.filter((candidate) => candidate !== node), node.bounds, direction);
            return this.go(target, `${direction === 'up' ? 'Top' : 'Bottom'} of ${parent.type.toLowerCase()}.`);
        }
        return this.sibling(direction === 'up' ? -1 : 1);
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
            case 'down': return this.vertical('down');
            case 'up': return this.vertical('up');
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
            case 'help': return { node, moved: false, message: ACCESSIBLE_NAVIGATION_HELP };
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
