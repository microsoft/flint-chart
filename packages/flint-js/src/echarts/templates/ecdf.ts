// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * ECharts ECDF Plot (Empirical Cumulative Distribution Function) template.
 *
 * Align with vegalite/templates/ecdf.ts. ECharts has no transform pipeline, so
 * we precompute here: for each color/detail group, sort the numeric values
 * ascending and emit (value, cumulative-proportion) pairs using the "≤ x"
 * convention — each DISTINCT value maps to the proportion at its LAST occurrence
 * (ties collapsed). The series is a `line` with `step: 'end'` (= step-after: the
 * proportion holds until the next value, then jumps), drawn on a `value` x-axis;
 * the y-axis is pinned to [0, 1]. One series per group; the curve is
 * non-decreasing and reaches 1.0 at the largest value.
 *
 * Why VL and EC specs differ: VL keeps raw rows + a window transform that
 * computes the running proportion at render time; EC stores the derived step
 * curve directly in series[].data. Both produce the SAME monotonic step shape.
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { groupBy } from './utils';

/**
 * Sorted distinct (value, cumulative-proportion) pairs using the "≤ x"
 * convention. Ties collapse to the proportion at the value's last occurrence,
 * so the curve is strictly the empirical CDF and ends at 1.0.
 */
function ecdfPairs(values: number[]): [number, number][] {
    const sorted = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
    const n = sorted.length;
    const pairs: [number, number][] = [];
    if (n === 0) return pairs;
    let i = 0;
    while (i < n) {
        let j = i;
        while (j + 1 < n && sorted[j + 1] === sorted[i]) j++;
        // Last occurrence index (0-based) = j → count(≤ value) = j + 1.
        pairs.push([sorted[i], (j + 1) / n]);
        i = j + 1;
    }
    return pairs;
}

export const ecEcdfPlotDef: ChartTemplateDef = {
    chart: 'ECDF Plot',
    template: { mark: 'line', encoding: {} },
    channels: ['x', 'color', 'detail', 'column', 'row'],
    markCognitiveChannel: 'position',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const xField = channelSemantics.x?.field;
        // One ECDF per group: prefer color, fall back to detail.
        const groupField = channelSemantics.color?.field ?? channelSemantics.detail?.field;
        if (!xField) return;

        const showPoints = !!chartProperties?.showPoints;

        const option: any = {
            tooltip: { trigger: 'axis', axisPointer: { type: 'cross' } },
            xAxis: {
                type: 'value',
                name: xField,
                nameLocation: 'middle',
                nameGap: 30,
                // Fit the measure range (an ECDF reads the value of the rise, not
                // distance from zero).
                scale: true,
                axisTick: { show: true },
            },
            yAxis: {
                type: 'value',
                name: 'Cumulative proportion',
                nameLocation: 'middle',
                nameGap: 45,
                min: 0,
                max: 1,
                axisTick: { show: true },
            },
            series: [],
        };
        option._encodingTooltip = { trigger: 'axis', categoryLabel: xField, valueLabel: 'Cumulative proportion' };

        const makeSeries = (name: string | undefined, values: number[]) => ({
            ...(name != null ? { name } : {}),
            type: 'line' as const,
            // step-after: hold the proportion until the next value, then jump.
            step: 'end' as const,
            data: ecdfPairs(values),
            showSymbol: showPoints,
            symbol: 'circle' as const,
            symbolSize: 6,
            lineStyle: { width: 2 },
            emphasis: { focus: 'series' as const },
        });

        if (groupField) {
            const groups = groupBy(table, groupField);
            option.legend = { data: [...groups.keys()] };
            option._legendTitle = groupField;
            for (const [name, rows] of groups) {
                const values = rows.map((r: any) => Number(r[xField])).filter((v: number) => !isNaN(v));
                option.series.push(makeSeries(name, values));
            }
        } else {
            const values = table.map((r: any) => Number(r[xField])).filter((v: number) => !isNaN(v));
            option.series.push(makeSeries(undefined, values));
        }

        Object.assign(spec, option);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        { key: 'showPoints', label: 'Points', type: 'binary', defaultValue: false } as ChartPropertyDef,
    ],
};
