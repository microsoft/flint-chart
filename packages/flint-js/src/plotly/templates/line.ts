// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Line Chart template (single + multi-series).
 *
 * Mirrors the Chart.js Line template's decisions. Plotly differences:
 *   - temporal x uses Plotly's native `date` axis (ISO strings), no tick
 *     callback needed — figures stay pure JSON
 *   - one trace per series; the legend comes from trace `name`s
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

/** Map the shared `interpolate` property onto Plotly's `line.shape`. */
function lineShape(interpolate: unknown): 'linear' | 'spline' | 'hv' | 'vh' | 'hvh' {
    switch (interpolate) {
        case 'monotone':
        case 'basis':
        case 'cardinal':
        case 'catmull-rom':
            return 'spline';
        case 'step':
            return 'hvh';
        case 'step-before':
            return 'vh';
        case 'step-after':
            return 'hv';
        default:
            return 'linear';
    }
}

export const plLineChartDef: ChartTemplateDef = {
    chart: 'Line Chart',
    template: { mark: 'line', encoding: {} },
    channels: ['x', 'y', 'color', 'opacity', 'column', 'row'],
    markCognitiveChannel: 'position',
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

        const shape = lineShape(chartProperties?.interpolate);
        const showPoints = chartProperties?.showPoints === true;
        const mode = showPoints ? 'lines+markers' : 'lines';

        const palette = getPlotlyPalette(ctx, 'color');
        const traces: any[] = [];
        const makeTrace = (name: string, rows: any[], colorIndex: number) => {
            const xVals = xIsDiscrete
                ? categories!
                : rows.map(r => mapX(r[xField]));
            const yVals = xIsDiscrete
                ? buildCategoryAlignedData(rows, xField, yField, categories!)
                : rows.map(r => (r[yField] == null ? null : r[yField]));
            return {
                type: 'scatter',
                mode,
                name,
                x: xVals,
                y: yVals,
                line: { color: getSeriesColor(palette, colorIndex), shape },
            };
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
                { value: 'step', label: 'Step' },
                { value: 'step-before', label: 'Step Before' },
                { value: 'step-after', label: 'Step After' },
            ],
        } as ChartPropertyDef,
        { key: 'showPoints', label: 'Show points', type: 'binary', defaultValue: false } as ChartPropertyDef,
    ],
};
