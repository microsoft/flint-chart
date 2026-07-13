// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Vega-Lite Slope Chart (slopegraph) template.
 *
 * A slopegraph draws one straight line **per category** connecting that
 * category's value at exactly **two periods** (e.g. "2019" → "2024"), with a
 * point marker at each end. The read is the slope/direction of change and the
 * crossovers between categories — it is the 2-point value-change cousin of the
 * Bump Chart (multi-period ranking), so this template mirrors bump.ts wherever
 * practical.
 *
 * Contract:
 *   x      — period, rendered as a *discrete band* axis with exactly two
 *            positions. Temporal / numeric period fields are converted to
 *            ordered ordinal categories so the two periods always sit at two
 *            equally-spaced columns (the slope, not the gap, carries meaning).
 *   y      — value (quantitative position).
 *   color  — category → one line per value (legend).
 *   detail — category → one line per value (no legend); used when the lines
 *            should not be color-coded.
 *
 * The line is always straight (interpolate: linear — never monotone/smooth) and
 * shows points at both ends.
 */

import { ChartTemplateDef } from '../../core/types';
import { resolveDiscreteType } from '../../core/axis-detection';
import { defaultBuildEncodings } from './utils';

const isDiscrete = (type: string | undefined) =>
    type === 'nominal' || type === 'ordinal';

/**
 * Distinct values of `field` in `table`, ordered naturally: numerically when
 * every value parses as a number, chronologically when every value parses as a
 * date, otherwise in data-encounter order. Used to order the two period bands.
 */
function orderedDistinct(table: any[], field: string): any[] {
    const seen = new Map<string, any>();
    for (const row of table) {
        const v = row[field];
        if (v == null) continue;
        const key = String(v);
        if (!seen.has(key)) seen.set(key, v);
    }
    const values = [...seen.values()];
    if (values.length <= 1) return values;

    const allNumeric = values.every(v => typeof v === 'number' ||
        (typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v))));
    if (allNumeric) {
        return [...values].sort((a, b) => Number(a) - Number(b));
    }
    const allDates = values.every(v => !isNaN(Date.parse(String(v))));
    if (allDates) {
        return [...values].sort((a, b) => Date.parse(String(a)) - Date.parse(String(b)));
    }
    return values;
}

export const slopeChartDef: ChartTemplateDef = {
    chart: "Slope Chart",
    template: {
        mark: { type: "line", point: true, interpolate: "linear", strokeWidth: 2 },
        encoding: {},
    },
    channels: ["x", "y", "color", "detail", "column", "row"],
    markCognitiveChannel: 'position',
    declareLayoutMode: (cs, table) => {
        // Force the period axis to a discrete band so the two periods sit at two
        // equally-spaced positions regardless of the field's native type.
        const resolvedTypes: Record<string, 'nominal' | 'ordinal' | 'quantitative' | 'temporal'> = {};
        const xcs = cs.x;
        if (xcs?.field && !isDiscrete(xcs.type)) {
            resolvedTypes.x = resolveDiscreteType(xcs.type, xcs.field, table);
        }
        return {
            axisFlags: { x: { banded: true } },
            ...(Object.keys(resolvedTypes).length ? { resolvedTypes } : {}),
            paramOverrides: {
                // Spread the two periods well apart and keep the plot from being
                // squeezed tall: a wide band step + no series-count vertical
                // stretch yields the classic balanced slopegraph framing.
                defaultBandSize: 120,
                continuousMarkCrossSection: { x: 0, y: 0, seriesCountAxis: 'auto' },
                facetAspectRatioResistance: 0.4,
            },
        };
    },
    instantiate: (spec, ctx) => {
        defaultBuildEncodings(spec, ctx.resolvedEncodings);

        const xEnc = spec.encoding?.x;
        const yEnc = spec.encoding?.y;
        if (!xEnc || !yEnc) return;

        // Defensive: the period axis must be discrete (declareLayoutMode already
        // converts it, but a caller could pass an explicit type override).
        if (!isDiscrete(xEnc.type)) {
            xEnc.type = resolveDiscreteType(xEnc.type, xEnc.field, ctx.table);
        }

        // Order the two period bands. The auto-sort in buildVLEncodings only
        // fires for fields that were *already* discrete in Phase 0, so a
        // temporal/numeric period converted here arrives without a sort —
        // give it an explicit natural order so the periods read left→right.
        if ((xEnc.type === 'ordinal' || xEnc.type === 'nominal') &&
            xEnc.sort == null && xEnc.field) {
            const order = orderedDistinct(ctx.table, xEnc.field);
            if (order.length > 1) xEnc.sort = order;
        }

        // Inset the two period bands from the plot edges so the end points and
        // their value labels are not clipped (classic slopegraph framing).
        xEnc.scale = { ...xEnc.scale, padding: 0.4 };

        // Give the value axis a little breathing room (in pixels) so the
        // extreme top / bottom end-point markers — common with zero-crossing
        // data — are not flush against the plot edges. Slopegraphs read the
        // *slope* (change), not the absolute level, so the value axis fits the
        // data rather than anchoring at zero — matching the ECharts / Chart.js
        // slope templates and classic slopegraph convention.
        yEnc.scale = { ...yEnc.scale, zero: false, nice: true, padding: 12 };
    },
};
