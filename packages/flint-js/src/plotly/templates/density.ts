// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Density Plot template (KDE area).
 *
 * Plotly has no native density transform; the curve is computed here
 * (Gaussian KDE, same bandwidth rule as the Vega-Lite/ECharts templates) and
 * drawn as a filled `scatter` line — mirroring `ecDensityPlotDef`.
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { groupBy, getPlotlyPalette, getSeriesColor, fillColor, kde } from './utils';

export const plDensityPlotDef: ChartTemplateDef = {
    chart: 'Density Plot',
    template: { mark: 'area', encoding: {} },
    channels: ['x', 'color', 'column', 'row'],
    markCognitiveChannel: 'area',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const xField = channelSemantics.x?.field;
        const colorField = channelSemantics.color?.field;
        if (!xField) return;

        const steps = 200;
        const bandwidthMultiplier = (chartProperties?.bandwidth != null && chartProperties.bandwidth > 0)
            ? chartProperties.bandwidth : 1;
        const palette = getPlotlyPalette(ctx, 'color');

        const traces: any[] = [];
        if (colorField) {
            const allValues = table.map((r: any) => Number(r[xField])).filter((v: number) => !isNaN(v));
            const sharedExtent = allValues.length > 0
                ? { min: Math.min(...allValues), max: Math.max(...allValues) } : undefined;
            let i = 0;
            for (const [name, rows] of groupBy(table, colorField)) {
                const values = rows.map((r: any) => Number(r[xField])).filter((v: number) => !isNaN(v));
                const { x, y } = kde(values, steps, bandwidthMultiplier, sharedExtent);
                const color = getSeriesColor(palette, i);
                traces.push({
                    type: 'scatter', mode: 'lines', name, x, y,
                    line: { color }, fill: 'tozeroy', fillcolor: fillColor(color, 0.4),
                });
                i++;
            }
        } else {
            const values = table.map((r: any) => Number(r[xField])).filter((v: number) => !isNaN(v));
            const { x, y } = kde(values, steps, bandwidthMultiplier);
            const color = getSeriesColor(palette, 0);
            traces.push({
                type: 'scatter', mode: 'lines', x, y,
                line: { color }, fill: 'tozeroy', fillcolor: fillColor(color, 0.4),
            });
        }

        Object.assign(spec, {
            data: traces,
            layout: {
                xaxis: { title: { text: xField } },
                yaxis: { title: { text: 'Density' }, rangemode: 'tozero' },
                showlegend: !!colorField,
            },
        });
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        { key: 'bandwidth', label: 'Bandwidth', type: 'continuous', min: 0.05, max: 2, step: 0.05, defaultValue: 0 } as ChartPropertyDef,
    ],
};
