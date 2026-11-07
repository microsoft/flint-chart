// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ChartTemplateDef, ChartPropertyDef, InstantiateContext, MapBasemaps, OptionEvalContext, PlotPlanContext } from '../../core/types';
import {
    DISPUTED_FEATURE, basemapAttribution, basemapCredit, basemapSource, isPackageWorldBank, knownBoundaries, worldBoundaries, worldPart,
    type BasemapPart, type WorldDetail,
} from '../../chart-types/basemap-sources';
import {
    resolveUsState, resolveCountry, GeoResolver, MAP_KEY_TYPES, isAggregateRegion, keyTypeResolver,
    type MapScope, inferBubbleScope, inferChoroplethScope, semanticScope, pickMapScope,
} from '../../chart-types/geo';
import {
    ANTARCTICA_ID, US_FRAME_ASPECT, WORLD_ALL, boxTarget, countryBox, facingRotation, frameOf, frontFacingExpr,
    isWorldFeature, mapPlotSize, projectedAspect, regionalProjection, shapedFrame, type FrameLevel, type FrameProjection, type GeoBox,
} from '../../chart-types/geo-frame';
import { continentAt, continentOf, type Continent } from '../../chart-types/geo-continents';
import { resolveAggregationDefault, toTypeString } from '../../core/field-semantics';
import { getRegistryEntry } from '../../core/type-registry';
import {
    GEO_LEVEL_SIGNAL,
    GEO_ROTATE_SIGNAL,
    geoLevelGate,
    isGlobeProjection,
    type GeoLevel,
    type GeoPreProjection,
} from '../interactions/geo-levels';
import { INTERACTION_PROVENANCE, withInteractionDecorative } from '../interaction-provenance';
import { CLASS_METHODS, MAP_REGIONAL, MAP_ROLE, MAP_STYLES, NO_DATA_PLACEHOLDER, classChoropleth, groundFor, paintMapGround } from './map-style';
import {
    fieldsFromEncodingChannels,
    firstDiscreteEncodingField,
    legendMatchedHits,
    MUTED_HOVER_STROKE,
    targetFromHits,
} from '../../core/interaction-semantics';
import {
    annotationCandidates,
    categoryValueAnnotationText,
    presentAnnotationUpdate,
} from '../../interactive/presentation/annotation';

const mapProjections = [
    { value: "mercator", label: "Mercator" },
    { value: "equalEarth", label: "Equal Earth" },
    { value: "orthographic", label: "Orthographic (Globe)" },
    { value: "stereographic", label: "Stereographic" },
    { value: "conicEqualArea", label: "Conic Equal Area" },
    { value: "conicEquidistant", label: "Conic Equidistant" },
    { value: "azimuthalEquidistant", label: "Azimuthal Equidistant" },
    { value: "mollweide", label: "Mollweide" },
] as const;

const projectionCenterPresets: { label: string; center: [number, number] }[] = [
    { label: "World (Atlantic)", center: [0, 0] },
    { label: "World (Pacific)", center: [150, 0] },
    { label: "China", center: [105, 35] },
    { label: "USA", center: [-98, 39] },
    { label: "Europe", center: [10, 50] },
    { label: "Japan", center: [138, 36] },
    { label: "India", center: [78, 22] },
    { label: "Brazil", center: [-52, -14] },
    { label: "Australia", center: [134, -25] },
    { label: "Russia", center: [100, 60] },
    { label: "Africa", center: [20, 0] },
    { label: "Middle East", center: [45, 28] },
    { label: "Southeast Asia", center: [115, 5] },
    { label: "South America", center: [-60, -15] },
    { label: "North America", center: [-100, 45] },
    { label: "UK", center: [-2, 54] },
    { label: "Germany", center: [10, 51] },
    { label: "France", center: [2, 47] },
    { label: "Korea", center: [128, 36] },
];

// ---------------------------------------------------------------------------
// Map scope (US vs World)
//
// Both map templates are generic: the geography (which base TopoJSON,
// projection and frame size) is chosen by the `region` property, defaulting to
// 'auto' — infer from the data, preferring the US whenever the data fits it.
// Scope *inference* (`MapScope`, `inferBubbleScope`, `inferChoroplethScope`,
// `semanticScope`, `pickMapScope`) is shared with the Plotly backend's Map /
// Choropleth templates via `chart-types/geo.ts`; only the base-layer geometry
// below (TopoJSON URLs/projections) is Vega-Lite-specific.
// ---------------------------------------------------------------------------

interface ScopeGeo {
    feature: string;
    projection: string;
    width: number;
    height: number;
    strokeWidth: number;
}

const SCOPE_GEO: Record<MapScope, ScopeGeo> = {
    us: {
        feature: "states",
        projection: "albersUsa",
        width: 500,
        height: 300,
        strokeWidth: 0.5,
    },
    world: {
        feature: "countries",
        projection: "equalEarth",
        width: 600,
        height: 350,
        strokeWidth: 0.4,
    },
};

/**
 * A built-in map's boundaries as Vega-Lite data: the host's topology inline (no fetch), the host's
 * URL, or the default URL (which Flint's renderers serve from the package).
 */
function basemapData(basemaps: MapBasemaps | undefined, part: BasemapPart, feature: string, detail: WorldDetail = 'coarse'): Record<string, unknown> {
    const source = basemapSource(basemaps, part, detail);
    const format = { type: 'topojson', feature };
    return typeof source === 'object' ? { values: source, format } : { url: source, format };
}

/** Name the boundaries a built-in map draws, for the host to credit; nothing for the host's own, unattributed. */
function attribute(spec: any, basemaps: MapBasemaps | undefined, part: BasemapPart): void {
    const attribution = basemapAttribution(basemaps, part);
    if (attribution) spec._attribution = attribution;
    else delete spec._attribution;
}

/** Whether boundaries drawn from this data carry the World Bank's disputed borders: the package's own build does, a host's own need not. */
const carriesDisputed = (data: Record<string, unknown> | undefined): boolean =>
    Boolean(data) && isPackageWorldBank((data!.values ?? data!.url) as any);

/** The part of `basemaps` a map of this scope draws. */
function scopePart(scope: MapScope, chartProperties: Record<string, any> | undefined, projected = false): BasemapPart {
    if (scope === 'us') return projected ? 'usAlbers' : 'us';
    return worldPart(chartProperties?.boundaries);
}

/** How fine a world frame is drawn: a region's coastlines read at the medium detail. */
const frameDetail = (frame: MapFrame): WorldDetail => (frame.regional ? 'medium' : 'coarse');

/** Would this spec render as a world map? (Drives world-only property gating.) */
function wouldBeWorld(ctx: OptionEvalContext): boolean {
    const choice = ctx.chartProperties?.region;
    if (choice === 'us') return false;
    if (choice === 'world') return true;
    const rows = ctx.data ?? [];
    const lonField = ctx.encodings?.longitude?.field;
    const latField = ctx.encodings?.latitude?.field;
    return inferBubbleScope(rows, lonField, latField) === 'world';
}

const regionProperty: ChartPropertyDef = {
    key: "region",
    label: "Region",
    type: "discrete",
    options: [
        { value: "auto", label: "Auto-detect" },
        { value: "us", label: "United States" },
        { value: "world", label: "World" },
    ],
    defaultValue: "auto",
};

/** Would this choropleth draw the world map? (Drives world-only property gating.) */
function wouldBeWorldChoropleth(ctx: OptionEvalContext): boolean {
    const idField = ctx.encodings?.id?.field;
    const semType = idField ? toTypeString(ctx.channelSemantics?.id?.semanticAnnotation?.semanticType) : '';
    return pickMapScope(ctx.chartProperties, semanticScope(semType), () => inferChoroplethScope(ctx.data ?? [], idField)) === 'world';
}

