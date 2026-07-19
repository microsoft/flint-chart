// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Chart.js ECDF Plot (Empirical Cumulative Distribution Function) template.
 *
 * Align with vegalite/templates/ecdf.ts and echarts/templates/ecdf.ts. Chart.js
 * has no transform pipeline, so we precompute the same sorted cumulative arrays:
 * for each color/detail group, sort the numeric values ascending and emit
 * {x, y} points using the "≤ x" convention (ties collapse to the proportion at
 * the value's last occurrence). Each group is one `line` dataset with
 * `stepped: 'after'` (= step-after, matching VL's `step-after` and ECharts'
 * `step: 'end'`), drawn on a `linear` x-axis; the y-axis is pinned to [0, 1].
 *
 * Core Chart.js only — no plugins. A measure is always quantitative, so a linear
 * x-axis is correct (never temporal).
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { groupBy, getChartJsPalette, getSeriesBorderColor } from './utils';

/**
 * Sorted distinct {x, y} ECDF points using the "≤ x" convention. Ties collapse
 * to the proportion at the value's last occurrence, so the curve is
 * non-decreasing and ends at y = 1.0.
 */
function ecdfPoints(values: number[]): { x: number; y: number }[] {
    const sorted = values.filter(v => Number.isFinite(v)).sort((a, b) => a - b);
    const n = sorted.length;
    const out: { x: number; y: number }[] = [];
    if (n === 0) return out;
    let i = 0;
    while (i < n) {
        let j = i;
        while (j + 1 < n && sorted[j + 1] === sorted[i]) j++;
        out.push({ x: sorted[i], y: (j + 1) / n });
        i = j + 1;
    }
    return out;
}

export const cjsEcdfPlotDef: ChartTemplateDef = {
    chart: 'ECDF Plot',
    template: { mark: 'line', encoding: {} },
    channels: ['x', 'color', 'detail', 'column', 'row'],
    markCognitiveChannel: 'position',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const xField = channelSemantics.x?.field;
        // One ECDF per dataset: prefer color, fall back to detail.
        const groupField = channelSemantics.color?.field ?? channelSemantics.detail?.field;
        if (!xField) return;

        const showPoints = !!chartProperties?.showPoints;
        const palette = getChartJsPalette(ctx, 'color');

        const config: any = {
            type: 'line',
            data: { datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: 'linear',
                        title: { display: true, text: xField },
                        ticks: { font: { size: 10 } },
                    },
                    y: {
                        type: 'linear',
                        min: 0,
                        max: 1,
                        title: { display: true, text: 'Cumulative proportion' },
                        ticks: { font: { size: 10 } },
                    },
                },
                plugins: {
                    tooltip: { enabled: true },
                    legend: { display: false },
                },
            },
        };

        const pushDataset = (name: string, values: number[], idx: number) => {
            config.data.datasets.push({
                label: name,
                data: ecdfPoints(values),
                borderColor: getSeriesBorderColor(palette, idx),
                backgroundColor: 'transparent',
                // step-after: hold the proportion until the next value, then jump.
                stepped: 'after',
                pointRadius: showPoints ? 3 : 0,
                borderWidth: 2,
                fill: false,
                tension: 0,
            });
        };

        if (groupField) {
            const groups = groupBy(table, groupField);
            config.options.plugins.legend = { display: true };
            let idx = 0;
            for (const [name, rows] of groups) {
                const values = rows.map((r: any) => Number(r[xField])).filter((v: number) => !isNaN(v));
                pushDataset(String(name), values, idx);
                idx++;
            }
        } else {
            const values = table.map((r: any) => Number(r[xField])).filter((v: number) => !isNaN(v));
            pushDataset(xField, values, 0);
        }

        Object.assign(spec, config);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        { key: 'showPoints', label: 'Points', type: 'binary', defaultValue: false } as ChartPropertyDef,
    ],
};
