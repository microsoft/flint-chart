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

import { projection as vegaProjection } from 'vega';
import type { UpdateRegionSelector } from '../../core/interaction-contracts';
import type { NavigationDomainGuard, NavigationUpdate } from '../../interactive/interactions';
import type { VegaNavigationAxis } from './contracts';
import {
    guardNavigationDomain,
    type NavigationApplyOptions,
    type VegaNavigationController,
} from './navigation-scale';

export const GEO_EXTENT_SIGNAL = '__flint_geo_extent';
export const GEO_PROJECTION_SIGNAL = '__flint_geo_projection';
export const GEO_AXIS_SCALES = { x: '__flint_geo_x', y: '__flint_geo_y' } as const;
/** Names the detail level a multi-level projected chart currently draws. */
export const GEO_LEVEL_SIGNAL = '__flint_geo_level';

/**
 * One runtime detail level of a projected chart. A finer level is entered
 * once the visible longitude span drops to `enter` degrees and left again only
 * above `exit`, so a view that rests near the threshold does not flicker.
 */
export interface GeoLevel {
    name: string;
    enter?: number;
    exit?: number;
}

/** Runtime detail levels, coarsest first, and the signal that selects one. */
export interface GeoLevelConfig {
    signal: string;
    levels: readonly GeoLevel[];
    /** The compiled dataset that holds the coarsest level's features (set once the fit is patched). */
    source?: string;
}

type Ring = readonly (readonly number[])[];

/**
 * The projection a pre-projected base map was built with. The chart draws
 * such a map with an identity projection, so navigation converts between
 * the map's frame and longitude/latitude through this one.
 */
export interface GeoPreProjection {
    type: string;
    scale?: number;
    translate?: readonly [number, number];
    rotate?: readonly number[];
    center?: readonly [number, number];
    parallels?: readonly [number, number];
}

function createPreProjection(config: GeoPreProjection): GeoProjection | undefined {
    const factory = (vegaProjection as any)(config.type);
    if (typeof factory !== 'function') return undefined;
    const instance = factory();
    for (const key of ['scale', 'translate', 'rotate', 'center', 'parallels'] as const) {
        const value = config[key];
        if (value !== undefined && typeof instance[key] === 'function') instance[key](value);
    }
    return instance as GeoProjection;
}

/** Vega's own fields on a datum, plus the join key the choropleth adds. */
const INTERNAL_DATUM_FIELDS = new Set(['_vgsid_', '__geo_id', 'type', 'geometry', 'properties']);

/**
 * Whether a point falls inside a GeoJSON polygon geometry. Ray casting in
 * plate-carrée coordinates is exact enough for regions the size of states and
 * counties. On a spherical geometry a ring that straddles the antimeridian
 * (the Aleutians) is unrolled to one side of it first; a pre-projected
 * geometry is planar and gets no such treatment.
 */
export function geometryContainsPoint(
    geometry: any,
    point: readonly [number, number],
    spherical = true,
): boolean {
    if (!geometry) return false;
    const polygons: Ring[][] = geometry.type === 'Polygon'
        ? [geometry.coordinates]
        : geometry.type === 'MultiPolygon' ? geometry.coordinates : [];
    for (const rings of polygons) {
        if (rings.length === 0 || !ringContains(rings[0], point, spherical)) continue;
        if (rings.slice(1).some((hole) => ringContains(hole, point, spherical))) continue;
        return true;
    }
    return false;
}