/** The world map's projection and centre, offered wherever the map is the world. */
function projectionProperties(applicable: (ctx: OptionEvalContext) => boolean): ChartPropertyDef[] {
    return [
        {
            key: "projection",
            label: "Projection",
            type: "discrete",
            options: [
                { value: "default", label: "Default" },
                ...mapProjections.map(p => ({ value: p.value, label: p.label })),
            ],
            defaultValue: "default",
            check: (ctx) => ({ applicable: applicable(ctx) }),
        },
        {
            key: "projectionCenter",
            label: "Center",
            type: "discrete",
            options: [
                { value: undefined, label: "Default" },
                ...projectionCenterPresets.map(p => ({
                    value: p.center,
                    label: `${p.label} [${p.center[0]}, ${p.center[1]}]`,
                })),
            ],
            defaultValue: undefined,
            check: (ctx) => ({ applicable: applicable(ctx) }),
        },
    ];
}

/** The world map's projection: the caller's, else the scope's own. */
function worldProjectionType(chartProperties: Record<string, any> | undefined): string {
    const type = chartProperties?.projection;
    return typeof type === 'string' && type !== 'default' ? type : SCOPE_GEO.world.projection;
}

/** The rotation that puts the caller's centre in the middle of a world map. */
function worldRotate(chartProperties: Record<string, any> | undefined): [number, number, number] | undefined {
    const center = chartProperties?.projectionCenter;
    if (!Array.isArray(center) || center.length < 2) return undefined;
    const [lon, lat] = [Number(center[0]), Number(center[1])];
    return Number.isFinite(lon) && Number.isFinite(lat) ? [-lon || 0, -lat || 0, 0] : undefined;
}

/** What a map frames, how it projects it, and the shape its plot takes. */
interface MapFrame {
    scope: MapScope;
    /** The one projection every layer shares. */
    projection: FrameProjection & { fit?: unknown };
    /** Width over height of the plot; unset where the geography is the host's own and its shape unknown, so the plot takes the room's. */
    aspect?: number;
    globe: boolean;
    /** The data sits in one region and the base map runs past the plot, so its shapes are clipped. */
    regional: boolean;
    /** The world map keeps Antarctica: the data names it, the frame is the whole base map, or the map is a globe. */
    antarctica: boolean;
    /** What the frame takes in: one country, several, their continent, or the world. */
    level?: FrameLevel;
}

/**
 * The world framed for countries' or points' boxes: the region they share, else the world's land
 * (Antarctica only where the data names it); the whole base map where the caller asks (`fit:
 * 'basemap'`); the whole sphere on a globe, turned to face the data unless the caller set a centre.
 */
function worldFrame(
    chartProperties: Record<string, any> | undefined, boxes: readonly GeoBox[], namesAntarctica: boolean,
    continents: readonly (Continent | undefined)[] = [],
): MapFrame {
    const type = worldProjectionType(chartProperties);
    if (isGlobeProjection(type)) {
        const centres = boxes.map(([w, s, e, n]): [number, number] => [w <= e ? (w + e) / 2 : ((w + e + 360) / 2 + 180) % 360 - 180, (s + n) / 2]);
        const rotate = worldRotate(chartProperties) ?? facingRotation(centres);
        return { scope: 'world', projection: { type, ...(rotate ? { rotate } : {}), fit: { type: 'Sphere' } }, aspect: 1, globe: true, regional: false, antarctica: true, level: 'world' };
    }
    const rotate = worldRotate(chartProperties);
    const whole = chartProperties?.fit === 'basemap';
    const fit = chartProperties?.fit === 'data' || chartProperties?.fit === 'continent' ? chartProperties.fit : 'auto';
    const framed = whole ? { box: WORLD_ALL, world: true, level: 'world' as const } : frameOf(boxes, namesAntarctica, { continents, fit });
    // A region is drawn in a projection of its own, centred on it, unless the caller chose one or a centre.
    const chosen = typeof chartProperties?.projection === 'string' && chartProperties.projection !== 'default';
    const projection: FrameProjection = !framed.world && !chosen && !rotate
        ? regionalProjection(framed.box)
        : { type, ...(rotate ? { rotate } : {}) };
    const box = framed.world ? framed.box : shapedFrame(framed.box, projection.type, projection.rotate, projection.parallels);
    return {
        scope: 'world',
        projection: { ...projection, fit: boxTarget(box) },
        aspect: projectedAspect(box, projection.type, projection.rotate, projection.parallels),
        globe: false,
        regional: !framed.world,
        antarctica: whole || namesAntarctica,
        level: framed.level,
    };
}

/** The least share of the canvas a map's plot keeps on each side, however much its furniture takes (the plan's 40% cap). */
const PLOT_FLOOR = 0.6;

/**
 * The plot a map is drawn in: its frame's shape, as large as the canvas holds — the base stretched
 * as far as the layout allows (the host's `canvasSize`) — once the title, keys and axes have the
 * room the plan measured for them.
 */
function framePlot(ctx: PlotPlanContext, frame: MapFrame): { width: number; height: number } {
    const stretch = ctx.assembleOptions?.maxStretch ?? 1.5;
    const canvas = {
        width: ctx.canvasSize.width * (ctx.assembleOptions?.maxStretchX ?? stretch),
        height: ctx.canvasSize.height * (ctx.assembleOptions?.maxStretchY ?? stretch),
    };
    const room = {
        width: Math.max(canvas.width * PLOT_FLOOR, canvas.width - (ctx.reserve?.width ?? 0)),
        height: Math.max(canvas.height * PLOT_FLOOR, canvas.height - (ctx.reserve?.height ?? 0)),
    };
    if (!frame.aspect) return { width: Math.round(room.width), height: Math.round(room.height) };
    return mapPlotSize(room, frame.aspect);
}

/** The point map's frame: its region (the caller's, else what the points span) and where in it the points sit. */
function pointFrame(ctx: PlotPlanContext): MapFrame {
    const lonField = ctx.channelSemantics.longitude?.field;
    const latField = ctx.channelSemantics.latitude?.field;
    const scope = bubbleScope(ctx, lonField, latField);
    const hostMap = typeof ctx.chartProperties?.baseMapUrl === 'string' && ctx.chartProperties.baseMapUrl !== '';
    if (scope === 'us') {
        return { scope, projection: { type: SCOPE_GEO.us.projection }, ...(hostMap ? {} : { aspect: US_FRAME_ASPECT }), globe: false, regional: false, antarctica: false };
    }
    const boxes: GeoBox[] = [];
    const continents: (Continent | undefined)[] = [];
    let namesAntarctica = false;
    if (lonField && latField) {
        for (const row of ctx.fullTable ?? ctx.table ?? []) {
            const lon = Number(row?.[lonField]);
            const lat = Number(row?.[latField]);
            if (!Number.isFinite(lon) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lon) > 180) continue;
            boxes.push([lon, lat, lon, lat]);
            continents.push(continentAt(lon, lat));
            if (lat < -60) namesAntarctica = true;
        }
    }
    const frame = worldFrame(ctx.chartProperties, boxes, namesAntarctica, continents);
    // The host's own base map is fitted as Vega-Lite fits it, to its shapes: their extent is not known here.
    if (hostMap && !frame.globe) {
        const { fit: _fit, ...projection } = frame.projection;
        return { ...frame, projection, aspect: undefined, regional: false };
    }
    return frame;
}

