// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * CanvasXpress Density Contour template (graphType 'Contour').
 *
 * A 2-D kernel-density contour over scattered points. Uses the scatter point
 * shape (vars = point ids, smps = [xField, yField]); `xAxis`/`yAxis` name the
 * plotted variables and the engine estimates the density surface.
 */

import { ChartTemplateDef } from '../../core/types';

export const cxDensityContourDef: ChartTemplateDef = {
    chart: 'Density Contour',
    template: { graphType: 'Contour', data: { y: { vars: [], smps: [], data: [] } }, config: {} },
    channels: ['x', 'y', 'color'],
    markCognitiveChannel: 'position',
    declareLayoutMode: () => ({ axisFlags: {} }),

    instantiate: (spec: any, ctx) => {
        const { channelSemantics, table } = ctx;
        const xField = channelSemantics.x?.field;
        const yField = channelSemantics.y?.field;
        if (!xField || !yField) return;

        const toNum = (raw: any) => {
            const n = raw == null || raw === '' ? null : Number(raw);
            return Number.isNaN(n as number) ? null : n;
        };
        const vars: string[] = [];
        const data: (number | null)[][] = [];
        for (let i = 0; i < table.length; i++) {
            vars.push('p' + (i + 1));
            data.push([toNum(table[i][xField]), toNum(table[i][yField])]);
        }

        spec.graphType = 'Contour';
        spec.data = { y: { vars, smps: [xField, yField], data } };
        spec.config = {
            ...spec.config,
            graphType: 'Contour',
            xAxis: [xField],
            yAxis: [yField],
            xAxisTitle: xField,
            yAxisTitle: yField,
            // Filled density bands (matching Vega-Lite's filled contour), not just lines.
            contourFilled: true,
            // Overlay the raw observations the density was estimated from.
            showContourDataPoints: true,
            showLegend: false,
        };
    },
};
