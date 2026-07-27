// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ExcelAxisSpec } from './types';

const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

export function excelDateSerial(value: unknown): number {
    return (new Date(value as string | number | Date).getTime() - EXCEL_EPOCH) / DAY_MILLISECONDS;
}

function niceInterval(value: number): number {
    const power = 10 ** Math.floor(Math.log10(value));
    const fraction = value / power;
    return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
}

export function excelDateAxis(values: unknown[], width: number): Pick<
    ExcelAxisSpec,
    'categoryType' | 'baseTimeUnit' | 'majorUnit' | 'majorTimeUnitScale' | 'numberFormat'
> {
    const axis: ExcelAxisSpec = {
        categoryType: 'DateAxis',
        baseTimeUnit: 'Days',
        numberFormat: 'yyyy-mm-dd',
    };
    const labelBudget = Math.max(2, Math.floor((width - 90) / 75));
    if (values.length <= labelBudget) return axis;

    const times = values
        .map((value) => new Date(value as string | number | Date).getTime())
        .filter(Number.isFinite);
    if (times.length < 2) return axis;
    const roughDays = Math.max(1, Math.max(...times) - Math.min(...times)) / DAY_MILLISECONDS / labelBudget;
    if (roughDays >= 365) {
        return { ...axis, majorUnit: niceInterval(roughDays / 365), majorTimeUnitScale: 'Years' };
    }
    if (roughDays >= 28) {
        return { ...axis, majorUnit: niceInterval(roughDays / (365 / 12)), majorTimeUnitScale: 'Months' };
    }
    return { ...axis, majorUnit: niceInterval(roughDays), majorTimeUnitScale: 'Days' };
}
