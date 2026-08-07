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
    channels: ['x', 'y', 'color', 'strokeDash', 'opacity', 'column', 'row'],
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
        const dashField = channelSemantics.strokeDash?.field;
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
        const fullTable = ctx.fullTable ?? table;
        const dashCategories = dashField
            ? extractCategories(fullTable, dashField, channelSemantics.strokeDash?.ordinalSortOrder)
            : [];
        const dashes = ['solid', 'dash', 'dot', 'dashdot'] as const;
        const makeTrace = (name: string, rows: any[], colorIndex: number, dashIndex = 0) => {
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
                line: {
                    color: getSeriesColor(palette, colorIndex),
                    shape,
                    ...(dashField ? { dash: dashes[dashIndex % dashes.length] } : {}),
                },
                ...(colorField ? {
                    _seriesIndex: colorIndex,
                    _colorLegendValue: String(rows[0]?.[colorField] ?? ''),
                } : {}),
                ...(dashField ? {
                    _dashLegendValue: String(rows[0]?.[dashField] ?? ''),
                } : {}),
            };
        };

        if (continuousColor && colorField) {
            const toColor = colorType === 'temporal'
                ? (value: any) => value == null ? NaN : new Date(value).getTime()
                : (value: any) => value == null ? NaN : Number(value);
            const allColorVals = fullTable.map(r => toColor(r[colorField]));
            const finite = allColorVals.filter(Number.isFinite);
            const decision = colorDecisions?.color ?? colorDecisions?.group;
            const groups: Array<[string, any[]]> = dashField
                ? [...groupBy(table, dashField)]
                : [['', table]];
            for (const [dashName, rows] of groups) {
                const xVals = xIsDiscrete
                    ? categories!
                    : rows.map(r => mapX(r[xField]));
                const yVals = xIsDiscrete
                    ? buildCategoryAlignedData(rows, xField, yField, categories!)
                    : rows.map(r => (r[yField] == null ? null : r[yField]));
                const colorVals = xIsDiscrete
                    ? buildCategoryAlignedData(rows, xField, colorField, categories!).map(toColor)
                    : rows.map(r => toColor(r[colorField]));
                const dashIndex = dashField ? Math.max(0, dashCategories.indexOf(dashName)) : 0;
                traces.push({
                    type: 'scatter',
                    mode: 'lines',
                    ...(dashField ? { name: dashName } : {}),
                    x: xVals,
                    y: yVals,
                    line: {
                        color: '#cccccc',
                        shape,
                        ...(dashField ? { dash: dashes[dashIndex % dashes.length] } : {}),
                    },
                    hoverinfo: 'skip',
                    showlegend: !!dashField,
                    _role: 'context',
                }, {
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
                        showscale: traces.length === 0,
                        colorbar: { title: { text: colorField } },
                    },
                    showlegend: false,
                    _markerRole: 'secondary',
                });
            }
        } else if (colorField || dashField) {
            const fields = [colorField, dashField].filter((f): f is string => !!f);
            const groups = new Map<string, any[]>();
            for (const row of table) {
                const key = JSON.stringify(fields.map(f => row[f]));
                const rows = groups.get(key);
                if (rows) rows.push(row);
                else groups.set(key, [row]);
            }
            const colorCategories = colorField
                ? extractCategories(fullTable, colorField, channelSemantics.color?.ordinalSortOrder)
                : [];
            for (const rows of groups.values()) {
                const colorValue = colorField ? String(rows[0][colorField]) : '';
                const dashValue = dashField ? String(rows[0][dashField]) : '';
                const colorIndex = colorField ? Math.max(0, colorCategories.indexOf(colorValue)) : 0;
                const dashIndex = dashField ? Math.max(0, dashCategories.indexOf(dashValue)) : 0;
                const name = [colorValue, dashValue].filter(Boolean).join(' · ');
                traces.push(makeTrace(name, rows, colorIndex, dashIndex));
            }
        } else {
            traces.push(makeTrace(yField, table, 0));
        }

        if (colorField && dashField && !continuousColor) {
            for (const trace of traces) trace.showlegend = false;
            const colorCategories = extractCategories(
                fullTable,
                colorField,
                channelSemantics.color?.ordinalSortOrder,
            );
            for (const colorValue of colorCategories) {
                const source = traces.find(trace => trace._colorLegendValue === colorValue);
                if (!source) continue;
                traces.push({
                    type: 'scatter',
                    mode: 'lines',
                    name: colorValue,
                    x: [null],
                    y: [null],
                    line: { color: source.line.color, dash: 'solid', width: 2.5 },
                    hoverinfo: 'skip',
                    showlegend: true,
                    _seriesIndex: source._seriesIndex,
                    _colorLegendValue: colorValue,
                    _themeRole: 'factored-line-legend-proxy',
                });
            }
            for (const dashValue of dashCategories) {
                const source = traces.find(trace => trace._dashLegendValue === dashValue);
                if (!source) continue;
                traces.push({
                    type: 'scatter',
                    mode: 'lines',
                    name: dashValue,
                    x: [null],
                    y: [null],
                    line: { color: '#777777', dash: source.line.dash, width: 2.5 },
                    hoverinfo: 'skip',
                    showlegend: true,
                    _dashLegendValue: dashValue,
                    _themeRole: 'factored-line-legend-proxy',
                });
            }
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
                showlegend: continuousColor ? !!dashField : !!(colorField || dashField),
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
