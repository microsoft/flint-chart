// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Connected Scatter Plot template.
 *
 * Points in 2-D (x, y both quantitative) connected by a straight line in a
 * defined `order` — a trajectory, not a trend line. Mirrors
 * `ecConnectedScatterDef`: one `scatter` trace per group, `mode:
 * 'lines+markers'`, straight segments (never smoothed).
 */

import { ChartTemplateDef } from '../../core/types';
import { groupBy, getPlotlyPalette, getSeriesColor, sortByOrder } from './utils';

export const plConnectedScatterDef: ChartTemplateDef = {
    chart: 'Connected Scatter Plot',
    template: { mark: 'line', encoding: {} },
    channels: ['x', 'y', 'order', 'color', 'detail', 'column', 'row'],
    markCognitiveChannel: 'position',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table } = ctx;
        const xField = channelSemantics.x?.field;
        const yField = channelSemantics.y?.field;
        const orderField = channelSemantics.order?.field;
        const groupField = channelSemantics.color?.field ?? channelSemantics.detail?.field;
        if (!xField || !yField) return;

        const palette = getPlotlyPalette(ctx, 'color');
        const makeTrace = (name: string | undefined, rows: any[], idx: number) => {
            const sorted = sortByOrder(rows, orderField);
            const color = getSeriesColor(palette, idx);
            return {
                type: 'scatter',
                mode: 'lines+markers',
                ...(name != null ? { name } : {}),
                x: sorted.map((r: any) => r[xField]),
                y: sorted.map((r: any) => r[yField]),
                line: { color, shape: 'linear' as const },
                marker: { color, size: 7 },
            };
        };

        const traces: any[] = [];
        if (groupField) {
            let i = 0;
            for (const [name, rows] of groupBy(table, groupField)) { traces.push(makeTrace(name, rows, i)); i++; }
        } else {
            traces.push(makeTrace(undefined, table, 0));
        }

        const xAxisSpec: any = { title: { text: xField } };
        const yAxisSpec: any = { title: { text: yField } };
        // A trajectory reads its shape, not its distance from zero.
        if (channelSemantics.x?.zero) xAxisSpec.rangemode = channelSemantics.x.zero.zero !== false ? 'tozero' : 'normal';
        if (channelSemantics.y?.zero) yAxisSpec.rangemode = channelSemantics.y.zero.zero !== false ? 'tozero' : 'normal';

        Object.assign(spec, {
            data: traces,
            layout: { xaxis: xAxisSpec, yaxis: yAxisSpec, showlegend: !!groupField },
        });
        delete spec.mark;
        delete spec.encoding;
    },
};
