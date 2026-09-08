/**
 * Pan and zoom for projected (map) charts.
 *
 * A Vega-Lite map has no continuous x/y scale: marks are placed by a
 * cartographic projection that Vega fits to the plot size. Navigation keeps
 * that automatic fit and drives its *extent* instead — the pixel rectangle the
 * geography is fitted into. Panning shifts the extent, zooming scales it about
 * an anchor, and Vega refits the projection on every change, so the base map
 * redraws and the marks keep their pixel size.
 *
 * Because `fitExtent` is linear in the extent, a pixel under one extent maps
 * to a pixel under another by a scale-and-offset, which is how the controller
 * inverts pointer positions through the live projection copy Vega exposes on
 * a signal (`copy('projection')`).
 *
 * The `set-viewport` value carries the visible longitude range (read along the
 * plot's middle row) and latitude range (along the middle column). Values the
 * controller itself produced remember their exact extent (keyed by content,
 * since the runtime copies update ops), so gestures do not drift through a
 * geographic round trip; external values are fitted from their bounding box.
 */

import type {
    NavigationDomainGuard,
    NavigationRequest,
    NavigationUpdate,
} from '../../interactive/interactions';
import type { VegaNavigationAxis } from './contracts';
import { guardNavigationDomain, type VegaNavigationController } from './navigation-scale';

export const GEO_EXTENT_SIGNAL = '__flint_geo_extent';
export const GEO_PROJECTION_SIGNAL = '__flint_geo_projection';
export const GEO_AXIS_SCALES = { x: '__flint_geo_x', y: '__flint_geo_y' } as const;

type Axis = 'x' | 'y';
type Point = [number, number];
/** `[[x0, y0], [x1, y1]]` in plot pixels. */
export type GeoExtent = [Point, Point];

interface GeoProjection {
    (location: Point): Point | null;
    invert?(point: Point): Point | null;
}

function isPoint(value: unknown): value is Point {
    return Array.isArray(value) && value.length === 2 && value.every((entry) => Number.isFinite(entry));
}

function isExtent(value: unknown): value is GeoExtent {
    return Array.isArray(value) && value.length === 2 && value.every(isPoint);
}

function finitePoint(value: Point | null | undefined): Point | undefined {
    return value && isPoint(value) ? value : undefined;
}

/** Map a pixel under extent `from` to the pixel the same location has under extent `to`. */
export function remapExtentPoint(point: Point, from: GeoExtent, to: GeoExtent): Point {
    const kx = (to[1][0] - to[0][0]) / (from[1][0] - from[0][0]);
    const ky = (to[1][1] - to[0][1]) / (from[1][1] - from[0][1]);
    return [to[0][0] + (point[0] - from[0][0]) * kx, to[0][1] + (point[1] - from[0][1]) * ky];
}

/**
 * Clamp a proposed extent with the navigation domain guard. The plot rectangle
 * is expressed as a fraction interval of the extent (the initial frame is
 * `[0, 1]` on both axes), which is exactly the shape the scale guard expects.
 * Both axes carry the same visible fraction, so the span clamp keeps the
 * extent uniform.
 */
export function guardGeoExtent(
    proposed: GeoExtent,
    size: { width: number; height: number },
    guard: NavigationDomainGuard,
): GeoExtent {
    const guardAxis = (origin: number, extentSize: number, plotSize: number): [number, number] => {
        const visible: [number, number] = [(0 - origin) / extentSize, (plotSize - origin) / extentSize];
        const [start, end] = guardNavigationDomain(visible, [0, 1], 'linear', guard).map(Number);
        const guardedSize = plotSize / (end - start);
        // `-start * size` yields -0 at the frame edge; keep the origin a plain 0.
        const guardedOrigin = -start * guardedSize || 0;
        return [guardedOrigin, guardedSize];
    };
    const [x0, width] = guardAxis(proposed[0][0], proposed[1][0] - proposed[0][0], size.width);
    const [y0, height] = guardAxis(proposed[0][1], proposed[1][1] - proposed[0][1], size.height);
    return [[x0, y0], [x0 + width, y0 + height]];
}

