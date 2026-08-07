// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Slope Chart (slopegraph) template.
 *
 * One straight line per category connecting its value at two periods, with
 * markers at both ends. Mirrors `ecSlopeChartDef`: the period axis is always
 * a two-band category axis; the value axis fits the data (a slope chart
 * reads the *change*, not the distance from zero) unless the zero decision
 * says otherwise.
 */

import { ChartTemplateDef } from '../../core/types';
import { extractCategories, groupBy, buildCategoryAlignedData, getPlotlyPalette, getSeriesColor } from './utils';

/** Order period categories naturally: numeric, then chronological, else data order. */
function orderPeriods(categories: string[]): string[] {
    if (categories.length <= 1) return categories;
    if (categories.every(c => c.trim() !== '' && !isNaN(Number(c)))) {
        return [...categories].sort((a, b) => Number(a) - Number(b));
    }
    if (categories.every(c => !isNaN(Date.parse(c)))) {
        return [...categories].sort((a, b) => Date.parse(a) - Date.parse(b));
    }
    return categories;
}

export const plSlopeChartDef: ChartTemplateDef = {
    chart: 'Slope Chart',
    template: { mark: 'line', encoding: {} },
    channels: ['x', 'y', 'color', 'detail', 'column', 'row'],
    markCognitiveChannel: 'position',
    declareLayoutMode: () => ({
        axisFlags: { x: { banded: true } },
        paramOverrides: { defaultBandSize: 120, continuousMarkCrossSection: { x: 0, y: 0, seriesCountAxis: 'auto' } },
    }),
    instantiate: (spec, ctx) => {
        const { channelSemantics, table } = ctx;
        const xField = channelSemantics.x?.field;
        const yField = channelSemantics.y?.field;
        const groupField = channelSemantics.color?.field ?? channelSemantics.detail?.field;
        if (!xField || !yField) return;

        const categories = orderPeriods(extractCategories(table, xField, undefined));
        const palette = getPlotlyPalette(ctx, 'color');

        const makeTrace = (name: string | undefined, rows: any[], idx: number) => {
            const values = buildCategoryAlignedData(rows, xField, yField, categories);
            const color = getSeriesColor(palette, idx);
            return {
                type: 'scatter',
                mode: 'lines+markers',
                ...(name != null ? { name } : {}),
                x: categories, y: values,
                line: { color, shape: 'linear' as const },
                marker: { color, size: 7 },
                connectgaps: false,
            };
        };

        const traces: any[] = [];
        if (groupField) {
            let i = 0;
            for (const [name, rows] of groupBy(table, groupField)) { traces.push(makeTrace(name, rows, i)); i++; }
        } else {
            traces.push(makeTrace(undefined, table, 0));
        }

        // A slopegraph compares change between its two columns; anchoring the
        // value axis at zero compresses the slopes and contradicts the
        // data-fitted framing used by the other backends.
        const yAxisSpec: any = { title: { text: yField }, rangemode: 'normal' };

        Object.assign(spec, {
            data: traces,
            layout: {
                xaxis: { type: 'category', categoryorder: 'array', categoryarray: categories, title: { text: xField } },
                yaxis: yAxisSpec,
                showlegend: !!groupField,
            },
        });
        delete spec.mark;
        delete spec.encoding;
    },
};
