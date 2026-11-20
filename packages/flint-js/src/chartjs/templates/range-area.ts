// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Chart.js Range Area Chart (band / high–low / area-range) template.
 *
 * A filled band showing a **low–high range** at each x. Chart.js has no native
 * ranged-area type, so a band is two line datasets per group:
 *
 *   - a LOWER-bound line dataset (`fill: false`);
 *   - an UPPER-bound line dataset that FILLS down to the lower dataset via
 *     `fill: { target: <lowerDatasetIndex> }` with a translucent
 *     `backgroundColor`.
 *
 * Because the upper fills to the lower (not to the origin), the band is a
 * translucent ribbon between the two bounds — it is never drawn down to zero.
 *
 * Contract:
 *   x      — position (category axis for discrete x; linear axis for numeric x;
 *            linear axis with unix-ms points for temporal x).
 *   y      — lower bound (linear).
 *   y2     — upper bound (linear).
 *   color  — optional series → one band (lower+upper pair) per value. The legend
 *            shows one entry per band (the lower datasets are filtered out).
 *
 * Core Chart.js only — no plugins.
 */

import { ChartTemplateDef } from '../../core/types';
import {
    extractCategories,
    groupBy,
    buildCategoryAlignedData,
    getChartJsPalette,
    getSeriesBorderColor,
    getSeriesBackgroundColor,
    coerceUnixMsForChartJs,
} from './utils';

const isDiscrete = (type: string | undefined) => type === 'nominal' || type === 'ordinal';

export const cjsRangeAreaChartDef: ChartTemplateDef = {
    additionalPropertyKeys: ['opacity'],
    chart: 'Range Area Chart',
    template: { mark: 'area', encoding: {} },
    channels: ['x', 'y', 'y2', 'color', 'column', 'row'],
    markCognitiveChannel: 'area',
    declareLayoutMode: () => ({
        paramOverrides: {
            continuousMarkCrossSection: { x: 100, y: 20, seriesCountAxis: 'auto' },
            facetAspectRatioResistance: 0.5,
        },
    }),
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const xCS = channelSemantics.x;
        const yCS = channelSemantics.y;
        const y2CS = channelSemantics.y2;
        const colorField = channelSemantics.color?.field;

        if (!xCS?.field || !yCS?.field || !y2CS?.field) return;
        const xField = xCS.field;
        const lowField = yCS.field;
        const highField = y2CS.field;

        const xIsDiscrete = isDiscrete(xCS.type);
        const xIsTemporal = xCS.type === 'temporal';
        const mapContinuousX = (raw: unknown) => (xIsTemporal ? coerceUnixMsForChartJs(raw) : Number(raw));

        // Title the value axis with BOTH bound fields (matching Vega-Lite's
        // native "low, high" axis title), falling back to the single name.
        const valueTitle = lowField === highField ? lowField : `${lowField}, ${highField}`;

        const categories = xIsDiscrete
            ? extractCategories(table, xField, xCS.ordinalSortOrder)
            : undefined;

        const opacity = chartProperties?.opacity ?? 0.3;
        const palette = getChartJsPalette(ctx, 'color');

        const config: any = {
            type: 'line',
            data: { labels: categories ?? [], datasets: [] },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        type: xIsDiscrete ? 'category' : 'linear',
                        title: { display: true, text: xField },
                        ticks: {
                            font: { size: 10 },
                            ...(xIsTemporal
                                ? {
                                    maxTicksLimit: 8,
                                    callback(v: number | string) {
                                        const n = typeof v === 'number' ? v : Number(v);
                                        if (!Number.isFinite(n)) return String(v);
                                        return new Date(n).toLocaleDateString(undefined, {
                                            month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC',
                                        });
                                    },
                                }
                                : {}),
                        },
                    },
                    y: {
                        type: 'linear',
                        // A ranged area reads its extent, not its distance from
                        // zero — fit the band rather than forcing a zero baseline.
                        title: { display: true, text: valueTitle },
                        ticks: { font: { size: 10 } },
                    },
                },
                plugins: {
                    tooltip: { enabled: true },
                    legend: { display: false },
                },
            },
        };

        /** Build the lower / upper data arrays for a group of rows. */
        const buildBoundData = (rows: any[], field: string): any => {
            if (xIsDiscrete) return buildCategoryAlignedData(rows, xField, field, categories!);
            return rows
                .map(r => ({ x: mapContinuousX(r[xField]), y: Number(r[field]) }))
                .filter(p => Number.isFinite(p.x) && Number.isFinite(p.y))
                .sort((a, b) => a.x - b.x);
        };

        const pushBand = (rows: any[], name: string, colorIdx: number) => {
            const lowerData = buildBoundData(rows, lowField);
            const upperData = buildBoundData(rows, highField);
            const border = getSeriesBorderColor(palette, colorIdx);
            const lowerIndex = config.data.datasets.length;
            // Lower bound — a thin line, no fill.
            config.data.datasets.push({
                label: name,
                data: lowerData,
                borderColor: border,
                backgroundColor: 'transparent',
                borderWidth: 1,
                pointRadius: 0,
                fill: false,
                tension: 0,
                _rangeBound: 'lower',
            });
            // Upper bound — fills DOWN to the lower dataset (the band ribbon).
            config.data.datasets.push({
                label: name,
                data: upperData,
                borderColor: border,
                backgroundColor: getSeriesBackgroundColor(palette, colorIdx, opacity),
                borderWidth: 1,
                pointRadius: 0,
                fill: { target: lowerIndex },
                tension: 0,
                _rangeBound: 'upper',
            });
        };

        if (colorField) {
            const groups = groupBy(table, colorField);
            let idx = 0;
            for (const [name, rows] of groups) {
                pushBand(rows, String(name), idx);
                idx++;
            }
            // One legend entry per band: hide the lower-bound datasets.
            config.options.plugins.legend = {
                display: true,
                labels: {
                    filter: (item: any, data: any) =>
                        data.datasets[item.datasetIndex]?._rangeBound !== 'lower',
                },
            };
        } else {
            pushBand(table, lowField, 0);
        }

        Object.assign(spec, config);
        delete spec.mark;
        delete spec.encoding;
    },
};
