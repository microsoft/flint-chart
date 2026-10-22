// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Highcharts Heatmap template.
 *
 * Highcharts mapping:
 *   HC: chart.type = 'heatmap' with xAxis/yAxis categories and a colorAxis.
 *       Data is [xIndex, yIndex, value] triples.
 *
 * The Heatmap chart type is selected explicitly; the Bar template also falls
 * back to a count-matrix heatmap when both x and y are discrete.
 */

import { ChartTemplateDef } from '../../core/types';
import { extractCategories, getCategoryOrder } from './utils';

export const hcHeatmapDef: ChartTemplateDef = {
    chart: 'Heatmap',
    template: { mark: 'point', encoding: {} },
    channels: ['x', 'y', 'color', 'column', 'row'],
    markCognitiveChannel: 'area',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table } = ctx;
        const xField = channelSemantics.x?.field;
        const yField = channelSemantics.y?.field;
        const colorField = channelSemantics.color?.field;

        if (!xField || !yField) return;

        const categories = extractCategories(table, xField, getCategoryOrder(ctx, 'x'));
        const groups = extractCategories(table, yField, getCategoryOrder(ctx, 'y'));

        // Aggregate the color measure per (x, y) cell; default to row count.
        const cellValues = new Map<string, { sum: number; count: number }>();
        for (const row of table) {
            const xi = categories.indexOf(String(row[xField] ?? ''));
            const yi = groups.indexOf(String(row[yField] ?? ''));
            if (xi < 0 || yi < 0) continue;
            const key = `${xi},${yi}`;
            const v = colorField ? Number(row[colorField]) : 1;
            const val = Number.isFinite(v) ? v : 1;
            if (!cellValues.has(key)) cellValues.set(key, { sum: 0, count: 0 });
            const entry = cellValues.get(key)!;
            entry.sum += val;
            entry.count += 1;
        }

        const data: [number, number, number][] = [];
        let minVal = Infinity;
        let maxVal = -Infinity;
        for (const [key, { sum, count }] of cellValues) {
            const [xi, yi] = key.split(',').map(Number);
            const v = count > 0 ? sum : 0;
            data.push([xi, yi, v]);
            if (v < minVal) minVal = v;
            if (v > maxVal) maxVal = v;
        }
        if (minVal === Infinity) minVal = 0;
        if (maxVal === -Infinity) maxVal = 1;

        const option: any = {
            chart: { type: 'heatmap' },
            xAxis: {
                categories,
                title: { text: xField },
            },
            yAxis: {
                categories: groups,
                title: { text: yField },
                reversed: true,
            },
            colorAxis: {
                min: minVal,
                max: Math.max(maxVal, minVal + 1),
                minColor: '#f0f9ff',
                maxColor: '#0369a1',
            },
            legend: {
                align: 'right',
                layout: 'vertical',
                verticalAlign: 'middle',
                symbolHeight: 180,
            },
            tooltip: {
                pointFormat: '{point.x}, {point.y}: <b>{point.value}</b>',
            },
            series: [{
                name: colorField ?? 'Count',
                data,
                borderWidth: 1,
                borderColor: '#ffffff',
                dataLabels: {
                    enabled: data.length <= 100,
                    color: '#000000',
                },
            }],
        };
        Object.assign(spec, option);
        delete spec.mark;
        delete spec.encoding;
    },
};
