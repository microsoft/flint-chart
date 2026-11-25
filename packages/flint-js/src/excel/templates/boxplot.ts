// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { niceScale } from '../scale';
import type { ExcelTemplateDef } from './types';

export const excelBoxplotDef: ExcelTemplateDef = {
    chart: 'Boxplot',
    channels: ['x', 'y', 'color'],
    typeMapping: { vertical: 'BoxWhisker' },
    validate: ({ input, fieldOf, typeOf }) => {
        if (!fieldOf('x') || typeOf('x') === 'temporal') {
            return 'requires a categorical x field for a native Excel box and whisker chart';
        }
        if (!fieldOf('y') || typeOf('y') !== 'quantitative') {
            return 'requires a quantitative y field for a native Excel box and whisker chart';
        }
        if (fieldOf('color')) {
            return 'does not yet support color-grouped native Excel box and whisker charts';
        }
        if (fieldOf('column') || fieldOf('row')) {
            return 'does not support faceting in one native Excel box and whisker chart';
        }
        if (input.chart_spec.chartProperties?.whiskerMethod === 'minmax') {
            return 'does not support min-max whiskers because Office.js exposes no native BoxWhisker whisker-method control';
        }
        return undefined;
    },
    instantiate: ({ input, table, fieldOf }) => {
        const categoryField = fieldOf('x')!;
        const valueField = fieldOf('y')!;
        const rows = table.filter((row) => row[categoryField] != null && Number.isFinite(Number(row[valueField])));
        const base = input.chart_spec.baseSize ?? { width: 480, height: 320 };
        const properties = input.chart_spec.chartProperties;

        return {
            schema: 'flint.excel.chart/v1',
            kind: 'chart',
            chartType: 'BoxWhisker',
            title: `${valueField} by ${categoryField}`,
            seriesBy: 'Columns',
            data: [
                [categoryField, valueField],
                ...rows.map((row) => [String(row[categoryField]), Number(row[valueField])]),
            ],
            categoryAxis: { title: categoryField },
            valueAxis: (() => {
                // A distribution is read by its spread: the axis fits the values, as Flint's boxplots do.
                const values = rows.map((row) => Number(row[valueField]));
                const scale = niceScale(values, Math.min(...values) <= 0, base.height - 80);
                // Box & Whisker (a newer Excel chart family) takes bounds, but rejects a number format or major unit.
                return { title: valueField, minimumScale: scale.minimumScale, maximumScale: scale.maximumScale };
            })(),
            legend: { visible: false },
            boxWhiskerOptions: {
                quartileCalculation: 'Inclusive',
                showInnerPoints: false,
                showMeanLine: false,
                showMeanMarker: false,
                showOutlierPoints: properties?.showOutliers !== false,
            },
            width: base.width,
            height: base.height,
            warnings: [],
            _flint: { flintType: 'Boxplot', categoryField, valueField, rawObservations: rows.length },
        };
    },
};