// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * How a map's ground is painted, and how a choropleth's colour is classed, after the theme has had
 * its say.
 *
 * The ground — the sea behind a globe, the land a point map stands on, the land without data, the
 * borders between regions, the graticule — is set by `chartProperties.mapStyle`. `auto` derives it
 * from the theme's surface and text ink, so a dark house gets a dark ground; the named styles are
 * Data Formulator's map styles, with their colours as that design settled them. Rules kept from it:
 * a flat map has no sea oval (water is unpainted or fills the whole plot); a globe floats on the
 * page with its own sea and rim; borders and coasts are hairlines.
 *
 * The templates tag each structural layer with its role ({@link MAP_ROLE}); the template's
 * post-process paints the roles and removes the tags.
 */

import { mixHex, parseColor, luminance } from '../../core/theme/presence';
import { INTERACTION_PROVENANCE } from '../interaction-provenance';
import { stepColorScale } from '../color-classes';
import { resampleStops } from '../../core/color-controls';

/** The key a template tags a structural map layer with; read and removed by {@link paintMapGround}. */
export const MAP_ROLE = '__flintMapRole';

/** The tag a template puts on a map cut from a larger one — a region, clipped to its plot — until its ground is painted. */
export const MAP_REGIONAL = '__flintMapRegional';

export type MapRole = 'sea' | 'land' | 'borders' | 'noData' | 'regions' | 'graticule' | 'disputed' | 'disputedBase'
    | 'routeCasing' | 'routeHeadCasing' | 'route' | 'routeArrow' | 'routeStop' | 'label' | 'labelHalo';

/** The fill a template draws land without data in until the ground is painted; also the colour a choropleth's no-data condition names. */
export const NO_DATA_PLACEHOLDER = '#e3e3e3';

/** The colours a map's ground is painted in. */
export interface MapGround {
    /** The plot's own fill on a flat map; unset leaves the page showing (no sea oval). */
    frame?: string;
    /** The sea behind a globe. */
    sea: string;
    /** The rim round a globe, and the coast: the outline a point map draws its land in. */
    rim: string;
    /** Land a point map stands on. */
    land: string;
    /** A region the data gives no value. */
    noData: string;
    /** The lines between regions. */
    border: string;
    graticule: string;
    /** The dotted borders of areas of non-determined legal status. */
    disputed: string;
}

export const MAP_STYLES = ['auto', 'light', 'muted', 'atlas', 'dark', 'minimal'] as const;
export type MapStyle = typeof MAP_STYLES[number];

/**
 * A map style of the caller's own: a named style (`base`, `auto` when unset) with any of its colours
 * restated. `sea` is the water, behind a globe and filling a flat map's plot; `coast` outlines the
 * land and rims a globe.
 */
export interface CustomMapStyle {
    base?: MapStyle;
    sea?: string;
    land?: string;
    coast?: string;
    border?: string;
    noData?: string;
    graticule?: string;
    disputed?: string;
}

const CUSTOM_COLORS = ['sea', 'land', 'coast', 'border', 'noData', 'graticule', 'disputed'] as const;

export const CUSTOM_MAP_STYLE_LABEL = `a style of your own { base? (${MAP_STYLES.join(', ')}), ${CUSTOM_COLORS.map((key) => `${key}?`).join(', ')} } in CSS colours`;

export function isCustomMapStyle(value: unknown): value is CustomMapStyle {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const entries = Object.entries(value);
    return entries.length > 0 && entries.every(([key, colour]) => key === 'base'
        ? (MAP_STYLES as readonly unknown[]).includes(colour)
        : (CUSTOM_COLORS as readonly string[]).includes(key) && typeof colour === 'string' && colour.trim() !== '');
}

/** The named style a map style stands on: itself, or a custom style's base. */
export function baseMapStyle(style: unknown): unknown {
    return isCustomMapStyle(style) ? style.base ?? 'auto' : style;
}

