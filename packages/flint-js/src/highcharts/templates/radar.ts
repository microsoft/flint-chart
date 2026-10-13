// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Highcharts Radar Chart template.
 *
 * Highcharts mapping:
 *   HC: chart.polar = true; xAxis.categories = metric names; one polygon
 *       series per color group. Highcharts draws spokes and rings natively.
 *
 * Data model (long format):
 *   x (nominal): metric / axis name
 *   y (quantitative): value for that metric
 *   color (nominal): entity / group
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { extractCategories, groupBy } from './utils';

export const hcRadarChartDef: ChartTemplateDef = {
    chart: 'Radar Chart',
    template: { mark: 'point', encoding: {} },
    channels: ['x', 'y', 'color', 'column', 'row'],
    markCognitiveChannel: 'position',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const axisField = channelSemantics.x?.field;
        const valueField = channelSemantics.y?.field;
        const groupField = channelSemantics.color?.field;

        if (!axisField || !valueField) return;

        const metrics = extractCategories(table, axisField, channelSemantics.x?.ordinalSortOrder);
        if (metrics.length < 2) return;

        const filled = chartProperties?.filled !== false;

        const series: any[] = [];

        if (groupField) {
            const groups = groupBy(table, groupField);
            for (const [name, rows] of groups) {
                const metricVals = new Map<string, { sum: number; count: number }>();
                for (const row of rows) {
                    const m = String(row[axisField]);
                    const v = Number(row[valueField]) || 0;
                    if (!metricVals.has(m)) metricVals.set(m, { sum: 0, count: 0 });
                    const entry = metricVals.get(m)!;
                    entry.sum += v;
                    entry.count += 1;
                }
                series.push({
                    name,
                    type: 'line',
                    data: metrics.map(m => {
                        const agg = metricVals.get(m);
                        return agg && agg.count > 0 ? agg.sum / agg.count : 0;
                    }),
                    fillOpacity: filled ? 0.3 : 0,
                });
            }
        } else {
            const metricVals = new Map<string, { sum: number; count: number }>();
            for (const row of table) {
                const m = String(row[axisField]);
                const v = Number(row[valueField]) || 0;
                if (!metricVals.has(m)) metricVals.set(m, { sum: 0, count: 0 });
                const entry = metricVals.get(m)!;
                entry.sum += v;
                entry.count += 1;
            }
            series.push({
                name: valueField,
                type: 'line',
                data: metrics.map(m => {
                    const agg = metricVals.get(m);
                    return agg && agg.count > 0 ? agg.sum / agg.count : 0;
                }),
                fillOpacity: filled ? 0.3 : 0,
            });
        }

        const option: any = {
            chart: { polar: true, type: 'line' },
            xAxis: {
                categories: metrics,
                tickmarkPlacement: 'on',
                lineWidth: 1,
            },
            yAxis: {
                gridLineInterpolation: 'polygon',
                min: 0,
            },
            legend: series.length > 1
                ? { layout: 'horizontal', align: 'center', verticalAlign: 'bottom' }
                : { enabled: false },
            tooltip: { shared: true },
            series,
        };
        Object.assign(spec, option);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        {
            key: 'filled', label: 'Fill area', type: 'discrete',
            options: [
                { value: true, label: 'Filled' },
                { value: false, label: 'Outline only' },
            ],
            defaultValue: true,
        } as ChartPropertyDef,
    ],
};
