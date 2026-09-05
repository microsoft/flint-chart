import type { RenderHit, SemanticTarget } from '../../../core/interaction-semantics';
import type { PlotPoint } from '../../../interactive/interactions';
import type { VegaReorderAxis } from '../contracts';
import {
    axisItems,
    axisTargetIdentity,
    clientRectToLayoutRect,
    renderHit,
    sceneItems,
    type RendererCoordinateSpace,
} from '../hit-adapter';

export interface DragReorderPreview {
    start: PlotPoint;
    current: PlotPoint;
    axis?: 'x' | 'y';
    field?: string;
    source: SemanticTarget;
    destination: SemanticTarget;
    includeControl?: boolean;
    ghostOpacity?: number;
    dimmerOpacity?: number;
    sourceDimmerOpacity?: number;
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
    axisTargets?: Readonly<Record<string, import('../contracts').VegaAxisTarget>>;
    coordinateSpace(): RendererCoordinateSpace;
    containerLayoutSize(): { width: number; height: number };
}

export function dragGhostDelta(
    preview: Pick<DragReorderPreview, 'start' | 'current'>,
): PlotPoint {
    return {
        x: preview.current.x - preview.start.x,
        y: preview.current.y - preview.start.y,
    };
}

const SVG_NS = 'http://www.w3.org/2000/svg';

function hasOneValue(values: readonly unknown[]): boolean {
    return values.length > 0 && values.every((value) => Object.is(value, values[0]));
}

export function eligibleReorderAxes<T extends Pick<VegaReorderAxis, 'axis' | 'field'>>(
    axes: readonly T[],
    target: SemanticTarget,
): T[] {
    return axes.filter(({ field }) => hasOneValue(target.elements.flatMap((element) => {
        const records = element.records?.length ? element.records : [element.value];
        return records.flatMap((record) => record[field] === undefined ? [] : [record[field]]);
    })));
}

export function eligibleReorderAxesForHit<T extends Pick<VegaReorderAxis, 'axis' | 'field'>>(
    axes: readonly T[],
    hit: RenderHit,
): T[] {
    const records = hit.pathData?.length ? hit.pathData : [hit.datum];
    return axes.filter(({ field }) => hasOneValue(
        records.flatMap((record) => record[field] === undefined ? [] : [record[field]]),
    ));
}

export function eligibleReorderAxesForAxis<T extends Pick<VegaReorderAxis, 'axis' | 'field'>>(
    axes: readonly T[],
    identity: Pick<VegaReorderAxis, 'axis' | 'field'>,
): T[] {
    return axes.filter(({ axis, field }) => axis === identity.axis && field === identity.field);
}