/** A ground with a custom style's colours restated over it; stated water fills a flat map's plot. */
export function withCustomColors(ground: MapGround, style: unknown): MapGround {
    if (!isCustomMapStyle(style)) return ground;
    const { sea, land, coast, border, noData, graticule, disputed } = style;
    return {
        ...ground,
        ...(sea ? { sea, frame: sea } : {}),
        ...(land ? { land } : {}),
        ...(coast ? { rim: coast } : {}),
        ...(border ? { border } : {}),
        ...(noData ? { noData } : {}),
        ...(graticule ? { graticule } : {}),
        ...(disputed ? { disputed } : {}),
    };
}

/** Data Formulator's map styles (`src/maps/styles.ts`), as that design settled their colours. */
const STYLE_GROUNDS: Record<Exclude<MapStyle, 'auto'>, MapGround> = {
    light: { sea: '#eef3f6', rim: '#d4d4d1', land: '#e6e6e4', noData: '#dededb', border: '#ffffff', graticule: '#e8ecef', disputed: '#888888' },
    muted: { sea: '#f4f6f7', rim: '#bdbdba', land: '#f6f6f4', noData: '#ebebe8', border: '#d6d6d3', graticule: '#efefef', disputed: '#888888' },
    // Water fills the whole frame; land is paper.
    atlas: { frame: '#dbe9f2', sea: '#dbe9f2', rim: '#b8cbd8', land: '#f6f3eb', noData: '#ebe6db', border: '#dad2c4', graticule: '#c2d8e6', disputed: '#888888' },
    // Borders are gaps in the ground's own colour, as the light styles' are white: a lifted grey line
    // all but vanishes between regions without data, and outlines coloured ones in grey.
    // Land is lifted far enough off the water (about 1.7:1) that a small island still reads.
    dark: { frame: '#1d2227', sea: '#1d2227', rim: '#4b545d', land: '#3c434a', noData: '#434b53', border: '#1d2227', graticule: '#262c32', disputed: '#8a939b' },
    minimal: { sea: '#ffffff', rim: '#9a9a9a', land: '#ffffff', noData: '#f0f0f0', border: '#c9c9c9', graticule: '#eeeeee', disputed: '#888888' },
};

/** A cool grey-blue the sea is tinted toward from the page. */
const WATER = '#5b8bb0';

/**
 * The ground a point or route map stands on, when the theme decides it: a reference map's, where the
 * geography is read rather than coloured. Water fills the frame in a cool tint, land lies on it near
 * the page's own colour, the coast outlines the land in a deeper water tone, and the borders between
 * countries are thin lines of the ink — a choropleth's borders are gaps between coloured regions, but
 * gaps vanish between regions of one fill. On a dark page the water is darker than the land.
 */
export function derivedReferenceGround(surface: string, ink: string): MapGround {
    const dark = isDark(surface);
    const toward = (amount: number) => mixHex(surface, ink, amount);
    const water = (amount: number) => mixHex(surface, WATER, amount);
    return dark
        ? {
            frame: water(0.1), sea: water(0.1), rim: mixHex(water(0.1), ink, 0.3), land: toward(0.13), noData: toward(0.17),
            border: mixHex(water(0.1), ink, 0.05), graticule: water(0.16), disputed: toward(0.55),
        }
        : {
            frame: water(0.14), sea: water(0.14), rim: water(0.45), land: toward(0.015), noData: toward(0.12),
            border: toward(0.2), graticule: water(0.24), disputed: toward(0.47),
        };
}

/**
 * The ground a page and its ink imply: land and land without data a little toward the ink, the
 * sea a little toward blue, and borders as gaps in the page colour, light or dark — Data
 * Formulator's light and dark styles, measured against their page and text.
 */
