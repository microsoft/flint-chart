import { semanticElementRenderKeys, type SemanticElement, type SemanticTarget } from '../../../core/interaction-semantics';
import type {
    AnnotationCandidate,
    AnnotationConnection,
    AnnotationSpec,
    PlotPoint,
} from '../../../interactive/interactions';

type RenderableAnnotation = AnnotationSpec & {
    text: string;
    candidates: readonly AnnotationCandidate[];
};
import {
    INTERACTION_KEY,
    INTERACTION_ROLE,
    PATH_KEY_SUFFIX,
    clientToLayoutPoint,
    clippedBounds,
    pickBounds,
    plotToClientPoint,
    pointInClip,
    sceneContentClip,
    sceneItems,
    type RendererCoordinateSpace,
} from '../hit-adapter';
import {
    routeAnnotationLeaders,
    type AnnotationLeaderRoute,
    type AnnotationPortEdge,
} from './annotation-leader-routing';
import {
    NOTE_LINE_COST,
    balanceNote,
    noteSize,
    noteStyle,
    noteWrapWidths,
    placeNote,
    type ChartTextStyle,
    type NoteObstacle,
    type NotePlacement,
    type NoteSegment,
    type NoteTarget,
} from '../../../core/annotation';
import { rendererTextMeasurer } from '../../../core/text-width';

function keyOfDatum(datum: unknown): string | undefined {
    if (!datum || typeof datum !== 'object') return undefined;
    const key = (datum as Record<string, unknown>)[INTERACTION_KEY];
    return typeof key === 'string' ? key : undefined;
}

interface LayoutRect {
    left: number;
    top: number;
    width: number;
    height: number;
}

interface LayoutObstacle {
    item: any;
    rect: LayoutRect;
    tier: 1 | 2 | 3;
}

interface ConnectionPoint {
    point: PlotPoint;
    preferredAngle?: number;
}

interface AnnotationLayout {
    candidate: AnnotationCandidate;
    connection: ConnectionPoint;
    angle: number;
    distance: number;
    align: 'left' | 'center' | 'right';
    maxWidth: number;
    card: LayoutRect;
    end: PlotPoint;
    score: number;
}

const TAU = Math.PI * 2;
const ANGLE_STEP = Math.PI / 6;
const FREE_ANGLES = Array.from({ length: 12 }, (_, index) => index * ANGLE_STEP);
const OBSTACLE_WEIGHT = { 1: 1, 2: 20, 3: 1_000 } as const;
const PLOT_ESCAPE_WEIGHT = 10;
const CONNECTOR_CROSSING_AREA = 20;

export function annotationObstacleOverlapCost(tier: 1 | 2 | 3, overlap: number): number {
    if (overlap <= 0) return 0;
    return overlap * OBSTACLE_WEIGHT[tier];
}

export function annotationObstacleTier(item: any): 1 | 2 | 3 {
    const role = String(item?.mark?.role ?? '');
    if (role.startsWith('legend') || role.startsWith('axis')) return 3;
    const opacity = typeof item?.opacity === 'number' ? item.opacity : 1;
    return opacity < 0.5 ? 1 : 2;
}

export function isAnnotationObstacle(item: any): boolean {
    return !!item?.mark?.marktype && item.mark.role !== 'axis-grid';
}

export function isAnnotationSourceItem(candidate: any, source: any): boolean {
    if (candidate.mark !== source.mark) return false;
    return source.mark?.marktype === 'area' && source.orient === 'horizontal'
        ? keyOfDatum(candidate.datum) === keyOfDatum(source.datum)
        : candidate.datum === source.datum;
}

export function annotationSourceBounds(items: readonly any[], source: any): {
    x1: number; x2: number; y1: number; y2: number;
} {
    const sourceBounds = annotationBounds(source);
    if (source.mark?.marktype !== 'area' || source.orient !== 'horizontal') return sourceBounds;
    const sourceItems = items.filter((candidate) => isAnnotationSourceItem(candidate, source));
    if (sourceItems.length < 2) return sourceBounds;
    return sourceItems.reduce((bounds, candidate) => ({
        x1: Math.min(bounds.x1, candidate.bounds.x1),
        x2: Math.max(bounds.x2, candidate.bounds.x2),
        y1: Math.min(bounds.y1, candidate.bounds.y1),
        y2: Math.max(bounds.y2, candidate.bounds.y2),
    }), { ...sourceBounds });
}

/** The marks a note card avoids, cut to the part of each that its clip leaves on screen. */
function sceneObstacles(view: any): any[] {
    const obstacles: any[] = [];
    const visit = (item: any, offsetX: number, offsetY: number, clip?: { x1: number; y1: number; x2: number; y2: number }): void => {
        if (!item) return;
        const isGroup = item.mark?.marktype === 'group';
        if (!isGroup && isAnnotationObstacle(item) && item.bounds && (item.opacity ?? 1) > 0) {
            const bounds = clippedBounds({
                x1: item.bounds.x1 + offsetX,
                x2: item.bounds.x2 + offsetX,
                y1: item.bounds.y1 + offsetY,
                y2: item.bounds.y2 + offsetY,
            }, clip);
            if (bounds) obstacles.push({ ...item, bounds });
        }
        const childOffsetX = offsetX + (isGroup && typeof item.x === 'number' ? item.x : 0);
        const childOffsetY = offsetY + (isGroup && typeof item.y === 'number' ? item.y : 0);
        const childClip = sceneContentClip(item, childOffsetX, childOffsetY, clip);
        if (Array.isArray(item.items)) {
            for (const child of item.items) visit(child, childOffsetX, childOffsetY, childClip);
        }
    };
    visit(view.scenegraph()?.root, 0, 0);
    return obstacles;
}

function connectorFor(candidate: AnnotationCandidate): 'line' | 'none' {
    return candidate.connector ?? 'line';
}

/** The connections that point a note at one mark: its centre, a side, a bar's value end. */
const POINTING_CONNECTIONS = new Set<AnnotationConnection>(['center', 'top', 'right', 'bottom', 'left', 'value-end', 'value-side']);

/**
 * Whether a note names one mark it can point at — a dot, a bar, a cell, the point of a line — and so
 * is set as a caption beside it ({@link placeNote}). A note on a stretch of a line or area, a slice,
 * a region, or one joined to several parts of a mark keeps its card.
 */
export function isPointingNote(
    annotation: Pick<AnnotationSpec, 'subject'> & { candidates: readonly AnnotationCandidate[] },
    item: any,
    rowPoint?: PlotPoint,
): boolean {
    if (annotation.subject?.kind === 'region') return false;
    const first = annotation.candidates[0];
    if (!first || !POINTING_CONNECTIONS.has(first.connection) || first.connectorAnchors?.length) return false;
    if (rowPoint) return true;
    if (item?.interactionGeometry) return false;
    return item?.mark?.marktype === 'symbol' || item?.mark?.marktype === 'rect';
}

/**
 * Which rect marks tile the plot, as a heatmap's cells do: their rects cover most of it (`plotArea`, in
 * the scene's units) and do not stand on one baseline. Bars share their foot (or, run across, their
 * start), however much of the plot a histogram's fill; cells in a grid share neither.
 */
