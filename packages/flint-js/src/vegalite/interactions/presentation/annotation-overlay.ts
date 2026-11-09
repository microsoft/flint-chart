import { semanticElementRenderKeys, type SemanticElement, type SemanticTarget } from '../../../core/interaction-semantics';
import type {
    AnnotationCandidate,
    AnnotationConnection,
    AnnotationSpec,
    PlotPoint,
} from '../../../interactive/interactions';
import type { PresentedAnnotationSpec } from '../../../core/interaction-contracts';

type RenderableAnnotation = PresentedAnnotationSpec & {
    text: string;
    candidates: readonly AnnotationCandidate[];
};
import {
    INTERACTION_KEY,
    INTERACTION_ROLE,
    PATH_KEY_SUFFIX,
    clientToLayoutPoint,
    clippedBounds,
    legPoints,
    pickBounds,
    plotToClientPoint,
    pointInClip,
    sceneContentClip,
    sceneItems,
    type RendererCoordinateSpace,
} from '../hit-adapter';
import { ROUTE_PART } from '../../templates/map-routes';
import {
    NOTE_LINE_COST,
    balanceNote,
    noteSize,
    noteStyle,
    noteWrapWidths,
    inkOn,
    leaderSegments,
    placeNote,
    type ChartTextStyle,
    type NoteObstacle,
    type NotePlacement,
    type NoteSegment,
    type NoteTarget,
} from '../../../core/annotation';
import { rendererTextMeasurer } from '../../../core/text-width';
import type { AnnotationDesign } from '../../../core/theme/types';

function keyOfDatum(datum: unknown): string | undefined {
    if (!datum || typeof datum !== 'object') return undefined;
    const key = (datum as Record<string, unknown>)[INTERACTION_KEY];
    return typeof key === 'string' ? key : undefined;
}

interface ConnectionPoint {
    point: PlotPoint;
    preferredAngle?: number;
}

const TAU = Math.PI * 2;
/** The clear gap between a strongly highlighted dot and the ring round it, in px. */
const RING_GAP = 2.5;

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
        // A map route's leg is a line too, its casing the same line again: segments, not their boxes.
        const routePart = type === 'shape' ? node.datum?.[ROUTE_PART] : undefined;
        if (routePart === 'leg' && (node.opacity ?? 1) > 0) {
            const points = legPoints(node);
            for (let index = 1; index < points.length; index++) {
                segments.push({
                    a: { x: points[index - 1].x + offsetX, y: points[index - 1].y + offsetY },
                    b: { x: points[index].x + offsetX, y: points[index].y + offsetY },
                });
            }
            return;
        }
        if (routePart === 'casing') return;
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

/**
 * What Flint draws beside the chart rather than in it — the source line, a map's credit, a house's
 * header and its rules — as boxes in the layout, read off the layer that draws them: no caption
 * stands on them.
 */
