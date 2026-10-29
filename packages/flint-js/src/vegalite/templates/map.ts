// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ChartTemplateDef, ChartPropertyDef, InstantiateContext, OptionEvalContext, PlotPlanContext } from '../../core/types';
import {
    resolveUsState, resolveCountry, GeoResolver,
    type MapScope, inferBubbleScope, inferChoroplethScope, semanticScope, pickMapScope,
} from '../../chart-types/geo';
import { toTypeString } from '../../core/field-semantics';
import {
    GEO_LEVEL_SIGNAL,
    geoLevelGate,
    isGlobeProjection,
    type GeoLevel,
    type GeoPreProjection,
} from '../interactions/geo-levels';
import { withInteractionDecorative } from '../interaction-provenance';
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
    url: string;
    feature: string;
    projection: string;
    width: number;
    height: number;
    strokeWidth: number;
}

const SCOPE_GEO: Record<MapScope, ScopeGeo> = {
    us: {
        url: "https://vega.github.io/vega-lite/data/us-10m.json",
        feature: "states",
        projection: "albersUsa",
        width: 500,
        height: 300,
        strokeWidth: 0.5,
    },
    world: {
        url: "https://vega.github.io/vega-lite/data/world-110m.json",
        feature: "countries",
        projection: "equalEarth",
        width: 600,
        height: 350,
        strokeWidth: 0.4,
    },
};

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

/** Point a world map's projection where the caller asked: its type, and the place at its centre. */
function applyWorldProjection(projection: any, chartProperties: Record<string, any> | undefined): void {
    if (!projection || !chartProperties) return;
    const type = chartProperties.projection;
    const center = chartProperties.projectionCenter;
    if (typeof type === 'string' && type !== 'default') projection.type = type;
    if (Array.isArray(center) && center.length >= 2 && projection.type !== 'albersUsa') {
        projection.rotate = [-Number(center[0]), -Number(center[1]), 0];
    }
}

