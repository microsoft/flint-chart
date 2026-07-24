// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Histogram template.
 *
 * Plotly has a native `histogram` trace: pass raw numeric values and
 * `nbinsx` and Plotly computes the bins client-side (matching Vega-Lite's
 * `bin: true` transform) — no manual bin-counting like Chart.js/ECharts need.
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { groupBy, getPlotlyPalette, getSeriesColor } from './utils';

export const plHistogramDef: ChartTemplateDef = {
    chart: 'Histogram',
    template: { mark: 'bar', encoding: {} },
    channels: ['x', 'color', 'column', 'row'],
    markCognitiveChannel: 'length',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const xField = channelSemantics.x?.field;
        const colorField = channelSemantics.color?.field;
        if (!xField) return;

        const binCount = chartProperties?.binCount || 10;
        const palette = getPlotlyPalette(ctx, 'color');

        const traces: any[] = [];
        if (colorField) {
            let i = 0;
            for (const [name, rows] of groupBy(table, colorField)) {
                traces.push({
                    type: 'histogram',
                    name,
                    x: rows.map((r: any) => Number(r[xField])).filter((v: number) => isFinite(v)),
                    nbinsx: binCount,
                    marker: { color: getSeriesColor(palette, i) },
                    opacity: 0.75,
                });
                i++;
            }
        } else {
            traces.push({
                type: 'histogram',
                x: table.map((r: any) => Number(r[xField])).filter((v: number) => isFinite(v)),
                nbinsx: binCount,
                marker: { color: getSeriesColor(palette, 0) },
            });
        }

        Object.assign(spec, {
            data: traces,
            layout: {
                barmode: colorField ? 'stack' : undefined,
                bargap: 0.02,
                xaxis: { title: { text: xField } },
                yaxis: { title: { text: 'Count' }, rangemode: 'tozero' },
                showlegend: !!colorField,
            },
        });
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        { key: 'binCount', label: 'Max Bins', type: 'continuous', min: 5, max: 50, step: 1, defaultValue: 10 } as ChartPropertyDef,
    ],
};
