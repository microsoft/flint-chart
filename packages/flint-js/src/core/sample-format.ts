// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Formats precise enough for the values a key lists. A key that lists values Flint chose (a size
 * key's 0.5, 1, 2.5) must print each as it is: a scale's tick format, or a field's format chosen
 * for its ticks, would round 0.5 and 2.5 to "1" and "3".
 */
import { format as formatNumber } from 'd3-format';
import type { FormatSpec } from './field-semantics';

/** d3-format's specifier grammar: [[fill]align][sign][symbol][0][width][,][.precision][~][type]. */
const SPECIFIER = /^(?:(.)?([<>=^]))?([+\-( ])?([$#])?(0)?(\d+)?(,)?(\.\d+)?(~)?([a-z%])?$/i;

/** A value with the float noise of arithmetic removed: 0.025 * 100 is 2.5, not 2.5000000000000004. */
const clean = (value: number): number => Number(Math.abs(value).toPrecision(12));

/** The decimal places a value is written with: 2.5 → 1, 0.025 → 3, 1e-7 → 7, 2500 → 0. */
export function decimalsOf(value: number): number {
    if (!Number.isFinite(value)) return 0;
    const match = /^\d+(?:\.(\d+))?(?:e([+-]\d+))?$/.exec(String(clean(value)));
    if (!match) return 0;
    return Math.max(0, (match[1]?.length ?? 0) - Number(match[2] ?? 0));
}

/** The significant digits a value is written with: 2500 → 2, 0.025 → 2, 1 → 1. */
function significantOf(value: number): number {
    if (!Number.isFinite(value) || value === 0) return 1;
    return clean(value).toExponential().split('e')[0].replace('.', '').length;
}

/**
 * A d3 pattern that prints each value exactly. Without a pattern: grouped, as many decimals as the
 * values need, trailing zeros trimmed (`,.1~f` for 0.5, 1, 2.5). With one: its grouping, sign,
 * symbol and kind kept, its precision raised (and trimmed) only where it would round a value away —
 * `.0~%` becomes `.1~%` for 0.025, `,d` becomes `,.1~f` for 2.5, `,.2f` stays for 0.5.
 */
export function exactPattern(values: number[], pattern?: string): string {
    const finite = values.filter(Number.isFinite);
    const decimals = (scale = 1) => Math.max(0, ...finite.map((value) => decimalsOf(value * scale)));
    if (pattern === undefined) return `,.${decimals()}~f`;
    const match = SPECIFIER.exec(pattern);
    if (!match) return pattern;
    const [, fill = '', align = '', sign = '', symbol = '', zero = '', width = '', comma = ''] = match;
    const stated = match[8] ? Number(match[8].slice(1)) : undefined;
    let type = match[10] ?? '';
    let need: number;
    let fallback: number;
    switch (type) {
        case 'f': need = decimals(); fallback = 6; break;
        case '%': need = decimals(100); fallback = 6; break;
        case 'd':
            if (finite.every(Number.isInteger)) return pattern;
            type = 'f'; need = decimals(); fallback = 0; break;
        case 'e': need = Math.max(0, ...finite.map(significantOf)) - 1; fallback = 6; break;
        case 'g': case 'r': case 's': case 'p': need = Math.max(...finite.map(significantOf)); fallback = 6; break;
        case '': case 'n': need = Math.max(...finite.map(significantOf)); fallback = 12; break;
        default: return pattern;
    }
    if ((stated ?? fallback) >= need && type === match[10]) return pattern;
    return `${fill}${align}${sign}${symbol}${zero}${width}${comma}.${Math.max(stated ?? 0, need)}~${type}`;
}

/** A field's format made exact for the values a key lists; an abbreviated format already prints them in full. */
export function exactFormat(values: number[], fmt?: FormatSpec): FormatSpec {
    if (fmt?.abbreviate) return fmt;
    return { ...fmt, pattern: exactPattern(values, fmt?.pattern) };
}

/** A value as a FormatSpec prints it, as `formatSpecToVegaExpr` writes it for Vega. */
export function printFormatted(value: number, fmt: FormatSpec | undefined): string {
    const prefix = fmt?.prefix ?? '';
    const suffix = fmt?.suffix ?? '';
    if (fmt?.abbreviate) {
        const abs = Math.abs(value);
        const [divisor, unit] = abs >= 1e12 ? [1e12, 'T'] : abs >= 1e9 ? [1e9, 'B'] : abs >= 1e6 ? [1e6, 'M'] : abs >= 1e3 ? [1e3, 'K'] : [1, ''];
        return `${prefix}${unit ? formatNumber('~g')(value / divisor) + unit : formatNumber(',')(value)}${suffix}`;
    }
    let shown: string;
    try { shown = fmt?.pattern ? formatNumber(fmt.pattern)(value) : String(value); } catch { shown = String(value); }
    return `${prefix}${shown}${suffix}`;
}
