// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * A `Map`'s routes in Vega-Lite: three layers beneath its points.
 *
 * - A casing: each line drawn first, wider, in the ground's own light (white, or the page on a dark
 *   map), so a route stands off the land, the borders and the routes it crosses.
 * - The lines: GeoJSON LineStrings drawn as geoshapes, so the projection draws them — great circles
 *   between vertices, cut at the antimeridian, hidden past a globe's horizon — and they follow a
 *   pan, a zoom or a turn with no rebuild. A route takes its series' colour where the colour names
 *   the series; else it is drawn in a neutral ink and the points keep the colour.
 * - Arrowheads (`chartProperties.arrows`, on by default): a triangle at the end of each leg, its
 *   tip short of the stop's dot. Its heading is read off the live projection by the spec itself
 *   (`geoCentroid` of the leg's end and of a point just before it), so it turns with the map in
 *   any Vega renderer, Flint's or a host's.
 *
 * The lines are drawn beneath the points, the heads over them. Each leg is a shape of its own and
 * carries the fields of the row it leaves from, as a line chart's segment starts at its row: it
 * takes that row's interaction key, so hover, emphasis, hiding and notes reach it (`kind: 'path'`
 * names the leg, as it names a line's segment), and it recedes with the row. Its casing and head
 * carry the same fields and recede with it, but are no target of their own. None takes a tooltip:
 * the points carry them.
 */

import { ROUTE_WIDTH, STOP_RADIUS_BY_VALUE, TAIL, buildRoutes, headSize, innerStops, largestMagnitude, legWidths, routeArrows, routeOpacity, routeStopMode, stopRadii, type Route } from '../../chart-types/map-routes';
import { frontFacingExpr } from '../../chart-types/geo-frame';
import { GEO_ROTATE_SIGNAL } from '../interactions/geo-levels';
import { MAP_ROLE } from './map-style';

/**
 * Marks a route dataset, so the map's focus regions are never read from its lines. The route data's
 * own fields take no leading underscore: a host that strips Flint's private `_` keys keeps them.
 */
export const ROUTE_DATUM = 'flintRoute';

/** Which part of a route a datum draws: a leg's casing, the leg, or its head. */
export const ROUTE_PART = 'flintRoutePart';
export type RoutePart = 'casing' | 'leg' | 'head';

/** Fields a route datum's GeoJSON needs for itself, which a row's own fields of the same name do not overwrite. */
const GEOJSON_FIELDS = new Set(['type', 'geometry', 'properties']);

/** The projection the arrowheads' heading is read through; renamed where a wrapper renames the view's projection. */
export const ROUTE_PROJECTION_TOKEN = 'projection';

/** The halo's reach past its line, both sides together, in px: a hairline each side, as Data Formulator draws one. */
const CASING_GROWTH = 1.5;
/** The width of the halo round a head, its stroke centred on the head's edge: a hairline outside it. */
const HEAD_HALO = 1.5;
/** How far a head's tip stands off its stop: a hair, the stops being drawn as nothing but their arrows. */
const HEAD_GAP = 0.6;

/** How a route's ink is chosen when no series colour names it: the theme's mark colour, or a neutral one beside dots coloured by another field. */
export const ROUTE_INK = '__flintRouteInk';
/** The width of the halo round a drawn stop, its stroke centred on the dot's edge. */
const STOP_HALO = 1;
/** The area round a stop the pointer finds it in, though it is not drawn. */
const STOP_TARGET_SIZE = 80;
/** A head is drawn as a path in px about its tip, at the size that makes a symbol's units px. */
const HEAD_SYMBOL_SIZE = 4;
/**
 * A head's full size wants its leg this many head lengths long on screen (tip to base, gap and all);
 * a shorter leg shrinks its head to fit, down to `MIN_HEAD` of its size, and below that drops it.
 */
const SHORT_LEG = 1.6;
const MIN_HEAD = 0.6;
/**
 * How far into its head a leg's line runs, in px: a hair, so no seam shows where they meet. The line
 * ends at the head's base rather than inside it: a faded route is drawn translucent, and line and head
 * overlapping would show the line's end through the head.
 */
const INTO_HEAD = 0.5;

const TIP_LON = 'flintTipLon';
const TIP_LAT = 'flintTipLat';
/** The tail: points back along the line from the tip, nearest first (`Route` legs' and arrows' `tail`). */
export const TAIL_FIELD = 'flintTail';
/** A head's length on screen, tip gap and all, in px, at its full size. */
const BACK = 'flintBack';
/** Whether the head shrinks to fit its leg on screen (1) or keeps its size (0: a track's, a globe's, one across the antimeridian). */
const FIT = 'flintFit';
/** Whether a leg's line is cut short inside its head (1), or drawn whole (0). */
const JOIN = 'flintJoin';
const HEAD_SHAPE = 'flintHeadShape';
const CASING_WIDTH_FIELD = 'flintCasingWidth';
/**
 * How far a leg keeps from the stop it ends at, and from the one it leaves, in px: the one thing the
 * arrows know of the stops' dots — a drawn dot's radius and its halo, 0 where stops are not drawn.
 */
const END_RADIUS = 'flintEndClear';
const START_RADIUS = 'flintStartClear';

/** The field that splits rows into routes: `detail`, else a categorical colour. */
export function routeSeriesField(resolved: Record<string, any>): string | undefined {
    if (resolved.detail?.field) return resolved.detail.field;
    const color = resolved.color;
    return color?.field && (color.type === 'nominal' || color.type === 'ordinal') ? color.field : undefined;
}

/** The routes a point map's rows make, where an `order` field joins them. */
export function mapRoutes(rows: readonly Record<string, unknown>[], resolved: Record<string, any>, chartProperties: Record<string, any> | undefined, globe: boolean): Route[] {
    const order = resolved.order?.field;
    const longitude = resolved.longitude?.field;
    const latitude = resolved.latitude?.field;
    if (!order || !longitude || !latitude) return [];
    return buildRoutes(rows, { longitude, latitude, order, series: routeSeriesField(resolved), curve: chartProperties?.curve, globe });
}

/** A row's own fields, for a route datum that stands for it: all but those its GeoJSON needs. */
export function rowFields(row: Record<string, unknown> | undefined): Record<string, unknown> {
    return Object.fromEntries(Object.entries(row ?? {}).filter(([field]) => !GEOJSON_FIELDS.has(field)));
}

/**
 * The length of a step in an expression: `sqrt` and `pow` rather than `hypot`, which a CSP-safe Vega
 * (`vega-interpreter`) does not provide.
 */
function distance(dx: string, dy: string): string {
    return `sqrt(pow(${dx}, 2) + pow(${dy}, 2))`;
}

/** The k-th point of a datum's tail on screen, through the live projection. */
const tailAt = (k: number) => `geoCentroid(${JSON.stringify(ROUTE_PROJECTION_TOKEN)}, datum.${TAIL_FIELD}[${k}])`;

/** How far the k-th point of the tail lies from its tip on screen, in a straight line. */
const fromTip = (k: number) => distance(`${tailAt(k)}[0] - ${tailAt(0)}[0]`, `${tailAt(k)}[1] - ${tailAt(0)}[1]`);

/** A leg's length on screen: the chords along its tail. */
function tailLengthExpr(): string {
    return Array.from({ length: TAIL.length - 1 }, (_, k) => distance(`${tailAt(k + 1)}[0] - ${tailAt(k)}[0]`, `${tailAt(k + 1)}[1] - ${tailAt(k)}[1]`)).join(' + ');
}

/**
 * A head's size on screen as a share of its full size: 1 where its leg is at least `SHORT_LEG` head
 * lengths long, else the share that fits — measured tip to start, straight, which a leg's gentle bow
 * barely shortens. Where it does not shrink (`flintFit` 0), 1.
 */
function headScaleExpr(): string {
    return `(datum.${FIT} ? min(1, max(0, ${fromTip(TAIL.length - 1)} - datum.${END_RADIUS} - datum.${START_RADIUS}) / (${SHORT_LEG} * datum.${BACK})) : 1)`;
}

/** The fields a head's transforms compute: its tail on screen, its points' distances from the tip, its scale, and its heading. */
const PTS = 'flintPts';
const DIST = 'flintDist';
const SCALE = 'flintScale';
const ANGLE = 'flintAngle';
const HEAD_X = 'flintX';
const HEAD_Y = 'flintY';
const HEAD_SIZE = 'flintSize';
const BASE_X = 'flintBaseX';
const BASE_Y = 'flintBaseY';

/**
 * A head's geometry on screen, as transforms on its own data through the live projection, so each of
 * its tail's points is projected once and the head follows a pan, zoom or turn:
 *
 * - its tail on screen, stop first, and each point's straight distance from the stop;
 * - its scale: 1 where the leg, less its stops' dots, is at least `SHORT_LEG` head lengths long, else
 *   the share that fits;
 * - its tip: on the line its stop's radius from the stop, at the edge of its dot — the stop itself
 *   where stops are not drawn (`stops` false: no radius is read);
 * - its heading, from its base to its tip. The base is where the line lies the head's length beyond
 *   the tip — so the middle of the base is on the line however sharply the line turns there.
 *
 * A point that far along the line lies between the first point of the tail that far from the stop and
 * the one before, at the share of the way that distance falls; a tail none of whose points lies that
 * far: its last point.
 *
 * The head is placed by its tip's x and y rather than by longitude and latitude, so these transforms,
 * which read the projection, never feed a fit of the projection to the data.
 */
function headTransforms(stops: boolean): Record<string, string>[] {
    const n = TAIL.length;
    const pt = (k: number) => `datum.${PTS}[${k}]`;
    const d = (k: number) => `datum.${DIST}[${k}]`;
    const along = (reach: string, axis: 0 | 1): string => {
        const share = (k: number) => `clamp((${reach} - ${d(k - 1)}) / max(0.000001, ${d(k)} - ${d(k - 1)}), 0, 1)`;
        let chosen = `${pt(n - 1)}[${axis}]`;
        for (let k = n - 1; k >= 1; k--) {
            chosen = `(${d(k)} >= ${reach} ? (${pt(k - 1)}[${axis}] + ${share(k)} * (${pt(k)}[${axis}] - ${pt(k - 1)}[${axis}])) : ${chosen})`;
        }
        return chosen;
    };
    const tip = `datum.${END_RADIUS}`;
    const base = `(${tip} + datum.${BACK} * datum.${SCALE})`;
    return [
        { calculate: `[${Array.from({ length: n }, (_, k) => tailAt(k)).join(', ')}]`, as: PTS },
        { calculate: `[${Array.from({ length: n }, (_, k) => distance(`${pt(k)}[0] - ${pt(0)}[0]`, `${pt(k)}[1] - ${pt(0)}[1]`)).join(', ')}]`, as: DIST },
        { calculate: `datum.${FIT} ? min(1, max(0, ${d(n - 1)} - datum.${END_RADIUS} - datum.${START_RADIUS}) / (${SHORT_LEG} * datum.${BACK})) : 1`, as: SCALE },
        { calculate: stops ? along(tip, 0) : `${pt(0)}[0]`, as: HEAD_X },
        { calculate: stops ? along(tip, 1) : `${pt(0)}[1]`, as: HEAD_Y },
        { calculate: along(base, 0), as: BASE_X },
        { calculate: along(base, 1), as: BASE_Y },
        { calculate: `atan2(datum.${HEAD_Y} - datum.${BASE_Y}, datum.${HEAD_X} - datum.${BASE_X}) * 180 / PI`, as: ANGLE },
        // A symbol's path scales with the square root of its size: a shrunk head keeps its shape.
        { calculate: `${HEAD_SYMBOL_SIZE} * pow(datum.${SCALE}, 2)`, as: HEAD_SIZE },
    ];
}

/**
 * A leg's dash: where it carries a head of at least `MIN_HEAD` of its size, its line up to the head's
 * base and a hair past it (`INTO_HEAD`), so no seam shows and line and head barely overlap; else the
 * whole line. Where its run starts at a drawn stop, it leaves from the dot's edge (`0, gap` first).
 */
function legDashExpr(): string {
    const scale = headScaleExpr();
    const length = `(${tailLengthExpr()})`;
    const cut = `max(0, datum.${END_RADIUS} + datum.${BACK} * ${scale} - ${INTO_HEAD})`;
    const start = `datum.${START_RADIUS}`;
    const headed = `datum.${JOIN} && ${scale} >= ${MIN_HEAD}`;
    const whole = `${headed} ? [max(0, ${length} - ${cut}), 1000000] : [1000000, 0]`;
    const gapped = `${headed} ? [0, ${start}, max(0, ${length} - ${cut} - ${start}), 1000000] : [0, ${start}, 1000000, 0]`;
    return `${start} > 0 ? (${gapped}) : (${whole})`;
}

/** How a route's stops are drawn: each row's dot radius in px (0 where stops are not drawn), and the dots' size encoding. */
export interface StopSizing {
    radius(row: number): number;
    /** One size for every dot (a symbol's size, its diameter squared), or a scale from the `size` field. */
    size?: number | Record<string, unknown>;
}

const area = (radius: number) => (2 * radius) ** 2;

/**
 * The size of a route's stops, independent of its arrows (`stopRadii`): one for all, a `size` field's
 * value with a key of its own, or `stopRadius`. Where the chart does not ask for stops, none are drawn.
 */
export function routeStopSizing(
    chartProperties: Record<string, any> | undefined,
    resolved: Record<string, any>,
    rows: readonly Record<string, unknown>[],
    widths: readonly number[],
    dotted: (row: number) => boolean = () => true,
): StopSizing {
    const field = resolved.size?.field;
    if (routeStopMode(chartProperties?.stops, Boolean(field)) === 'none') return { radius: () => 0 };
    const radii = stopRadii(chartProperties, field, rows, widths);
    const radius = (row: number) => (dotted(row) ? radii.radius(row) : 0);
    if (!radii.byValue) return { radius, size: area(radii.radius(0)) };
    // The chart's own key settings (its title, where it stands) carry over; the scale is the stops'.
    const { scale: _scale, ...own } = resolved.size;
    const [low, high] = [area(STOP_RADIUS_BY_VALUE.min), area(STOP_RADIUS_BY_VALUE.max)];
    return { radius, size: { ...own, field, type: 'quantitative', scale: { domain: [0, radii.byValue.max], range: [low, high], zero: true } } };
}

/** How far a leg keeps from a stop: its dot's radius and the halo round it, where it is drawn. */
const clearance = (radius: number) => (radius > 0 ? radius + STOP_HALO / 2 : 0);

/**
 * Draw a route's stops — the map's own points, which carry its tooltips, hover, notes and colour key —
 * as dots on top of the arrows, or, where the chart does not ask for stops, leave them undrawn but
 * where the pointer finds them. The arrows read nothing of this but each stop's clearance.
 */
/**
 * A test for the rows among `inner`, read off a dot's datum: by its route (`detail`, else its colour)
 * and its place in the route's order, which a row of the table keeps in the dots' data.
 */
function innerStopTest(rows: readonly Record<string, unknown>[], resolved: Record<string, any>, inner: readonly number[]): string | undefined {
    const order = resolved.order?.field;
    if (!order || !inner.length) return undefined;
    const series = routeSeriesField(resolved);
    const temporal = resolved.order?.type === 'temporal';
    const at = (field: string) => `datum[${JSON.stringify(field)}]`;
    // A temporal order is parsed to a date in the dots' data: it is matched by its time.
    const orderExpr = temporal ? `(isDate(${at(order)}) ? time(${at(order)}) : ${at(order)})` : at(order);
    const orderKey = (value: unknown) => (temporal && !(value instanceof Date) && typeof value === 'string' ? Date.parse(value) : value instanceof Date ? value.getTime() : value);
    const key = (row: number) => `${series ? `${String(rows[row]?.[series])}|` : ''}${String(orderKey(rows[row]?.[order]))}`;
    const keys = [...new Set(inner.map(key))];
    return `indexof(${JSON.stringify(keys)}, ${series ? `'' + ${at(series)} + '|' + ` : ''}'' + ${orderExpr}) >= 0`;
}

function styleRouteStops(dots: any, sizing: StopSizing, inner?: string): void {
    const base = typeof dots.mark === 'string' ? { type: dots.mark } : dots.mark;
    // `strokeWidth` is the legs' width, and `size` is read here as the stops' own scale: neither reaches
    // the dots as Vega-Lite's.
    const { size: _size, strokeWidth: _strokeWidth, ...encoding } = dots.encoding ?? {};
    dots.encoding = encoding;
    if (sizing.size === undefined) {
        dots.mark = { ...base, filled: true, size: STOP_TARGET_SIZE, opacity: 0, stroke: null };
        return;
    }
    // Opaque and haloed as the route's lines are, so the line it leaves ends under it.
    dots[MAP_ROLE] = 'routeStop';
    dots.mark = { ...base, filled: true, opacity: 1, fillOpacity: 1, strokeWidth: STOP_HALO };
    if (typeof sizing.size === 'number') dots.mark.size = sizing.size;
    else dots.encoding.size = sizing.size;
    // A stop within a run takes no dot, but keeps its tooltip and hover. A gate only, no value of its
    // own: interaction keeps it first and manages the rest.
    if (inner) dots.encoding.opacity = { condition: [{ test: inner, value: 0 }, ...conditionsOf(dots.encoding.opacity)] };
}

const conditionsOf = (channel: any): any[] => (channel?.condition ? [channel.condition].flat() : []);

/**
 * Add the casing, line and arrowhead layers of a point map's routes beneath its points.
 *
 * A route's legs are as wide as `strokeWidth` says (from the row each leaves, zero-based to 8 px), else 1.75
 * px; a key reads the widths. Each head is sized to its line, Data Formulator's way, and set on it:
 * its tip at the stop, the middle of its base on the line a head's length back, the line ending
 * square at its base. A leg too short on screen for its head shrinks it to fit, and below 60% of its
 * size keeps its line alone. Lines are square-ended and mitred; a hairline halo — white on a light
 * map, the ground on a dark one — runs round line and head alike.
 */
export function addRouteLayers(
    spec: any,
    routes: readonly Route[],
    options: { rows: readonly Record<string, unknown>[]; resolved: Record<string, any>; chartProperties?: Record<string, any>; globe: boolean },
): void {
    if (!routes.length || !Array.isArray(spec.layer)) return;
    const { rows, resolved, chartProperties, globe } = options;
    const series = routeSeriesField(resolved);
    const color = resolved.color;
    // The line takes the colour where the colour names the route, or names a stretch of it (a leg of a
    // voyage, a phase): a categorical colour paints each leg as the row it leaves. The shared scale
    // keeps them one key. A quantity's colour stays on the dots, the line in a neutral ink.
    const categorical = color?.type === 'nominal' || color?.type === 'ordinal';
    const colorEncoding = color?.field && (color.field === series || categorical)
        ? { field: color.field, type: color.type, ...(color.scale ? { scale: color.scale } : {}), legend: null }
        : undefined;
    // One scale, so a route and its points share a colour; the key stays the points' own.
    if (colorEncoding) spec.resolve = { ...(spec.resolve ?? {}), legend: { ...(spec.resolve?.legend ?? {}), color: 'independent' } };

    // Widths: by the strokeWidth field, from the row each leg leaves; else every leg alike.
    const size = resolved.strokeWidth?.field;
    const allLegs = routes.flatMap((route) => route.legs);
    // The key's domain is every row's, so a leg's width and the key agree.
    const maxValue = size ? largestMagnitude(rows.map((row) => row[size])) : 0;
    const legValues = size ? legWidths(allLegs.map((leg) => rows[leg.from]?.[size]), maxValue) : [];
    const widths = new Map(allLegs.map((leg, index) => [leg, size ? legValues[index] : ROUTE_WIDTH.plain]));
    // Under `stops: 'ends'`, a dot where each run of one colour starts and ends; the stops between take none.
    const colorKey = colorEncoding ? (row: number) => rows[row]?.[colorEncoding.field] : undefined;
    const inner = new Set(routes.flatMap((route) => innerStops(route, colorKey)));
    // The stops are sized on their own; a line leaves from its first stop's dot's edge, and a head's tip
    // stops at the next one's.
    const dotted = routeStopMode(chartProperties?.stops) === 'ends' ? (row: number) => !inner.has(row) : undefined;
    const sizing = routeStopSizing(chartProperties, resolved, rows, allLegs.map((leg) => widths.get(leg)!), dotted);
    const stops = sizing.size !== undefined;
    if (resolved.size?.field && !stops) {
        spec._warnings = [...(spec._warnings ?? []), {
            severity: 'warning', code: 'map-size-without-stops', channel: 'size', field: resolved.size.field,
            message: `size ('${resolved.size.field}') sizes a route's stops, and stops is 'none': no dot is drawn for it. Leave stops unset or set it to 'all' or 'ends' to draw them.`,
        }];
    }
    const ends = (leg: (typeof allLegs)[number]) => ({ [END_RADIUS]: clearance(sizing.radius(leg.to)), [START_RADIUS]: clearance(sizing.radius(leg.from)) });

    const arrows = chartProperties?.arrows === false ? [] : routeArrows(routes, chartProperties?.curve, globe);
    const headed = new Map(arrows.map((arrow) => [arrow.leg, arrow]));
    // On a globe, or across the antimeridian, a leg's measured length is not its drawn one: its line is
    // drawn whole and its head keeps its size. A track's head keeps its size too: its line runs on
    // through the fixes before.
    const fits = (leg: (typeof allLegs)[number]) => !globe && !leg.cut && !headed.get(leg)?.track;
    const tail = (points: readonly (readonly [number, number])[]) => points.map((point) => ({ type: 'Point', coordinates: point }));
    const backOf = (leg: (typeof allLegs)[number]) => HEAD_GAP + headSize(widths.get(leg)!).length;
    const legData = (part: RoutePart) => allLegs.map((leg) => {
        const arrow = headed.get(leg);
        return {
            ...rowFields(rows[leg.from]),
            type: 'Feature',
            [ROUTE_DATUM]: true,
            [ROUTE_PART]: part,
            [TAIL_FIELD]: tail(leg.tail),
            [BACK]: backOf(leg),
            [FIT]: fits(leg) ? 1 : 0,
            [JOIN]: arrow && fits(leg) ? 1 : 0,
            ...ends(leg),
            ...(part === 'casing' ? { [CASING_WIDTH_FIELD]: widths.get(leg)! + CASING_GROWTH } : {}),
            properties: {},
            geometry: { type: 'LineString', coordinates: leg.path },
        };
    });
    const opacity = routeOpacity(routes.length);
    const widthEncoding = size
        ? {
            field: size, type: 'quantitative', scale: { domain: [0, maxValue || 1], range: [ROUTE_WIDTH.min, ROUTE_WIDTH.max] },
            ...(resolved.strokeWidth.title !== undefined ? { title: resolved.strokeWidth.title } : {}),
            legend: resolved.strokeWidth.legend === null ? null : { ...(resolved.strokeWidth.legend ?? {}), symbolType: 'stroke' },
        }
        : undefined;
    // The casing's widths are px of its own, not the key's: each layer keeps its own width scale and key.
    spec.resolve = {
        ...(spec.resolve ?? {}),
        scale: { ...(spec.resolve?.scale ?? {}), strokeWidth: 'independent' },
        // The heads' size is px of their own: the stops' size key stays the dots' alone.
        legend: { ...(spec.resolve?.legend ?? {}), strokeWidth: 'independent', size: 'independent' },
    };
    const dash = { value: { expr: legDashExpr() } };
    // Square ends and mitred corners: a route is drawn sharp, its line ending flush at its head's base.
    const sharp = { strokeCap: 'butt', strokeJoin: 'miter' };
    const casing = {
        [MAP_ROLE]: 'routeCasing',
        data: { values: legData('casing') },
        // A long leg's great circle or bow can run past any frame, the world's too: drawn inside the plot only.
        mark: { type: 'geoshape', filled: false, ...sharp, strokeOpacity: Math.min(0.9, opacity + 0.05), clip: true },
        encoding: {
            strokeWidth: { field: CASING_WIDTH_FIELD, type: 'quantitative', scale: null, legend: null },
            strokeDash: dash,
            tooltip: null,
        },
    };
    // A route in no series' colour takes the theme's mark colour, as a plain dot does — or, beside dots
    // coloured by another field, a neutral ink that does not read as one of their colours.
    const ink = colorEncoding ? 'series' : color?.field ? 'neutral' : 'mark';
    const line = {
        [MAP_ROLE]: 'route',
        [ROUTE_INK]: ink,
        data: { values: legData('leg') },
        mark: { type: 'geoshape', filled: false, ...sharp, strokeOpacity: opacity, clip: true, ...(widthEncoding ? {} : { strokeWidth: ROUTE_WIDTH.plain }) },
        encoding: {
            ...(colorEncoding ? { color: colorEncoding } : {}),
            ...(widthEncoding ? { strokeWidth: widthEncoding } : {}),
            strokeDash: dash,
            tooltip: null,
        },
    };
    const heads: any[] = [];
    const haloes: any[] = [];
    if (arrows.length) {
        const values = arrows.map((arrow) => {
            const { length, halfWidth } = headSize(widths.get(arrow.leg)!);
            const back = HEAD_GAP + length;
            return {
                ...rowFields(rows[arrow.from]),
                [ROUTE_DATUM]: true,
                [ROUTE_PART]: 'head',
                [TIP_LON]: arrow.tip[0],
                [TIP_LAT]: arrow.tip[1],
                [TAIL_FIELD]: tail(arrow.tail),
                [BACK]: back,
                [FIT]: fits(arrow.leg) ? 1 : 0,
                ...ends(arrow.leg),
                // Pointing along +x, its tip the gap short of the stop, in px at full size.
                [HEAD_SHAPE]: `M${-HEAD_GAP},0L${-back},${-halfWidth}L${-back},${halfWidth}Z`,
            };
        });
        const hidden: { test: string; value: number }[] = [
            // A leg too short on screen for its head at 60% of its size keeps its line alone.
            { test: `datum.${SCALE} < ${MIN_HEAD}`, value: 0 },
        ];
        // A head past a globe's horizon would show through it, mirrored: it fades out there.
        if (globe) hidden.unshift({ test: `!(${frontFacingExpr(`datum.${TIP_LON}`, `datum.${TIP_LAT}`, GEO_ROTATE_SIGNAL)})`, value: 0 });
        const placed = {
            x: { field: HEAD_X, type: 'quantitative', scale: null, axis: null },
            y: { field: HEAD_Y, type: 'quantitative', scale: null, axis: null },
            angle: { field: ANGLE, type: 'quantitative', scale: null, legend: null },
            shape: { field: HEAD_SHAPE, type: 'nominal', scale: null, legend: null },
            size: { field: HEAD_SIZE, type: 'quantitative', scale: null, legend: null },
            // Gates only, no value of its own: interaction keeps them first and manages the rest.
            opacity: { condition: hidden },
            tooltip: null,
        };
        // The head's halo: its own shape in the halo's colour, a hairline wider, beneath the line, so the
        // line runs into the head with no seam where the halo would cross it.
        haloes.push({
            [MAP_ROLE]: 'routeHeadCasing',
            data: { values },
            transform: headTransforms(stops),
            mark: { type: 'point', filled: true, opacity: 1, strokeWidth: HEAD_HALO, strokeJoin: 'miter', fillOpacity: Math.min(0.9, opacity + 0.05), strokeOpacity: Math.min(0.9, opacity + 0.05), clip: true },
            encoding: placed,
        });
        heads.push({
            [MAP_ROLE]: 'routeArrow',
            [ROUTE_INK]: ink,
            data: { values },
            transform: headTransforms(stops),
            // No stroke: the halo beneath is the head's rim, and a dark map's ring for its dots passes it by.
            mark: { type: 'point', filled: true, opacity: 1, fillOpacity: opacity, stroke: null, strokeWidth: 0, clip: true },
            encoding: { ...placed, ...(colorEncoding ? { color: colorEncoding } : {}) },
        });
    }
    // The lines beneath the points, which carry the data and its interaction; the heads over them.
    const points = spec.layer.findIndex((layer: any) => (typeof layer?.mark === 'string' ? layer.mark : layer?.mark?.type) === 'circle');
    spec.layer.splice(points < 0 ? spec.layer.length : points, 0, casing, ...haloes, line);
    spec.layer.push(...heads);
    const dots = spec.layer.find((layer: any) => (typeof layer?.mark === 'string' ? layer.mark : layer?.mark?.type) === 'circle');
    if (!dots) return;
    // The colour scale is shared: the route's encodings keep the dots' order, else Vega-Lite merges
    // their domains sorted and the key loses the data's order.
    if (colorEncoding && dots.encoding?.color && 'sort' in dots.encoding.color) {
        for (const layer of [line, ...heads]) layer.encoding.color = { ...layer.encoding.color, sort: dots.encoding.color.sort };
    }
    styleRouteStops(dots, sizing, dotted ? innerStopTest(rows, resolved, [...inner]) : undefined);
    if (dots.encoding?.color && dots.encoding.color.legend !== null) {
        dots.encoding.color = { ...dots.encoding.color, legend: { ...(dots.encoding.color.legend ?? {}), symbolOpacity: 1 } };
    }
}