export function createVegaGeoNavigationController(
    view: any,
    axes: Partial<Record<Axis, VegaNavigationAxis>>,
): VegaNavigationController {
    // Recent gesture values → their exact extents. Content-keyed because the
    // runtime re-creates op objects; bounded because a drag produces one per frame.
    const rememberedExtents = new Map<string, GeoExtent>();
    const REMEMBERED_LIMIT = 64;
    const valueKey = (value: NavigationUpdate['value']): string =>
        JSON.stringify([value.x ?? null, value.y ?? null]);
    const remember = (value: NavigationUpdate['value'], extent: GeoExtent): void => {
        const key = valueKey(value);
        rememberedExtents.delete(key);
        rememberedExtents.set(key, extent);
        if (rememberedExtents.size > REMEMBERED_LIMIT) {
            rememberedExtents.delete(rememberedExtents.keys().next().value!);
        }
    };

    const plotSize = (): { width: number; height: number } => ({
        width: Number(view.width()) || 0,
        height: Number(view.height()) || 0,
    });
    const baseExtent = (): GeoExtent => {
        const { width, height } = plotSize();
        return [[0, 0], [width, height]];
    };
    const currentExtent = (): GeoExtent => {
        const signaled = view.signal(GEO_EXTENT_SIGNAL);
        return isExtent(signaled) ? signaled : baseExtent();
    };
    const projection = (): GeoProjection | undefined => {
        const copy = view.signal(GEO_PROJECTION_SIGNAL);
        return typeof copy === 'function' ? copy as GeoProjection : undefined;
    };
    const affectedAxes = (axesValue: NavigationUpdate['axes']): Axis[] => {
        const requested: Axis[] = axesValue === 'xy' ? ['x', 'y'] : [axesValue];
        return requested.filter((axis) => axes[axis]);
    };

    /** Invert a plot pixel as it would read under `extent`. */
    const invertAt = (point: Point, extent: GeoExtent): Point | undefined => {
        const live = projection();
        if (!live?.invert) return undefined;
        return finitePoint(live.invert(remapExtentPoint(point, extent, currentExtent())));
    };
    /**
     * The plot edge can sit exactly on a projection's outline (a fitted world
     * map touches the frame), where inversion fails. Step inward a few pixels
     * until a location resolves.
     */
    const invertNear = (point: Point, towards: Point, extent: GeoExtent): Point | undefined => {
        for (const step of [0, 0.5, 1, 2, 4, 8]) {
            const dx = Math.sign(towards[0] - point[0]) * step;
            const dy = Math.sign(towards[1] - point[1]) * step;
            const location = invertAt([point[0] + dx, point[1] + dy], extent);
            if (location) return location;
        }
        return undefined;
    };
    const geographicBox = (extent: GeoExtent): { x?: [number, number]; y?: [number, number] } => {
        const { width, height } = plotSize();
        const center: Point = [width / 2, height / 2];
        const west = invertNear([0, height / 2], center, extent);
        const east = invertNear([width, height / 2], center, extent);
        const south = invertNear([width / 2, height], center, extent);
        const north = invertNear([width / 2, 0], center, extent);
        return {
            ...(west && east ? { x: [west[0], east[0]] as [number, number] } : {}),
            ...(south && north ? { y: [south[1], north[1]] as [number, number] } : {}),
        };
    };

    /** Fit an extent so a longitude/latitude box fills the plot. */
    const extentForBox = (value: NavigationUpdate['value']): GeoExtent | undefined => {
        const live = projection();
        const { width, height } = plotSize();
        if (!live || !(width > 0 && height > 0)) return undefined;
        const current = currentExtent();
        const base = baseExtent();
        const visible = geographicBox(current);
        const lon = value.x !== undefined ? value.x.map(Number) : visible.x;
        const lat = value.y !== undefined ? value.y.map(Number) : visible.y;
        if (!lon || !lat || ![...lon, ...lat].every(Number.isFinite)) return undefined;
        const corners: Point[] = [
            [lon[0], lat[0]], [lon[0], lat[1]], [lon[1], lat[0]], [lon[1], lat[1]],
        ];
        const projected = corners
            .map((corner) => finitePoint(live(corner)))
            .filter((point): point is Point => !!point)
            // Pixels under the current extent → pixels under the base fit.
            .map((point) => remapExtentPoint(point, current, base));
        if (projected.length < 2) return undefined;
        const xs = projected.map((point) => point[0]);
        const ys = projected.map((point) => point[1]);
        const boxWidth = Math.max(...xs) - Math.min(...xs);
        const boxHeight = Math.max(...ys) - Math.min(...ys);
        if (!(boxWidth > 0) && !(boxHeight > 0)) return undefined;
        const scale = Math.min(
            boxWidth > 0 ? width / boxWidth : Number.POSITIVE_INFINITY,
            boxHeight > 0 ? height / boxHeight : Number.POSITIVE_INFINITY,
        );
        if (!Number.isFinite(scale) || scale <= 0) return undefined;
        const centerX = (Math.max(...xs) + Math.min(...xs)) / 2;
        const centerY = (Math.max(...ys) + Math.min(...ys)) / 2;
        const x0 = width / 2 - scale * centerX;
        const y0 = height / 2 - scale * centerY;
        return [[x0, y0], [x0 + scale * width, y0 + scale * height]];
    };

    return {
        resolve(event, guard): NavigationUpdate | null {
            if (event.phase === 'start' || event.phase === 'cancel'
                || (event.phase === 'commit' && event.operation === 'pan' && !event.delta)) return null;
            if (event.operation === 'reset') return { op: 'set-viewport', axes: event.axes, value: {} };
            const affected = affectedAxes(event.axes);
            const { width, height } = plotSize();
            if (affected.length === 0 || !(width > 0 && height > 0)) return null;
            const current = currentExtent();
            let proposed: GeoExtent | undefined;
            if (event.operation === 'pan' && event.delta) {
                const dx = affected.includes('x') ? event.delta.x * width : 0;
                const dy = affected.includes('y') ? event.delta.y * height : 0;
                proposed = [
                    [current[0][0] + dx, current[0][1] + dy],
                    [current[1][0] + dx, current[1][1] + dy],
                ];
            } else if (event.operation === 'zoom' && event.factor && event.factor > 0 && event.anchor) {
                // A projection zooms uniformly, so both axes scale about the
                // anchor even when the gesture names one axis.
                const anchor: Point = [event.anchor.x * width, event.anchor.y * height];
                const factor = event.factor;
                const scaled = (value: number, about: number): number => about + (value - about) * factor;
                proposed = [
                    [scaled(current[0][0], anchor[0]), scaled(current[0][1], anchor[1])],
                    [scaled(current[1][0], anchor[0]), scaled(current[1][1], anchor[1])],
                ];
            }
            if (!proposed) return null;
            const guarded = guardGeoExtent(proposed, { width, height }, guard);
            const value = geographicBox(guarded);
            remember(value, guarded);
            return { op: 'set-viewport', axes: event.axes, value };
        },
        apply(update): boolean {
            if (affectedAxes(update.axes).length === 0) return false;
            const remembered = rememberedExtents.get(valueKey(update.value));
            if (remembered) {
                view.signal(GEO_EXTENT_SIGNAL, remembered);
                return true;
            }
            if (update.value.x === undefined && update.value.y === undefined) {
                view.signal(GEO_EXTENT_SIGNAL, null);
                return true;
            }
            const extent = extentForBox(update.value);
            if (!extent) return false;
            view.signal(GEO_EXTENT_SIGNAL, extent);
            return true;
        },
        scale(name) {
            const axis: Axis | undefined = name === GEO_AXIS_SCALES.x ? 'x'
                : name === GEO_AXIS_SCALES.y ? 'y' : undefined;
            if (!axis) return undefined;
            return {
                invert: (pixel: number) => {
                    const { width, height } = plotSize();
                    const point: Point = axis === 'x' ? [pixel, height / 2] : [width / 2, pixel];
                    const location = finitePoint(projection()?.invert?.(point));
                    return location ? location[axis === 'x' ? 0 : 1] : undefined;
                },
            };
        },
    };
}
