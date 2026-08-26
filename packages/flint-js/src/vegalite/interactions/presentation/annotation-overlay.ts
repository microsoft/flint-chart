import type { SemanticElement } from '../../../core/interaction-semantics';
import type { AnnotationRenderPlan, PlotPoint } from '../../../interactive/interactions';
import {
    INTERACTION_KEY,
    clientToLayoutPoint,
    plotToClientPoint,
    sceneItems,
    type RendererCoordinateSpace,
} from '../hit-adapter';

function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

function keyOfDatum(datum: unknown): string | undefined {
    if (!datum || typeof datum !== 'object') return undefined;
    const key = (datum as Record<string, unknown>)[INTERACTION_KEY];
    return typeof key === 'string' ? key : undefined;
}

export interface AnnotationOverlayController {
    render(element: SemanticElement, annotation: AnnotationRenderPlan, point?: PlotPoint): void;
    clear(): void;
    destroy(): void;
}

export interface AnnotationOverlayOptions {
    view: any;
    container: HTMLElement;
    coordinateSpace(): RendererCoordinateSpace;
    containerLayoutSize(): { width: number; height: number };
}

export function createAnnotationOverlay({
    view,
    container,
    coordinateSpace,
    containerLayoutSize,
}: AnnotationOverlayOptions): AnnotationOverlayController {
    const annotationLayer = document.createElement('div');
    Object.assign(annotationLayer.style, {
        position: 'absolute', inset: '0', zIndex: '4', pointerEvents: 'none', overflow: 'hidden',
    });
    const annotationSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    Object.assign(annotationSvg.style, { position: 'absolute', inset: '0', width: '100%', height: '100%' });
    const annotationPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    annotationPath.setAttribute('fill', 'none');
    annotationPath.setAttribute('stroke', '#176f58');
    annotationPath.setAttribute('stroke-width', '1.5');
    annotationPath.setAttribute('stroke-linecap', 'round');
    const annotationDot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    annotationDot.setAttribute('r', '3');
    annotationDot.setAttribute('fill', '#176f58');
    annotationDot.setAttribute('stroke', '#ffffff');
    annotationDot.setAttribute('stroke-width', '1.5');
    annotationSvg.append(annotationPath, annotationDot);
    const annotationCard = document.createElement('div');
    Object.assign(annotationCard.style, {
        position: 'absolute', color: '#176f58', fontFamily: 'ui-sans-serif, sans-serif',
        fontSize: '11px', fontWeight: '700', lineHeight: '1', whiteSpace: 'nowrap',
        textShadow: '-1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff',
    });
    annotationLayer.append(annotationSvg, annotationCard);

    const clear = (): void => annotationLayer.remove();
    const render = (element: SemanticElement, annotation: AnnotationRenderPlan, point?: PlotPoint): void => {
        const key = element.key[INTERACTION_KEY];
        const item = typeof key === 'string'
            ? sceneItems(view).find((candidate) => keyOfDatum(candidate.datum) === key)
            : undefined;
        if (!item?.bounds) {
            clear();
            return;
        }
        if (!annotationLayer.isConnected) container.append(annotationLayer);
        if (getComputedStyle(container).position === 'static') container.style.position = 'relative';

        annotationCard.textContent = annotation.text;

        const containerRect = container.getBoundingClientRect();
        const space = coordinateSpace();
        const arcAngle = typeof item.startAngle === 'number' && typeof item.endAngle === 'number'
            ? (item.startAngle + item.endAngle) / 2
            : undefined;
        const arcRadius = typeof item.innerRadius === 'number' && typeof item.outerRadius === 'number'
            ? (item.innerRadius + item.outerRadius) / 2
            : undefined;
        const arcAnchor = annotation.anchor === 'arc-centroid' && arcAngle !== undefined && arcRadius !== undefined
            ? { x: item.x + arcRadius * Math.sin(arcAngle), y: item.y - arcRadius * Math.cos(arcAngle) }
            : undefined;
        type Placement = 'above' | 'below' | 'left' | 'right';
        let outward: Placement | undefined;
        let markEnd: PlotPoint | undefined;
        if (annotation.anchor === 'mark-end') {
            const horizontal = item.bounds.x2 - item.bounds.x1 >= item.bounds.y2 - item.bounds.y1;
            const items = sceneItems(view);
            const countAt = (edge: 'x1' | 'x2' | 'y1' | 'y2', value: number): number => items
                .filter((candidate) => Math.abs(candidate.bounds[edge] - value) < 0.5)
                .length;
            if (horizontal) {
                const leftIsBaseline = countAt('x1', item.bounds.x1) >= countAt('x2', item.bounds.x2);
                outward = leftIsBaseline ? 'right' : 'left';
                markEnd = {
                    x: leftIsBaseline ? item.bounds.x2 : item.bounds.x1,
                    y: (item.bounds.y1 + item.bounds.y2) / 2,
                };
            } else {
                const topIsBaseline = countAt('y1', item.bounds.y1) > countAt('y2', item.bounds.y2);
                outward = topIsBaseline ? 'below' : 'above';
                markEnd = {
                    x: (item.bounds.x1 + item.bounds.x2) / 2,
                    y: topIsBaseline ? item.bounds.y2 : item.bounds.y1,
                };
            }
        } else if (annotation.anchor === 'arc-centroid' && arcAnchor) {
            const deltaX = arcAnchor.x - item.x;
            const deltaY = arcAnchor.y - item.y;
            outward = Math.abs(deltaX) >= Math.abs(deltaY)
                ? deltaX >= 0 ? 'right' : 'left'
                : deltaY >= 0 ? 'below' : 'above';
        } else if (annotation.anchor === 'top') outward = 'above';
        else if (annotation.anchor === 'bottom') outward = 'below';
        else if (annotation.anchor === 'left') outward = 'left';
        else if (annotation.anchor === 'right') outward = 'right';
        const exactPoint = annotation.anchor === 'center' ? point : undefined;
        const anchorPlotX = exactPoint?.x ?? markEnd?.x ?? arcAnchor?.x ?? (annotation.anchor === 'left' ? item.bounds.x1
            : annotation.anchor === 'right' ? item.bounds.x2
            : (item.bounds.x1 + item.bounds.x2) / 2);
        const anchorPlotY = exactPoint?.y ?? markEnd?.y ?? arcAnchor?.y ?? (annotation.anchor === 'top' ? item.bounds.y1
            : annotation.anchor === 'bottom' ? item.bounds.y2
            : (item.bounds.y1 + item.bounds.y2) / 2);
        const anchorClient = plotToClientPoint({ x: anchorPlotX, y: anchorPlotY }, space);
        const anchorLayout = clientToLayoutPoint(anchorClient, containerRect, containerLayoutSize());
        const anchorX = anchorLayout.x;
        const anchorY = anchorLayout.y;
        const width = container.clientWidth;
        const height = container.clientHeight;
        const cardWidth = annotationCard.offsetWidth;
        const cardHeight = annotationCard.offsetHeight;
        let placement = annotation.placement === 'auto' || !annotation.placement
            ? (outward ?? (anchorX < width * 0.58 ? 'right' : 'left'))
            : annotation.placement;
        if (placement === 'above' && anchorY < cardHeight + 34) placement = 'below';
        if (placement === 'below' && anchorY + cardHeight + 34 > height) placement = 'above';
        if (placement === 'right' && anchorX + cardWidth + 38 > width) placement = 'left';
        if (placement === 'left' && anchorX - cardWidth - 38 < 0) placement = 'right';
        let cardX = anchorX + 34;
        let cardY = anchorY - cardHeight / 2;
        if (placement === 'left') cardX = anchorX - cardWidth - 38;
        if (placement === 'above') {
            cardX = anchorX - cardWidth / 2;
            cardY = anchorY - cardHeight - 28;
        } else if (placement === 'below') {
            cardX = anchorX - cardWidth / 2;
            cardY = anchorY + 28;
        }
        cardX = clamp(cardX, 8, Math.max(8, width - cardWidth - 8));
        cardY = clamp(cardY, 8, Math.max(8, height - cardHeight - 8));
        annotationCard.style.left = `${cardX}px`;
        annotationCard.style.top = `${cardY}px`;

        const vertical = placement === 'above' || placement === 'below';
        const endX = vertical ? clamp(anchorX, cardX, cardX + cardWidth) : placement === 'right' ? cardX : cardX + cardWidth;
        const endY = vertical ? placement === 'above' ? cardY + cardHeight : cardY : clamp(anchorY, cardY, cardY + cardHeight);
        const control1X = vertical ? anchorX : anchorX + (placement === 'right' ? 18 : -18);
        const control1Y = vertical ? anchorY + (placement === 'below' ? 14 : -14) : anchorY;
        const control2X = vertical ? endX : endX + (placement === 'right' ? -18 : 18);
        const control2Y = vertical ? endY + (placement === 'below' ? -14 : 14) : endY;
        annotationSvg.setAttribute('viewBox', `0 0 ${width} ${height}`);
        annotationPath.setAttribute(
            'd',
            `M ${anchorX} ${anchorY} C ${control1X} ${control1Y}, ${control2X} ${control2Y}, ${endX} ${endY}`,
        );
        annotationDot.setAttribute('cx', String(anchorX));
        annotationDot.setAttribute('cy', String(anchorY));
    };

    return {
        render,
        clear,
        destroy: clear,
    };
}
