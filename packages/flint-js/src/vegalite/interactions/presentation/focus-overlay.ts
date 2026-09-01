import type { PlotPoint } from '../../../interactive/interactions';
import type { VegaInteractionPlan } from '../contracts';
import {
    INTERACTION_KEY,
    clientRectToLayoutRect,
    renderHit,
    sceneItems,
    type RendererCoordinateSpace,
} from '../hit-adapter';

export function mergeContiguousSelectionBounds(
    bounds: readonly { x1: number; y1: number; x2: number; y2: number }[],
    gap = 2,
): { x1: number; y1: number; x2: number; y2: number }[] {
    const merged = bounds.map((bound) => ({ ...bound }));
    const connected = (a: typeof merged[number], b: typeof merged[number]): boolean => {
        const overlapX = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1);
        const overlapY = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1);
        return (overlapX > 0 && overlapY >= -gap) || (overlapY > 0 && overlapX >= -gap);
    };
    for (let left = 0; left < merged.length; left += 1) {
        for (let right = left + 1; right < merged.length;) {
            if (!connected(merged[left], merged[right])) {
                right += 1;
                continue;
            }
            merged[left] = {
                x1: Math.min(merged[left].x1, merged[right].x1),
                y1: Math.min(merged[left].y1, merged[right].y1),
                x2: Math.max(merged[left].x2, merged[right].x2),
                y2: Math.max(merged[left].y2, merged[right].y2),
            };
            merged.splice(right, 1);
            left = -1;
            break;
        }
    }
    return merged;
}

