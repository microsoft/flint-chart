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

export type MapRole = 'sea' | 'land' | 'noData' | 'regions' | 'graticule' | 'disputed';

/** The fill a template draws land without data in until the ground is painted; also the colour a choropleth's no-data condition names. */
export const NO_DATA_PLACEHOLDER = '#e3e3e3';

/** The colours a map's ground is painted in. */
export interface MapGround {
    /** The plot's own fill on a flat map; unset leaves the page showing (no sea oval). */
    frame?: string;
    /** The sea behind a globe. */
    sea: string;
    /** The rim round a globe, and the coast colour a style names. */
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

/** Data Formulator's map styles (`src/maps/styles.ts`), as that design settled their colours. */
const STYLE_GROUNDS: Record<Exclude<MapStyle, 'auto'>, MapGround> = {
    light: { sea: '#eef3f6', rim: '#d4d4d1', land: '#e6e6e4', noData: '#dededb', border: '#ffffff', graticule: '#e8ecef', disputed: '#888888' },
    muted: { sea: '#f4f6f7', rim: '#bdbdba', land: '#f6f6f4', noData: '#ebebe8', border: '#d6d6d3', graticule: '#efefef', disputed: '#888888' },
    // Water fills the whole frame; land is paper.
    atlas: { frame: '#dbe9f2', sea: '#dbe9f2', rim: '#b8cbd8', land: '#f6f3eb', noData: '#ebe6db', border: '#dad2c4', graticule: '#c2d8e6', disputed: '#888888' },
    dark: { frame: '#1d2227', sea: '#1d2227', rim: '#4b545d', land: '#2e343a', noData: '#383f46', border: '#424a52', graticule: '#262c32', disputed: '#8a939b' },
    minimal: { sea: '#ffffff', rim: '#9a9a9a', land: '#ffffff', noData: '#f0f0f0', border: '#c9c9c9', graticule: '#eeeeee', disputed: '#888888' },
};

/** A cool grey-blue the sea is tinted toward from the page. */
const WATER = '#5b8bb0';

/**
 * The ground a page and its ink imply: land and land without data a little toward the ink, the
 * sea a little toward blue, borders in the page colour on a light page and a lifted line on a dark
 * one — Data Formulator's light and dark styles, measured against their page and text.
 */
export function derivedGround(surface: string, ink: string): MapGround {
    const dark = isDark(surface);
    const toward = (amount: number) => mixHex(surface, ink, amount);
    return dark
        ? { sea: mixHex(surface, WATER, 0.12), rim: toward(0.3), land: toward(0.12), noData: toward(0.17), border: toward(0.24), graticule: toward(0.08), disputed: toward(0.55) }
        : { sea: mixHex(surface, WATER, 0.1), rim: toward(0.2), land: toward(0.09), noData: toward(0.12), border: surface, graticule: toward(0.07), disputed: toward(0.47) };
}

function isDark(color: string): boolean {
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

/** The ground for a style on this spec's page. */
export function groundFor(style: unknown, spec: any): MapGround {
    if (typeof style === 'string' && style in STYLE_GROUNDS) return STYLE_GROUNDS[style as Exclude<MapStyle, 'auto'>];
    const { surface, ink } = pageOf(spec);
    return derivedGround(surface, ink);
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

/**
 * Paint the tagged layers of a map in its ground, give a choropleth's land without data the
 * ground's no-data colour, thin or thicken the borders where the caller asks, and remove the tags.
 * A flat map's plot takes the style's frame where it has one; a globe keeps the page round it.
 */
export function paintMapGround(spec: any, ground: MapGround, options: { globe: boolean; borderWidth?: number }): void {
    const width = typeof options.borderWidth === 'number' && options.borderWidth >= 0 ? options.borderWidth : undefined;
    walkUnits(spec, (unit) => {
        const role: MapRole | undefined = unit[MAP_ROLE];
        delete unit[MAP_ROLE];
        // A role left on a node that became a layered spec names its layers' parent, not a mark.
        if (role && unit.mark) {
            const mark = asMark(unit.mark);
            if (role === 'sea') Object.assign(mark, { fill: ground.sea, stroke: ground.rim });
            else if (role === 'land') Object.assign(mark, { fill: ground.land, stroke: ground.border });
            else if (role === 'noData') Object.assign(mark, { fill: ground.noData, stroke: ground.border });
            else if (role === 'graticule') Object.assign(mark, { stroke: ground.graticule });
            else if (role === 'disputed') Object.assign(mark, { stroke: ground.disputed });
            else if (role === 'regions') mark.stroke = ground.border;
            if (width !== undefined && role !== 'sea' && role !== 'graticule' && role !== 'disputed') mark.strokeWidth = width;
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
