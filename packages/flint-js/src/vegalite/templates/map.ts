// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ChartTemplateDef, ChartPropertyDef, OptionEvalContext } from '../../core/types';
import {
    resolveUsState, resolveCountry, GeoResolver,
    type MapScope, inferBubbleScope, inferChoroplethScope, semanticScope, pickMapScope,
} from '../../chart-types/geo';
import { toTypeString } from '../../core/field-semantics';
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

/** Point the base + circle layers of a bubble map at the chosen geography. */
function configureBubble(spec: any, scope: MapScope): void {
    const g = SCOPE_GEO[scope];
    spec.width = g.width;
    spec.height = g.height;
    spec.layer[0].data = { url: g.url, format: { type: "topojson", feature: g.feature } };
    spec.layer[0].projection = { type: g.projection };
    spec.layer[1].projection = { type: g.projection };
}

/** Point a choropleth's geoshape at the chosen base map. */
function configureChoropleth(spec: any, scope: MapScope): void {
    const g = SCOPE_GEO[scope];
    spec.width = g.width;
    spec.height = g.height;
    spec.data = { url: g.url, format: { type: "topojson", feature: g.feature } };
    spec.projection = { type: g.projection };
    if (spec.mark && typeof spec.mark === 'object') spec.mark.strokeWidth = g.strokeWidth;
}

export const mapDef: ChartTemplateDef = {
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
    instantiate: (spec, ctx) => {
        const rows = ctx.fullTable ?? ctx.table ?? [];
        const lonField = ctx.resolvedEncodings.longitude?.field;
        const latField = ctx.resolvedEncodings.latitude?.field;
        const scope = pickMapScope(ctx.chartProperties, undefined, () => inferBubbleScope(rows, lonField, latField));

        configureBubble(spec, scope);
        applyPointEncodings(spec.layer[1], ctx.resolvedEncodings);

        // Projection controls only apply to the world map; the US map is fixed
        // to albersUsa (which insets Alaska + Hawaii).
        if (scope === 'world') {
            const config = ctx.chartProperties;
            if (config) {
                const projection = config.projection;
                const projectionCenter = config.projectionCenter;
                const applyProjection = (obj: any) => {
                    if (obj?.projection) {
                        if (projection && projection !== 'default') {
                            obj.projection.type = projection;
                        }
                        if (projectionCenter && obj.projection.type !== 'albersUsa') {
                            obj.projection.rotate = [-projectionCenter[0], -projectionCenter[1], 0];
                        }
                    }
                };
                for (const layer of spec.layer) applyProjection(layer);
            }
        }
    },
    properties: [
        regionProperty,
        {
            key: "projection",
            label: "Projection",
            type: "discrete",
            options: [
                { value: "default", label: "Default" },
                ...mapProjections.map(p => ({ value: p.value, label: p.label })),
            ],
            defaultValue: "default",
            check: (ctx) => ({ applicable: wouldBeWorld(ctx) }),
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
            check: (ctx) => ({ applicable: wouldBeWorld(ctx) }),
        },
    ] as ChartPropertyDef[],
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
function buildChoroplethJoin(spec: any, ctx: any, resolver: GeoResolver): void {
    const idField: string | undefined = ctx.resolvedEncodings.id?.field;
    const colorEnc = ctx.resolvedEncodings.color;
    const valueField: string | undefined = colorEnc?.field;
    const labelField: string | undefined = ctx.resolvedEncodings.detail?.field ?? idField;

    const rows: any[] = ctx.fullTable ?? ctx.table ?? [];

    if (idField) {
        const joined = rows.map((r) => ({ ...r, __geo_id: resolver(r[idField]) }));
        const lookupFields = [idField, valueField, labelField].filter(Boolean) as string[];
        spec.transform = [
            {
                lookup: 'id',
                from: { data: { values: joined }, key: '__geo_id', fields: lookupFields },
            },
        ];
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

export const choroplethDef: ChartTemplateDef = {
    chart: "Choropleth",
    template: {
        mark: { type: "geoshape", stroke: "white", strokeWidth: 0.5 },
        encoding: {},
    },
    channels: ["id", "color", "detail"],
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
    instantiate: (spec, ctx) => {
        const rows = ctx.fullTable ?? ctx.table ?? [];
        const idField = ctx.resolvedEncodings.id?.field;
        const semType = idField ? toTypeString(ctx.semanticTypes?.[idField]) : '';
        const semScope = semanticScope(semType);
        const scope = pickMapScope(
            ctx.chartProperties,
            semScope,
            () => inferChoroplethScope(rows, idField),
        );

        configureChoropleth(spec, scope);
        const resolver: GeoResolver = scope === 'us' ? resolveUsState : resolveCountry;
        buildChoroplethJoin(spec, ctx, resolver);
    },
    properties: [regionProperty] as ChartPropertyDef[],
};
