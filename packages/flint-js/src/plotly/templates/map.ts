// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Map (bubble) template.
 *
 * Native `scattergeo` trace + `layout.geo`: Plotly ships its own built-in
 * world/US basemap (land, country/state borders, oceans) so — unlike the
 * Vega-Lite template, which layers a `geoshape` TopoJSON base under a
 * `circle` mark — no external topology needs to be fetched or joined.
 *
 * Data contract (unchanged from Vega-Lite): `longitude`/`latitude` place each
 * point; `size`/`color` optionally scale/hue it. Scope (US vs World) is
 * decided the same way as the Vega-Lite Map — `region` property, else infer
 * from whether every point falls inside the US bounding box
 * (`chart-types/geo.ts`, shared by both backends so the same dataset picks
 * the same base map regardless of backend).
 */

import { ChartTemplateDef, ChartPropertyDef, OptionEvalContext } from '../../core/types';
import { inferBubbleScope, pickMapScope } from '../../chart-types/geo';
import { getPlotlyPalette, getSeriesColor, groupBy } from './utils';

// ---------------------------------------------------------------------------
// Projection mapping (Vega-Lite d3 projection name → Plotly geo projection type)
// ---------------------------------------------------------------------------

const mapProjections = [
    { value: 'mercator', label: 'Mercator' },
    { value: 'equalEarth', label: 'Equal Earth' },
    { value: 'orthographic', label: 'Orthographic (Globe)' },
    { value: 'stereographic', label: 'Stereographic' },
    { value: 'conicEqualArea', label: 'Conic Equal Area' },
    { value: 'conicEquidistant', label: 'Conic Equidistant' },
    { value: 'azimuthalEquidistant', label: 'Azimuthal Equidistant' },
    { value: 'mollweide', label: 'Mollweide' },
] as const;

// Plotly has no exact "Equal Earth" projection; "natural earth" is the
// closest available compromise pseudo-cylindrical projection.
const PROJECTION_TYPE_MAP: Record<string, string> = {
    mercator: 'mercator',
    equalEarth: 'natural earth',
    orthographic: 'orthographic',
    stereographic: 'stereographic',
    conicEqualArea: 'conic equal area',
    conicEquidistant: 'conic equidistant',
    azimuthalEquidistant: 'azimuthal equidistant',
    mollweide: 'mollweide',
};

function plotlyProjectionType(vlProjection: unknown): string {
    if (typeof vlProjection === 'string' && PROJECTION_TYPE_MAP[vlProjection]) {
        return PROJECTION_TYPE_MAP[vlProjection];
    }
    return 'natural earth'; // default world projection (mirrors VL's equalEarth default)
}

const projectionCenterPresets: { label: string; center: [number, number] }[] = [
    { label: 'World (Atlantic)', center: [0, 0] },
    { label: 'World (Pacific)', center: [150, 0] },
    { label: 'China', center: [105, 35] },
    { label: 'USA', center: [-98, 39] },
    { label: 'Europe', center: [10, 50] },
    { label: 'Japan', center: [138, 36] },
    { label: 'India', center: [78, 22] },
    { label: 'Brazil', center: [-52, -14] },
    { label: 'Australia', center: [134, -25] },
    { label: 'Russia', center: [100, 60] },
    { label: 'Africa', center: [20, 0] },
    { label: 'Middle East', center: [45, 28] },
    { label: 'Southeast Asia', center: [115, 5] },
    { label: 'South America', center: [-60, -15] },
    { label: 'North America', center: [-100, 45] },
    { label: 'UK', center: [-2, 54] },
    { label: 'Germany', center: [10, 51] },
    { label: 'France', center: [2, 47] },
    { label: 'Korea', center: [128, 36] },
];

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
    key: 'region',
    label: 'Region',
    type: 'discrete',
    options: [
        { value: 'auto', label: 'Auto-detect' },
        { value: 'us', label: 'United States' },
        { value: 'world', label: 'World' },
    ],
    defaultValue: 'auto',
};

