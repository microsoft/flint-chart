// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { formatSpecToExcel } from '../chart-types';
import type { ExcelTemplateDef } from './types';

function niceMaximum(value: number): { maximum: number; majorUnit: number } {
    const roughStep = Math.max(value, 1) / 5;
    const power = 10 ** Math.floor(Math.log10(roughStep));
    const fraction = roughStep / power;
    const majorUnit = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
    return { maximum: Math.ceil(value / majorUnit) * majorUnit, majorUnit };
}

function absoluteNumberFormat(format: string | undefined): string {
    const positive = !format || format === 'General' ? '#,##0' : format;
    return `${positive};${positive};0`;
}

export const excelPyramidChartDef: ExcelTemplateDef = {
    chart: 'Pyramid Chart',
    channels: ['x', 'y', 'color'],
    typeMapping: { vertical: 'BarStacked', horizontal: 'BarStacked' },
    validate: ({ table, fieldOf, typeOf }) => {
        const xIsMeasure = typeOf('x') === 'quantitative';
        const yIsMeasure = typeOf('y') === 'quantitative';
        if (xIsMeasure === yIsMeasure) {
            return 'requires exactly one quantitative measure axis for a native Excel pyramid chart';
        }
        const categoryChannel = xIsMeasure ? 'y' : 'x';
        if (!fieldOf(categoryChannel) || typeOf(categoryChannel) === 'quantitative') {
            return 'requires a discrete category axis for a native Excel pyramid chart';
        }
        const groupField = fieldOf('color');
        if (!groupField || ['quantitative', 'temporal'].includes(typeOf('color') ?? '')) {
            return 'requires a discrete color field for a native Excel pyramid chart';
        }
        const groups = [...new Set(table.map((row) => row[groupField]).filter((value) => value != null))];
        if (groups.length !== 2) {
            return `requires exactly two groups for a native Excel pyramid chart (found ${groups.length})`;
        }
        const measureField = fieldOf(xIsMeasure ? 'x' : 'y')!;
        if (table.some((row) => Number.isFinite(Number(row[measureField])) && Number(row[measureField]) < 0)) {
            return 'requires non-negative values for a native Excel pyramid chart';
        }
        return undefined;
    },
    instantiate: ({ input, table, semantics, fieldOf, typeOf }) => {
        const measureChannel = typeOf('x') === 'quantitative' ? 'x' : 'y';
        const categoryChannel = measureChannel === 'x' ? 'y' : 'x';
        const measureField = fieldOf(measureChannel)!;
        const categoryField = fieldOf(categoryChannel)!;
        const groupField = fieldOf('color')!;
        const categories = [...new Set(table.map((row) => row[categoryField]).filter((value) => value != null))];
        const groups = [...new Set(table.map((row) => row[groupField]).filter((value) => value != null))];
        const totals = new Map<string, number>();
        for (const row of table) {
            const category = row[categoryField];
            const group = row[groupField];
            const value = Number(row[measureField]);
            if (category == null || group == null || !Number.isFinite(value)) continue;
            const key = `${String(category)}\u0000${String(group)}`;
            totals.set(key, (totals.get(key) ?? 0) + value);
        }
        const valueAt = (category: unknown, group: unknown): number | null => {
            const value = totals.get(`${String(category)}\u0000${String(group)}`);
            return value === undefined ? null : value;
        };
        const maximumValue = Math.max(0, ...totals.values());
        const { maximum, majorUnit } = niceMaximum(maximumValue);
        const numberFormat = formatSpecToExcel(semantics[measureChannel]?.format);
        const base = input.chart_spec.baseSize ?? { width: 560, height: 360 };

        return {
            schema: 'flint.excel.chart/v1',
            kind: 'chart',
            chartType: 'BarStacked',
            title: `${measureField} by ${categoryField} and ${groupField}`,
            seriesBy: 'Columns',
            data: [
                [categoryField, ...groups.map(String)],
                ...categories.map((category) => {
                    const leftValue = valueAt(category, groups[0]);
                    return [
                        String(category),
                        leftValue === null ? null : -leftValue,
                        valueAt(category, groups[1]),
                    ];
                }),
            ],
            categoryAxis: { title: categoryField, reversePlotOrder: true },
            valueAxis: {
                title: measureField,
                numberFormat: absoluteNumberFormat(numberFormat),
                minimumScale: -maximum,
                maximumScale: maximum,
                majorUnit,
            },
            legend: { visible: true, position: 'Bottom' },
            seriesFormats: [{ color: '#4472C4' }, { color: '#C55A5A' }],
            gapWidth: 45,
            overlap: 100,
            width: base.width,
            height: base.height,
            warnings: [],
            _flint: {
                flintType: 'Pyramid Chart',
                categoryField,
                measureField,
                groupField,
                groups: groups.map(String),
            },
        };
    },
};