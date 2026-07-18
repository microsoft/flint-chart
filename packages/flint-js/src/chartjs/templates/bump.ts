// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Chart.js Bump Chart — line with points, rank axis reversed so rank 1 sits on
 * top (mirror of ecBumpChartDef in echarts/templates/line.ts and
 * vegalite/templates/bump.ts).
 *
 * Unlike ECharts — where a value-axis `inverse` moves the x-axis to the top,
 * forcing a category-index workaround — Chart.js reverses a linear scale in
 * place (`reverse: true`), so series keep their real rank values and the
 * config stays pure JSON with no tooltip formatter.
 */

import { ChartTemplateDef } from '../../core/types';
import {
    extractCategories,
    groupBy,
    buildCategoryAlignedData,
    getChartJsPalette,
    getSeriesBorderColor,
    coerceUnixMsForChartJs,
} from './utils';
import { toTypeString } from '../../core/field-semantics';

/** Semantic types that indicate a rank-like field (mirror vegalite/templates/bump.ts). */
const RANK_SEMANTIC_TYPES = new Set(['Rank', 'Score', 'Level']);

const isDiscrete = (type: string | undefined) => type === 'nominal' || type === 'ordinal';

export const cjsBumpChartDef: ChartTemplateDef = {
    chart: 'Bump Chart',
    template: { mark: 'line', encoding: {} },
    channels: ['x', 'y', 'color', 'detail', 'column', 'row'],
    markCognitiveChannel: 'position',
    declareLayoutMode: () => ({
        paramOverrides: { continuousMarkCrossSection: { x: 80, y: 20, seriesCountAxis: 'auto' } },
    }),
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, fullTable, semanticTypes } = ctx;
        const xCS = channelSemantics.x;
        const yCS = channelSemantics.y;
        const colorField = channelSemantics.color?.field;

        if (!xCS?.field || !yCS?.field) return;
        const xField = xCS.field;
        const yField = yCS.field;

        const ySemType = toTypeString(semanticTypes?.[yField]);
        const xSemType = toTypeString(semanticTypes?.[xField]);
        const yIsRank = RANK_SEMANTIC_TYPES.has(ySemType);
        const xIsRank = RANK_SEMANTIC_TYPES.has(xSemType);
        const rankOnY = yIsRank && !xIsRank;

        const xIsDiscrete = isDiscrete(xCS.type);
        const xIsTemporal = xCS.type === 'temporal';

        const mapContinuousX = (raw: unknown) =>
            (xIsTemporal ? coerceUnixMsForChartJs(raw) : raw);

        // Pin continuous x to the data extent (same reasoning as line.ts:
        // Chart.js "nice" ranges balloon on Unix-ms timestamps).
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

        const sortRowsByX = (rows: any[]) =>
            [...rows].sort((a, b) => {
                const ax = mapContinuousX(a[xField]);
                const bx = mapContinuousX(b[xField]);
                if (typeof ax === 'number' && typeof bx === 'number') return ax - bx;
                return String(ax).localeCompare(String(bx));
            });

        const rankValues = table
            .map((r: any) => Number(r[yField]))
            .filter((v: number) => !isNaN(v) && isFinite(v));
        const maxRank = rankValues.length ? Math.max(...rankValues) : 1;

        const palette = getChartJsPalette(ctx, 'color');

        const config: any = {
            type: 'line',
            data: { labels: categories || [], datasets: [] },
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
                    y: rankOnY
                        ? {
                            type: 'linear',
                            reverse: true,
                            min: 1,
                            max: maxRank,
                            title: { display: true, text: yField },
                            ticks: { font: { size: 10 }, stepSize: 1, precision: 0 },
                        }
                        : {
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

        // Zero-baseline only applies to the non-rank value axis; a reversed
        // rank axis is pinned to [1, maxRank] instead.
        if (!rankOnY && channelSemantics.y?.zero) {
            config.options.scales.y.beginAtZero = channelSemantics.y.zero.zero !== false;
        }

        const baseDataset = {
            tension: 0.4,
            pointRadius: 3,
            fill: false,
            backgroundColor: 'transparent',
        };

        if (colorField) {
            const groups = groupBy(table, colorField);
            config.options.plugins.legend = { display: true };

            let colorIdx = 0;
            for (const [name, rows] of groups) {
                const data = xIsDiscrete
                    ? buildCategoryAlignedData(rows, xField, yField, categories!)
                    : sortRowsByX(rows)
                        .map(r => ({ x: mapContinuousX(r[xField]), y: r[yField] }))
                        .filter(p => p.y != null && (xIsTemporal ? Number.isFinite(p.x as number) : true));

                config.data.datasets.push({
                    label: name,
                    data,
                    borderColor: getSeriesBorderColor(palette, colorIdx),
                    ...baseDataset,
                });
                colorIdx++;
            }
        } else {
            const data = xIsDiscrete
                ? categories!.map(cat => {
                    const row = table.find(r => String(r[xField]) === cat);
                    return row ? row[yField] : null;
                })
                : sortRowsByX(table)
                    .map(r => ({ x: mapContinuousX(r[xField]), y: r[yField] }))
                    .filter(p => p.y != null && (xIsTemporal ? Number.isFinite(p.x as number) : true));

            config.data.datasets.push({
                label: yField,
                data,
                borderColor: getSeriesBorderColor(palette, 0),
                ...baseDataset,
            });
            config.options.plugins.legend = { display: false };
        }

        Object.assign(spec, config);
        delete spec.mark;
        delete spec.encoding;
    },
};
