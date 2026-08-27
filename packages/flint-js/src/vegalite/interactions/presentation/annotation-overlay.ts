import type { SemanticElement, SemanticTarget } from '../../../core/interaction-semantics';
import type {
    AnnotationCandidate,
    AnnotationConnection,
    AnnotationRenderPlan,
    PlotPoint,
} from '../../../interactive/interactions';
import {
    INTERACTION_KEY,
    PATH_KEY_SUFFIX,
    clientToLayoutPoint,
    plotToClientPoint,
    sceneItems,
    type RendererCoordinateSpace,
} from '../hit-adapter';

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

function sceneObstacles(view: any): any[] {
    const obstacles: any[] = [];
    const visit = (item: any, offsetX: number, offsetY: number): void => {
        if (!item) return;
        const isGroup = item.mark?.marktype === 'group';
        if (!isGroup && isAnnotationObstacle(item) && item.bounds && (item.opacity ?? 1) > 0) {
            obstacles.push({
                ...item,
                bounds: {
                    x1: item.bounds.x1 + offsetX,
                    x2: item.bounds.x2 + offsetX,
                    y1: item.bounds.y1 + offsetY,
                    y2: item.bounds.y2 + offsetY,
                },
            });
        }
        const childOffsetX = offsetX + (isGroup && typeof item.x === 'number' ? item.x : 0);
        const childOffsetY = offsetY + (isGroup && typeof item.y === 'number' ? item.y : 0);
        if (Array.isArray(item.items)) {
            for (const child of item.items) visit(child, childOffsetX, childOffsetY);
        }
    };
    visit(view.scenegraph()?.root, 0, 0);
    return obstacles;
}