/** The world choropleth's frame: the countries its rows name. */
function choroplethWorldFrame(ctx: PlotPlanContext): MapFrame {
    const idField = ctx.channelSemantics.id?.field;
    const resolve = keyTypeResolver(ctx.chartProperties?.keyType) ?? resolveCountry;
    const boxes: GeoBox[] = [];
    const continents: (Continent | undefined)[] = [];
    let namesAntarctica = false;
    if (idField) {
        const seen = new Set<number>();
        for (const row of ctx.fullTable ?? ctx.table ?? []) {
            const id = resolve(row?.[idField]);
            if (id === undefined || seen.has(id)) continue;
            seen.add(id);
            if (id === ANTARCTICA_ID) namesAntarctica = true;
            const box = countryBox(id);
            if (!box) continue;
            boxes.push(box);
            continents.push(continentOf(id));
        }
    }
    return worldFrame(ctx.chartProperties, boxes, namesAntarctica, continents);
}

/** Keep Antarctica off a world base map whose frame leaves it out. */
const WITHOUT_ANTARCTICA = { filter: `datum.id !== ${ANTARCTICA_ID}` };

/** Draw a mark inside the plot only: a regional frame's base map runs past it. */
function clipped(mark: any): any {
    return typeof mark === 'string' ? { type: mark, clip: true } : { ...mark, clip: true };
}

/** How the world map frames its data — by its own judgement, the data's box, its continents, or the whole map — offered wherever the map is the world. */
function fitProperty(applicable: (ctx: OptionEvalContext) => boolean): ChartPropertyDef {
    return {
        key: 'fit',
        label: 'Frame',
        type: 'discrete',
        options: [
            { value: 'auto', label: 'Auto: the country, the region, or the continent the data covers' },
            { value: 'data', label: 'The data, padded' },
            { value: 'continent', label: 'The data’s continents' },
            { value: 'basemap', label: 'Whole map' },
        ],
        defaultValue: 'auto',
        check: (ctx) => ({ applicable: applicable(ctx) }),
    };
}

/**
 * Whose borders the world map draws: the World Bank's official boundaries (the default), which
 * follow the UN-system depiction — areas of non-determined legal status on their own, their borders
 * dotted — or Natural Earth's de facto ones. Offered wherever the map is the world.
 */
function boundariesProperty(applicable: (ctx: OptionEvalContext) => boolean): ChartPropertyDef {
    return {
        key: 'boundaries',
        label: 'Boundaries',
        type: 'discrete',
        options: [
            { value: 'world-bank', label: 'World Bank (official)' },
            { value: 'natural-earth', label: 'Natural Earth (de facto)' },
        ],
        defaultValue: 'world-bank',
        check: (ctx) => ({ applicable: applicable(ctx) }),
    };
}

/**
 * The colours a template draws the ground in until the post-process paints it in the map's style
 * (`./map-style`): the sea behind a globe, its rim, and land the data gives no value.
 */
const GLOBE_SEA = '#eef3f6';
const GLOBE_RIM = '#d4d4d1';
const NO_DATA = NO_DATA_PLACEHOLDER;

/**
 * Draw a world choropleth as a globe. The projection fits the whole sphere
 * rather than the countries in view, so the globe keeps its size as it turns.
 * Behind the countries go the sea, as a disc with a rim, and every country in
 * the no-data grey: a country the data does not name reads as land without a
 * value, not as a hole in the sphere. Both are structure, not data, and take
 * no part in interaction.
 */
function configureGlobe(spec: any): void {
    spec.projection = { ...(spec.projection ?? {}), fit: { type: 'Sphere' } };
    delete spec[MAP_ROLE];
    const { data, transform, mark, encoding } = spec;
    delete spec.data;
    delete spec.transform;
    delete spec.mark;
    delete spec.encoding;
    const strokeWidth = typeof mark === 'object' ? mark.strokeWidth : undefined;
    spec.layer = [
        withInteractionDecorative({
            [MAP_ROLE]: 'sea',
            data: { sphere: true },
            mark: { type: 'geoshape', fill: GLOBE_SEA, stroke: GLOBE_RIM, strokeWidth: 1 },
        }),
        withInteractionDecorative({
            [MAP_ROLE]: 'noData',
            data,
            mark: { type: 'geoshape', fill: NO_DATA, stroke: 'white', ...(strokeWidth != null ? { strokeWidth } : {}) },
        }),
        { [MAP_ROLE]: 'regions', data, ...(transform ? { transform } : {}), mark, encoding },
    ];
}

/**
 * Merge the compiler's resolved encodings onto a layer's point encoding, then
 * drop any channel left as an empty `{}` (a template placeholder the spec never
 * bound). Vega-Lite rejects an encoding entry with no field/datum/value, so the
 * cleanup keeps the emitted spec valid when only some channels are used.
 */
function applyPointEncodings(layer: any, resolved: Record<string, any>): void {
    if (!layer.encoding) layer.encoding = {};
    for (const [ch, enc] of Object.entries(resolved)) {
        layer.encoding[ch] = { ...(layer.encoding[ch] || {}), ...enc };
    }
    for (const ch of Object.keys(layer.encoding)) {
        const enc = layer.encoding[ch];
        if (enc && typeof enc === 'object' && Object.keys(enc).length === 0) {
            delete layer.encoding[ch];
        }
    }
}

/**
 * Runtime detail levels for a bubble map, read from two chart properties:
 * `levelField` names the column that tags each row with its level, and
 * `levels` lists the levels coarsest first (`{ value, enter?, exit? }`, the
 * spans in degrees of visible longitude at which a zoom enters and leaves each
 * finer level). The point layer keeps only the rows of the level the signal
 * names, so hidden rows cost nothing, and the projection keeps its fit to the
 * base map across a swap.
 */
function configureBubbleLevels(spec: any, chartProperties: any, rows: readonly any[]): void {
    const levelField = chartProperties?.levelField;
    const declared = chartProperties?.levels;
    if (typeof levelField !== 'string' || !Array.isArray(declared)) return;
    const levels: GeoLevel[] = declared.flatMap((level: any) => {
        const value = level && typeof level === 'object' ? level.value : level;
        if (typeof value !== 'string') return [];
        return [{
            name: value,
            ...(Number.isFinite(level?.enter) ? { enter: Number(level.enter) } : {}),
            ...(Number.isFinite(level?.exit) ? { exit: Number(level.exit) } : {}),
        }];
    });
    if (levels.length < 2) return;
    spec.params = [...(spec.params ?? []), { name: GEO_LEVEL_SIGNAL, value: levels[0].name }];
    const points = spec.layer[1];
    points.transform = [
        ...(points.transform ?? []),
        { filter: `datum[${JSON.stringify(levelField)}] === ${GEO_LEVEL_SIGNAL}` },
    ];
    // Vega-Lite reads a scale's domain from the filtered rows, so a nominal
    // colour would re-key on every swap. Pin it to the whole table's values.
    const color = points.encoding?.color;
    if (color?.field && (color.type ?? 'nominal') === 'nominal' && color.scale?.domain === undefined) {
        const domain = [...new Set(rows.map((row) => row[color.field]).filter((value) => value != null))];
        color.scale = { ...(color.scale ?? {}), domain };
    }
    spec._geoLevels = { signal: GEO_LEVEL_SIGNAL, levels };
}

/**
 * Draw a point map as a globe: the sea as a disc with a rim beneath the land, and every point on
 * the far side hidden. Orthographic clips the land's paths at the horizon but projects a point
 * behind it onto the front, mirrored, so each point's opacity reads the rotation and drops to
 * nothing past the rim. Opacity rather than a filter keeps the scales and keys whole as the globe
 * turns, and leaves the theme's own opacity where the point faces the viewer. The rotation is a
 * signal navigation turns; without navigation it holds the authored rotation.
 */