export function derivedGround(surface: string, ink: string): MapGround {
    const dark = isDark(surface);
    const toward = (amount: number) => mixHex(surface, ink, amount);
    return dark
        ? { sea: mixHex(surface, WATER, 0.12), rim: toward(0.3), land: toward(0.12), noData: toward(0.17), border: surface, graticule: toward(0.08), disputed: toward(0.55) }
        : { sea: mixHex(surface, WATER, 0.1), rim: toward(0.2), land: toward(0.09), noData: toward(0.12), border: surface, graticule: toward(0.07), disputed: toward(0.47) };
}

export function isDark(color: string): boolean {
    const rgb = parseColor(color);
    return rgb ? luminance(rgb) < 0.35 : false;
}

/** The page a map is drawn on, and the ink its text is set in, as the finished spec states them. */
function pageOf(spec: any): { surface: string; ink: string } {
    const config = spec.config ?? {};
    const fill = typeof config.view?.fill === 'string' ? config.view.fill : undefined;
    const surface = fill ?? (typeof spec.background === 'string' ? spec.background : undefined)
        ?? (typeof config.background === 'string' ? config.background : undefined) ?? '#ffffff';
    const stated = [config.title?.color, config.axis?.labelColor, config.legend?.labelColor, config.text?.color]
        .find((color) => typeof color === 'string' && parseColor(color));
    return { surface, ink: stated ?? (isDark(surface) ? '#e8eaec' : '#2b2b2b') };
}

/**
 * The ground for a style on this spec's page. A point or route map (`reference`) left to the theme
 * takes a reference map's ground; a named style is the same for every map.
 */
export function groundFor(style: unknown, spec: any, reference = false): MapGround {
    if (typeof style === 'string' && style in STYLE_GROUNDS) return STYLE_GROUNDS[style as Exclude<MapStyle, 'auto'>];
    const { surface, ink } = pageOf(spec);
    return reference ? derivedReferenceGround(surface, ink) : derivedGround(surface, ink);
}

/** Every unit of a spec: itself and the units of its layers and concatenations. */
function walkUnits(node: any, visit: (unit: any) => void): void {
    if (!node || typeof node !== 'object') return;
    visit(node);
    for (const key of ['layer', 'vconcat', 'hconcat', 'concat'] as const) {
        if (Array.isArray(node[key])) for (const child of node[key]) walkUnits(child, visit);
    }
    if (node.spec) walkUnits(node.spec, visit);
}

const asMark = (mark: any) => (typeof mark === 'string' ? { type: mark } : { ...(mark ?? {}) });

/** The tag a route layer carries for how its ink is chosen (`ROUTE_INK` in `./map-routes`); read and removed here. */
const ROUTE_INK_KEY = '__flintRouteInk';

/** The colour a theme draws a plain mark in: a circle's, a point's or any mark's, else Vega-Lite's own. */
function markColorOf(spec: any): string {
    const config = spec?.config ?? {};
    const stated = [config.circle?.color, config.point?.color, config.mark?.color, config.circle?.fill, config.mark?.fill]
        .find((value) => typeof value === 'string' && parseColor(value));
    return stated ?? '#4c78a8';
}

/** How much wider a point map's borders are drawn than its coast outline, so they cover it along each shared edge. */
export const BORDER_COVER = 0.15;

/** A route drawn in no series' colour: a neutral ink that reads on the ground without taking the points' colour. */
const ROUTE_INK = '#4a5058';
const ROUTE_INK_ON_DARK = '#cfd5da';

/** A label's ink on a map: dark on a light ground, light on a dark one. */
const LABEL_INK = '#2b2f33';
const LABEL_INK_ON_DARK = '#e6e9ec';

/** The marks a point map draws its data in. */
const POINT_MARKS = new Set(['circle', 'point', 'square']);

/**
 * Paint the tagged layers of a map in its ground, give a choropleth's land without data the
 * ground's no-data colour, thin or thicken the borders where the caller asks, and remove the tags.
 * A flat map's plot takes the style's frame where it has one; a globe keeps the page round it.
 */