/** The size a globe is drawn at: a disc wants a square plot. */
const GLOBE_SIZE = 400;
/** The sea behind a globe, its rim, and the land a country without a value stands on. */
const GLOBE_SEA = '#eef2f5';
const GLOBE_RIM = '#c5ccd3';
const GLOBE_NO_DATA = '#d9d9d9';

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
    const { data, transform, mark, encoding } = spec;
    delete spec.data;
    delete spec.transform;
    delete spec.mark;
    delete spec.encoding;
    const strokeWidth = typeof mark === 'object' ? mark.strokeWidth : undefined;
    spec.layer = [
        withInteractionDecorative({
            data: { sphere: true },
            mark: { type: 'geoshape', fill: GLOBE_SEA, stroke: GLOBE_RIM, strokeWidth: 1 },
        }),
        withInteractionDecorative({
            data,
            mark: { type: 'geoshape', fill: GLOBE_NO_DATA, stroke: 'white', ...(strokeWidth != null ? { strokeWidth } : {}) },
        }),
        { data, ...(transform ? { transform } : {}), mark, encoding },
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

/** Point the base + circle layers of a bubble map at the chosen geography. */
function configureBubble(spec: any, scope: MapScope): void {
    const g = SCOPE_GEO[scope];
    spec.width = g.width;
    spec.height = g.height;
    spec.layer[0].data = { url: g.url, format: { type: "topojson", feature: g.feature } };
    spec.layer[0].projection = { type: g.projection };
    spec.layer[1].projection = { type: g.projection };
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
    url: 'https://cdn.jsdelivr.net/npm/us-atlas@3/counties-albers-10m.json',
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
function configureChoropleth(spec: any, scope: MapScope, level: ChoroplethLevel = 'state'): void {
    const g = SCOPE_GEO[scope];
    spec.width = g.width;
    spec.height = g.height;
    const url = scope === 'us' ? US_ATLAS.url : g.url;
    spec.projection = scope === 'us' ? { ...US_ATLAS.projection } : { type: g.projection };
    if (scope === 'us') spec._geoPreProjection = US_ATLAS.preProjection;
    if (scope === 'us' && level === 'auto') {
        delete spec.mark;
        spec.data = { name: GEO_JOIN_DATASET };
        spec.params = [{ name: GEO_LEVEL_SIGNAL, value: US_CHOROPLETH_LEVELS[0].name }];
        spec.layer = US_CHOROPLETH_LEVELS.map(({ name, feature, strokeWidth }) => ({
            data: { url, format: { type: "topojson", feature } },
            transform: [US_ATLAS_ID_TRANSFORM, { filter: geoLevelGate(GEO_LEVEL_SIGNAL, name) }],
            mark: { type: "geoshape", stroke: "white", strokeWidth },
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
    const county = scope === 'us' && level === 'county';
    spec.data = { url, format: { type: "topojson", feature: county ? 'counties' : g.feature } };
    if (scope === 'us') spec.transform = [US_ATLAS_ID_TRANSFORM];
    if (spec.mark && typeof spec.mark === 'object') spec.mark.strokeWidth = county ? 0.2 : g.strokeWidth;
}

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

/** A map is drawn at its region's size. */
function scopeSize(scope: MapScope): { width: number; height: number } {
    const g = SCOPE_GEO[scope];
    return { width: g.width, height: g.height };
}

function drawAtPlannedSize(spec: any, ctx: InstantiateContext): void {
    if (!ctx.plot) return;
    spec.width = ctx.plot.width;
    spec.height = ctx.plot.height;
}

export const mapDef: ChartTemplateDef = {
    additionalPropertyKeys: ['baseMapUrl', 'levelField', 'levels'],
    chart: "Map",
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
    planPlot: (ctx) => scopeSize(bubbleScope(ctx, ctx.channelSemantics.longitude?.field, ctx.channelSemantics.latitude?.field)),
    instantiate: (spec, ctx) => {
        const rows = ctx.fullTable ?? ctx.table ?? [];
        const lonField = ctx.resolvedEncodings.longitude?.field;
        const latField = ctx.resolvedEncodings.latitude?.field;
        const scope = bubbleScope(ctx, lonField, latField);

        configureBubble(spec, scope);
        drawAtPlannedSize(spec, ctx);
        // `baseMapUrl` swaps the region's base map for a GeoJSON
        // FeatureCollection of the host's own (a country's provinces, say);
        // the projection still fits to it.
        const baseMapUrl = ctx.chartProperties?.baseMapUrl;
        if (typeof baseMapUrl === 'string' && baseMapUrl) {
            spec.layer[0].data = { url: baseMapUrl, format: { type: 'json', property: 'features' } };
        }
        applyPointEncodings(spec.layer[1], ctx.resolvedEncodings);
        configureBubbleLevels(spec, ctx.chartProperties, rows);

        // Projection controls only apply to the world map; the US map is fixed
        // to albersUsa (which insets Alaska + Hawaii).
        if (scope === 'world') {
            for (const layer of spec.layer) applyWorldProjection(layer.projection, ctx.chartProperties);
        }
    },
    properties: [regionProperty, ...projectionProperties(wouldBeWorld)] as ChartPropertyDef[],
};

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
 * Channels: `id` = region name/code/id, `color` = the measure, `detail`
 * (optional) = an explicit display name for tooltips (defaults to the `id`
 * field so the user always sees a readable label).
 */
function buildChoroplethJoin(
    spec: any, ctx: any, resolver: (value: unknown) => unknown, featureKey = 'id',
): void {
    const idField: string | undefined = ctx.resolvedEncodings.id?.field;
    const colorEnc = ctx.resolvedEncodings.color;
    const valueField: string | undefined = colorEnc?.field;
    const labelField: string | undefined = ctx.resolvedEncodings.detail?.field ?? idField;

    const rows: any[] = ctx.fullTable ?? ctx.table ?? [];

    if (idField) {
        const joined = rows.map((r) => ({ ...r, __geo_id: resolver(r[idField]) }));
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

/** The land a custom choropleth stands on, and the fill it gives a region without a value. */
const CUSTOM_NO_DATA = '#e3e3e3';

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
    }));
}

/** Put the land without data beneath the levels: a region the rows do not name reads as land, not as a hole. */
function addCustomBaseMap(spec: any, url: unknown): void {
    if (typeof url !== 'string' || !url || !Array.isArray(spec.layer)) return;
    spec.layer.unshift(withInteractionDecorative({
        data: { url, format: { type: 'json', property: 'features' } },
        mark: { type: 'geoshape', stroke: 'white', strokeWidth: 0.5 },
        // The levels' colour and tooltip sit on the spec and reach every layer; the land states its own.
        encoding: { color: { value: CUSTOM_NO_DATA }, tooltip: null },
    }));
}

export const choroplethDef: ChartTemplateDef = {
    additionalPropertyKeys: ['baseMapUrl', 'featureKey', 'levels'],
    chart: "Choropleth",
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
    planPlot: (ctx) => {
        const scope = choroplethScope(ctx, ctx.channelSemantics.id?.field);
        return scope === 'world' && isGlobeProjection(ctx.chartProperties?.projection)
            ? { width: GLOBE_SIZE, height: GLOBE_SIZE }
            : scopeSize(scope);
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
            return;
        }
        const scope = choroplethScope(ctx, idField);

        const requestedLevel = ctx.chartProperties?.level;
        const level: ChoroplethLevel = requestedLevel === 'county' || requestedLevel === 'auto'
            ? requestedLevel
            : 'state';
        configureChoropleth(spec, scope, level);
        drawAtPlannedSize(spec, ctx);
        // County rows carry numeric FIPS ids, which the state resolver passes through.
        const resolver: GeoResolver = scope === 'us' ? resolveUsState : resolveCountry;
        buildChoroplethJoin(spec, ctx, resolver);
        if (scope === 'world') {
            applyWorldProjection(spec.projection, ctx.chartProperties);
            if (isGlobeProjection(spec.projection?.type)) configureGlobe(spec);
        }
    },
    properties: [regionProperty, levelProperty, ...projectionProperties(wouldBeWorldChoropleth)] as ChartPropertyDef[],
};