const projectionProperty: ChartPropertyDef = {
    key: 'projection',
    label: 'Projection',
    type: 'discrete',
    options: [
        { value: 'default', label: 'Default' },
        ...mapProjections.map(p => ({ value: p.value, label: p.label })),
    ],
    defaultValue: 'default',
    check: (ctx) => ({ applicable: wouldBeWorld(ctx) }),
};

const projectionCenterProperty: ChartPropertyDef = {
    key: 'projectionCenter',
    label: 'Center',
    type: 'discrete',
    options: [
        { value: undefined, label: 'Default' },
        ...projectionCenterPresets.map(p => ({
            value: p.center,
            label: `${p.label} [${p.center[0]}, ${p.center[1]}]`,
        })),
    ],
    defaultValue: undefined,
    check: (ctx) => ({ applicable: wouldBeWorld(ctx) }),
};

/** Configure `layout.geo` for the chosen scope + (world-only) projection/center. */
function buildGeoLayout(scope: 'us' | 'world', chartProperties: any): any {
    if (scope === 'us') {
        return {
            scope: 'usa',
            projection: { type: 'albers usa' },
            showland: true, landcolor: '#eef0f2',
            showlakes: true, lakecolor: '#ffffff',
            subunitcolor: '#ffffff',
            countrycolor: '#ffffff',
        };
    }
    const geo: any = {
        scope: 'world',
        projection: { type: plotlyProjectionType(chartProperties?.projection) },
        showland: true, landcolor: '#eef0f2',
        showocean: true, oceancolor: '#ffffff',
        showcountries: true, countrycolor: '#c7ccd1',
        showcoastlines: false,
    };
    const center = chartProperties?.projectionCenter;
    if (Array.isArray(center) && center.length === 2) {
        geo.projection.rotation = { lon: -Number(center[0]), lat: -Number(center[1]) };
    }
    return geo;
}

/** Sqrt (area-truth) scale from data values to marker pixel diameters. */
function bubbleDiameters(values: number[], minPx = 6, maxPx = 34): number[] {
    const finite = values.filter(v => Number.isFinite(v));
    const lo = finite.length ? Math.min(...finite, 0) : 0;
    const hi = finite.length ? Math.max(...finite) : 1;
    const sLo = Math.sqrt(Math.max(0, lo));
    const sHi = Math.sqrt(Math.max(sLo + 1e-9, hi));
    return values.map(v => {
        if (!Number.isFinite(v)) return minPx;
        const s = Math.sqrt(Math.max(0, v));
        const t = (s - sLo) / (sHi - sLo || 1);
        return minPx + t * (maxPx - minPx);
    });
}