export interface SelectionBoundarySegment {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

export function selectionBoundarySegments(
    bounds: readonly { x1: number; y1: number; x2: number; y2: number }[],
    gap = 2,
): SelectionBoundarySegment[] {
    const overlaps = (a1: number, a2: number, b1: number, b2: number): boolean =>
        Math.min(a2, b2) - Math.max(a1, b1) > 0;
    const adjacent = (
        bound: typeof bounds[number],
        side: 'left' | 'right' | 'top' | 'bottom',
    ): boolean => bounds.some((candidate) => {
        if (candidate === bound) return false;
        if (side === 'left' || side === 'right') {
            const distance = side === 'left'
                ? Math.abs(candidate.x2 - bound.x1)
                : Math.abs(candidate.x1 - bound.x2);
            return distance <= gap && overlaps(bound.y1, bound.y2, candidate.y1, candidate.y2);
        }
        const distance = side === 'top'
            ? Math.abs(candidate.y2 - bound.y1)
            : Math.abs(candidate.y1 - bound.y2);
        return distance <= gap && overlaps(bound.x1, bound.x2, candidate.x1, candidate.x2);
    });
    return bounds.flatMap((bound) => [
        ...(!adjacent(bound, 'top') ? [{ x1: bound.x1, y1: bound.y1, x2: bound.x2, y2: bound.y1 }] : []),
        ...(!adjacent(bound, 'right') ? [{ x1: bound.x2, y1: bound.y1, x2: bound.x2, y2: bound.y2 }] : []),
        ...(!adjacent(bound, 'bottom') ? [{ x1: bound.x1, y1: bound.y2, x2: bound.x2, y2: bound.y2 }] : []),
        ...(!adjacent(bound, 'left') ? [{ x1: bound.x1, y1: bound.y1, x2: bound.x1, y2: bound.y2 }] : []),
    ]);
}

export interface FocusOverlayController {
    render(selected: ReadonlySet<string>, hoveredPathKeys: ReadonlySet<string>): void;
    destroy(): void;
}

export interface FocusOverlayOptions {
    view: any;
    container: HTMLElement;
    plan: VegaInteractionPlan;
    coordinateSpace(): RendererCoordinateSpace;
    containerLayoutSize(): { width: number; height: number };
}

export function hoverContrastOpacity(authoredOpacity: number): number {
    return authoredOpacity < 1 ? 1 : 0.9;
}

export function createFocusOverlay({
    view,
    container,
    plan,
    coordinateSpace,
    containerLayoutSize,
}: FocusOverlayOptions): FocusOverlayController {
    const focusLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const pathVisuals = new Map<string, {
        fill?: string;
        fillOpacity: number;
        stroke?: string;
        strokeWidth: number;
    }>();
    Object.assign(focusLayer.style, {
        position: 'absolute', inset: '0', zIndex: '3', width: '100%', height: '100%',
        pointerEvents: 'none', overflow: 'hidden',
    });

    const render = (selected: ReadonlySet<string>, hoveredPathKeys: ReadonlySet<string>): void => {
        focusLayer.replaceChildren();
        const scene = sceneItems(view);
        for (const item of scene) {
            if (!item.interactionGeometry) continue;
            const hit = renderHit(item);
            const key = hit?.datum[INTERACTION_KEY];
            if (typeof key !== 'string' || pathVisuals.has(key)) continue;
            pathVisuals.set(key, {
                fill: item.fill,
                fillOpacity: (typeof item.opacity === 'number' ? item.opacity : 1)
                    * (typeof item.fillOpacity === 'number' ? item.fillOpacity : 1),
                stroke: item.stroke,
                strokeWidth: typeof item.strokeWidth === 'number' ? item.strokeWidth : 2,
            });
        }
        const items = scene.filter((item) => {
            const hit = renderHit(item);
            const key = String(hit?.datum[INTERACTION_KEY]);
            const boundaryMode = plan.renderSelectionStyles?.[item.mark.marktype]?.boundary === 'contiguous-region';
            return hit
                && (selected.has(key) || hoveredPathKeys.has(key))
                && item.interactionGeometry
                && !boundaryMode;
        });
        const boundaryItems = scene.filter((item) => {
                const hit = renderHit(item);
                const key = hit?.datum[INTERACTION_KEY];
                return typeof key === 'string'
                    && (selected.has(key) || hoveredPathKeys.has(key))
                    && plan.renderSelectionStyles?.[item.mark.marktype]?.boundary === 'contiguous-region';
            });
        const boundarySegments = selectionBoundarySegments(boundaryItems.map((item) => item.bounds));
        if (items.length === 0 && boundarySegments.length === 0) {
            focusLayer.remove();
            return;
        }
        if (!focusLayer.isConnected) container.append(focusLayer);
        if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
        const space = coordinateSpace();
        const renderer = container.querySelector('svg') as SVGSVGElement | null;
        const containerRect = container.getBoundingClientRect();
        const rendererRect = renderer?.getBoundingClientRect() ?? space.rect;
        const rendererLayout = clientRectToLayoutRect(rendererRect, containerRect, containerLayoutSize());
        Object.assign(focusLayer.style, {
            inset: 'auto',
            left: `${rendererLayout.left}px`,
            top: `${rendererLayout.top}px`,
            width: `${rendererLayout.width}px`,
            height: `${rendererLayout.height}px`,
        });
        focusLayer.setAttribute('viewBox', `0 0 ${space.logicalWidth} ${space.logicalHeight}`);
        const filledClosedMarks = new Set<any>();
        for (const item of items) {
            if (!item.interactionGeometry.closed || filledClosedMarks.has(item.mark)) continue;
            const closedItems = scene.filter((candidate) =>
                candidate.mark === item.mark && candidate.interactionGeometry?.closed);
            const visual = closedItems
                .map((candidate) => renderHit(candidate)?.datum[INTERACTION_KEY])
                .find((key): key is string => typeof key === 'string' && selected.has(key));
            if (!visual) continue;
            const style = pathVisuals.get(visual);
            const polygon = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            polygon.setAttribute('points', closedItems.map((candidate) => {
                const point = candidate.interactionGeometry.points[0] as PlotPoint;
                return `${point.x + space.originX},${point.y + space.originY}`;
            }).join(' '));
            polygon.setAttribute('fill', style?.fill ?? item.fill ?? '#4c78a8');
            polygon.setAttribute('fill-opacity', String(style?.fillOpacity ?? 1));
            focusLayer.append(polygon);
            filledClosedMarks.add(item.mark);
        }
        for (const item of items) {
            const key = renderHit(item)?.datum[INTERACTION_KEY];
            const visual = typeof key === 'string' ? pathVisuals.get(key) : undefined;
            const hovered = typeof key === 'string' && hoveredPathKeys.has(key);
            const hoverStyle = hovered ? plan.renderHoverStyles?.[item.mark.marktype] : undefined;
            const selectionStyle = typeof key === 'string' && selected.has(key)
                ? plan.renderSelectionStyles?.[item.mark.marktype]
                : undefined;
            // Points already carry nested facet/group offsets, so renderer
            // coordinates are just the plot point plus the plot origin.
            const points = item.interactionGeometry.points.map((plotPoint: PlotPoint) => ({
                x: plotPoint.x + space.originX,
                y: plotPoint.y + space.originY,
            }));
            const segment = item.interactionGeometry.kind === 'segment';
            const shape = document.createElementNS('http://www.w3.org/2000/svg', segment ? 'path' : 'polygon');
            if (segment) {
                shape.setAttribute('d', `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`);
                shape.setAttribute('fill', 'none');
                shape.setAttribute('stroke', hoverStyle?.stroke ?? visual?.stroke ?? item.stroke ?? '#4c78a8');
                const authoredWidth = visual?.strokeWidth ?? item.strokeWidth ?? 2;
                shape.setAttribute('stroke-width', String(
                    hoverStyle?.strokeWidth
                    ?? authoredWidth * (selectionStyle?.strokeWidthMultiplier ?? 1),
                ));
                shape.setAttribute('stroke-linecap', 'round');
            } else {
                shape.setAttribute('points', points.map((plotPoint: PlotPoint) => `${plotPoint.x},${plotPoint.y}`).join(' '));
                shape.setAttribute('fill', hoverStyle?.fill ?? visual?.fill ?? item.fill ?? '#4c78a8');
                const authoredFillOpacity = visual?.fillOpacity ?? 1;
                const fillOpacity = hoverStyle?.opacity === 'spotlight'
                    ? 1
                    : hoverStyle?.opacity === 'contrast'
                    ? hoverContrastOpacity(authoredFillOpacity)
                    : hoverStyle?.fillOpacity ?? authoredFillOpacity;
                shape.setAttribute('fill-opacity', String(fillOpacity));
                if (hoverStyle?.stroke) shape.setAttribute('stroke', hoverStyle.stroke);
                if (hoverStyle?.strokeWidth !== undefined) shape.setAttribute('stroke-width', String(hoverStyle.strokeWidth));
            }
            focusLayer.append(shape);
        }
        if (boundarySegments.length > 0) {
            const boundaryStyle = plan.selectionBoundary ?? {
                color: '#20262c',
                width: 1.25,
                opacity: 0.68,
                haloColor: '#ffffff',
                haloWidth: 2.5,
                haloOpacity: 0.35,
            };
            const continuousStyle = plan.continuousColorFocus;
            for (const [stroke, width, opacity] of [
                [
                    boundaryStyle.haloColor,
                    continuousStyle?.haloWidth ?? boundaryStyle.haloWidth,
                    continuousStyle?.haloOpacity ?? boundaryStyle.haloOpacity,
                ],
                [
                    boundaryStyle.color,
                    continuousStyle?.boundaryWidth ?? boundaryStyle.width,
                    continuousStyle?.boundaryOpacity ?? boundaryStyle.opacity,
                ],
            ] as const) {
                const boundary = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                boundary.setAttribute('d', boundarySegments.map((segment) =>
                    `M ${segment.x1 + space.originX} ${segment.y1 + space.originY} ` +
                    `L ${segment.x2 + space.originX} ${segment.y2 + space.originY}`).join(' '));
                boundary.setAttribute('fill', 'none');
                boundary.setAttribute('stroke', stroke);
                boundary.setAttribute('stroke-width', String(width));
                boundary.setAttribute('stroke-opacity', String(opacity));
                boundary.setAttribute('vector-effect', 'non-scaling-stroke');
                focusLayer.append(boundary);
            }
        }
    };

    return {
        render,
        destroy: () => focusLayer.remove(),
    };
}
