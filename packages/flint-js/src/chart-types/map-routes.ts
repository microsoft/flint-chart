// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Routes on a map: the points of a `Map` joined in the order its `order` field gives, one route per
 * series (`detail`, else a categorical `color`). The geometry is worked out here, in longitude and
 * latitude, so every backend draws the same lines; where each line lands on screen is left to the
 * renderer's projection, which a reader may pan, zoom or turn.
 *
 * A leg is drawn as one of three curves:
 * - `great-circle`: the shortest way over the globe, the default on a globe;
 * - `arc`: that great circle bowed a little to the left of travel, as flow maps draw their lines, so
 *   a leg out and the leg back part ways — the default for a route of stops on a flat map;
 * - `straight`: a constant compass bearing (a rhumb line), straight on Mercator.
 * A route with many legs is a track (a ship's log, a storm's path) rather than a list of stops: its
 * legs follow great circles unbowed, and it carries one arrowhead, at its end.
 */

import { geoDistance, geoInterpolate } from 'd3-geo';
import type { ChartPropertyDef } from '../core/types';

export const ROUTE_CURVES = ['auto', 'arc', 'great-circle', 'straight'] as const;
export type RouteCurve = typeof ROUTE_CURVES[number];

type LonLat = [number, number];

/** A route of up to this many legs is a list of stops: its legs bow, each with an arrowhead. */
export const STOP_LEGS_MAX = 24;

/** How far a bowed leg stands off its great circle at the middle, as a share of the leg's length. */
const BEND = 0.11;

/** Where along a leg the arrowhead reads its heading from: just short of the end, so it follows the curve there. */
const HEADING_FROM = 0.97;
/** Where a head stands on a leg placed at its middle: a little past it, as it reads pointing on. */
const MIDDLE = 0.55;

export interface RouteLeg {
    /** The index, in the rows given, of the stop the leg leaves from. */
    from: number;
    /** The index of the stop it arrives at. */
    to: number;
    /** Its line, end to end, in longitude and latitude. */
    path: LonLat[];
    /**
     * Points along its curve from its end back to its start, packed toward the end where its head
     * sits: its length on screen is measured through them, and its head's base found among them.
     */
    tail: LonLat[];
    /** It crosses the antimeridian, where a flat map cuts it in two. */
    cut: boolean;
}

/** Where along a leg, as shares of it back from its end, its tail's points lie. */
export const TAIL = [0, 0.02, 0.04, 0.07, 0.1, 0.14, 0.19, 0.25, 0.32, 0.4, 0.5, 0.62, 0.78, 1] as const;

export interface Route {
    /** The series value the route belongs to; undefined for a map of one route. */
    series: unknown;
    /** The stops in order. */
    stops: LonLat[];
    /** The line through them, leg after leg, in longitude and latitude. */
    path: LonLat[];
    /** Its legs in order, each joining two stops. */
    legs: RouteLeg[];
}

export interface RouteArrow {
    series: unknown;
    /** The index, in the rows given, of the stop the arrow's leg leaves from. */
    from: number;
    /** The leg it heads. */
    leg: RouteLeg;
    /**
     * Points back along the line from the tip, nearest first: the leg's tail, or on a track its last
     * fixes. The head's base is the first of them a head's length from the tip on screen.
     */
    tail: LonLat[];
    /** It heads a track: the end of many short legs, which the line before them leads into. */
    track: boolean;
    /** The stop the leg arrives at. */
    tip: LonLat;
    /** A point just before it on the leg: the arrowhead points from here to the tip. */
    base: LonLat;
}

export interface RouteOptions {
    longitude: string;
    latitude: string;
    order: string;
    /** The field rows are split into routes by. */
    series?: string;
    curve?: unknown;
    globe?: boolean;
}

const finite = (value: unknown): number | undefined => {
    const number = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
    return Number.isFinite(number) ? number : undefined;
};

/** A sort key per row for the order field: numbers by value, dates by time, any other text as it reads (numbers within it by value). */
function orderKeys(values: readonly unknown[]): (a: number, b: number) => number {
    const present = values.filter((value) => value != null && value !== '');
    if (present.length && present.every((value) => finite(value) !== undefined)) {
        const keys = values.map((value) => finite(value) ?? Infinity);
        return (a, b) => keys[a] - keys[b];
    }
    const times = values.map((value) => (value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : NaN));
    if (present.length && present.every((value) => {
        const time = value instanceof Date ? value.getTime() : typeof value === 'string' ? Date.parse(value) : NaN;
        return Number.isFinite(time);
    })) return (a, b) => (Number.isFinite(times[a]) ? times[a] : Infinity) - (Number.isFinite(times[b]) ? times[b] : Infinity);
    const text = values.map((value) => (value == null ? '' : String(value)));
    return (a, b) => text[a].localeCompare(text[b], undefined, { numeric: true });
}

