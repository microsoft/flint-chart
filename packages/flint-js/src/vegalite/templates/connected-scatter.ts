// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Vega-Lite Connected Scatter Plot template.
 *
 * Points are plotted in 2-D (x, y both quantitative) and **connected by a
 * straight line in a defined order** (usually time / sequence), tracing a
 * trajectory through the space. It shows the x↔y correlation AND the ordered
 * path at once — distinct from a plain Scatter Plot (no order, no line) and from
 * Regression (a fitted trend, not the observed path).
 *
 * This mirrors scatter.ts for the points and line.ts / bump.ts for the
 * connecting line + order handling.
 *
 * Contract:
 *   x      — quantitative position.
 *   y      — quantitative position.
 *   order  — the sequence field (temporal or numeric/index) that defines the
 *            connection order. The line follows THIS field, never the x value,
 *            so a looping / back-tracking path renders as a self-crossing
 *            trajectory.
 *   color  — optional series → one trajectory (line) per value (legend).
 *   detail — optional series → one trajectory per value without a color legend.
 *
 * The line is always straight (interpolate: linear — never monotone/smooth) and
 * shows a point marker at every observation.
 */

import { ChartTemplateDef } from '../../core/types';
import { defaultBuildEncodings } from './utils';
import {
    fieldsFromEncodingChannels,
    firstDiscreteEncodingField,
    legendMatchedHits,
    MUTED_HOVER_STROKE,
    targetFromHits,
} from '../../core/interaction-semantics';
import { annotationCandidates, presentAnnotationUpdate, transitionAnnotationText } from '../../interactive/updates/annotation';

/**
 * Pick a *sortable* Vega-Lite type for the order encoding. The order channel
 * drives the line's connection order, so it must sort meaningfully:
 *   - temporal fields sort chronologically;
 *   - numeric fields (years, step indices, …) sort numerically — even when the
 *     resolver classified them as ordinal/nominal, we coerce to quantitative so
 *     VL orders 1,2,3,…10 rather than by an arbitrary domain order;
 *   - anything else keeps its resolved discrete type.
 */
function resolveOrderType(
    csType: string | undefined,
    field: string,
    table: any[],
): 'temporal' | 'quantitative' | 'ordinal' | 'nominal' {
    const values = table.map(r => r[field]).filter(v => v != null && v !== '');
    const allNumeric = values.length > 0 &&
        values.every(v => typeof v === 'number' ||
            (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))));
    // Numeric sequence fields (years, step indices, …) sort numerically — even
    // when the resolver classified them as temporal/ordinal — so the line walks
    // 1,2,3,…10 rather than by an epoch-ms or arbitrary domain order.
    if (allNumeric) return 'quantitative';
    if (csType === 'temporal') return 'temporal';
    return (csType === 'ordinal' || csType === 'nominal') ? csType : 'nominal';
}

export const connectedScatterDef: ChartTemplateDef = {
    chart: "Connected Scatter Plot",
    template: {
        mark: { type: "line", point: true, interpolate: "linear" },
        encoding: {},
    },
    channels: ["x", "y", "order", "color", "detail", "column", "row"],
    navigation: {},
    markCognitiveChannel: 'position',
    semanticInteractions: ({ resolvedEncodings }) => {
        const seriesField = firstDiscreteEncodingField(resolvedEncodings, ['color', 'detail']);
        const colorField = resolvedEncodings.color?.field;
        return {
            fields: fieldsFromEncodingChannels(resolvedEncodings, ['x', 'y', 'order', 'color', 'detail']),
            seriesField,
            legendFields: colorField ? { color: colorField } : undefined,
            selectableMarks: ['line', 'point'],
            renderHoverStyles: {
                line: { strokeWidth: 3 },
                symbol: { stroke: MUTED_HOVER_STROKE, strokeWidth: 2 },
            },
            resolve: (event, context) => {
                const legendField = event.legendField ?? seriesField;
                const hits = event.role === 'legend-item' && legendField
                    ? legendMatchedHits(event, context, legendField)
                    : event.hits;
                const markType = event.hits[0]?.markType;
                const kind = markType === 'line' ? 'path' : 'mark';
                const role = event.role === 'legend-item' ? 'legend-item' : markType ?? event.role;
                return targetFromHits(hits, context.keyField, { kind, role });
            },
            presentUpdate: presentAnnotationUpdate(
                (_element, _context, visual) => visual?.kind === 'path'
                    ? annotationCandidates('segment-midpoint', 'center', 'top', 'bottom', 'right', 'left')
                    : annotationCandidates('center', 'top', 'right', 'bottom', 'left'),
                transitionAnnotationText(resolvedEncodings.y?.field),
            ),
        };
    },
    instantiate: (spec, ctx) => {
        defaultBuildEncodings(spec, ctx.resolvedEncodings);

        const xEnc = spec.encoding?.x;
        const yEnc = spec.encoding?.y;
        if (!xEnc || !yEnc) return;

        // The connecting line must follow the sequence field, NOT the x value.
        // Build the order encoding explicitly so it sorts meaningfully and is
        // never polluted by the generic discrete-axis `sort: null` machinery.
        const orderCS = ctx.channelSemantics.order;
        if (orderCS?.field) {
            spec.encoding.order = {
                field: orderCS.field,
                type: resolveOrderType(orderCS.type, orderCS.field, ctx.table),
            };
        } else {
            // Fallback: no explicit order field → connect in data (row) order.
            // VL has no row-index primitive, so we leave the line unordered and
            // let VL connect by x; the order channel is the documented way to
            // get a true trajectory, and every bundled example provides it.
            delete spec.encoding.order;
        }

        // Clean, data-fitting bounds via Vega-Lite's native `nice`. The
        // zero-baseline is left to the engine (computeZeroDecision), same as any
        // other position chart. IMPORTANT: no pixel `scale.padding` here —
        // padding expands the domain symmetrically and, combined with `nice`,
        // can round a zero-anchored axis *below* zero on strictly-positive data
        // (e.g. gas price rounding to -0.5). `nice` alone gives clean,
        // non-negative bounds.
        xEnc.scale = { ...xEnc.scale, nice: true };
        yEnc.scale = { ...yEnc.scale, nice: true };
    },
};