function configurePointGlobe(spec: any, frame: MapFrame, lonField: string | undefined, latField: string | undefined): void {
    spec.params = [...(spec.params ?? []), { name: GEO_ROTATE_SIGNAL, value: frame.projection.rotate ?? [0, 0, 0] }];
    const points = spec.layer[1];
    if (lonField && latField) {
        const front = frontFacingExpr(`datum[${JSON.stringify(lonField)}]`, `datum[${JSON.stringify(latField)}]`, GEO_ROTATE_SIGNAL);
        const behind = { test: `!(${front})`, value: 0 };
        const opacity = points.encoding?.opacity;
        const existing = opacity?.condition;
        points.encoding = {
            ...(points.encoding ?? {}),
            opacity: {
                ...(opacity ?? {}),
                condition: existing ? [behind, ...(Array.isArray(existing) ? existing : [existing])] : behind,
            },
        };
    }
    spec.layer.unshift(withInteractionDecorative({
        [MAP_ROLE]: 'sea',
        data: { sphere: true },
        mark: { type: 'geoshape', fill: GLOBE_SEA, stroke: GLOBE_RIM, strokeWidth: 1 },
    }));
}

/**
 * Point the base and circle layers of a bubble map at their frame: the region's base map (or the
 * host's own), one projection both layers share, and, for a regional frame, both clipped to the plot.
 */
function configureBubble(spec: any, frame: MapFrame, chartProperties: Record<string, any> | undefined, basemaps: MapBasemaps | undefined): void {
    const g = SCOPE_GEO[frame.scope];
    const baseMapUrl = chartProperties?.baseMapUrl;
    spec.width = g.width;
    spec.height = g.height;
    const base = spec.layer[0];
    base[MAP_ROLE] = 'land';
    if (typeof baseMapUrl === 'string' && baseMapUrl) {
        base.data = { url: baseMapUrl, format: { type: 'json', property: 'features' } };
    } else {
        const part = scopePart(frame.scope, chartProperties);
        base.data = basemapData(basemaps, part, g.feature, frameDetail(frame));
        attribute(spec, basemaps, part);
        if (frame.scope === 'world' && !frame.antarctica) base.transform = [WITHOUT_ANTARCTICA];
    }
    spec.projection = { ...frame.projection };
    if (frame.level) spec._mapFrame = { level: frame.level };
    if (frame.regional) spec[MAP_REGIONAL] = true;
    for (const layer of spec.layer) {
        delete layer.projection;
        if (frame.regional) layer.mark = clipped(layer.mark);
    }
}

export type ChoroplethLevel = 'state' | 'county' | 'auto';

/**
 * The US choropleth draws the us-atlas TopoJSON, which ships its states and
 * counties already projected with albersUsa into a 975 × 610 frame. The
 * chart then uses an identity projection: a pan or zoom only scales and
 * shifts points, instead of running the composite projection over every
 * county vertex twice per frame (about 14× cheaper). Navigation converts
 * between that frame and longitude/latitude through the projection the
 * atlas documents, so viewports, levels, and focus keep their meaning.
 */
const US_ATLAS = {
    // The atlas is already in screen orientation (y down), so no reflection.
    projection: { type: 'identity' },
    preProjection: { type: 'albersUsa', scale: 1300, translate: [487.5, 305] } as GeoPreProjection,
};

/**
 * The atlas keys its features by zero-padded FIPS strings ("06", "06037");
 * the resolver produces numbers. Read the key as a number before the join.
 */
const US_ATLAS_ID_TRANSFORM = { calculate: 'toNumber(datum.id)', as: 'id' };

/**
 * The US detail levels, coarsest first. A zoom enters the county level once
 * fewer than `enter` degrees of longitude are visible and leaves it again
 * only above `exit`.
 */
export const US_CHOROPLETH_LEVELS: readonly (GeoLevel & { feature: string; strokeWidth: number })[] = [
    { name: 'state', feature: 'states', strokeWidth: 0.5 },
    { name: 'county', feature: 'counties', strokeWidth: 0.2, enter: 20, exit: 28 },
];

/** Name of the shared join table that every level of a multi-level choropleth reads. */
const GEO_JOIN_DATASET = '__flint_geo_join';

/**
 * Point a choropleth's geoshape at the chosen base map. The US TopoJSON also
 * carries a `counties` object keyed by five-digit FIPS, so the county level
 * only swaps the feature set (and thins the borders); the world map has no
 * second level.
 *
 * The `auto` level draws one layer per US level, each gated behind the level
 * signal by a filter, so the hidden level holds no shapes. The navigation
 * runtime flips the signal as the zoom crosses a level's threshold; the chart
 * itself never rebuilds, and the projection extent carries the viewer's
 * place across the swap.
 */
function configureChoropleth(spec: any, scope: MapScope, level: ChoroplethLevel = 'state', basemaps?: MapBasemaps, chartProperties?: Record<string, any>, detail: WorldDetail = 'coarse'): void {
    const g = SCOPE_GEO[scope];
    spec.width = g.width;
    spec.height = g.height;
    const part = scopePart(scope, chartProperties, true);
    attribute(spec, basemaps, part);
    spec.projection = scope === 'us' ? { ...US_ATLAS.projection } : { type: g.projection };
    if (scope === 'us') spec._geoPreProjection = US_ATLAS.preProjection;
    if (scope === 'us' && level === 'auto') {
        delete spec.mark;
        spec.data = { name: GEO_JOIN_DATASET };
        spec.params = [{ name: GEO_LEVEL_SIGNAL, value: US_CHOROPLETH_LEVELS[0].name }];
        spec.layer = US_CHOROPLETH_LEVELS.map(({ name, feature, strokeWidth }) => ({
            data: basemapData(basemaps, part, feature),
            transform: [US_ATLAS_ID_TRANSFORM, { filter: geoLevelGate(GEO_LEVEL_SIGNAL, name) }],
            mark: { type: "geoshape", stroke: "white", strokeWidth },
            [MAP_ROLE]: 'regions',
        }));
        spec._geoLevels = {
            signal: GEO_LEVEL_SIGNAL,
            levels: US_CHOROPLETH_LEVELS.map(({ name, enter, exit }) => ({
                name,
                ...(enter !== undefined ? { enter } : {}),
                ...(exit !== undefined ? { exit } : {}),
            })),
        };
        return;
    }
    spec[MAP_ROLE] = 'regions';
    const county = scope === 'us' && level === 'county';
    spec.data = basemapData(basemaps, part, county ? 'counties' : g.feature, detail);
    if (scope === 'us') spec.transform = [US_ATLAS_ID_TRANSFORM];
    if (spec.mark && typeof spec.mark === 'object') spec.mark.strokeWidth = county ? 0.2 : g.strokeWidth;
}

/** What the choropleth's region key holds, so it is read in that namespace only. */
const keyTypeProperty: ChartPropertyDef = {
    key: "keyType",
    label: "Region key",
    type: "discrete",
    options: [
        { value: "auto", label: "Auto-detect" },
        { value: "iso3", label: "ISO 3166-1 alpha-3 (USA)" },
        { value: "iso2", label: "ISO 3166-1 alpha-2 (US)" },
        { value: "iso-numeric", label: "ISO 3166-1 numeric (840)" },
        { value: "country-name", label: "Country name" },
        { value: "us-state", label: "US state name or USPS code" },
        { value: "fips", label: "US FIPS code (state or county)" },
    ] satisfies { value: typeof MAP_KEY_TYPES[number]; label: string }[],
    defaultValue: "auto",
};

