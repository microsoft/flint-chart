// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import type { ExcelTemplateDef } from './types';

function niceMaximum(value: number): number {
    if (!(value > 0)) return 1;
    const power = 10 ** Math.floor(Math.log10(value));
    const fraction = value / power;
    const niceFraction = fraction <= 1 ? 1
        : fraction <= 2 ? 2
        : fraction <= 2.5 ? 2.5
        : fraction <= 5 ? 5
        : 10;
    return niceFraction * power;
}

export const excelRadarChartDef: ExcelTemplateDef = {
    chart: 'Radar Chart',
    channels: ['x', 'y', 'color'],
    typeMapping: { vertical: 'RadarMarkers' },
    validate: ({ table, fieldOf, typeOf }) => {
        if (!fieldOf('x') || typeOf('x') === 'quantitative' || typeOf('x') === 'temporal') {
            return 'requires a categorical metric x field for a native Excel radar chart';
        }
        if (!fieldOf('y') || typeOf('y') !== 'quantitative') {
            return 'requires a quantitative y field for a native Excel radar chart';
        }
        if (fieldOf('color') && (typeOf('color') === 'quantitative' || typeOf('color') === 'temporal')) {
            return 'requires a discrete color field for native Excel radar series';
        }
        if (fieldOf('column') || fieldOf('row')) {
            return 'does not support faceting in one native Excel radar chart';
        }
        const valueField = fieldOf('y')!;
        if (table.some((row) => Number(row[valueField]) < 0)) {
            return 'requires non-negative values for a native Excel radar chart';
        }
        return undefined;
    },
    instantiate: ({ input, table, fieldOf }) => {
        const metricField = fieldOf('x')!;
        const valueField = fieldOf('y')!;
        const seriesField = fieldOf('color');
        const metrics = [...new Set(table.map((row) => String(row[metricField])))];
        if (metrics.length < 3) {
            throw new Error('Excel radar chart requires at least three metric axes.');
        }
        const seriesKeys = seriesField
            ? [...new Set(table.map((row) => String(row[seriesField])))]
            : [valueField];
        const metricMaximums = new Map(metrics.map((metric) => {
            const values = table
                .filter((row) => String(row[metricField]) === metric)
                .map((row) => Number(row[valueField]))
                .filter(Number.isFinite);
            return [metric, niceMaximum(values.length > 0 ? Math.max(...values) : 1)] as const;
        }));
        const accumulators = new Map<string, { sum: number; count: number }>();
        for (const row of table) {
            const metric = String(row[metricField]);
            const series = seriesField ? String(row[seriesField]) : valueField;
            const value = Number(row[valueField]);
            if (!Number.isFinite(value)) continue;
            const key = `${series}\u0000${metric}`;
            const accumulator = accumulators.get(key) ?? { sum: 0, count: 0 };
            accumulator.sum += value;
            accumulator.count += 1;
            accumulators.set(key, accumulator);
        }
        const normalizedValue = (series: string, metric: string): number => {
            const accumulator = accumulators.get(`${series}\u0000${metric}`);
            if (!accumulator) return 0;
            return (accumulator.sum / accumulator.count) / metricMaximums.get(metric)!;
        };
        const base = input.chart_spec.baseSize ?? { width: 480, height: 400 };
        const filledRequested = input.chart_spec.chartProperties?.filled !== false;
        return {
            schema: 'flint.excel.chart/v1',
            kind: 'chart',
            chartType: 'RadarMarkers',
            title: `${valueField} by ${metricField}`,
            seriesBy: 'Columns',
            data: [
                [metricField, ...seriesKeys],
                ...metrics.map((metric) => [
                    `${metric} (${metricMaximums.get(metric)})`,
                    ...seriesKeys.map((series) => normalizedValue(series, metric)),
                ]),
            ],
            valueAxis: { minimumScale: 0, maximumScale: 1, majorUnit: 0.25 },
            legend: { visible: Boolean(seriesField), position: 'Bottom' },
            width: base.width,
            height: base.height,
            warnings: filledRequested ? [{
                severity: 'info',
                code: 'excel-radar-fill-unsupported',
                message: 'Excel Radar uses outlines and markers because Office.js does not expose translucent chart-series fills.',
            }] : [],
            _flint: {
                flintType: 'Radar Chart',
                metricField,
                valueField,
                seriesField,
                metricMaximums: Object.fromEntries(metricMaximums),
                normalized: true,
                filledRequested,
            },
        };
    },
};