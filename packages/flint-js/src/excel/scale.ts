// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/** Measure axes on round numbers, and the Excel number formats that print their ticks. */

import type { FormatSpec } from '../core/field-semantics';
import { formatSpecToExcel } from './chart-types';
import type { ExcelAxisSpec } from './types';

function niceUnit(span: number, maxTicks: number): number {
    const rough = span / Math.max(1, maxTicks);
    const power = 10 ** Math.floor(Math.log10(rough));
    for (const factor of [1, 2, 2.5, 5, 10]) {
        if (factor * power >= rough) return factor * power;
    }
    return 10 * power;
}

/**
 * A measure axis on round numbers: zero kept where Flint keeps it, otherwise
 * fitted to the data, with about one tick per 45 points of axis length.
 */
export function niceScale(
    values: number[],
    zero: boolean,
    length: number,
): Pick<ExcelAxisSpec, 'minimumScale' | 'maximumScale' | 'majorUnit'> {
    const finite = values.filter(Number.isFinite);
    if (finite.length === 0) return {};
    let low = Math.min(...finite);
    let high = Math.max(...finite);
    if (zero) {
        low = Math.min(0, low);
        high = Math.max(0, high);
    }
    if (high === low) {
        const pad = Math.abs(high) > 0 ? Math.abs(high) * 0.1 : 1;
        if (!(zero && low === 0)) low -= pad;
        high += pad;
    }
    const maxTicks = Math.max(3, Math.min(10, Math.floor(length / 45)));
    const unit = niceUnit(high - low, maxTicks);
    const round = (value: number) => Number(value.toPrecision(12));
    return {
        minimumScale: round(Math.floor(low / unit + 1e-9) * unit),
        maximumScale: round(Math.ceil(high / unit - 1e-9) * unit),
        majorUnit: round(unit),
    };
}

function decimalsOf(value: number): number {
    const text = String(Number(value.toPrecision(10)));
    if (text.includes('e-')) return Number(text.split('e-')[1]);
    return text.includes('.') ? text.split('.')[1].length : 0;
}

/**
 * The Excel number format for a measure axis: the field's own format (currency,
 * percent, units), with digit grouping and as many decimals as its ticks need.
 */
export function axisNumberFormat(format: FormatSpec | undefined, majorUnit: number | undefined): string {
    const base = formatSpecToExcel(format);
    const step = majorUnit ?? 1;
    if (base?.includes('%')) {
        const decimals = decimalsOf(step * 100);
        return decimals > 0 ? `0.${'0'.repeat(decimals)}%` : '0%';
    }
    if (base?.includes('"K"')) return base;
    const decimals = decimalsOf(step);
    const core = decimals > 0 ? `#,##0.${'0'.repeat(decimals)}` : '#,##0';
    if (!base || base === 'General') return core;
    return base.replace(/#,##0(\.0+)?/, (existing) => (existing.length >= core.length ? existing : core));
}

/** A tick label as the format prints it, for measuring the axis's room. */
export function sampleNumber(value: number, format: string | undefined): string {
    const decimals = format?.match(/\.(0+)/)?.[1].length ?? 0;
    const percent = format?.includes('%');
    const text = (percent ? value * 100 : value).toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    const literals = (format ?? '').match(/"[^"]*"|[$€£¥]/g)?.join('').replace(/"/g, '') ?? '';
    return `${text}${percent ? '%' : ''}${literals}`;
}


/** A log-10 axis from the decade below the smallest positive value to the decade above the largest. */
export function logScale(values: number[]): Pick<ExcelAxisSpec, 'minimumScale' | 'maximumScale' | 'logBase'> | undefined {
    const positive = values.filter((value) => Number.isFinite(value) && value > 0);
    if (positive.length === 0 || positive.length < values.filter(Number.isFinite).length) return undefined;
    return {
        logBase: 10,
        minimumScale: 10 ** Math.floor(Math.log10(Math.min(...positive))),
        maximumScale: 10 ** Math.ceil(Math.log10(Math.max(...positive))),
    };
}