/** The curve a route's legs follow: the caller's, else a great circle on a globe or along a track, an arc between stops. */
export function routeCurve(curve: unknown, globe: boolean, legs: number): Exclude<RouteCurve, 'auto'> {
    if (curve === 'arc' || curve === 'great-circle' || curve === 'straight') return curve;
    return globe || legs > STOP_LEGS_MAX ? 'great-circle' : 'arc';
}

/** Longitude difference the short way round, in degrees. */
const lonDelta = (from: number, to: number) => ((to - from + 540) % 360) - 180;

/** The point a fraction `t` along a leg, on its curve. */
export function legPoint(from: LonLat, to: LonLat, curve: Exclude<RouteCurve, 'auto'>): (t: number) => LonLat {
    if (curve === 'straight') {
        const dLon = lonDelta(from[0], to[0]);
        return (t) => [from[0] + dLon * t, from[1] + (to[1] - from[1]) * t];
    }
    const along = geoInterpolate(from, to);
    if (curve === 'great-circle') return (t) => along(t) as LonLat;
    // Bowed to the left of travel in a frame where a degree of longitude is as long as it is on
    // the ground at the leg's middle latitude, so the bow keeps its shape away from the equator.
    const mid = (from[1] + to[1]) / 2;
    const squeeze = Math.max(0.2, Math.cos((mid * Math.PI) / 180));
    const dx = lonDelta(from[0], to[0]) * squeeze;
    const dy = to[1] - from[1];
    return (t) => {
        const [lon, lat] = along(t) as LonLat;
        const k = 4 * t * (1 - t) * BEND;
        return [lon - (dy * k) / squeeze, Math.max(-89.9, Math.min(89.9, lat + dx * k))];
    };
}

/** The vertices a leg is drawn through: its ends, and enough between for its curve to read smooth. */
function legPath(from: LonLat, to: LonLat, curve: Exclude<RouteCurve, 'auto'>): LonLat[] {
    // A great circle needs no vertices between its ends: d3-geo draws the arc between any two.
    if (curve === 'great-circle') return [from, to];
    const degrees = (geoDistance(from, to) * 180) / Math.PI;
    const steps = curve === 'arc' ? 24 : Math.max(1, Math.min(64, Math.ceil(degrees / 2)));
    const at = legPoint(from, to, curve);
    return Array.from({ length: steps + 1 }, (_, i) => (i === 0 ? from : i === steps ? to : at(i / steps)));
}

/** The routes a table's rows make: per series, its placed rows in order, joined leg by leg. */
export function buildRoutes(rows: readonly Record<string, unknown>[], options: RouteOptions): Route[] {
    const groups = new Map<unknown, number[]>();
    const order = rows.map((row) => row?.[options.order]);
    rows.forEach((row, index) => {
        const lon = finite(row?.[options.longitude]);
        const lat = finite(row?.[options.latitude]);
        if (lon === undefined || lat === undefined || Math.abs(lat) > 90 || Math.abs(lon) > 180) return;
        if (order[index] == null || order[index] === '') return;
        const key = options.series ? row?.[options.series] : undefined;
        const members = groups.get(key) ?? [];
        members.push(index);
        groups.set(key, members);
    });
    const compare = orderKeys(order);
    const routes: Route[] = [];
    for (const [series, members] of groups) {
        const order = members.slice().sort((a, b) => compare(a, b) || a - b);
        const stops = order.map((index) => [finite(rows[index][options.longitude])!, finite(rows[index][options.latitude])!] as LonLat);
        if (stops.length < 2) continue;
        const curve = routeCurve(options.curve, options.globe === true, stops.length - 1);
        const path: LonLat[] = [stops[0]];
        const legs: RouteLeg[] = [];
        for (let i = 1; i < stops.length; i++) {
            const leg = legPath(stops[i - 1], stops[i], curve);
            const along = legPoint(stops[i - 1], stops[i], curve);
            const tail = TAIL.map((back) => (back === 0 ? stops[i] : back === 1 ? stops[i - 1] : along(1 - back)));
            const cut = tail.slice(1).some(([lon], k) => Math.abs(lon - tail[k][0]) > 180);
            legs.push({ from: order[i - 1], to: order[i], path: leg, tail, cut });
            path.push(...leg.slice(1));
        }
        routes.push({ series, stops, path, legs });
    }
    return routes;
}

