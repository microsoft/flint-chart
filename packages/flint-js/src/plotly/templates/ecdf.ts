// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly ECDF Plot template.
 *
 * Plotly has no cumulative-distribution transform; the step curve is
 * precomputed (mirroring `ecEcdfPlotDef`) and drawn as a `scatter` trace with
 * `line.shape: 'hv'` (step-after — Plotly's equivalent of ECharts' `step:
 * 'end'`).
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { groupBy, getPlotlyPalette, getSeriesColor, ecdfPairs } from './utils';

export const plEcdfPlotDef: ChartTemplateDef = {
    chart: 'ECDF Plot',
    template: { mark: 'line', encoding: {} },
    channels: ['x', 'color', 'detail', 'column', 'row'],
    markCognitiveChannel: 'position',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const xField = channelSemantics.x?.field;
        const groupField = channelSemantics.color?.field ?? channelSemantics.detail?.field;
        if (!xField) return;

        const showPoints = !!chartProperties?.showPoints;
        const palette = getPlotlyPalette(ctx, 'color');

        const makeTrace = (name: string | undefined, values: number[], idx: number) => {
            const pairs = ecdfPairs(values);
            return {
                type: 'scatter',
                mode: showPoints ? 'lines+markers' as const : 'lines' as const,
                ...(name != null ? { name } : {}),
                x: pairs.map(p => p[0]),
                y: pairs.map(p => p[1]),
                line: { shape: 'hv' as const, color: getSeriesColor(palette, idx), width: 2 },
                marker: { size: 6 },
            };
        };

        const traces: any[] = [];
        if (groupField) {
            let i = 0;
            for (const [name, rows] of groupBy(table, groupField)) {
                traces.push(makeTrace(name, rows.map((r: any) => Number(r[xField])).filter((v: number) => !isNaN(v)), i));
                i++;
            }
        } else {
            traces.push(makeTrace(undefined, table.map((r: any) => Number(r[xField])).filter((v: number) => !isNaN(v)), 0));
        }

        Object.assign(spec, {
            data: traces,
            layout: {
                xaxis: { title: { text: xField } },
                yaxis: { title: { text: 'Cumulative proportion' }, range: [0, 1] },
                showlegend: !!groupField,
            },
        });
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        { key: 'showPoints', label: 'Points', type: 'binary', defaultValue: false } as ChartPropertyDef,
    ],
};
