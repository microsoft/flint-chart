// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * A `Map`'s routes in Vega-Lite: lines and arrowheads, drawn between the stops' true places.
 *
 * - A casing: each line drawn first, wider, in the ground's own light (white, or the page on a dark
 *   map), so a route stands off the land, the borders and the routes it crosses.
 * - The lines: GeoJSON LineStrings drawn as geoshapes, so the projection draws them — great circles
 *   between vertices, cut at the antimeridian, hidden past a globe's horizon — and they follow a
 *   pan, a zoom or a turn with no rebuild. A route takes its series' colour where the colour names
 *   the series; else it is drawn in a neutral ink and the points keep the colour.
 * - Arrowheads (`chartProperties.arrows`, on by default): a triangle at the end of each leg, its
 *   tip on the stop. Its heading is read off the live projection by the spec itself (`geoCentroid`
 *   of the leg's end and of points just before it), so it turns with the map in any Vega renderer,
 *   Flint's or a host's.
 *
 * A route draws no dot of its own. The stops are the map's points, drawn as dots beneath the routes
 * where the points carry something the routes do not (`size`, `shape`, `text`, a quantity's colour),
 * else only at each route's start, where no head marks it (`routeDotsEverywhere`). An undrawn stop
 * keeps its tooltip and hover. Layers go in two passes, every halo then every ink — the casings and
 * heads' halos, then the dots (their rim their halo), the lines and the heads — so a halo parts a
 * route from the ground but never cuts between a line, its dot and its head. Lines and heads know
 * nothing of the dots.
 *
 * Each leg is a shape of its own and carries the fields of the row it leaves from, as a line chart's
 * segment starts at its row: it takes that row's interaction key, so hover, emphasis, hiding and
 * notes reach it (`kind: 'path'` names the leg, as it names a line's segment), and it recedes with
 * the row. Its casing and head carry the same fields and recede with it, but are no target of their
 * own. None takes a tooltip: the points carry them.
 */

import { ROUTE_WIDTH, STOP_RADIUS_BY_VALUE, TAIL, buildRoutes, headSize, largestMagnitude, legWidths, routeArrows, widestLeg, routeDotsEverywhere, routeOpacity, routeStartRows, stopRadii, type Route } from '../../chart-types/map-routes';
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
/** Legs (and their heads) thinner than this, in px, take no halo. */
const HALO_MIN_WIDTH = 1.5;
/** The width of the halo round a head, its stroke centred on the head's edge: a hairline outside it. */
const HEAD_HALO = 1.5;

/** How a route's ink is chosen when no series colour names it: the theme's mark colour, or a neutral one beside dots coloured by another field. */
export const ROUTE_INK = '__flintRouteInk';
/** The width of the halo round a drawn stop, its stroke centred on the dot's edge. */
const STOP_HALO = 1;
/** A head is drawn as a path in px about its tip, at the size that makes a symbol's units px. */
const HEAD_SYMBOL_SIZE = 4;
/**
 * A head's full size wants its leg this many head lengths long on screen (tip to base); a shorter leg
 * shrinks its head to fit, down to `MIN_HEAD` of its size, then to the leg's own length — a short leg
 * keeps a small head rather than reading as dot–line–dot. Only a head under `MIN_HEAD_PX` is dropped.
 */
const SHORT_LEG = 1.6;
const MIN_HEAD = 0.6;
const MIN_HEAD_PX = 3;
/** A stop this many headed legs arrive at takes their heads on a ring round it, shrunk with their number. */
const RING_ARRIVALS = 3;
/** At most this many legs arriving at one stop keep a head: the widest. */
const HEAD_BUDGET = 12;
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
/** A head's length on screen, tip to base, in px, at its full size. */
const BACK = 'flintBack';
/** Whether the head shrinks to fit its leg on screen (1) or keeps its size (0: a track's, a globe's, one across the antimeridian). */
const FIT = 'flintFit';
/** Whether a leg's line is cut short inside its head (1), or drawn whole (0). */
const JOIN = 'flintJoin';
/** How far short of its stop a head's tip stands, in px: 0, or a ring where many heads arrive at one stop. */
const RING = 'flintRing';
const HEAD_SHAPE = 'flintHeadShape';
const CASING_WIDTH_FIELD = 'flintCasingWidth';

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
 * A head's size on screen as a share of its full size, from its leg's length on screen (`span`, tip to
 * start, straight, which a leg's gentle bow barely shortens): 1 where the leg is at least `SHORT_LEG`
 * head lengths long (its ring too), else the share that fits, down to `MIN_HEAD` — and never longer
 * than the leg itself. Where it does not shrink (`flintFit` 0), 1.
 */
function scaleFor(span: string): string {
    const fit = `max(${MIN_HEAD}, min(1, ${span} / (${SHORT_LEG} * (datum.${RING} + datum.${BACK}))))`;
    return `(datum.${FIT} ? min(${fit}, (0.95 * ${span} - datum.${RING}) / datum.${BACK}) : 1)`;
}

function headScaleExpr(): string {
    return scaleFor(fromTip(TAIL.length - 1));
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
 * - its scale (`scaleFor`): 1 where the leg is long enough, else the share that fits;
 * - its tip: the stop, or a ring's width short of it where many heads arrive there;
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
function headTransforms(): Record<string, string>[] {
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
    const ring = `datum.${RING}`;
    const base = `(${ring} + datum.${BACK} * datum.${SCALE})`;
    return [
        { calculate: `[${Array.from({ length: n }, (_, k) => tailAt(k)).join(', ')}]`, as: PTS },
        { calculate: `[${Array.from({ length: n }, (_, k) => distance(`${pt(k)}[0] - ${pt(0)}[0]`, `${pt(k)}[1] - ${pt(0)}[1]`)).join(', ')}]`, as: DIST },
        { calculate: scaleFor(d(n - 1)), as: SCALE },
        { calculate: `${ring} > 0 ? ${along(ring, 0)} : ${pt(0)}[0]`, as: HEAD_X },
        { calculate: `${ring} > 0 ? ${along(ring, 1)} : ${pt(0)}[1]`, as: HEAD_Y },
        { calculate: along(base, 0), as: BASE_X },
        { calculate: along(base, 1), as: BASE_Y },
        { calculate: `atan2(datum.${HEAD_Y} - datum.${BASE_Y}, datum.${HEAD_X} - datum.${BASE_X}) * 180 / PI`, as: ANGLE },
        // A symbol's path scales with the square root of its size: a shrunk head keeps its shape.
        { calculate: `${HEAD_SYMBOL_SIZE} * pow(datum.${SCALE}, 2)`, as: HEAD_SIZE },
    ];
}

/**
 * A leg's dash: where it carries a head of at least `MIN_HEAD_PX`, its line up to the head's base and a
 * hair past it (`INTO_HEAD`), so no seam shows and line and head barely overlap; else the whole line.
 */
function legDashExpr(): string {
    const scale = headScaleExpr();
    const length = `(${tailLengthExpr()})`;
    const cut = `max(0, datum.${RING} + datum.${BACK} * ${scale} - ${INTO_HEAD})`;
    return `datum.${JOIN} && datum.${BACK} * ${scale} >= ${MIN_HEAD_PX} ? [max(0, ${length} - ${cut}), 1000000] : [1000000, 0]`;
}

const area = (radius: number) => (2 * radius) ** 2;

/**
 * The size of a route's dots (`stopRadii`): one for all, a symbol's size (its diameter squared), or
 * a scale from the `size` field, with a key of its own.
 */
function routeStopSize(resolved: Record<string, any>, rows: readonly Record<string, unknown>[], widths: readonly number[]): number | Record<string, unknown> {
    const field = resolved.size?.field;
    const radii = stopRadii(field, rows, widths);
    if (!radii.byValue) return area(radii.radius(0));
    // The chart's own key settings (its title, where it stands) carry over; the scale is the stops'.
    const { scale: _scale, ...own } = resolved.size;
    const [low, high] = [area(STOP_RADIUS_BY_VALUE.min), area(STOP_RADIUS_BY_VALUE.max)];
    return { ...own, field, type: 'quantitative', scale: { domain: [0, radii.byValue.max], range: [low, high], zero: true } };
}

/**
 * A test for the rows not among `shown`, read off a dot's datum: by its route (`detail`, else its
 * colour) and its place in the route's order, which a row of the table keeps in the dots' data.
 */
function unshownTest(rows: readonly Record<string, unknown>[], resolved: Record<string, any>, shown: readonly number[]): string | undefined {
    const order = resolved.order?.field;
    if (!order) return undefined;
    const series = routeSeriesField(resolved);
    const temporal = resolved.order?.type === 'temporal';
    const at = (field: string) => `datum[${JSON.stringify(field)}]`;
    // A temporal order is parsed to a date in the dots' data: it is matched by its time.
    const orderExpr = temporal ? `(isDate(${at(order)}) ? time(${at(order)}) : ${at(order)})` : at(order);
    const orderKey = (value: unknown) => (temporal && !(value instanceof Date) && typeof value === 'string' ? Date.parse(value) : value instanceof Date ? value.getTime() : value);
    const key = (row: number) => `${series ? `${String(rows[row]?.[series])}|` : ''}${String(orderKey(rows[row]?.[order]))}`;
    const keys = [...new Set(shown.map(key))];
    return `indexof(${JSON.stringify(keys)}, ${series ? `'' + ${at(series)} + '|' + ` : ''}'' + ${orderExpr}) < 0`;
}

/**
 * Draw a route's stops — the map's own points, which carry its tooltips, hover, notes and colour key —
 * as dots beneath the routes; those `hidden` names undrawn, but where the pointer finds them. The
 * routes read nothing of this.
 */
function styleRouteStops(dots: any, size: number | Record<string, unknown>, hidden?: string): void {
    const base = typeof dots.mark === 'string' ? { type: dots.mark } : dots.mark;
    // `strokeWidth` is the legs' width, and `size` is read here as the stops' own scale: neither reaches
    // the dots as Vega-Lite's.
    const { size: _size, strokeWidth: _strokeWidth, ...encoding } = dots.encoding ?? {};
    dots.encoding = encoding;
    // Opaque and haloed, so a dot stands off the casing beneath it and the dots it overlaps.
    dots[MAP_ROLE] = 'routeStop';
    dots.mark = { ...base, filled: true, opacity: 1, fillOpacity: 1, strokeWidth: STOP_HALO };
    if (typeof size === 'number') dots.mark.size = size;
    else dots.encoding.size = size;
    // An undrawn stop keeps its tooltip and hover. A gate only, no value of its own: interaction keeps
    // it first and manages the rest.
    if (hidden) dots.encoding.opacity = { condition: [{ test: hidden, value: 0 }, ...conditionsOf(dots.encoding.opacity)] };
}

const conditionsOf = (channel: any): any[] => (channel?.condition ? [channel.condition].flat() : []);

/**
 * Add the casing, line and arrowhead layers of a point map's routes, round its points: the casing
 * beneath them, the lines and heads over them.
 *
 * A route's legs are as wide as `strokeWidth` says (from the row each leaves, zero-based to 8 px), else 1.75
 * px; a key reads the widths. Each head is sized to its line, Data Formulator's way, and set on it:
 * its tip on the stop, the middle of its base on the line a head's length back, the line ending
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
    // The widest leg thins as long, widened legs crowd the plot.
    const plotSide = Math.sqrt((Number(spec.width) || 400) * (Number(spec.height) || 300));
    const widest = size ? widestLeg(allLegs, allLegs.map((leg) => rows[leg.from]?.[size]), plotSide) : ROUTE_WIDTH.max;
    const legValues = size ? legWidths(allLegs.map((leg) => rows[leg.from]?.[size]), maxValue, widest) : [];
    const widths = new Map(allLegs.map((leg, index) => [leg, size ? legValues[index] : ROUTE_WIDTH.plain]));
    const stopSize = routeStopSize(resolved, rows, allLegs.map((leg) => widths.get(leg)!));
    // A dot at every stop where the points carry what the routes do not; else at each route's start.
    const everywhere = routeDotsEverywhere({
        size: Boolean(resolved.size?.field), shape: Boolean(resolved.shape?.field), text: Boolean(resolved.text?.field),
        pointColor: Boolean(color?.field) && !colorEncoding,
    });

    // Heads arriving at one stop: from three on, on a ring round it, shrunk with their number; past a
    // budget, only the widest legs keep theirs, the rest converging on the stop shows the way.
    const allArrows = chartProperties?.arrows === false ? [] : routeArrows(routes, chartProperties?.curve, globe);
    const stopKey = (point: readonly [number, number]) => `${point[0].toFixed(5)},${point[1].toFixed(5)}`;
    const arriving = new Map<string, typeof allArrows>();
    for (const arrow of allArrows) arriving.set(stopKey(arrow.tip), [...(arriving.get(stopKey(arrow.tip)) ?? []), arrow]);
    const kept = new Set([...arriving.values()].flatMap((group) => [...group].sort((a, b) => widths.get(b.leg)! - widths.get(a.leg)!).slice(0, HEAD_BUDGET)));
    const arrows = allArrows.filter((arrow) => kept.has(arrow));
    const headed = new Map(arrows.map((arrow) => [arrow.leg, arrow]));
    const crowdAt = (leg: (typeof allLegs)[number]) => {
        const arrow = headed.get(leg);
        return arrow ? arriving.get(stopKey(arrow.tip))!.length : 0;
    };
    const ringOf = (leg: (typeof allLegs)[number]) => (crowdAt(leg) >= RING_ARRIVALS ? Math.min(8, 2 + 1.5 * Math.sqrt(crowdAt(leg))) : 0);
    const shrinkOf = (leg: (typeof allLegs)[number]) => (crowdAt(leg) >= RING_ARRIVALS ? Math.max(0.6, Math.sqrt(RING_ARRIVALS / crowdAt(leg))) : 1);
    // On a globe, or across the antimeridian, a leg's measured length is not its drawn one: its line is
    // drawn whole and its head keeps its size. A track's head keeps its size too: its line runs on
    // through the fixes before.
    const fits = (leg: (typeof allLegs)[number]) => !globe && !leg.cut && !headed.get(leg)?.track;
    const tail = (points: readonly (readonly [number, number])[]) => points.map((point) => ({ type: 'Point', coordinates: point }));
    const legData = (part: RoutePart) => allLegs.map((leg) => {
        const arrow = headed.get(leg);
        return {
            ...rowFields(rows[leg.from]),
            type: 'Feature',
            [ROUTE_DATUM]: true,
            [ROUTE_PART]: part,
            [TAIL_FIELD]: tail(leg.tail),
            [BACK]: headSize(widths.get(leg)!).length * shrinkOf(leg),
            [RING]: ringOf(leg),
            [FIT]: fits(leg) ? 1 : 0,
            [JOIN]: arrow && fits(leg) ? 1 : 0,
            ...(part === 'casing' ? { [CASING_WIDTH_FIELD]: widths.get(leg)! + CASING_GROWTH } : {}),
            properties: {},
            geometry: { type: 'LineString', coordinates: leg.path },
        };
    });
    const opacity = routeOpacity(routes.length);
    const widthEncoding = size
        ? {
            field: size, type: 'quantitative', scale: { domain: [0, maxValue || 1], range: [ROUTE_WIDTH.min, widest] },
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
        // A thin leg takes no halo: round a hairline it outweighs the line and darkens the map under a crowd of them.
        data: { values: legData('casing').filter((_, index) => widths.get(allLegs[index])! >= HALO_MIN_WIDTH) },
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
            const full = headSize(widths.get(arrow.leg)!);
            const [length, halfWidth] = [full.length * shrinkOf(arrow.leg), full.halfWidth * shrinkOf(arrow.leg)];
            return {
                ...rowFields(rows[arrow.from]),
                [ROUTE_DATUM]: true,
                [ROUTE_PART]: 'head',
                [TIP_LON]: arrow.tip[0],
                [TIP_LAT]: arrow.tip[1],
                [TAIL_FIELD]: tail(arrow.tail),
                [BACK]: length,
                [RING]: ringOf(arrow.leg),
                [FIT]: fits(arrow.leg) ? 1 : 0,
                // Pointing along +x, its tip on the stop, in px at full size.
                [HEAD_SHAPE]: `M0,0L${-length},${-halfWidth}L${-length},${halfWidth}Z`,
            };
        });
        const hidden: { test: string; value: number }[] = [
            // A leg a few px long on screen keeps its line alone.
            { test: `datum.${SCALE} * datum.${BACK} < ${MIN_HEAD_PX}`, value: 0 },
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
        // The head's halo: its own shape in the halo's colour, a hairline wider, in the halo pass beneath
        // the dots and lines, so neither is cut where it meets the head.
        haloes.push({
            [MAP_ROLE]: 'routeHeadCasing',
            data: { values: values.filter((_, index) => widths.get(arrows[index].leg)! >= HALO_MIN_WIDTH) },
            transform: headTransforms(),
            mark: { type: 'point', filled: true, opacity: 1, strokeWidth: HEAD_HALO, strokeJoin: 'miter', fillOpacity: Math.min(0.9, opacity + 0.05), strokeOpacity: Math.min(0.9, opacity + 0.05), clip: true },
            encoding: placed,
        });
        heads.push({
            [MAP_ROLE]: 'routeArrow',
            [ROUTE_INK]: ink,
            data: { values },
            transform: headTransforms(),
            // No stroke: the halo beneath is the head's rim, and a dark map's ring for its dots passes it by.
            mark: { type: 'point', filled: true, opacity: 1, fillOpacity: opacity, stroke: null, strokeWidth: 0, clip: true },
            encoding: { ...placed, ...(colorEncoding ? { color: colorEncoding } : {}) },
        });
    }
    // Two passes, as a road map draws its casings: every halo, then every ink. A halo parts a route from
    // the ground, never a route's parts from each other, so a line, its dot and the head arriving at it
    // read as one shape. The dots' own rim is their halo, drawn over the casings and under the lines.
    // The points carry the data and its interaction wherever they are drawn.
    const isDots = (layer: any) => (typeof layer?.mark === 'string' ? layer.mark : layer?.mark?.type) === 'circle';
    const points = spec.layer.findIndex(isDots);
    if (points < 0) spec.layer.push(casing, ...haloes, line);
    else spec.layer.splice(points, 1, casing, ...haloes, spec.layer[points], line);
    spec.layer.push(...heads);
    const dots = spec.layer.find(isDots);
    if (!dots) return;
    // The colour scale is shared: the route's encodings keep the dots' order, else Vega-Lite merges
    // their domains sorted and the key loses the data's order.
    if (colorEncoding && dots.encoding?.color && 'sort' in dots.encoding.color) {
        for (const layer of [line, ...heads]) layer.encoding.color = { ...layer.encoding.color, sort: dots.encoding.color.sort };
    }
    styleRouteStops(dots, stopSize, everywhere ? undefined : unshownTest(rows, resolved, routeStartRows(routes, rows.length)));
    if (dots.encoding?.color && dots.encoding.color.legend !== null) {
        dots.encoding.color = { ...dots.encoding.color, legend: { ...(dots.encoding.color.legend ?? {}), symbolOpacity: 1 } };
    }
}
