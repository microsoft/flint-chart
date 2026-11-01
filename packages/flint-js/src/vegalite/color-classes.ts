// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { classColors, roundColorClasses, type NeutralBand } from '../core/color-controls';
import { DIVERGING_SCHEME_STOPS } from '../core/diverging-schemes';
import { exactLegendLabels } from './exact-labels';

/** Scale properties that describe a continuous or quantized domain, which a threshold scale states for itself. */
const DOMAIN_KEYS = ['domain', 'domainMid', 'domainMin', 'domainMax', 'domainRaw', 'zero', 'nice', 'scheme', 'interpolate', 'bins'];

/**
 * A colour encoding stepped at round classes ({@link roundColorClasses}): a threshold scale at the
 * breaks, a colour per class from the ramp ({@link classColors}), and a key that prints each break
 * as it is. The ramp is its stops, or a named scheme: a diverging one Vega names takes its stops
 * too, so each class can take the colour at its far edge; any other is sampled evenly by Vega.
 * About `target` classes, exactly where `exact` and a round step allows; a field that crosses
 * `pivot` has it as a break, or as the centre of a `neutral` class. False where the rows cannot say
 * where the classes fall — an aggregated or binned measure, a column the rows do not hold, values
 * that do not spread — and the encoding is left as it was.
 */
export function stepColorScale(
    enc: any, ramp: string[] | { scheme: string }, target: number, table: readonly any[], pivot?: number,
    options: { exact?: boolean; neutral?: NeutralBand } = {},
): boolean {
    if (!enc?.field || enc.aggregate || enc.bin || enc.type !== 'quantitative') return false;
    if (Array.isArray(ramp) && ramp.length < 2) return false;
    const values: number[] = [];
    for (const row of table) {
        const value = row?.[enc.field];
        if (typeof value === 'number' && Number.isFinite(value)) values.push(value);
    }
    const classes = roundColorClasses(values, target, pivot, options);
    if (!classes) return false;
    const scale = { ...(enc.scale ?? {}) };
    for (const key of DOMAIN_KEYS) delete scale[key];
    delete scale.range;
    const count = classes.breaks.length + 1;
    const stops = Array.isArray(ramp) ? ramp : DIVERGING_SCHEME_STOPS[ramp.scheme.toLowerCase()];
    let colors: Record<string, unknown>;
    if (stops && (Array.isArray(ramp) || classes.below !== undefined)) colors = { range: classColors(stops, classes) };
    else {
        // A scheme Flint holds no stops for, sampled evenly over the stretch the classes take.
        const { below, above } = classes;
        const side = below !== undefined && above !== undefined ? Math.max(below, above) : undefined;
        const extent = side === undefined ? [0, 1] : [(side - below!) / (2 * side - 1), (side + above! - 1) / (2 * side - 1)];
        colors = { scheme: { name: (ramp as { scheme: string }).scheme, count, ...(extent[0] > 0 || extent[1] < 1 ? { extent } : {}) } };
    }
    enc.scale = { ...scale, type: 'threshold', domain: classes.breaks, ...colors };
    if (enc.legend !== null && enc.legend !== false) {
        enc.legend = { ...(enc.legend ?? {}), ...exactLegendLabels(enc.legend ?? {}, classes.breaks) };
    }
    return true;
}
