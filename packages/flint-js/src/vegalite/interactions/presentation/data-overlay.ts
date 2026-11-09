import type { ChartOverlaySpec } from '../../../core/interaction-contracts';
import type { SemanticTarget } from '../../../core/interaction-semantics';
import type { PlotPoint } from '../../../interactive/language/geometry';
import type { PathProjection } from '../../../interactive/language/projections';
import { pointInClip, type RendererCoordinateSpace } from '../hit-adapter';
import { geoDistance, geoPath } from 'd3-geo';
import { geoOverlayChannels, isGeoOverlay, overlayChannels } from './overlay-channels';
import { INTERACTION_KEY } from '../stores';
import { ROUTE_PART } from '../../templates/map-routes';

export { overlayChannels };

/** A map's live projection, as Vega holds it: longitude and latitude to the plot's pixels. */
export type OverlayProjection = ((point: [number, number]) => [number, number] | null) & {
    rotate?: () => number[];
    clipAngle?: () => number | null;
};

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
    /** Whether the chart clips its marks to the plot, as a navigated chart does; overlays then follow. */
    clipToPlot?: boolean;
    /** On a map, its projection as drawn now: overlays placed by `longitude`/`latitude` go through it. */
    geoProjection?: () => OverlayProjection | undefined;
}

/** A place in degrees, or undefined where a row gives none. */
function lonLat(row: Record<string, unknown>, longitude: string | undefined, latitude: string | undefined): [number, number] | undefined {
    if (!longitude || !latitude) return undefined;
    const lon = Number(row[longitude]);
    const lat = Number(row[latitude]);
    if (row[longitude] === null || row[latitude] === null || !Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90) return undefined;
    return [lon, lat];
}

/**
 * A box between two corners in degrees as a GeoJSON ring: up its west meridian, east along its
 * north parallel, down its east meridian, west along its south parallel — clockwise, as d3-geo reads
 * an outer ring — the parallels walked in short steps, since they are no great circles. A west edge
 * east of the east edge runs across the antimeridian.
 */
export function lonLatBox(west: number, south: number, east: number, north: number): [number, number][] {
    const [s, n] = south <= north ? [south, north] : [north, south];
    const e = east < west ? east + 360 : east;
    const steps = Math.max(1, Math.ceil((e - west) / 2));
    const along = (lat: number, from: number, to: number) => Array.from({ length: steps + 1 }, (_, i) => [from + ((to - from) * i) / steps, lat] as [number, number]);
    return [[west, s], ...along(n, west, e), ...along(s, e, west)];
}



/** An overlay's dash as an SVG dash array: its lengths, or the pattern a word names; none for anything else. */
function dashArray(dash: unknown): string | undefined {
    if (Array.isArray(dash)) return dash.length && dash.every((length) => typeof length === 'number' && length >= 0) ? dash.join(' ') : undefined;
    if (dash === 'dash' || dash === 'dashed') return '6 4';
    if (dash === 'dot' || dash === 'dotted') return '2 3';
    return undefined;
}

