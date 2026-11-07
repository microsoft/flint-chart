// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Map framing, shared by every backend that draws its own base map: what part of the earth a map
 * shows, and the shape its plot takes for it.
 *
 * A map frames its data. Countries or points that sit in one part of the world frame that part;
 * data that spans the world frames the world's land, without Antarctica unless the data names it.
 * A globe frames the whole sphere. The plot takes the shape the frame projects to, as large as the
 * canvas holds once its title, keys and axes have their room: a map is planned inside the box the
 * host gives it, and fills it.
 */

import {
    geoAzimuthalEqualArea, geoAzimuthalEquidistant, geoConicEqualArea, geoConicEquidistant, geoEqualEarth, geoMercator,
    geoNaturalEarth1, geoOrthographic, geoPath, geoStereographic, type GeoProjection,
} from 'd3-geo';
import { COUNTRY_BOUNDS } from './geo-bounds';
import { CONTINENT_FRAMES, type Continent } from './geo-continents';
import { WORLD_BANK_EXTRA_BOUNDS, WORLD_BANK_IDS } from './world-bank-ids';

/**
 * A box in degrees: west, south, east, north. A box across the antimeridian runs east past 180°
 * (Fiji to Samoa: 177 to 188), or, as a country's body, has west > east.
 */
export type GeoBox = readonly [number, number, number, number];

/** The world's land without Antarctica: Tierra del Fuego to northern Greenland. */
export const WORLD_LAND: GeoBox = [-180, -58, 180, 84];
/** The world's land with Antarctica. */
export const WORLD_ALL: GeoBox = [-180, -90, 180, 84];

/** ISO 3166-1 numeric id of Antarctica in the world TopoJSON. */
export const ANTARCTICA_ID = 10;

/** The narrowest a regional frame stands, in degrees, so one small country or a single point still reads in its region. */
const MIN_SPAN: readonly [number, number] = [16, 10];
/** Data spanning more than this, in degrees, frames the world rather than a region. */
const REGIONAL_SPAN: readonly [number, number] = [150, 100];
/** Margin around a frame drawn round the data, on each side, as a share of its span. */
const FRAME_PAD = 0.12;
/**
 * The share of its continent's frame the data must cover for the map to frame the whole continent:
 * data that already spans much of it reads best against all of it, as an axis takes in zero when the
 * data comes near it; less, and the map frames the data, so the part does not shrink into the whole.
 */
const CONTINENT_SNAP = 0.4;

/** What a world map frames: one country (or place), several, their whole continent, or the world. */
export type FrameLevel = 'country' | 'region' | 'continent' | 'world';

/** How a world map frames its data: `auto` judges by the data; `data` keeps to it; `continent` frames its continents. */
export type FrameFit = 'auto' | 'data' | 'continent';

/** The world's boundaries: World Bank Official Boundaries (the default), or Natural Earth's. */
export type WorldBoundaries = 'world-bank' | 'natural-earth';

const NATURAL_EARTH_IDS: ReadonlySet<number> = new Set(COUNTRY_BOUNDS.map(([id]) => id));
const BOUNDS_BY_ID = new Map([...COUNTRY_BOUNDS, ...WORLD_BANK_EXTRA_BOUNDS].map(([id, w, s, e, n]) => [id, [w, s, e, n] as GeoBox]));

/** Each country's main body, by ISO numeric id; undefined for an id neither world map draws. */
export function countryBox(id: number): GeoBox | undefined {
    return BOUNDS_BY_ID.get(id);
}

/**
 * Whether a world map draws a country with this ISO numeric id. The World Bank's draws Taiwan as part
 * of China and has no Antarctica; Natural Earth's 1:110m leaves out most small islands.
 */
export function isWorldFeature(id: number, boundaries: WorldBoundaries = 'world-bank'): boolean {
    return (boundaries === 'natural-earth' ? NATURAL_EARTH_IDS : WORLD_BANK_IDS).has(id);
}

/**
 * The frame for a set of boxes (countries) or points (as zero-size boxes), each in its continent where
 * known: the world's land where they span more than a region or cross the antimeridian; the whole of
 * their continents where they cover enough of them (`CONTINENT_SNAP`), or where `fit` asks; else the
 * box round them, padded on each side and no smaller than a small country's region.
 */
