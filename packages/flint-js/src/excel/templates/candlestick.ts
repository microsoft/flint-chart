// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { formatSpecToExcel } from '../chart-types';
import type { ExcelTemplateDef } from './types';

const PRICE_CHANNELS = ['open', 'high', 'low', 'close'] as const;
const EXCEL_EPOCH = Date.UTC(1899, 11, 30);
const DAY_MILLISECONDS = 24 * 60 * 60 * 1000;

function excelDateSerial(value: unknown): number {
    return (new Date(value as string | number | Date).getTime() - EXCEL_EPOCH) / DAY_MILLISECONDS;
}

function niceStep(span: number): number {
    const rough = span / 5;
    const power = 10 ** Math.floor(Math.log10(rough));
    const fraction = rough / power;
    return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power;
}

export const excelCandlestickDef: ExcelTemplateDef = {
    chart: 'Candlestick Chart',
    channels: ['x', 'open', 'high', 'low', 'close'],
    typeMapping: { vertical: 'StockOHLC' },
    validate: ({ table, fieldOf, typeOf }) => {
        const xField = fieldOf('x');
        if (!xField || !['temporal', 'ordinal'].includes(typeOf('x') ?? '')) {
            return 'requires a temporal or ordered x field for a native Excel stock chart';
        }
        for (const channel of PRICE_CHANNELS) {
            if (!fieldOf(channel) || typeOf(channel) !== 'quantitative') {
                return `requires a quantitative ${channel} field for a native Excel stock chart`;
            }
        }
        if (fieldOf('color') || fieldOf('group') || fieldOf('detail')) {
            return 'does not support color, group, or detail encodings in a native Excel stock chart';
        }
        if (table.length === 0) {
            return 'requires at least one OHLC row for a native Excel stock chart';
        }

        let previousTime = Number.NEGATIVE_INFINITY;
        for (const [index, row] of table.entries()) {
            const time = new Date(row[xField]).getTime();
            if (!Number.isFinite(time)) {
                return `requires a valid date at row ${index + 1} for a native Excel stock chart`;
            }
            if (time <= previousTime) {
                return 'requires x values sorted in strictly increasing chronological order for a native Excel stock chart';
            }
            previousTime = time;

            const rawPrices = PRICE_CHANNELS.map((channel) => row[fieldOf(channel)!]);
            const [open, high, low, close] = rawPrices.map(Number);
            if (rawPrices.some((value) => value == null || value === '') || ![open, high, low, close].every(Number.isFinite)) {
                return `requires finite open, high, low, and close values at row ${index + 1} for a native Excel stock chart`;
            }
            if (high < Math.max(open, low, close) || low > Math.min(open, high, close)) {
                return `requires coherent OHLC values at row ${index + 1} (high >= open/close/low and low <= open/close/high)`;
            }
        }
        return undefined;
    },
    instantiate: ({ input, table, semantics, fieldOf }) => {
        const xField = fieldOf('x')!;
        const fields = PRICE_CHANNELS.map((channel) => fieldOf(channel)!);
        const base = input.chart_spec.baseSize ?? { width: 480, height: 320 };
        const labelBudget = Math.max(12, Math.floor((base.width - 90) / 14));
        const tickLabelSpacing = table.length > labelBudget ? Math.ceil(table.length / labelBudget) : undefined;
        const lows = table.map((row) => Number(row[fields[2]]));
        const highs = table.map((row) => Number(row[fields[1]]));
        const minimum = Math.min(...lows);
        const maximum = Math.max(...highs);
        const majorUnit = niceStep(Math.max(maximum - minimum, Math.abs(maximum) * 0.1, 1));
        const minimumScale = Math.floor(minimum / majorUnit) * majorUnit;
        const maximumScale = Math.ceil(maximum / majorUnit) * majorUnit;

        return {
            schema: 'flint.excel.chart/v1',
            kind: 'chart',
            chartType: 'StockOHLC',
            title: `${fields[3]} by ${xField}`,
            seriesBy: 'Columns',
            data: [
                [xField, ...fields],
                ...table.map((row) => [
                    excelDateSerial(row[xField]),
                    ...fields.map((field) => Number(row[field])),
                ]),
            ],
            categoryAxis: { title: xField, numberFormat: 'yyyy-mm-dd', tickLabelSpacing },
            valueAxis: {
                title: 'Price',
                numberFormat: formatSpecToExcel(semantics.close?.format),
                minimumScale,
                maximumScale: maximumScale === maximum ? maximumScale + majorUnit : maximumScale,
                majorUnit,
            },
            legend: { visible: false },
            width: base.width,
            height: base.height,
            warnings: [],
            _flint: { flintType: 'Candlestick Chart', xField, priceFields: fields },
        };
    },
};