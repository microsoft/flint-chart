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
import { makeCartesianPivot } from '../../core/pivot';

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
        const { channelSemantics, table, chartProperties, colorDecisions } = ctx;
        const xCS = channelSemantics.x;
        const yCS = channelSemantics.y;
        const colorField = channelSemantics.color?.field;
        const colorType = channelSemantics.color?.type;
        const continuousColor = !!colorField
            && (colorType === 'quantitative' || colorType === 'temporal');

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

        if (continuousColor && colorField) {
            const rows = table;
            const xVals = xIsDiscrete
                ? categories!
                : rows.map(r => mapX(r[xField]));
            const yVals = xIsDiscrete
                ? buildCategoryAlignedData(rows, xField, yField, categories!)
                : rows.map(r => (r[yField] == null ? null : r[yField]));
            const toColor = colorType === 'temporal'
                ? (value: any) => value == null ? NaN : new Date(value).getTime()
                : (value: any) => value == null ? NaN : Number(value);
            const colorVals = rows.map(r => toColor(r[colorField]));
            const finite = colorVals.filter(Number.isFinite);
            const decision = colorDecisions?.color ?? colorDecisions?.group;
            traces.push(
                {
                    type: 'scatter',
                    mode: 'lines',
                    x: xVals,
                    y: yVals,
                    line: { color: '#cccccc', shape },
                    hoverinfo: 'skip',
                    showlegend: false,
                    _role: 'context',
                },
                {
                    type: 'scatter',
                    mode: 'markers',
                    name: colorField,
                    x: xVals,
                    y: yVals,
                    marker: {
                        color: colorVals,
                        colorscale: decision?.schemeType === 'diverging' ? 'RdBu' : 'Viridis',
                        cmin: finite.length ? Math.min(...finite) : 0,
                        cmax: finite.length ? Math.max(...finite) : 1,
                        showscale: true,
                        colorbar: { title: { text: colorField } },
                    },
                    showlegend: false,
                    _markerRole: 'secondary',
                },
            );
        } else if (colorField) {
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
                showlegend: !!colorField && !continuousColor,
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
                { value: 'basis', label: 'Basis (smooth)' },
                { value: 'cardinal', label: 'Cardinal' },
                { value: 'catmull-rom', label: 'Catmull-Rom' },
            ],
        } as ChartPropertyDef,
        { key: 'showPoints', label: 'Show points', type: 'binary', defaultValue: false } as ChartPropertyDef,
    ],
    pivot: makeCartesianPivot({
        permute: [['y', 'color']],
        shift: ['color', 'group', 'column', 'row'],
    }),
};
