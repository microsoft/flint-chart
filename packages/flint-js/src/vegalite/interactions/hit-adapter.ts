import {
    associateSemanticElementRenderKeys,
    semanticVisualFamily,
    semanticElementRenderKeys,
    type RenderHit,
    type SemanticTarget,
    type LegendTargetValue,
} from '../../core/interaction-semantics';
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
    clientToRendererPoint,
    interactionModifiers,
    plotToClientPoint,
    rendererPlotOrigin,
    type RendererCoordinateSpace,
} from '../../interactive/geometry/coordinate-space';

export const INTERACTION_KEY = '__flint_interaction_key';
export const INTERACTION_ROLE = '__flint_interaction_role';
export const INTERACTION_LEGEND_CHANNEL = '__flint_legend_channel';
export const INTERACTION_LEGEND_FIELD = '__flint_legend_field';
export const PATH_KEY_SUFFIX = '|__flint_path';

const SUPPORTED_RENDER_MARKS = new Set(['arc', 'area', 'bar', 'line', 'rect', 'rule', 'shape', 'symbol', 'text']);

export interface SelectionRect {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

export interface LegendHitIdentity extends LegendTargetValue {
    value: unknown;
    visualBounds?: SelectionRect;
}

interface PathGeometry {
    kind: 'segment' | 'slice';
    points: PlotPoint[];
    annotationPoints?: PlotPoint[];
    offset: PlotPoint;
    endDatum?: Record<string, unknown>;
    closed?: boolean;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

const LEGEND_SEGMENT_TARGET_PX = 44;
const MIN_LEGEND_SEGMENTS = 3;
const MAX_LEGEND_SEGMENTS = 7;

export function continuousLegendSegmentCount(span: number, distinctValues = Infinity): number {
    const physical = clamp(
        Math.round(Math.max(0, span) / LEGEND_SEGMENT_TARGET_PX),
        MIN_LEGEND_SEGMENTS,
        MAX_LEGEND_SEGMENTS,
    );
    return Math.max(1, Math.min(physical, Math.max(1, Math.floor(distinctValues))));
}

function signedPow(value: number, exponent: number): number {
    return Math.sign(value) * Math.abs(value) ** exponent;
}

function continuousScaleValue(scale: any, fraction: number): number | undefined {
    const domain = typeof scale?.domain === 'function' ? scale.domain() : undefined;
    if (!Array.isArray(domain) || domain.length < 2) return undefined;
    const values = domain.map((entry: unknown) => entry instanceof Date ? entry.getTime() : Number(entry));
    if (values.some((entry: number) => !Number.isFinite(entry))) return undefined;
    const position = clamp(fraction, 0, 1) * (values.length - 1);
    const index = Math.min(values.length - 2, Math.floor(position));
    const local = position - index;
    const start = values[index];
    const end = values[index + 1];
    const type = String(scale?.type ?? 'linear');
    let transform = (value: number): number => value;
    let untransform = (value: number): number => value;
    if (type.includes('symlog')) {
        const constant = typeof scale.constant === 'function' ? scale.constant() : 1;
        transform = (value) => Math.sign(value) * Math.log1p(Math.abs(value / constant));
        untransform = (value) => Math.sign(value) * Math.expm1(Math.abs(value)) * constant;
    } else if (type.includes('log') && start !== 0 && end !== 0 && Math.sign(start) === Math.sign(end)) {
        transform = (value) => Math.sign(value) * Math.log(Math.abs(value));
        untransform = (value) => Math.sign(value) * Math.exp(Math.abs(value));
    } else if (type.includes('sqrt')) {
        transform = (value) => signedPow(value, 0.5);
        untransform = (value) => signedPow(value, 2);
    } else if (type.includes('pow')) {
        const exponent = typeof scale.exponent === 'function' ? scale.exponent() : 1;
        transform = (value) => signedPow(value, exponent);
        untransform = (value) => signedPow(value, 1 / exponent);
    }
    return untransform(transform(start) + (transform(end) - transform(start)) * local);
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

function pathGeometry(item: any, offsetX: number, offsetY: number, siblingIndex?: number): PathGeometry | null {
    const items = item?.mark?.items;
    if (!Array.isArray(items)) return null;
    const index = siblingIndex ?? items.indexOf(item);
    if (index < 0) return null;
    const point = (candidate: any): PlotPoint => ({ x: candidate.x + offsetX, y: candidate.y + offsetY });
    if (item.mark.marktype === 'line') {
        const closed = typeof item.interpolate === 'string' && item.interpolate.endsWith('-closed');
        const next = index < items.length - 1 ? items[index + 1] : closed ? items[0] : undefined;
        if (!next) return null;
        return {
            kind: 'segment',
            points: [point(item), point(next)],
            annotationPoints: [point(item), point(next)],
            offset: { x: offsetX, y: offsetY },
            endDatum: next.datum,
            closed,
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
    const visit = (item: any, offsetX: number, offsetY: number, siblingIndex?: number): void => {
        if (!item) return;
        if (SUPPORTED_RENDER_MARKS.has(item.mark?.marktype) && keyOfDatum(item.datum) && item.bounds) {
            const interactionGeometry = pathGeometry(item, offsetX, offsetY, siblingIndex);
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
            item.items.forEach((child: any, index: number) => visit(child, childOffsetX, childOffsetY, index));
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

/**
 * Lasso capture matches the rectangle brush: `intersect` is a real area overlap
 * rather than a sample of the mark's centre and corners.
 */
function polygonIntersectsRect(polygon: readonly PlotPoint[], rect: SelectionRect): boolean {
    const corners: PlotPoint[] = [
        { x: rect.x1, y: rect.y1 }, { x: rect.x2, y: rect.y1 },
        { x: rect.x2, y: rect.y2 }, { x: rect.x1, y: rect.y2 },
    ];
    if (corners.some((corner) => pointInPolygon(corner, polygon))) return true;
    if (polygon.some((vertex) => pointInRect(vertex, rect))) return true;
    for (let current = 0, previous = polygon.length - 1; current < polygon.length; previous = current++) {
        for (let corner = 0; corner < corners.length; corner++) {
            if (segmentsIntersect(
                polygon[previous], polygon[current],
                corners[corner], corners[(corner + 1) % corners.length],
            )) return true;
        }
    }
    return false;
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

export function polarFrameFromItems(
    items: readonly any[],
    point?: PlotPoint,
): { center: PlotPoint; innerRadius: number; outerRadius: number } | undefined {
    const frames = new Map<string, { center: PlotPoint; innerRadius: number; outerRadius: number }>();
    for (const item of items) {
        if (item?.mark?.marktype !== 'arc' || typeof item.x !== 'number' || typeof item.y !== 'number'
            || typeof item.innerRadius !== 'number' || typeof item.outerRadius !== 'number') continue;
        const key = `${item.x}\u0000${item.y}`;
        const existing = frames.get(key);
        frames.set(key, existing ? {
            center: existing.center,
            innerRadius: Math.min(existing.innerRadius, item.innerRadius),
            outerRadius: Math.max(existing.outerRadius, item.outerRadius),
        } : {
            center: { x: item.x, y: item.y },
            innerRadius: item.innerRadius,
            outerRadius: item.outerRadius,
        });
    }
    const available = [...frames.values()];
    if (!point) return available[0];
    return available.sort((left, right) =>
        Math.hypot(point.x - left.center.x, point.y - left.center.y)
        - Math.hypot(point.x - right.center.x, point.y - right.center.y))[0];
}

export function polarGuideSegment(
    frame: { center: PlotPoint; outerRadius: number },
    point: PlotPoint,
): { start: PlotPoint; end: PlotPoint } {
    const dx = point.x - frame.center.x;
    const dy = point.y - frame.center.y;
    const distance = Math.hypot(dx, dy);
    const scale = distance > 0 ? frame.outerRadius / distance : 0;
    return {
        start: frame.center,
        end: distance > 0
            ? { x: frame.center.x + dx * scale, y: frame.center.y + dy * scale }
            : { x: frame.center.x, y: frame.center.y - frame.outerRadius },
    };
}

export function polarInspectHits(
    items: readonly any[],
    point: PlotPoint,
    frame: { center: PlotPoint },
): RenderHit[] {
    const angle = ((Math.atan2(point.x - frame.center.x, frame.center.y - point.y) % (2 * Math.PI))
        + 2 * Math.PI) % (2 * Math.PI);
    return items
        .filter((item) => item?.mark?.marktype === 'arc'
            && Number.isFinite(item.startAngle) && Number.isFinite(item.endAngle)
            && Math.hypot(item.x - frame.center.x, item.y - frame.center.y) <= 1
            && angularSegments(item.startAngle, item.endAngle).some(
                ([start, end]) => angle >= start - 1e-9 && angle <= end + 1e-9,
            ))
        .map(renderHit)
        .filter((hit): hit is RenderHit => hit !== null);
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
        pathData: markType === 'line' || markType === 'area'
            ? item.mark.items?.map((pathItem: any) => pathItem.datum).filter(Boolean)
            : undefined,
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
    rangeLegendChannels: readonly string[] = [],
    view?: any,
    rootPoint?: PlotPoint,
): LegendHitIdentity | null {
    if (item?.datum?.[INTERACTION_ROLE] === 'legend-label') {
        const channel = item.datum[INTERACTION_LEGEND_CHANNEL];
        const field = item.datum[INTERACTION_LEGEND_FIELD];
        const value = typeof field === 'string' ? item.datum[field] : undefined;
        if (typeof channel !== 'string' || typeof field !== 'string' || value === undefined) return null;
        return { channel, field, value, domain: { kind: 'value', value } };
    }
    const isLegend = semanticVisualFamily(item?.mark?.role) === 'legend';
    if (!isLegend) return null;
    let legendEntry = item?.mark?.group;
    while (legendEntry && !legendEntry.datum?.scales) legendEntry = legendEntry.mark?.group;
    const scales = legendEntry?.datum?.scales;
    const channel = scales && typeof scales === 'object'
        ? Object.keys(scales).map((key) => key === 'fill' || key === 'stroke' ? 'color' : key)[0]
        : undefined;
    let value = item?.datum?.value;
    let range: { min?: number; max?: number } | undefined;
    let visualBounds: SelectionRect | undefined;
    if (channel && rangeLegendChannels.includes(channel)) {
        const anchors: { index: number; value: number; perc?: number }[] = [];
        const visit = (candidate: any): void => {
            const anchor = candidate?.datum?.value;
            const numeric = anchor instanceof Date ? anchor.getTime() : anchor;
            if (typeof numeric === 'number') {
                anchors.push({
                    index: typeof candidate.datum.index === 'number' ? candidate.datum.index : anchors.length,
                    value: numeric,
                    ...(typeof candidate.datum.perc === 'number' ? { perc: candidate.datum.perc } : {}),
                });
            }
            if (Array.isArray(candidate?.items)) candidate.items.forEach(visit);
        };
        visit(legendEntry);
        const unique = [...new Map(anchors.map((anchor) => [anchor.index, anchor])).values()]
            .sort((left, right) => left.index - right.index);
        if (item.mark.role === 'legend-gradient' && rootPoint && view) {
            const bounds = rootBoundsForItem(view, item);
            const scaleName = scales && typeof scales === 'object'
                ? Object.entries(scales).find(([key]) =>
                    (key === 'fill' || key === 'stroke' ? 'color' : key) === channel)?.[1]
                : undefined;
            const scale = typeof scaleName === 'string' && typeof view.scale === 'function'
                ? view.scale(scaleName)
                : undefined;
            if (bounds && unique.length > 0) {
                const vertical = legendEntry?.datum?.vgrad === true;
                const span = vertical ? bounds.y2 - bounds.y1 : bounds.x2 - bounds.x1;
                const position = vertical ? bounds.y2 - rootPoint.y : rootPoint.x - bounds.x1;
                const fraction = span > 0 ? clamp(position / span, 0, 1) : 0;
                const segmentCount = continuousLegendSegmentCount(span);
                const index = Math.min(segmentCount - 1, Math.floor(fraction * segmentCount));
                const lower = index / segmentCount;
                const upper = (index + 1) / segmentCount;
                const fallbackValue = (unique[0].value
                    + (unique[unique.length - 1].value - unique[0].value) * ((lower + upper) / 2));
                value = continuousScaleValue(scale, (lower + upper) / 2) ?? fallbackValue;
                range = {
                    ...(index > 0 ? {
                        min: continuousScaleValue(scale, lower)
                            ?? unique[0].value + (unique[unique.length - 1].value - unique[0].value) * lower,
                    } : {}),
                    ...(index < segmentCount - 1 ? {
                        max: continuousScaleValue(scale, upper)
                            ?? unique[0].value + (unique[unique.length - 1].value - unique[0].value) * upper,
                    } : {}),
                };
                const width = bounds.x2 - bounds.x1;
                const height = bounds.y2 - bounds.y1;
                visualBounds = vertical
                    ? { x1: bounds.x1, x2: bounds.x2, y1: bounds.y2 - upper * height, y2: bounds.y2 - lower * height }
                    : { x1: bounds.x1 + lower * width, x2: bounds.x1 + upper * width, y1: bounds.y1, y2: bounds.y2 };
            }
        }
        const numericValue = value instanceof Date ? value.getTime() : value;
        const index = unique.findIndex((anchor) => anchor.value === numericValue);
        if (item.mark.role === 'legend-band' && index >= 0) {
            const min = unique[index].value;
            const max = unique[index + 1]?.value;
            range = {
                ...(Number.isFinite(min) ? { min } : {}),
                ...(Number.isFinite(max) ? { max } : {}),
            };
            value = min;
        }
        else if (!range && index >= 0 && unique.length > 1) {
            range = {
                ...(index > 0 ? { min: (unique[index - 1].value + unique[index].value) / 2 } : {}),
                ...(index < unique.length - 1 ? { max: (unique[index].value + unique[index + 1].value) / 2 } : {}),
            };
        }
    }
    if (value === undefined) return null;
    return {
        channel,
        value,
        field: channel ? legendFields?.[channel] : undefined,
        domain: range
            ? { kind: 'interval', ...(range.min !== undefined ? { start: range.min } : {}), ...(range.max !== undefined ? { end: range.max } : {}) }
            : { kind: 'value', value },
        ...(visualBounds ? { visualBounds } : {}),
    };
}

function rootBoundsForItem(view: any, target: any): SelectionRect | undefined {
    const element = target?._svg as SVGGraphicsElement | undefined;
    const svg = element?.ownerSVGElement;
    if (svg && typeof element.getBoundingClientRect === 'function') {
        const itemRect = element.getBoundingClientRect();
        const svgRect = svg.getBoundingClientRect();
        const viewBox = svg.viewBox.baseVal;
        if (svgRect.width > 0 && svgRect.height > 0 && viewBox.width > 0 && viewBox.height > 0) {
            const scaleX = viewBox.width / svgRect.width;
            const scaleY = viewBox.height / svgRect.height;
            return {
                x1: viewBox.x + (itemRect.left - svgRect.left) * scaleX,
                y1: viewBox.y + (itemRect.top - svgRect.top) * scaleY,
                x2: viewBox.x + (itemRect.right - svgRect.left) * scaleX,
                y2: viewBox.y + (itemRect.bottom - svgRect.top) * scaleY,
            };
        }
    }
    let result: SelectionRect | undefined;
    const visit = (item: any, offsetX: number, offsetY: number): void => {
        if (!item || result) return;
        if (item === target && item.bounds) {
            result = {
                x1: item.bounds.x1 + offsetX,
                y1: item.bounds.y1 + offsetY,
                x2: item.bounds.x2 + offsetX,
                y2: item.bounds.y2 + offsetY,
            };
            return;
        }
        const isGroup = item.mark?.marktype === 'group';
        const childOffsetX = offsetX + (isGroup && typeof item.x === 'number' ? item.x : 0);
        const childOffsetY = offsetY + (isGroup && typeof item.y === 'number' ? item.y : 0);
        if (Array.isArray(item.items)) item.items.forEach((child: any) => visit(child, childOffsetX, childOffsetY));
    };
    visit(view.scenegraph()?.root, 0, 0);
    return result;
}

function legendOwner(item: any): any {
    let owner = item?.mark?.group;
    while (owner && !owner.datum?.scales) owner = owner.mark?.group;
    return owner;
}

function legendEntryCandidates(view: any): { item: any; bounds: SelectionRect }[] {
    const entries = new Map<any, Map<unknown, { item: any; bounds: SelectionRect }>>();
    const visit = (item: any): void => {
        const role = item?.mark?.role;
        const owner = (role === 'legend-symbol' || role === 'legend-label')
            ? legendOwner(item)
            : undefined;
        if (owner && item.datum?.value !== undefined) {
            const value = item.datum.value instanceof Date ? item.datum.value.getTime() : item.datum.value;
            const bounds = rootBoundsForItem(view, item);
            if (bounds) {
                let byValue = entries.get(owner);
                if (!byValue) {
                    byValue = new Map();
                    entries.set(owner, byValue);
                }
                const existing = byValue.get(value);
                byValue.set(value, existing ? {
                    item: existing.item,
                    bounds: {
                        x1: Math.min(existing.bounds.x1, bounds.x1),
                        y1: Math.min(existing.bounds.y1, bounds.y1),
                        x2: Math.max(existing.bounds.x2, bounds.x2),
                        y2: Math.max(existing.bounds.y2, bounds.y2),
                    },
                } : { item, bounds });
            }
        }
        if (Array.isArray(item?.items)) item.items.forEach(visit);
    };
    visit(view.scenegraph()?.root);
    return [...entries.values()].flatMap((byValue) => [...byValue.values()]);
}

export function legendEntryItemAtPoint(
    view: any,
    point: PlotPoint,
    padding = 3,
): any | null {
    return nearestItemByBounds(legendEntryCandidates(view), point, padding)?.item ?? null;
}

/** Nearest keyed mark or native legend entry within the same physical assist radius. */
export function nearestInteractiveSceneItem(
    view: any,
    plotPoint: PlotPoint,
    maxDistance: number,
    rootPoint: PlotPoint = plotPoint,
    includeMarks = true,
): any | undefined {
    const items = sceneItems(view);
    const generatedLegend = nearestItemByBounds(
        items.filter((item) => item.datum?.[INTERACTION_ROLE] === 'legend-label'),
        plotPoint,
        maxDistance,
    );
    const mark = includeMarks
        ? nearestItemByBounds(items.filter((item) => item.datum?.[INTERACTION_ROLE] !== 'legend-label'), plotPoint, maxDistance)
        : undefined;
    const nativeLegend = nearestItemByBounds(legendEntryCandidates(view), rootPoint, maxDistance);
    const candidates = [
        ...(mark ? [{ item: mark, distance: distanceToItem(plotPoint, mark) }] : []),
        ...(generatedLegend ? [{ item: generatedLegend, distance: distanceToItem(plotPoint, generatedLegend) }] : []),
        ...(nativeLegend ? [{ item: nativeLegend.item, distance: distanceToItem(rootPoint, nativeLegend) }] : []),
    ];
    return candidates.sort((left, right) => left.distance - right.distance)[0]?.item;
}

export function legendSemanticTarget(
    legend: LegendHitIdentity | null,
): SemanticTarget | null {
    if (!legend) return null;
    const value: LegendTargetValue = {
        ...(legend.channel ? { channel: legend.channel } : {}),
        ...(legend.field ? { field: legend.field } : {}),
        domain: legend.domain,
    };
    return {
        visual: { kind: 'legend', role: 'legend-item' },
        elements: [{ value }],
    };
}

export interface NormalizedVegaElement {
    event: ElementInteractionEvent;
    role: 'mark' | 'legend-item' | 'text-label';
    legend: LegendHitIdentity | null;
}

export function normalizeVegaElementEvent(
    view: any,
    item: any,
    point: PlotPoint,
    phase: 'preview' | 'commit' | 'cancel',
    modifiers: InteractionModifiers,
    legendFields?: Readonly<Record<string, string>>,
    rangeLegendChannels?: readonly string[],
    rootPoint?: PlotPoint,
): NormalizedVegaElement {
    const directLegend = legendTarget(item, legendFields, rangeLegendChannels, view, rootPoint);
    const legendItem = directLegend || !rootPoint
        ? item
        : legendEntryItemAtPoint(view, rootPoint) ?? item;
    const legend = directLegend
        ?? legendTarget(legendItem, legendFields, rangeLegendChannels, view, rootPoint);
    const physicalItem = physicalItemAt(view, item, point);
    const hit = renderHit(physicalItem ?? item);
    return {
        event: {
            type: 'element',
            phase,
            hits: hit ? [hit] : legend ? [{ datum: legendItem?.datum ?? {}, source: 'legend-item' }] : [],
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

/** Nearest item to a plot point, for pointer acquisition that does not require a direct hit. */
export function nearestItemByBounds(
    items: readonly any[],
    point: PlotPoint,
    maxDistance: number,
): any | undefined {
    let best: { item: any; distance: number } | undefined;
    for (const item of items) {
        const bounds = item?.bounds;
        if (!bounds) continue;
        const distance = distanceToItem(point, item);
        if (distance > maxDistance) continue;
        if (!best || distance < best.distance) best = { item, distance };
    }
    return best?.item;
}

function distanceToBounds(point: PlotPoint, bounds: SelectionRect): number {
    const dx = point.x < bounds.x1 ? bounds.x1 - point.x : point.x > bounds.x2 ? point.x - bounds.x2 : 0;
    const dy = point.y < bounds.y1 ? bounds.y1 - point.y : point.y > bounds.y2 ? point.y - bounds.y2 : 0;
    return Math.hypot(dx, dy);
}

function distanceToSegment(point: PlotPoint, start: PlotPoint, end: PlotPoint): number {
    const dx = end.x - start.x;
    const dy = end.y - start.y;
    const lengthSquared = dx * dx + dy * dy;
    const ratio = lengthSquared === 0 ? 0 : clamp(
        ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared,
        0,
        1,
    );
    return Math.hypot(
        point.x - (start.x + ratio * dx),
        point.y - (start.y + ratio * dy),
    );
}

function distanceToItem(point: PlotPoint, item: any): number {
    const geometry = item?.interactionGeometry as PathGeometry | undefined;
    if (geometry?.points.length) {
        if (geometry.kind === 'slice' && pointInPolygon(point, geometry.points)) return 0;
        const segmentCount = geometry.kind === 'slice' ? geometry.points.length : geometry.points.length - 1;
        let geometryDistance = Number.POSITIVE_INFINITY;
        for (let index = 0; index < segmentCount; index += 1) {
            geometryDistance = Math.min(geometryDistance, distanceToSegment(
                point,
                geometry.points[index],
                geometry.points[(index + 1) % geometry.points.length],
            ));
        }
        return geometryDistance;
    }
    const polygon = arcPolygon(item);
    if (!polygon) return item?.bounds ? distanceToBounds(point, item.bounds) : Number.POSITIVE_INFINITY;
    if (pointInPolygon(point, polygon)) return 0;
    let distance = Number.POSITIVE_INFINITY;
    for (let index = 0; index < polygon.length; index += 1) {
        distance = Math.min(distance, distanceToSegment(point, polygon[index], polygon[(index + 1) % polygon.length]));
    }
    return distance;
}

export function nearestSceneItem(view: any, point: PlotPoint, maxDistance: number): any | undefined {
    return nearestItemByBounds(sceneItems(view), point, maxDistance);
}

export type SpatialDirection = 'left' | 'right' | 'up' | 'down';

function itemCenter(item: any): PlotPoint {
    return {
        x: (item.bounds.x1 + item.bounds.x2) / 2,
        y: (item.bounds.y1 + item.bounds.y2) / 2,
    };
}

/**
 * Nearest item strictly in one direction, preferring candidates aligned with the
 * travel axis so arrows read as left/right and up/down rather than list order.
 */
export function nextItemInDirection(
    items: readonly any[],
    from: PlotPoint,
    direction: SpatialDirection,
): any | undefined {
    const horizontal = direction === 'left' || direction === 'right';
    let best: { item: any; score: number } | undefined;
    for (const item of items) {
        if (!item?.bounds) continue;
        const center = itemCenter(item);
        const dx = center.x - from.x;
        const dy = center.y - from.y;
        const along = direction === 'right' ? dx : direction === 'left' ? -dx : direction === 'down' ? dy : -dy;
        if (along <= 0.5) continue;
        const across = Math.abs(horizontal ? dy : dx);
        const score = along + across * 3;
        if (!best || score < best.score) best = { item, score };
    }
    return best?.item;
}

export function axisIntersectingHits(
    items: readonly any[],
    coordinate: number,
    mode: 'x' | 'y',
): RenderHit[] {
    const segmentCrosses = (start: PlotPoint, end: PlotPoint): boolean => {
        const leading = mode === 'x' ? start.x : start.y;
        const trailing = mode === 'x' ? end.x : end.y;
        const minimum = Math.min(leading, trailing);
        const maximum = Math.max(leading, trailing);
        return minimum === maximum
            ? Math.abs(coordinate - minimum) <= 1e-6
            : coordinate >= minimum && coordinate < maximum;
    };
    return items
        .filter((item) => {
            const geometry = item.interactionGeometry?.points as readonly PlotPoint[] | undefined;
            if (geometry?.length) {
                const closed = item.interactionGeometry.kind === 'slice';
                const segmentCount = closed ? geometry.length : geometry.length - 1;
                for (let index = 0; index < segmentCount; index += 1) {
                    if (segmentCrosses(geometry[index], geometry[(index + 1) % geometry.length])) return true;
                }
                return false;
            }
            const polygon = arcPolygon(item);
            if (polygon) {
                return polygon.some((point, index) =>
                    segmentCrosses(point, polygon[(index + 1) % polygon.length]));
            }
            if (!item.bounds) return false;
            return mode === 'x'
                ? coordinate >= item.bounds.x1 && coordinate < item.bounds.x2
                : coordinate >= item.bounds.y1 && coordinate < item.bounds.y2;
        })
        .map(renderHit)
        .filter((hit): hit is RenderHit => hit !== null);
}

type InspectComparison = '<' | '<=' | '=' | '>=' | '>';

/** Acquires marks around a raw inspect point without changing the guide position. */
export function tolerantInspectHits(
    items: readonly any[],
    point: PlotPoint,
    mode: 'x' | 'y' | 'xy',
    predicate: { x?: InspectComparison; y?: InspectComparison },
    tolerance: { x: number; y: number },
): RenderHit[] {
    const xComparison = predicate.x;
    const yComparison = predicate.y;
    const directionalQuarter = mode === 'xy'
        && xComparison !== undefined && xComparison !== '='
        && yComparison !== undefined && yComparison !== '=';
    if (directionalQuarter) {
        const intersectsOnAxis = (
            start: number,
            end: number,
            comparison: Exclude<InspectComparison, '='>,
            boundary: number,
        ): boolean => {
            if (comparison === '<') return start < boundary;
            if (comparison === '<=') return start <= boundary;
            if (comparison === '>') return end > boundary;
            return end >= boundary;
        };
        return items
            .filter((item) => {
                return item?.bounds
                    && intersectsOnAxis(item.bounds.x1, item.bounds.x2, xComparison, point.x)
                    && intersectsOnAxis(item.bounds.y1, item.bounds.y2, yComparison, point.y);
            })
            .map(renderHit)
            .filter((hit): hit is RenderHit => hit !== null);
    }
    const axisMatches = (
        item: any,
        axis: 'x' | 'y',
        comparison: InspectComparison,
        boundary: number,
        distance: number,
    ): boolean => {
        if (!item?.bounds) return false;
        const start = axis === 'x' ? item.bounds.x1 : item.bounds.y1;
        const end = axis === 'x' ? item.bounds.x2 : item.bounds.y2;
        if (comparison === '=') return boundary >= start - distance && boundary <= end + distance;
        if (comparison === '<') return start < boundary + distance;
        if (comparison === '<=') return start <= boundary + distance;
        if (comparison === '>') return end > boundary - distance;
        return end >= boundary - distance;
    };
    const acquire = (distance: { x: number; y: number }): any[] => items
        .filter((item) => {
            if (mode === 'xy' && (predicate.x ?? '=') === '=' && (predicate.y ?? '=') === '=') {
                const rect = {
                    x1: point.x - distance.x,
                    y1: point.y - distance.y,
                    x2: point.x + distance.x,
                    y2: point.y + distance.y,
                };
                if (item.interactionGeometry) return geometryIntersectsRect(item.interactionGeometry, rect, false);
                if (arcPolygon(item)) return arcIntersectsRect(item, rect);
                return item?.bounds
                    && point.x >= item.bounds.x1 - distance.x && point.x <= item.bounds.x2 + distance.x
                    && point.y >= item.bounds.y1 - distance.y && point.y <= item.bounds.y2 + distance.y;
            }
            const matchesX = mode === 'y' || axisMatches(item, 'x', predicate.x ?? '=', point.x, distance.x);
            const matchesY = mode === 'x' || axisMatches(item, 'y', predicate.y ?? '=', point.y, distance.y);
            return matchesX && matchesY;
        });
    const render = (matchedItems: readonly any[]): RenderHit[] => matchedItems
        .map(renderHit).filter((hit): hit is RenderHit => hit !== null);
    const equalityAxis = (mode === 'x' && (predicate.x ?? '=') === '=')
        || (mode === 'y' && (predicate.y ?? '=') === '=');
    const inspectAxisSlice = (): RenderHit[] => {
        const axis = mode as 'x' | 'y';
        const coordinate = axis === 'x' ? point.x : point.y;
        const exactHits = axisIntersectingHits(items, coordinate, axis);
        if (exactHits.length > 0) return exactHits;
        const distance = axis === 'x' ? tolerance.x : tolerance.y;
        const candidates = items.filter((item) => item?.bounds && axisMatches(item, axis, '=', coordinate, distance));
        if (candidates.length === 0) return [];
        const range = (item: any): { start: number; end: number } => axis === 'x'
            ? { start: item.bounds.x1, end: item.bounds.x2 }
            : { start: item.bounds.y1, end: item.bounds.y2 };
        const gap = (item: any): number => {
            const { start, end } = range(item);
            return coordinate < start ? start - coordinate : coordinate >= end ? coordinate - end : 0;
        };
        const winner = candidates.reduce((best, candidate) => {
            const difference = gap(candidate) - gap(best);
            if (difference < -1e-6) return candidate;
            if (Math.abs(difference) > 1e-6) return best;
            const candidateRange = range(candidate);
            const bestRange = range(best);
            const candidateCenter = (candidateRange.start + candidateRange.end) / 2;
            const bestCenter = (bestRange.start + bestRange.end) / 2;
            return Math.abs(candidateCenter - coordinate) <= Math.abs(bestCenter - coordinate) ? candidate : best;
        });
        const { start, end } = range(winner);
        const inset = Math.min(0.25, Math.max(0, end - start) / 2);
        const selectedCoordinate = coordinate <= start
            ? start + inset
            : coordinate >= end
                ? end - inset
                : coordinate;
        return axisIntersectingHits(items, selectedCoordinate, axis);
    };

    if (equalityAxis) return inspectAxisSlice();

    const exact = acquire({ x: 0, y: 0 });
    if (exact.length > 0) return render(exact);

    const candidates = acquire(tolerance);
    if (candidates.length === 0) return [];
    if (mode === 'xy' && (predicate.x ?? '=') === '=' && (predicate.y ?? '=') === '=') {
        const winner = candidates.reduce((best, candidate) =>
            distanceToItem(point, candidate) <= distanceToItem(point, best) ? candidate : best);
        const hit = renderHit(winner);
        return hit ? [hit] : [];
    }
    return render(candidates);
}

export function nearestItemOnInspectAxis(
    items: readonly any[],
    point: PlotPoint,
    mode: 'x' | 'y',
): any | undefined {
    const coordinate = (item: any) => mode === 'x'
        ? (item.bounds.x1 + item.bounds.x2) / 2
        : (item.bounds.y1 + item.bounds.y2) / 2;
    const crossCoordinate = (item: any) => mode === 'x'
        ? (item.bounds.y1 + item.bounds.y2) / 2
        : (item.bounds.x1 + item.bounds.x2) / 2;
    const target = mode === 'x' ? point.x : point.y;
    const crossTarget = mode === 'x' ? point.y : point.x;
    return items.reduce<{ item: any; axisDistance: number; crossDistance: number } | undefined>((best, item) => {
        if (!item?.bounds) return best;
        const axisDistance = Math.abs(coordinate(item) - target);
        const crossDistance = Math.abs(crossCoordinate(item) - crossTarget);
        if (!best || axisDistance < best.axisDistance - 0.5
            || (Math.abs(axisDistance - best.axisDistance) <= 0.5 && crossDistance < best.crossDistance)) {
            return { item, axisDistance, crossDistance };
        }
        return best;
    }, undefined)?.item;
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

/** Marks captured by a freeform lasso path. */
export function polygonHits(
    view: any,
    polygon: readonly PlotPoint[],
    contain = false,
): RenderHit[] {
    if (polygon.length < 3) return [];
    return sceneItems(view)
        .filter((item) => {
            const bounds = item.bounds;
            if (!bounds) return false;
            if (contain) {
                return [
                    { x: bounds.x1, y: bounds.y1 },
                    { x: bounds.x2, y: bounds.y1 },
                    { x: bounds.x2, y: bounds.y2 },
                    { x: bounds.x1, y: bounds.y2 },
                ].every((corner) => pointInPolygon(corner, polygon));
            }
            return polygonIntersectsRect(polygon, bounds);
        })
        .map(renderHit)
        .filter((hit): hit is RenderHit => hit !== null);
}

export function normalizeVegaLassoEvent(
    view: any,
    points: readonly PlotPoint[],
    phase: InteractionPhase,
    match: 'intersect' | 'contain',
    modifiers: InteractionModifiers,
): RegionInteractionEvent {
    return {
        type: 'region',
        phase,
        axis: 'xy',
        operation: 'create',
        region: { points: [...points] },
        hits: phase === 'cancel' ? [] : polygonHits(view, points, match === 'contain'),
        match,
        modifiers,
    };
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
    collectHits = true,
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
        hits: collectHits ? regionHits(view, constrainedStart, constrainedEnd, match === 'contain') : [],
        match,
        modifiers,
    };
}