export const ROUTE_STOPS = ['none', 'all', 'ends'] as const;
export type RouteStopMode = typeof ROUTE_STOPS[number];

/** The `stops` property read: `true` is `all`, `false` none; unset, `all` where `size` sizes the dots (`sized`), else none. */
export function routeStopMode(value: unknown, sized = false): RouteStopMode {
    if (value === true || value === 'all') return 'all';
    if (value === 'ends' || value === 'none') return value;
    return value === undefined && sized ? 'all' : 'none';
}

/** A stop's dot radius in px: one for every stop by default, kept between these. */
export const STOP_RADIUS = { min: 2.5, max: 4 } as const;
/** A stop's dot radius by a measure (`size`): zero-based by area, between these. */
export const STOP_RADIUS_BY_VALUE = { min: 2.5, max: 7 } as const;

/**
 * Each stop's dot radius in px, for every backend alike. Stops are places, not values: by default
 * every dot is one size, from the routes' median width (`widths`, px) — half of it and a pixel, kept
 * between 2.5 and 4 px. `stopRadius` states one size. A `size` field sizes each dot by its row's
 * value, zero-based by area from 2.5 to 7 px (`byValue`: the largest value, the scale's top).
 */
export function stopRadii(
    chartProperties: Record<string, any> | undefined,
    sizeField: string | undefined,
    rows: readonly Record<string, unknown>[],
    widths: readonly number[],
): { radius(row: number): number; byValue?: { max: number } } {
    const stated = chartProperties?.stopRadius;
    if (typeof stated === 'number' && Number.isFinite(stated) && stated >= 0) return { radius: () => stated };
    if (sizeField) {
        const max = largestMagnitude(rows.map((row) => row[sizeField])) || 1;
        const [low, high] = [(2 * STOP_RADIUS_BY_VALUE.min) ** 2, (2 * STOP_RADIUS_BY_VALUE.max) ** 2];
        return {
            radius: (row) => {
                const value = Math.abs(Number(rows[row]?.[sizeField]));
                return Math.sqrt(low + (high - low) * Math.min(1, Number.isFinite(value) ? value / max : 0)) / 2;
            },
            byValue: { max },
        };
    }
    const sorted = [...widths].sort((a, b) => a - b);
    const median = sorted.length ? sorted[Math.floor((sorted.length - 1) / 2)] : ROUTE_WIDTH.plain;
    const radius = Math.min(STOP_RADIUS.max, Math.max(STOP_RADIUS.min, median / 2 + 1));
    return { radius: () => radius };
}

/**
 * The stops inside a route's runs of one colour: those a leg arrives at and the next leg, of the same
 * colour (`colorKey`, the row each leaves), leaves from. Without a colour, every stop but the route's
 * first and last.
 */
export function innerStops(route: Route, colorKey?: (row: number) => unknown): number[] {
    return route.legs.slice(0, -1)
        .filter((leg, i) => Object.is(colorKey?.(leg.from), colorKey?.(route.legs[i + 1].from)))
        .map((leg) => leg.to);
}

/**
 * Where a route's arrowheads stand: on every leg of a route of stops, on the last leg of a track
 * only — at the leg's end, or at its middle (`at: 'middle'`) for a renderer that cannot hold a head
 * back off the stop's dot. A leg that returns to where it began has no heading and takes none.
 */
export function routeArrows(routes: readonly Route[], curve: unknown, globe: boolean, at: 'end' | 'middle' = 'end'): RouteArrow[] {
    const arrows: RouteArrow[] = [];
    for (const route of routes) {
        const legs = route.stops.length - 1;
        const shape = routeCurve(curve, globe, legs);
        const from = legs > STOP_LEGS_MAX ? legs : 1;
        for (let leg = from; leg <= legs; leg++) {
            const a = route.stops[leg - 1];
            const b = route.stops[leg];
            if (geoDistance(a, b) === 0) continue;
            const along = legPoint(a, b, shape);
            const own = route.legs[leg - 1];
            const track = legs > STOP_LEGS_MAX;
            // A track's last leg is too short to say which way it runs: its head reads the fixes before.
            const tail = track ? route.stops.slice(Math.max(0, legs + 1 - TAIL.length), legs + 1).reverse() : own.tail;
            arrows.push(at === 'end'
                ? { series: route.series, from: own.from, leg: own, tip: b, base: along(HEADING_FROM), tail, track }
                : { series: route.series, from: own.from, leg: own, tip: along(MIDDLE), base: along(MIDDLE - (1 - HEADING_FROM)), tail: [], track });
        }
    }
    return arrows;
}

