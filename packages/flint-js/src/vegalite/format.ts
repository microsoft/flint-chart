// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { FormatSpec } from '../core/field-semantics';

const quoteVegaString = (value: string): string =>
    `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;

/** Compile a semantic FormatSpec into a Vega expression for any numeric value. */
export function formatSpecToVegaExpr(
    fmt: FormatSpec,
    valueExpr: string = 'datum.value',
): string | null {
    const prefix = fmt.prefix ? `${quoteVegaString(fmt.prefix)} + ` : '';
    const suffix = fmt.suffix ? ` + ${quoteVegaString(fmt.suffix)}` : '';

    if (fmt.abbreviate) {
        return (
            `${prefix}(abs(${valueExpr}) >= 1e12 ? format(${valueExpr} / 1e12, '~g') + 'T' : ` +
            `abs(${valueExpr}) >= 1e9 ? format(${valueExpr} / 1e9, '~g') + 'B' : ` +
            `abs(${valueExpr}) >= 1e6 ? format(${valueExpr} / 1e6, '~g') + 'M' : ` +
            `abs(${valueExpr}) >= 1e3 ? format(${valueExpr} / 1e3, '~g') + 'K' : ` +
            `format(${valueExpr}, ','))${suffix}`
        );
    }

    if (!fmt.pattern) return prefix || suffix ? `${prefix}${valueExpr}${suffix}` : null;
    return `${prefix}format(${valueExpr}, ${quoteVegaString(fmt.pattern)})${suffix}`;
}

/**
 * Compile a FormatSpec for an axis/legend labelExpr. A pattern without affixes
 * returns null because Vega-Lite can apply it directly through `format`.
 */
export function formatSpecToLabelExpr(fmt: FormatSpec): string | null {
    if (!fmt.abbreviate && fmt.pattern && !fmt.prefix && !fmt.suffix) return null;
    return formatSpecToVegaExpr(fmt);
}