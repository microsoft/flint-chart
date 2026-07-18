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
import { groupBy, getSeriesColor } from './utils';

/** Compute a reasonable marker diameter based on canvas area and point count. */
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
    channels: ['x', 'y', 'color', 'size', 'opacity'],
    markCognitiveChannel: 'position',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const xField = channelSemantics.x?.field;
        const yField = channelSemantics.y?.field;
        const colorField = channelSemantics.color?.field;

        if (!xField || !yField) return;

        const opacity = Number(chartProperties?.opacity ?? 1);

        const traces: any[] = [];
        const makeTrace = (name: string | undefined, rows: any[], colorIndex: number) => ({
            type: 'scatter',
            mode: 'markers',
            ...(name != null ? { name } : {}),
            x: rows.map(r => r[xField]),
            y: rows.map(r => r[yField]),
            marker: {
                color: getSeriesColor(colorIndex),
                opacity,
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
                showlegend: !!colorField,
            },
        };

        Object.assign(spec, figure);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        { key: 'opacity', label: 'Opacity', type: 'continuous', min: 0.1, max: 1, step: 0.05, defaultValue: 1 } as ChartPropertyDef,
    ],
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