function connectorFor(candidate: AnnotationCandidate): 'line' | 'none' {
    return candidate.connector ?? 'line';
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

function textAttachment(
    card: LayoutRect,
    angle: number,
): { end: PlotPoint; align: 'left' | 'center' | 'right' } {
    const horizontal = Math.cos(angle);
    const vertical = Math.sin(angle);
    if (Math.abs(horizontal) > Math.abs(vertical)) {
        return horizontal > 0
            ? { end: { x: card.left, y: card.top + card.height / 2 }, align: 'left' }
            : { end: { x: card.left + card.width, y: card.top + card.height / 2 }, align: 'right' };
    }
    return {
        end: {
            x: card.left + card.width / 2,
            y: vertical > 0 ? card.top : card.top + card.height,
        },
        align: 'center',
    };
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
    const offsets = preference === 'oblique' ? [-1, 1, -2, 2] : [0, -1, 1, -2, 2, -3, 3];
    return offsets.map((offset) => (preferredAngle + offset * ANGLE_STEP + TAU) % TAU);
}

export function annotationItem(
    items: readonly any[],
    key: string,
    subject?: Partial<SemanticTarget['visual']>,
    preferredMarktype?: string,
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
    const candidates = preferredMarktype
        ? semanticCandidates.filter((candidate) => candidate.mark?.marktype === preferredMarktype)
        : semanticCandidates;
    return (candidates.length > 0 ? candidates : matching)
        .sort((a, b) => {
            const aSpan = Math.max(a.bounds.x2 - a.bounds.x1, a.bounds.y2 - a.bounds.y1);
            const bSpan = Math.max(b.bounds.x2 - b.bounds.x1, b.bounds.y2 - b.bounds.y1);
            return aSpan - bSpan;
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

function connectionPoint(
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

export interface AnnotationOverlayController {
    render(element: SemanticElement, annotation: AnnotationRenderPlan): void;
    clear(): void;
    destroy(): void;
}

export interface AnnotationOverlayOptions {
    view: any;
    container: HTMLElement;
    coordinateSpace(): RendererCoordinateSpace;
    containerLayoutSize(): { width: number; height: number };
}

export function createAnnotationOverlay({
    view,
    container,
    coordinateSpace,
    containerLayoutSize,
}: AnnotationOverlayOptions): AnnotationOverlayController {
    const annotationLayer = document.createElement('div');
    Object.assign(annotationLayer.style, {
        position: 'absolute', inset: '0', zIndex: '4', pointerEvents: 'none', overflow: 'hidden',
    });
    const annotationSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    Object.assign(annotationSvg.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    const annotationPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    annotationPath.setAttribute('fill', 'none');
    annotationPath.setAttribute('stroke', 'var(--flint-annotation-color, #6b7280)');
    annotationPath.setAttribute('stroke-width', '1.25');
    annotationPath.setAttribute('stroke-linecap', 'round');
    annotationSvg.append(annotationPath);
    const annotationCard = document.createElement('div');
    Object.assign(annotationCard.style, {
        position: 'absolute', color: 'var(--flint-annotation-color, #4b5563)', fontFamily: 'ui-sans-serif, sans-serif',
        fontSize: '11px', fontWeight: '600', lineHeight: '1.35', whiteSpace: 'normal', width: 'max-content',
        overflowWrap: 'break-word', padding: '2px 3px', borderRadius: '2px',
        background: 'var(--flint-annotation-surface, rgba(255, 255, 255, 0.88))',
    });
    annotationLayer.append(annotationSvg, annotationCard);

    const clear = (): void => annotationLayer.remove();
    const render = (element: SemanticElement, annotation: AnnotationRenderPlan): void => {
        const key = element.key[INTERACTION_KEY];
        const items = sceneItems(view);
        const item = typeof key === 'string'
            ? annotationItem(items, key, annotation.subject, annotation.markType)
            : undefined;
        if (!item?.bounds) {
            clear();
            return;
        }
        if (!annotationLayer.isConnected) container.append(annotationLayer);
        if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

        annotationCard.textContent = annotation.text;
        const directValue = annotation.text.length <= 18 && !annotation.text.includes('\n');
        annotationCard.style.padding = directValue ? '1px 3px' : '2px 3px';

        const containerRect = container.getBoundingClientRect();
        const space = coordinateSpace();
        const layoutSize = containerLayoutSize();
        const width = layoutSize.width;
        const height = layoutSize.height;
        const toLayout = (point: PlotPoint): PlotPoint => clientToLayoutPoint(
            plotToClientPoint(point, space), containerRect, layoutSize,
        );
        const sourceKey = keyOfDatum(item.datum);
        const obstacles: LayoutObstacle[] = sceneObstacles(view).flatMap((candidate) => {
            if (candidate.mark === item.mark && keyOfDatum(candidate.datum) === sourceKey) return [];
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
        const sourceBounds = annotationBounds(item);
        const sourceLeading = toLayout({ x: sourceBounds.x1, y: sourceBounds.y1 });
        const sourceTrailing = toLayout({ x: sourceBounds.x2, y: sourceBounds.y2 });
        const markSourceRect: LayoutRect = {
            left: Math.min(sourceLeading.x, sourceTrailing.x),
            top: Math.min(sourceLeading.y, sourceTrailing.y),
            width: Math.abs(sourceTrailing.x - sourceLeading.x),
            height: Math.abs(sourceTrailing.y - sourceLeading.y),
        };
        const canvasRect = { left: 0, top: 0, width, height };
        const plotCenter = { x: space.plotWidth / 2, y: space.plotHeight / 2 };
        const sourceGap = 10;
        let best: AnnotationLayout | undefined;
        for (const candidate of annotation.candidates) {
            const connection = connectionPoint(
                item,
                candidate.connection,
                items,
                plotCenter,
                candidate.valueAxis,
                candidate.crossSide,
                candidate.valueInset,
            );
            const anchor = toLayout(connection.point);
            const boundarySourceRect = { left: anchor.x - 0.5, top: anchor.y - 0.5, width: 1, height: 1 };
            const sourceRect = candidate.connection === 'segment-midpoint'
                || candidate.connection === 'outer-radial'
                || candidate.connection === 'radial-midpoint'
                ? { left: anchor.x - 0.5, top: anchor.y - 0.5, width: 1, height: 1 }
                : markSourceRect;
            const connectorSourceRect = candidate.connection === 'outer-radial'
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
                    annotationCard.style.maxWidth = `${maxWidth}px`;
                    const cardWidth = annotationCard.offsetWidth;
                    const cardHeight = annotationCard.offsetHeight;
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
                    const attachment = textAttachment(card, angle);
                    const align = candidate.textAlign ?? attachment.align;
                    annotationCard.style.textAlign = align;
                    const end = attachment.end;
                    const canvasOverflow = overflowDistance(card, canvasRect, 8);
                    const plotOverflow = overflowDistance(card, plotRect, 6);
                    const sourceCollision = overlapArea(card, sourceRect);
                    const sourceClearance = rectDistance(card, sourceRect);
                    const obstacleOverlapPenalty = obstacles.reduce((sum, obstacle) => sum
                        + annotationObstacleOverlapCost(obstacle.tier, overlapArea(card, obstacle.rect)), 0);
                    const connectorLength = Math.hypot(end.x - anchor.x, end.y - anchor.y);
                    const drawsConnector = connectorFor(candidate) === 'line';
                    const leavesInward = connection.preferredAngle !== undefined
                        && angularDistance(angle, connection.preferredAngle) > Math.PI / 2 + 1e-6;
                    const crossesSource = drawsConnector
                        && candidate.connection !== 'outer-radial'
                        && candidate.connection !== 'radial-midpoint'
                        && segmentIntersectsRect(anchor, end, connectorSourceRect, true);
                    const obstacleCrossingPenalty = drawsConnector
                        ? obstacles.reduce((sum, obstacle) => sum + (
                            segmentIntersectsRect(anchor, end, obstacle.rect)
                                ? annotationObstacleOverlapCost(obstacle.tier, CONNECTOR_CROSSING_AREA)
                                : 0
                        ), 0)
                        : 0;
                    if (canvasOverflow > 0 || leavesInward || crossesSource || sourceClearance < sourceGap) continue;
                    const directionPenalty = connection.preferredAngle === undefined
                        ? 0
                        : angularDistance(angle, connection.preferredAngle);
                    const lineCount = Math.max(1, Math.round((cardHeight - 4) / 15));
                    const wrappingPenalty = Math.max(0, lineCount - 1) * 10;
                    const score = plotOverflow * PLOT_ESCAPE_WEIGHT
                        + obstacleCrossingPenalty + obstacleOverlapPenalty
                        + sourceCollision * OBSTACLE_WEIGHT[2] + connectorLength / 100
                        + directionPenalty + wrappingPenalty + (candidate.priority ?? 0) / 100;
                    if (!best || score < best.score) {
                        best = { candidate, connection, angle, distance, align, maxWidth, card, end, score };
                    }
                }
                }
            }
        }
        if (!best) {
            clear();
            return;
        }
        const anchor = toLayout(best.connection.point);
        annotationCard.style.maxWidth = `${best.maxWidth}px`;
        annotationCard.style.textAlign = best.align;
        annotationCard.style.left = `${best.card.left}px`;
        annotationCard.style.top = `${best.card.top}px`;
        const connector = connectorFor(best.candidate);
        const showConnector = connector === 'line';
        annotationSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        annotationPath.setAttribute('d', showConnector
            ? `M ${anchor.x} ${anchor.y} L ${best.end.x} ${best.end.y}`
            : '');
        annotationPath.style.display = showConnector ? '' : 'none';
        annotationLayer.dataset.connection = best.candidate.connection;
        annotationLayer.dataset.angle = String(Math.round(best.angle * 180 / Math.PI));
        annotationLayer.dataset.distance = String(best.distance);
        annotationLayer.dataset.align = best.align;
        annotationLayer.dataset.connector = connector;
        annotationLayer.dataset.score = String(Math.round(best.score));
    };

    return {
        render,
        clear,
        destroy: clear,
    };
}
