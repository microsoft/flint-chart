import type { RendererCoordinateSpace } from '../hit-adapter';
import { clientToLayoutPoint, plotToClientPoint } from '../../../interactive/geometry/coordinate-space';
import type { GestureGuideController, InspectGestureGuideStyle } from '../../../interactive/guides';

export interface InspectGuideOverlay extends GestureGuideController {
    renderAxes(
        point: { x: number; y: number },
        axes: 'x' | 'y' | 'xy',
        style: InspectGestureGuideStyle,
    ): void;
    renderSegment(
        start: { x: number; y: number },
        end: { x: number; y: number },
        style: InspectGestureGuideStyle,
    ): void;
}

export interface InspectGuideOverlayOptions {
    container: HTMLElement;
    coordinateSpace(): RendererCoordinateSpace;
    containerLayoutSize(): { width: number; height: number };
}

export function inspectGuideLine(
    mode: 'x' | 'y',
    coordinate: number,
    plotSize: { width: number; height: number },
): { x1: number; y1: number; x2: number; y2: number } {
    return mode === 'x'
        ? { x1: coordinate, y1: 0, x2: coordinate, y2: plotSize.height }
        : { x1: 0, y1: coordinate, x2: plotSize.width, y2: coordinate };
}

export function createInspectGuideOverlay({
    container,
    coordinateSpace,
    containerLayoutSize,
}: InspectGuideOverlayOptions): InspectGuideOverlay {
    const previousPosition = container.style.position;
    const line = document.createElement('div');
    const crossLine = document.createElement('div');
    const baseStyle = {
        position: 'absolute', display: 'none', zIndex: '4', pointerEvents: 'none',
    } as const;
    Object.assign(line.style, baseStyle);
    Object.assign(crossLine.style, baseStyle);
    if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
    container.append(line, crossLine);

    const renderLine = (
        element: HTMLDivElement,
        mode: 'x' | 'y',
        coordinate: number,
        style: InspectGestureGuideStyle,
    ): void => {
        const space = coordinateSpace();
        const guide = inspectGuideLine(mode, coordinate, {
            width: space.plotWidth,
            height: space.plotHeight,
        });
        const containerRect = container.getBoundingClientRect();
        const layoutSize = containerLayoutSize();
        const start = clientToLayoutPoint(plotToClientPoint({ x: guide.x1, y: guide.y1 }, space), containerRect, layoutSize);
        const end = clientToLayoutPoint(plotToClientPoint({ x: guide.x2, y: guide.y2 }, space), containerRect, layoutSize);
        Object.assign(element.style, mode === 'x' ? {
            display: 'block', left: `${start.x - style.width / 2}px`, top: `${start.y}px`,
            width: `${style.width}px`, height: `${end.y - start.y}px`, transform: 'none',
            transformOrigin: '50% 50%', background: style.color, opacity: `${style.opacity}`,
        } : {
            display: 'block', left: `${start.x}px`, top: `${start.y - style.width / 2}px`,
            width: `${end.x - start.x}px`, height: `${style.width}px`, transform: 'none',
            transformOrigin: '50% 50%', background: style.color, opacity: `${style.opacity}`,
        });
    };

    const renderAxes = (
        point: { x: number; y: number },
        axes: 'x' | 'y' | 'xy',
        style: InspectGestureGuideStyle,
    ): void => {
        renderLine(line, axes === 'y' ? 'y' : 'x', axes === 'y' ? point.y : point.x, style);
        if (axes === 'xy') renderLine(crossLine, 'y', point.y, style);
        else crossLine.style.display = 'none';
    };

    const renderSegment = (
        segmentStart: { x: number; y: number },
        segmentEnd: { x: number; y: number },
        style: InspectGestureGuideStyle,
    ): void => {
        crossLine.style.display = 'none';
        const space = coordinateSpace();
        const containerRect = container.getBoundingClientRect();
        const layoutSize = containerLayoutSize();
        const start = clientToLayoutPoint(plotToClientPoint(segmentStart, space), containerRect, layoutSize);
        const end = clientToLayoutPoint(plotToClientPoint(segmentEnd, space), containerRect, layoutSize);
        const length = Math.hypot(end.x - start.x, end.y - start.y);
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        Object.assign(line.style, {
            display: 'block', left: `${start.x}px`, top: `${start.y - style.width / 2}px`,
            width: `${length}px`, height: `${style.width}px`, transformOrigin: '0 50%',
            transform: `rotate(${angle}rad)`, background: style.color, opacity: `${style.opacity}`,
        });
    };

    return {
        renderAxes,
        renderSegment,
        clear(): void {
            line.style.display = 'none';
            crossLine.style.display = 'none';
        },
        destroy(): void {
            line.remove();
            crossLine.remove();
            container.style.position = previousPosition;
        },
    };
}
