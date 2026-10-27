// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Highcharts Histogram template.
 *
 * Highcharts has no built-in bin transform — bins are computed client-side
 * and rendered as a column chart with contiguous bars (pointPadding/grouping
 * off via plotOptions.column.pointPadding = 0).
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { groupBy } from './utils';

function computeBins(
    values: number[],
    binCount: number,
): { categories: string[]; binWidth: number; minVal: number } {
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal;
    const binWidth = range > 0 ? range / binCount : 1;

    const categories: string[] = [];
    for (let i = 0; i < binCount; i++) {
        const lo = (minVal + i * binWidth).toFixed(1);
        const hi = (minVal + (i + 1) * binWidth).toFixed(1);
        categories.push(`${lo}–${hi}`);
    }
    return { categories, binWidth, minVal };
}

function binIndex(v: number, minVal: number, binWidth: number, binCount: number): number {
    let idx = Math.floor((v - minVal) / binWidth);
    if (idx >= binCount) idx = binCount - 1;
    if (idx < 0) idx = 0;
    return idx;
}

export const hcHistogramDef: ChartTemplateDef = {
    chart: 'Histogram',
    template: { mark: 'bar', encoding: {} },
    channels: ['x', 'color', 'column', 'row'],
    markCognitiveChannel: 'length',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const xField = channelSemantics.x?.field;
        const colorField = channelSemantics.color?.field;
        if (!xField) return;

        const values = table
            .map(r => Number(r[xField]))
            .filter(v => isFinite(v));
        if (values.length === 0) return;

        const binCount = chartProperties?.binCount || 10;
        const { categories, binWidth, minVal } = computeBins(values, binCount);

        const option: any = {
            chart: { type: 'column' },
            xAxis: {
                categories,
                title: { text: xField },
                labels: { rotation: categories.length > 10 ? 45 : 0 },
            },
            yAxis: { title: { text: 'Count' }, min: 0, allowDecimals: false },
            plotOptions: {
                column: {
                    pointPadding: 0,
                    groupPadding: 0,
                    borderWidth: 0.5,
                    borderColor: '#ffffff',
                },
            },
            series: [],
        };

        if (!colorField) {
            const counts = new Array(binCount).fill(0);
            for (const v of values) {
                counts[binIndex(v, minVal, binWidth, binCount)]++;
            }
            option.legend = { enabled: false };
            option.series.push({ name: 'Count', data: counts });
        } else {
            const groups = groupBy(table, colorField);
            option.legend = { layout: 'horizontal', align: 'center', verticalAlign: 'bottom' };
            for (const [name, rows] of groups) {
                const groupValues = rows
                    .map(r => Number(r[xField]))
                    .filter(v => isFinite(v));
                const counts = new Array(binCount).fill(0);
                for (const v of groupValues) {
                    counts[binIndex(v, minVal, binWidth, binCount)]++;
                }
                option.series.push({ name, data: counts });
            }
        }

        Object.assign(spec, option);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        { key: 'binCount', label: 'Bins', type: 'continuous', min: 3, max: 40, step: 1, defaultValue: 10 } as ChartPropertyDef,
    ],
};