export function canvasFurnitureBoxes(
    container: HTMLElement, containerRect: DOMRect, layoutSize: { width: number; height: number },
): { x: number; y: number; width: number; height: number }[] {
    const layer = container.querySelector(':scope > .flint-canvas-furniture');
    const round = (value: number) => Math.round(value * 10) / 10;
    // A chart overlay's words (a sea's name, a label set by `set-overlay`) are text a caption keeps
    // off as it does the chart's own, though they are drawn outside Vega's scene.
    const elements = [
        ...(layer ? layer.querySelectorAll('text, image, rect, line') : []),
        ...container.querySelectorAll('text[data-flint-overlay]'),
    ];
    return elements.flatMap((element) => {
        if (element.closest('defs, pattern')) return [];
        const rect = element.getBoundingClientRect();
        if (rect.width <= 0 && rect.height <= 0) return [];
        const a = clientToLayoutPoint({ x: rect.left, y: rect.top }, containerRect, layoutSize);
        const b = clientToLayoutPoint({ x: rect.right, y: rect.bottom }, containerRect, layoutSize);
        return [{ x: round(Math.min(a.x, b.x)), y: round(Math.min(a.y, b.y)), width: round(Math.abs(b.x - a.x)), height: round(Math.abs(b.y - a.y)) }];
    });
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

function vectorAngle(deltaX: number, deltaY: number): number {
    return (Math.atan2(deltaY, deltaX) + TAU) % TAU;
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
    if (drawn(item.interactionGeometry.endDatum)) return points[points.length - 1];
    return undefined;
}

/**
 * The point a fraction of the way along a path, by its length: a line's segment is two points, a
 * map route's leg the many its curve is drawn through.
 */
export function pointAlongPath(points: readonly PlotPoint[], at: number): PlotPoint {
    if (points.length < 2) return points[0];
    const lengths = points.slice(1).map((point, index) => Math.hypot(point.x - points[index].x, point.y - points[index].y));
    let remaining = Math.max(0, Math.min(1, at)) * lengths.reduce((sum, length) => sum + length, 0);
    for (let index = 0; index < lengths.length; index++) {
        if (remaining <= lengths[index] || index === lengths.length - 1) {
            const t = lengths[index] === 0 ? 0 : Math.min(1, remaining / lengths[index]);
            const [a, b] = [points[index], points[index + 1]];
            return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
        }
        remaining -= lengths[index];
    }
    return points[points.length - 1];
}

/** A path's length, in the units its points are in. */
function pathLength(points: readonly PlotPoint[]): number {
    return points.slice(1).reduce((sum, point, index) => sum + Math.hypot(point.x - points[index].x, point.y - points[index].y), 0);
}

export function segmentMidpointConnectionPoint(
    item: any,
    plotCenter: PlotPoint,
): ConnectionPoint {
    const points = (item.interactionGeometry?.annotationPoints
        ?? item.interactionGeometry?.points) as readonly PlotPoint[] | undefined;
    if (!points || points.length < 2) return { point: plotCenter };
    // Halfway along: on a curved path, on the curve rather than its chord.
    const point = points.length > 2 ? pointAlongPath(points, 0.5) : {
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

/** The connections that point a note at one place on its mark: its centre, a side, a bar's value end. */
const POINTING_CONNECTIONS = new Set<AnnotationConnection>(['center', 'top', 'right', 'bottom', 'left', 'value-end', 'value-side']);

/**
 * What a note names, which decides where its caption may stand and how the mark is cued: one `mark`
 * (a dot, a bar, a cell, a line's point), a `stretch` of a line or area, a pie's `slice`, a whole
 * `shape` (a violin), or a map's `region`. Every one is captioned the same way ({@link placeNote}).
 */
export type NoteSubjectKind = 'mark' | 'stretch' | 'slice' | 'shape' | 'region';

export function noteSubjectKind(
    annotation: Pick<PresentedAnnotationSpec, 'subject'>,
    item: any,
    items: readonly any[],
    rowPoint?: PlotPoint,
): NoteSubjectKind {
    if (rowPoint) return 'mark';
    if (annotation.subject?.kind === 'region') return 'region';
    const marktype = item?.mark?.marktype;
    if (marktype === 'arc') return 'slice';
    if (marktype === 'area' && item.orient === 'horizontal'
        && items.filter((candidate) => isAnnotationSourceItem(candidate, item)).length > 1) return 'shape';
    if (item?.interactionGeometry) return 'stretch';
    return 'mark';
}

/** Where along a stretch a caption may name it, and what leaving the middle costs. */
const STRETCH_SEATS = [{ at: 0.5, cost: 0 }, { at: 0.25, cost: 12 }, { at: 0.75, cost: 12 }] as const;
/** A stretch shorter than this, in px, is cued as a dot where the caption names it. */
const SHORT_STRETCH = 12;
/** Where across a slice, from its inner to its outer radius, its caption's leader ends. */
const SLICE_DEPTH = 0.72;

type Box = NoteObstacle['box'];

/** How the mark a caption names is cued: as the mark itself, a stretch of its path, or its outline. */
type NoteCue =
    | { kind: 'mark'; target: NoteTarget; body?: Box }
    /** A line's stretch in its own ink, haloed; an area's edge in the note's ink, which reads on its fill. */
    | { kind: 'stretch'; points: readonly PlotPoint[]; color?: string; width?: number; dash?: readonly number[]; cap?: string }
    /** A stretch too short to read as one: a dot where the caption names it. */
    | { kind: 'dot'; point: PlotPoint; color?: string }
    | { kind: 'outline'; points: readonly PlotPoint[] }
    | { kind: 'none' };

/** One place on the noted mark a caption may name it from, in the drawing's px. */
interface NoteAnchor {
    target: NoteTarget;
    body?: Box;
    preferredAngle?: number;
    /** What naming the mark from here rather than its first anchor costs. */
    cost: number;
    /** The mark's own ink near the anchor, which is not a neighbour the caption dodges. */
    own?: (inkItem: any, box: Box) => boolean;
    /** Thin ink of the noted mark itself the caption should not cut, such as an area's edge. */
    segments?: readonly NoteSegment[];
    cue: NoteCue;
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
    /** The house's note text and ink. */
    design?: Readonly<AnnotationDesign>;
    /**
     * Keep captions within the plot. A map clips its marks to the plot and is panned and zoomed in
     * it, so a caption out in the legend or past the title reads as detached from its place.
     */
    containWithinPlot?: boolean;
}

/** A caption already set on the chart: its box and the leader joining it to its mark. */
export interface PlacedCaption {
    box: NoteObstacle['box'];
    leader?: NoteSegment;
    /** Further lines drawn with it, such as an enclosure's outline. */
    segments?: readonly NoteSegment[];
}

/** A cheap fingerprint of the chart's ink, so a note is laid out again only when what it avoids moved. */
function inkSignature(ink: ReturnType<typeof sceneInk>): string {
    let hash = 0;
    const add = (value: number): void => {
        hash = (Math.imul(hash, 31) + Math.round(value * 10)) | 0;
    };
    for (const { bounds } of ink.boxes) {
        add(bounds.x1); add(bounds.y1); add(bounds.x2); add(bounds.y2);
    }
    for (const { a, b } of ink.segments) {
        add(a.x); add(a.y); add(b.x); add(b.y);
    }
    return `${ink.boxes.length}:${ink.segments.length}:${hash}`;
}

/** A pie or donut slice's outline, as points round its outer arc and back round its inner one. */
function sliceOutline(item: any): PlotPoint[] {
    const start = item.startAngle as number;
    const end = item.endAngle as number;
    const outer = item.outerRadius as number;
    const inner = typeof item.innerRadius === 'number' ? item.innerRadius : 0;
    const steps = Math.max(2, Math.ceil(Math.abs(end - start) / (Math.PI / 36)));
    const at = (angle: number, radius: number): PlotPoint => ({ x: item.x + radius * Math.sin(angle), y: item.y - radius * Math.cos(angle) });
    const arc = (radius: number): PlotPoint[] => Array.from({ length: steps + 1 }, (_, index) => at(start + ((end - start) * index) / steps, radius));
    return inner > 0 ? [...arc(outer), ...arc(inner).reverse()] : [...arc(outer), { x: item.x, y: item.y }];
}

/** A band area's outline (a violin's), from the pieces its key draws, in draw order. */
function shapeOutline(items: readonly any[], item: any): PlotPoint[] {
    const parts = items.filter((candidate) => isAnnotationSourceItem(candidate, item) && candidate.interactionGeometry?.points?.length >= 4);
    if (parts.length === 0) return [];
    const last = parts[parts.length - 1].interactionGeometry.points;
    const front = [...parts.map((part) => part.interactionGeometry.points[0]), last[1]];
    const back = [...parts.map((part) => part.interactionGeometry.points[3]), last[2]].reverse();
    return [...front, ...back];
}

/** The edge an area's stretch is read along: its value side, piece by piece, across the whole mark. */
function areaEdge(items: readonly any[], item: any): NoteSegment[] {
    if (item.mark?.marktype !== 'area') return [];
    return items
        .filter((candidate) => candidate.mark === item.mark && candidate.interactionGeometry?.annotationPoints?.length >= 2)
        .map((candidate) => ({ a: candidate.interactionGeometry.annotationPoints[0], b: candidate.interactionGeometry.annotationPoints[1] }));
}

export function createAnnotationOverlay({
    view,
    container,
    coordinateSpace,
    containerLayoutSize,
    annotationMarkType,
    placedCaptions,
    design,
    containWithinPlot = false,
}: AnnotationOverlayOptions): AnnotationOverlayController {
    const annotationLayer = document.createElement('div');
    annotationLayer.dataset.flintAnnotation = '';
    Object.assign(annotationLayer.style, {
        position: 'absolute', inset: '0', zIndex: '4', pointerEvents: 'none', overflow: 'hidden',
    });
    const annotationSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    Object.assign(annotationSvg.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    // The mark a caption names, drawn again above its neighbours: a ring, an outline, its stretch.
    const annotationCue = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    annotationCue.style.display = 'none';
    // A caption's leader is haloed like its words, so it reads over a filled mark.
    const leaderHalo = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    leaderHalo.setAttribute('fill', 'none');
    leaderHalo.setAttribute('stroke-linecap', 'round');
    leaderHalo.setAttribute('stroke-linejoin', 'round');
    const annotationPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    annotationPath.setAttribute('fill', 'none');
    annotationPath.setAttribute('stroke-linecap', 'round');
    annotationPath.setAttribute('stroke-linejoin', 'round');
    // A note is set as words beside its mark, haloed in the background, never as a card.
    const annotationText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    annotationText.setAttribute('paint-order', 'stroke');
    annotationText.setAttribute('stroke-linejoin', 'round');
    annotationSvg.append(annotationCue, leaderHalo, annotationPath, annotationText);
    annotationLayer.append(annotationSvg);

    const svgShape = (tag: 'circle' | 'rect' | 'path', attributes: Record<string, string | number>): SVGElement => {
        const shape = document.createElementNS('http://www.w3.org/2000/svg', tag);
        for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, String(value));
        return shape;
    };
    const paintOf = (value: unknown): string | undefined =>
        typeof value === 'string' && value !== 'transparent' && value !== 'none' ? value : undefined;
    const pathData = (points: readonly PlotPoint[], closed: boolean): string =>
        points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ') + (closed ? ' Z' : '');

    /**
     * The places on the noted mark a caption may name it from, in the drawing. One mark is named at
     * its outline (a bar at its value end); a stretch of a line or area at its middle or a quarter
     * along, an area's from the side away from its fill; a slice inside its wedge, the caption
     * preferring the side away from the pie's centre; a whole shape at the ellipse its box holds; a
     * map's region at its middle.
     */
    const noteAnchors = ({ annotation, kind, item, rowPoint, subject, items, plotCenter, toLayout, toBox, scale, clip }: {
        annotation: RenderableAnnotation; kind: NoteSubjectKind; item: any; rowPoint: PlotPoint | undefined; subject: any;
        items: readonly any[]; plotCenter: PlotPoint; toLayout: (point: PlotPoint) => PlotPoint;
        toBox: (bounds: { x1: number; x2: number; y1: number; y2: number }) => Box; scale: number; clip: any;
    }): NoteAnchor[] => {
        const highlight = annotation.highlight ?? 'light';
        const point = (at: PlotPoint, radius = 2): NoteTarget => {
            const { x, y } = toLayout(at);
            return { shape: 'circle', x, y, rx: radius * scale, ry: radius * scale };
        };
        if (kind === 'stretch') {
            const ends = (item.interactionGeometry.annotationPoints ?? item.interactionGeometry.points) as readonly PlotPoint[];
            const [a, b] = ends;
            // An area's caption stands off the side away from its fill; a line's anywhere clear.
            const preferredAngle = item.interactionGeometry.kind === 'slice'
                ? segmentMidpointConnectionPoint(item, plotCenter).preferredAngle
                : undefined;
            // On an area the stretch's own colour is its fill's, which would not show on it.
            const area = item.mark?.marktype === 'area';
            const color = area ? undefined : paintOf(item.stroke) ?? paintOf(item.mark?.items?.[0]?.stroke);
            // A line drawn wide is cued at its own width, so the cue covers it rather than running down
            // its middle as a thinner line, and with its own dashes and ends.
            const markWidth = !area && typeof item.strokeWidth === 'number' ? item.strokeWidth * scale : undefined;
            const markDash = markWidth && Array.isArray(item.strokeDash) ? item.strokeDash.map((length: number) => length * scale) : undefined;
            const markCap = markWidth && typeof item.strokeCap === 'string' ? item.strokeCap : undefined;
            // A map route's leg is already drawn whole, as an arrow in its own colour: a copy over it
            // would cover the stops and heads it meets, so the note names it by its leader alone.
            const routeLeg = item.datum?.[ROUTE_PART] === 'leg';
            const segments = areaEdge(items, item).map(({ a: from, b: to }) => ({ a: toLayout(from), b: toLayout(to) }));
            // A curved path (a map route's leg) is cued and seated along its curve.
            const drawnPath = ends.length > 2 ? ends.map(toLayout) : [toLayout(a), toLayout(b)];
            const short = pathLength(drawnPath) < SHORT_STRETCH * scale;
            return STRETCH_SEATS.map(({ at, cost }) => {
                const target = point(ends.length > 2 ? pointAlongPath(ends, at) : { x: a.x + (b.x - a.x) * at, y: a.y + (b.y - a.y) * at }, short ? 3.5 : 2);
                const cue: NoteCue = highlight === 'none' || routeLeg ? { kind: 'none' }
                    : short ? { kind: 'dot', point: { x: target.x, y: target.y }, ...(color ? { color } : {}) }
                        : { kind: 'stretch', points: drawnPath, ...(color ? { color } : {}), ...(markWidth ? { width: markWidth } : {}), ...(markDash ? { dash: markDash } : {}), ...(markCap ? { cap: markCap } : {}) };
                return { target, ...(preferredAngle !== undefined ? { preferredAngle } : {}), cost, segments, cue };
            });
        }
        if (kind === 'slice' && typeof item.startAngle === 'number' && typeof item.endAngle === 'number' && typeof item.outerRadius === 'number') {
            const angle = (item.startAngle + item.endAngle) / 2;
            const inner = typeof item.innerRadius === 'number' ? item.innerRadius : 0;
            const radius = inner + (item.outerRadius - inner) * SLICE_DEPTH;
            const outline = sliceOutline(item).map(toLayout);
            // The whole pie is ink the caption keeps off, its own slice too: a slice is named from outside.
            const slices = items.filter((candidate) => candidate.mark === item.mark && candidate.bounds);
            const pie = toBox({
                x1: Math.min(...slices.map((slice) => slice.bounds.x1)), x2: Math.max(...slices.map((slice) => slice.bounds.x2)),
                y1: Math.min(...slices.map((slice) => slice.bounds.y1)), y2: Math.max(...slices.map((slice) => slice.bounds.y2)),
            });
            return [{
                target: point({ x: item.x + radius * Math.sin(angle), y: item.y - radius * Math.cos(angle) }, 1.5),
                body: pie,
                preferredAngle: vectorAngle(Math.sin(angle), -Math.cos(angle)),
                cost: 0,
                cue: highlight === 'none' ? { kind: 'none' } : { kind: 'outline', points: outline },
            }];
        }
        if (kind === 'shape') {
            const box = toBox(clippedBounds(annotationSourceBounds(items, item), clip) ?? item.bounds);
            return [{
                target: { shape: 'circle', x: box.x + box.width / 2, y: box.y + box.height / 2, rx: box.width / 2, ry: box.height / 2 },
                cost: 0,
                cue: highlight === 'none' ? { kind: 'none' } : { kind: 'outline', points: shapeOutline(items, item).map(toLayout) },
            }];
        }
        if (kind === 'region') {
            const box = toBox(subject.bounds);
            return [{
                target: { shape: 'circle', x: box.x + box.width / 2, y: box.y + box.height / 2, rx: 1.5 * scale, ry: 1.5 * scale },
                cost: 0,
                cue: { kind: 'none' },
            }];
        }
        const first = annotation.candidates[0];
        const connection = first && POINTING_CONNECTIONS.has(first.connection) ? first.connection : 'center';
        const { point: connectionPoint, preferredAngle } = annotationConnectionPoint(
            subject, connection, items, plotCenter, first?.valueAxis, first?.crossSide, first?.valueInset,
        );
        const noted = noteTarget(item, rowPoint, toLayout, scale, connection === 'center' ? undefined : connectionPoint);
        const ownLabel = valueLabelBeyondFace(noted, items, item, toBox);
        const { target: drawnTarget, body } = ownLabel ? { ...noted, target: ownLabel.face } : noted;
        // A strong highlight rings a dot: the caption and its leader keep off the ring, not the dot.
        const ringed = highlight === 'strong' || highlight === 'exclusive';
        const outset = highlight === 'none' || drawnTarget.shape !== 'circle' ? 0
            : ringed ? RING_GAP * scale + 0.5 * scale : rowPoint ? scale : 0.75 * scale;
        const target = outset > 0 ? { ...drawnTarget, rx: drawnTarget.rx + outset, ry: drawnTarget.ry + outset } : drawnTarget;
        return [{
            target,
            ...(body ? { body } : {}),
            ...(preferredAngle !== undefined ? { preferredAngle } : {}),
            cost: 0,
            // The mark's own value label, and its point drawn over its line, are the mark, not neighbours.
            own: (inkItem, box) => !!ownLabel?.items.includes(inkItem)
                || (box.x <= drawnTarget.x && drawnTarget.x <= box.x + box.width && box.y <= drawnTarget.y && drawnTarget.y <= box.y + box.height
                    && box.width <= drawnTarget.rx * 2 + 6 && box.height <= drawnTarget.ry * 2 + 6),
            cue: { kind: 'mark', target: drawnTarget, ...(body ? { body } : {}) },
        }];
    };

    const renderCaption = ({ annotation, kind, item, rowPoint, subject, items, ink, plotCenter, toLayout, plot, canvas, furniture }: {
        annotation: RenderableAnnotation; kind: NoteSubjectKind; item: any; rowPoint: PlotPoint | undefined; subject: any;
        items: readonly any[]; ink: ReturnType<typeof sceneInk>; plotCenter: PlotPoint; toLayout: (point: PlotPoint) => PlotPoint;
        plot: Box; canvas: Box; furniture: readonly Box[];
    }): NotePlacement => {
        const origin = toLayout({ x: 0, y: 0 });
        const unit = toLayout({ x: 1, y: 0 });
        const scale = Math.hypot(unit.x - origin.x, unit.y - origin.y) || 1;
        // The halo is the page the plot is read on: the house's plot surface where it has one.
        const textStyle = { ...chartTextStyle(view, ink.boxes), ...(design?.background ? { background: design.background } : {}) };
        const base = noteStyle(textStyle, { ...(design?.text ? { text: design.text } : {}), ...(design?.ink ? { ink: design.ink } : {}) });
        const style = { ...base, fontSize: base.fontSize * scale, lineHeight: base.lineHeight * scale, padding: base.padding * scale };
        const measure = rendererTextMeasurer(style.fontSize, style.font, style.fontWeight, 'normal');
        const toBox = (bounds: { x1: number; x2: number; y1: number; y2: number }): Box => {
            const leading = toLayout({ x: bounds.x1, y: bounds.y1 });
            const trailing = toLayout({ x: bounds.x2, y: bounds.y2 });
            return {
                x: Math.min(leading.x, trailing.x), y: Math.min(leading.y, trailing.y),
                width: Math.abs(trailing.x - leading.x), height: Math.abs(trailing.y - leading.y),
            };
        };
        const anchors = noteAnchors({ annotation, kind, item, rowPoint, subject, items, plotCenter, toLayout, toBox, scale, clip: item.interactionClip });
        // Rects that tile most of the plot — a heatmap's cells — and a map's regions are a ground the
        // halo reads over, not marks to dodge.
        const tiled = tiledRects(ink.boxes, Math.max(1, plot.width * plot.height) / (scale * scale));
        const inkBoxes = ink.boxes.flatMap(({ item: inkItem, bounds }) => {
            if (isAnnotationSourceItem(inkItem, item)) return [];
            // A map's land and sea are structure, not data (their shapes carry no key): a caption stands
            // over them freely, as a region's does, so the marks near it decide where it goes.
            if (inkItem.mark?.marktype === 'shape' && inkItem.datum?.[INTERACTION_KEY] == null) return [];
            // So is the sea a map is drawn on: a rect under the whole plot, no row's.
            if (containWithinPlot && inkItem.mark?.marktype === 'rect' && inkItem.datum?.[INTERACTION_KEY] == null) return [];
            const box = toBox(bounds);
            const kindOf: NoteObstacle['kind'] = inkItem.mark?.marktype === 'text' ? 'text'
                : (typeof inkItem.opacity === 'number' ? inkItem.opacity : 1) < 0.5 || tiled(inkItem.mark) || inkItem.mark?.marktype === 'shape' ? 'faint' : 'mark';
            return [{ inkItem, obstacle: { box, kind: kindOf } as NoteObstacle }];
        });
        const earlier = earlierCaptions();
        const captionBoxes: NoteObstacle[] = [
            ...earlier.filter((caption) => caption.box.width > 0).map((caption) => ({ box: caption.box, kind: 'text' as const })),
            // The source line, a map's credit, a house's header: drawn beside the chart, read as its text.
            ...furniture.map((box) => ({ box, kind: 'text' as const })),
        ];
        const sharedSegments = [
            ...ink.segments.map((segment) => ({ a: toLayout(segment.a), b: toLayout(segment.b) })),
            ...earlier.flatMap((caption) => [...(caption.leader ? [caption.leader] : []), ...(caption.segments ?? [])]),
        ];
        const first = annotation.candidates[0];
        // Wrap widths are in the chart's px; the measure is at the drawing's scale.
        const widths = first?.maxWidth ? [first.maxWidth] : noteWrapWidths(annotation.text, (text) => measure(text) / scale);
        const wrapped: string[][] = [];
        for (const maxWidth of widths) {
            const lines = balanceNote(annotation.text, maxWidth * scale, measure);
            if (!wrapped.some((other) => other.join('\n') === lines.join('\n'))) wrapped.push(lines);
        }
        let best: { placed: NotePlacement; lines: string[]; cost: number; anchor: NoteAnchor } | undefined;
        for (const anchor of anchors) {
            const obstacles = [
                ...inkBoxes.filter(({ inkItem, obstacle }) => !anchor.own?.(inkItem, obstacle.box)).map(({ obstacle }) => obstacle),
                ...captionBoxes,
            ];
            const segments = anchor.segments?.length ? [...sharedSegments, ...anchor.segments] : sharedSegments;
            for (const lines of wrapped) {
                const placed = placeNote({
                    target: anchor.target, ...(anchor.body ? { body: anchor.body } : {}), label: noteSize(lines, style, measure),
                    plot, canvas, obstacles, segments,
                    ...(anchor.preferredAngle !== undefined ? { preferredAngle: anchor.preferredAngle } : {}),
                    connector: first?.connector === 'none' ? 'none' : 'auto',
                    fontSize: style.fontSize,
                });
                const cost = placed.cost + NOTE_LINE_COST * (lines.length - 1) + anchor.cost;
                if (!best || cost < best.cost) best = { placed, lines, cost, anchor };
            }
        }
        const { placed, lines, anchor } = best!;
        const { box, align, leader } = placed;
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
        const path = leader
            ? [leader.from, ...(leader.elbows ?? []), leader.to].map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' ')
            : '';
        annotationPath.setAttribute('d', path);
        annotationPath.style.display = leader ? '' : 'none';
        leaderHalo.setAttribute('stroke', `var(--flint-annotation-halo, ${style.halo.color})`);
        leaderHalo.setAttribute('stroke-width', String((style.leader.width + 2) * scale));
        leaderHalo.setAttribute('d', path);
        leaderHalo.style.display = leader ? '' : 'none';
        drawCue(annotation.highlight ?? 'light', anchor.cue, item, rowPoint, style, scale);
        return placed;
    };

    /**
     * The highlight on the mark a caption names, drawn above the chart so the mark stands over its
     * neighbours. Light: a dot drawn again at full strength with a halo, a line's point as a dot in
     * the line's ink, a bar or cell with a faint haloed outline, a stretch of a line or area drawn
     * again in its ink with a halo, a slice or shape faintly outlined. Strong (and exclusive, whose
     * receding of the rest the runtime does): a thin ring a little out from a dot, a full outline.
     */
    const drawCue = (
        highlight: NonNullable<AnnotationSpec['highlight']>, cue: NoteCue, item: any, rowPoint: PlotPoint | undefined,
        style: ReturnType<typeof noteStyle>, scale: number,
    ): void => {
        if (highlight === 'none' || cue.kind === 'none') {
            annotationCue.replaceChildren();
            annotationCue.style.display = 'none';
            return;
        }
        const strong = highlight !== 'light';
        const ink = `var(--flint-annotation-line-color, ${style.leader.color})`;
        const halo = `var(--flint-annotation-halo, ${style.halo.color})`;
        const ringGap = RING_GAP * scale;
        // A cue drawn on the mark's edge (an area's stretch, a dot on it) lies on the mark and the page
        // at once: in whichever of the note's ink and the page's colour reads on both, haloed where neither does.
        const onMark = inkOn([paintOf(item.fill) ?? paintOf(item.stroke), style.halo.color], [style.color, style.halo.color]);
        const outlined = (d: string): SVGElement[] => [
            svgShape('path', { d, fill: 'none', stroke: halo, 'stroke-width': (strong ? 3 : 2) * scale, 'stroke-linejoin': 'round' }),
            svgShape('path', { d, fill: 'none', stroke: ink, 'stroke-width': (strong ? 1.25 : 1) * scale, 'stroke-opacity': strong ? 1 : 0.45, 'stroke-linejoin': 'round' }),
        ];
        const shapes: SVGElement[] = [];
        if (cue.kind === 'stretch') {
            const d = pathData(cue.points, false);
            const width = Math.max((strong ? 3.5 : 2.5) * scale, cue.width ?? 0);
            const edgeHalo = cue.color ? halo : onMark.halo;
            const ends = { 'stroke-linecap': cue.cap ?? 'round', ...(cue.dash ? { 'stroke-dasharray': cue.dash.join(' ') } : {}) };
            if (edgeHalo) shapes.push(svgShape('path', { d, fill: 'none', stroke: edgeHalo, 'stroke-width': width + (cue.color ? 3 : 2) * scale, ...ends }));
            shapes.push(svgShape('path', { d, fill: 'none', stroke: cue.color ?? onMark.ink, 'stroke-width': width, ...ends }));
        } else if (cue.kind === 'dot') {
            const r = (strong ? 4 : 3.5) * scale;
            shapes.push(svgShape('circle', {
                cx: cue.point.x, cy: cue.point.y, r, fill: cue.color ?? onMark.ink, stroke: cue.color ? halo : onMark.halo ?? (onMark.ink === style.color ? style.halo.color : style.color), 'stroke-width': 1.5 * scale,
            }));
            if (strong) shapes.push(svgShape('circle', { cx: cue.point.x, cy: cue.point.y, r: r + ringGap, fill: 'none', stroke: ink, 'stroke-width': scale }));
        } else if (cue.kind === 'outline') {
            if (cue.points.length > 2) shapes.push(...outlined(pathData(cue.points, true)));
        } else {
            const { target, body } = cue;
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
        }
        annotationCue.replaceChildren(...shapes);
        annotationCue.style.display = shapes.length > 0 ? '' : 'none';
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

        const containerRect = container.getBoundingClientRect();
        const space = coordinateSpace();
        const layoutSize = containerLayoutSize();
        const { width, height } = layoutSize;
        const toLayout = (point: PlotPoint): PlotPoint => clientToLayoutPoint(
            plotToClientPoint(point, space), containerRect, layoutSize,
        );
        const plotLeading = toLayout({ x: 0, y: 0 });
        const plotTrailing = toLayout({ x: space.plotWidth, y: space.plotHeight });
        const plot: Box = {
            x: Math.min(plotLeading.x, plotTrailing.x),
            y: Math.min(plotLeading.y, plotTrailing.y),
            width: Math.abs(plotTrailing.x - plotLeading.x),
            height: Math.abs(plotTrailing.y - plotLeading.y),
        };
        const sourceBounds = rowPoint
            ? subject.bounds
            : clippedBounds(annotationSourceBounds(items, item), clip) ?? subject.bounds;
        const ink = sceneInk(view);
        const kind = noteSubjectKind(annotation, item, items, rowPoint);
        const furniture = canvasFurnitureBoxes(container, containerRect, layoutSize);
        const layoutInputs = JSON.stringify([
            annotation, kind, sourceBounds, plot, width, height, inkSignature(ink), earlierCaptions(), furniture,
        ]);
        if (layoutInputs === laidOut && annotationLayer.isConnected) return;
        holdCaption(undefined);
        const placed = renderCaption({
            annotation, kind, item, rowPoint, subject, items, ink,
            plotCenter: { x: space.plotWidth / 2, y: space.plotHeight / 2 },
            toLayout, plot, canvas: containWithinPlot ? plot : { x: 0, y: 0, width, height }, furniture,
        });
        annotationSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        annotationLayer.dataset.style = 'caption';
        annotationLayer.dataset.subject = kind;
        annotationLayer.dataset.angle = String(Math.round(((placed.angle * 180) / Math.PI + 360) % 360));
        annotationLayer.dataset.distance = String(placed.gap);
        annotationLayer.dataset.align = placed.align;
        annotationLayer.dataset.connector = placed.leader ? 'line' : 'none';
        annotationLayer.dataset.score = String(Math.round(placed.cost));
        const runs = placed.leader ? leaderSegments(placed.leader) : [];
        holdCaption({ box: placed.box, ...(runs[0] ? { leader: runs[0] } : {}), ...(runs.length > 1 ? { segments: runs.slice(1) } : {}) });
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
