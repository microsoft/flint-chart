// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * CanvasXpress Loess template — a Scatter2D with a locally-weighted (loess) fit
 * and confidence band. The non-parametric counterpart to the Regression chart;
 * CanvasXpress computes the smooth via `showLoessFit`.
 */

import { ChartTemplateDef } from '../../core/types';

export const cxLoessDef: ChartTemplateDef = {
    chart: 'Loess Fit',
    template: { graphType: 'Scatter2D', data: { y: { vars: [], smps: [], data: [] } }, config: {} },
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

        spec.graphType = 'Scatter2D';
        spec.data = { y: { vars, smps: [xField, yField], data } };
        spec.config = {
            ...spec.config,
            graphType: 'Scatter2D',
            xAxis: [xField],
            yAxis: [yField],
            xAxisTitle: xField,
            yAxisTitle: yField,
            // The loess smooth + confidence band.
            showLoessFit: true,
            showLegend: false,
        };
    },
};