/** Choropleth granularity within the US base map; the world map has countries only. */
const levelProperty: ChartPropertyDef = {
    key: "level",
    label: "Level",
    type: "discrete",
    options: [
        { value: "state", label: "States" },
        { value: "county", label: "Counties (FIPS ids)" },
        { value: "auto", label: "Zoom: states, then counties" },
    ],
    defaultValue: "state",
    check: (ctx) => ({ applicable: ctx.chartProperties?.region !== 'world' }),
};

/** The region a bubble map shows: the caller's choice, else what the coordinates span. */
function bubbleScope(ctx: PlotPlanContext, lonField: string | undefined, latField: string | undefined): MapScope {
    const rows = ctx.fullTable ?? ctx.table ?? [];
    return pickMapScope(ctx.chartProperties, undefined, () => inferBubbleScope(rows, lonField, latField));
}

/** The region a choropleth shows: the caller's choice, else the id field's semantic type, else its values. */
function choroplethScope(ctx: PlotPlanContext, idField: string | undefined): MapScope {
    const rows = ctx.fullTable ?? ctx.table ?? [];
    const semType = idField ? toTypeString(ctx.semanticTypes?.[idField]) : '';
    return pickMapScope(ctx.chartProperties, semanticScope(semType), () => inferChoroplethScope(rows, idField));
}

function drawAtPlannedSize(spec: any, ctx: InstantiateContext): void {
    if (!ctx.plot) return;
    spec.width = ctx.plot.width;
    spec.height = ctx.plot.height;
}

/** The graticule's line colour until the ground is painted. */
const GRATICULE = '#e8ecef';
/** Disputed borders until the ground is painted: a grey that reads on any fill. */
const DISPUTED = '#888888';

/**
 * Lines of latitude and longitude every 30°, under the land and above a globe's sea, where the
 * caller asks (`chartProperties.graticule`). A single-view map becomes layered to hold them.
 * Structure, not data: no colour or tooltip reaches them from the regions.
 */
function addGraticule(spec: any): void {
    asLayered(spec);
    const graticule = withInteractionDecorative({
        [MAP_ROLE]: 'graticule',
        data: { graticule: { step: [30, 30] } },
        // A graticule runs round the whole sphere; only the part inside the plot is drawn.
        mark: { type: 'geoshape', filled: false, stroke: GRATICULE, strokeWidth: 0.5, clip: true },
        encoding: { color: { value: GRATICULE }, tooltip: null },
    });
    const seaAt = spec.layer.findIndex((layer: any) => layer?.data?.sphere);
    spec.layer.splice(seaAt + 1, 0, graticule);
}

/** A single-view map as a layered one, its view the first layer, so structure can be drawn round it. */
function asLayered(spec: any): void {
    if (Array.isArray(spec.layer)) return;
    const { data, transform, mark, encoding } = spec;
    const role = spec[MAP_ROLE];
    delete spec.data;
    delete spec.transform;
    delete spec.mark;
    delete spec.encoding;
    delete spec[MAP_ROLE];
    spec.layer = [{ ...(role ? { [MAP_ROLE]: role } : {}), data, ...(transform ? { transform } : {}), mark, ...(encoding ? { encoding } : {}) }];
}

/**
 * Dot the borders the World Bank's areas of non-determined legal status share — Jammu and Kashmir,
 * Aksai Chin, Western Sahara, Abyei, … — over the regions, as the World Bank draws them. The areas
 * are regions of their own, which data keyed to a country does not colour. Structure, not data.
 */
function addDisputedBorders(spec: any, regions: Record<string, unknown>, clip: boolean): void {
    asLayered(spec);
    const disputed = withInteractionDecorative({
        [MAP_ROLE]: 'disputed',
        data: { ...regions, format: { type: 'topojson', feature: DISPUTED_FEATURE } },
        mark: { type: 'geoshape', filled: false, stroke: DISPUTED, strokeWidth: 1.1, strokeDash: [0.5, 2.5], strokeCap: 'round', ...(clip ? { clip: true } : {}) },
        encoding: { color: { value: DISPUTED }, tooltip: null },
    });
    // Over the land and the regions, beneath the points.
    const last = spec.layer.reduce((at: number, layer: any, i: number) => (['land', 'regions', 'noData'].includes(layer?.[MAP_ROLE]) ? i : at), -1);
    spec.layer.splice(last + 1, 0, disputed);
}

/** Whether a spec draws a globe: a layer holds the sphere. */
function drawsGlobe(spec: any): boolean {
    let found = false;
    const visit = (node: any) => {
        if (!node || typeof node !== 'object' || found) return;
        if (node.data?.sphere) found = true;
        for (const key of ['layer', 'vconcat', 'hconcat', 'concat']) if (Array.isArray(node[key])) node[key].forEach(visit);
    };
    visit(spec);
    return found;
}

/** The rows a choropleth joined, one per region, kept for classing its colour after the theme. */
const JOINED_ROWS = new WeakMap<object, any[]>();

/** Paint a map's ground in its style, after the theme set the page it stands on. */
function styleMap(spec: any, ctx: InstantiateContext): void {
    const properties = ctx.chartProperties ?? {};
    const width = typeof properties.borderWidth === 'number' ? properties.borderWidth : undefined;
    paintMapGround(spec, groundFor(properties.mapStyle, spec), { globe: drawsGlobe(spec), ...(width !== undefined ? { borderWidth: width } : {}) });
}

/** How a map's ground is painted and whether lines of latitude and longitude are drawn: offered on every map. */
const groundProperties: ChartPropertyDef[] = [
    {
        key: 'mapStyle',
        label: 'Map style',
        type: 'discrete',
        options: [
            { value: 'auto', label: 'From the theme' },
            { value: 'light', label: 'Light' },
            { value: 'muted', label: 'Muted' },
            { value: 'atlas', label: 'Atlas (blue water, paper land)' },
            { value: 'dark', label: 'Dark' },
            { value: 'minimal', label: 'Minimal (outlines)' },
        ] satisfies { value: typeof MAP_STYLES[number]; label: string }[],
        defaultValue: 'auto',
    },
    { key: 'graticule', label: 'Graticule', type: 'binary', defaultValue: false },
    { key: 'borderWidth', label: 'Border width', type: 'continuous', min: 0, max: 2, step: 0.1 },
];

/** How a choropleth classes its colour, offered where the colour is a quantity. */
const classProperties: ChartPropertyDef[] = [
    {
        key: 'classes',
        label: 'Classes',
        type: 'discrete',
        options: [
            { value: 'auto', label: 'Auto (quantiles; round steps when diverging)' },
            { value: 'quantile', label: 'Quantiles (equal counts)' },
            { value: 'equal', label: 'Equal round steps' },
            { value: 'jenks', label: 'Natural breaks (Jenks)' },
            { value: 'continuous', label: 'Continuous' },
        ] satisfies { value: typeof CLASS_METHODS[number]; label: string }[],
        defaultValue: 'auto',
        check: (ctx) => ({ applicable: Boolean(ctx.encodings?.color?.field) }),
    },
    {
        key: 'classCount', label: 'Class count', type: 'continuous', min: 3, max: 9, step: 1, defaultValue: 5,
        check: (ctx) => ({ applicable: Boolean(ctx.encodings?.color?.field) && ctx.chartProperties?.classes !== 'continuous' }),
    },
];

