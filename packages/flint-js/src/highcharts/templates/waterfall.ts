// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Highcharts Waterfall Chart template.
 *
 * Highcharts mapping:
 *   HC: series.type = 'waterfall' natively renders floating cumulative bars.
 *       Points flagged isSum/isIntermediateSum are totals anchored at zero.
 *
 * Channels:
 *   - x      category / step label (the banded axis)
 *   - y      signed amount for the step
 *   - color  optional explicit type column (start / increase / decrease / end)
 *
 * Mirrors chartjs/templates/waterfall.ts and echarts/templates/waterfall.ts.
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { resolveTotalsMode } from '../../chart-types/waterfall';
import { extractCategories } from './utils';

const UP_COLOR = '#91cc71';
const DOWN_COLOR = '#ee6666';
const TOTAL_COLOR = '#2f7ed8';

export const hcWaterfallChartDef: ChartTemplateDef = {
    chart: 'Waterfall Chart',
    template: { mark: 'bar', encoding: {} },
    channels: ['x', 'y', 'color', 'column', 'row'],
    markCognitiveChannel: 'length',
    declareLayoutMode: () => ({ axisFlags: { x: { banded: true } } }),
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const catField = channelSemantics.x?.field;
        const valField = channelSemantics.y?.field;
        const colorField = channelSemantics.color?.field;
        if (!catField || !valField || table.length === 0) return;

        const categories = extractCategories(table, catField, channelSemantics.x?.ordinalSortOrder);
        const rows = categories
            .map((cat) => table.find((r: any) => String(r[catField]) === cat))
            .filter(Boolean) as any[];
        const values = rows.map((r) => Number(r[valField]) || 0);

        const totalsMode = resolveTotalsMode(values, chartProperties?.totals);
        const wantFirst = totalsMode === 'first' || totalsMode === 'both';
        const wantLast = totalsMode === 'last' || totalsMode === 'both';
        const types: string[] = colorField
            ? rows.map((r) => String(r[colorField] ?? 'delta'))
            : values.map(((_, i) =>
                wantFirst && i === 0 ? 'start'
                    : wantLast && i === values.length - 1 ? 'end'
                        : 'delta'));

        // Cumulative running total including the current row.
        const cumulative: number[] = [];
        let acc = 0;
        for (const v of values) { acc += v; cumulative.push(acc); }

        // Highcharts computes the floating positions itself: each delta is the
        // signed step value, and totals are isSum points anchored at 0. For an
        // end total the row's value IS the total (it reconciles with the prior
        // cumulative), so it is passed through unchanged.
        const data = values.map((v, i) => {
            const t = types[i];
            const isTotal = t === 'start' || t === 'end';
            const point: any = {
                y: v,
                color: isTotal ? TOTAL_COLOR : v >= 0 ? UP_COLOR : DOWN_COLOR,
            };
            if (isTotal) point.isSum = true;
            return point;
        });

        const option: any = {
            chart: { type: 'column' },
            xAxis: {
                categories,
                title: { text: catField },
            },
            yAxis: {
                title: { text: valField },
                min: Math.min(0, ...values),
            },
            legend: { enabled: false },
            tooltip: {
                pointFormat: '<b>{point.low}</b> → <b>{point.high}</b> ({point.change:+.2f})',
            },
            plotOptions: {
                waterfall: {
                    borderColor: '#333333',
                    borderWidth: 1,
                    dashStyle: 'Dot',
                },
            },
            series: [{
                type: 'waterfall',
                name: valField,
                data,
            }],
        };
        Object.assign(spec, option);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        {
            key: 'totals', label: 'Totals', type: 'discrete',
            options: [
                { value: 'auto', label: 'Auto (data-aware)' },
                { value: 'first', label: 'First only' },
                { value: 'last', label: 'Last only' },
                { value: 'both', label: 'First and last' },
            ],
            defaultValue: 'auto',
        } as ChartPropertyDef,
    ],
};