export function tiledRects(
    boxes: readonly { item: any; bounds: { x1: number; x2: number; y1: number; y2: number } }[],
    plotArea: number,
): (mark: unknown) => boolean {
    const marks = new Map<unknown, { area: number; foot: Map<number, number>; start: Map<number, number>; count: number }>();
    for (const { item, bounds } of boxes) {
        if (item.mark?.marktype !== 'rect') continue;
        const entry = marks.get(item.mark) ?? { area: 0, foot: new Map(), start: new Map(), count: 0 };
        entry.area += Math.abs((bounds.x2 - bounds.x1) * (bounds.y2 - bounds.y1));
        const foot = Math.round(Math.max(bounds.y1, bounds.y2));
        const start = Math.round(Math.min(bounds.x1, bounds.x2));
        entry.foot.set(foot, (entry.foot.get(foot) ?? 0) + 1);
        entry.start.set(start, (entry.start.get(start) ?? 0) + 1);
        entry.count += 1;
        marks.set(item.mark, entry);
    }
    const tiled = new Set<unknown>();
    for (const [mark, entry] of marks) {
        if (entry.area < plotArea * 0.6) continue;
        const shared = Math.max(...entry.foot.values(), ...entry.start.values());
        if (entry.count >= 2 && shared >= entry.count * 0.8) continue;
        tiled.add(mark);
    }
    return (mark) => tiled.has(mark);
}

/**
 * What a caption keeps clear of, cut to what each clip leaves on screen: marks and text as boxes,
 * and thin ink — lines, rules, axis domains — as segments, since a line's box spans the whole plot.
 * Gridlines and filled areas are left to the caption's halo.
 */
export function sceneInk(view: any): { boxes: { item: any; bounds: { x1: number; x2: number; y1: number; y2: number } }[]; segments: NoteSegment[] } {
    const boxes: { item: any; bounds: { x1: number; x2: number; y1: number; y2: number } }[] = [];
    const segments: NoteSegment[] = [];
    const visit = (node: any, offsetX: number, offsetY: number, clip?: { x1: number; y1: number; x2: number; y2: number }): void => {
        if (!node) return;
        // A line mark's items are its points: the line runs between them.
        if ((node.marktype === 'line' || node.marktype === 'trail') && node.role !== 'axis-grid' && Array.isArray(node.items)) {
            const points = node.items.filter((point: any) => point.defined !== false && typeof point.x === 'number' && typeof point.y === 'number'
                && (point.opacity ?? 1) > 0);
            for (let index = 1; index < points.length; index++) {
                segments.push({
                    a: { x: points[index - 1].x + offsetX, y: points[index - 1].y + offsetY },
                    b: { x: points[index].x + offsetX, y: points[index].y + offsetY },
                });
            }
            return;
        }
        const type = node.mark?.marktype;
        const isGroup = type === 'group';
        if (!isGroup && type && isAnnotationObstacle(node) && (node.opacity ?? 1) > 0) {
            if (type === 'rule') {
                if (typeof node.x === 'number' && typeof node.y === 'number') {
                    segments.push({
                        a: { x: node.x + offsetX, y: node.y + offsetY },
                        b: { x: (typeof node.x2 === 'number' ? node.x2 : node.x) + offsetX, y: (typeof node.y2 === 'number' ? node.y2 : node.y) + offsetY },
                    });
                }
            } else if (type !== 'area' && node.bounds) {
                const bounds = clippedBounds({
                    x1: node.bounds.x1 + offsetX, x2: node.bounds.x2 + offsetX,
                    y1: node.bounds.y1 + offsetY, y2: node.bounds.y2 + offsetY,
                }, clip);
                if (bounds) boxes.push({ item: node, bounds });
            }
        }
        const childOffsetX = offsetX + (isGroup && typeof node.x === 'number' ? node.x : 0);
        const childOffsetY = offsetY + (isGroup && typeof node.y === 'number' ? node.y : 0);
        const childClip = sceneContentClip(node, childOffsetX, childOffsetY, clip);
        if (Array.isArray(node.items)) for (const child of node.items) visit(child, childOffsetX, childOffsetY, childClip);
    };
    visit(view.scenegraph()?.root, 0, 0);
    return { boxes, segments };
}

/** The chart's own label face and ink, read from its axis labels, and its background. */
export function chartTextStyle(view: any, boxes: readonly { item: any }[]): ChartTextStyle {
    const label = boxes.find(({ item }) => item.mark?.role === 'axis-label')?.item
        ?? boxes.find(({ item }) => item.mark?.marktype === 'text')?.item;
    const background = typeof view.background === 'function' ? view.background() : undefined;
    return {
        ...(typeof label?.font === 'string' ? { font: label.font } : {}),
        ...(typeof label?.fontSize === 'number' ? { fontSize: label.fontSize } : {}),
        ...(label?.fontWeight !== undefined ? { fontWeight: label.fontWeight } : {}),
        ...(typeof label?.fill === 'string' ? { color: label.fill } : {}),
        ...(typeof background === 'string' ? { background } : {}),
    };
}

function overlapArea(a: LayoutRect, b: LayoutRect): number {
    const width = Math.max(0, Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left));
    const height = Math.max(0, Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top));
    return width * height;
}

function rectDistance(a: LayoutRect, b: LayoutRect): number {
    const deltaX = Math.max(a.left - b.left - b.width, b.left - a.left - a.width, 0);
    const deltaY = Math.max(a.top - b.top - b.height, b.top - a.top - a.height, 0);
    return Math.hypot(deltaX, deltaY);
}

function overflowDistance(inner: LayoutRect, outer: LayoutRect, padding: number): number {
    return Math.max(0, outer.left + padding - inner.left)
        + Math.max(0, inner.left + inner.width + padding - outer.left - outer.width)
        + Math.max(0, outer.top + padding - inner.top)
        + Math.max(0, inner.top + inner.height + padding - outer.top - outer.height);
}

function segmentIntersectsRect(
    start: PlotPoint,
    end: PlotPoint,
    rect: LayoutRect,
    ignoreStartTouch = false,
): boolean {
    const deltaX = end.x - start.x;
    const deltaY = end.y - start.y;
    let entry = 0;
    let exit = 1;
    const clip = (direction: number, offset: number): boolean => {
        if (direction === 0) return offset >= 0;
        const ratio = offset / direction;
        if (direction < 0) entry = Math.max(entry, ratio);
        else exit = Math.min(exit, ratio);
        return entry <= exit;
    };
    const intersects = clip(-deltaX, start.x - rect.left)
        && clip(deltaX, rect.left + rect.width - start.x)
        && clip(-deltaY, start.y - rect.top)
        && clip(deltaY, rect.top + rect.height - start.y);
    if (!intersects) return false;
    return ignoreStartTouch ? exit > 0.02 && entry < 0.98 : exit >= 0 && entry <= 1;
}

function textAlignForPort(edge: AnnotationPortEdge): 'left' | 'center' | 'right' {
    if (edge === 'left') return 'left';
    if (edge === 'right') return 'right';
    return 'center';
}

export function sourceEdgeAttachment(
    source: LayoutRect,
    card: LayoutRect,
    connection: AnnotationConnection,
    fallback: PlotPoint,
): PlotPoint {
    const cardCenterX = card.left + card.width / 2;
    const cardCenterY = card.top + card.height / 2;
    const sourceCenterX = source.left + source.width / 2;
    const sourceCenterY = source.top + source.height / 2;
    if (connection === 'top' || connection === 'bottom') {
        return {
            x: source.left + source.width * (cardCenterX < sourceCenterX ? 0.25 : 0.75),
            y: connection === 'top' ? source.top : source.top + source.height,
        };
    }
    if (connection === 'left' || connection === 'right') {
        return {
            x: connection === 'left' ? source.left : source.left + source.width,
            y: source.top + source.height * (cardCenterY < sourceCenterY ? 0.25 : 0.75),
        };
    }
    return fallback;
}

export function annotationPrimaryAnchor(
    item: any,
    source: LayoutRect,
    card: LayoutRect,
    connection: AnnotationConnection,
    fallback: PlotPoint,
): PlotPoint {
    if (item?.interactionGeometry
        && ['top', 'right', 'bottom', 'left', 'segment-midpoint'].includes(connection)) {
        return fallback;
    }
    return sourceEdgeAttachment(source, card, connection, fallback);
}