export function frameOf(
    boxes: readonly GeoBox[],
    antarctica = false,
    options: { continents?: readonly (Continent | undefined)[]; fit?: FrameFit } = {},
): { box: GeoBox; world: boolean; level: FrameLevel } {
    const world = { box: antarctica ? WORLD_ALL : WORLD_LAND, world: true, level: 'world' as const };
    if (boxes.length === 0) return world;
    const [west, east] = longitudeSpan(boxes);
    const south = Math.min(...boxes.map(([, s]) => s));
    const north = Math.max(...boxes.map(([, , , n]) => n));
    if (east - west > REGIONAL_SPAN[0] || north - south > REGIONAL_SPAN[1]) return world;
    const continental = continentFrame(options.continents);
    if (continental && options.fit !== 'data') {
        const [cw, cs, ce, cn] = continental;
        const covered = ((east - west) * (north - south)) / ((ce - cw) * (cn - cs));
        if (options.fit === 'continent' || covered >= CONTINENT_SNAP) return { box: continental, world: false, level: 'continent' };
    }
    const widen = (lo: number, hi: number, least: number): [number, number] => {
        const span = Math.max(hi - lo, least);
        const middle = (lo + hi) / 2;
        const half = (span * (1 + 2 * FRAME_PAD)) / 2;
        return [middle - half, middle + half];
    };
    const [w, e] = widen(west, east, MIN_SPAN[0]);
    const [s, n] = widen(south, north, MIN_SPAN[1]);
    const one = boxes.every(([bw, bs, be, bn]) => bw === boxes[0][0] && bs === boxes[0][1] && be === boxes[0][2] && bn === boxes[0][3]);
    // Past 180° only where the data runs across the antimeridian; otherwise held to the map's edges.
    const crosses = east > 180;
    return {
        box: [crosses ? w : Math.max(-180, w), Math.max(-90, s), crosses ? e : Math.min(180, e), Math.min(90, n)],
        world: false, level: one ? 'country' : 'region',
    };
}

/**
 * The narrowest run of longitude, west to east, that holds every box: the circle less the widest gap
 * between them. Where that run crosses the antimeridian its east end lies past 180° (New Zealand,
 * Fiji and Samoa: 166° to 188°), so the data is framed as one region rather than the world.
 */
export function longitudeSpan(boxes: readonly GeoBox[]): [number, number] {
    const arcs = boxes.map(([w, , e]): [number, number] => {
        const start = ((w + 180) % 360 + 360) % 360 - 180;
        const length = w <= e ? e - w : e + 360 - w;
        return [start, start + length];
    }).sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [];
    for (const [start, end] of arcs) {
        const last = merged[merged.length - 1];
        if (last && start <= last[1]) last[1] = Math.max(last[1], end);
        else merged.push([start, end]);
    }
    // Arcs that run past 180° may wrap round onto the first ones.
    while (merged.length > 1 && merged[merged.length - 1][1] - 360 >= merged[0][0]) {
        const last = merged.pop()!;
        merged[0] = [last[0] - 360, Math.max(merged[0][1], last[1] - 360)];
    }
    if (merged.length === 1) {
        const [start, end] = merged[0];
        return end - start >= 360 ? [-180, 180] : start < -180 ? [start + 360, end + 360] : [start, end];
    }
    let widest = -1;
    let after = 0;
    for (let i = 0; i < merged.length; i++) {
        const next = merged[(i + 1) % merged.length];
        const gap = i + 1 < merged.length ? next[0] - merged[i][1] : next[0] + 360 - merged[i][1];
        if (gap > widest) [widest, after] = [gap, (i + 1) % merged.length];
    }
    const west = merged[after][0];
    const before = merged[(after + merged.length - 1) % merged.length][1];
    return [west, before >= west ? before : before + 360];
}