export const mapDef: ChartTemplateDef = {
    chart: "Map",
    fillsCanvas: true,
    template: {
        layer: [
            {
                mark: { type: "geoshape", fill: "lightgray", stroke: "white" },
            },
            {
                mark: "circle",
                encoding: { longitude: {}, latitude: {}, size: {}, color: {}, opacity: {} },
            },
        ],
    },
    channels: ["longitude", "latitude", "color", "size", "opacity"],
    interactionSupport: {
        elements: true,
        region: ['cartesian'],
        navigation: { geo: true },
        legend: true,
    },
    markCognitiveChannel: 'position',
    semanticInteractions: ({ resolvedEncodings }) => {
        const seriesField = firstDiscreteEncodingField(resolvedEncodings, ['color']);
        const colorField = resolvedEncodings.color?.field;
        const sizeField = resolvedEncodings.size?.field;
        return {
            fields: fieldsFromEncodingChannels(resolvedEncodings, ['longitude', 'latitude', 'color', 'size', 'opacity']),
            seriesField,
            legendFields: colorField || sizeField
                ? { ...(colorField ? { color: colorField } : {}), ...(sizeField ? { size: sizeField } : {}) }
                : undefined,
            selectableMarks: ['circle'],
            renderHoverStyles: {
                symbol: { stroke: MUTED_HOVER_STROKE, strokeWidth: 2 },
            },
            resolve: (event, context) => {
                const legendField = event.legend?.field ?? seriesField;
                const hits = event.role === 'legend-item' && legendField
                    ? legendMatchedHits(event, context, legendField)
                    : event.hits;
                return targetFromHits(hits, context.keyField, { kind: 'mark', role: 'point' });
            },
            presentUpdate: presentAnnotationUpdate(() => annotationCandidates(
                'center', 'top', 'right', 'bottom', 'left',
            )),
        };
    },
    planPlot: (ctx) => framePlot(ctx, pointFrame(ctx)),
    credit: (ctx) => {
        if (typeof ctx.chartProperties?.baseMapUrl === 'string' && ctx.chartProperties.baseMapUrl) return undefined;
        const scope = bubbleScope(ctx, ctx.channelSemantics.longitude?.field, ctx.channelSemantics.latitude?.field);
        return basemapCredit(ctx.assembleOptions?.basemaps, scopePart(scope, ctx.chartProperties));
    },
    instantiate: (spec, ctx) => {
        const rows = ctx.fullTable ?? ctx.table ?? [];
        // `baseMapUrl` swaps the region's base map for a GeoJSON
        // FeatureCollection of the host's own (a country's provinces, say);
        // the projection then fits to it.
        const frame = pointFrame(ctx);
        configureBubble(spec, frame, ctx.chartProperties, ctx.assembleOptions?.basemaps);
        drawAtPlannedSize(spec, ctx);
        applyPointEncodings(spec.layer[1], ctx.resolvedEncodings);
        configureBubbleLevels(spec, ctx.chartProperties, rows);
        if (frame.globe) configurePointGlobe(spec, frame, ctx.resolvedEncodings.longitude?.field, ctx.resolvedEncodings.latitude?.field);
        if (ctx.chartProperties?.graticule === true) addGraticule(spec);
        const base = spec.layer.find((layer: any) => layer?.[MAP_ROLE] === 'land');
        if (scopePart(frame.scope, ctx.chartProperties) === 'worldBank' && carriesDisputed(base?.data) && !ctx.chartProperties?.baseMapUrl) {
            addDisputedBorders(spec, base.data, frame.regional);
        }
    },
    postProcess: (spec, ctx) => styleMap(spec, ctx),
    properties: [
        regionProperty, boundariesProperty(wouldBeWorld), ...projectionProperties(wouldBeWorld), fitProperty(wouldBeWorld), ...groundProperties,
    ] as ChartPropertyDef[],
};

/** What a built-in map's join reports against: the map's name, and which features it draws. */
interface JoinReport {
    map: string;
    drawn?: (id: number) => boolean;
    /** Where another map can be chosen, for a region this one leaves out. */
    otherMaps?: string;
}

/** Aggregations a region's rows can combine by, and what each makes of the values. */
const COMBINE: Record<string, (values: number[]) => number> = {
    sum: (values) => values.reduce((total, value) => total + value, 0),
    mean: (values) => values.reduce((total, value) => total + value, 0) / values.length,
    min: (values) => Math.min(...values),
    max: (values) => Math.max(...values),
};
COMBINE.average = COMBINE.mean;

/** A few values, quoted, for a message: at most `limit`, with how many more there are. */
function examples(values: readonly unknown[], limit = 5): string {
    const shown = values.slice(0, limit).map((value) => JSON.stringify(String(value))).join(', ');
    return values.length > limit ? `${shown} and ${values.length - limit} more` : shown;
}

/**
 * Join the user's rows into a choropleth's geoshape.
 *
 * A choropleth fills each region of a base TopoJSON map by a data value, so the
 * geography is the *primary* mark and the user's rows are joined *into* it. We
 * keep the TopoJSON as the spec's base `data` (set by `configureChoropleth`)
 * and inline the user rows into a `lookup` transform keyed on each geoshape
 * feature's numeric `id`.
 *
 * The `id` channel carries the region key, but real datasets rarely hold the
 * raw TopoJSON ids (FIPS / ISO-numeric). They hold *names* ("California",
 * "United States") or short codes ("CA", "US", "USA"). So we resolve every
 * row's `id` value through a gazetteer (`resolver`) into the numeric feature
 * id, stash it on a synthetic `__geo_id` field, and join on that. A value that
 * is already the numeric id passes straight through.
 *
 * A region takes one value. Rows that name the same region combine before the
 * join, by the encoding's own aggregate, else by what the measure is: a total
 * sums, a rate or a share averages; a category keeps its first row. On a
 * built-in map (`report`), the keys that name no region, groups of countries
 * ("World", "OECD") and a total coloured by area are reported as warnings.
 *
 * Channels: `id` = region name/code/id, `color` = the measure, `detail`
 * (optional) = an explicit display name for tooltips (defaults to the `id`
 * field so the user always sees a readable label).
 */
