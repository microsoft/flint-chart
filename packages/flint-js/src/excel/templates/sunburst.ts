// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ExcelTemplateDef } from './types';

export const excelSunburstChartDef: ExcelTemplateDef = {
    chart: 'Sunburst Chart',
    channels: ['color', 'size', 'group', 'detail'],
    typeMapping: { vertical: 'Sunburst', noAxes: true },
    validate: ({ table, fieldOf, typeOf }) => {
        if (!fieldOf('color') || typeOf('color') === 'quantitative') {
            return 'requires a categorical color field for a native Excel sunburst chart';
        }
        if (typeOf('size') !== 'quantitative') {
            return 'requires a quantitative size field for a native Excel sunburst chart';
        }
        if (fieldOf('group') && typeOf('group') === 'quantitative') {
            return 'requires a categorical group field for a native Excel sunburst hierarchy';
        }
        if (fieldOf('detail') && !fieldOf('group')) {
            return 'requires a group field before detail in a native Excel sunburst hierarchy';
        }
        if (fieldOf('detail') && typeOf('detail') === 'quantitative') {
            return 'requires a categorical detail field for a native Excel sunburst hierarchy';
        }
        const valueField = fieldOf('size')!;
        if (table.some((row) => Number.isFinite(Number(row[valueField])) && Number(row[valueField]) < 0)) {
            return 'requires non-negative values for a native Excel sunburst chart';
        }
        return undefined;
    },
    instantiate: ({ input, table, fieldOf }) => {
        const categoryField = fieldOf('color')!;
        const groupField = fieldOf('group');
        const detailField = fieldOf('detail');
        const valueField = fieldOf('size')!;
        const hierarchyFields = [categoryField, groupField, detailField].filter((field): field is string => Boolean(field));
        const leaves = new Map<string, { path: string[]; value: number }>();
        for (const row of table) {
            const path = hierarchyFields.map((field) => row[field]);
            const value = Number(row[valueField]);
            if (path.some((part) => part == null) || !Number.isFinite(value)) continue;
            const labels = path.map(String);
            const key = labels.join('\u0000');
            const existing = leaves.get(key);
            leaves.set(key, { path: labels, value: (existing?.value ?? 0) + value });
        }

        const base = input.chart_spec.baseSize ?? { width: 480, height: 320 };
        return {
            schema: 'flint.excel.chart/v1',
            kind: 'chart',
            chartType: 'Sunburst',
            title: `${valueField} by ${hierarchyFields[hierarchyFields.length - 1]}`,
            seriesBy: 'Columns',
            data: [
                [...hierarchyFields, valueField],
                ...[...leaves.values()].map((leaf) => [...leaf.path, leaf.value]),
            ],
            legend: { visible: false },
            width: base.width,
            height: base.height,
            warnings: [],
            _flint: { flintType: 'Sunburst Chart', hierarchyFields, valueField },
        };
    },
};