import type { RendererCoordinateSpace } from '../hit-adapter';
import { clientToLayoutPoint } from '../../../interactive/geometry/coordinate-space';

export interface ViewportResetControl {
    layout(): void;
    destroy(): void;
}

export interface ViewportResetControlOptions {
    container: HTMLElement;
    coordinateSpace(): RendererCoordinateSpace;
    containerLayoutSize(): { width: number; height: number };
    isActive(): boolean;
    reset(): void;
}

export function createViewportResetControl({
    container,
    coordinateSpace,
    containerLayoutSize,
    isActive,
    reset,
}: ViewportResetControlOptions): ViewportResetControl {
    const previousPosition = container.style.position;
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '↺';
    button.title = 'Reset zoom';
    button.setAttribute('aria-label', 'Reset zoom');
    Object.assign(button.style, {
        position: 'absolute', zIndex: '6', width: '28px', height: '28px', padding: '0',
        border: '1px solid rgba(115, 125, 134, 0.35)', borderRadius: '4px',
        background: 'rgba(255, 255, 255, 0.92)', color: '#4b5560', cursor: 'pointer',
        font: '18px sans-serif', lineHeight: '26px', letterSpacing: '0',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.08)',
    });
    button.addEventListener('click', reset);
    container.append(button);

    const layout = (): void => {
        if (!isActive()) {
            button.hidden = true;
            return;
        }
        if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
        button.hidden = false;
        const space = coordinateSpace();
        const containerRect = container.getBoundingClientRect();
        const scaleX = space.rect.width / space.logicalWidth;
        const scaleY = space.rect.height / space.logicalHeight;
        const plotTopRight = clientToLayoutPoint({
            x: space.rect.left + (space.originX + space.plotWidth) * scaleX,
            y: space.rect.top + space.originY * scaleY,
        }, containerRect, containerLayoutSize());
        button.style.left = `${plotTopRight.x - 34}px`;
        button.style.top = `${plotTopRight.y + 6}px`;
    };

    layout();
    return {
        layout,
        destroy(): void {
            button.removeEventListener('click', reset);
            button.remove();
            container.style.position = previousPosition;
        },
    };
}
