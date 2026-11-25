// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { exactPattern } from '../core/sample-format';

const FORMAT_CALL = /format\(datum\.value,\s*(['"])([^'"]*)\1\)/g;

/**
 * The format a key's values print in, precise enough for each: a size key's sampled values, a
 * stepped colour key's breaks. Vega otherwise labels them with the scale's tick format, which rounds
 * 0.5 and 2.5 to "1" and "3". The field's own format — a percentage, a currency's sign — is kept,
 * its precision raised where needed.
 */
export function exactLegendLabels(legend: any, values: number[]): { format?: string; labelExpr?: string } {
    if (legend.formatType !== undefined) return {};
    const out: { format?: string; labelExpr?: string } = {};
    const labelExpr = legend.labelExpr;
    if (typeof labelExpr === 'string') {
        out.labelExpr = labelExpr.replace(FORMAT_CALL, (_, quote: string, pattern: string) =>
            `format(datum.value, ${quote}${exactPattern(values, pattern)}${quote})`);
    }
    // A label expression that reads the label Vega formatted needs that format exact too.
    if (labelExpr === undefined || /datum\.label\b/.test(labelExpr)) {
        out.format = exactPattern(values, typeof legend.format === 'string' ? legend.format : undefined);
    }
    return out;
}
