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

    // Canvas sizing: a native Plotly pie fills the largest circle that fits
    // in the canvas AND auto-reserves horizontal room for the legend on the
    // right — so we deliberately DON'T pin an explicit `domain`. The previous
    // centered domain (with an 80px radius margin) shrank the circle to ~half
    // its natural size and wasted matching space on the left. We keep only the
    // circumference-pressure model to GROW the canvas when a dense pie (many
    // thin slices) needs a bigger circle to give each slice its minimum arc.
    const effectiveCount = computeEffectiveBarCount(sortedValues);
    const { canvasW, canvasH } = computeCircumferencePressure(effectiveCount, ctx.canvasSize, {
        minArcPx: 45,
        minRadius: 60,
        maxStretch: ctx.assembleOptions?.maxStretch,
        maxStretchX: ctx.assembleOptions?.maxStretchX,
        maxStretchY: ctx.assembleOptions?.maxStretchY,
        margin: 24,
    });

    // Symmetric margin leaves room for the outside slice callouts (thin slices
    // draw their label + connector just beyond the ring); Plotly grows the
    // legend within its own reserved right gutter, so no vertical padding hack
    // is needed.
    const n = sortedLabels.length;
    const hasOutsideLabels = labelType !== 'none';
    const labelMargin = hasOutsideLabels ? Math.min(48, 20 + n) : 12;

    Object.assign(spec, {
        data: [{
            type: 'pie',
            labels: sortedLabels,
            values: sortedValues,
            hole,
            textinfo: textinfo[labelType] ?? 'label+percent',
            // Plotly stands inside text on its end as soon as a slice gets
            // narrow, which is unreadable and clips against the ring. Held
            // horizontal, it shrinks or steps outside instead.
            insidetextorientation: 'horizontal',
            // Let outside slice labels push the margins so a cluster of thin
            // slices (many tiny wedges crowded together) doesn't clip its
            // stacked callouts against the canvas edge.
            automargin: true,
            marker: { colors: palette, line: { color: '#ffffff', width: 1 } },
        }],
        layout: {
            showlegend: true,
            margin: { t: labelMargin, b: labelMargin, l: 12, r: 12 },
        },
        _width: canvasW,
        _height: canvasH,
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
