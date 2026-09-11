import type {
    FreeformOverlaySpec,
    FreeformOverlayTransform,
} from '../../../core/interaction-contracts';
import { clientRectToLayoutRect, type RendererCoordinateSpace } from '../hit-adapter';

export interface FreeformOverlayController {
    render(overlays: ReadonlyMap<string, FreeformOverlaySpec>): void;
    clear(): void;
    destroy(): void;
}

export interface FreeformOverlayOptions {
    container: HTMLElement;
    coordinateSpace(): RendererCoordinateSpace;
    containerLayoutSize(): { width: number; height: number };
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function transformAttribute(transform: FreeformOverlayTransform | undefined): string | undefined {
    if (!transform) return undefined;
    const parts: string[] = [];
    if (transform.translate) parts.push(`translate(${transform.translate.x} ${transform.translate.y})`);
    if (transform.rotate !== undefined) parts.push(`rotate(${transform.rotate})`);
    if (typeof transform.scale === 'number') parts.push(`scale(${transform.scale})`);
    else if (transform.scale) parts.push(`scale(${transform.scale.x} ${transform.scale.y})`);
    return parts.length > 0 ? parts.join(' ') : undefined;
}

function sanitizeSvg(element: SVGElement): SVGElement {
    const descendants = Array.from(element.querySelectorAll('*')) as unknown as SVGElement[];
    const nodes = [element, ...descendants];
    for (const node of nodes) {
        if (node.localName === 'script' || node.localName === 'foreignObject') {
            node.remove();
            continue;
        }
        for (const attribute of [...node.attributes]) {
            const name = attribute.name.toLowerCase();
            const value = attribute.value.trim().toLowerCase();
            if (name.startsWith('on')
                || ((name === 'href' || name === 'xlink:href') && value.startsWith('javascript:'))) {
                node.removeAttribute(attribute.name);
            }
        }
    }
    return element;
}

export function freeformSvgElement(content: string | SVGElement): SVGElement | null {
    if (typeof content !== 'string') {
        return sanitizeSvg(content.cloneNode(true) as SVGElement);
    }
    const parsed = new DOMParser().parseFromString(content, 'image/svg+xml');
    if (parsed.querySelector('parsererror') || parsed.documentElement.namespaceURI !== SVG_NS) return null;
    return sanitizeSvg(document.importNode(parsed.documentElement, true) as unknown as SVGElement);
}

export function createFreeformOverlay({
    container,
    coordinateSpace,
    containerLayoutSize,
}: FreeformOverlayOptions): FreeformOverlayController {
    const layer = document.createElementNS(SVG_NS, 'svg');
    Object.assign(layer.style, {
        position: 'absolute', zIndex: '4', pointerEvents: 'none', overflow: 'hidden',
    });

    const clear = (): void => layer.remove();
    const render = (overlays: ReadonlyMap<string, FreeformOverlaySpec>): void => {
        const renderable = [...overlays].filter(([, spec]) =>
            spec.body.some((component) => component.type === 'svg'));
        if (renderable.length === 0) return clear();
        layer.replaceChildren();
        if (!layer.isConnected) container.append(layer);
        if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
        const space = coordinateSpace();
        const renderer = container.querySelector('canvas, svg') as HTMLElement | null;
        const containerRect = container.getBoundingClientRect();
        const rendererRect = renderer?.getBoundingClientRect() ?? space.rect;
        const rendererLayout = clientRectToLayoutRect(rendererRect, containerRect, containerLayoutSize());
        Object.assign(layer.style, {
            left: `${rendererLayout.left}px`, top: `${rendererLayout.top}px`,
            width: `${rendererLayout.width}px`, height: `${rendererLayout.height}px`,
        });
        layer.setAttribute('viewBox', `0 0 ${space.logicalWidth} ${space.logicalHeight}`);

        for (const [name, spec] of renderable) {
            for (const component of spec.body) {
                if (component.type !== 'svg') continue;
                const group = document.createElementNS(SVG_NS, 'g');
                group.setAttribute('data-flint-freeform-overlay', name);
                const transforms: string[] = [];
                if (spec.coordinateSpace === 'plot') transforms.push(`translate(${space.originX} ${space.originY})`);
                const bodyTransform = transformAttribute(component.transform);
                if (bodyTransform) transforms.push(bodyTransform);
                if (transforms.length > 0) group.setAttribute('transform', transforms.join(' '));
                const element = freeformSvgElement(component.content);
                if (element) group.append(element);
                layer.append(group);
            }
        }
    };

    return { render, clear, destroy: clear };
}