function buildChoroplethJoin(
    spec: any, ctx: any, resolver: (value: unknown) => unknown, featureKey = 'id', report?: JoinReport,
): void {
    const idField: string | undefined = ctx.resolvedEncodings.id?.field;
    const colorEnc = ctx.resolvedEncodings.color ? { ...ctx.resolvedEncodings.color } : undefined;
    const valueField: string | undefined = colorEnc?.field;
    const labelField: string | undefined = ctx.resolvedEncodings.detail?.field ?? idField;
    const semanticType = valueField
        ? toTypeString(ctx.semanticTypes?.[valueField] ?? ctx.channelSemantics?.color?.semanticAnnotation?.semanticType)
        : '';
    // A region is one shape: the encoding's aggregate is the rows' to combine by, not Vega-Lite's.
    // The table arrives already aggregated per key, so two keys for one region (France, FRA)
    // recombine as the author's aggregate does; counts add up.
    const declared = ctx.encodings?.color?.aggregate ?? colorEnc?.aggregate;
    const stated = declared === 'count' ? 'sum' : typeof declared === 'string' && COMBINE[declared] ? declared : undefined;
    if (colorEnc && typeof colorEnc.aggregate === 'string' && COMBINE[colorEnc.aggregate]) delete colorEnc.aggregate;
    const combineBy = colorEnc?.type === 'quantitative'
        ? stated ?? (semanticType ? resolveAggregationDefault(semanticType) : undefined)
        : undefined;

    const rows: any[] = ctx.fullTable ?? ctx.table ?? [];
    const warn = (code: string, message: string, channel: string, field: string | undefined) => {
        spec._warnings = [...(spec._warnings ?? []), { severity: 'warning', code, message, channel, ...(field ? { field } : {}) }];
    };

    if (idField) {
        const regions = new Map<unknown, any[]>();
        const unmatched = new Set<string>();
        const aggregates = new Set<string>();
        const undrawn = new Set<string>();
        for (const row of rows) {
            const key = row?.[idField];
            if (key == null || key === '') continue;
            const id = resolver(key);
            if (id === undefined) {
                (isAggregateRegion(key) ? aggregates : unmatched).add(String(key));
                continue;
            }
            if (report?.drawn && typeof id === 'number' && !report.drawn(id)) undrawn.add(String(key));
            const group = regions.get(id);
            if (group) group.push(row);
            else regions.set(id, [row]);
        }
        let combined = 0;
        const joined: any[] = [...regions].map(([id, group]) => {
            const first = { ...group[0], __geo_id: id };
            if (group.length === 1) return first;
            combined++;
            if (valueField && combineBy && COMBINE[combineBy]) {
                const values = group.map((row) => Number(row?.[valueField])).filter(Number.isFinite);
                first[valueField] = values.length ? COMBINE[combineBy](values) : null;
            }
            return first;
        });

        if (report) {
            if (unmatched.size > 0) {
                warn('map-unmatched-keys',
                    `${unmatched.size} ${idField} value${unmatched.size === 1 ? '' : 's'} name${unmatched.size === 1 ? 's' : ''} no region on the ${report.map}: ${examples([...unmatched])}. `
                    + `Check the spelling, or say what the key holds with chartProperties.keyType (${MAP_KEY_TYPES.filter((type) => type !== 'auto').join(', ')}).`,
                    'id', idField);
            }
            if (aggregates.size > 0) {
                warn('map-aggregate-rows',
                    `${examples([...aggregates])} ${aggregates.size === 1 ? 'is a group' : 'are groups'} of regions, not one: left off the map. Filter such rows out before charting.`,
                    'id', idField);
            }
            if (undrawn.size > 0) {
                warn('map-regions-not-drawn',
                    `${examples([...undrawn])} ${undrawn.size === 1 ? 'is' : 'are'} not in the ${report.map}.`
                    + (report.otherMaps ? ` Consider using another map via ${report.otherMaps}.` : ''),
                    'id', idField);
            }
            if (combined > 0 && valueField) {
                warn('map-rows-combined',
                    `${combined} region${combined === 1 ? ' has' : 's have'} more than one row; ${combineBy && COMBINE[combineBy]
                        ? `their ${valueField} is ${combineBy === 'sum' ? 'summed' : combineBy === 'min' || combineBy === 'max' ? `taken at its ${combineBy}` : 'averaged'}`
                        : 'the first row is shown'}. Aggregate the rows to one per region to choose how.`,
                    'color', valueField);
            }
            if (semanticType && getRegistryEntry(semanticType).aggRole === 'additive' && colorEnc?.type === 'quantitative') {
                warn('map-total-on-choropleth',
                    `${valueField} is a total (${semanticType}): coloured by area, large regions dominate whatever they hold. Map a rate or a share (per person, per km²), or show totals as sized bubbles.`,
                    'color', valueField);
            }
        }

        JOINED_ROWS.set(ctx, joined);
        const lookupFields = [idField, valueField, labelField].filter(Boolean) as string[];
        if (Array.isArray(spec.layer)) {
            // Every level joins the same table: state ids and county FIPS
            // codes share one numeric id space, so each layer matches its own.
            spec.datasets = { ...(spec.datasets ?? {}), [GEO_JOIN_DATASET]: joined };
            for (const layer of spec.layer) {
                layer.transform = [
                    ...(layer.transform ?? []),
                    {
                        lookup: featureKey,
                        from: { data: { name: GEO_JOIN_DATASET }, key: '__geo_id', fields: lookupFields },
                    },
                ];
            }
        } else {
            spec.transform = [
                ...(spec.transform ?? []),
                {
                    lookup: featureKey,
                    from: { data: { values: joined }, key: '__geo_id', fields: lookupFields },
                },
            ];
        }
    }

    spec.encoding = {};
    if (colorEnc) {
        spec.encoding.color = { ...colorEnc };
    }

    const tooltip: any[] = [];
    if (labelField) tooltip.push({ field: labelField, type: 'nominal' });
    if (valueField) tooltip.push({ field: valueField, type: colorEnc?.type ?? 'quantitative' });
    if (tooltip.length) spec.encoding.tooltip = tooltip;
}

/** One level of a choropleth over the caller's own geography: its regions, and the zoom it shows at. */
interface CustomChoroplethLevel extends GeoLevel {
    url: string;
    /** The TopoJSON object holding the level's regions; unset, `url` is a GeoJSON FeatureCollection. */
    feature?: string;
}

/**
 * The caller's own geography, read from two chart properties: `levels`, each
 * `{ value, url, feature?, enter?, exit? }` coarsest first (one level draws a
 * plain choropleth), and `baseMapUrl`, a GeoJSON FeatureCollection drawn
 * beneath them as land without data. Rows join a level's regions by the id
 * channel against `featureKey` (default the feature's `id`), as given: no
 * gazetteer is consulted, so the keys are the caller's own.
 */
function customChoroplethLevels(chartProperties: Record<string, any> | undefined): CustomChoroplethLevel[] | undefined {
    const declared = chartProperties?.levels;
    if (!Array.isArray(declared) || declared.length === 0) return undefined;
    const levels = declared.flatMap((level: any): CustomChoroplethLevel[] => {
        if (!level || typeof level !== 'object' || typeof level.value !== 'string' || typeof level.url !== 'string') return [];
        return [{
            name: level.value,
            url: level.url,
            ...(typeof level.feature === 'string' ? { feature: level.feature } : {}),
            ...(typeof level.enter === 'number' ? { enter: level.enter } : {}),
            ...(typeof level.exit === 'number' ? { exit: level.exit } : {}),
        }];
    });
    return levels.length === declared.length ? levels : undefined;
}


/**
 * Draw a choropleth over the caller's geography. Each level is its own layer,
 * gated behind the level signal like the US map's states and counties; with
 * one level there is nothing to gate. The projection defaults to Mercator,
 * which reads a single country without the bend of a world projection.
 */
function configureCustomChoropleth(spec: any, levels: CustomChoroplethLevel[], chartProperties: Record<string, any> | undefined): void {
    const type = chartProperties?.projection;
    spec.projection = { type: typeof type === 'string' && type !== 'default' ? type : 'mercator' };
    const mark = typeof spec.mark === 'object' ? spec.mark : { type: 'geoshape' };
    delete spec.mark;
    delete spec.data;
    const gated = levels.length > 1;
    if (gated) {
        spec.params = [{ name: GEO_LEVEL_SIGNAL, value: levels[0].name }];
        spec._geoLevels = {
            signal: GEO_LEVEL_SIGNAL,
            levels: levels.map(({ name, enter, exit }) => ({
                name,
                ...(enter !== undefined ? { enter } : {}),
                ...(exit !== undefined ? { exit } : {}),
            })),
        };
    }
    spec.data = { name: GEO_JOIN_DATASET };
    spec.layer = levels.map((level, index) => ({
        data: level.feature
            ? { url: level.url, format: { type: 'topojson', feature: level.feature } }
            : { url: level.url, format: { type: 'json', property: 'features' } },
        ...(gated ? { transform: [{ filter: geoLevelGate(GEO_LEVEL_SIGNAL, level.name) }] } : {}),
        // Finer levels draw thinner borders, so a county map is not all edges.
        mark: { ...mark, type: 'geoshape', stroke: 'white', strokeWidth: Math.max(0.15, 0.6 / (index + 1)) },
        [MAP_ROLE]: 'regions',
    }));
}

