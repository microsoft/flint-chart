// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Pie Chart + Donut Chart templates.
 *
 * Native `pie` trace: `hole` produces a donut with no extra geometry.
 * Pie charts have no cartesian axes, so this template sets `figure._width` /
 * `_height` itself and `plApplyLayoutToSpec` (which only fills in unset
 * sizes) leaves them alone.
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { extractCategories, getPlotlyPalette } from './utils';
import { computeCircumferencePressure, computeEffectiveBarCount } from '../../core/decisions';

function buildPieOption(spec: any, ctx: any, hole: number): void {
    const { channelSemantics, table, chartProperties } = ctx;
    const colorField = channelSemantics.color?.field;
    const sizeField = channelSemantics.size?.field;

    const labels: string[] = [];
    const values: number[] = [];

    if (colorField && sizeField) {
        const agg = new Map<string, number>();
        for (const row of table) {
            const cat = String(row[colorField] ?? '');
            agg.set(cat, (agg.get(cat) ?? 0) + (Number(row[sizeField]) || 0));
        }
        const categories = extractCategories(table, colorField, channelSemantics.color?.ordinalSortOrder);
        for (const cat of categories) { labels.push(cat); values.push(agg.get(cat) ?? 0); }
    } else if (colorField) {
        const counts = new Map<string, number>();
        for (const row of table) {
            const cat = String(row[colorField] ?? '');
            counts.set(cat, (counts.get(cat) ?? 0) + 1);
        }
        const categories = extractCategories(table, colorField, channelSemantics.color?.ordinalSortOrder);
        for (const cat of categories) { labels.push(cat); values.push(counts.get(cat) ?? 0); }
    } else if (sizeField) {
        for (const row of table) {
            const v = Number(row[sizeField]) || 0;
            labels.push(String(v));
            values.push(v);
        }
    }
    if (labels.length === 0) return;

    const sortSlices = chartProperties?.sortSlices;
    const order = labels.map((_l, i) => i);
    if (sortSlices === 'descending') order.sort((a, b) => values[b] - values[a]);
    else if (sortSlices === 'ascending') order.sort((a, b) => values[a] - values[b]);
    const sortedLabels = order.map(i => labels[i]);
    const sortedValues = order.map(i => values[i]);

    const labelType = chartProperties?.labelType ?? 'categoryPercent';
    const textinfo: Record<string, string> = {
        none: 'none', category: 'label', value: 'value', percent: 'percent', categoryPercent: 'label+percent',
    };

    const palette = getPlotlyPalette(ctx, 'color');

    const effectiveCount = computeEffectiveBarCount(sortedValues);
    const { radius, canvasW, canvasH } = computeCircumferencePressure(effectiveCount, ctx.canvasSize, {
        minArcPx: 45,
        minRadius: 60,
        maxStretch: ctx.assembleOptions?.maxStretch,
        maxStretchX: ctx.assembleOptions?.maxStretchX,
        maxStretchY: ctx.assembleOptions?.maxStretchY,
        margin: 80,
    });

    // A dense pie/donut needs MORE vertical room than the base circumference
    // sizing budgets for: outside slice labels (drawn above/below the ring
    // for thin slices, with connector lines) and a legend whose list grows
    // with slice count — Plotly does not auto-grow the canvas for either, so
    // an unadjusted figure clips both at the top/bottom for a busy pie.
    const n = sortedLabels.length;
    const hasOutsideLabels = labelType !== 'none';
    const outsideLabelPad = hasOutsideLabels ? Math.min(70, 30 + n * 1.5) : 10;
    const legendHeightPx = Math.max(60, n * 20 + 40);
    const figHeight = Math.max(canvasH + 2 * outsideLabelPad, legendHeightPx);
    const figWidth = canvasW;

    // Keep the circle's own pixel radius constant; recompute its fractional
    // domain against the (possibly taller) final canvas so growing the
    // canvas for labels/legend doesn't also shrink the pie itself.
    const domainFracX = Math.min(0.9, (2 * radius) / figWidth);
    const domainFracY = Math.min(0.9, (2 * radius) / figHeight);

    Object.assign(spec, {
        data: [{
            type: 'pie',
            labels: sortedLabels,
            values: sortedValues,
            hole,
            textinfo: textinfo[labelType] ?? 'label+percent',
            marker: { colors: palette, line: { color: '#ffffff', width: 1 } },
            domain: {
                x: [0.5 - domainFracX / 2, 0.5 + domainFracX / 2],
                y: [0.5 - domainFracY / 2, 0.5 + domainFracY / 2],
            },
        }],
        layout: {
            showlegend: true,
            margin: { t: outsideLabelPad, b: outsideLabelPad },
        },
        _width: figWidth,
        _height: figHeight,
    });
    delete spec.mark;
    delete spec.encoding;
}

const PIE_PROPERTIES: ChartPropertyDef[] = [
    {
        key: 'sortSlices', label: 'Sort slices', type: 'discrete',
        options: [
            { value: 'none', label: 'Data order' },
            { value: 'descending', label: 'Largest first' },
            { value: 'ascending', label: 'Smallest first' },
        ],
        defaultValue: 'none',
    },
    {
        key: 'labelType', label: 'Labels', type: 'discrete',
        options: [
            { value: 'categoryPercent', label: 'Name + %' },
            { value: 'category', label: 'Name' },
            { value: 'value', label: 'Value' },
            { value: 'percent', label: 'Percent' },
            { value: 'none', label: 'None' },
        ],
        defaultValue: 'categoryPercent',
    },
];

export const plPieChartDef: ChartTemplateDef = {
    chart: 'Pie Chart',
    template: { mark: 'arc', encoding: {} },
    channels: ['size', 'color'],
    markCognitiveChannel: 'area',
    instantiate: (spec, ctx) => buildPieOption(spec, ctx, 0),
    properties: PIE_PROPERTIES,
};

export const plDonutChartDef: ChartTemplateDef = {
    chart: 'Donut Chart',
    template: { mark: 'arc', encoding: {} },
    channels: ['size', 'color'],
    markCognitiveChannel: 'area',
    instantiate: (spec, ctx) => buildPieOption(spec, ctx, (ctx.chartProperties?.innerRadius ?? 55) / 100),
    properties: [
        { key: 'innerRadius', label: 'Donut', type: 'continuous', min: 20, max: 80, step: 5, defaultValue: 55 } as ChartPropertyDef,
        ...PIE_PROPERTIES,
    ],
};
