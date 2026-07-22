// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { resolveTotalsMode } from '../../chart-types/waterfall';
import { formatSpecToExcel } from '../chart-types';
import type { ExcelTemplateDef } from './types';

export const excelWaterfallChartDef: ExcelTemplateDef = {
    chart: 'Waterfall Chart',
    channels: ['x', 'y', 'color'],
    typeMapping: { vertical: 'Waterfall' },
    validate: ({ input, table, fieldOf, typeOf }) => {
        if (!fieldOf('x')) return 'requires a category x field for a native Excel waterfall chart';
        if (typeOf('y') !== 'quantitative') {
            return 'requires a quantitative y field for a native Excel waterfall chart';
        }
        if (fieldOf('color') && typeOf('color') === 'quantitative') {
            return 'requires color to contain start/delta/end roles for a native Excel waterfall chart';
        }
        const valueField = fieldOf('y')!;
        const typeField = fieldOf('color');
        const values = table.map((row) => Number(row[valueField])).filter(Number.isFinite);
        if (typeField) {
            const unsupportedTotal = table.findIndex((row, index) => {
                const role = String(row[typeField] ?? '').toLowerCase();
                return index > 0 && (role === 'start' || role === 'end' || role === 'total');
            });
            if (unsupportedTotal >= 0) {
                return 'cannot mark non-initial total points because Office.js does not expose Waterfall total-point semantics';
            }
        } else {
            const totals = resolveTotalsMode(values, input.chart_spec.chartProperties?.totals);
            if (totals === 'last' || totals === 'both') {
                return 'cannot mark a final total because Office.js does not expose Waterfall total-point semantics';
            }
        }
        return undefined;
    },
    instantiate: ({ input, table, semantics, fieldOf }) => {
        const categoryField = fieldOf('x')!;
        const valueField = fieldOf('y')!;
        const rows = table.filter((row) => row[categoryField] != null && Number.isFinite(Number(row[valueField])));

        const base = input.chart_spec.baseSize ?? { width: 480, height: 320 };
        return {
            schema: 'flint.excel.chart/v1',
            kind: 'chart',
            chartType: 'Waterfall',
            title: `${valueField} by ${categoryField}`,
            seriesBy: 'Columns',
            data: [
                [categoryField, valueField],
                ...rows.map((row) => [String(row[categoryField]), Number(row[valueField])]),
            ],
            categoryAxis: { title: categoryField },
            valueAxis: {
                title: valueField,
                numberFormat: formatSpecToExcel(semantics.y?.format),
            },
            legend: { visible: false },
            showConnectorLines: true,
            width: base.width,
            height: base.height,
            warnings: [],
            _flint: { flintType: 'Waterfall Chart', categoryField, valueField },
        };
    },
};