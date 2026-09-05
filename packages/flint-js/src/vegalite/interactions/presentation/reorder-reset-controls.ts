import type { VegaReorderAxis } from '../contracts';
import { clientRectToLayoutRect } from '../hit-adapter';
import { createOverlayIconButton, RESET_ICON } from './overlay-icon-button';

export interface ReorderResetControls {
    layout(): void;
    destroy(): void;
}

export interface ReorderResetControlsOptions {
    container: HTMLElement;
    axes: readonly VegaReorderAxis[];
    containerLayoutSize(): { width: number; height: number };
    isActive(axis: VegaReorderAxis): boolean;
    reset(axis: VegaReorderAxis): void;
}

function axisTitle(renderer: SVGSVGElement, axis: 'x' | 'y'): SVGGraphicsElement | undefined {
    const titleGroup = [...renderer.querySelectorAll<SVGGElement>('.mark-text.role-axis-title')]
        .find((title) => title.closest('.mark-group.role-axis')
            ?.getAttribute('aria-label')?.startsWith(`${axis.toUpperCase()}-axis`));
    // Vega's title mark group can inherit scenegraph bounds spanning much of
    // the plot. Position controls from the actual glyph, not that outer group.
    return titleGroup?.querySelector<SVGGraphicsElement>('text') ?? titleGroup;
}

export function createReorderResetControls({
    container,
    axes,
    containerLayoutSize,
    isActive,
    reset,
}: ReorderResetControlsOptions): ReorderResetControls {
    const previousPosition = container.style.position;
    const controls = axes.map((axis) => {
        const control = createOverlayIconButton({
            container,
            label: `Reset ${axis.field} order`,
            icon: RESET_ICON,
            onActivate: () => reset(axis),
        });
        return { axis, control };
    });

    const layout = (): void => {
        const renderer = container.querySelector('svg.marks') as SVGSVGElement | null;
        if (!renderer) {
            for (const { control } of controls) control.setVisible(false);
            return;
        }
        if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
        const containerRect = container.getBoundingClientRect();
        const layoutSize = containerLayoutSize();
        for (const { axis, control } of controls) {
            const button = control.element;
            const title = axisTitle(renderer, axis.axis);
            if (!title || !isActive(axis)) {
                control.setVisible(false);
                continue;
            }
            control.setVisible(true);
            const titleRect = clientRectToLayoutRect(title.getBoundingClientRect(), containerRect, layoutSize);
            if (axis.axis === 'x') {
                button.style.left = `${titleRect.left + titleRect.width + 4}px`;
                button.style.top = `${titleRect.top + (titleRect.height - 24) / 2}px`;
            } else {
                button.style.left = `${titleRect.left + (titleRect.width - 24) / 2}px`;
                button.style.top = `${titleRect.top - 26}px`;
            }
        }
    };

    layout();
    return {
        layout,
        destroy(): void {
            for (const { control } of controls) control.destroy();
            container.style.position = previousPosition;
        },
    };
}
