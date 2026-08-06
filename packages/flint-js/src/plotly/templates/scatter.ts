// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Scatter Plot template.
 *
 * Mirrors the Chart.js Scatter template's decisions (color grouping, zero
 * baseline per axis, canvas-aware point radius) as Plotly `scatter` traces
 * in `markers` mode.
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { groupBy, getPlotlyPalette, getSeriesColor } from './utils';
import { makeCartesianPivot } from '../../core/pivot';

/** Compute a reasonable marker diameter based on canvas area and point count. */
/**
 * Per-point diameters for a bound `size` channel.
 *
 * A reader compares bubbles by *area*, so the value is mapped onto an area and
 * the diameter taken back out of it — mapping straight onto the diameter makes
 * a twice-as-big number look four times as big. Plotly's own `sizeref` cannot
 * do this: it divides a data value, so it needs the raw numbers, and it would
 * fight the theme's size range, which rescales drawn pixels.
 */
function sizeScale(table: any[], field: string): (row: any) => number {
    const values = table
        .map((r: any) => Number(r[field]))
        .filter((v: number) => Number.isFinite(v));
    const min = values.length ? Math.min(...values) : 0;
    const max = values.length ? Math.max(...values) : 1;
    const MIN_AREA = 40;
    const MAX_AREA = 900;
    return (row: any) => {
        const v = Number(row[field]);
        if (!Number.isFinite(v)) return 2 * Math.sqrt(MIN_AREA / Math.PI);
        const t = max > min ? (v - min) / (max - min) : 1;
        return 2 * Math.sqrt((MIN_AREA + t * (MAX_AREA - MIN_AREA)) / Math.PI);
    };
}

function computeMarkerSize(width: number, height: number, pointCount: number): number {
    const canvasArea = width * height;
    const areaPerPoint = canvasArea / Math.max(1, pointCount);
    const idealRadius = Math.sqrt(areaPerPoint * 0.05) / 2;
    const radius = Math.max(2, Math.min(6, Math.round(idealRadius)));
    return radius * 2;
}

export const plScatterPlotDef: ChartTemplateDef = {
    chart: 'Scatter Plot',
    template: { mark: 'circle', encoding: {} },
    channels: ['x', 'y', 'color', 'size', 'opacity', 'column', 'row'],
    markCognitiveChannel: 'position',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties, colorDecisions } = ctx;
        const xField = channelSemantics.x?.field;
        const yField = channelSemantics.y?.field;
        const colorField = channelSemantics.color?.field;
        const colorType = channelSemantics.color?.type;
        const isTemporalColor = colorType === 'temporal';
        const isContinuousColor = !!colorField && (colorType === 'quantitative' || isTemporalColor);

        if (!xField || !yField) return;

        const opacity = Number(chartProperties?.opacity ?? 1);
        const sizeField = channelSemantics.size?.field;
        const sizeOf = sizeField ? sizeScale(table, sizeField) : null;
        const traces: any[] = [];

        if (isContinuousColor && colorField) {
            // A quantitative/temporal color channel is a numeric scale, not a
            // set of legend groups — one trace with `marker.color` as a
            // per-point array plus a native colorscale/colorbar (Plotly's
            // built-in continuous-color support), not a group-by split.
            const toColorVal = isTemporalColor
                ? (v: any) => (v != null ? new Date(v).getTime() : NaN)
                : (v: any) => (v != null ? Number(v) : NaN);
            const colorVals = table.map((r: any) => toColorVal(r[colorField])).filter((v: number) => !isNaN(v));
            const cmin = colorVals.length ? Math.min(...colorVals) : 0;
            const cmax = colorVals.length ? Math.max(...colorVals) : 1;
            const decision = colorDecisions?.color ?? colorDecisions?.group;
            const diverging = decision?.schemeType === 'diverging';
            traces.push({
                type: 'scatter',
                mode: 'markers',
                name: colorField,
                x: table.map((r: any) => r[xField]),
                y: table.map((r: any) => r[yField]),
                marker: {
                    color: table.map((r: any) => toColorVal(r[colorField])),
                    colorscale: diverging ? 'RdBu' : 'Viridis',
                    cmin, cmax,
                    showscale: true,
                    colorbar: { title: { text: colorField } },
                    opacity,
                    ...(sizeOf ? { size: table.map((r: any) => sizeOf(r)) } : {}),
                    line: { color: '#ffffff', width: 0.5 },
                },
            });
        } else {
            const palette = getPlotlyPalette(ctx, 'color');
            const makeTrace = (name: string | undefined, rows: any[], colorIndex: number) => ({
                type: 'scatter',
                mode: 'markers',
                ...(name != null ? { name } : {}),
                x: rows.map(r => r[xField]),
                y: rows.map(r => r[yField]),
                marker: {
                    color: getSeriesColor(palette, colorIndex),
                    opacity,
                    ...(sizeOf ? { size: rows.map(r => sizeOf(r)) } : {}),
                    line: { color: '#ffffff', width: 0.5 },
                },
            });

            if (colorField) {
                let i = 0;
                for (const [name, rows] of groupBy(table, colorField)) {
                    traces.push(makeTrace(name, rows, i));
                    i++;
                }
            } else {
                traces.push(makeTrace(undefined, table, 0));
            }
        }

        const xAxisSpec: any = { title: { text: xField } };
        const yAxisSpec: any = { title: { text: yField } };
        if (channelSemantics.x?.zero) {
            xAxisSpec.rangemode = channelSemantics.x.zero.zero !== false ? 'tozero' : 'normal';
        }
        if (channelSemantics.y?.zero) {
            yAxisSpec.rangemode = channelSemantics.y.zero.zero !== false ? 'tozero' : 'normal';
        }

        const figure: any = {
            data: traces,
            layout: {
                xaxis: xAxisSpec,
                yaxis: yAxisSpec,
                showlegend: !!colorField && !isContinuousColor,
            },
        };

        Object.assign(spec, figure);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        { key: 'opacity', label: 'Opacity', type: 'continuous', min: 0.1, max: 1, step: 0.05, defaultValue: 1 } as ChartPropertyDef,
    ],
    pivot: makeCartesianPivot({
        transpose: [['x', 'y']],
        permute: [['x', 'y', 'color', 'size']],
        shift: ['color', 'group', 'column', 'row'],
    }),
    postProcess: (figure, ctx) => {
        if (!Array.isArray(figure.data)) return;
        const w = figure._width || ctx.canvasSize.width;
        const h = figure._height || ctx.canvasSize.height;
        const size = computeMarkerSize(w, h, ctx.table.length);
        for (const trace of figure.data) {
            if (trace?.marker && trace.marker.size == null) {
                trace.marker.size = size;
            }
        }
    },
};
