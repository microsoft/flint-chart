// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { formatSpecToExcel } from '../chart-types';
import type { ExcelTemplateDef } from './types';

export const excelFunnelChartDef: ExcelTemplateDef = {
    chart: 'Funnel Chart',
    channels: ['y', 'size'],
    typeMapping: { vertical: 'Funnel', noAxes: true },
    validate: ({ table, fieldOf, typeOf }) => {
        if (!fieldOf('y') || typeOf('y') === 'quantitative') {
            return 'requires a categorical y stage field for a native Excel funnel chart';
        }
        if (typeOf('size') !== 'quantitative') {
            return 'requires a quantitative size field for a native Excel funnel chart';
        }
        const valueField = fieldOf('size')!;
        if (table.some((row) => Number.isFinite(Number(row[valueField])) && Number(row[valueField]) < 0)) {
            return 'requires non-negative values for a native Excel funnel chart';
        }
        return undefined;
    },
    instantiate: ({ input, table, semantics, fieldOf }) => {
        const stageField = fieldOf('y')!;
        const valueField = fieldOf('size')!;
        const stageValues = new Map<string, number>();
        for (const row of table) {
            const stage = row[stageField];
            const value = Number(row[valueField]);
            if (stage == null || !Number.isFinite(value)) continue;
            const label = String(stage);
            stageValues.set(label, (stageValues.get(label) ?? 0) + value);
        }

        const rows = [...stageValues.entries()];
        const sort = input.chart_spec.chartProperties?.sort ?? 'descending';
        if (sort === 'descending') rows.sort((left, right) => right[1] - left[1]);
        if (sort === 'ascending') rows.sort((left, right) => left[1] - right[1]);

        const base = input.chart_spec.baseSize ?? { width: 480, height: 320 };
        return {
            schema: 'flint.excel.chart/v1',
            kind: 'chart',
            chartType: 'Funnel',
            title: `${valueField} by ${stageField}`,
            seriesBy: 'Columns',
            data: [[stageField, valueField], ...rows],
            legend: { visible: false },
            dataLabels: {
                visible: true,
                numberFormat: formatSpecToExcel(semantics.size?.format),
                fontColor: '#FFFFFF',
                fontSize: 11,
            },
            seriesFormats: [{ color: '#4472C4' }],
            width: base.width,
            height: base.height,
            warnings: [],
            _flint: {
                flintType: 'Funnel Chart',
                stageField,
                valueField,
                sort,
                valueNumberFormat: formatSpecToExcel(semantics.size?.format),
            },
        };
    },
};