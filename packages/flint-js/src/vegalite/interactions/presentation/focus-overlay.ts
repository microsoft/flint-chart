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
            return hit && (selected.has(key) || hoveredPathKeys.has(key)) && item.interactionGeometry;
        });
        const boundaryBounds = mergeContiguousSelectionBounds(scene
            .filter((item) => {
                const hit = renderHit(item);
                const key = hit?.datum[INTERACTION_KEY];
                return typeof key === 'string'
                    && selected.has(key)
                    && plan.renderSelectionStyles?.[item.mark.marktype]?.boundary === 'contiguous-region';
            })
            .map((item) => item.bounds));
        if (items.length === 0 && boundaryBounds.length === 0) {
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
        for (const item of items) {
            const key = renderHit(item)?.datum[INTERACTION_KEY];
            const visual = typeof key === 'string' ? pathVisuals.get(key) : undefined;
            const hovered = typeof key === 'string' && hoveredPathKeys.has(key);
            const hoverStyle = hovered ? plan.renderHoverStyles?.[item.mark.marktype] : undefined;
            const selectionStyle = typeof key === 'string' && selected.has(key)
                ? plan.renderSelectionStyles?.[item.mark.marktype]
                : undefined;
            const basePath = renderer
                ? [...renderer.querySelectorAll<SVGGraphicsElement>('[role="graphics-symbol"]')]
                    .find((candidate) => (candidate as any).__data__?.mark === item.mark)
                : undefined;
            const matrix = basePath?.getCTM();
            const points = item.interactionGeometry.points.map((plotPoint: PlotPoint) => {
                if (!matrix || !renderer) {
                    return { x: plotPoint.x + space.originX, y: plotPoint.y + space.originY };
                }
                const local = renderer.createSVGPoint();
                local.x = plotPoint.x - item.interactionGeometry.offset.x;
                local.y = plotPoint.y - item.interactionGeometry.offset.y;
                const transformed = local.matrixTransform(matrix);
                return { x: transformed.x, y: transformed.y };
            });
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
        for (const bounds of boundaryBounds) {
            const boundaryStyle = plan.selectionBoundary ?? {
                color: '#20262c',
                width: 1.5,
                opacity: 1,
                haloColor: '#ffffff',
                haloWidth: 3,
                haloOpacity: 0.8,
            };
            for (const [stroke, width, opacity] of [
                [boundaryStyle.haloColor, boundaryStyle.haloWidth, boundaryStyle.haloOpacity],
                [boundaryStyle.color, boundaryStyle.width, boundaryStyle.opacity],
            ] as const) {
                const boundary = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                boundary.setAttribute('x', String(bounds.x1 + space.originX + 1));
                boundary.setAttribute('y', String(bounds.y1 + space.originY + 1));
                boundary.setAttribute('width', String(Math.max(0, bounds.x2 - bounds.x1 - 2)));
                boundary.setAttribute('height', String(Math.max(0, bounds.y2 - bounds.y1 - 2)));
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