function routeIntersectsRect(route: AnnotationLeaderRoute, rect: LayoutRect, ignoreStartTouch = false): boolean {
    return route.points.slice(1).some((point, index) =>
        segmentIntersectsRect(route.points[index], point, rect, ignoreStartTouch && index === 0));
}

function vectorAngle(deltaX: number, deltaY: number): number {
    return (Math.atan2(deltaY, deltaX) + TAU) % TAU;
}

function angularDistance(a: number, b: number): number {
    const difference = Math.abs(a - b) % TAU;
    return Math.min(difference, TAU - difference);
}

export function valueEndConnectionPoint(
    item: any,
    items: readonly any[],
    valueAxis?: 'x' | 'y',
): { point: PlotPoint; preferredAngle: number } {
    const center = {
        x: (item.bounds.x1 + item.bounds.x2) / 2,
        y: (item.bounds.y1 + item.bounds.y2) / 2,
    };
    const horizontal = valueAxis ? valueAxis === 'x'
        : item.bounds.x2 - item.bounds.x1 >= item.bounds.y2 - item.bounds.y1;
    const countAt = (edge: 'x1' | 'x2' | 'y1' | 'y2', value: number): number => items
        .filter((candidate) => Math.abs(candidate.bounds[edge] - value) < 0.5)
        .length;
    if (horizontal) {
        const leftIsBaseline = countAt('x1', item.bounds.x1) >= countAt('x2', item.bounds.x2);
        return {
            point: { x: leftIsBaseline ? item.bounds.x2 : item.bounds.x1, y: center.y },
            preferredAngle: leftIsBaseline ? 0 : TAU * 0.5,
        };
    }
    const topIsBaseline = countAt('y1', item.bounds.y1) > countAt('y2', item.bounds.y2);
    return {
        point: { x: center.x, y: topIsBaseline ? item.bounds.y2 : item.bounds.y1 },
        preferredAngle: topIsBaseline ? TAU * 0.25 : TAU * 0.75,
    };
}

export function valueSideConnectionPoint(
    item: any,
    items: readonly any[],
    valueAxis: 'x' | 'y',
    crossSide: 'start' | 'end',
    valueInset = 1 / 8,
): { point: PlotPoint; preferredAngle: number } {
    const valueEnd = valueEndConnectionPoint(item, items, valueAxis).point;
    const inset = Math.max(0, Math.min(1, valueInset));
    if (valueAxis === 'x') {
        const baseline = valueEnd.x === item.bounds.x1 ? item.bounds.x2 : item.bounds.x1;
        return {
            point: {
                x: valueEnd.x + (baseline - valueEnd.x) * inset,
                y: crossSide === 'start' ? item.bounds.y1 : item.bounds.y2,
            },
            preferredAngle: crossSide === 'start' ? TAU * 0.75 : TAU * 0.25,
        };
    }
    const baseline = valueEnd.y === item.bounds.y1 ? item.bounds.y2 : item.bounds.y1;
    return {
        point: {
            x: crossSide === 'start' ? item.bounds.x1 : item.bounds.x2,
            y: valueEnd.y + (baseline - valueEnd.y) * inset,
        },
        preferredAngle: crossSide === 'start' ? TAU * 0.5 : 0,
    };
}

export function annotationCandidateAngles(
    preferredAngle: number | undefined,
    preference: AnnotationCandidate['anglePreference'] = 'normal',
): readonly number[] {
    if (preferredAngle === undefined) return FREE_ANGLES;
    const offsets = preference === 'oblique'
        ? [-1, 1, -2, 2]
        : [0, -1, 1, -2, 2, -3, 3, -4, 4, -5, 5, 6];
    return offsets.map((offset) => (preferredAngle + offset * ANGLE_STEP + TAU) % TAU);
}

export function annotationItem(
    items: readonly any[],
    key: string,
    subject?: Partial<SemanticTarget['visual']>,
    preferredMarktype?: string,
    preferredRole?: string,
    preferredRecord?: Readonly<Record<string, unknown>>,
): any | undefined {
    const pathKey = key.endsWith(PATH_KEY_SUFFIX);
    const pathTarget = subject?.kind === 'path' || (subject?.kind === undefined && pathKey);
    const sceneKey = pathKey
        ? key.slice(0, -PATH_KEY_SUFFIX.length)
        : key;
    const matching = items.filter((candidate) => candidate.bounds && keyOfDatum(candidate.datum) === sceneKey);
    const semanticCandidates = pathTarget
        ? matching.filter((candidate) => candidate.interactionGeometry)
        : matching.filter((candidate) => !candidate.interactionGeometry);
    const roleCandidates = preferredRole
        ? semanticCandidates.filter((candidate) => candidate.datum?.[INTERACTION_ROLE] === preferredRole)
        : semanticCandidates;
    if (preferredRole && roleCandidates.length === 0) return undefined;
    const candidates = preferredMarktype
        ? roleCandidates.filter((candidate) => candidate.mark?.marktype === preferredMarktype)
        : roleCandidates;
    const available = candidates.length > 0 ? candidates : preferredRole ? roleCandidates : matching;
    const recordFields = preferredRecord
        ? Object.entries(preferredRecord).filter(([field, value]) => !field.startsWith('__')
            && value !== undefined && value !== null && typeof value !== 'object')
        : [];
    const recordMatches = recordFields.length > 0
        ? available.filter((candidate) => recordFields.every(([field, value]) =>
            candidate.datum?.[field] === undefined || Object.is(candidate.datum[field], value)))
        : [];
    const resolved = recordMatches.length > 0 ? recordMatches : available;
    // A value label shares its mark's key, but the note is on the mark it labels.
    const drawn = resolved.filter((candidate) => candidate.mark?.marktype !== 'text');
    const pool = drawn.length > 0 ? drawn : resolved;
    const preferRepresentativePath = pathTarget && recordMatches.length === 0 && pool.length > 1;
    return pool
        .sort((a, b) => {
            const aSpan = Math.max(a.bounds.x2 - a.bounds.x1, a.bounds.y2 - a.bounds.y1);
            const bSpan = Math.max(b.bounds.x2 - b.bounds.x1, b.bounds.y2 - b.bounds.y1);
            return preferRepresentativePath ? bSpan - aSpan : aSpan - bSpan;
        })[0];
}

export function annotationBounds(item: any): { x1: number; x2: number; y1: number; y2: number } {
    const points = item.interactionGeometry?.annotationPoints as readonly PlotPoint[] | undefined;
    if (!points?.length) return item.bounds;
    return {
        x1: Math.min(...points.map((point) => point.x)),
        x2: Math.max(...points.map((point) => point.x)),
        y1: Math.min(...points.map((point) => point.y)),
        y2: Math.max(...points.map((point) => point.y)),
    };
}

/** With `anchor: 'point'`, the end of a line or area segment that draws `record`. */
export function segmentRowPoint(
    item: any,
    record: Readonly<Record<string, unknown>> | undefined,
    anchor: AnnotationSpec['anchor'],
): PlotPoint | undefined {
    const points = item?.interactionGeometry?.annotationPoints as readonly PlotPoint[] | undefined;
    if (anchor !== 'point' || !record || !points || points.length < 2) return undefined;
    const fields = Object.entries(record).filter(([field, value]) => !field.startsWith('__')
        && value !== undefined && value !== null && typeof value !== 'object');
    if (fields.length === 0) return undefined;
    const drawn = (datum: any): boolean => fields.every(([field, value]) => Object.is(datum?.[field], value));
    if (drawn(item.datum)) return points[0];
    if (drawn(item.interactionGeometry.endDatum)) return points[1];
    return undefined;
}

