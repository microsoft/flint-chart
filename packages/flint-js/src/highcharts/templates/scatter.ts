// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Highcharts Scatter Plot template.
 *
 * Highcharts mapping:
 *   VL: mark = "point" with x + y (+ color/size)
 *   HC: chart.type = 'scatter' (or 'bubble' when size channel is present).
 *       Supports numeric, temporal, and categorical channels on both x and y.
 */

import { ChartTemplateDef, EncodingActionDef, ChannelSemantics } from '../../core/types';
import { groupBy, extractCategories } from './utils';
import { makeCartesianPivot } from '../../core/pivot';
import { makeSortAction } from '../../core/encoding-actions';

interface AxisMapping {
    axisConfig: any;
    toCoord: (val: any) => number | null;
}

function resolveScatterAxis(table: any[], cs: ChannelSemantics, _axis: 'x' | 'y'): AxisMapping {
    if (cs.type === 'nominal' || cs.type === 'ordinal') {
        const categories = extractCategories(table, cs.field!, cs.ordinalSortOrder);
        return {
            axisConfig: {
                categories,
                title: { text: cs.field },
            },
            toCoord: (val: any) => {
                if (val == null) return null;
                const idx = categories.indexOf(String(val));
                return idx >= 0 ? idx : null;
            },
        };
    }
    if (cs.type === 'temporal') {
        return {
            axisConfig: {
                type: 'datetime',
                title: { text: cs.field },
            },
            toCoord: (val: any) => {
                if (val == null) return null;
                if (typeof val === 'number' && Number.isFinite(val)) return val;
                const t = new Date(val).getTime();
                return Number.isFinite(t) ? t : null;
            },
        };
    }
    return {
        axisConfig: {
            title: { text: cs.field },
        },
        toCoord: (val: any) => {
            if (val == null) return null;
            const n = Number(val);
            return Number.isFinite(n) ? n : null;
        },
    };
}

function buildScatterPairs(
    table: any[],
    xField: string,
    yField: string,
    xToCoord: (v: any) => number | null,
    yToCoord: (v: any) => number | null,
): [number, number][] {
    const pairs: [number, number][] = [];
    for (const row of table) {
        const x = xToCoord(row[xField]);
        const y = yToCoord(row[yField]);
        if (x === null || y === null) continue;
        pairs.push([x, y]);
    }
    return pairs;
}

function buildBubblePoints(
    table: any[],
    xField: string,
    yField: string,
    sizeField: string,
    xToCoord: (v: any) => number | null,
    yToCoord: (v: any) => number | null,
): { x: number; y: number; z: number }[] {
    const points: { x: number; y: number; z: number }[] = [];
    for (const row of table) {
        const x = xToCoord(row[xField]);
        const y = yToCoord(row[yField]);
        const z = Number(row[sizeField]);
        if (x === null || y === null) continue;
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

        const xMap = resolveScatterAxis(table, xCS, 'x');
        const yMap = resolveScatterAxis(table, yCS, 'y');

        const useBubble = !!sizeField;
        const series: any[] = [];

        const isContinuousColor = colorField && channelSemantics.color?.type === 'quantitative';

        if (colorField && !isContinuousColor) {
            const groups = groupBy(table, colorField);
            for (const [name, rows] of groups) {
                series.push({
                    name,
                    type: useBubble ? 'bubble' : 'scatter',
                    data: useBubble
                        ? buildBubblePoints(rows, xCS.field, yCS.field, sizeField, xMap.toCoord, yMap.toCoord)
                        : buildScatterPairs(rows, xCS.field, yCS.field, xMap.toCoord, yMap.toCoord),
                });
            }
        } else if (isContinuousColor) {
            const points = table.map((row) => {
                const x = xMap.toCoord(row[xCS.field!]);
                const y = yMap.toCoord(row[yCS.field!]);
                const val = Number(row[colorField!]);
                if (x === null || y === null) return null;
                return {
                    x,
                    y,
                    ...(useBubble ? { z: Number(row[sizeField!]) || 1 } : {}),
                    colorValue: Number.isFinite(val) ? val : undefined,
                };
            }).filter(Boolean);
            series.push({
                name: yCS.field,
                type: useBubble ? 'bubble' : 'scatter',
                data: points,
            });
        } else {
            series.push({
                name: yCS.field,
                type: useBubble ? 'bubble' : 'scatter',
                data: useBubble
                    ? buildBubblePoints(table, xCS.field, yCS.field, sizeField, xMap.toCoord, yMap.toCoord)
                    : buildScatterPairs(table, xCS.field, yCS.field, xMap.toCoord, yMap.toCoord),
            });
        }

        const option: any = {
            chart: { type: useBubble ? 'bubble' : 'scatter' },
            xAxis: xMap.axisConfig,
            yAxis: yMap.axisConfig,
            ...(isContinuousColor ? { colorAxis: {} } : {}),
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
