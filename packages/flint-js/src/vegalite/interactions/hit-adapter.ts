import { semanticVisualFamily, type RenderHit } from '../../core/interaction-semantics';
import type {
    ElementInteractionEvent,
    InteractionModifiers,
    InteractionPhase,
    PlotPoint,
    PlotAngularSector,
    RegionAxis,
    RegionInteractionEvent,
    RegionOperation,
} from '../../interactive/language/events';
import { angularSegments } from '../../interactive/geometry/angular';
export {
    clientRectToLayoutRect,
    clientToLayoutPoint,
    clientToPlotPoint,
    interactionModifiers,
    plotToClientPoint,
    rendererPlotOrigin,
    type RendererCoordinateSpace,
} from '../../interactive/geometry/coordinate-space';

export const INTERACTION_KEY = '__flint_interaction_key';
export const INTERACTION_ROLE = '__flint_interaction_role';
export const PATH_KEY_SUFFIX = '|__flint_path';

const SUPPORTED_RENDER_MARKS = new Set(['arc', 'area', 'bar', 'line', 'rect', 'rule', 'shape', 'symbol', 'text']);

export interface SelectionRect {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

interface PathGeometry {
    kind: 'segment' | 'slice';
    points: PlotPoint[];
    annotationPoints?: PlotPoint[];
    offset: PlotPoint;
    endDatum?: Record<string, unknown>;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function keyOfDatum(datum: unknown): string | undefined {
    if (!datum || typeof datum !== 'object') return undefined;
    const key = (datum as Record<string, unknown>)[INTERACTION_KEY];
    return typeof key === 'string' ? key : undefined;
}

export function pathHoverPresentationKey(items: readonly any[], semanticKey: string): string {
    if (!semanticKey.endsWith(PATH_KEY_SUFFIX)) return semanticKey;
    const segmentKey = semanticKey.slice(0, -PATH_KEY_SUFFIX.length);
    const segment = items.find((item) =>
        (item.mark?.marktype === 'line' || item.mark?.marktype === 'area')
        && keyOfDatum(item.datum) === segmentKey,
    );
    if (segment?.mark?.marktype === 'line') return semanticKey;
    const pathKey = segment?.mark?.items
        ?.map((item: any) => keyOfDatum(item.datum))
        .find((key: string | undefined): key is string => typeof key === 'string');
    return pathKey ? `${pathKey}${PATH_KEY_SUFFIX}` : semanticKey;
}

function pathGeometry(item: any, offsetX: number, offsetY: number): PathGeometry | null {
    const items = item?.mark?.items;
    if (!Array.isArray(items)) return null;
    const index = items.indexOf(item);
    if (index < 0) return null;
    const point = (candidate: any): PlotPoint => ({ x: candidate.x + offsetX, y: candidate.y + offsetY });
    if (item.mark.marktype === 'line') {
        if (index >= items.length - 1) return null;
        return {
            kind: 'segment',
            points: [point(item), point(items[index + 1])],
            annotationPoints: [point(item), point(items[index + 1])],
            offset: { x: offsetX, y: offsetY },
            endDatum: items[index + 1].datum,
        };
    }
    if (item.mark.marktype !== 'area'
        || (typeof item.y2 !== 'number' && typeof item.x2 !== 'number')) return null;
    const next = items[index + 1];
    if (!next) return null;
    const annotationPoints = [point(item), point(next)];
    const secondaryPoints = typeof item.y2 === 'number' && typeof next.y2 === 'number'
        ? [
            { x: next.x + offsetX, y: next.y2 + offsetY },
            { x: item.x + offsetX, y: item.y2 + offsetY },
        ]
        : typeof item.x2 === 'number' && typeof next.x2 === 'number'
            ? [
                { x: next.x2 + offsetX, y: next.y + offsetY },
                { x: item.x2 + offsetX, y: item.y + offsetY },
            ]
            : undefined;
    if (!secondaryPoints) return null;
    return {
        kind: 'slice',
        points: [
            point(item),
            point(next),
            ...secondaryPoints,
        ],
        annotationPoints,
        offset: { x: offsetX, y: offsetY },
        endDatum: next.datum,
    };
}

export function sceneItems(view: any): any[] {
    const result: any[] = [];
    const visit = (item: any, offsetX: number, offsetY: number): void => {
        if (!item) return;
        if (SUPPORTED_RENDER_MARKS.has(item.mark?.marktype) && keyOfDatum(item.datum) && item.bounds) {
            const interactionGeometry = pathGeometry(item, offsetX, offsetY);
            if ((item.mark.marktype === 'line' || item.mark.marktype === 'area') && !interactionGeometry) return;
            const points = interactionGeometry?.points;
            result.push({
                ...item,
                x: typeof item.x === 'number' ? item.x + offsetX : item.x,
                y: typeof item.y === 'number' ? item.y + offsetY : item.y,
                bounds: points ? {
                    x1: Math.min(...points.map((point) => point.x)),
                    x2: Math.max(...points.map((point) => point.x)),
                    y1: Math.min(...points.map((point) => point.y)),
                    y2: Math.max(...points.map((point) => point.y)),
                } : {
                    x1: item.bounds.x1 + offsetX,
                    x2: item.bounds.x2 + offsetX,
                    y1: item.bounds.y1 + offsetY,
                    y2: item.bounds.y2 + offsetY,
                },
                interactionGeometry,
            });
        }
        const isGroup = item.mark?.marktype === 'group';
        const childOffsetX = offsetX + (isGroup && typeof item.x === 'number' ? item.x : 0);
        const childOffsetY = offsetY + (isGroup && typeof item.y === 'number' ? item.y : 0);
        if (Array.isArray(item.items)) {
            for (const child of item.items) visit(child, childOffsetX, childOffsetY);
        }
    };
    visit(view.scenegraph()?.root, 0, 0);
    return result;
}

export function boundsIntersectRect(
    bounds: SelectionRect,
    rect: SelectionRect,
    minimumOverlap = 0.5,
): boolean {
    const overlapX = Math.min(bounds.x2, rect.x2) - Math.max(bounds.x1, rect.x1);
    const overlapY = Math.min(bounds.y2, rect.y2) - Math.max(bounds.y1, rect.y1);
    return overlapX > minimumOverlap && overlapY > minimumOverlap;
}

function pointInRect(point: PlotPoint, rect: SelectionRect): boolean {
    return point.x >= rect.x1 && point.x <= rect.x2 && point.y >= rect.y1 && point.y <= rect.y2;
}

function orientation(a: PlotPoint, b: PlotPoint, c: PlotPoint): number {
    return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function segmentsIntersect(a: PlotPoint, b: PlotPoint, c: PlotPoint, d: PlotPoint): boolean {
    const abC = orientation(a, b, c);
    const abD = orientation(a, b, d);
    const cdA = orientation(c, d, a);
    const cdB = orientation(c, d, b);
    const epsilon = 1e-9;
    const onSegment = (start: PlotPoint, end: PlotPoint, point: PlotPoint): boolean =>
        point.x >= Math.min(start.x, end.x) - epsilon
        && point.x <= Math.max(start.x, end.x) + epsilon
        && point.y >= Math.min(start.y, end.y) - epsilon
        && point.y <= Math.max(start.y, end.y) + epsilon;
    if (Math.abs(abC) <= epsilon && onSegment(a, b, c)) return true;
    if (Math.abs(abD) <= epsilon && onSegment(a, b, d)) return true;
    if (Math.abs(cdA) <= epsilon && onSegment(c, d, a)) return true;
    if (Math.abs(cdB) <= epsilon && onSegment(c, d, b)) return true;
    return (abC > 0) !== (abD > 0) && (cdA > 0) !== (cdB > 0);
}

function pointInPolygon(point: PlotPoint, polygon: readonly PlotPoint[]): boolean {
    let inside = false;
    for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
        const a = polygon[current];
        const b = polygon[previous];
        if ((a.y > point.y) !== (b.y > point.y)
            && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return inside;
}

export function geometryIntersectsRect(geometry: PathGeometry, rect: SelectionRect, contain: boolean): boolean {
    if (contain) return geometry.points.every((point) => pointInRect(point, rect));
    if (geometry.points.some((point) => pointInRect(point, rect))) return true;
    const corners: PlotPoint[] = [
        { x: rect.x1, y: rect.y1 }, { x: rect.x2, y: rect.y1 },
        { x: rect.x2, y: rect.y2 }, { x: rect.x1, y: rect.y2 },
    ];
    if (geometry.kind === 'slice' && corners.some((point) => pointInPolygon(point, geometry.points))) return true;
    const geometryEdges = geometry.kind === 'segment'
        ? [[geometry.points[0], geometry.points[1]] as const]
        : geometry.points.map((point, index) => [point, geometry.points[(index + 1) % geometry.points.length]] as const);
    const rectEdges = corners.map((point, index) => [point, corners[(index + 1) % corners.length]] as const);
    return geometryEdges.some(([a, b]) => rectEdges.some(([c, d]) => segmentsIntersect(a, b, c, d)));
}

function arcPolygon(item: any): PlotPoint[] | null {
    if (item?.mark?.marktype !== 'arc') return null;
    const values = [item.x, item.y, item.innerRadius, item.outerRadius, item.startAngle, item.endAngle];
    if (!values.every((value) => typeof value === 'number' && Number.isFinite(value))) return null;
    const delta = item.endAngle - item.startAngle;
    const steps = Math.max(8, Math.ceil(Math.abs(delta) * item.outerRadius / 4));
    const pointAt = (radius: number, angle: number): PlotPoint => ({
        x: item.x + radius * Math.sin(angle),
        y: item.y - radius * Math.cos(angle),
    });
    const polygon: PlotPoint[] = [];
    for (let index = 0; index <= steps; index += 1) {
        polygon.push(pointAt(item.outerRadius, item.startAngle + delta * index / steps));
    }
    for (let index = steps; index >= 0; index -= 1) {
        polygon.push(pointAt(item.innerRadius, item.startAngle + delta * index / steps));
    }
    return polygon;
}

export function arcIntersectsRect(item: any, rect: SelectionRect, contain = false): boolean {
    const polygon = arcPolygon(item);
    if (!polygon) return false;
    if (contain) return polygon.every((point) => pointInRect(point, rect));
    if (polygon.some((point) => pointInRect(point, rect))) return true;
    const corners: PlotPoint[] = [
        { x: rect.x1, y: rect.y1 }, { x: rect.x2, y: rect.y1 },
        { x: rect.x2, y: rect.y2 }, { x: rect.x1, y: rect.y2 },
    ];
    if (corners.some((point) => pointInPolygon(point, polygon))) return true;
    const rectEdges = corners.map((point, index) => [point, corners[(index + 1) % corners.length]] as const);
    for (let index = 0; index < polygon.length; index += 1) {
        const a = polygon[index];
        const b = polygon[(index + 1) % polygon.length];
        if (rectEdges.some(([c, d]) => segmentsIntersect(a, b, c, d))) return true;
    }
    return false;
}

export function arcIntersectsAngularSector(
    item: any,
    sector: PlotAngularSector,
    contain = false,
): boolean {
    if (item?.mark?.marktype !== 'arc') return false;
    const values = [item.x, item.y, item.innerRadius, item.outerRadius, item.startAngle, item.endAngle];
    if (!values.every((value) => typeof value === 'number' && Number.isFinite(value))) return false;
    if (Math.hypot(item.x - sector.center.x, item.y - sector.center.y) > 1) return false;
    const radialMatch = contain
        ? item.innerRadius >= sector.innerRadius && item.outerRadius <= sector.outerRadius
        : item.outerRadius > sector.innerRadius && item.innerRadius < sector.outerRadius;
    if (!radialMatch) return false;
    const selection = angularSegments(sector.startAngle, sector.endAngle);
    const arc = angularSegments(item.startAngle, item.endAngle);
    if (contain) {
        return arc.every(([arcStart, arcEnd]) => selection.some(
            ([selectionStart, selectionEnd]) => arcStart >= selectionStart - 1e-9
                && arcEnd <= selectionEnd + 1e-9,
        ));
    }
    return arc.some(([arcStart, arcEnd]) => selection.some(
        ([selectionStart, selectionEnd]) => Math.min(arcEnd, selectionEnd) - Math.max(arcStart, selectionStart) > 1e-9,
    ));
}

export function angularRegionHits(
    view: any,
    sector: PlotAngularSector,
    contain = false,
): RenderHit[] {
    return sceneItems(view)
        .filter((item) => arcIntersectsAngularSector(item, sector, contain))
        .map(renderHit)
        .filter((hit): hit is RenderHit => hit !== null);
}

export function normalizeVegaAngularRegionEvent(
    view: any,
    sector: PlotAngularSector,
    phase: InteractionPhase,
    match: 'intersect' | 'contain',
    modifiers: InteractionModifiers,
    operation: RegionOperation = 'create',
): RegionInteractionEvent {
    return {
        type: 'region',
        phase,
        axis: 'angle',
        operation,
        region: sector,
        hits: angularRegionHits(view, sector, match === 'contain'),
        match,
        modifiers,
    };
}

export function renderHit(item: any): RenderHit | null {
    const markType = item?.mark?.marktype;
    const taggedText = markType !== 'text' || item?.datum?.[INTERACTION_ROLE] === 'text-label';
    if (!SUPPORTED_RENDER_MARKS.has(markType) || !taggedText || !keyOfDatum(item?.datum)) return null;
    const datum = item.mark.marktype === 'line' || item.mark.marktype === 'area'
        ? { ...item.datum, [INTERACTION_KEY]: `${keyOfDatum(item.datum)}${PATH_KEY_SUFFIX}` }
        : item.datum;
    return {
        datum,
        endDatum: item.interactionGeometry?.endDatum,
        source: 'mark',
        markType: item.mark?.marktype,
        markName: item.mark?.name,
        layerRole: item?.datum?.[INTERACTION_ROLE] ?? item.mark?.role,
    };
}

export function physicalItemAt(view: any, item: any, point: PlotPoint): any {
    const pathItems = item?.mark?.marktype === 'line' || item?.mark?.marktype === 'area'
        ? sceneItems(view).filter((candidate) => candidate.mark === item.mark && candidate.interactionGeometry)
        : [];
    if (item?.mark?.marktype === 'area') {
        return pathItems.find((candidate) => pointInPolygon(point, candidate.interactionGeometry.points));
    }
    if (item?.mark?.marktype === 'line') {
        return pathItems.reduce<any>((nearest, candidate) => {
            const [a, b] = candidate.interactionGeometry.points;
            const lengthSquared = (b.x - a.x) ** 2 + (b.y - a.y) ** 2;
            const ratio = lengthSquared === 0 ? 0 : clamp(
                ((point.x - a.x) * (b.x - a.x) + (point.y - a.y) * (b.y - a.y)) / lengthSquared,
                0,
                1,
            );
            const distance = Math.hypot(point.x - (a.x + ratio * (b.x - a.x)), point.y - (a.y + ratio * (b.y - a.y)));
            return !nearest || distance < nearest.distance ? { item: candidate, distance } : nearest;
        }, null)?.item;
    }
    return item;
}

export function legendTarget(
    item: any,
    legendFields?: Readonly<Record<string, string>>,
): { channel?: string; value: unknown; field?: string } | null {
    const isLegend = semanticVisualFamily(item?.mark?.role) === 'legend';
    if (!isLegend) return null;
    const scales = item?.mark?.group?.mark?.group?.datum?.scales
        ?? item?.mark?.group?.mark?.group?.mark?.group?.datum?.scales;
    const channel = scales && typeof scales === 'object'
        ? Object.keys(scales).map((key) => key === 'fill' || key === 'stroke' ? 'color' : key)[0]
        : undefined;
    return { channel, value: item?.datum?.value, field: channel ? legendFields?.[channel] : undefined };
}

export interface NormalizedVegaElement {
    event: ElementInteractionEvent;
    role: 'mark' | 'legend-item' | 'text-label';
    legend: { channel?: string; value: unknown; field?: string } | null;
}

export function normalizeVegaElementEvent(
    view: any,
    item: any,
    point: PlotPoint,
    phase: 'preview' | 'commit' | 'cancel',
    modifiers: InteractionModifiers,
    legendFields?: Readonly<Record<string, string>>,
): NormalizedVegaElement {
    const legend = legendTarget(item, legendFields);
    const physicalItem = physicalItemAt(view, item, point);
    const hit = renderHit(physicalItem ?? item);
    return {
        event: {
            type: 'element',
            phase,
            hits: hit ? [hit] : legend ? [{ datum: item?.datum ?? {}, source: 'legend-item' }] : [],
            point,
            modifiers,
        },
        role: legend
            ? 'legend-item'
            : hit?.layerRole === 'text-label'
                ? 'text-label'
                : 'mark',
        legend,
    };
}

export function regionHits(
    view: any,
    a: PlotPoint,
    b: PlotPoint,
    contain = false,
): RenderHit[] {
    const rect = {
        x1: Math.min(a.x, b.x), x2: Math.max(a.x, b.x),
        y1: Math.min(a.y, b.y), y2: Math.max(a.y, b.y),
    };
    return sceneItems(view)
        .filter((item) => item.interactionGeometry
            ? geometryIntersectsRect(item.interactionGeometry, rect, contain)
            : item.mark?.marktype === 'arc'
                ? arcIntersectsRect(item, rect, contain)
                : contain
                    ? item.bounds.x1 >= rect.x1 && item.bounds.x2 <= rect.x2
                        && item.bounds.y1 >= rect.y1 && item.bounds.y2 <= rect.y2
                    : boundsIntersectRect(item.bounds, rect))
        .map(renderHit)
        .filter((hit): hit is RenderHit => hit !== null);
}

export function normalizeVegaRegionEvent(
    view: any,
    start: PlotPoint,
    end: PlotPoint,
    phase: InteractionPhase,
    match: 'intersect' | 'contain',
    modifiers: InteractionModifiers,
    axis: RegionAxis = 'xy',
    plotSize: { width: number; height: number } = { width: view.width(), height: view.height() },
    operation: RegionOperation = 'create',
): RegionInteractionEvent {
    const constrainedStart = {
        x: axis === 'y' ? 0 : start.x,
        y: axis === 'x' ? 0 : start.y,
    };
    const constrainedEnd = {
        x: axis === 'y' ? plotSize.width : end.x,
        y: axis === 'x' ? plotSize.height : end.y,
    };
    return {
        type: 'region',
        phase,
        axis,
        operation,
        region: {
            x: Math.min(constrainedStart.x, constrainedEnd.x),
            y: Math.min(constrainedStart.y, constrainedEnd.y),
            width: Math.abs(constrainedEnd.x - constrainedStart.x),
            height: Math.abs(constrainedEnd.y - constrainedStart.y),
        },
        hits: regionHits(view, constrainedStart, constrainedEnd, match === 'contain'),
        match,
        modifiers,
    };
}