export function paintMapGround(spec: any, ground: MapGround, options: { globe: boolean; borderWidth?: number }): void {
    const width = typeof options.borderWidth === 'number' && options.borderWidth >= 0 ? options.borderWidth : undefined;
    const darkGround = isDark(ground.frame ?? ground.sea);
    // A route's halo, round its line and its head: white on a light map, the ground's own dark on a dark
    // one, as Data Formulator draws it — a hairline that parts a route from the borders and the routes
    // it crosses (a halo in the water's blue would trace a blue outline over the land).
    const halo = darkGround ? ground.frame ?? ground.sea : '#ffffff';
    const neutralInk = darkGround ? ROUTE_INK_ON_DARK : ROUTE_INK;
    // A route in no series' colour, and its stops, take the theme's mark colour, as a plain dot does.
    const markInk = markColorOf(spec);
    // Where a map draws its borders as a mesh of their own, its regions are outlined at the coast.
    let meshed = false;
    walkUnits(spec, (unit) => { if (unit[MAP_ROLE] === 'borders') meshed = true; });
    const outline = meshed ? ground.rim : ground.border;
    walkUnits(spec, (unit) => {
        const role: MapRole | undefined = unit[MAP_ROLE];
        delete unit[MAP_ROLE];
        // A label is written in the ground's ink, over a halo of the routes' own light that parts it
        // from the borders, coasts and lines it crosses.
        if (role === 'label' || role === 'labelHalo') {
            const ink = darkGround ? LABEL_INK_ON_DARK : LABEL_INK;
            // A region's label inks itself by its region's fill (its colour encoding): a mark's fill would override it.
            unit.mark = role === 'label'
                ? { ...asMark(unit.mark), ...(unit.encoding?.color ? {} : { fill: ink }) }
                : { ...asMark(unit.mark), fill: halo, stroke: halo, strokeOpacity: 0.9, fillOpacity: 0.9 };
            return;
        }
        // A drawn stop is haloed as its route is: a hairline that parts it from the line it ends.
        if (role === 'routeStop') {
            unit.mark = { ...asMark(unit.mark), stroke: halo };
            return;
        }
        if (role === 'routeCasing' || role === 'routeHeadCasing' || role === 'route' || role === 'routeArrow') {
            const mark = asMark(unit.mark);
            const coloured = unit.encoding?.color !== undefined;
            const ink = unit[ROUTE_INK_KEY] === 'neutral' ? neutralInk : markInk;
            delete unit[ROUTE_INK_KEY];
            if (role === 'routeCasing') mark.stroke = halo;
            else if (role === 'routeHeadCasing') Object.assign(mark, { fill: halo, stroke: halo });
            else if (role === 'route' && !coloured) mark.stroke = ink;
            // A head is joined to its line: the line's own ink; its halo is drawn beneath the line.
            else if (role === 'routeArrow' && !coloured) mark.fill = ink;
            unit.mark = mark;
            return;
        }
        // A role left on a node that became a layered spec names its layers' parent, not a mark.
        if (role && unit.mark) {
            const mark = asMark(unit.mark);
            if (role === 'sea') Object.assign(mark, { fill: ground.sea, stroke: ground.rim });
            // A point map's land is outlined at its coast; the borders between its countries are drawn
            // over that outline by a mesh of their own (`borders`), and where a border is in dispute the
            // land's own colour first hides the solid line its dots stand on (`disputedBase`).
            else if (role === 'land') Object.assign(mark, { fill: ground.land, stroke: ground.rim });
            else if (role === 'borders') mark.stroke = ground.border;
            else if (role === 'disputedBase') mark.stroke = ground.land;
            else if (role === 'noData') Object.assign(mark, { fill: ground.noData, stroke: outline });
            else if (role === 'graticule') Object.assign(mark, { stroke: ground.graticule });
            else if (role === 'disputed') Object.assign(mark, { stroke: ground.disputed });
            else if (role === 'regions') mark.stroke = outline;
            if (width !== undefined && role !== 'sea' && role !== 'graticule' && role !== 'disputed' && role !== 'disputedBase') {
                mark.strokeWidth = role === 'borders' ? width + BORDER_COVER : width;
            }
            unit.mark = mark;
            // A stated colour would outrank the mark's own: it takes the ground's too.
            const stated = role === 'noData' ? ground.noData : role === 'graticule' ? ground.graticule : role === 'disputed' ? ground.disputed : undefined;
            if (stated && unit.encoding?.color?.value !== undefined) unit.encoding.color = { ...unit.encoding.color, value: stated };
        }
        const color = unit.encoding?.color;
        if (color?.condition) {
            const conditions = Array.isArray(color.condition) ? color.condition : [color.condition];
            const painted = conditions.map((condition: any) => (condition?.value === NO_DATA_PLACEHOLDER ? { ...condition, value: ground.noData } : condition));
            unit.encoding.color = { ...color, condition: Array.isArray(color.condition) ? painted : painted[0] };
        }
    });
    // On a dark ground, marks coloured for a light page sink into it: a fine light ring lifts them.
    if (isDark(ground.frame ?? ground.sea)) {
        walkUnits(spec, (unit) => {
            const mark = unit.mark === undefined ? undefined : asMark(unit.mark);
            if (!mark || !POINT_MARKS.has(mark.type) || mark.stroke !== undefined) return;
            unit.mark = { ...mark, stroke: '#ffffff', strokeWidth: mark.strokeWidth ?? 1, strokeOpacity: mark.strokeOpacity ?? 0.85 };
        });
    }
    const view = projectedView(spec);
    const regional = view?.[MAP_REGIONAL] === true;
    if (view) delete view[MAP_REGIONAL];
    if (options.globe) return;
    // A region is a window on the world: water fills it, and a neatline closes the edges its land is cut at.
    if (ground.frame || regional) addFrame(spec, ground.frame ?? ground.sea);
    if (regional) addNeatline(spec, ground.rim);
}