export function segmentMidpointConnectionPoint(
    item: any,
    plotCenter: PlotPoint,
): ConnectionPoint {
    const points = (item.interactionGeometry?.annotationPoints
        ?? item.interactionGeometry?.points) as readonly PlotPoint[] | undefined;
    if (!points || points.length < 2) return { point: plotCenter };
    const point = {
        x: (points[0].x + points[1].x) / 2,
        y: (points[0].y + points[1].y) / 2,
    };
    if (item.interactionGeometry?.kind === 'slice' && item.interactionGeometry.points?.length >= 4) {
        const deltaX = points[1].x - points[0].x;
        const deltaY = points[1].y - points[0].y;
        const fillCenter = {
            x: (item.interactionGeometry.points[2].x + item.interactionGeometry.points[3].x) / 2,
            y: (item.interactionGeometry.points[2].y + item.interactionGeometry.points[3].y) / 2,
        };
        const normal = { x: deltaY, y: -deltaX };
        const towardFill = (fillCenter.x - point.x) * normal.x + (fillCenter.y - point.y) * normal.y;
        const outward = towardFill > 0 ? { x: -normal.x, y: -normal.y } : normal;
        return { point, preferredAngle: vectorAngle(outward.x, outward.y) };
    }
    return { point, preferredAngle: vectorAngle(point.x - plotCenter.x, point.y - plotCenter.y) };
}

export function annotationConnectionPoint(
    item: any,
    connection: AnnotationConnection,
    items: readonly any[],
    plotCenter: PlotPoint,
    valueAxis?: 'x' | 'y',
    crossSide?: 'start' | 'end',
    valueInset?: number,
): ConnectionPoint {
    const center = {
        x: (item.bounds.x1 + item.bounds.x2) / 2,
        y: (item.bounds.y1 + item.bounds.y2) / 2,
    };
    if (item.interactionGeometry && ['top', 'right', 'bottom', 'left'].includes(connection)) {
        const segment = segmentMidpointConnectionPoint(item, plotCenter);
        const preferredAngle = {
            top: TAU * 0.75,
            right: 0,
            bottom: TAU * 0.25,
            left: TAU * 0.5,
        }[connection as 'top' | 'right' | 'bottom' | 'left'];
        return { point: segment.point, preferredAngle };
    }
    if (connection === 'top') return { point: { x: center.x, y: item.bounds.y1 }, preferredAngle: TAU * 0.75 };
    if (connection === 'right') return { point: { x: item.bounds.x2, y: center.y }, preferredAngle: 0 };
    if (connection === 'bottom') return { point: { x: center.x, y: item.bounds.y2 }, preferredAngle: TAU * 0.25 };
    if (connection === 'left') return { point: { x: item.bounds.x1, y: center.y }, preferredAngle: TAU * 0.5 };
    if (connection === 'segment-midpoint') {
        return segmentMidpointConnectionPoint(item, plotCenter);
    }
    if (connection === 'outer-radial' || connection === 'radial-midpoint') {
        const angle = typeof item.startAngle === 'number' && typeof item.endAngle === 'number'
            ? (item.startAngle + item.endAngle) / 2
            : undefined;
        const outerRadius = typeof item.outerRadius === 'number' ? item.outerRadius : undefined;
        const innerRadius = typeof item.innerRadius === 'number' ? item.innerRadius : 0;
        const radius = connection === 'radial-midpoint' && outerRadius !== undefined
            ? (innerRadius + outerRadius) / 2
            : outerRadius;
        if (angle !== undefined && radius !== undefined) {
            const point = { x: item.x + radius * Math.sin(angle), y: item.y - radius * Math.cos(angle) };
            return { point, preferredAngle: vectorAngle(point.x - item.x, point.y - item.y) };
        }
        return { point: center };
    }
    if (connection === 'value-end') {
        return valueEndConnectionPoint(item, items, valueAxis);
    }
    if (connection === 'value-side' && valueAxis && crossSide) {
        return valueSideConnectionPoint(item, items, valueAxis, crossSide, valueInset);
    }
    return { point: center, preferredAngle: vectorAngle(center.x - plotCenter.x, center.y - plotCenter.y) };
}

/**
 * The outline of the mark a caption points at, in the drawing: a dot, a line's point, a bar or a cell.
 * A note at one end of a rect — a bar's value end, a named side — points at that edge, the rest of
 * the rect its `body`.
 */
function noteTarget(
    item: any, rowPoint: PlotPoint | undefined, toLayout: (point: PlotPoint) => PlotPoint, scale: number,
    edgePoint?: PlotPoint,
): { target: NoteTarget; body?: NoteObstacle['box'] } {
    if (rowPoint) {
        const point = toLayout(rowPoint);
        const radius = 3.5 * scale;
        return { target: { shape: 'circle', x: point.x, y: point.y, rx: radius, ry: radius } };
    }
    const leading = toLayout({ x: item.bounds.x1, y: item.bounds.y1 });
    const trailing = toLayout({ x: item.bounds.x2, y: item.bounds.y2 });
    const round = item.mark?.marktype === 'symbol' && (item.shape === undefined || item.shape === 'circle');
    const target: NoteTarget = {
        shape: round ? 'circle' : 'rect',
        x: (leading.x + trailing.x) / 2,
        y: (leading.y + trailing.y) / 2,
        rx: Math.abs(trailing.x - leading.x) / 2,
        ry: Math.abs(trailing.y - leading.y) / 2,
    };
    if (round || !edgePoint) return { target };
    const edge = toLayout(edgePoint);
    const body = { x: target.x - target.rx, y: target.y - target.ry, width: target.rx * 2, height: target.ry * 2 };
    const near = (a: number, b: number) => Math.abs(a - b) <= 0.5;
    if (near(edge.y, body.y) || near(edge.y, body.y + body.height)) {
        return { target: { shape: 'rect', x: target.x, y: edge.y, rx: target.rx, ry: 0 }, body };
    }
    if (near(edge.x, body.x) || near(edge.x, body.x + body.width)) {
        return { target: { shape: 'rect', x: edge.x, y: target.y, rx: 0, ry: target.ry }, body };
    }
    return { target };
}

/**
 * A bar's value label printed past its value face, where a note on the bar continues it: the face
 * moved out to the label's far edge, wide enough to take the label in, so the note reads as one
 * with the printed value ("0.616  Down from 0.706 …") instead of a second annotation pointing past it.
 */
function valueLabelBeyondFace(
    noted: { target: NoteTarget; body?: NoteObstacle['box'] },
    items: readonly any[],
    item: any,
    toBox: (bounds: { x1: number; x2: number; y1: number; y2: number }) => NoteObstacle['box'],
): { face: NoteTarget; items: any[] } | undefined {
    const { target, body } = noted;
    if (!body || target.shape !== 'rect' || (target.rx > 0 && target.ry > 0)) return undefined;
    const key = keyOfDatum(item.datum);
    if (!key) return undefined;
    const labels = items.filter((candidate) => candidate !== item && candidate.mark?.marktype === 'text' && candidate.bounds
        && keyOfDatum(candidate.datum) === key && (candidate.opacity ?? 1) > 0);
    if (labels.length === 0) return undefined;
    const boxes = labels.map((label) => toBox(label.bounds));
    const x1 = Math.min(...boxes.map((b) => b.x));
    const y1 = Math.min(...boxes.map((b) => b.y));
    const x2 = Math.max(...boxes.map((b) => b.x + b.width));
    const y2 = Math.max(...boxes.map((b) => b.y + b.height));
    // A face across x (a horizontal bar's end) has no width; one across y (a column's top) no height.
    const along = target.rx === 0 ? 'x' : 'y';
    const centre = along === 'x' ? body.x + body.width / 2 : body.y + body.height / 2;
    const face = along === 'x' ? target.x : target.y;
    const outward = Math.sign(face - centre) || 1;
    // The label must stand past the face, beside it, not printed inside the bar.
    const beyond = outward > 0 ? (along === 'x' ? x1 : y1) >= face - 2 : (along === 'x' ? x2 : y2) <= face + 2;
    const across = along === 'x'
        ? y1 < target.y + target.ry && y2 > target.y - target.ry
        : x1 < target.x + target.rx && x2 > target.x - target.rx;
    if (!beyond || !across) return undefined;
    const far = along === 'x' ? (outward > 0 ? x2 : x1) : (outward > 0 ? y2 : y1);
    if (along === 'x') {
        const top = Math.min(y1, target.y - target.ry);
        const bottom = Math.max(y2, target.y + target.ry);
        return { face: { shape: 'rect', x: far, y: (top + bottom) / 2, rx: 0, ry: (bottom - top) / 2 }, items: labels };
    }
    const left = Math.min(x1, target.x - target.rx);
    const right = Math.max(x2, target.x + target.rx);
    return { face: { shape: 'rect', x: (left + right) / 2, y: far, rx: (right - left) / 2, ry: 0 }, items: labels };
}