export function orderedOverlayRows(spec: ChartOverlaySpec): readonly Record<string, unknown>[] {
    const rows = [...spec.data.values];
    const field = spec.encodings.order?.field;
    if (!field) return rows;
    // Dates order by time, not by their string form.
    const ordinal = (value: unknown): number | undefined =>
        typeof value === 'number' ? value : value instanceof Date ? value.getTime() : undefined;
    return rows.sort((left, right) => {
        const a = ordinal(left[field]);
        const b = ordinal(right[field]);
        if (a !== undefined && b !== undefined) return a - b;
        return String(left[field] ?? '').localeCompare(String(right[field] ?? ''));
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

let dataOverlayClipSequence = 0;

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
    clipToPlot = false,
    geoProjection,
}: DataOverlayOptions): DataOverlayController {
    const layer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const clipId = `flint-overlay-clip-${dataOverlayClipSequence += 1}`;
    let current = new Map<string, ChartOverlaySpec>();
    /** The groups of overlays drawn under the marks, masked once the layer is placed. */
    const underHolders: SVGGElement[] = [];
    let underMaskSequence = 0;

    /**
     * Cut each under-overlay away wherever the chart draws a mark over it: a mask of the page, with the
     * chart's drawn marks — its route legs, their casings and heads, its keyed marks — cloned into it in
     * black, mapped from their place on screen into the layer's. Map ground (land, sea, borders) carries no
     * key and is left out. Vega's SVG renderer keeps each item's element; on canvas there is none, and the
     * overlay stays over the marks.
     */
    const cutUnderMarks = (): void => {
        if (underHolders.length === 0) return;
        const toLayer = layer.getScreenCTM()?.inverse();
        if (!toLayer) return;
        const elements: SVGGraphicsElement[] = [];
        const visit = (node: any): void => {
            if (!node) return;
            const element = node._svg as SVGGraphicsElement | undefined;
            const marktype = node.mark?.marktype;
            if (element && marktype && marktype !== 'group' && (node.opacity ?? 1) > 0) {
                const datum = node.datum;
                const keyed = datum && typeof datum === 'object'
                    && ((datum as Record<string, unknown>)[ROUTE_PART] !== undefined || (datum as Record<string, unknown>)[INTERACTION_KEY] != null);
                if (keyed && element instanceof SVGGraphicsElement) elements.push(element);
            }
            if (Array.isArray(node.items)) for (const child of node.items) visit(child);
        };
        visit(view.scenegraph?.()?.root);
        if (elements.length === 0) return;
        const width = Number(layer.getAttribute('viewBox')?.split(' ')[2]) || 0;
        const height = Number(layer.getAttribute('viewBox')?.split(' ')[3]) || 0;
        const defs = svgElement('g');
        for (const holder of underHolders) {
            const id = `flint-overlay-under-${underMaskSequence += 1}`;
            const mask = document.createElementNS('http://www.w3.org/2000/svg', 'mask');
            mask.setAttribute('id', id);
            mask.setAttribute('maskUnits', 'userSpaceOnUse');
            mask.setAttribute('x', '0');
            mask.setAttribute('y', '0');
            mask.setAttribute('width', String(width));
            mask.setAttribute('height', String(height));
            const page = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
            page.setAttribute('width', String(width));
            page.setAttribute('height', String(height));
            page.setAttribute('fill', '#fff');
            mask.append(page);
            for (const element of elements) {
                const ctm = element.getScreenCTM();
                if (!ctm) continue;
                const clone = element.cloneNode(false) as SVGGraphicsElement;
                const m = toLayer.multiply(ctm);
                clone.setAttribute('transform', `matrix(${m.a} ${m.b} ${m.c} ${m.d} ${m.e} ${m.f})`);
                for (const attribute of ['opacity', 'fill-opacity', 'stroke-opacity', 'class', 'style', 'aria-label', 'role']) clone.removeAttribute(attribute);
                const fill = element.getAttribute('fill');
                const stroke = element.getAttribute('stroke');
                clone.setAttribute('fill', fill && fill !== 'none' && fill !== 'transparent' ? '#000' : 'none');
                if (stroke && stroke !== 'none' && stroke !== 'transparent') clone.setAttribute('stroke', '#000');
                mask.append(clone);
            }
            defs.append(mask);
            holder.setAttribute('mask', `url(#${id})`);
        }
        layer.prepend(defs);
    };
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

    const svgElement = <K extends 'path' | 'circle' | 'text' | 'g'>(tag: K): SVGElementTagNameMap[K] =>
        document.createElementNS('http://www.w3.org/2000/svg', tag);
    const identifyOverlay = (element: SVGElement, name: string, spec: ChartOverlaySpec, rowIndex?: number): void => {
        element.setAttribute('data-flint-overlay', name);
        element.setAttribute('data-flint-role', spec.role);
        if (rowIndex !== undefined) element.setAttribute('data-flint-row', String(rowIndex));
        element.setAttribute('opacity', String(spec.style?.opacity ?? 1));
        element.style.pointerEvents = 'none';
    };

    /**
     * A map overlay through its projection: lines, rules and rects as GeoJSON the projection draws —
     * great circles between places, cut at the antimeridian and a globe's horizon — points and text
     * at their places, none past the horizon. All of it inside the plot.
     */
    const drawGeo = (
        name: string, spec: ChartOverlaySpec, rows: readonly Record<string, unknown>[], projection: OverlayProjection,
        space: RendererCoordinateSpace, plot: { x1: number; y1: number; x2: number; y2: number } | undefined,
        colorScale: any, chartBackground: string,
    ): void => {
        const channels = geoOverlayChannels(spec);
        if (!channels) return;
        const field = (channel: 'longitude' | 'latitude' | 'longitude2' | 'latitude2') => spec.encodings[channel]?.field;
        const colourOf = (row: Record<string, unknown> | undefined) => (spec.encodings.color && row ? colorScale?.(row[spec.encodings.color.field]) : undefined);
        const shapes = geoPath(projection as any);
        // A place past a globe's horizon is not drawn; Vega's orthographic clips at 90°.
        const angle = typeof projection.clipAngle === 'function' ? projection.clipAngle() : null;
        const rotate = typeof projection.rotate === 'function' ? projection.rotate() : [0, 0];
        const facing = (place: [number, number]) => !angle || geoDistance(place, [-rotate[0], -rotate[1]]) <= (angle * Math.PI) / 180;
        // Paths are drawn in the projection's frame, the plot's, and cut at the plot by a group round them.
        const holder = svgElement('g');
        if (plot) holder.setAttribute('clip-path', `url(#${clipId})`);
        // Beneath the marks: cut away under them once the layer is on the page (see `cutUnderMarks`).
        if (spec.layer === 'under' && (spec.mark === 'line' || spec.mark === 'rule')) underHolders.push(holder);
        const frame = svgElement('g');
        frame.setAttribute('transform', `translate(${space.originX},${space.originY})`);
        holder.append(frame);
        const stroke = (path: SVGPathElement, row?: Record<string, unknown>, width = 2) => {
            path.setAttribute('stroke', spec.style?.stroke ?? colourOf(row) ?? '#4c78a8');
            path.setAttribute('stroke-width', String(spec.style?.strokeWidth ?? width));
            const dash = dashArray(spec.style?.strokeDash);
            if (dash) path.setAttribute('stroke-dasharray', dash);
            path.setAttribute('stroke-linecap', 'round');
            path.setAttribute('stroke-linejoin', 'round');
        };
        if (spec.mark === 'line') {
            const placed = rows.flatMap((row) => {
                const place = lonLat(row, field('longitude'), field('latitude'));
                return place ? [{ place, row }] : [];
            });
            const d = placed.length >= 2 ? shapes({ type: 'LineString', coordinates: placed.map(({ place }) => place) } as any) : null;
            projectedVertices.set(name, placed.flatMap(({ place, row }) => {
                const point = facing(place) ? projection(place) : null;
                return point ? [{ point: { x: point[0], y: point[1] }, record: row }] : [];
            }));
            if (!d) return;
            const path = svgElement('path');
            identifyOverlay(path, name, spec);
            path.setAttribute('d', d);
            path.setAttribute('fill', 'none');
            stroke(path, rows[0]);
            frame.append(path);
        } else if (spec.mark === 'rule' || spec.mark === 'rect') {
            rows.forEach((row, rowIndex) => {
                const from = lonLat(row, field('longitude'), field('latitude'));
                const to = lonLat(row, field('longitude2'), field('latitude2'));
                if (!from || !to) return;
                const geometry = spec.mark === 'rule'
                    ? { type: 'LineString', coordinates: [from, to] }
                    : { type: 'Polygon', coordinates: [lonLatBox(from[0], from[1], to[0], to[1])] };
                const d = shapes(geometry as any);
                if (!d) return;
                const path = svgElement('path');
                identifyOverlay(path, name, spec, rowIndex);
                path.setAttribute('d', d);
                if (spec.mark === 'rule') {
                    path.setAttribute('fill', 'none');
                    stroke(path, row, 1);
                } else {
                    path.setAttribute('fill', spec.style?.fill ?? colourOf(row) ?? '#4c78a8');
                    path.setAttribute('fill-opacity', String(spec.style?.fillOpacity ?? 0.2));
                    if (spec.style?.stroke) path.setAttribute('stroke', spec.style.stroke);
                    if (spec.style?.strokeWidth !== undefined) path.setAttribute('stroke-width', String(spec.style.strokeWidth));
                }
                frame.append(path);
            });
        } else {
            rows.forEach((row, rowIndex) => {
                const place = lonLat(row, field('longitude'), field('latitude'));
                const point = place && facing(place) ? projection(place) : null;
                if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return;
                const x = point[0] + space.originX;
                const y = point[1] + space.originY;
                if (!pointInClip({ x, y }, plot)) return;
                if (spec.mark === 'point') {
                    const circle = svgElement('circle');
                    identifyOverlay(circle, name, spec, rowIndex);
                    circle.setAttribute('cx', String(x));
                    circle.setAttribute('cy', String(y));
                    circle.setAttribute('r', String(spec.style?.pointRadius ?? 4));
                    circle.setAttribute('fill', spec.style?.fill ?? colourOf(row) ?? '#4c78a8');
                    circle.setAttribute('fill-opacity', String(spec.style?.fillOpacity ?? 1));
                    if (spec.style?.stroke) circle.setAttribute('stroke', spec.style.stroke);
                    if (spec.style?.strokeWidth !== undefined) circle.setAttribute('stroke-width', String(spec.style.strokeWidth));
                    // A map is a window on the world: a place by its edge is cut there, as the land is.
                    if (plot) circle.setAttribute('clip-path', `url(#${clipId})`);
                    layer.append(circle);
                    return;
                }
                const text = svgElement('text');
                identifyOverlay(text, name, spec, rowIndex);
                if (plot) text.setAttribute('clip-path', `url(#${clipId})`);
                text.setAttribute('x', String(x + (spec.style?.dx ?? 0)));
                text.setAttribute('y', String(y + (spec.style?.dy ?? 0)));
                text.setAttribute('text-anchor', spec.style?.textAlign ?? 'middle');
                const fontSize = spec.style?.fontSize ?? 11;
                text.setAttribute('font-size', String(fontSize));
                text.setAttribute('font-weight', String(spec.style?.fontWeight ?? 'normal'));
                if (spec.style?.fontStyle) text.setAttribute('font-style', spec.style.fontStyle);
                text.setAttribute('fill', spec.style?.fill ?? colourOf(row) ?? '#333333');
                const halo = spec.style?.stroke ?? chartBackground;
                if (halo !== 'none') {
                    text.setAttribute('stroke', halo);
                    text.setAttribute('stroke-width', String(spec.style?.strokeWidth ?? Math.min(4, Math.max(2, fontSize / 4))));
                    text.setAttribute('stroke-linejoin', 'round');
                    text.setAttribute('paint-order', 'stroke');
                }
                text.textContent = String(spec.encodings.text ? row[spec.encodings.text.field] ?? '' : '');
                layer.append(text);
            });
        }
        if (frame.childElementCount > 0) layer.append(holder);
    };

    const draw = (): void => {
        layer.replaceChildren();
        projectedVertices.clear();
        underHolders.length = 0;
        const xScale = scales.x ? view.scale(scales.x) : undefined;
        const yScale = scales.y ? view.scale(scales.y) : undefined;
        const cartesian = typeof xScale === 'function' && typeof yScale === 'function';
        const projection = geoProjection?.();
        const mapped = typeof projection === 'function';
        if (current.size === 0 || (!cartesian && !mapped)) {
            layer.remove();
            return;
        }
        const colorScale = scales.color ? view.scale(scales.color) : undefined;
        const background = typeof view.background === 'function' ? view.background() : undefined;
        const chartBackground = typeof background === 'string' && background !== 'transparent' ? background : '#ffffff';
        const space = coordinateSpace();
        const containerRect = container.getBoundingClientRect();
        const rendererRect = space.rect;
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
        // Lines, rules, and rects are cut at the edge of the plot the scales draw into, like the
        // chart's own marks; a point or a label is drawn whole while its anchor is in the plot,
        // and not at all once it leaves.
        const xRange = cartesian ? (xScale.range() as number[]).map(Number) : [];
        const yRange = cartesian ? (yScale.range() as number[]).map(Number) : [];
        // A map is a window on the world: what it places runs to the plot's edge and is cut there.
        const plot = !cartesian
            ? { x1: space.originX, y1: space.originY, x2: space.originX + space.plotWidth, y2: space.originY + space.plotHeight }
            : clipToPlot && [...xRange, ...yRange].every(Number.isFinite)
                ? {
                    x1: space.originX + Math.min(...xRange),
                    y1: space.originY + Math.min(...yRange),
                    x2: space.originX + Math.max(...xRange),
                    y2: space.originY + Math.max(...yRange),
                }
                : undefined;
        const clipped = (element: SVGElement): void => {
            if (plot) element.setAttribute('clip-path', `url(#${clipId})`);
        };

        // On a band scale a rect spans its band from edge to edge, while a
        // point, line, rule, or text sits at the band's centre, as Vega-Lite
        // places those marks.
        const bandCentre = (scale: any): number => (typeof scale.bandwidth === 'function' ? Number(scale.bandwidth()) || 0 : 0) / 2;
        for (const [name, spec] of current) {
            const rows = orderedOverlayRows(spec);
            if (isGeoOverlay(spec)) {
                if (typeof projection === 'function') drawGeo(name, spec, rows, projection, space, plot, colorScale, chartBackground);
                continue;
            }
            if (!cartesian) continue;
            const centreX = spec.mark === 'rect' ? 0 : bandCentre(xScale);
            const centreY = spec.mark === 'rect' ? 0 : bandCentre(yScale);
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

            if (spec.mark === 'rule' || spec.mark === 'rect') {
                // A missing start channel spans the plot along that axis.
                const extent = (
                    scale: any, origin: number, centre: number, row: Record<string, unknown>,
                    start: string | undefined, end: string | undefined,
                ): [number, number] | undefined => {
                    if (!start) {
                        const range = scale.range() as number[];
                        return [Math.min(...range) + origin, Math.max(...range) + origin];
                    }
                    const from = scale(row[start]) + centre;
                    const to = end ? scale(row[end]) + centre : from;
                    return Number.isFinite(from) && Number.isFinite(to) ? [from + origin, to + origin] : undefined;
                };
                rows.forEach((row, rowIndex) => {
                    const xs = extent(xScale, space.originX, centreX, row, spec.encodings.x?.field, spec.encodings.x2?.field);
                    const ys = extent(yScale, space.originY, centreY, row, spec.encodings.y?.field, spec.encodings.y2?.field);
                    if (!xs || !ys) return;
                    const [x, x2] = xs;
                    const [y, y2] = ys;
                    if (spec.mark === 'rule') {
                        const rule = document.createElementNS('http://www.w3.org/2000/svg', 'line');
                        identify(rule, rowIndex);
                        rule.setAttribute('x1', String(x));
                        rule.setAttribute('y1', String(y));
                        rule.setAttribute('x2', String(x2));
                        rule.setAttribute('y2', String(y2));
                        rule.setAttribute('stroke', spec.style?.stroke ?? '#4c78a8');
                        rule.setAttribute('stroke-width', String(spec.style?.strokeWidth ?? 1));
                        const dash = dashArray(spec.style?.strokeDash);
                        if (dash) rule.setAttribute('stroke-dasharray', dash);
                        clipped(rule);
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
                    clipped(rect);
                    layer.append(rect);
                });
                continue;
            }

            const xField = spec.encodings.x?.field;
            const yField = spec.encodings.y?.field;
            if (!xField || !yField) continue;
            const projected = (row: Record<string, unknown>) => {
                const x = xScale(row[xField]) + centreX;
                const y = yScale(row[yField]) + centreY;
                return Number.isFinite(x) && Number.isFinite(y) ? { x, y } : undefined;
            };
            const points = rows.flatMap((row) => {
                const point = projected(row);
                return point ? [{ x: point.x + space.originX, y: point.y + space.originY }] : [];
            });
            if (points.length === 0) continue;

            if (spec.mark === 'line') {
                const vertices = rows.flatMap((row) => {
                    const point = projected(row);
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
                const dash = dashArray(spec.style?.strokeDash);
                if (dash) {
                    path.setAttribute('stroke-dasharray', dash);
                }
                path.setAttribute('stroke-linecap', 'round');
                path.setAttribute('stroke-linejoin', 'round');
                path.setAttribute('vector-effect', 'non-scaling-stroke');
                clipped(path);
                layer.append(path);
                continue;
            }

            rows.forEach((row, rowIndex) => {
                const point = projected(row);
                if (!point) return;
                const x = point.x + space.originX;
                const y = point.y + space.originY;
                if (!pointInClip({ x, y }, plot)) return;
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
                    if (spec.style?.fontStyle) text.setAttribute('font-style', spec.style.fontStyle);
                    const colorValue = spec.encodings.color
                        ? colorScale?.(row[spec.encodings.color.field])
                        : undefined;
                    text.setAttribute('fill', spec.style?.fill ?? colorValue ?? '#333333');
                    // Overlay text sits on the data, so it is haloed in the chart's own background unless told not to.
                    const halo = spec.style?.stroke ?? chartBackground;
                    if (halo !== 'none') {
                        const fontSize = spec.style?.fontSize ?? 11;
                        text.setAttribute('stroke', halo);
                        text.setAttribute('stroke-width', String(spec.style?.strokeWidth ?? Math.min(4, Math.max(2, fontSize / 4))));
                        text.setAttribute('stroke-linejoin', 'round');
                        text.setAttribute('paint-order', 'stroke');
                    }
                    text.textContent = String(spec.encodings.text ? row[spec.encodings.text.field] ?? '' : '');
                    layer.append(text);
                    return;
                }
            });
        }
        if (layer.childElementCount === 0) layer.remove();
        else {
            if (plot) {
                const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
                clipPath.setAttribute('id', clipId);
                const clipRect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
                clipRect.setAttribute('x', String(plot.x1));
                clipRect.setAttribute('y', String(plot.y1));
                clipRect.setAttribute('width', String(Math.max(0, plot.x2 - plot.x1)));
                clipRect.setAttribute('height', String(Math.max(0, plot.y2 - plot.y1)));
                clipPath.append(clipRect);
                layer.prepend(clipPath);
            }
            if (!layer.isConnected) container.append(layer);
            if (getComputedStyle(container).position === 'static') container.style.position = 'relative';
            cutUnderMarks();
        }
    };

    return {
        render(overlays) {
            current = new Map(overlays);
            try {
                draw();
            } catch (error) {
                // An overlay the drawing cannot read is left off; the chart's other updates still draw.
                layer.replaceChildren();
                console.warn('[flint-chart] an overlay could not be drawn:', error);
            }
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