export const plMapDef: ChartTemplateDef = {
    chart: 'Map',
    template: { mark: 'circle', encoding: {} },
    channels: ['longitude', 'latitude', 'color', 'size', 'opacity'],
    markCognitiveChannel: 'position',
    instantiate: (spec, ctx) => {
        const { channelSemantics, chartProperties, colorDecisions } = ctx;
        const lonField = channelSemantics.longitude?.field;
        const latField = channelSemantics.latitude?.field;
        const sizeField = channelSemantics.size?.field;
        const colorField = channelSemantics.color?.field;
        const colorType = channelSemantics.color?.type;
        if (!lonField || !latField) return;

        const rows = (ctx.fullTable ?? ctx.table ?? []).filter((r: any) =>
            Number.isFinite(Number(r[lonField])) && Number.isFinite(Number(r[latField])));
        if (rows.length === 0) return;

        const scope = pickMapScope(chartProperties, undefined, () => inferBubbleScope(rows, lonField, latField));
        const geo = buildGeoLayout(scope, chartProperties);

        const isContinuousColor = !!colorField && (colorType === 'quantitative' || colorType === 'temporal');
        const sizeValues = sizeField ? rows.map((r: any) => Number(r[sizeField])) : undefined;
        const diameters = sizeValues ? bubbleDiameters(sizeValues) : rows.map(() => 10);

        const opacity = 0.85;
        const traces: any[] = [];

        if (isContinuousColor && colorField) {
            const toColorVal = colorType === 'temporal'
                ? (v: any) => (v != null ? new Date(v).getTime() : NaN)
                : (v: any) => (v != null ? Number(v) : NaN);
            const colorVals = rows.map((r: any) => toColorVal(r[colorField])).filter((v: number) => !isNaN(v));
            const cmin = colorVals.length ? Math.min(...colorVals) : 0;
            const cmax = colorVals.length ? Math.max(...colorVals) : 1;
            const decision = colorDecisions?.color ?? colorDecisions?.group;
            const diverging = decision?.schemeType === 'diverging';
            traces.push({
                type: 'scattergeo',
                mode: 'markers',
                name: colorField,
                lon: rows.map((r: any) => Number(r[lonField])),
                lat: rows.map((r: any) => Number(r[latField])),
                marker: {
                    size: diameters,
                    color: rows.map((r: any) => toColorVal(r[colorField])),
                    colorscale: diverging ? 'RdBu' : 'Viridis',
                    cmin, cmax,
                    showscale: true,
                    colorbar: { title: { text: colorField } },
                    opacity,
                    line: { color: '#ffffff', width: 0.5 },
                },
                hovertemplate: `Lon: %{lon}<br>Lat: %{lat}<br>${colorField}: %{marker.color}`
                    + (sizeField ? `<br>${sizeField}: %{customdata}` : '') + '<extra></extra>',
                customdata: sizeField ? sizeValues : undefined,
            });
        } else if (colorField) {
            // Nominal/ordinal color: one trace per group (legend by group name).
            // Bubble diameters come from the SAME global sqrt scale computed
            // above (over every row) so sizes stay comparable across groups —
            // index into `diameters` by each row's position in `rows`.
            const palette = getPlotlyPalette(ctx, 'color');
            const idxByRow = new Map(rows.map((r: any, idx: number) => [r, idx]));
            let i = 0;
            for (const [name, groupRows] of groupBy(rows, colorField)) {
                const groupSizes = sizeField ? groupRows.map((r: any) => Number(r[sizeField])) : undefined;
                const sizesForGroup = groupRows.map((r: any) => diameters[idxByRow.get(r) ?? 0]);
                traces.push({
                    type: 'scattergeo',
                    mode: 'markers',
                    name,
                    lon: groupRows.map((r: any) => Number(r[lonField])),
                    lat: groupRows.map((r: any) => Number(r[latField])),
                    marker: {
                        size: sizesForGroup,
                        color: getSeriesColor(palette, i),
                        opacity,
                        line: { color: '#ffffff', width: 0.5 },
                    },
                    hovertemplate: `Lon: %{lon}<br>Lat: %{lat}<br>${colorField}: ${name}`
                        + (sizeField ? `<br>${sizeField}: %{customdata}` : '') + '<extra></extra>',
                    customdata: groupSizes,
                });
                i++;
            }
        } else {
            traces.push({
                type: 'scattergeo',
                mode: 'markers',
                showlegend: false,
                lon: rows.map((r: any) => Number(r[lonField])),
                lat: rows.map((r: any) => Number(r[latField])),
                marker: {
                    size: diameters,
                    color: getSeriesColor(getPlotlyPalette(ctx, 'color'), 0),
                    opacity,
                    line: { color: '#ffffff', width: 0.5 },
                },
                hovertemplate: 'Lon: %{lon}<br>Lat: %{lat}'
                    + (sizeField ? `<br>${sizeField}: %{customdata}` : '') + '<extra></extra>',
                customdata: sizeValues,
            });
        }

        const width = scope === 'us' ? 520 : 620;
        const height = scope === 'us' ? 320 : 360;

        Object.assign(spec, {
            data: traces,
            layout: {
                geo,
                showlegend: !!colorField && !isContinuousColor,
                margin: { t: 24, b: 24, l: 8, r: 8 },
            },
            _width: width + (colorField ? 120 : 0),
            _height: height,
        });
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [regionProperty, projectionProperty, projectionCenterProperty],
};
