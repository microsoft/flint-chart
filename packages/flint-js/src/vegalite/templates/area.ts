// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { makeCartesianPivot } from '../../core/pivot';
import { defaultBuildEncodings, setMarkProp, alignStackOrderToColorOrder } from './utils';
import {
    fieldsFromEncodingChannels,
    firstDiscreteEncodingField,
    legendMatchedHits,
    MUTED_HOVER_STROKE,
    targetFromHits,
} from '../../core/interaction-semantics';
import { presentInteractionUpdate } from '../../interactive/chart-update';

const interpolateConfigProperty: ChartPropertyDef = {
    key: "interpolate", label: "Curve", type: "discrete", options: [
        { value: undefined, label: "Default (linear)" },
        { value: "linear", label: "Linear" },
        { value: "monotone", label: "Monotone (smooth)" },
        { value: "step", label: "Step" },
        { value: "step-before", label: "Step Before" },
        { value: "step-after", label: "Step After" },
        { value: "basis", label: "Basis (smooth)" },
        { value: "cardinal", label: "Cardinal" },
        { value: "catmull-rom", label: "Catmull-Rom" },
    ],
};

function applyInterpolate(vgSpec: any, config?: Record<string, any>): void {
    if (!config?.interpolate) return;
    vgSpec.mark = setMarkProp(vgSpec.mark, 'interpolate', config.interpolate);
}

/**
 * A single-series area (no `color` to stack) still gets an implicit zero-offset
 * stack from Vega-Lite. When such an area is FACETED (`column`/`row`, sharing the
 * domain scale), that stack makes VL auto-inject an `impute {value: 0}` for every
 * missing `(domain × facet)` cell — which spikes each gap down to the baseline.
 * Disabling the stack on the measure axis removes the impute, so the area simply
 * connects its *measured* points across gaps (a trend line between real data —
 * NOT a fabricated data row), exactly like a standalone single-series area.
 */
function disableImplicitStack(spec: any): void {
    for (const axis of ['x', 'y'] as const) {
        const e = spec.encoding?.[axis];
        if (e && (e.type === 'quantitative' || e.aggregate)) { e.stack = null; break; }
    }
}

/**
 * Align a sparse STACKED area/stream. Stacking is only defined when every series
 * has a value at every domain point — with holes, Vega-Lite fills them with 0
 * (spiking each gap to the baseline). A stack fundamentally *must* decide each
 * hole's value; the standard, defensible choice is to **linearly interpolate**
 * between a series' real neighbours (a trend estimate, not a flat 0). We compute
 * it in JS (VL's `impute` has no linear method) and inject the aligned rows as
 * the spec's data. Grouped by every discrete series/facet channel; only over a
 * CONTINUOUS domain (temporal/quantitative). A no-op when already dense.
 *
 * NOTE: this only runs when a series is *stacked* (a `color` split). A single
 * series is handled by {@link disableImplicitStack} with no fabricated data.
 */
function interpolateSparseStack(spec: any, ctx: any): void {
    const enc = ctx.resolvedEncodings;
    const { x, y } = enc;
    if (!x?.field || !y?.field) return;
    const xMeasure = x.type === 'quantitative' || !!x.aggregate;
    const yMeasure = y.type === 'quantitative' || !!y.aggregate;
    let measureF: string;
    let domain: any;
    if (yMeasure && !xMeasure) { measureF = y.field; domain = x; }
    else if (xMeasure && !yMeasure) { measureF = x.field; domain = y; }
    else return;
    if (domain.type !== 'temporal' && domain.type !== 'quantitative') return;
    const domainF = domain.field;

    const groupFields: string[] = [];
    for (const ch of ['color', 'group', 'column', 'row']) {
        const e = enc[ch];
        if (e?.field && (e.type === 'nominal' || e.type === 'ordinal')) groupFields.push(e.field);
    }
    if (groupFields.length === 0) return;

    const table = ctx.table;
    if (!Array.isArray(table) || table.length === 0) return;

    const num = (v: any): number =>
        v instanceof Date ? v.getTime() : (typeof v === 'number' ? v : Date.parse(v));
    const domainSorted = [...new Set(table.map((r: any) => r[domainF]))].sort((a, b) => num(a) - num(b));

    const groups = new Map<string, any[]>();
    for (const r of table) {
        const k = groupFields.map((f) => r[f]).join('\u0001');
        (groups.get(k) ?? groups.set(k, []).get(k)!).push(r);
    }
    if (table.length >= domainSorted.length * groups.size) return; // already dense

    const out: any[] = [];
    for (const pts0 of groups.values()) {
        const pts = pts0.sort((a: any, b: any) => num(a[domainF]) - num(b[domainF]));
        const have = new Map(pts.map((p: any) => [p[domainF], p]));
        for (const d of domainSorted) {
            const existing = have.get(d);
            if (existing) { out.push(existing); continue; }
            const p = num(d);
            let prev: any = null;
            let next: any = null;
            for (const pt of pts) {
                const pv = num(pt[domainF]);
                if (pv < p) prev = pt;
                else if (pv > p) { next = pt; break; }
            }
            const val = (prev && next)
                ? prev[measureF] + ((p - num(prev[domainF])) / (num(next[domainF]) - num(prev[domainF]))) * (next[measureF] - prev[measureF])
                : (prev ?? next)[measureF];
            out.push({ ...(prev ?? next), [domainF]: d, [measureF]: val });
        }
    }
    spec.data = { values: out };
}