function targetValue(target: SemanticTarget, field: string): unknown {
    const element = target.elements[0];
    return element?.records?.find((record) => record[field] !== undefined)?.[field]
        ?? element?.value[field]
        ?? (element?.value.field === field ? element.value.value : undefined);
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

export function reorderOwnedItems(
    items: readonly any[],
    axis: Pick<VegaReorderAxis, 'field' | 'markTypes'>,
    value: unknown,
): any[] {
    return items.filter((item) => renderHit(item)?.datum[axis.field] === value
        && (!axis.markTypes || axis.markTypes.includes(item.mark?.marktype)));
}

export function reorderPreviewItems(
    items: readonly any[],
    axis: Pick<VegaReorderAxis, 'field' | 'markTypes' | 'includeConnectiveMarks'>,
    value: unknown,
): any[] {
    const candidates = reorderOwnedItems(items, axis, value)
        .filter((item) => item.interactionGeometry?.points?.length >= 2 || item.bounds);
    const discrete = candidates.filter((item) => {
        const markType = item.mark?.marktype;
        return markType !== 'line' && markType !== 'area';
    });
    return axis.includeConnectiveMarks || discrete.length === 0 ? candidates : discrete;
}

export function createDragReorderOverlay({
    view,
    container,
    reorderAxes,
    axisTargets,
    coordinateSpace,
    containerLayoutSize,
}: DragReorderOverlayOptions): DragReorderOverlayController {
    const layer = document.createElementNS(SVG_NS, 'svg');
    type GhostItem = {
        element?: SVGGraphicsElement;
        matrix?: { a: number; b: number; c: number; d: number; e: number; f: number };
        points: PlotPoint[];
        fill: string;
        fillOpacity: number;
        stroke: string;
        strokeWidth: number;
    };
    let ghostSnapshot: {
        axis: 'x' | 'y';
        field: string;
        sourceValue: unknown;
        start: PlotPoint;
        items: GhostItem[];
    } | undefined;
    Object.assign(layer.style, {
        position: 'absolute', zIndex: '4', pointerEvents: 'none', overflow: 'hidden',
    });

    const clear = (): void => {
        layer.remove();
        ghostSnapshot = undefined;
    };
    const render = (preview: DragReorderPreview): void => {
        const candidateAxes = preview.field
            ? reorderAxes.filter((axis) => axis.field === preview.field)
            : reorderAxes;
        const active = activeReorderAxis(candidateAxes, preview);
        if (!active) return clear();
        const sourceValue = targetValue(preview.source, active.field);
        const destinationValue = targetValue(preview.destination, active.field);
        const scene = sceneItems(view);
        const sourceItems = reorderPreviewItems(scene, active, sourceValue);
        const destinationItems = reorderOwnedItems(scene, active, destinationValue)
            .filter((item) => item.bounds);
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
            ? [...renderer.querySelectorAll<SVGGraphicsElement>('[role="graphics-symbol"], text')]
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
        const sourceAxisValue = preview.source.visual.kind === 'axis'
            ? preview.source.elements[0]?.value
            : undefined;
        const sourceAxisItem = sourceAxisValue
            ? axisItems(view, axisTargets).find((item) => {
                const identity = axisTargetIdentity(item, axisTargets);
                return identity?.role === 'axis-label'
                    && identity.axis === sourceAxisValue.axis
                    && identity.field === sourceAxisValue.field
                    && Object.is(identity.value, sourceAxisValue.value);
            })
            : undefined;

        const sameGhost = ghostSnapshot
            && ghostSnapshot.axis === active.axis
            && ghostSnapshot.field === active.field
            && Object.is(ghostSnapshot.sourceValue, sourceValue)
            && ghostSnapshot.start.x === preview.start.x
            && ghostSnapshot.start.y === preview.start.y;
        if (!sameGhost) {
            ghostSnapshot = {
                axis: active.axis,
                field: active.field,
                sourceValue,
                start: { ...preview.start },
                items: sourceItems.map((item): GhostItem => {
                    const rendered = renderedElement(item);
                    const matrix = rendered?.getCTM();
                    const element = rendered && matrix
                        ? rendered.cloneNode(true) as SVGGraphicsElement
                        : undefined;
                    if (element) {
                        element.removeAttribute('role');
                        element.removeAttribute('aria-label');
                        element.setAttribute('aria-hidden', 'true');
                    }
                    const points: PlotPoint[] = (item.interactionGeometry?.points ?? [
                        { x: item.bounds.x1, y: item.bounds.y1 },
                        { x: item.bounds.x2, y: item.bounds.y1 },
                        { x: item.bounds.x2, y: item.bounds.y2 },
                        { x: item.bounds.x1, y: item.bounds.y2 },
                    ]).map((point: PlotPoint) => ({ ...point }));
                    return {
                        element,
                        matrix: matrix ? {
                            a: matrix.a, b: matrix.b, c: matrix.c,
                            d: matrix.d, e: matrix.e, f: matrix.f,
                        } : undefined,
                        points,
                        fill: item.fill ?? '#4c78a8',
                        fillOpacity: (item.opacity ?? 1) * (item.fillOpacity ?? 1),
                        stroke: item.stroke ?? '#ffffff',
                        strokeWidth: Math.max(1, item.strokeWidth ?? 0),
                    };
                }),
            };
        }

        const dimmedItems = scene.filter((item) => {
            const value = renderHit(item)?.datum[active.field];
            return value !== undefined && item.bounds;
        });
        const dimmedElements = new Set<SVGGraphicsElement>();
        for (const item of dimmedItems) {
            const sourceItem = Object.is(renderHit(item)?.datum[active.field], sourceValue);
            const dimOpacity = String(sourceItem
                ? preview.sourceDimmerOpacity ?? 0.5
                : preview.dimmerOpacity ?? 0.68);
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

        // The category axis chooses the drop slot; it must not constrain the
        // visual ghost. Preserve the grab offset and follow the pointer freely.
        const delta = dragGhostDelta(preview);
        // Render from the gesture-start snapshot, not from the live scene. The
        // chart may have reflowed since pointer-down (for example after a prior
        // order update), but the ghost must remain attached to this pointer.
        for (const item of ghostSnapshot?.items ?? []) {
            if (item.element && item.matrix) {
                const { matrix } = item;
                item.element.setAttribute('transform', `matrix(${matrix.a} ${matrix.b} ${matrix.c} ${matrix.d} ${matrix.e + delta.x} ${matrix.f + delta.y})`);
                item.element.setAttribute('opacity', String(preview.ghostOpacity ?? 0.62));
                layer.append(item.element);
                continue;
            }
            const shape = document.createElementNS(SVG_NS, 'polygon');
            shape.setAttribute('points', item.points
                .map((point: PlotPoint) => `${point.x + space.originX + delta.x},${point.y + space.originY + delta.y}`)
                .join(' '));
            shape.setAttribute('fill', item.fill);
            shape.setAttribute('fill-opacity', String(item.fillOpacity * (preview.ghostOpacity ?? 0.62)));
            shape.setAttribute('stroke', item.stroke);
            shape.setAttribute('stroke-width', String(item.strokeWidth));
            layer.append(shape);
        }

        if (preview.includeControl !== false && sourceAxisItem) {
            const labelGhost = cloneRenderedElement(sourceAxisItem, delta);
            if (labelGhost) {
                labelGhost.setAttribute('opacity', String(preview.ghostOpacity ?? 0.72));
                layer.append(labelGhost);
            }
        }

        if (!Object.is(sourceValue, destinationValue)) {
            const bounds = destinationItems.reduce((result, item) => ({
                x1: Math.min(result.x1, item.bounds.x1), y1: Math.min(result.y1, item.bounds.y1),
                x2: Math.max(result.x2, item.bounds.x2), y2: Math.max(result.y2, item.bounds.y2),
            }), { x1: Infinity, y1: Infinity, x2: -Infinity, y2: -Infinity });
            const indicator = document.createElementNS(SVG_NS, 'line');
            if (active.axis === 'x') {
                const edge = delta.x >= 0 ? 'end' : 'start';
                const x = (edge === 'end' ? bounds.x2 : bounds.x1) + space.originX;
                indicator.setAttribute('x1', String(x));
                indicator.setAttribute('x2', String(x));
                indicator.setAttribute('y1', String(space.originY));
                indicator.setAttribute('y2', String(space.originY + space.plotHeight));
            } else {
                const edge = delta.y >= 0 ? 'end' : 'start';
                const y = (edge === 'end' ? bounds.y2 : bounds.y1) + space.originY;
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
