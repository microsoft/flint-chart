import type { ChartOverlaySpec } from '../../../core/interaction-contracts';
import type { SemanticTarget } from '../../../core/interaction-semantics';
import type { PlotPoint } from '../../../interactive/language/geometry';
import type { PathProjection } from '../../../interactive/language/projections';
import type { RendererCoordinateSpace } from '../hit-adapter';

export interface DataOverlayController {
    render(overlays: ReadonlyMap<string, ChartOverlaySpec>): void;
    targetForElement(element: EventTarget | null): { name: string; target: SemanticTarget } | null;
    targetAt(point: PlotPoint, maxDistance: number): { name: string; target: SemanticTarget } | null;
    project(name: string, point: PlotPoint): PathProjection | undefined;
    sync(): void;
    destroy(): void;
}

export interface DataOverlayOptions {
    view: any;
    container: HTMLElement;
    scales: Partial<Record<'x' | 'y' | 'color', string>>;
    coordinateSpace(): RendererCoordinateSpace;
    containerLayoutSize(): { width: number; height: number };
}

export function orderedOverlayRows(spec: ChartOverlaySpec): readonly Record<string, unknown>[] {
    const rows = [...spec.data.values];
    const field = spec.encodings.order?.field;
    if (!field) return rows;
    return rows.sort((left, right) => {
        const a = left[field];
        const b = right[field];
        if (typeof a === 'number' && typeof b === 'number') return a - b;
        return String(a ?? '').localeCompare(String(b ?? ''));
    });
}

export function projectPointToPath(
    point: PlotPoint,
    vertices: readonly { point: PlotPoint; record: Record<string, unknown> }[],
): PathProjection | undefined {
    let nearest: PathProjection | undefined;
    for (let index = 0; index < vertices.length - 1; index += 1) {
        const start = vertices[index];
        const end = vertices[index + 1];
        const dx = end.point.x - start.point.x;
        const dy = end.point.y - start.point.y;
        const lengthSquared = dx * dx + dy * dy;
        const rawT = lengthSquared > 0
            ? ((point.x - start.point.x) * dx + (point.y - start.point.y) * dy) / lengthSquared
            : 0;
        const t = Math.max(0, Math.min(1, rawT));
        const projected = { x: start.point.x + dx * t, y: start.point.y + dy * t };
        const distance = Math.hypot(point.x - projected.x, point.y - projected.y);
        if (nearest && nearest.distance <= distance) continue;
        nearest = {
            kind: 'path',
            point: projected,
            distance,
            segment: {
                start: { value: start.record, records: [start.record] },
                end: { value: end.record, records: [end.record] },
                t,
            },
        };
    }
    return nearest;
}

/**
 * Renders data overlays in a sibling SVG plane. It never mutates the assembled
 * Vega/Vega-Lite mark tree, so template scale resolution and composition remain intact.
 */
