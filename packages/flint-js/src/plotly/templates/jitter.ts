// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Strip Plot (categorical scatter with jitter) template.
 *
 * The jittered category axis is a numeric axis with explicit `tickvals` /
 * `ticktext` at integer positions (Plotly has no native "jittered category"
 * axis), so fractional jitter offsets can be plotted directly — mirroring
 * `ecStripPlotDef`'s hidden-value-axis trick.
 */

import { ChartTemplateDef } from '../../core/types';
import { isDiscreteType, extractCategories, groupBy, getPlotlyPalette, getSeriesColor, seededJitter } from './utils';

export const plStripPlotDef: ChartTemplateDef = {
    chart: 'Strip Plot',
    template: { mark: 'circle', encoding: {} },
    channels: ['x', 'y', 'color', 'size', 'column', 'row'],
    markCognitiveChannel: 'position',
    declareLayoutMode: () => ({
        paramOverrides: { defaultBandSize: 50, minStep: 16 },
    }),
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, colorDecisions } = ctx;
        const xCS = channelSemantics.x;
        const yCS = channelSemantics.y;
        const xField = xCS?.field;
        const yField = yCS?.field;
        const colorField = channelSemantics.color?.field;
        const colorType = channelSemantics.color?.type;
        const isContinuousColor = !!colorField && (colorType === 'quantitative' || colorType === 'temporal');
        if (!xField || !yField) return;

        const xIsDiscrete = isDiscreteType(xCS?.type);
        const yIsDiscrete = isDiscreteType(yCS?.type);
        const catAxis: 'x' | 'y' = xIsDiscrete ? 'x' : yIsDiscrete ? 'y' : 'x';
        const catField = catAxis === 'x' ? xField : yField;
        const contField = catAxis === 'x' ? yField : xField;

        const categories = extractCategories(table, catField!, channelSemantics[catAxis]?.ordinalSortOrder);
        const catIndex = new Map(categories.map((c, i) => [c, i]));
        const rand = seededJitter(42);
        const jitterHalfWidth = 0.3;

        const catCoord = (row: any) => {
            const idx = catIndex.get(String(row[catField!] ?? '')) ?? 0;
            return idx + rand() * jitterHalfWidth;
        };

        const catAxisSpec = {
            tickmode: 'array' as const,
            tickvals: categories.map((_c, i) => i),
            ticktext: categories,
            range: [-0.5, categories.length - 0.5],
            title: { text: catField },
            zeroline: false,
        };
        const contAxisSpec = { title: { text: contField } };

        const traces: any[] = [];
        const buildXY = (row: any) => {
            const cv = catCoord(row);
            return catAxis === 'x' ? [cv, row[contField!]] : [row[contField!], cv];
        };

        if (isContinuousColor && colorField) {
            const colorVals = table.map((r: any) => Number(r[colorField])).filter((v: number) => isFinite(v));
            const cmin = colorVals.length ? Math.min(...colorVals) : 0;
            const cmax = colorVals.length ? Math.max(...colorVals) : 1;
            traces.push({
                type: 'scatter',
                mode: 'markers',
                name: colorField,
                x: table.map((r: any) => buildXY(r)[0]),
                y: table.map((r: any) => buildXY(r)[1]),
                marker: {
                    color: table.map((r: any) => Number(r[colorField])),
                    colorscale: 'Viridis',
                    cmin, cmax,
                    showscale: true,
                    colorbar: { title: { text: colorField } },
                    opacity: 0.75,
                    size: 8,
                },
            });
        } else if (colorField) {
            const palette = getPlotlyPalette(ctx, 'color');
            let i = 0;
            for (const [name, rows] of groupBy(table, colorField)) {
                traces.push({
                    type: 'scatter',
                    mode: 'markers',
                    name,
                    x: rows.map((r: any) => buildXY(r)[0]),
                    y: rows.map((r: any) => buildXY(r)[1]),
                    marker: { color: getSeriesColor(palette, i), opacity: 0.75, size: 8 },
                });
                i++;
            }
        } else {
            const palette = getPlotlyPalette(ctx, 'color');
            traces.push({
                type: 'scatter',
                mode: 'markers',
                x: table.map((r: any) => buildXY(r)[0]),
                y: table.map((r: any) => buildXY(r)[1]),
                marker: { color: getSeriesColor(palette, 0), opacity: 0.75, size: 8 },
            });
        }
        void colorDecisions;

        Object.assign(spec, {
            data: traces,
            layout: {
                ...(catAxis === 'x' ? { xaxis: catAxisSpec, yaxis: contAxisSpec } : { xaxis: contAxisSpec, yaxis: catAxisSpec }),
                showlegend: !!colorField && !isContinuousColor,
            },
        });
        delete spec.mark;
        delete spec.encoding;
    },
};
