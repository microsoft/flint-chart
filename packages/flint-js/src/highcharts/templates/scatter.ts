// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Highcharts Scatter Plot template.
 *
 * Highcharts mapping:
 *   VL: mark = "point" with x + y (+ color/size)
 *   HC: chart.type = 'scatter'; xAxis/yAxis are linear; optional size channel
 *       → bubble series type with z values.
 */

import { ChartTemplateDef, EncodingActionDef } from '../../core/types';
import { groupBy } from './utils';
import { makeCartesianPivot } from '../../core/pivot';
import { makeSortAction } from '../../core/encoding-actions';

function buildScatterPairs(table: any[], xField: string, yField: string): [number, number][] {
    const pairs: [number, number][] = [];
    for (const row of table) {
        const x = Number(row[xField]);
        const y = Number(row[yField]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        pairs.push([x, y]);
    }
    return pairs;
}

function buildBubblePoints(table: any[], xField: string, yField: string, sizeField: string): { x: number; y: number; z: number }[] {
    const points: { x: number; y: number; z: number }[] = [];
    for (const row of table) {
        const x = Number(row[xField]);
        const y = Number(row[yField]);
        const z = Number(row[sizeField]);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        points.push({ x, y, z: Number.isFinite(z) ? z : 1 });
    }
    return points;
}

export const hcScatterPlotDef: ChartTemplateDef = {
    chart: 'Scatter Plot',
    template: { mark: 'point', encoding: {} },
    channels: ['x', 'y', 'color', 'size', 'opacity', 'column', 'row'],
    markCognitiveChannel: 'position',
    declareLayoutMode: () => ({}),
    instantiate: (spec, ctx) => {
        const { channelSemantics, table } = ctx;
        const xCS = channelSemantics.x;
        const yCS = channelSemantics.y;
        const colorField = channelSemantics.color?.field;
        const sizeField = channelSemantics.size?.field;

        if (!xCS?.field || !yCS?.field) return;

        const useBubble = !!sizeField;
        const series: any[] = [];

        if (colorField) {
            const groups = groupBy(table, colorField);
            for (const [name, rows] of groups) {
                series.push({
                    name,
                    type: useBubble ? 'bubble' : 'scatter',
                    data: useBubble
                        ? buildBubblePoints(rows, xCS.field, yCS.field, sizeField)
                        : buildScatterPairs(rows, xCS.field, yCS.field),
                });
            }
        } else {
            series.push({
                name: yCS.field,
                type: useBubble ? 'bubble' : 'scatter',
                data: useBubble
                    ? buildBubblePoints(table, xCS.field, yCS.field, sizeField)
                    : buildScatterPairs(table, xCS.field, yCS.field),
            });
        }

        const option: any = {
            chart: { type: 'scatter' },
            xAxis: { title: { text: xCS.field } },
            yAxis: { title: { text: yCS.field } },
            legend: colorField
                ? { layout: 'horizontal', align: 'center', verticalAlign: 'bottom' }
                : { enabled: false },
            tooltip: {
                pointFormat: `<span style="color:{point.color}">●</span> ${colorField ?? xCS.field}: <b>{point.x}</b><br/>${yCS.field}: <b>{point.y}</b>`,
            },
            series,
        };
        Object.assign(spec, option);
        delete spec.mark;
        delete spec.encoding;
    },
    encodingActions: [makeSortAction()] as EncodingActionDef[],
    pivot: makeCartesianPivot({
        transpose: [['x', 'y']],
        permute: [['x', 'y', 'color']],
        shift: ['color', 'column', 'row'],
    }),
};