export interface AnnotationOverlayController {
    render(element: SemanticElement, annotation: RenderableAnnotation): void;
    /**
     * True while the note is drawn, false while its target is out of view (the clip hides it,
     * or a live layout dropped it after the note was drawn), undefined before it was ever drawn.
     */
    inView(): boolean | undefined;
    clear(): void;
    sync(): void;
    destroy(): void;
}

export interface AnnotationOverlayOptions {
    view: any;
    container: HTMLElement;
    coordinateSpace(): RendererCoordinateSpace;
    containerLayoutSize(): { width: number; height: number };
    /** Vega marktype the chart anchors annotations to when a key matches several marks. */
    annotationMarkType?: string;
    /**
     * The captions the chart's notes stand in, shared by them: each note takes the next slot when it
     * is made, keeps clear of the captions and leaders in the slots before it, and writes its own.
     * Notes are placed one after another, not jointly.
     */
    placedCaptions?: { slots: (PlacedCaption | undefined)[]; fixed?: PlacedCaption[] };
}

/** A caption already set on the chart: its box and the leader joining it to its mark. */
export interface PlacedCaption {
    box: NoteObstacle['box'];
    leader?: NoteSegment;
    /** Further lines drawn with it, such as an enclosure's outline. */
    segments?: readonly NoteSegment[];
}

