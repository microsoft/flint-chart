import type { SemanticTarget } from '../../../core/interaction-semantics';
import type { PlotPoint } from '../../../interactive/interactions';
import type { VegaReorderAxis } from '../contracts';
import {
    clientRectToLayoutRect,
    renderHit,
    sceneItems,
    type RendererCoordinateSpace,
} from '../hit-adapter';

export interface DragReorderPreview {
    start: PlotPoint;
    current: PlotPoint;
    axis?: 'x' | 'y';
    source: SemanticTarget;
    destination: SemanticTarget;
}

export interface DragReorderOverlayController {
    render(preview: DragReorderPreview): void;
    clear(): void;
    destroy(): void;
}

export interface DragReorderOverlayOptions {
    view: any;
    container: HTMLElement;
    reorderAxes: readonly VegaReorderAxis[];
    coordinateSpace(): RendererCoordinateSpace;
    containerLayoutSize(): { width: number; height: number };
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function targetValue(target: SemanticTarget, field: string): unknown {
    return target.elements[0]?.records?.find((record) => record[field] !== undefined)?.[field];
}

export function activeReorderAxis<T extends Pick<VegaReorderAxis, 'axis' | 'field'>>(
    axes: readonly T[],
    preview: DragReorderPreview,
): T | undefined {
    const changed = axes.filter(({ field }) => !Object.is(
        targetValue(preview.source, field),
        targetValue(preview.destination, field),
    ));
    const delta = {
        x: preview.current.x - preview.start.x,
        y: preview.current.y - preview.start.y,
    };
    const preferred = preview.axis ?? (Math.abs(delta.y) > Math.abs(delta.x) ? 'y' : 'x');
    return preview.axis
        ? axes.find(({ axis }) => axis === preview.axis)
        : changed.find(({ axis }) => axis === preferred) ?? changed[0] ?? axes.find(({ axis }) => axis === preferred);
}

export function createDragReorderOverlay({
    view,
    container,
    reorderAxes,
    coordinateSpace,
    containerLayoutSize,
}: DragReorderOverlayOptions): DragReorderOverlayController {
    const layer = document.createElementNS(SVG_NS, 'svg');
    Object.assign(layer.style, {
        position: 'absolute', zIndex: '4', pointerEvents: 'none', overflow: 'hidden',
    });

    const clear = (): void => layer.remove();
    const render = (preview: DragReorderPreview): void => {
        const active = activeReorderAxis(reorderAxes, preview);
        if (!active) return clear();
        const sourceValue = targetValue(preview.source, active.field);
        const destinationValue = targetValue(preview.destination, active.field);
        const scene = sceneItems(view);
        const sourceCandidates = scene.filter((item) => renderHit(item)?.datum[active.field] === sourceValue
            && (item.interactionGeometry?.points?.length >= 2 || item.bounds));
        const discreteSourceItems = sourceCandidates.filter((item) => {
            const markType = item.mark?.marktype;
            return markType !== 'line' && markType !== 'area';
        });
        const sourceItems = active.includeConnectiveMarks || discreteSourceItems.length === 0
            ? sourceCandidates
            : discreteSourceItems;
        const destinationItems = scene.filter((item) => renderHit(item)?.datum[active.field] === destinationValue
            && item.bounds);
        if (sourceItems.length === 0 || destinationItems.length === 0) return clear();

        layer.replaceChildren();
        if (!layer.isConnected) container.append(layer);
        if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
        const space = coordinateSpace();
        const renderer = container.querySelector('svg') as SVGSVGElement | null;
        const containerRect = container.getBoundingClientRect();
        const rendererRect = renderer?.getBoundingClientRect() ?? space.rect;
        const rendererLayout = clientRectToLayoutRect(rendererRect, containerRect, containerLayoutSize());
        Object.assign(layer.style, {
            left: `${rendererLayout.left}px`, top: `${rendererLayout.top}px`,
            width: `${rendererLayout.width}px`, height: `${rendererLayout.height}px`,
        });
        layer.setAttribute('viewBox', `0 0 ${space.logicalWidth} ${space.logicalHeight}`);

        const renderedElement = (item: any): SVGGraphicsElement | undefined => renderer
            ? [...renderer.querySelectorAll<SVGGraphicsElement>('[role="graphics-symbol"]')]
                .find((candidate) => {
                    const datum = (candidate as any).__data__;
                    return datum?.mark === item.mark && datum?.datum === item.datum;
                })
            : undefined;
        const cloneRenderedElement = (item: any, delta = { x: 0, y: 0 }): SVGGraphicsElement | undefined => {
            const rendered = renderedElement(item);
            const matrix = rendered?.getCTM();
            if (!rendered || !matrix) return undefined;
            const clone = rendered.cloneNode(true) as SVGGraphicsElement;
            clone.removeAttribute('role');
            clone.removeAttribute('aria-label');
            clone.setAttribute('aria-hidden', 'true');
            clone.setAttribute('transform', `matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${matrix.e + delta.x} ${matrix.f + delta.y})`);
            return clone;
        };

        const dimmedItems = scene.filter((item) => {
            const value = renderHit(item)?.datum[active.field];
            return value !== undefined && item.bounds;
        });
        const dimmedElements = new Set<SVGGraphicsElement>();
        for (const item of dimmedItems) {
            const sourceItem = Object.is(renderHit(item)?.datum[active.field], sourceValue);
            const dimOpacity = sourceItem ? '0.5' : '0.68';
            const rendered = renderedElement(item);
            if (rendered && !dimmedElements.has(rendered)) {
                dimmedElements.add(rendered);
                const dimmer = cloneRenderedElement(item)!;
                dimmer.setAttribute('fill', '#ffffff');
                dimmer.setAttribute('stroke', '#ffffff');
                dimmer.setAttribute('opacity', dimOpacity);
                layer.append(dimmer);
                continue;
            }
            if (rendered) continue;
            const dimmer = document.createElementNS(SVG_NS, 'polygon');
            dimmer.setAttribute('points', [
                `${item.bounds.x1 + space.originX},${item.bounds.y1 + space.originY}`,
                `${item.bounds.x2 + space.originX},${item.bounds.y1 + space.originY}`,
                `${item.bounds.x2 + space.originX},${item.bounds.y2 + space.originY}`,
                `${item.bounds.x1 + space.originX},${item.bounds.y2 + space.originY}`,
            ].join(' '));
            dimmer.setAttribute('fill', '#ffffff');
            dimmer.setAttribute('fill-opacity', dimOpacity);
            layer.append(dimmer);
        }

        const delta = active.axis === 'x'
            ? { x: preview.current.x - preview.start.x, y: 0 }
            : { x: 0, y: preview.current.y - preview.start.y };
        for (const item of sourceItems) {
            const renderedGhost = cloneRenderedElement(item, delta);
            if (renderedGhost) {
                renderedGhost.setAttribute('opacity', '0.62');
                layer.append(renderedGhost);
                continue;
            }
            const shape = document.createElementNS(SVG_NS, 'polygon');
            const points: PlotPoint[] = item.interactionGeometry?.points ?? [
                { x: item.bounds.x1, y: item.bounds.y1 },
                { x: item.bounds.x2, y: item.bounds.y1 },
                { x: item.bounds.x2, y: item.bounds.y2 },
                { x: item.bounds.x1, y: item.bounds.y2 },
            ];
            shape.setAttribute('points', points
                .map((point: PlotPoint) => `${point.x + space.originX + delta.x},${point.y + space.originY + delta.y}`)
                .join(' '));
            shape.setAttribute('fill', item.fill ?? '#4c78a8');
            shape.setAttribute('fill-opacity', String((item.opacity ?? 1) * (item.fillOpacity ?? 1) * 0.62));
            shape.setAttribute('stroke', item.stroke ?? '#ffffff');
            shape.setAttribute('stroke-width', String(Math.max(1, item.strokeWidth ?? 0)));
            layer.append(shape);
        }

        if (!Object.is(sourceValue, destinationValue)) {
            const bounds = destinationItems.reduce((result, item) => ({
                x1: Math.min(result.x1, item.bounds.x1), y1: Math.min(result.y1, item.bounds.y1),
                x2: Math.max(result.x2, item.bounds.x2), y2: Math.max(result.y2, item.bounds.y2),
            }), { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
            const indicator = document.createElementNS(SVG_NS, 'line');
            if (active.axis === 'x') {
                const x = (delta.x >= 0 ? bounds.x2 : bounds.x1) + space.originX;
                indicator.setAttribute('x1', String(x));
                indicator.setAttribute('x2', String(x));
                indicator.setAttribute('y1', String(space.originY));
                indicator.setAttribute('y2', String(space.originY + space.plotHeight));
            } else {
                const y = (delta.y >= 0 ? bounds.y2 : bounds.y1) + space.originY;
                indicator.setAttribute('x1', String(space.originX));
                indicator.setAttribute('x2', String(space.originX + space.plotWidth));
                indicator.setAttribute('y1', String(y));
                indicator.setAttribute('y2', String(y));
            }
            indicator.setAttribute('stroke', '#b85c5c');
            indicator.setAttribute('stroke-opacity', '0.88');
            indicator.setAttribute('stroke-width', '1.5');
            indicator.setAttribute('stroke-linecap', 'round');
            layer.append(indicator);
        }
    };

    return { render, clear, destroy: clear };
}
