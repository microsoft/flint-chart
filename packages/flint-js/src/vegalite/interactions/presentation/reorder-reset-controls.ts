import type { VegaReorderAxis } from '../contracts';

export interface ReorderResetControls {
    layout(): void;
    destroy(): void;
}

export interface ReorderResetControlsOptions {
    container: HTMLElement;
    axes: readonly VegaReorderAxis[];
    isActive(axis: VegaReorderAxis): boolean;
    reset(axis: VegaReorderAxis): void;
}

function axisTitle(renderer: SVGSVGElement, axis: 'x' | 'y'): SVGGElement | undefined {
    return [...renderer.querySelectorAll<SVGGElement>('.mark-text.role-axis-title')]
        .find((title) => title.closest('.mark-group.role-axis')
            ?.getAttribute('aria-label')?.startsWith(`${axis.toUpperCase()}-axis`));
}

export function createReorderResetControls({
    container,
    axes,
    isActive,
    reset,
}: ReorderResetControlsOptions): ReorderResetControls {
    const previousPosition = container.style.position;
    const controls = axes.map((axis) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.textContent = '↺';
        button.title = `Reset ${axis.field} order`;
        button.setAttribute('aria-label', `Reset ${axis.field} order`);
        Object.assign(button.style, {
            position: 'absolute', zIndex: '5', width: '20px', height: '20px', padding: '0',
            border: '0', borderRadius: '3px', background: 'transparent',
            color: '#737d86', cursor: 'pointer', font: '16px sans-serif',
            lineHeight: '20px', letterSpacing: '0',
        });
        button.addEventListener('click', () => reset(axis));
        container.append(button);
        return { axis, button };
    });

    const layout = (): void => {
        const renderer = container.querySelector('svg.marks') as SVGSVGElement | null;
        if (!renderer) {
            for (const { button } of controls) button.hidden = true;
            return;
        }
        if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
        const containerRect = container.getBoundingClientRect();
        for (const { axis, button } of controls) {
            const title = axisTitle(renderer, axis.axis);
            if (!title || !isActive(axis)) {
                button.hidden = true;
                continue;
            }
            button.hidden = false;
            const titleRect = title.getBoundingClientRect();
            if (axis.axis === 'x') {
                button.style.left = `${titleRect.right - containerRect.left + 6}px`;
                button.style.top = `${titleRect.top - containerRect.top + (titleRect.height - 20) / 2}px`;
            } else {
                button.style.left = `${titleRect.left - containerRect.left + (titleRect.width - button.offsetWidth) / 2}px`;
                button.style.top = `${titleRect.top - containerRect.top - 24}px`;
            }
        }
    };

    layout();
    return {
        layout,
        destroy(): void {
            for (const { button } of controls) button.remove();
            container.style.position = previousPosition;
        },
    };
}
