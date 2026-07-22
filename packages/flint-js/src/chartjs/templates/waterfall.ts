// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Chart.js Waterfall Chart — cumulative bars with start / delta / end
 * (mirror vegalite/templates/waterfall.ts and echarts/templates/waterfall.ts).
 *
 * Channels:
 *   - x      category / step label (the banded axis)
 *   - y      signed amount for the step
 *   - color  optional explicit type column (start / increase / decrease / end)
 *
 * Each bar floats between the running total before and after its step, which
 * Chart.js expresses natively as a `[base, top]` bar value. The first and last
 * bars are anchored at zero (totals); the middle bars float from the previous
 * cumulative value. Bars are colored start/end blue, increase green, decrease
 * red.
 */

import { ChartTemplateDef } from '../../core/types';
import { resolveTotalsMode } from '../../chart-types/waterfall';
import { extractCategories } from './utils';

const COLOR = {
    startEnd: { bg: 'rgba(84, 112, 198, 0.65)', border: 'rgba(84, 112, 198, 1)' },
    increase: { bg: 'rgba(145, 204, 117, 0.65)', border: 'rgba(145, 204, 117, 1)' },
    decrease: { bg: 'rgba(238, 102, 102, 0.65)', border: 'rgba(238, 102, 102, 1)' },
};

export const cjsWaterfallChartDef: ChartTemplateDef = {
    chart: 'Waterfall Chart',
    template: { mark: 'bar', encoding: {} },
    channels: ['x', 'y', 'color', 'column', 'row'],
    markCognitiveChannel: 'length',
    declareLayoutMode: () => ({ axisFlags: { x: { banded: true } } }),
    instantiate: (spec, ctx) => {
        const { channelSemantics, table } = ctx;
        const catField = channelSemantics.x?.field;
        const valField = channelSemantics.y?.field;
        const colorField = channelSemantics.color?.field;
        if (!catField || !valField || table.length === 0) return;

        const categories = extractCategories(table, catField, channelSemantics.x?.ordinalSortOrder);
        const rows = categories
            .map((cat) => table.find((r: any) => String(r[catField]) === cat))
            .filter(Boolean) as any[];
        const values = rows.map((r) => Number(r[valField]) || 0);

        // Data-aware totals default (see chart-types/waterfall.ts): first is a start
        // total, last is a total only when it reconciles with the prior
        // cumulative. The user's `totals` property overrides this; an explicit
        // color/type column is authoritative. Mirror vegalite/echarts templates.
        const totalsMode = resolveTotalsMode(values, ctx.chartProperties?.totals);
        const wantFirst = totalsMode === 'first' || totalsMode === 'both';
        const wantLast = totalsMode === 'last' || totalsMode === 'both';
        const types: string[] = colorField
            ? rows.map((r) => String(r[colorField] ?? 'delta'))
            : values.map((_, i) =>
                wantFirst && i === 0 ? 'start'
                    : wantLast && i === values.length - 1 ? 'end'
                        : 'delta');

        // Cumulative running total including the current row.
        const cumulative: number[] = [];
        let acc = 0;
        for (const v of values) { acc += v; cumulative.push(acc); }

        const data: Array<[number, number]> = [];
        const bg: string[] = [];
        const border: string[] = [];
        for (let i = 0; i < values.length; i++) {
            const v = values[i];
            const t = types[i];
            const isTotal = t === 'start' || t === 'end';
            const top = t === 'end' ? cumulative[i] - v : cumulative[i];
            const prev = isTotal ? 0 : cumulative[i] - v;
            const lo = Math.min(prev, top);
            const hi = Math.max(prev, top);
            data.push([lo, hi]);
            const c = isTotal ? COLOR.startEnd : top >= prev ? COLOR.increase : COLOR.decrease;
            bg.push(c.bg);
            border.push(c.border);
        }

        const legendItems = [
            { text: 'Start/End', color: COLOR.startEnd },
            { text: 'Increase', color: COLOR.increase },
            { text: 'Decrease', color: COLOR.decrease },
        ];

        const config: any = {
            type: 'bar',
            data: {
                labels: categories,
                datasets: [{
                    label: valField,
                    data,
                    backgroundColor: bg,
                    borderColor: border,
                    borderWidth: 1,
                    borderSkipped: false,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { title: { display: true, text: catField } },
                    y: { beginAtZero: true, title: { display: true, text: valField } },
                },
                plugins: {
                    legend: {
                        display: true,
                        labels: {
                            generateLabels: () => legendItems.map((it) => ({
                                text: it.text,
                                fillStyle: it.color.bg,
                                strokeStyle: it.color.border,
                                lineWidth: 1,
                            })),
                        },
                    },
                    tooltip: {
                        callbacks: {
                            label: (item: any) => {
                                const [lo, hi] = item.raw as [number, number];
                                return `${valField}: ${Math.round((hi - lo) * 100) / 100}`;
                            },
                        },
                    },
                },
            },
        };

        Object.assign(spec, config);
        delete spec.mark;
        delete spec.encoding;
    },
};