/** The frame of the continents the data sits in, where every item has one and together they stand as a region. */
function continentFrame(continents: readonly (Continent | undefined)[] | undefined): GeoBox | undefined {
    if (!continents?.length || continents.some((continent) => continent === undefined)) return undefined;
    let [w, s, e, n] = [Infinity, Infinity, -Infinity, -Infinity];
    for (const continent of new Set(continents as Continent[])) {
        const [cw, cs, ce, cn] = CONTINENT_FRAMES[continent];
        [w, s, e, n] = [Math.min(w, cw), Math.min(s, cs), Math.max(e, ce), Math.max(n, cn)];
    }
    return e - w > REGIONAL_SPAN[0] || n - s > REGIONAL_SPAN[1] ? undefined : [w, s, e, n];
}

/**
 * A box as a GeoJSON feature a projection can fit: points along its edges, so the fit follows the
 * box's curved outline in the projection rather than the great circles a polygon's edges would take.
 */
export function boxTarget(box: GeoBox): { type: 'Feature'; properties: Record<string, never>; geometry: { type: 'MultiPoint'; coordinates: [number, number][] } } {
    const [w, s, e, n] = box;
    const coordinates: [number, number][] = [];
    const steps = 24;
    for (let i = 0; i <= steps; i++) {
        const lon = w + ((e - w) * i) / steps;
        const lat = s + ((n - s) * i) / steps;
        coordinates.push([lon, s], [lon, n], [w, lat], [e, lat]);
    }
    return { type: 'Feature', properties: {}, geometry: { type: 'MultiPoint', coordinates } };
}

const PROJECTIONS: Record<string, () => GeoProjection> = {
    equalEarth: geoEqualEarth,
    mercator: geoMercator,
    orthographic: geoOrthographic,
    stereographic: geoStereographic,
    conicEqualArea: geoConicEqualArea,
    conicEquidistant: geoConicEquidistant,
    azimuthalEquidistant: geoAzimuthalEquidistant,
    azimuthalEqualArea: geoAzimuthalEqualArea,
    naturalEarth1: geoNaturalEarth1,
    // Vega's Mollweide comes from an extension; Natural Earth's outline is close enough for the shape.
    mollweide: geoNaturalEarth1,
};

/** The shapes a regional frame keeps to, as projected width over height: no flatter than a world map, no taller than a portrait page. */
const REGIONAL_ASPECT: readonly [number, number] = [0.8, 2];

/**
 * A regional frame widened, about its centre, until its projected shape falls within
 * {@link REGIONAL_ASPECT}: a frame too flat gains latitude, one too tall gains longitude.
 * Two points far apart east to west would otherwise frame a strip.
 */
export function shapedFrame(box: GeoBox, type: string, rotate?: readonly number[], parallels?: readonly [number, number]): GeoBox {
    let [w, s, e, n] = box;
    for (let pass = 0; pass < 4; pass++) {
        const aspect = projectedAspect([w, s, e, n], type, rotate, parallels);
        if (aspect > REGIONAL_ASPECT[1] * 1.01) {
            const grow = ((n - s) * (aspect / REGIONAL_ASPECT[1] - 1)) / 2;
            [s, n] = [Math.max(-89, s - grow), Math.min(89, n + grow)];
        } else if (aspect < REGIONAL_ASPECT[0] * 0.99) {
            const grow = ((e - w) * (REGIONAL_ASPECT[0] / aspect - 1)) / 2;
            // A frame across the antimeridian keeps running east; one inside the map stays inside it.
            [w, e] = e > 180 ? [w - grow, e + grow] : [Math.max(-180, w - grow), Math.min(180, e + grow)];
        } else break;
    }
    return [w, s, e, n];
}

/** Width over height of a box as a projection draws it; the US frame's own shape for `albersUsa`. */
export function projectedAspect(box: GeoBox, type: string, rotate?: readonly number[], parallels?: readonly [number, number]): number {
    if (type === 'albersUsa') return US_FRAME_ASPECT;
    const projection = (PROJECTIONS[type] ?? geoEqualEarth)();
    if (parallels && 'parallels' in projection) (projection as any).parallels(parallels);
    if (rotate) projection.rotate([rotate[0] ?? 0, rotate[1] ?? 0, rotate[2] ?? 0]);
    const [[x0, y0], [x1, y1]] = geoPath(projection).bounds(boxTarget(box) as any);
    const width = x1 - x0;
    const height = y1 - y0;
    return width > 0 && height > 0 ? width / height : 2;
}

