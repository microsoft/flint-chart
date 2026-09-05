import type { RendererCoordinateSpace } from '../hit-adapter';
import { clientToLayoutPoint } from '../../../interactive/geometry/coordinate-space';
import { createOverlayIconButton, RESET_ICON } from './overlay-icon-button';

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
    const control = createOverlayIconButton({
        container,
        label: 'Reset zoom',
        icon: RESET_ICON,
        onActivate: reset,
        zIndex: 6,
    });
    const { element: button } = control;

    const layout = (): void => {
        if (!isActive()) {
            control.setVisible(false);
            return;
        }
        if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
        control.setVisible(true);
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
            control.destroy();
            container.style.position = previousPosition;
        },
    };
}
