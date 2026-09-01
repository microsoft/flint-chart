import type { LegendHitIdentity, RendererCoordinateSpace } from '../hit-adapter';
import { clientRectToLayoutRect } from '../hit-adapter';

export interface LegendRangeOverlayController {
    render(selected: LegendHitIdentity | null, hovered: LegendHitIdentity | null): void;
    destroy(): void;
}

export function createLegendRangeOverlay(options: {
    container: HTMLElement;
    coordinateSpace(): RendererCoordinateSpace;
    containerLayoutSize(): { width: number; height: number };
}): LegendRangeOverlayController {
    const { container, coordinateSpace, containerLayoutSize } = options;
    const layer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    Object.assign(layer.style, {
        position: 'absolute', zIndex: '4', pointerEvents: 'none', overflow: 'visible',
    });

    const render = (selected: LegendHitIdentity | null, hovered: LegendHitIdentity | null): void => {
        layer.replaceChildren();
        const visible = [
            selected?.visualBounds ? { target: selected, selected: true } : undefined,
            hovered?.visualBounds ? { target: hovered, selected: false } : undefined,
        ].filter(Boolean) as { target: LegendHitIdentity; selected: boolean }[];
        if (visible.length === 0) {
            layer.remove();
            return;
        }
        if (!layer.isConnected) container.append(layer);
        if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
        const space = coordinateSpace();
        const renderer = container.querySelector('svg') as SVGSVGElement | null;
        const containerRect = container.getBoundingClientRect();
        const rendererRect = renderer?.getBoundingClientRect() ?? space.rect;
        const layout = clientRectToLayoutRect(rendererRect, containerRect, containerLayoutSize());
        Object.assign(layer.style, {
            left: `${layout.left}px`, top: `${layout.top}px`,
            width: `${layout.width}px`, height: `${layout.height}px`,
        });
        layer.setAttribute('viewBox', `0 0 ${space.logicalWidth} ${space.logicalHeight}`);
        for (const { target, selected: pinned } of visible) {
            const bounds = target.visualBounds!;
            const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            rect.setAttribute('x', String(bounds.x1));
            rect.setAttribute('y', String(bounds.y1));
            rect.setAttribute('width', String(Math.max(0, bounds.x2 - bounds.x1)));
            rect.setAttribute('height', String(Math.max(0, bounds.y2 - bounds.y1)));
            rect.setAttribute('fill', pinned ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.2)');
            rect.setAttribute('stroke', pinned ? 'rgba(32,38,44,0.68)' : 'rgba(32,38,44,0.48)');
            rect.setAttribute('stroke-width', pinned ? '1.25' : '1');
            rect.setAttribute('vector-effect', 'non-scaling-stroke');
            layer.append(rect);
        }
    };

    return { render, destroy: () => layer.remove() };
}