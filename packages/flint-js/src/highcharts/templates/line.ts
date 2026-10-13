// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Highcharts Line Chart and Area Chart templates.
 *
 * Highcharts mapping:
 *   VL: mark = "line" / "area" with x + y + color
 *   HC: chart.type = 'line' / 'area'; one series per color value.
 *   Temporal x → datetime axis with [timestamp, value] point pairs.
 *   Nominal x → category axis. Quantitative x → linear axis with pairs.
 */

import { ChartTemplateDef, ChartPropertyDef, EncodingActionDef } from '../../core/types';
import { extractCategories, groupBy, getCategoryOrder, buildCategoryValues, categoryAxisLabelRotateDeg } from './utils';
import { makeCartesianPivot } from '../../core/pivot';
import { makeSortAction } from '../../core/encoding-actions';

const isDiscrete = (type: string | undefined) => type === 'nominal' || type === 'ordinal';

/**
 * Build the x-axis option + per-series data shapes for a line/area chart.
 * Returns { xAxis, buildData } where buildData(rows) produces series data
 * aligned to the axis type.
 */
function buildLineXAxis(
    ctx: any,
    xCS: any,
): { xAxis: any; dataMode: 'category' | 'pairs' } {
    const xField = xCS.field;

    if (isDiscrete(xCS.type)) {
        const categories = extractCategories(ctx.table, xField, getCategoryOrder(ctx, 'x'));
        return {
            dataMode: 'category',
            xAxis: {
                categories,
                title: { text: xField },
                labels: { rotation: categoryAxisLabelRotateDeg(categories, xCS.type) },
            },
        };
    }

    if (xCS.type === 'temporal') {
        return {
            dataMode: 'pairs',
            xAxis: {
                type: 'datetime',
                title: { text: xField },
            },
        };
    }

    return {
        dataMode: 'pairs',
        xAxis: {
            type: 'linear',
            title: { text: xField },
        },
    };
}

/** Build [x, y] pairs for continuous axes, sorted by x. */
function buildPairs(table: any[], xField: string, yField: string, temporal: boolean): [number, number][] {
    const pairs: [number, number][] = [];
    for (const row of table) {
        const x = row[xField];
        const y = row[yField];
        if (x == null || y == null) continue;
        const xv = temporal ? +new Date(x) : Number(x);
        const yv = Number(y);
        if (!Number.isFinite(xv) || !Number.isFinite(yv)) continue;
        pairs.push([xv, yv]);
    }
    pairs.sort((a, b) => a[0] - b[0]);
    return pairs;
}

function buildLineSeries(
    table: any[],
    ctx: any,
    xCS: any,
    yField: string,
    colorField: string | undefined,
    sizeField: string | undefined,
): any[] {
    const xField = xCS.field;
    const { dataMode } = buildLineXAxis(ctx, xCS);

    const series: any[] = [];

    if (colorField) {
        const groups = groupBy(table, colorField);
        for (const [name, rows] of groups) {
            series.push({
                name,
                data: dataMode === 'category'
                    ? buildCategoryValues(rows, xField, yField, extractCategories(rows, xField, getCategoryOrder(ctx, 'x')))
                    : buildPairs(rows, xField, yField, xCS.type === 'temporal'),
                ...(sizeField ? { marker: { radius: 5 } } : {}),
            });
        }
        return series;
    }

    series.push({
        name: yField,
        data: dataMode === 'category'
            ? buildCategoryValues(table, xField, yField, extractCategories(table, xField, getCategoryOrder(ctx, 'x')))
            : buildPairs(table, xField, yField, xCS.type === 'temporal'),
        ...(sizeField ? { marker: { radius: 5 } } : {}),
    });
    return series;
}

// ─── Line Chart ─────────────────────────────────────────────────────────────

export const hcLineChartDef: ChartTemplateDef = {
    chart: 'Line Chart',
    template: { mark: 'line', encoding: {} },
    channels: ['x', 'y', 'color', 'opacity', 'column', 'row'],
    markCognitiveChannel: 'position',
    declareLayoutMode: () => ({
        paramOverrides: { continuousMarkCrossSection: { x: 100, y: 20, seriesCountAxis: 'auto' } },
    }),
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const xCS = channelSemantics.x;
        const yCS = channelSemantics.y;
        const colorField = channelSemantics.color?.field;
        const sizeField = channelSemantics.size?.field;

        if (!xCS?.field || !yCS?.field) return;

        const { xAxis } = buildLineXAxis(ctx, xCS);
        const series = buildLineSeries(table, ctx, xCS, yCS.field, colorField, sizeField);

        const option: any = {
            chart: { type: 'line' },
            xAxis,
            yAxis: { title: { text: yCS.field } },
            legend: colorField
                ? { layout: 'horizontal', align: 'center', verticalAlign: 'bottom' }
                : { enabled: false },
            plotOptions: {
                line: {
                    marker: { enabled: !!sizeField },
                },
            },
            series,
        };
        if (chartProperties?.interpolate === 'monotone') {
            option.chart.type = 'spline';
        }
        Object.assign(spec, option);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        {
            key: 'interpolate', label: 'Curve', type: 'discrete',
            options: [
                { value: 'linear', label: 'Straight' },
                { value: 'monotone', label: 'Smooth (spline)' },
            ],
            defaultValue: 'linear',
        } as ChartPropertyDef,
    ],
    encodingActions: [makeSortAction()] as EncodingActionDef[],
    pivot: makeCartesianPivot({
        transpose: [['x', 'y']],
        permute: [['x', 'y', 'color']],
        shift: ['color', 'column', 'row'],
    }),
};

// ─── Area Chart ─────────────────────────────────────────────────────────────

export const hcAreaChartDef: ChartTemplateDef = {
    chart: 'Area Chart',
    template: { mark: 'area', encoding: {} },
    channels: ['x', 'y', 'color', 'opacity', 'column', 'row'],
    markCognitiveChannel: 'length',
    declareLayoutMode: () => ({
        paramOverrides: { continuousMarkCrossSection: { x: 100, y: 20, seriesCountAxis: 'auto' } },
    }),
    instantiate: (spec, ctx) => {
        const { channelSemantics, table } = ctx;
        const xCS = channelSemantics.x;
        const yCS = channelSemantics.y;
        const colorField = channelSemantics.color?.field;

        if (!xCS?.field || !yCS?.field) return;

        const { xAxis } = buildLineXAxis(ctx, xCS);
        const series = buildLineSeries(table, ctx, xCS, yCS.field, colorField, undefined);

        const option: any = {
            chart: { type: 'area' },
            xAxis,
            yAxis: { title: { text: yCS.field } },
            legend: colorField
                ? { layout: 'horizontal', align: 'center', verticalAlign: 'bottom' }
                : { enabled: false },
            plotOptions: {
                area: {
                    marker: { enabled: false },
                    lineWidth: 1,
                    states: { hover: { lineWidth: 1 } },
                },
            },
            series,
        };
        Object.assign(spec, option);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        {
            key: 'interpolate', label: 'Curve', type: 'discrete',
            options: [
                { value: 'linear', label: 'Straight' },
                { value: 'monotone', label: 'Smooth (spline)' },
            ],
            defaultValue: 'linear',
        } as ChartPropertyDef,
    ],
    encodingActions: [makeSortAction()] as EncodingActionDef[],
    pivot: makeCartesianPivot({
        transpose: [['x', 'y']],
        permute: [['x', 'y', 'color']],
        shift: ['color', 'column', 'row'],
    }),
};