/** The view that draws the map: the one with a projection, the spec itself unless a theme wrapped it. */
function projectedView(spec: any): any {
    if (spec?.projection) return spec;
    for (const key of ['vconcat', 'hconcat', 'concat'] as const) {
        for (const child of spec?.[key] ?? []) {
            const found = projectedView(child);
            if (found) return found;
        }
    }
    return undefined;
}

/**
 * Fill a flat map's plot with the style's water, as a rectangle beneath the map: Vega-Lite paints
 * no plot background for a chart drawn only in geoshapes. A single-view map becomes layered to hold
 * it. Structure: it takes no colour, tooltip or part in interaction from the regions.
 */
function addFrame(spec: any, fill: string): void {
    const view = projectedView(spec);
    if (!view) return;
    if (!Array.isArray(view.layer)) {
        const { data, transform, mark, encoding } = view;
        for (const key of ['data', 'transform', 'mark', 'encoding'] as const) delete view[key];
        view.layer = [{ data, ...(transform ? { transform } : {}), mark, ...(encoding ? { encoding } : {}) }];
    }
    view.layer.unshift({
        [INTERACTION_PROVENANCE]: { role: 'decorative', identity: 'inherit', presentation: 'independent' },
        data: { values: [{}] },
        mark: { type: 'rect', fill, strokeWidth: 0 },
        encoding: {
            x: { value: 0 }, x2: { value: 'width' }, y: { value: 0 }, y2: { value: 'height' },
            color: { value: fill }, tooltip: null,
        },
    });
}