export function createAnnotationOverlay({
    view,
    container,
    coordinateSpace,
    containerLayoutSize,
    annotationMarkType,
    placedCaptions,
}: AnnotationOverlayOptions): AnnotationOverlayController {
    const annotationLayer = document.createElement('div');
    annotationLayer.dataset.flintAnnotation = '';
    Object.assign(annotationLayer.style, {
        position: 'absolute', inset: '0', zIndex: '4', pointerEvents: 'none', overflow: 'hidden',
    });
    const annotationSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    Object.assign(annotationSvg.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    const annotationPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    annotationPath.setAttribute('fill', 'none');
    annotationPath.setAttribute('stroke', 'var(--flint-annotation-line-color, #808080)');
    annotationPath.setAttribute('stroke-width', '1.25');
    annotationPath.setAttribute('stroke-linecap', 'round');
    annotationSvg.append(annotationPath);
    // A caption's leader is haloed like its words, so it reads over a filled mark.
    const leaderHalo = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    leaderHalo.setAttribute('fill', 'none');
    leaderHalo.setAttribute('stroke-linecap', 'round');
    leaderHalo.style.display = 'none';
    annotationSvg.insertBefore(leaderHalo, annotationPath);
    const annotationCard = document.createElement('div');
    Object.assign(annotationCard.style, {
        position: 'absolute', color: 'var(--flint-annotation-color, #000)',
        fontFamily: 'var(--flint-annotation-font-family, sans-serif)',
        fontSize: 'var(--flint-annotation-font-size, 11px)',
        fontWeight: 'var(--flint-annotation-font-weight, 400)', lineHeight: 'normal', letterSpacing: '0',
        whiteSpace: 'normal', width: 'max-content', overflowWrap: 'break-word', boxSizing: 'border-box',
        padding: '8px', border: '1px solid var(--flint-annotation-border-color, #d9d9d9)',
        borderRadius: 'var(--flint-annotation-border-radius, 3px)',
        background: 'var(--flint-annotation-surface, rgba(255, 255, 255, 0.95))',
        boxShadow: 'var(--flint-annotation-shadow, 2px 2px 4px rgba(0, 0, 0, 0.1))',
    });
    annotationLayer.append(annotationSvg, annotationCard);
    // A note on one mark is set as words beside it, haloed in the background, not as a card.
    const annotationText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    annotationText.setAttribute('paint-order', 'stroke');
    annotationText.setAttribute('stroke-linejoin', 'round');
    annotationText.style.display = 'none';
    annotationSvg.append(annotationText);
    // The mark a caption names, drawn again above its neighbours with a ring or an outline.
    const annotationCue = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    annotationCue.style.display = 'none';
    annotationSvg.insertBefore(annotationCue, leaderHalo);

    const renderCaption = ({ annotation, item, rowPoint, subject, items, plotCenter, toLayout, plot, canvas }: {
        annotation: RenderableAnnotation; item: any; rowPoint: PlotPoint | undefined; subject: any; items: readonly any[];
        plotCenter: PlotPoint; toLayout: (point: PlotPoint) => PlotPoint;
        plot: NoteObstacle['box']; canvas: NoteObstacle['box'];
    }): NotePlacement => {
        const origin = toLayout({ x: 0, y: 0 });
        const unit = toLayout({ x: 1, y: 0 });
        const scale = Math.hypot(unit.x - origin.x, unit.y - origin.y) || 1;
        const ink = sceneInk(view);
        const base = noteStyle(chartTextStyle(view, ink.boxes));
        const style = { ...base, fontSize: base.fontSize * scale, lineHeight: base.lineHeight * scale, padding: base.padding * scale };
        const measure = rendererTextMeasurer(style.fontSize, style.font, style.fontWeight, 'normal');
        const toBox = (bounds: { x1: number; x2: number; y1: number; y2: number }): NoteObstacle['box'] => {
            const leading = toLayout({ x: bounds.x1, y: bounds.y1 });
            const trailing = toLayout({ x: bounds.x2, y: bounds.y2 });
            return {
                x: Math.min(leading.x, trailing.x), y: Math.min(leading.y, trailing.y),
                width: Math.abs(trailing.x - leading.x), height: Math.abs(trailing.y - leading.y),
            };
        };
        const first = annotation.candidates[0];
        const { point: connectionPoint, preferredAngle } = annotationConnectionPoint(
            subject, first.connection, items, plotCenter, first.valueAxis, first.crossSide, first.valueInset,
        );
        const noted = noteTarget(
            item, rowPoint, toLayout, scale, first.connection === 'center' ? undefined : connectionPoint,
        );
        const ownLabel = valueLabelBeyondFace(noted, items, item, toBox);
        const { target: drawnTarget, body } = ownLabel ? { ...noted, target: ownLabel.face } : noted;
        // A strong highlight rings a dot: the caption and its leader keep off the ring, not the dot.
        const highlight = annotation.highlight ?? 'light';
        const ringed = highlight === 'strong' || highlight === 'exclusive';
        const ringGap = 2.5 * scale;
        const outset = highlight === 'none' || drawnTarget.shape !== 'circle' ? 0
            : ringed ? ringGap + 0.5 * scale : rowPoint ? scale : 0.75 * scale;
        const target = outset > 0 ? { ...drawnTarget, rx: drawnTarget.rx + outset, ry: drawnTarget.ry + outset } : drawnTarget;
        // Rects that tile most of the plot — a heatmap's cells — are a ground the halo reads over, not marks to dodge.
        const tiled = tiledRects(ink.boxes, Math.max(1, plot.width * plot.height) / (scale * scale));
        const obstacles: NoteObstacle[] = ink.boxes.flatMap(({ item: inkItem, bounds }) => {
            if (isAnnotationSourceItem(inkItem, item)) return [];
            // The mark's own value label is part of what the note continues, not a neighbour to dodge.
            if (ownLabel?.items.includes(inkItem)) return [];
            const box = toBox(bounds);
            // The target's own ink — its point drawn over its line — is the target, not a neighbour.
            const own = box.x <= drawnTarget.x && drawnTarget.x <= box.x + box.width && box.y <= drawnTarget.y && drawnTarget.y <= box.y + box.height
                && box.width <= drawnTarget.rx * 2 + 6 && box.height <= drawnTarget.ry * 2 + 6;
            if (own) return [];
            const kind: NoteObstacle['kind'] = inkItem.mark?.marktype === 'text' ? 'text'
                : (typeof inkItem.opacity === 'number' ? inkItem.opacity : 1) < 0.5 || tiled(inkItem.mark) ? 'faint' : 'mark';
            return [{ box, kind }];
        });
        const earlier = earlierCaptions();
        for (const caption of earlier) if (caption.box.width > 0) obstacles.push({ box: caption.box, kind: 'text' });
        const segments = [
            ...ink.segments.map((segment) => ({ a: toLayout(segment.a), b: toLayout(segment.b) })),
            ...earlier.flatMap((caption) => [...(caption.leader ? [caption.leader] : []), ...(caption.segments ?? [])]),
        ];
        // Wrap widths are in the chart's px; the measure is at the drawing's scale.
        const widths = first.maxWidth ? [first.maxWidth] : noteWrapWidths(annotation.text, (text) => measure(text) / scale);
        let best: { placed: NotePlacement; lines: string[]; cost: number } | undefined;
        const tried = new Set<string>();
        for (const maxWidth of widths) {
            const lines = balanceNote(annotation.text, maxWidth * scale, measure);
            if (tried.has(lines.join('\n'))) continue;
            tried.add(lines.join('\n'));
            const placed = placeNote({
                target, ...(body ? { body } : {}), label: noteSize(lines, style, measure), plot, canvas, obstacles, segments,
                ...(preferredAngle !== undefined ? { preferredAngle } : {}),
                connector: first.connector === 'none' ? 'none' : 'auto',
                fontSize: style.fontSize,
            });
            const cost = placed.cost + NOTE_LINE_COST * (lines.length - 1);
            if (!best || cost < best.cost) best = { placed, lines, cost };
        }
        const { placed, lines } = best!;
        const { box, align, leader } = placed;
        annotationCard.style.display = 'none';
        annotationText.style.display = '';
        annotationText.setAttribute('font-family', style.font);
        annotationText.setAttribute('font-size', String(style.fontSize));
        annotationText.setAttribute('font-weight', String(style.fontWeight));
        annotationText.setAttribute('text-anchor', align === 'left' ? 'start' : align === 'right' ? 'end' : 'middle');
        annotationText.style.fill = `var(--flint-annotation-color, ${style.color})`;
        annotationText.style.stroke = `var(--flint-annotation-halo, ${style.halo.color})`;
        annotationText.style.strokeWidth = String(style.halo.width * scale);
        const x = align === 'left' ? box.x + style.padding : align === 'right' ? box.x + box.width - style.padding : box.x + box.width / 2;
        const baseline = box.y + style.padding + style.fontSize * 0.82;
        annotationText.replaceChildren(...lines.map((line, index) => {
            const tspan = document.createElementNS('http://www.w3.org/2000/svg', 'tspan');
            tspan.setAttribute('x', String(x));
            tspan.setAttribute('y', String(baseline + index * style.lineHeight));
            tspan.textContent = line;
            return tspan;
        }));
        annotationPath.setAttribute('stroke', `var(--flint-annotation-line-color, ${style.leader.color})`);
        annotationPath.setAttribute('stroke-width', String(style.leader.width * scale));
        const path = leader ? `M ${leader.from.x} ${leader.from.y} L ${leader.to.x} ${leader.to.y}` : '';
        annotationPath.setAttribute('d', path);
        annotationPath.style.display = leader ? '' : 'none';
        leaderHalo.setAttribute('stroke', `var(--flint-annotation-halo, ${style.halo.color})`);
        leaderHalo.setAttribute('stroke-width', String((style.leader.width + 2) * scale));
        leaderHalo.setAttribute('d', path);
        leaderHalo.style.display = leader ? '' : 'none';
        drawCue(highlight, item, rowPoint, drawnTarget, body, style, scale, ringGap);
        return placed;
    };

    const svgShape = (tag: 'circle' | 'rect', attributes: Record<string, string | number>): SVGElement => {
        const shape = document.createElementNS('http://www.w3.org/2000/svg', tag);
        for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, String(value));
        return shape;
    };
    const paintOf = (value: unknown): string | undefined =>
        typeof value === 'string' && value !== 'transparent' && value !== 'none' ? value : undefined;
    /**
     * The highlight on the mark a caption names, drawn above the chart so the mark stands over its
     * neighbours. Light: a dot drawn again at full strength with a halo, a line's point as a dot in
     * the line's ink, a bar or cell with a faint haloed outline. Strong (and exclusive, whose
     * receding of the rest the runtime does): a thin ring a little out from a dot, a full outline.
     */
    const drawCue = (
        highlight: NonNullable<AnnotationSpec['highlight']>, item: any, rowPoint: PlotPoint | undefined, target: NoteTarget,
        body: NoteObstacle['box'] | undefined, style: ReturnType<typeof noteStyle>, scale: number, ringGap: number,
    ): void => {
        if (highlight === 'none') {
            annotationCue.replaceChildren();
            annotationCue.style.display = 'none';
            return;
        }
        const strong = highlight !== 'light';
        const ink = `var(--flint-annotation-line-color, ${style.leader.color})`;
        const halo = `var(--flint-annotation-halo, ${style.halo.color})`;
        const shapes: SVGElement[] = [];
        if (rowPoint) {
            const color = paintOf(item.stroke) ?? paintOf(item.mark?.items?.[0]?.stroke) ?? style.color;
            shapes.push(svgShape('circle', { cx: target.x, cy: target.y, r: target.rx, fill: color, stroke: halo, 'stroke-width': 1.5 * scale }));
            if (strong) shapes.push(svgShape('circle', { cx: target.x, cy: target.y, r: target.rx + ringGap, fill: 'none', stroke: ink, 'stroke-width': scale }));
        } else if (target.shape === 'circle') {
            const color = paintOf(item.fill) ?? paintOf(item.stroke) ?? style.color;
            shapes.push(svgShape('circle', { cx: target.x, cy: target.y, r: target.rx, fill: color, stroke: halo, 'stroke-width': 1.5 * scale }));
            if (strong) shapes.push(svgShape('circle', { cx: target.x, cy: target.y, r: target.rx + ringGap, fill: 'none', stroke: ink, 'stroke-width': scale }));
        } else {
            const box = body ?? { x: target.x - target.rx, y: target.y - target.ry, width: target.rx * 2, height: target.ry * 2 };
            const outline = { x: box.x, y: box.y, width: Math.max(0, box.width), height: Math.max(0, box.height), fill: 'none' };
            shapes.push(
                svgShape('rect', { ...outline, stroke: halo, 'stroke-width': (strong ? 3 : 2) * scale }),
                svgShape('rect', { ...outline, stroke: ink, 'stroke-width': (strong ? 1.25 : 1) * scale, 'stroke-opacity': strong ? 1 : 0.45 }),
            );
        }
        annotationCue.replaceChildren(...shapes);
        annotationCue.style.display = '';
    };

    // Placement is derived from rendered geometry, so the runtime re-syncs it
    // whenever the renderer is resized or the host rescales the chart.
    let current: { element: SemanticElement; annotation: RenderableAnnotation } | undefined;
    let laidOut: string | undefined;
    let inView: boolean | undefined;
    const slot = placedCaptions ? placedCaptions.slots.push(undefined) - 1 : -1;
    // Regions' and enclosures' captions are drawn first; each note keeps clear of them and of the notes before it.
    const earlierCaptions = (): PlacedCaption[] => [...(placedCaptions?.fixed ?? []), ...(placedCaptions?.slots.slice(0, slot) ?? [])]
        .filter((caption): caption is PlacedCaption => caption !== undefined);
    const holdCaption = (caption: PlacedCaption | undefined): void => {
        if (placedCaptions && slot >= 0) placedCaptions.slots[slot] = caption;
    };

    const clear = (): void => {
        current = undefined;
        laidOut = undefined;
        inView = undefined;
        holdCaption(undefined);
        annotationLayer.remove();
    };
    // A note whose target is out of view keeps its place in `current`, so it comes back on the
    // sync after the target returns.
    const hide = (): void => {
        laidOut = undefined;
        inView = false;
        holdCaption(undefined);
        annotationLayer.remove();
    };
    const render = (element: SemanticElement, annotation: RenderableAnnotation): void => {
        current = { element, annotation };
        const key = semanticElementRenderKeys(element)[0];
        const items = sceneItems(view);
        const item = typeof key === 'string'
            ? annotationItem(
                items,
                key,
                annotation.subject,
                annotationMarkType,
                undefined,
                element.records?.[0],
            )
            : undefined;
        if (!item?.bounds) {
            if (inView === undefined) clear();
            else hide();
            return;
        }
        const rowPoint = segmentRowPoint(item, element.value, annotation.anchor);
        const clip = item.interactionClip;
        const visibility = rowPoint
            ? (pointInClip(rowPoint, clip) ? 'full' : 'none')
            : item.interactionVisibility ?? 'full';
        if (visibility === 'none') {
            hide();
            return;
        }
        inView = true;
        // A shape the clip cuts connects to the part of it on screen.
        const subject = rowPoint
            ? { datum: item.datum, mark: item.mark, bounds: { x1: rowPoint.x, x2: rowPoint.x, y1: rowPoint.y, y2: rowPoint.y } }
            : visibility === 'partial' && !item.interactionGeometry
                ? { ...item, bounds: pickBounds(item) }
                : item;
        if (!annotationLayer.isConnected) container.append(annotationLayer);
        if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

        annotationCard.textContent = annotation.text;
        annotationCard.style.whiteSpace = annotation.text.includes('\n') ? 'pre-line' : 'normal';
        const directValue = annotation.text.length <= 18 && !annotation.text.includes('\n');

        const containerRect = container.getBoundingClientRect();
        const space = coordinateSpace();
        const layoutSize = containerLayoutSize();
        const width = layoutSize.width;
        const height = layoutSize.height;
        const toLayout = (point: PlotPoint): PlotPoint => clientToLayoutPoint(
            plotToClientPoint(point, space), containerRect, layoutSize,
        );
        const obstacles: LayoutObstacle[] = sceneObstacles(view).flatMap((candidate) => {
            if (isAnnotationSourceItem(candidate, item)) return [];
            const leading = toLayout({ x: candidate.bounds.x1, y: candidate.bounds.y1 });
            const trailing = toLayout({ x: candidate.bounds.x2, y: candidate.bounds.y2 });
            return [{
                item: candidate,
                rect: {
                    left: Math.min(leading.x, trailing.x),
                    top: Math.min(leading.y, trailing.y),
                    width: Math.abs(trailing.x - leading.x),
                    height: Math.abs(trailing.y - leading.y),
                },
                tier: annotationObstacleTier(candidate),
            }];
        });
        const plotLeading = toLayout({ x: 0, y: 0 });
        const plotTrailing = toLayout({ x: space.plotWidth, y: space.plotHeight });
        const plotRect: LayoutRect = {
            left: Math.min(plotLeading.x, plotTrailing.x),
            top: Math.min(plotLeading.y, plotTrailing.y),
            width: Math.abs(plotTrailing.x - plotLeading.x),
            height: Math.abs(plotTrailing.y - plotLeading.y),
        };
        const sourceBounds = rowPoint
            ? subject.bounds
            : clippedBounds(annotationSourceBounds(items, item), clip) ?? subject.bounds;
        const sourceLeading = toLayout({ x: sourceBounds.x1, y: sourceBounds.y1 });
        const sourceTrailing = toLayout({ x: sourceBounds.x2, y: sourceBounds.y2 });
        const markSourceRect: LayoutRect = {
            left: Math.min(sourceLeading.x, sourceTrailing.x),
            top: Math.min(sourceLeading.y, sourceTrailing.y),
            width: Math.abs(sourceTrailing.x - sourceLeading.x),
            height: Math.abs(sourceTrailing.y - sourceLeading.y),
        };
        const canvasRect = { left: 0, top: 0, width, height };
        const layoutInputs = JSON.stringify([
            annotation, markSourceRect, plotRect, canvasRect, obstacles.map((obstacle) => obstacle.rect), earlierCaptions(),
        ]);
        if (layoutInputs === laidOut && annotationLayer.isConnected) return;
        holdCaption(undefined);
        const plotCenter = { x: space.plotWidth / 2, y: space.plotHeight / 2 };
        if (isPointingNote(annotation, item, rowPoint)) {
            const placed = renderCaption({
                annotation, item, rowPoint, subject, items, plotCenter, toLayout,
                plot: { x: plotRect.left, y: plotRect.top, width: plotRect.width, height: plotRect.height },
                canvas: { x: 0, y: 0, width, height },
            });
            annotationSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
            annotationLayer.dataset.style = 'caption';
            annotationLayer.dataset.connection = annotation.candidates[0].connection;
            annotationLayer.dataset.angle = String(Math.round(((placed.angle * 180) / Math.PI + 360) % 360));
            annotationLayer.dataset.distance = String(placed.gap);
            annotationLayer.dataset.align = placed.align;
            annotationLayer.dataset.connector = placed.leader ? 'line' : 'none';
            annotationLayer.dataset.score = String(Math.round(placed.cost));
            holdCaption({ box: placed.box, ...(placed.leader ? { leader: { a: placed.leader.from, b: placed.leader.to } } : {}) });
            laidOut = layoutInputs;
            return;
        }
        delete annotationLayer.dataset.style;
        annotationCard.style.display = '';
        annotationText.style.display = 'none';
        leaderHalo.style.display = 'none';
        annotationCue.style.display = 'none';
        annotationPath.setAttribute('stroke', 'var(--flint-annotation-line-color, #808080)');
        annotationPath.setAttribute('stroke-width', '1.25');
        const sourceGap = 10;
        let best: AnnotationLayout | undefined;
        let fallback: AnnotationLayout | undefined;
        const cardSizes = new Map<number, { width: number; height: number }>();
        const cardSize = (maxWidth: number): { width: number; height: number } => {
            let size = cardSizes.get(maxWidth);
            if (!size) {
                annotationCard.style.maxWidth = `${maxWidth}px`;
                size = { width: annotationCard.offsetWidth, height: annotationCard.offsetHeight };
                cardSizes.set(maxWidth, size);
            }
            return size;
        };
        for (const candidate of annotation.candidates) {
            const connection = annotationConnectionPoint(
                subject,
                candidate.connection,
                items,
                plotCenter,
                candidate.valueAxis,
                candidate.crossSide,
                candidate.valueInset,
            );
            const anchor = toLayout(connection.point);
            const boundarySourceRect = { left: anchor.x - 0.5, top: anchor.y - 0.5, width: 1, height: 1 };
            const sourceRect = annotation.subject?.kind === 'region'
                || (candidate.connection === 'segment-midpoint'
                    && !(item.mark?.marktype === 'area' && item.orient === 'horizontal'))
                || candidate.connection === 'outer-radial'
                || candidate.connection === 'radial-midpoint'
                ? { left: anchor.x - 0.5, top: anchor.y - 0.5, width: 1, height: 1 }
                : markSourceRect;
            const connectorSourceRect = annotation.subject?.kind === 'region'
                || candidate.connection === 'outer-radial'
                || candidate.connection === 'radial-midpoint'
                ? boundarySourceRect
                : sourceRect;
            const maxWidths = candidate.maxWidth ? [candidate.maxWidth] : directValue ? [120] : [200, 160, 120];
            const maxDistance = candidate.maxDistance ?? 72;
            const distances = (directValue ? [12, 20, 32, 48, maxDistance] : [28, 44, 60, maxDistance])
                .filter((distance, index, values) => distance <= maxDistance && values.indexOf(distance) === index);
            const angles = annotationCandidateAngles(connection.preferredAngle, candidate.anglePreference);
            for (const angle of angles) {
                for (const distance of distances) {
                for (const maxWidth of maxWidths) {
                    const { width: cardWidth, height: cardHeight } = cardSize(maxWidth);
                    const center = {
                        x: anchor.x + Math.cos(angle) * distance,
                        y: anchor.y + Math.sin(angle) * distance,
                    };
                    const card = {
                        left: center.x - cardWidth / 2,
                        top: center.y - cardHeight / 2,
                        width: cardWidth,
                        height: cardHeight,
                    };
                    const route = routeAnnotationLeaders({ card, sources: [anchor] })[0];
                    if (!route) continue;
                    const align = candidate.textAlign ?? textAlignForPort(route.port.edge);
                    const end = route.port;
                    const canvasOverflow = overflowDistance(card, canvasRect, 8);
                    const plotOverflow = overflowDistance(card, plotRect, 6);
                    const sourceCollision = overlapArea(card, sourceRect);
                    const sourceClearance = rectDistance(card, sourceRect);
                    const obstacleOverlapPenalty = obstacles.reduce((sum, obstacle) => sum
                        + annotationObstacleOverlapCost(obstacle.tier, overlapArea(card, obstacle.rect)), 0);
                    const connectorLength = route.points.slice(1).reduce((sum, point, index) =>
                        sum + Math.hypot(point.x - route.points[index].x, point.y - route.points[index].y), 0);
                    const drawsConnector = connectorFor(candidate) === 'line';
                    const leavesInward = connection.preferredAngle !== undefined
                        && angularDistance(angle, connection.preferredAngle) > Math.PI / 2 + 1e-6;
                    const crossesSource = drawsConnector
                        && annotation.subject?.kind !== 'region'
                        && candidate.connection !== 'outer-radial'
                        && candidate.connection !== 'radial-midpoint'
                        && routeIntersectsRect(route, connectorSourceRect, true);
                    const obstacleCrossingPenalty = drawsConnector
                        ? obstacles.reduce((sum, obstacle) => sum + (
                            routeIntersectsRect(route, obstacle.rect)
                                ? annotationObstacleOverlapCost(obstacle.tier, CONNECTOR_CROSSING_AREA)
                                : 0
                        ), 0)
                        : 0;
                    const directionPenalty = connection.preferredAngle === undefined
                        ? 0
                        : angularDistance(angle, connection.preferredAngle);
                    const inwardPenalty = leavesInward ? 50 : 0;
                    const lineCount = Math.max(1, Math.round((cardHeight - 4) / 15));
                    const wrappingPenalty = Math.max(0, lineCount - 1) * 10;
                    const score = plotOverflow * PLOT_ESCAPE_WEIGHT
                        + obstacleCrossingPenalty + obstacleOverlapPenalty
                        + sourceCollision * OBSTACLE_WEIGHT[2] + connectorLength / 100
                        + directionPenalty + inwardPenalty + wrappingPenalty + (candidate.priority ?? 0) / 100;
                    const fallbackScore = score + canvasOverflow * 10_000
                        + (crossesSource ? 100_000 : 0)
                        + Math.max(0, sourceGap - sourceClearance) * 1_000;
                    if (!fallback || fallbackScore < fallback.score) {
                        fallback = {
                            candidate, connection, angle, distance, align, maxWidth, card, end,
                            score: fallbackScore,
                        };
                    }
                    if (canvasOverflow > 0 || crossesSource || sourceClearance < sourceGap) continue;
                    if (!best || score < best.score) {
                        best = { candidate, connection, angle, distance, align, maxWidth, card, end, score };
                    }
                }
                }
            }
        }
        if (!best && fallback) {
            const card = {
                ...fallback.card,
                left: Math.min(width - fallback.card.width - 8, Math.max(8, fallback.card.left)),
                top: Math.min(height - fallback.card.height - 8, Math.max(8, fallback.card.top)),
            };
            const anchor = toLayout(fallback.connection.point);
            const angle = vectorAngle(
                card.left + card.width / 2 - anchor.x,
                card.top + card.height / 2 - anchor.y,
            );
            const route = routeAnnotationLeaders({ card, sources: [anchor] })[0];
            if (!route) {
                clear();
                return;
            }
            best = {
                ...fallback,
                card,
                angle,
                align: fallback.candidate.textAlign ?? textAlignForPort(route.port.edge),
                end: route.port,
            };
        }
        if (!best) {
            clear();
            return;
        }
        annotationCard.style.maxWidth = `${best.maxWidth}px`;
        annotationCard.style.textAlign = best.align;
        annotationCard.style.left = `${best.card.left}px`;
        annotationCard.style.top = `${best.card.top}px`;
        const connector = connectorFor(best.candidate);
        const connectorAnchors = best.candidate.connectorAnchors?.flatMap((connectorAnchor) => {
            const connectorItem = typeof key === 'string'
                ? annotationItem(items, key, annotation.subject, undefined, connectorAnchor.role)
                : undefined;
            if (!connectorItem) return [];
            const connection = annotationConnectionPoint(
                connectorItem,
                connectorAnchor.connection,
                items,
                plotCenter,
                connectorAnchor.valueAxis,
            );
            return [toLayout(connection.point)];
        });
        const fallbackAnchor = toLayout(best.connection.point);
        const primaryAnchor = annotationPrimaryAnchor(
            subject,
            markSourceRect,
            best.card,
            best.candidate.connection,
            fallbackAnchor,
        );
        const anchors = connectorAnchors?.length ? connectorAnchors : [primaryAnchor];
        const showConnector = connector === 'line' && anchors.length > 0;
        const routes = showConnector ? routeAnnotationLeaders({ card: best.card, sources: anchors }) : [];
        annotationSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        annotationPath.setAttribute('d', showConnector && routes.length === anchors.length
            ? routes.map((route) => route.points
                .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
                .join(' ')).join(' ')
            : '');
        annotationPath.style.display = showConnector && routes.length === anchors.length ? '' : 'none';
        annotationLayer.dataset.connection = best.candidate.connection;
        annotationLayer.dataset.angle = String(Math.round(best.angle * 180 / Math.PI));
        annotationLayer.dataset.distance = String(best.distance);
        annotationLayer.dataset.align = best.align;
        annotationLayer.dataset.connector = connector;
        annotationLayer.dataset.score = String(Math.round(best.score));
        laidOut = layoutInputs;
    };

    return {
        render,
        inView: () => inView,
        clear,
        sync: () => {
            if (current) render(current.element, current.annotation);
        },
        destroy: () => {
            clear();
        },
    };
}