/** Put the land without data beneath the levels: a region the rows do not name reads as land, not as a hole. */
function addCustomBaseMap(spec: any, url: unknown): void {
    if (typeof url !== 'string' || !url || !Array.isArray(spec.layer)) return;
    spec.layer.unshift(withInteractionDecorative({
        [MAP_ROLE]: 'noData',
        data: { url, format: { type: 'json', property: 'features' } },
        mark: { type: 'geoshape', stroke: 'white', strokeWidth: 0.5 },
        // The levels' colour and tooltip sit on the spec and reach every layer; the land states its own.
        encoding: { color: { value: NO_DATA }, tooltip: null },
    }));
}

/**
 * Keep every region on the map. A region the rows do not name, or name without a value, has no
 * colour to take; Vega-Lite would drop its shape, and with it the outline of the country. It is
 * drawn instead, in the no-data fill, under the same mark — one shape per region, so a county map
 * draws no more than before.
 */
function keepRegionsWithoutData(spec: any): void {
    const color = spec.encoding?.color;
    if (!color?.field) return;
    const value = `datum[${JSON.stringify(color.field)}]`;
    const test = color.type === 'quantitative' ? `!isValid(${value}) || !isFinite(+${value})` : `!isValid(${value})`;
    const noData = { test, value: NO_DATA };
    const existing = color.condition;
    spec.encoding.color = { ...color, condition: existing ? [noData, ...(Array.isArray(existing) ? existing : [existing])] : noData };
    const keep = (node: any) => {
        if (node?.[INTERACTION_PROVENANCE]?.role === 'decorative') return;
        const mark = node?.mark;
        if (mark && (mark === 'geoshape' || mark.type === 'geoshape')) node.mark = { ...(typeof mark === 'string' ? { type: mark } : mark), invalid: null };
    };
    keep(spec);
    for (const layer of spec.layer ?? []) keep(layer);
}

export const choroplethDef: ChartTemplateDef = {
    chart: "Choropleth",
    fillsCanvas: true,
    template: {
        mark: { type: "geoshape", stroke: "white", strokeWidth: 0.5 },
        encoding: {},
    },
    channels: ["id", "color", "detail"],
    interactionSupport: {
        elements: true,
        region: ['cartesian'],
        navigation: { geo: true },
        legend: true,
    },
    markCognitiveChannel: 'color',
    semanticInteractions: ({ resolvedEncodings }) => {
        const idField = resolvedEncodings.id?.field;
        const colorField = resolvedEncodings.color?.field;
        return {
            fields: fieldsFromEncodingChannels(resolvedEncodings, ['id', 'color', 'detail']),
            categoryField: idField,
            selectableMarks: ['geoshape'],
            renderHoverStyles: { shape: { stroke: MUTED_HOVER_STROKE, strokeWidth: 2 } },
            resolve: (event, context) => {
                const hits = event.role === 'legend-item' && colorField
                    ? legendMatchedHits(event, context, colorField)
                    : event.hits;
                return targetFromHits(hits, context.keyField, {
                    kind: 'region',
                    role: event.role === 'legend-item' ? 'legend-item' : 'geographic-region',
                });
            },
            presentUpdate: presentAnnotationUpdate(
                () => annotationCandidates('center'),
                categoryValueAnnotationText(idField, colorField),
            ),
            legendFields: colorField ? { color: colorField } : undefined,
        };
    },
    credit: (ctx) => {
        if (customChoroplethLevels(ctx.chartProperties)) return undefined;
        const scope = choroplethScope(ctx, ctx.channelSemantics.id?.field);
        return basemapCredit(ctx.assembleOptions?.basemaps, scopePart(scope, ctx.chartProperties, true));
    },
    planPlot: (ctx) => {
        if (customChoroplethLevels(ctx.chartProperties)) return framePlot(ctx, { scope: 'world', projection: { type: 'mercator' }, globe: false, regional: false, antarctica: true });
        const scope = choroplethScope(ctx, ctx.channelSemantics.id?.field);
        return scope === 'world'
            ? framePlot(ctx, choroplethWorldFrame(ctx))
            : framePlot(ctx, { scope, projection: US_ATLAS.projection, aspect: US_FRAME_ASPECT, globe: false, regional: false, antarctica: false });
    },
    instantiate: (spec, ctx) => {
        const idField = ctx.resolvedEncodings.id?.field;
        const custom = customChoroplethLevels(ctx.chartProperties);
        if (custom) {
            configureCustomChoropleth(spec, custom, ctx.chartProperties);
            drawAtPlannedSize(spec, ctx);
            const featureKey = typeof ctx.chartProperties?.featureKey === 'string' ? ctx.chartProperties.featureKey : 'id';
            buildChoroplethJoin(spec, ctx, (value) => (value == null ? undefined : String(value)), featureKey);
            addCustomBaseMap(spec, ctx.chartProperties?.baseMapUrl);
            keepRegionsWithoutData(spec);
            if (ctx.chartProperties?.graticule === true) addGraticule(spec);
            return;
        }
        const scope = choroplethScope(ctx, idField);

        const requestedLevel = ctx.chartProperties?.level;
        const level: ChoroplethLevel = requestedLevel === 'county' || requestedLevel === 'auto'
            ? requestedLevel
            : 'state';
        const frame = scope === 'world' ? choroplethWorldFrame(ctx) : undefined;
        configureChoropleth(spec, scope, level, ctx.assembleOptions?.basemaps, ctx.chartProperties, frame ? frameDetail(frame) : 'coarse');
        const regions = spec.data;
        drawAtPlannedSize(spec, ctx);
        // County rows carry numeric FIPS ids, which the state resolver passes through.
        const resolver: GeoResolver = keyTypeResolver(ctx.chartProperties?.keyType) ?? (scope === 'us' ? resolveUsState : resolveCountry);
        const boundaries = worldBoundaries(ctx.chartProperties);
        // The host's own boundaries: which regions they draw is theirs to know, not this package's.
        const known = knownBoundaries(ctx.assembleOptions?.basemaps, worldPart(boundaries));
        buildChoroplethJoin(spec, ctx, resolver, 'id', scope === 'us'
            ? { map: 'US map' }
            : !known
                ? { map: 'given map' }
                : {
                    map: boundaries === 'world-bank' ? 'World Bank map' : 'Natural Earth map',
                    drawn: (id) => isWorldFeature(id, boundaries),
                    otherMaps: 'chartProperties.boundaries',
                });
        if (frame) {
            spec.projection = { ...frame.projection };
            if (!frame.antarctica) spec.transform = [WITHOUT_ANTARCTICA, ...(spec.transform ?? [])];
            if (frame.regional && spec.mark) spec.mark = clipped(spec.mark);
            if (frame.regional) spec[MAP_REGIONAL] = true;
            if (frame.level) spec._mapFrame = { level: frame.level };
            if (frame.globe) configureGlobe(spec);
        }
        // A globe draws its land without data as a layer of its own, beneath the countries.
        keepRegionsWithoutData(spec);
        if (ctx.chartProperties?.graticule === true) addGraticule(spec);
        if (frame && boundaries === 'world-bank' && carriesDisputed(regions)) addDisputedBorders(spec, regions, frame.regional);
    },
    postProcess: (spec, ctx) => {
        styleMap(spec, ctx);
        classChoropleth(spec, JOINED_ROWS.get(ctx) ?? ctx.fullTable ?? ctx.table ?? [], ctx.chartProperties?.classes, ctx.chartProperties?.classCount);
    },
    properties: [
        regionProperty, keyTypeProperty, levelProperty, boundariesProperty(wouldBeWorldChoropleth),
        ...projectionProperties(wouldBeWorldChoropleth), fitProperty(wouldBeWorldChoropleth),
        ...classProperties, ...groundProperties,
    ] as ChartPropertyDef[],
};
