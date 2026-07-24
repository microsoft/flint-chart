// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Area Chart template (single + multi-series).
 *
 * Mirrors the Chart.js Area template's decisions. Plotly renders areas as
 * scatter traces with `fill`; multi-series stacking uses `stackgroup`
 * (the Plotly-native equivalent of Chart.js `fill: 'stack'`).
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import {
    extractCategories,
    groupBy,
    buildCategoryAlignedData,
    coerceIsoDateForPlotly,
    getPlotlyPalette,
    getSeriesColor,
} from './utils';

const isDiscrete = (type: string | undefined) => type === 'nominal' || type === 'ordinal';

/** Hex → rgba with alpha, for translucent area fills. */
function fillColor(hex: string, alpha: number): string {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
    if (!m) return hex;
    const v = parseInt(m[1], 16);
    const a = Math.max(0, Math.min(1, alpha));
    return `rgba(${(v >> 16) & 255}, ${(v >> 8) & 255}, ${v & 255}, ${a})`;
}

export const plAreaChartDef: ChartTemplateDef = {
    chart: 'Area Chart',
    template: { mark: 'area', encoding: {} },
    channels: ['x', 'y', 'color', 'opacity', 'column', 'row'],
    markCognitiveChannel: 'area',
    declareLayoutMode: () => ({
        paramOverrides: { continuousMarkCrossSection: { x: 100, y: 20, seriesCountAxis: 'auto' }, facetAspectRatioResistance: 0.5 },
    }),
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const xCS = channelSemantics.x;
        const yCS = channelSemantics.y;
        const colorField = channelSemantics.color?.field;

        if (!xCS?.field || !yCS?.field) return;
        const xField = xCS.field;
        const yField = yCS.field;

        const xIsDiscrete = isDiscrete(xCS.type);
        const xIsTemporal = xCS.type === 'temporal';
        const mapX = (raw: unknown) => (xIsTemporal ? coerceIsoDateForPlotly(raw) : raw);

        const categories = xIsDiscrete
            ? extractCategories(table, xField, xCS.ordinalSortOrder)
            : undefined;

        const opacity = Number(chartProperties?.opacity ?? 0.4);
        const stackMode = chartProperties?.stackMode;
        const stacked = stackMode !== 'layered';
        const smooth = chartProperties?.interpolate === 'monotone';

        const palette = getPlotlyPalette(ctx, 'color');
        const traces: any[] = [];
        const makeTrace = (name: string, rows: any[], colorIndex: number) => {
            const xVals = xIsDiscrete ? categories! : rows.map(r => mapX(r[xField]));
            const yVals = xIsDiscrete
                ? buildCategoryAlignedData(rows, xField, yField, categories!)
                : rows.map(r => (r[yField] == null ? null : r[yField]));
            const color = getSeriesColor(palette, colorIndex);
            const trace: any = {
                type: 'scatter',
                mode: 'lines',
                name,
                x: xVals,
                y: yVals,
                line: { color, shape: smooth ? 'spline' : 'linear' },
                fillcolor: fillColor(color, opacity),
            };
            if (colorField && stacked) {
                trace.stackgroup = 'one';
            } else {
                trace.fill = 'tozeroy';
            }
            return trace;
        };

        if (colorField) {
            let i = 0;
            for (const [name, rows] of groupBy(table, colorField)) {
                traces.push(makeTrace(name, rows, i));
                i++;
            }
        } else {
            traces.push(makeTrace(yField, table, 0));
        }

        // 100%-stacked: Plotly normalizes a stackgroup when the FIRST trace in
        // the group carries `groupnorm: 'percent'`.
        if (colorField && stacked && stackMode === 'normalize' && traces.length > 0) {
            traces[0].groupnorm = 'percent';
        }

        const xAxisSpec: any = { title: { text: xField } };
        if (xIsDiscrete) {
            xAxisSpec.type = 'category';
            xAxisSpec.categoryorder = 'array';
            xAxisSpec.categoryarray = categories;
        } else if (xIsTemporal) {
            xAxisSpec.type = 'date';
        }

        const yAxisSpec: any = { title: { text: yField } };
        if (yCS.zero) {
            yAxisSpec.rangemode = yCS.zero.zero !== false ? 'tozero' : 'normal';
        }

        const figure: any = {
            data: traces,
            layout: {
                xaxis: xAxisSpec,
                yaxis: yAxisSpec,
                showlegend: !!colorField,
            },
        };

        Object.assign(spec, figure);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        {
            key: 'interpolate', label: 'Curve', type: 'discrete', options: [
                { value: undefined, label: 'Default (linear)' },
                { value: 'linear', label: 'Linear' },
                { value: 'monotone', label: 'Monotone (smooth)' },
            ],
        } as ChartPropertyDef,
        { key: 'opacity', label: 'Opacity', type: 'continuous', min: 0.1, max: 1, step: 0.05, defaultValue: 0.4 } as ChartPropertyDef,
        {
            key: 'stackMode', label: 'Stack', type: 'discrete',
            check: (ctx) => ({ applicable: !!ctx.encodings.color?.field }),
            options: [
                { value: undefined, label: 'Stacked (default)' },
                { value: 'normalize', label: 'Normalize (100%)' },
                { value: 'layered', label: 'Layered (overlap)' },
            ],
        } as ChartPropertyDef,
    ],
};