/** Close a regional map's plot with a fine line over the edges its land is cut at. */
function addNeatline(spec: any, stroke: string): void {
    const view = projectedView(spec);
    if (!view || !Array.isArray(view.layer)) return;
    view.layer.push({
        [INTERACTION_PROVENANCE]: { role: 'decorative', identity: 'inherit', presentation: 'independent' },
        data: { values: [{}] },
        mark: { type: 'rect', fillOpacity: 0, stroke, strokeWidth: 1 },
        encoding: { x: { value: 0 }, x2: { value: 'width' }, y: { value: 0 }, y2: { value: 'height' }, tooltip: null },
    });
}

export const CLASS_METHODS = ['auto', 'quantile', 'equal', 'jenks', 'continuous'] as const;
export type ClassMethod = typeof CLASS_METHODS[number];

const BINNED = new Set(['quantize', 'quantile', 'threshold']);

/** How far in from its end a classed one-way ramp starts, in twentieths of the ramp. */
const RAMP_INSET = 3;

/**
 * Class a choropleth's colour. `auto` (the default) puts the breaks at the quantiles, so each class
 * holds about as many regions — or, for a diverging field, at round steps about its midpoint;
 * `quantile`, `equal` (round steps) and `jenks` (natural breaks) choose; `continuous` keeps a
 * smooth ramp. `count` classes, 5 unless asked. The ramp is the one the theme and semantics chose:
 * a scheme by name, or the theme's stops (or classes, resampled). An author's own `bins` or scheme
 * on the encoding are laid after this and win.
 */
export function classChoropleth(spec: any, rows: readonly any[], method: unknown, count: unknown): void {
    const how: ClassMethod = typeof method === 'string' && (CLASS_METHODS as readonly string[]).includes(method) ? method as ClassMethod : 'auto';
    const target = typeof count === 'number' && Number.isFinite(count) ? Math.max(2, Math.min(9, Math.round(count))) : 5;
    walkUnits(spec, (unit) => {
        if (unit[INTERACTION_PROVENANCE]?.role === 'decorative') return;
        const enc = unit.encoding?.color;
        if (!enc?.field || enc.type !== 'quantitative') return;
        const scale = enc.scale ?? {};
        if (how === 'continuous') {
            if (BINNED.has(scale.type)) {
                const { type: _type, ...rest } = scale;
                if (_type === 'threshold') delete rest.domain;
                enc.scale = rest;
            }
            return;
        }
        const ramp = Array.isArray(scale.range) && scale.range.length >= 2 ? scale.range
            : typeof scale.scheme === 'string' ? { scheme: scale.scheme }
            : typeof scale.scheme?.name === 'string' ? { scheme: scale.scheme.name }
            : { scheme: 'blues' };
        // A domain the field states (a margin's ±100) promises colours that compare across charts:
        // classes cut from these rows would break it, so `auto` keeps the ramp as stated.
        if (how === 'auto' && Array.isArray(scale.domain) && scale.type !== 'threshold') return;
        const pivot = typeof scale.domainMid === 'number' ? scale.domainMid : undefined;
        if (BINNED.has(scale.type)) {
            const { type: _type, ...rest } = scale;
            if (_type === 'threshold') delete rest.domain;
            enc.scale = rest;
        }
        const methodFor = how === 'auto' ? (pivot !== undefined ? 'round' : 'quantile') : how === 'equal' ? 'round' : how;
        // A one-way ramp's first class starts a little in from its end: the palest (or, on a dark
        // ramp, the darkest) shade sits beside the no-data land and the page, and would read as either.
        const sequential = pivot === undefined;
        const inset = sequential && Array.isArray(ramp) ? resampleStops(ramp, 21).slice(RAMP_INSET) : ramp;
        if (!stepColorScale(enc, inset, target, rows, pivot, { method: methodFor, ...(how !== 'auto' ? { exact: methodFor === 'round' } : {}) })) return;
        const scheme = enc.scale?.scheme;
        if (sequential && scheme && typeof scheme === 'object' && !scheme.extent) enc.scale.scheme = { ...scheme, extent: [RAMP_INSET / 20, 1] };
    });
}
