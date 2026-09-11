import type { SemanticTarget } from '../../../core/interaction-contracts';
import type { TargetFeedbackOptions } from '../../../interactive/types';
import { withoutSemanticInteractionField } from '../compile';
import { clientRectToLayoutRect, type RendererCoordinateSpace } from '../hit-adapter';

export interface TargetFeedbackOverlayController {
    render(item: any, target: SemanticTarget | null, source: 'assisted' | 'keyboard'): void;
    clear(): void;
    destroy(): void;
}

export function targetFeedbackPoint(item: any): { x: number; y: number } | null {
    if (!item?.bounds) return null;
    if (item.mark?.marktype === 'arc'
        && [item.x, item.y, item.innerRadius, item.outerRadius, item.startAngle, item.endAngle]
            .every((value) => typeof value === 'number' && Number.isFinite(value))) {
        const angle = (item.startAngle + item.endAngle) / 2;
        const radius = (item.innerRadius + item.outerRadius) / 2;
        return {
            x: item.x + radius * Math.sin(angle),
            y: item.y - radius * Math.cos(angle),
        };
    }
    return {
        x: (item.bounds.x1 + item.bounds.x2) / 2,
        y: (item.bounds.y1 + item.bounds.y2) / 2,
    };
}

export function targetFeedbackDetailsPosition(
    anchor: { x: number; y: number },
    size: { width: number; height: number },
    viewport: { width: number; height: number },
): { left: number; top: number } {
    const gap = 14;
    const margin = 8;
    const left = anchor.x + gap + size.width <= viewport.width - margin
        ? anchor.x + gap
        : Math.max(margin, anchor.x - gap - size.width);
    const top = anchor.y + gap + size.height <= viewport.height - margin
        ? anchor.y + gap
        : Math.max(margin, anchor.y - gap - size.height);
    return { left, top };
}

export function targetFeedbackEntries(
    item: any,
    fallback: Record<string, unknown>,
): [string, unknown][] {
    const value = withoutSemanticInteractionField(item?.tooltip ?? fallback);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return value === undefined || value === null ? [] : [['Value', value]];
    }
    return Object.entries(value as Record<string, unknown>);
}

export function createTargetFeedbackOverlay(options: {
    container: HTMLElement;
    feedback: TargetFeedbackOptions;
    coordinateSpace(): RendererCoordinateSpace;
    containerLayoutSize(): { width: number; height: number };
}): TargetFeedbackOverlayController {
    const { container, feedback, coordinateSpace, containerLayoutSize } = options;
    const layer = document.createElement('div');
    const indicator = document.createElement('div');
    const details = document.createElement('div');
    layer.dataset.flintTargetFeedback = '';
    indicator.dataset.flintTargetIndicator = '';
    details.dataset.flintTargetDetails = '';
    details.setAttribute('role', 'status');
    details.setAttribute('aria-live', 'polite');
    Object.assign(layer.style, {
        position: 'absolute', inset: '0', zIndex: '4', pointerEvents: 'none', overflow: 'visible',
    });
    Object.assign(indicator.style, {
        position: 'absolute', width: '14px', height: '14px', border: '2px solid #20262c',
        borderRadius: '50%', background: 'rgba(255,255,255,0.72)', boxSizing: 'border-box',
        transform: 'translate(-50%, -50%)', boxShadow: '0 0 0 2px rgba(255,255,255,0.78)',
    });
    Object.assign(details.style, {
        position: 'absolute', zIndex: '1000', padding: '8px', border: '1px solid #d9d9d9',
        borderRadius: '3px', background: 'rgba(255,255,255,0.95)', color: '#000',
        font: '11px sans-serif', boxShadow: '2px 2px 4px rgba(0,0,0,0.1)',
    });
    layer.append(indicator);

    const clear = (): void => {
        layer.remove();
        details.remove();
    };
    const render = (item: any, target: SemanticTarget | null, source: 'assisted' | 'keyboard'): void => {
        const element = target?.elements[0];
        const point = targetFeedbackPoint(item);
        if (!point || !element) {
            clear();
            return;
        }
        document.querySelectorAll<HTMLElement>('[data-flint-target-feedback], [data-flint-target-details]')
            .forEach((node) => {
                if (node !== layer && node !== details) node.remove();
            });
        if (!layer.isConnected) container.append(layer);
        if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
        const space = coordinateSpace();
        const renderer = container.querySelector('svg, canvas') as HTMLElement | null;
        const containerRect = container.getBoundingClientRect();
        const rendererRect = renderer?.getBoundingClientRect() ?? space.rect;
        const rendererLayout = clientRectToLayoutRect(rendererRect, containerRect, containerLayoutSize());
        const scaleX = rendererLayout.width / space.logicalWidth;
        const scaleY = rendererLayout.height / space.logicalHeight;
        const centerX = rendererLayout.left + (point.x + space.originX) * scaleX;
        const centerY = rendererLayout.top + (point.y + space.originY) * scaleY;
        const clientX = containerRect.left + centerX;
        const clientY = containerRect.top + centerY;
        indicator.style.display = feedback.indicator === false ? 'none' : 'block';
        indicator.style.left = `${centerX}px`;
        indicator.style.top = `${centerY}px`;
        indicator.style.borderStyle = source === 'keyboard' ? 'solid' : 'dashed';

        const detailsOptions = typeof feedback.details === 'object' ? feedback.details : {};
        const showDetails = feedback.details !== false;
        details.style.display = showDetails ? 'block' : 'none';
        if (!showDetails) {
            details.remove();
            return;
        }
        const entries = targetFeedbackEntries(item, element.value)
            .filter(([field]) => !detailsOptions.fields || detailsOptions.fields.includes(field))
            .slice(0, detailsOptions.maxRows ?? 4);
        details.replaceChildren(...entries.map(([field, value]) => {
            const row = document.createElement('div');
            const label = document.createElement('span');
            const content = document.createElement('span');
            Object.assign(row.style, {
                display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: '4px', alignItems: 'baseline',
                padding: '2px 0',
            });
            Object.assign(label.style, { color: '#808080', maxWidth: '150px', textAlign: 'right' });
            Object.assign(content.style, {
                display: 'block', maxWidth: '300px', maxHeight: '7em', overflow: 'hidden', textOverflow: 'ellipsis',
            });
            label.textContent = field;
            content.textContent = String(value);
            row.append(label, content);
            return row;
        }));
        if (!details.isConnected) document.body.append(details);
        const detailsRect = details.getBoundingClientRect();
        const position = targetFeedbackDetailsPosition(
            { x: clientX, y: clientY },
            { width: detailsRect.width, height: detailsRect.height },
            { width: window.innerWidth, height: window.innerHeight },
        );
        details.style.left = `${position.left + window.scrollX}px`;
        details.style.top = `${position.top + window.scrollY}px`;
    };

    return { render, clear, destroy: clear };
}