function ringContains(ring: Ring, [lon, lat]: readonly [number, number], spherical: boolean): boolean {
    let west = Number.POSITIVE_INFINITY;
    let east = Number.NEGATIVE_INFINITY;
    for (const [x] of ring) {
        if (x < west) west = x;
        if (x > east) east = x;
    }
    // A ring wider than a hemisphere really wraps the antimeridian: read it,
    // and the query, on the eastern side.
    const unroll = spherical && east - west > 180 ? (x: number) => (x < 0 ? x + 360 : x) : (x: number) => x;
    const px = unroll(lon);
    let inside = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i, i += 1) {
        const xi = unroll(ring[i][0]);
        const yi = ring[i][1];
        const xj = unroll(ring[j][0]);
        const yj = ring[j][1];
        if ((yi > lat) !== (yj > lat) && px < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
}

/** Every vertex of a GeoJSON geometry, as longitude/latitude points. */
export function geometryVertices(geometry: any): Point[] {
    if (!geometry) return [];
    const rings: Ring[] = geometry.type === 'Polygon' ? geometry.coordinates
        : geometry.type === 'MultiPolygon' ? geometry.coordinates.flat()
        : geometry.type === 'LineString' ? [geometry.coordinates]
        : geometry.type === 'MultiLineString' ? geometry.coordinates
        : geometry.type === 'Point' ? [[geometry.coordinates]]
        : geometry.type === 'MultiPoint' ? [geometry.coordinates]
        : [];
    return rings
        .flatMap((ring) => ring.map((vertex) => [vertex[0], vertex[1]] as Point))
        .filter(isPoint);
}

/** Share of a region's box kept clear on each side when the viewport frames it. */
const REGION_FIT_MARGIN = 0.08;

/** A feature datum without Vega's bookkeeping and without its geometry. */
function describeFeature(datum: Record<string, unknown>): Record<string, unknown> {
    const properties = datum.properties && typeof datum.properties === 'object'
        ? datum.properties as Record<string, unknown>
        : {};
    return {
        ...properties,
        ...Object.fromEntries(Object.entries(datum).filter(([key]) => !INTERNAL_DATUM_FIELDS.has(key))),
    };
}

/** The filter expression that gates one level's features behind the level signal. */
export function geoLevelGate(signal: string, level: string): string {
    return `${signal} === ${JSON.stringify(level)}`;
}

/** Pick the level for a visible longitude span, with hysteresis about the current level. */
export function resolveGeoLevel(
    lonSpan: number,
    current: string | undefined,
    levels: readonly GeoLevel[],
): string | undefined {
    if (levels.length === 0) return undefined;
    if (!Number.isFinite(lonSpan)) return current ?? levels[0].name;
    const currentIndex = Math.max(0, levels.findIndex((level) => level.name === current));
    let next = 0;
    for (let index = 1; index < levels.length; index += 1) {
        const level = levels[index];
        const threshold = currentIndex >= index ? level.exit ?? level.enter : level.enter;
        if (threshold === undefined || !(lonSpan <= threshold)) break;
        next = index;
    }
    return levels[next].name;
}

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
    levels?: GeoLevelConfig,
    preProjected?: GeoPreProjection,
): VegaNavigationController {
    // On a pre-projected base map the live projection is an identity fit over
    // the map's own frame; these two take a location the rest of the way.
    const preProjection = preProjected ? createPreProjection(preProjected) : undefined;
    const toGeo = (point: Point | undefined): Point | undefined =>
        point && preProjection ? finitePoint(preProjection.invert?.(point)) : point;
    const fromGeo = (location: Point): Point | undefined =>
        preProjection ? finitePoint(preProjection(location)) : location;
    // Recent gesture values → their exact extents (and the level chosen with
    // them, so a re-applied update never re-decides through the hysteresis).
    // Content-keyed because the runtime re-creates op objects; bounded because
    // a drag produces one per frame.
    const rememberedExtents = new Map<string, { extent: GeoExtent; level?: string }>();
    const REMEMBERED_LIMIT = 64;
    const valueKey = (value: NavigationUpdate['value']): string =>
        JSON.stringify([value.x ?? null, value.y ?? null, value.region ?? null]);
    const remember = (value: NavigationUpdate['value'], extent: GeoExtent, level?: string): void => {
        const key = valueKey(value);
        rememberedExtents.delete(key);
        rememberedExtents.set(key, { extent, level });
        if (rememberedExtents.size > REMEMBERED_LIMIT) {
            rememberedExtents.delete(rememberedExtents.keys().next().value!);
        }
    };
    const signaledLevel = levels ? view.signal(levels.signal) : undefined;
    let currentLevel: string | undefined = typeof signaledLevel === 'string'
        ? signaledLevel
        : levels?.levels[0]?.name;
    const setLevel = (level: string | undefined): void => {
        if (!levels || level === undefined) return;
        currentLevel = level;
        view.signal(levels.signal, level);
    };
    // The coarsest-level feature under the plot centre. Checked first on the
    // next call, since a pan rarely leaves it.
    let focusedFeature: Record<string, unknown> | undefined;
    const focusRegion = (): Record<string, unknown> | undefined => {
        if (!levels?.source) return undefined;
        const { width, height } = plotSize();
        const centre = finitePoint(projection()?.invert?.([width / 2, height / 2]));
        if (!centre) return undefined;
        const features: Record<string, unknown>[] = view.data(levels.source) ?? [];
        if (focusedFeature && !features.includes(focusedFeature)) focusedFeature = undefined;
        const spherical = !preProjection;
        const hit = focusedFeature && geometryContainsPoint(focusedFeature.geometry, centre, spherical)
            ? focusedFeature
            : features.find((feature) => geometryContainsPoint(feature.geometry, centre, spherical));
        focusedFeature = hit;
        return hit ? describeFeature(hit) : undefined;
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
    // The extent the view last rendered with. A set signal reads back at
    // once, before the run: the runtime resets it before it re-applies the
    // retained viewports, while the live projection copy still reflects the
    // frame on screen. Projection math must pair that copy with this extent.
    let renderedExtent: GeoExtent | null = isExtent(view.signal(GEO_EXTENT_SIGNAL))
        ? view.signal(GEO_EXTENT_SIGNAL)
        : null;
    view.addSignalListener?.(GEO_EXTENT_SIGNAL, (_name: string, value: unknown) => {
        renderedExtent = isExtent(value) ? value : null;
    });
    const liveExtent = (): GeoExtent => renderedExtent ?? baseExtent();
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
        return toGeo(finitePoint(live.invert(remapExtentPoint(point, extent, liveExtent()))));
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
        // A view across the antimeridian inverts its east edge below its west
        // one; report a range that runs eastward so its span stays positive.
        const lon = west && east
            ? [west[0], east[0] < west[0] ? east[0] + 360 : east[0]] as [number, number]
            : undefined;
        return {
            ...(lon ? { x: lon } : {}),
            ...(south && north ? { y: [south[1], north[1]] as [number, number] } : {}),
        };
    };

    /** The level a longitude range calls for, judged from the level shown now. */
    const levelForRange = (lon: [number, number] | undefined): string | undefined => {
        if (!levels) return undefined;
        const span = lon ? Number(lon[1]) - Number(lon[0]) : Number.NaN;
        return resolveGeoLevel(span, currentLevel, levels.levels);
    };

    /**
     * The extent that fits a set of base-fit pixels into the plot, centred,
     * with `margin` of the box kept clear on every side.
     */
    const extentFittingPoints = (points: readonly Point[], margin = 0): GeoExtent | undefined => {
        const { width, height } = plotSize();
        if (points.length < 2 || !(width > 0 && height > 0)) return undefined;
        const xs = points.map((point) => point[0]);
        const ys = points.map((point) => point[1]);
        const boxWidth = (Math.max(...xs) - Math.min(...xs)) * (1 + 2 * margin);
        const boxHeight = (Math.max(...ys) - Math.min(...ys)) * (1 + 2 * margin);
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

    /** Project locations through the live projection into pixels under the base fit. */
    const projectToBase = (locations: readonly Point[]): Point[] => {
        const live = projection();
        if (!live) return [];
        const current = liveExtent();
        const base = baseExtent();
        return locations
            .map((location) => finitePoint(live(location)))
            .filter((point): point is Point => !!point)
            .map((point) => remapExtentPoint(point, current, base));
    };

    /** Fit an extent so a longitude/latitude box fills the plot. */
    const extentForBox = (value: NavigationUpdate['value']): GeoExtent | undefined => {
        if (!projection()) return undefined;
        const visible = geographicBox(liveExtent());
        const lon = value.x !== undefined ? value.x.map(Number) : visible.x;
        const lat = value.y !== undefined ? value.y.map(Number) : visible.y;
        if (!lon || !lat || ![...lon, ...lat].every(Number.isFinite)) return undefined;
        const corners: Point[] = [[lon[0], lat[0]], [lon[0], lat[1]], [lon[1], lat[0]], [lon[1], lat[1]]];
        return extentFittingPoints(projectToBase(corners
            .map(fromGeo)
            .filter((corner): corner is Point => !!corner)));
    };

    /** The coarsest-level feature whose row carries every field of `key`. */
    const featureForKey = (key: Record<string, unknown>): Record<string, unknown> | undefined => {
        if (!levels?.source) return undefined;
        const features: Record<string, unknown>[] = view.data(levels.source) ?? [];
        const same = (actual: unknown, expected: unknown): boolean => Object.is(actual, expected)
            || (actual != null && expected != null && String(actual) === String(expected));
        return features.find((feature) => Object.entries(key).every(([field, expected]) => {
            const properties = feature.properties as Record<string, unknown> | undefined;
            return same(feature[field], expected) || same(properties?.[field], expected);
        }));
    };

    /**
     * Fit an extent so a region's shape fills the plot with a margin around
     * it. Its vertices go through the live projection, so a region the map
     * draws in an inset (Alaska on the US map) frames where it is drawn.
     */
    const extentForRegion = (selector: UpdateRegionSelector): GeoExtent | undefined => {
        const feature = featureForKey(selector.key);
        if (!feature) return undefined;
        return extentFittingPoints(projectToBase(geometryVertices(feature.geometry)), REGION_FIT_MARGIN);
    };

    /** The extent and level an update asks for; a reset asks for the base fit. */
    const targetFor = (
        value: NavigationUpdate['value'],
    ): { extent: GeoExtent | null; level?: string } | undefined => {
        const remembered = rememberedExtents.get(valueKey(value));
        if (remembered) return { extent: remembered.extent, level: remembered.level };
        if (value.region) {
            const extent = extentForRegion(value.region);
            if (!extent) return undefined;
            const level = levelForRange(geographicBox(extent).x);
            remember(value, extent, level);
            return { extent, level };
        }
        if (value.x === undefined && value.y === undefined) {
            return { extent: null, level: levels?.levels[0]?.name };
        }
        const extent = extentForBox(value);
        if (!extent) return undefined;
        const level = levelForRange(value.x !== undefined
            ? value.x.map(Number) as [number, number]
            : geographicBox(extent).x);
        remember(value, extent, level);
        return { extent, level };
    };

    // A viewport tween renders one extent per animation frame and flips the
    // level only on the last, so no intermediate frame draws the finer level.
    interface ActiveTransition {
        key: string;
        frame: GeoExtent;
        startLevel?: string;
        done: Promise<void>;
        cancel(): void;
    }
    let active: ActiveTransition | undefined;
    const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now());
    const nextFrame = (callback: () => void): void => {
        if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => callback());
        else setTimeout(callback, 16);
    };
    const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - ((-2 * t + 2) ** 2) / 2);
    /** A view as a window over the base fit: its centre and its width, in base pixels. */
    type ZoomView = readonly [number, number, number];
    const viewOf = (extent: GeoExtent): ZoomView => {
        const { width, height } = plotSize();
        const k = (extent[1][0] - extent[0][0]) / width;
        return [(width / 2 - extent[0][0]) / k, (height / 2 - extent[0][1]) / k, width / k];
    };
    const extentOf = ([cx, cy, w]: ZoomView): GeoExtent => {
        const { width, height } = plotSize();
        const k = width / w;
        const x0 = width / 2 - k * cx;
        const y0 = height / 2 - k * cy;
        return [[x0, y0], [x0 + k * width, y0 + k * height]];
    };
    /**
     * "Smooth and efficient zooming and panning" (van Wijk & Nuij, 2003), the
     * path d3-zoom flies. Zoom and pan progress together, and a long pan
     * zooms out, travels, and zooms back in, so the target never rushes past
     * the frame the way a linear blend of the extents makes it.
     */
    const zoomPath = (from: ZoomView, to: ZoomView): ((t: number) => ZoomView) => {
        const rho = Math.SQRT2;
        const rho2 = 2;
        const rho4 = 4;
        const [ux0, uy0, w0] = from;
        const [ux1, uy1, w1] = to;
        const dx = ux1 - ux0;
        const dy = uy1 - uy0;
        const d2 = dx * dx + dy * dy;
        if (d2 < 1e-12) {
            const S = Math.log(w1 / w0) / rho;
            return (t) => [ux0 + t * dx, uy0 + t * dy, w0 * Math.exp(rho * t * S)];
        }
        const d1 = Math.sqrt(d2);
        const b0 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1);
        const b1 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1);
        const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0);
        const r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1);
        const S = (r1 - r0) / rho;
        return (t) => {
            const s = t * S;
            const coshr0 = Math.cosh(r0);
            const u = (w0 / (rho2 * d1)) * (coshr0 * Math.tanh(rho * s + r0) - Math.sinh(r0));
            return [ux0 + u * dx, uy0 + u * dy, (w0 * coshr0) / Math.cosh(rho * s + r0)];
        };
    };
    const startTransition = (
        key: string,
        to: GeoExtent | null,
        level: string | undefined,
        transition: NonNullable<NavigationApplyOptions['transition']>,
    ): void => {
        active?.cancel();
        const from = liveExtent();
        const target = to ?? baseExtent();
        const path = zoomPath(viewOf(from), viewOf(target));
        let cancelled = false;
        let finish!: () => void;
        const done = new Promise<void>((resolve) => { finish = resolve; });
        const startedAt = now();
        const entry: ActiveTransition = {
            key,
            frame: from,
            startLevel: currentLevel,
            done,
            cancel: () => { cancelled = true; finish(); },
        };
        active = entry;
        const step = (): void => {
            if (cancelled) return;
            const t = transition.duration > 0 ? Math.min(1, (now() - startedAt) / transition.duration) : 1;
            const last = t >= 1;
            entry.frame = last ? target : extentOf(path(easeInOut(t)));
            view.signal(GEO_EXTENT_SIGNAL, last ? to : entry.frame);
            if (last) {
                if (active === entry) active = undefined;
                setLevel(level);
            }
            void Promise.resolve(view.runAsync()).then(() => {
                if (cancelled) return;
                transition.onFrame?.(last ? 'commit' : 'preview', to === null ? 'reset' : 'zoom');
                if (last) finish();
                else nextFrame(step);
            });
        };
        nextFrame(step);
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
            remember(value, guarded, levelForRange(value.x));
            return { op: 'set-viewport', axes: event.axes, value };
        },
        apply(update, options): boolean {
            if (affectedAxes(update.axes).length === 0) return false;
            const key = valueKey(update.value);
            if (active && (options?.baseline || active.key === key)) {
                // The runtime re-applies retained viewports, after its own
                // reset, on every render: a render during a tween keeps the
                // tween's frame and its starting level.
                view.signal(GEO_EXTENT_SIGNAL, active.frame);
                setLevel(active.startLevel);
                return true;
            }
            const target = targetFor(update.value);
            if (!target) return false;
            if (options?.transition) {
                startTransition(key, target.extent, target.level, options.transition);
                return true;
            }
            active?.cancel();
            active = undefined;
            view.signal(GEO_EXTENT_SIGNAL, target.extent);
            setLevel(target.level);
            return true;
        },
        settled: () => active?.done ?? Promise.resolve(),
        level: () => currentLevel,
        focus: focusRegion,
        scale(name) {
            const axis: Axis | undefined = name === GEO_AXIS_SCALES.x ? 'x'
                : name === GEO_AXIS_SCALES.y ? 'y' : undefined;
            if (!axis) return undefined;
            return {
                invert: (pixel: number) => {
                    const { width, height } = plotSize();
                    const point: Point = axis === 'x' ? [pixel, height / 2] : [width / 2, pixel];
                    const location = toGeo(finitePoint(projection()?.invert?.(point)));
                    return location ? location[axis === 'x' ? 0 : 1] : undefined;
                },
            };
        },
    };
}
