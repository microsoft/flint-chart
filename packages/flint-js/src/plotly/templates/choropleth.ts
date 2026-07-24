// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Choropleth template.
 *
 * Native `choropleth` trace: Plotly resolves `locations` through its own
 * built-in atlas (US states / world countries) keyed by a short code
 * (`locationmode`), so — unlike the Vega-Lite template, which joins the
 * user's rows into a fetched TopoJSON via a `lookup` transform — no external
 * geometry needs to be fetched or joined here.
 *
 * Data contract (unchanged from Vega-Lite): `id` carries the region name/
 * code, `color` the measure, optional `detail` a display label. Values are
 * resolved through the SAME gazetteer as the Vega-Lite choropleth
 * (`chart-types/geo.ts`) — just to a USPS/ISO-3 code instead of a numeric
 * TopoJSON feature id — so a dataset that renders as a US or World map on
 * one backend renders the same way on the other.
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import {
    resolveUsStateCode, resolveCountryCode, GeoCodeResolver,
    inferChoroplethScope, semanticScope, pickMapScope,
} from '../../chart-types/geo';
import { toTypeString } from '../../core/field-semantics';

// Plotly's own built-in named `'Blues'` colorscale runs dark→light as the
// value increases (z=0 → "rgb(5,10,172)" dark blue, z=1 → "rgb(220,220,220)"
// light gray) — the OPPOSITE of the light→dark sequential convention used
// everywhere else in this codebase (and by every other backend's default
// choropleth/heatmap ramp). For a choropleth that's actively misleading (the
// highest-value region reads as the *palest*), so this template uses an
// explicit ColorBrewer-style light→dark stop array instead of the `'Blues'`
// string. Plotly's stock `'RdBu'` (used for the diverging case below) is NOT
// affected — its low→mid→high stops already run blue→gray→red, matching the
// diverging convention — so it's used as-is.
const SEQUENTIAL_BLUES: Array<[number, string]> = [
    [0, '#eff3ff'], [0.25, '#bdd7e7'], [0.5, '#6baed6'], [0.75, '#3182bd'], [1, '#08519c'],
];

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

/** Configure `layout.geo` for the chosen scope (no projection controls — mirrors the VL Choropleth). */
function buildGeoLayout(scope: 'us' | 'world'): any {
    if (scope === 'us') {
        return {
            scope: 'usa',
            projection: { type: 'albers usa' },
            showlakes: true, lakecolor: '#ffffff',
        };
    }
    return {
        scope: 'world',
        projection: { type: 'natural earth' },
        showframe: false,
        showcoastlines: false,
        showcountries: false, // borders drawn by the choropleth fill itself
    };
}

export const plChoroplethDef: ChartTemplateDef = {
    chart: 'Choropleth',
    template: { mark: 'geoshape', encoding: {} },
    channels: ['id', 'color', 'detail'],
    markCognitiveChannel: 'color',
    instantiate: (spec, ctx) => {
        const { channelSemantics, chartProperties, colorDecisions } = ctx;
        const idField = channelSemantics.id?.field;
        const colorField = channelSemantics.color?.field;
        const labelField = channelSemantics.detail?.field ?? idField;
        if (!idField) return;

        const rows = ctx.fullTable ?? ctx.table ?? [];
        const semType = toTypeString(ctx.semanticTypes?.[idField]);
        const semScope = semanticScope(semType);
        const scope = pickMapScope(chartProperties, semScope, () => inferChoroplethScope(rows, idField));
        const codeResolver: GeoCodeResolver = scope === 'us' ? resolveUsStateCode : resolveCountryCode;
        const locationmode = scope === 'us' ? 'USA-states' : 'ISO-3';

        const locations: string[] = [];
        const z: number[] = [];
        const labels: string[] = [];
        for (const r of rows) {
            const code = codeResolver(r[idField]);
            if (!code) continue;
            const raw = colorField ? Number(r[colorField]) : undefined;
            if (colorField && !Number.isFinite(raw)) continue;
            locations.push(code);
            z.push(colorField ? (raw as number) : 1);
            labels.push(labelField ? String(r[labelField] ?? r[idField]) : String(r[idField]));
        }
        if (locations.length === 0) return;

        const decision = colorDecisions?.color ?? colorDecisions?.group;
        const diverging = decision?.schemeType === 'diverging';

        const geo = buildGeoLayout(scope);
        const valueLabel = colorField ?? 'Value';

        Object.assign(spec, {
            data: [{
                type: 'choropleth',
                locations,
                locationmode,
                z,
                text: labels,
                colorscale: diverging ? 'RdBu' : SEQUENTIAL_BLUES,
                colorbar: { title: { text: valueLabel } },
                marker: { line: { color: '#ffffff', width: 0.5 } },
                hovertemplate: `%{text}<br>${valueLabel}: %{z}<extra></extra>`,
            }],
            layout: {
                geo,
                showlegend: false,
                margin: { t: 24, b: 24, l: 8, r: 8 },
            },
            _width: scope === 'us' ? 520 : 620,
            _height: scope === 'us' ? 320 : 360,
        });
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [regionProperty],
};
