import type { InteractionModifiers, PlotPoint } from '../language/events';

export interface RendererCoordinateSpace {
    rect: DOMRect;
    logicalWidth: number;
    logicalHeight: number;
    originX: number;
    originY: number;
    plotWidth: number;
    plotHeight: number;
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/**
 * Converts a rendered root-frame matrix into a plot origin expressed in the
 * renderer's own units. `getCTM()` reports CSS pixels, so a CSS-scaled SVG
 * would otherwise report an origin that disagrees with `logicalWidth`.
 */
export function rendererPlotOrigin(
    matrix: { a: number; e: number; f: number } | null | undefined,
    viewOrigin: PlotPoint,
): PlotPoint {
    if (!matrix) return viewOrigin;
    const scale = matrix.a || 1;
    return { x: matrix.e / scale, y: matrix.f / scale };
}

export function interactionModifiers(event: MouseEvent | PointerEvent): InteractionModifiers {
    return { shift: event.shiftKey, ctrl: event.ctrlKey, meta: event.metaKey };
}

export function clientToPlotPoint(client: PlotPoint, space: RendererCoordinateSpace): PlotPoint {
    const rendererX = (client.x - space.rect.left) * space.logicalWidth / space.rect.width;
    const rendererY = (client.y - space.rect.top) * space.logicalHeight / space.rect.height;
    return {
        x: clamp(rendererX - space.originX, 0, space.plotWidth),
        y: clamp(rendererY - space.originY, 0, space.plotHeight),
    };
}

export function plotToClientPoint(point: PlotPoint, space: RendererCoordinateSpace): PlotPoint {
    return {
        x: space.rect.left + (point.x + space.originX) * space.rect.width / space.logicalWidth,
        y: space.rect.top + (point.y + space.originY) * space.rect.height / space.logicalHeight,
    };
}

export function clientToLayoutPoint(
    point: PlotPoint,
    rect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
    layoutSize: { width: number; height: number },
): PlotPoint {
    return {
        x: (point.x - rect.left) * layoutSize.width / rect.width,
        y: (point.y - rect.top) * layoutSize.height / rect.height,
    };
}

export function clientRectToLayoutRect(
    rect: Pick<DOMRect, 'left' | 'top' | 'right' | 'bottom'>,
    containerRect: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
    layoutSize: { width: number; height: number },
): { left: number; top: number; width: number; height: number } {
    const leading = clientToLayoutPoint({ x: rect.left, y: rect.top }, containerRect, layoutSize);
    const trailing = clientToLayoutPoint({ x: rect.right, y: rect.bottom }, containerRect, layoutSize);
    return {
        left: leading.x,
        top: leading.y,
        width: trailing.x - leading.x,
        height: trailing.y - leading.y,
    };
}