export function createDataOverlay({
    view,
    container,
    scales,
    coordinateSpace,
    containerLayoutSize,
}: DataOverlayOptions): DataOverlayController {
    const layer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    let current = new Map<string, ChartOverlaySpec>();
    const projectedVertices = new Map<string, { point: PlotPoint; record: Record<string, unknown> }[]>();
    const targetFor = (
        name: string,
        spec: ChartOverlaySpec,
        records: readonly Record<string, unknown>[],
    ): { name: string; target: SemanticTarget } => ({
        name,
        target: {
            visual: { kind: spec.mark === 'line' ? 'path' : 'mark', role: spec.role },
            elements: [{ value: { overlay: name }, records }],
        },
    });
    Object.assign(layer.style, {
        position: 'absolute', inset: '0', zIndex: '4', width: '100%', height: '100%',
        pointerEvents: 'none', overflow: 'hidden',
    });

    const draw = (): void => {
        layer.replaceChildren();
        projectedVertices.clear();
        if (current.size === 0 || !scales.x || !scales.y) {
            layer.remove();
            return;
        }
        const xScale = view.scale(scales.x);
        const yScale = view.scale(scales.y);
        const colorScale = scales.color ? view.scale(scales.color) : undefined;
        if (typeof xScale !== 'function' || typeof yScale !== 'function') {
            layer.remove();
            return;
        }
        const space = coordinateSpace();
        const renderer = container.querySelector('canvas, svg') as HTMLElement | null;
        const containerRect = container.getBoundingClientRect();
        const rendererRect = renderer?.getBoundingClientRect() ?? space.rect;
        const size = containerLayoutSize();
        const scaleX = containerRect.width > 0 ? size.width / containerRect.width : 1;
        const scaleY = containerRect.height > 0 ? size.height / containerRect.height : 1;
        Object.assign(layer.style, {
            inset: 'auto',
            left: `${(rendererRect.left - containerRect.left) * scaleX}px`,
            top: `${(rendererRect.top - containerRect.top) * scaleY}px`,
            width: `${rendererRect.width * scaleX}px`,
            height: `${rendererRect.height * scaleY}px`,
        });
        layer.setAttribute('viewBox', `0 0 ${space.logicalWidth} ${space.logicalHeight}`);

        for (const [name, spec] of current) {
            const rows = orderedOverlayRows(spec);
            const projected = (row: Record<string, unknown>, xField: string, yField: string) => {
                const x = xScale(row[xField]);
                const y = yScale(row[yField]);
                return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
            };
            const points = rows.flatMap((row) => {
                const x = xScale(row[spec.encodings.x.field]);
                const y = yScale(row[spec.encodings.y.field]);
                return Number.isFinite(x) && Number.isFinite(y)
                    ? [{ x: x + space.originX, y: y + space.originY }]
                    : [];
            });
            if (points.length === 0) continue;
            const identify = (element: SVGElement, rowIndex?: number): void => {
                element.setAttribute('data-flint-overlay', name);
                element.setAttribute('data-flint-role', spec.role);
                if (rowIndex !== undefined) element.setAttribute('data-flint-row', String(rowIndex));
                element.setAttribute('opacity', String(spec.style?.opacity ?? 1));
                // Overlay marks stay click-through. Gesture acquisition uses
                // targetAt() against rendered geometry, so the underlying chart
                // retains authoritative click/hover semantics.
                element.style.pointerEvents = 'none';
            };

            if (spec.mark === 'line') {
                const vertices = rows.flatMap((row) => {
                    const point = projected(row, spec.encodings.x.field, spec.encodings.y.field);
                    return point ? [{ point, record: row }] : [];
                });
                projectedVertices.set(name, vertices);
                const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                identify(path);
                path.setAttribute('d', points.map((point, index) =>
                    `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`).join(' '));
                path.setAttribute('fill', spec.style?.fill ?? 'none');
                path.setAttribute('fill-opacity', String(spec.style?.fillOpacity ?? 1));
                const colorValue = spec.encodings.color
                    ? colorScale?.(rows[0]?.[spec.encodings.color.field])
                    : undefined;
                path.setAttribute('stroke', spec.style?.stroke ?? colorValue ?? '#4c78a8');
                path.setAttribute('stroke-width', String(spec.style?.strokeWidth ?? 2));
                if (spec.style?.strokeDash?.length) {
                    path.setAttribute('stroke-dasharray', spec.style.strokeDash.join(' '));
                }
                path.setAttribute('stroke-linecap', 'round');
                path.setAttribute('stroke-linejoin', 'round');
                path.setAttribute('vector-effect', 'non-scaling-stroke');
                layer.append(path);
                continue;
            }

            rows.forEach((row, rowIndex) => {
                const point = projected(row, spec.encodings.x.field, spec.encodings.y.field);
                if (!point) return;
                const x = point.x + space.originX;
                const y = point.y + space.originY;
                if (spec.mark === 'point') {
                    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
                    identify(circle, rowIndex);
                    circle.setAttribute('cx', String(x));
                    circle.setAttribute('cy', String(y));
                    circle.setAttribute('r', String(spec.style?.pointRadius ?? 4));
                    circle.setAttribute('fill', spec.style?.fill ?? '#4c78a8');
                    circle.setAttribute('fill-opacity', String(spec.style?.fillOpacity ?? 1));
                    if (spec.style?.stroke) circle.setAttribute('stroke', spec.style.stroke);
                    if (spec.style?.strokeWidth !== undefined) circle.setAttribute('stroke-width', String(spec.style.strokeWidth));
                    layer.append(circle);
                    return;
                }
                if (spec.mark === 'text') {
                    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
                    identify(text, rowIndex);
                    text.setAttribute('x', String(x + (spec.style?.dx ?? 0)));
                    text.setAttribute('y', String(y + (spec.style?.dy ?? 0)));
                    text.setAttribute('text-anchor', spec.style?.textAlign ?? 'middle');
                    text.setAttribute('font-size', String(spec.style?.fontSize ?? 11));
                    text.setAttribute('font-weight', String(spec.style?.fontWeight ?? 'normal'));
                    const colorValue = spec.encodings.color
                        ? colorScale?.(row[spec.encodings.color.field])
                        : undefined;
                    text.setAttribute('fill', spec.style?.fill ?? colorValue ?? '#333333');
                    text.textContent = String(spec.encodings.text ? row[spec.encodings.text.field] ?? '' : '');
                    layer.append(text);
                    return;
                }

                const endPoint = spec.encodings.x2 && spec.encodings.y2
                    ? projected(row, spec.encodings.x2.field, spec.encodings.y2.field)
                    : undefined;
                if (!endPoint) return;
                const x2 = endPoint.x + space.originX;
                const y2 = endPoint.y + space.originY;
                if (spec.mark === 'rule') {
                    const rule = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                    identify(rule, rowIndex);
                    rule.setAttribute('x1', String(x));
                    rule.setAttribute('y1', String(y));
                    rule.setAttribute('x2', String(x2));
                    rule.setAttribute('y2', String(y2));
                    rule.setAttribute('stroke', spec.style?.stroke ?? '#4c78a8');
                    rule.setAttribute('stroke-width', String(spec.style?.strokeWidth ?? 1));
                    layer.append(rule);
                    return;
                }
                const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                identify(rect, rowIndex);
                rect.setAttribute('x', String(Math.min(x, x2)));
                rect.setAttribute('y', String(Math.min(y, y2)));
                rect.setAttribute('width', String(Math.abs(x2 - x)));
                rect.setAttribute('height', String(Math.abs(y2 - y)));
                rect.setAttribute('fill', spec.style?.fill ?? '#4c78a8');
                rect.setAttribute('fill-opacity', String(spec.style?.fillOpacity ?? 0.2));
                if (spec.style?.stroke) rect.setAttribute('stroke', spec.style.stroke);
                if (spec.style?.strokeWidth !== undefined) rect.setAttribute('stroke-width', String(spec.style.strokeWidth));
                layer.append(rect);
            });
        }
        if (layer.childElementCount === 0) layer.remove();
        else {
            if (!layer.isConnected) container.append(layer);
            if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
        }
    };

    return {
        render(overlays) {
            current = new Map(overlays);
            draw();
        },
        targetForElement(element) {
            if (!element || typeof (element as Element).getAttribute !== 'function') return null;
            const visual = element as Element;
            const name = visual.getAttribute('data-flint-overlay') ?? undefined;
            const spec = name ? current.get(name) : undefined;
            if (!name || !spec?.interactive) return null;
            const rows = orderedOverlayRows(spec);
            const rowIndex = Number(visual.getAttribute('data-flint-row'));
            const records = Number.isInteger(rowIndex) && rowIndex >= 0 && rowIndex < rows.length
                ? [rows[rowIndex]]
                : rows;
            return targetFor(name, spec, records);
        },
        targetAt(point, maxDistance) {
            let nearest: { name: string; spec: ChartOverlaySpec; distance: number } | undefined;
            for (const [name, spec] of current) {
                if (!spec.interactive || spec.mark !== 'line') continue;
                const projection = projectPointToPath(point, projectedVertices.get(name) ?? []);
                if (!projection || projection.distance > maxDistance) continue;
                if (!nearest || projection.distance < nearest.distance) {
                    nearest = { name, spec, distance: projection.distance };
                }
            }
            return nearest
                ? targetFor(nearest.name, nearest.spec, orderedOverlayRows(nearest.spec))
                : null;
        },
        project(name, point) {
            const spec = current.get(name);
            return spec?.mark === 'line' && spec.projectable
                ? projectPointToPath(point, projectedVertices.get(name) ?? [])
                : undefined;
        },
        sync: draw,
        destroy() {
            current.clear();
            projectedVertices.clear();
            layer.remove();
        },
    };
}