// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ExcelTemplateDef } from './types';

function niceBinStep(minimum: number, maximum: number, maxBins: number): number {
    const raw = Math.max(Number.EPSILON, maximum - minimum) / Math.max(1, maxBins);
    const power = 10 ** Math.floor(Math.log10(raw));
    const error = raw / power;
    const factor = error >= 5 ? 10 : error >= 2 ? 5 : error >= 1 ? 2 : 1;
    return factor * power;
}

export const excelHistogramDef: ExcelTemplateDef = {
    chart: 'Histogram',
    channels: ['x', 'color'],
    typeMapping: { vertical: 'ColumnClustered' },
    validate: ({ fieldOf, typeOf }) => {
        const valueChannel = fieldOf('x') ? 'x' : 'y';
        return !fieldOf(valueChannel) || typeOf(valueChannel) !== 'quantitative'
            ? 'requires a quantitative value field for a native Excel histogram'
            : undefined;
    },
    instantiate: ({ input, table, fieldOf }) => {
        const valueField = fieldOf('x') ?? fieldOf('y')!;
        const values = table.map((row) => Number(row[valueField])).filter(Number.isFinite);
        if (values.length === 0) throw new Error('Excel histogram requires finite numeric values.');

        const requestedBins = Number(input.chart_spec.chartProperties?.binCount);
        const maxBins = Number.isFinite(requestedBins) && requestedBins > 0
            ? Math.max(1, Math.round(requestedBins))
            : 10;
        const minimum = Math.min(...values);
        const maximum = Math.max(...values);
        const binWidth = maximum > minimum ? niceBinStep(minimum, maximum, maxBins) : 1;
        const binMinimum = Math.floor(minimum / binWidth) * binWidth;
        const binMaximum = Math.ceil(maximum / binWidth) * binWidth;
        const binCount = Math.max(1, Math.round((binMaximum - binMinimum) / binWidth));
        const labels = Array.from({ length: binCount }, (_value, index) => {
            const lower = binMinimum + index * binWidth;
            const upper = binMinimum + (index + 1) * binWidth;
            return `${Number(lower.toFixed(2))}-${Number(upper.toFixed(2))}`;
        });
        const colorField = fieldOf('color');
        const seriesKeys = colorField
            ? [...new Set(table.map((row) => String(row[colorField])))]
            : ['Count'];
        const seriesCounts = seriesKeys.map(() => new Array(binCount).fill(0));
        for (const row of table) {
            const value = Number(row[valueField]);
            if (!Number.isFinite(value)) continue;
            const binIndex = Math.min(
                binCount - 1,
                Math.max(0, Math.floor((value - binMinimum) / binWidth)),
            );
            const seriesIndex = colorField ? seriesKeys.indexOf(String(row[colorField])) : 0;
            if (seriesIndex >= 0) seriesCounts[seriesIndex][binIndex] += 1;
        }
        const base = input.chart_spec.baseSize ?? { width: 480, height: 320 };
        const data = colorField
            ? [
                [valueField, ...labels],
                ...seriesKeys.map((name, seriesIndex) => [name, ...seriesCounts[seriesIndex]]),
            ]
            : [
                [valueField, ...seriesKeys],
                ...labels.map((label, index) => [label, seriesCounts[0][index]]),
            ];
        const series = colorField
            ? seriesKeys.map((name, index) => ({
                name,
                xRow: 0,
                xColumn: 1,
                yRow: index + 1,
                yColumn: 1,
                rowCount: 1,
                columnCount: binCount,
            }))
            : undefined;
        return {
            schema: 'flint.excel.chart/v1',
            kind: 'chart',
            chartType: colorField ? 'ColumnStacked' : 'ColumnClustered',
            title: `Distribution of ${valueField}`,
            seriesBy: colorField ? 'Rows' : 'Columns',
            series,
            data,
            categoryAxis: { title: valueField },
            valueAxis: { title: 'Count', numberFormat: '0' },
            legend: { visible: Boolean(colorField), position: 'Bottom' },
            gapWidth: 20,
            width: base.width,
            height: base.height,
            warnings: [],
            _flint: { flintType: 'Histogram', valueField, colorField, binCount, binMinimum, binMaximum },
        };
    },
};