export const areaChartDef: ChartTemplateDef = {
    chart: "Area Chart",
    template: { mark: "area", encoding: {} },
    channels: ["x", "y", "color", "opacity", "column", "row"],
    navigation: {},
    markCognitiveChannel: 'area',
    geometryKinds: ['area', 'line', 'point'],
    semanticInteractions: ({ resolvedEncodings }) => {
        const categoryField = firstDiscreteEncodingField(resolvedEncodings, ['x']);
        const seriesField = firstDiscreteEncodingField(resolvedEncodings, ['color']);
        const colorField = resolvedEncodings.color?.field;
        return {
            fields: fieldsFromEncodingChannels(resolvedEncodings, ['x', 'y', 'color']),
            categoryField,
            seriesField,
            legendFields: colorField ? { color: colorField } : undefined,
            selectableMarks: ['area'],
            renderHoverStyles: { area: { stroke: MUTED_HOVER_STROKE, strokeWidth: 1.5 } },
            resolve: (event, context) => {
                const legendField = event.legendField ?? seriesField;
                const hits = event.role === 'legend-item' && legendField
                    ? legendMatchedHits(event, context, legendField)
                    : event.hits;
                return targetFromHits(hits, context.keyField, { kind: 'path', role: event.role });
            },
            presentUpdate: presentInteractionUpdate(() => ({ anchor: 'center', placement: 'auto' })),
        };
    },
    declareLayoutMode: () => ({
        paramOverrides: { continuousMarkCrossSection: { x: 100, y: 20, seriesCountAxis: 'auto' }, facetAspectRatioResistance: 0.5 },
    }),
    instantiate: (spec, ctx) => {
        defaultBuildEncodings(spec, ctx.resolvedEncodings);
        const config = ctx.chartProperties;
        applyInterpolate(spec, config);
        if (config) {
            if (config.opacity !== undefined && config.opacity < 1) {
                spec.mark = setMarkProp(spec.mark, 'opacity', config.opacity);
            }
            if (config.stackMode) {
                for (const axis of ['x', 'y'] as const) {
                    if (spec.encoding?.[axis]?.type === 'quantitative' ||
                        spec.encoding?.[axis]?.aggregate) {
                        spec.encoding[axis].stack = config.stackMode === 'layered' ? null : config.stackMode;
                        break;
                    }
                }
            }
        }
        // Sparse-gap handling. A SINGLE series just connects its measured points
        // (disable VL's phantom stack — no fabricated data). A STACKED series
        // (colour) can't stack over holes, so interpolate them (unavoidable fill,
        // a trend estimate instead of VL's spiky 0) — unless it's layered.
        if (!ctx.resolvedEncodings.color?.field) {
            disableImplicitStack(spec);
        } else if (config?.stackMode !== 'layered') {
            interpolateSparseStack(spec, ctx);
        }
        alignStackOrderToColorOrder(spec, ctx);
    },
    properties: [
        interpolateConfigProperty,
        { key: "opacity", label: "Opacity", type: "continuous", min: 0.1, max: 1, step: 0.1, defaultValue: 0.7,
          check: (ctx) => ({
              applicable: !!ctx.encodings.color?.field && ctx.chartProperties?.stackMode === 'layered',
          }) },
        { key: "stackMode", label: "Stack", type: "discrete",
          // A stack mode only does something when a series dimension (color) is
          // present to stack; without it there is a single area band.
          check: (ctx) => ({ applicable: !!ctx.encodings.color?.field }),
          options: [
            { value: undefined, label: "Stacked (default)" },
            { value: "normalize", label: "Normalize (100%)" },
            { value: "center", label: "Center" },
            { value: "layered", label: "Layered (overlap)" },
        ] },
    ] as ChartPropertyDef[],
    // Like a line, an area pins its domain to `x` (no τ transpose). `permute`
    // exposes the y↔color swap only for a genuine dual-measure area; the series
    // dimension is explored via `shift` (legend/facets).
    pivot: makeCartesianPivot({
        permute: [['y', 'color']],
        shift: ['color', 'column', 'row'],
    }),
};

export const streamgraphDef: ChartTemplateDef = {
    chart: "Streamgraph",
    template: { mark: "area", encoding: {} },
    channels: ["x", "y", "color", "column", "row"],
    navigation: {},
    markCognitiveChannel: 'area',
    declareLayoutMode: () => ({
        paramOverrides: { continuousMarkCrossSection: { x: 100, y: 20, seriesCountAxis: 'auto' }, facetAspectRatioResistance: 0.5 },
    }),
    instantiate: (spec, ctx) => {
        defaultBuildEncodings(spec, ctx.resolvedEncodings);
        // Force center stacking on the measure axis
        if (spec.encoding?.y && !spec.encoding.y.stack) {
            spec.encoding.y.stack = "center";
            spec.encoding.y.axis = null;
        } else if (spec.encoding?.x && !spec.encoding.x.stack) {
            spec.encoding.x.stack = "center";
            spec.encoding.x.axis = null;
        }
        applyInterpolate(spec, ctx.chartProperties);
        // A streamgraph is always centre-stacked → interpolate sparse gaps so the
        // stack stays continuous (see interpolateSparseStack).
        interpolateSparseStack(spec, ctx);
        alignStackOrderToColorOrder(spec, ctx);
    },
    properties: [interpolateConfigProperty] as ChartPropertyDef[],
};
