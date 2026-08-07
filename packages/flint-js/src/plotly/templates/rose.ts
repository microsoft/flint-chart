// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Rose Chart (Nightingale / Coxcomb) template.
 *
 * Native `barpolar` trace: bars in polar coordinates, one wedge per angular
 * category. `layout.barmode: 'stack'` stacks color groups radially — Plotly
 * handles the polar stacking natively.
 *
 * NOTE on area-truth: the Vega-Lite/ECharts Rose templates map value → sqrt(value)
 * so wedge AREA is proportional to value (matching a true rose/Nightingale
 * chart). Plotly's native polar bar stacking sums raw `r` values, and undoing
 * that to preserve sqrt-area-truth under stacking would require reimplementing
 * the stacking arithmetic by hand. This template uses linear radius (radius ∝
 * value, area not strictly ∝ value) to keep Plotly's native stacking — a
 * documented behavioral difference from the other backends, flagged here for
 * anyone who needs strict area-truth parity.
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { extractCategories, groupBy, getPlotlyPalette, getSeriesColor } from './utils';
import { computeCircumferencePressure } from '../../core/decisions';

export const plRoseChartDef: ChartTemplateDef = {
    chart: 'Rose Chart',
    template: { mark: 'arc', encoding: {} },
    channels: ['x', 'y', 'color'],
    markCognitiveChannel: 'area',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const catField = channelSemantics.x?.field;
        const valField = channelSemantics.y?.field;
        const colorField = channelSemantics.color?.field;
        if (!catField || !valField) return;

        const fullTable = ctx.fullTable ?? table;
        let categories = extractCategories(fullTable, catField, channelSemantics.x?.ordinalSortOrder);
        if (categories.length === 0) return;

        const sortSlices = chartProperties?.sortSlices;
        if (sortSlices === 'descending' || sortSlices === 'ascending') {
            const totals = new Map<string, number>();
            for (const c of categories) totals.set(c, 0);
            for (const row of fullTable) {
                const c = String(row[catField] ?? '');
                if (totals.has(c)) totals.set(c, totals.get(c)! + (Number(row[valField]) || 0));
            }
            categories = [...categories].sort((a, b) =>
                sortSlices === 'descending' ? (totals.get(b) ?? 0) - (totals.get(a) ?? 0) : (totals.get(a) ?? 0) - (totals.get(b) ?? 0));
        }

        const sumPerCategory = (rows: any[]) => {
            const agg = new Map<string, number>();
            for (const row of rows) {
                const c = String(row[catField] ?? '');
                agg.set(c, (agg.get(c) ?? 0) + (Number(row[valField]) || 0));
            }
            return categories.map(c => agg.get(c) ?? 0);
        };

        const palette = getPlotlyPalette(ctx, 'color');
        const traces: any[] = [];
        if (colorField) {
            const colorCategories = extractCategories(
                fullTable,
                colorField,
                channelSemantics.color?.ordinalSortOrder,
            );
            for (const [name, rows] of groupBy(table, colorField)) {
                traces.push({
                    type: 'barpolar',
                    name,
                    r: sumPerCategory(rows),
                    theta: categories,
                    marker: { color: getSeriesColor(palette, Math.max(0, colorCategories.indexOf(name))) },
                });
            }
        } else {
            traces.push({
                type: 'barpolar',
                r: sumPerCategory(table),
                theta: categories,
                marker: { color: categories.map((_c, i) => getSeriesColor(palette, i)) },
                showlegend: false,
            });
        }

        const { canvasW, canvasH } = computeCircumferencePressure(categories.length, ctx.canvasSize, {
            minArcPx: 45,
            minRadius: 80,
            maxStretch: ctx.assembleOptions?.maxStretch,
            maxStretchX: ctx.assembleOptions?.maxStretchX,
            maxStretchY: ctx.assembleOptions?.maxStretchY,
        });

        Object.assign(spec, {
            data: traces,
            layout: {
                barmode: colorField ? 'stack' : undefined,
                polar: { angularaxis: { rotation: 90, direction: 'clockwise' }, radialaxis: { rangemode: 'tozero' } },
                showlegend: !!colorField,
            },
            _width: canvasW,
            _height: canvasH,
        });
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        {
            key: 'sortSlices', label: 'Sort slices', type: 'discrete', options: [
                { value: 'none', label: 'Data order' },
                { value: 'descending', label: 'Largest first' },
                { value: 'ascending', label: 'Smallest first' },
            ],
            defaultValue: 'none',
        } as ChartPropertyDef,
    ],
};
