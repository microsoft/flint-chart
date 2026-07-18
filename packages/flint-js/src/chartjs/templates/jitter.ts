// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Chart.js Strip Plot — scatter points jittered along a categorical axis.
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { makeCartesianPivot } from '../../core/pivot';
import {
    extractCategories,
    groupBy,
    getChartJsPalette,
    getSeriesBorderColor,
    getSeriesBackgroundColor,
} from './utils';

const isDiscrete = (type: string | undefined) => type === 'nominal' || type === 'ordinal';

function clamp01(value: number): number {
    return Math.max(0, Math.min(1, value));
}

function hexToRgb(color: string): [number, number, number] | undefined {
    const hex = color.trim().replace(/^#/, '');
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return undefined;
    return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
    ];
}

function continuousColor(palette: string[], value: number, min: number, max: number, alpha: number): string {
    const colors = palette.length > 0 ? palette : ['#440154', '#fde725'];
    const span = max > min ? max - min : 1;
    const scaled = clamp01((value - min) / span) * (colors.length - 1);
    const lo = Math.floor(scaled);
    const hi = Math.min(colors.length - 1, Math.ceil(scaled));
    const t = scaled - lo;
    const left = hexToRgb(colors[lo]);
    const right = hexToRgb(colors[hi]);
    if (!left || !right) return colors[lo];
    const mix = (a: number, b: number) => Math.round(a + (b - a) * t);
    return `rgba(${mix(left[0], right[0])}, ${mix(left[1], right[1])}, ${mix(left[2], right[2])}, ${alpha})`;
}

function jitter(seed: number): () => number {
    let state = seed;
    return () => {
        state = (state * 1103515245 + 12345) & 0x7fffffff;
        return (state / 0x7fffffff) * 2 - 1;
    };
}

export const cjsStripPlotDef: ChartTemplateDef = {
    chart: 'Strip Plot',
    template: { mark: 'circle', encoding: {} },
    channels: ['x', 'y', 'color', 'size', 'column', 'row'],
    markCognitiveChannel: 'position',
    declareLayoutMode: () => ({
        paramOverrides: { defaultBandSize: 50, minStep: 16 },
    }),
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const xCS = channelSemantics.x;
        const yCS = channelSemantics.y;
        const xField = xCS?.field;
        const yField = yCS?.field;
        const colorField = channelSemantics.color?.field;
        const colorType = channelSemantics.color?.type;
        const isContinuousColor = !!colorField && (colorType === 'quantitative' || colorType === 'temporal');
        const isTemporalColor = colorType === 'temporal';
        if (!xField || !yField) return;

        const xIsDiscrete = isDiscrete(xCS?.type);
        const yIsDiscrete = isDiscrete(yCS?.type);
        const catAxis: 'x' | 'y' = xIsDiscrete ? 'x' : yIsDiscrete ? 'y' : 'x';
        const contAxis: 'x' | 'y' = catAxis === 'x' ? 'y' : 'x';
        const catField = catAxis === 'x' ? xField : yField;
        const contField = contAxis === 'x' ? xField : yField;
        const catSemantics = catAxis === 'x' ? xCS : yCS;
        const categories = extractCategories(table, catField, catSemantics?.ordinalSortOrder);
        const categoryIndex = new Map(categories.map((category, index) => [String(category), index]));
        const nextJitter = jitter(42);
        const jitterHalfWidth = 0.3;
        const palette = getChartJsPalette(ctx, isDiscrete(colorType) ? 'color' : 'group');
        const opacity = chartProperties?.opacity ?? 0.7;
        const explicitPointSize = Number(chartProperties?.pointSize ?? 0);
        const pointRadius = explicitPointSize > 0
            ? Math.max(1, Math.min(10, Math.round(explicitPointSize / 12)))
            : 3;
        const toColorValue = (value: any) => {
            if (value == null) return NaN;
            return isTemporalColor ? new Date(value).getTime() : Number(value);
        };
        const continuousColorValues = isContinuousColor && colorField
            ? table.map((row: any) => toColorValue(row[colorField])).filter((value: number) => Number.isFinite(value))
            : [];
        const colorMin = continuousColorValues.length ? Math.min(...continuousColorValues) : 0;
        const colorMax = continuousColorValues.length ? Math.max(...continuousColorValues) : 1;
        const pointColors = isContinuousColor && colorField
            ? table.map((row: any) => continuousColor(palette, toColorValue(row[colorField]), colorMin, colorMax, opacity))
            : undefined;

        const buildPoint = (row: any) => {
            const category = String(row[catField] ?? '');
            const index = categoryIndex.get(category) ?? 0;
            const categoryValue = index + nextJitter() * jitterHalfWidth;
            const continuousValue = row[contField];
            return catAxis === 'x'
                ? { x: categoryValue, y: continuousValue }
                : { x: continuousValue, y: categoryValue };
        };

        const categoryScale = {
            type: 'linear' as const,
            min: -0.5,
            max: Math.max(0.5, categories.length - 0.5),
            title: { display: true, text: catField },
            ticks: {
                stepSize: 1,
                callback(value: number | string) {
                    const index = Math.round(Number(value));
                    return categories[index] ?? '';
                },
            },
        };
        const continuousScale = {
            type: 'linear' as const,
            title: { display: true, text: contField },
            ticks: { font: { size: 10 } },
        };

        const config: any = {
            type: 'scatter',
            data: { datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: catAxis === 'x'
                    ? { x: categoryScale, y: continuousScale }
                    : { x: continuousScale, y: categoryScale },
                plugins: {
                    tooltip: { enabled: true },
                    legend: { display: !!colorField && isDiscrete(colorType) },
                },
            },
        };

        if (colorField && isDiscrete(colorType)) {
            let colorIndex = 0;
            for (const [name, rows] of groupBy(table, colorField)) {
                config.data.datasets.push({
                    label: name,
                    data: rows.map(buildPoint),
                    backgroundColor: getSeriesBackgroundColor(palette, colorIndex, opacity),
                    borderColor: getSeriesBorderColor(palette, colorIndex),
                    borderWidth: 1,
                    pointRadius,
                });
                colorIndex++;
            }
        } else {
            config.data.datasets.push({
                data: table.map(buildPoint),
                backgroundColor: pointColors ?? getSeriesBackgroundColor(palette, 0, opacity),
                borderColor: pointColors ?? getSeriesBorderColor(palette, 0),
                borderWidth: 1,
                pointRadius,
            });
        }

        Object.assign(spec, config);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        { key: 'stepWidth', label: 'Jitter', type: 'continuous', min: 10, max: 100, step: 5, defaultValue: 20 },
        { key: 'pointSize', label: 'Size', type: 'continuous', min: 0, max: 150, step: 5, defaultValue: 0 },
        { key: 'opacity', label: 'Opacity', type: 'continuous', min: 0, max: 1, step: 0.05, defaultValue: 0 },
    ] as ChartPropertyDef[],
    pivot: makeCartesianPivot({
        // θ (Strip → Scatter) declared centrally in core/chart-transitions.ts.
    }),
};