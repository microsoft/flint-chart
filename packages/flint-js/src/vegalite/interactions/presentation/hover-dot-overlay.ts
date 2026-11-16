import { clientRectToLayoutRect, type RendererCoordinateSpace } from '../hit-adapter';

/** Where the baseline tooltip reads a line or a point: plot coordinates and a point's radius. */
export interface HoverDot {
    x: number;
    y: number;
    /** The mark's colour: a line's vertex dot, or a point redrawn larger, is drawn in it. */
    color?: string;
    /** A line's stroke width: the dot is a little wider than the line. */
    lineWidth?: number;
    /** A point's drawn radius: it is redrawn a little larger. Absent on a line: a slim dot marks the vertex. */
    radius?: number;
    /** A point's outline, kept on the larger copy (a house that rings its points). */
    stroke?: string;
    strokeWidth?: number;
}

export interface HoverDotOverlayController {
    render(dot: HoverDot): void;
    clear(): void;
    destroy(): void;
}

const SVG = 'http://www.w3.org/2000/svg';
/** How much larger, in px, a hovered point is redrawn. */
const POINT_GROWTH = 1;
/** How far, in px, a line's vertex dot reaches past the line on each side. */
const LINE_DOT_MARGIN = 1.5;

/** A cue on the line vertex or point the baseline tooltip is reading. */
export function createHoverDotOverlay(options: {
    container: HTMLElement;
    coordinateSpace(): RendererCoordinateSpace;
    containerLayoutSize(): { width: number; height: number };
}): HoverDotOverlayController {
    const { container, coordinateSpace, containerLayoutSize } = options;
    const document = container.ownerDocument;
    const layer = document.createElementNS(SVG, 'svg');
    layer.dataset.flintHoverDot = '';
    layer.setAttribute('aria-hidden', 'true');
    Object.assign(layer.style, {
        position: 'absolute', left: '0', top: '0', width: '100%', height: '100%',
        zIndex: '3', pointerEvents: 'none', overflow: 'visible',
    });
    const circle = document.createElementNS(SVG, 'circle');
    layer.append(circle);

    const clear = (): void => layer.remove();
    const render = (dot: HoverDot): void => {
        if (!layer.isConnected) container.append(layer);
        if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
        const space = coordinateSpace();
        const layout = clientRectToLayoutRect(space.rect, container.getBoundingClientRect(), containerLayoutSize());
        const scaleX = layout.width / space.logicalWidth;
        const scaleY = layout.height / space.logicalHeight;
        circle.setAttribute('cx', String(layout.left + (dot.x + space.originX) * scaleX));
        circle.setAttribute('cy', String(layout.top + (dot.y + space.originY) * scaleY));
        // A line's vertex shows as a dot a little wider than the line, in its colour; a point is redrawn
        // a little larger as it is drawn, outline and all.
        const scale = Math.max(scaleX, scaleY);
        const radius = dot.radius === undefined
            ? Math.max(2, ((dot.lineWidth ?? 2) * scale) / 2 + LINE_DOT_MARGIN)
            : dot.radius * scale + POINT_GROWTH;
        circle.style.display = dot.color ? '' : 'none';
        circle.setAttribute('r', String(radius));
        circle.setAttribute('fill', dot.color ?? 'none');
        if (dot.radius !== undefined && dot.stroke && dot.strokeWidth) {
            circle.setAttribute('stroke', dot.stroke);
            circle.setAttribute('stroke-width', String(dot.strokeWidth * scale));
        } else {
            circle.removeAttribute('stroke');
            circle.removeAttribute('stroke-width');
        }
    };
    return { render, clear, destroy: clear };
}