/** A projection a frame is drawn in: its type, where it is turned to, and a conic's standard parallels. */
export interface FrameProjection {
    type: string;
    rotate?: [number, number, number];
    parallels?: [number, number];
}

/** Within this many degrees of the equator a region is drawn in Equal Earth; past `POLAR_LATITUDE`, azimuthally. */
const TROPICAL_LATITUDE = 15;
const POLAR_LATITUDE = 60;

const tenth = (value: number): number => Math.round(value * 10) / 10 || 0;

/**
 * The projection a region reads truest in, centred on it, as an atlas draws a regional map: a
 * conic equal-area for the middle latitudes, its standard parallels a sixth in from the frame's
 * top and bottom (Japan, Europe, the US); Equal Earth turned to the region near the equator, where a
 * cone flattens out; an azimuthal equal-area about a polar region. A world map's own projection,
 * centred on 0°, shears a region far from its centre — Japan leans, Alaska sprawls.
 */
export function regionalProjection(box: GeoBox): FrameProjection {
    const [w, s, e, n] = box;
    const lon = (((w + e) / 2 + 180) % 360 + 360) % 360 - 180;
    const lat = (s + n) / 2;
    if (Math.abs(lat) >= POLAR_LATITUDE) return { type: 'azimuthalEqualArea', rotate: [tenth(-lon), tenth(-lat), 0] };
    if (Math.abs(lat) < TROPICAL_LATITUDE) return { type: 'equalEarth', rotate: [tenth(-lon), 0, 0] };
    const span = n - s;
    return { type: 'conicEqualArea', rotate: [tenth(-lon), 0, 0], parallels: [tenth(s + span / 6), tenth(n - span / 6)] };
}

/** The us-atlas frame (975 × 610) the US maps are drawn in. */
export const US_FRAME_ASPECT = 975 / 610;

/**
 * The rotation that turns a globe to face its data: the places' mean longitude (taken round the
 * circle, so 170° and −170° average to 180°, not 0°) and their mean latitude, tilted no further than
 * {@link MAX_FACING_TILT} — places spread round the northern hemisphere would otherwise turn the globe
 * onto the pole. Undefined where there are none, or they spread evenly round the globe.
 */
export function facingRotation(places: readonly (readonly [number, number])[]): [number, number, number] | undefined {
    if (places.length === 0) return undefined;
    let east = 0;
    let north = 0;
    let lat = 0;
    for (const [x, y] of places) {
        east += Math.cos((x * Math.PI) / 180);
        north += Math.sin((x * Math.PI) / 180);
        lat += y;
    }
    if (Math.hypot(east, north) < 1e-9 * places.length) return undefined;
    const lon = (Math.atan2(north, east) * 180) / Math.PI;
    const tilt = Math.max(-MAX_FACING_TILT, Math.min(MAX_FACING_TILT, lat / places.length));
    const round = (value: number) => Math.round(value * 10) / 10 || 0;
    return [round(-lon), round(-tilt), 0];
}

/** The furthest a globe tilts to face its data, in degrees of latitude. */
const MAX_FACING_TILT = 60;

/**
 * A Vega expression, true where a place stands on the side of the globe that faces the viewer:
 * the cosine of its angular distance from the centre the rotation faces is above zero (with a
 * hair's margin, so a place on the rim does not flicker). `rotate` names a signal holding the
 * projection's rotation in degrees.
 */
export function frontFacingExpr(lon: string, lat: string, rotate: string): string {
    const rad = (degrees: string) => `(${degrees}) * PI / 180`;
    const phi = rad(lat);
    const phi0 = rad(`-${rotate}[1]`);
    return `cos(${phi}) * cos(${phi0}) * cos(${rad(`${lon} + ${rotate}[0]`)}) + sin(${phi}) * sin(${phi0}) > 0.01`;
}

/**
 * The plot a map is drawn in: the largest of the frame's shape the room holds. A map has no data
 * that presses for room, so it takes all the canvas leaves it.
 */
export function mapPlotSize(room: { width: number; height: number }, aspect: number): { width: number; height: number } {
    const width = Math.min(room.width, room.height * aspect);
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(width / aspect)) };
}