/** The compass bearing from one point to another, in degrees clockwise from north. */
export function bearing(from: LonLat, to: LonLat): number {
    const rad = Math.PI / 180;
    const [l1, p1] = [from[0] * rad, from[1] * rad];
    const [l2, p2] = [to[0] * rad, to[1] * rad];
    const y = Math.sin(l2 - l1) * Math.cos(p2);
    const x = Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(l2 - l1);
    return ((Math.atan2(y, x) / rad) + 360) % 360;
}

/** A route's width range in px, as Data Formulator draws flows: the widest leg at the most, from zero. */
export const ROUTE_WIDTH = { min: 1, max: 8, plain: 1.75 } as const;

/**
 * Each leg's width in px from the value its row gives: zero-based, linear, `max` (by default the
 * largest value given) the widest.
 */
export function legWidths(values: readonly unknown[], max = largestMagnitude(values)): number[] {
    const numbers = values.map((value) => (value === null || value === '' ? NaN : Number(value)));
    return numbers.map((value) => (Number.isFinite(value) && max > 0
        ? ROUTE_WIDTH.min + (ROUTE_WIDTH.max - ROUTE_WIDTH.min) * Math.min(1, Math.abs(value) / max)
        : ROUTE_WIDTH.min));
}

/** The largest magnitude among values that are numbers; 0 where none is. */
export function largestMagnitude(values: readonly unknown[]): number {
    return Math.max(0, ...values.map((value) => (value === null || value === '' ? NaN : Math.abs(Number(value)))).filter(Number.isFinite));
}

/**
 * An arrowhead fitted to its line, as Data Formulator draws one: its length grows with the line's
 * width (9 to 20 px), its half-width 0.45 of its length.
 */
export function headSize(width: number): { length: number; halfWidth: number } {
    const length = Math.min(20, Math.max(9, width * 2.4 + 6));
    return { length, halfWidth: length * 0.45 };
}

/** How opaque routes are drawn: nearly solid, fading only once a map carries many (Data Formulator's flow maps). */
export function routeOpacity(count: number): number {
    return Math.max(0.55, Math.min(0.92, 0.92 - 0.11 * Math.log2(Math.max(1, count / 12))));
}

/** How a point map joins its points into routes, offered where an `order` field gives their sequence. */
export const routeProperties: ChartPropertyDef[] = [
    {
        key: 'arrows', label: 'Arrows', type: 'binary', defaultValue: true,
        check: (ctx) => ({ applicable: Boolean(ctx.encodings?.order?.field) }),
    },
    {
        key: 'curve',
        label: 'Route curve',
        type: 'discrete',
        options: [
            { value: 'auto', label: 'Auto: arcs between stops, great circles on a globe or along a track' },
            { value: 'arc', label: 'Arcs, bowed left of travel' },
            { value: 'great-circle', label: 'Great circles' },
            { value: 'straight', label: 'Straight (constant bearing)' },
        ] satisfies { value: typeof ROUTE_CURVES[number]; label: string }[],
        defaultValue: 'auto',
        check: (ctx) => ({ applicable: Boolean(ctx.encodings?.order?.field) }),
    },
    {
        key: 'stops',
        label: 'Stops',
        type: 'discrete',
        options: [
            { value: 'none', label: 'None: the arrows mark them' },
            { value: 'all', label: 'A dot at every stop' },
            { value: 'ends', label: 'A dot where each run of one colour starts and ends' },
        ] satisfies { value: RouteStopMode; label: string }[],
        defaultValue: 'none',
        accepts: (value) => typeof value === 'boolean',
        acceptsLabel: 'true (all) or false (none)',
        check: (ctx) => ({ applicable: Boolean(ctx.encodings?.order?.field) }),
    },
    {
        key: 'stopRadius', label: 'Stop radius', type: 'continuous', min: 0, max: 12, step: 0.5,
        check: (ctx) => ({ applicable: Boolean(ctx.encodings?.order?.field) && routeStopMode(ctx.chartProperties?.stops, Boolean(ctx.encodings?.size?.field)) !== 'none' }),
    },
];
