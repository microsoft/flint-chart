// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Chart.js Line Chart template (single + multi-series).
 *
 * Contrast with VL:
 *   VL: encoding.x + encoding.y + encoding.color → auto-groups into lines
 *   CJS: explicit datasets[] — each dataset is one line
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import {
    extractCategories,
    groupBy,
    buildCategoryAlignedData,
    getChartJsPalette,
    getSeriesBorderColor,
    coerceUnixMsForChartJs,
} from './utils';
import { makeCartesianPivot } from '../../core/pivot';

const isDiscrete = (type: string | undefined) => type === 'nominal' || type === 'ordinal';

export const cjsLineChartDef: ChartTemplateDef = {
    chart: 'Line Chart',
    template: { mark: 'line', encoding: {} },
    channels: ['x', 'y', 'color', 'opacity', 'column', 'row'],
    markCognitiveChannel: 'position',
    declareLayoutMode: () => ({
        paramOverrides: { continuousMarkCrossSection: { x: 100, y: 20, seriesCountAxis: 'auto' }, facetAspectRatioResistance: 0.5 },
    }),
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, fullTable, chartProperties } = ctx;
        const xCS = channelSemantics.x;
        const yCS = channelSemantics.y;
        const colorField = channelSemantics.color?.field;

        if (!xCS?.field || !yCS?.field) return;
        const xField = xCS.field;
        const yField = yCS.field;

        const xIsDiscrete = isDiscrete(xCS.type);
        const xIsTemporal = xCS.type === 'temporal';

        const mapContinuousX = (raw: unknown) =>
            (xIsTemporal ? coerceUnixMsForChartJs(raw) : raw);

        // For a continuous (linear) x-scale, Chart.js auto-computes a "nice"
        // range that, on large Unix-ms timestamps, balloons far beyond the
        // data extent and squeezes the plotted line into a narrow band. Pin
        // the scale to the actual data extent — computed from the full table
        // so faceted small multiples share one aligned x-domain (matching the
        // Vega-Lite output).
        let continuousXExtent: { min: number; max: number } | undefined;
        if (!xIsDiscrete) {
            const xNums = (fullTable ?? table)
                .map((r: any) => mapContinuousX(r[xField]))
                .filter((v: any): v is number => typeof v === 'number' && Number.isFinite(v));
            if (xNums.length > 0) {
                continuousXExtent = { min: Math.min(...xNums), max: Math.max(...xNums) };
            }
        }

        const categories = xIsDiscrete
            ? extractCategories(table, xField, xCS.ordinalSortOrder)
            : undefined;

        // Determine tension for interpolation
        const interpolate = chartProperties?.interpolate;
        const tension = (interpolate === 'monotone' || interpolate === 'basis' ||
                         interpolate === 'cardinal' || interpolate === 'catmull-rom')
            ? 0.4 : 0;
        const stepped = interpolate === 'step' ? 'middle' as const
                      : interpolate === 'step-before' ? 'before' as const
                      : interpolate === 'step-after' ? 'after' as const
                      : false as const;

        const palette = getChartJsPalette(ctx, 'color');

        const config: any = {
            type: 'line',
            data: {
                labels: categories || [],
                datasets: [],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: xIsDiscrete ? 'category' : 'linear',
                        title: { display: true, text: xField },
                        ...(continuousXExtent
                            ? { min: continuousXExtent.min, max: continuousXExtent.max }
                            : {}),
                        ticks: {
                            font: { size: 10 },
                            ...(xIsTemporal
                                ? {
                                    maxTicksLimit: 4,
                                    autoSkip: true,
                                    maxRotation: 0,
                                    callback(v: number | string) {
                                        const n = typeof v === 'number' ? v : Number(v);
                                        if (!Number.isFinite(n)) return String(v);
                                        // Drop the day for spans longer than ~2
                                        // months so faceted (narrow) panels don't
                                        // collide long "Apr 18, 2025" labels.
                                        const spanDays = continuousXExtent
                                            ? (continuousXExtent.max - continuousXExtent.min) / 86_400_000
                                            : 0;
                                        const opts: Intl.DateTimeFormatOptions = spanDays > 60
                                            ? { month: 'short', year: 'numeric' }
                                            : { month: 'short', day: 'numeric', year: 'numeric' };
                                        return new Date(n).toLocaleDateString(undefined, opts);
                                    },
                                }
                                : {}),
                        },
                    },
                    y: {
                        type: 'linear',
                        title: { display: true, text: yField },
                        ticks: { font: { size: 10 } },
                    },
                },
                plugins: {
                    tooltip: { enabled: true },
                },
            },
        };

        // Zero-baseline: Chart.js defaults beginAtZero to false, so
        // explicitly set true when the semantic decision includes zero.
        if (channelSemantics.y?.zero) {
            config.options.scales.y.beginAtZero = channelSemantics.y.zero.zero !== false;
        }

        if (colorField) {
            const groups = groupBy(table, colorField);
            config.options.plugins.legend = { display: true };

            let colorIdx = 0;
            for (const [name, rows] of groups) {
                const data = xIsDiscrete
                    ? buildCategoryAlignedData(rows, xField, yField, categories!)
                    : rows
                        .map(r => ({ x: mapContinuousX(r[xField]), y: r[yField] }))
                        .filter(p => p.y != null && (xIsTemporal ? Number.isFinite(p.x as number) : true));

                config.data.datasets.push({
                    label: name,
                    data,
                    borderColor: getSeriesBorderColor(palette, colorIdx),
                    backgroundColor: 'transparent',
                    tension,
                    stepped,
                    pointRadius: 3,
                    fill: false,
                });
                colorIdx++;
            }
        } else {
            const data = xIsDiscrete
                ? categories!.map(cat => {
                    const row = table.find(r => String(r[xField]) === cat);
                    return row ? row[yField] : null;
                })
                : table
                    .map(r => ({ x: mapContinuousX(r[xField]), y: r[yField] }))
                    .filter(p => p.y != null && (xIsTemporal ? Number.isFinite(p.x as number) : true));

            config.data.datasets.push({
                label: yField,
                data,
                borderColor: getSeriesBorderColor(palette, 0),
                backgroundColor: 'transparent',
                tension,
                stepped,
                pointRadius: 3,
                fill: false,
            });
            config.options.plugins.legend = { display: false };
        }

        Object.assign(spec, config);
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
    ],
    pivot: makeCartesianPivot({
        permute: [['y', 'color']],
        shift: ['color', 'group', 'column', 'row'],
    }),
};
