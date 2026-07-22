// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ExcelTemplateDef } from './types';

export const excelTreemapDef: ExcelTemplateDef = {
    chart: 'Treemap',
    channels: ['color', 'size', 'detail'],
    typeMapping: { vertical: 'Treemap', noAxes: true },
    validate: ({ table, fieldOf, typeOf }) => {
        if (!fieldOf('color') || typeOf('color') === 'quantitative') {
            return 'requires a categorical color field for a native Excel treemap';
        }
        if (typeOf('size') !== 'quantitative') {
            return 'requires a quantitative size field for a native Excel treemap';
        }
        if (fieldOf('detail') && typeOf('detail') === 'quantitative') {
            return 'requires a categorical detail field for a native Excel treemap hierarchy';
        }
        const valueField = fieldOf('size')!;
        if (table.some((row) => Number.isFinite(Number(row[valueField])) && Number(row[valueField]) < 0)) {
            return 'requires non-negative values for a native Excel treemap';
        }
        return undefined;
    },
    instantiate: ({ input, table, fieldOf }) => {
        const categoryField = fieldOf('color')!;
        const detailField = fieldOf('detail');
        const valueField = fieldOf('size')!;
        const leaves = new Map<string, { category: string; detail?: string; value: number }>();
        for (const row of table) {
            const category = row[categoryField];
            const detail = detailField ? row[detailField] : undefined;
            const value = Number(row[valueField]);
            if (category == null || (detailField && detail == null) || !Number.isFinite(value)) continue;
            const categoryLabel = String(category);
            const detailLabel = detailField ? String(detail) : undefined;
            const key = `${categoryLabel}\u0000${detailLabel ?? ''}`;
            const existing = leaves.get(key);
            leaves.set(key, {
                category: categoryLabel,
                detail: detailLabel,
                value: (existing?.value ?? 0) + value,
            });
        }

        const rows = [...leaves.values()];
        const base = input.chart_spec.baseSize ?? { width: 480, height: 320 };
        return {
            schema: 'flint.excel.chart/v1',
            kind: 'chart',
            chartType: 'Treemap',
            title: `${valueField} by ${detailField ?? categoryField}`,
            seriesBy: 'Columns',
            data: detailField
                ? [[categoryField, detailField, valueField], ...rows.map((row) => [row.category, row.detail!, row.value])]
                : [[categoryField, valueField], ...rows.map((row) => [row.category, row.value])],
            legend: { visible: false },
            width: base.width,
            height: base.height,
            warnings: [],
            _flint: { flintType: 'Treemap', categoryField, detailField, valueField },
        };
    },
};