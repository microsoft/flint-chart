// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Gauge Chart template — Plotly opportunity chart.
 *
 * Native `indicator` trace with `mode: 'gauge+number'`: Plotly draws the
 * dial, needle, and colored range bands itself. Matches the ECharts-only
 * `Gauge Chart` chart type (no Vega-Lite equivalent) with a genuinely
 * native, purpose-built primitive (ECharts hand-computes dial geometry).
 *
 * Data model:
 *   size   (quantitative): the value to display
 *   column (nominal, optional): one gauge per distinct value (grid layout)
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { extractCategories, groupBy, getPlotlyPalette, getSeriesColor, niceMax } from './utils';

export const plGaugeChartDef: ChartTemplateDef = {
    chart: 'Gauge Chart',
    template: { mark: 'point', encoding: {} },
    channels: ['size', 'column'],
    markCognitiveChannel: 'position',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const valueField = channelSemantics.size?.field;
        const columnField = channelSemantics.column?.field;
        if (!valueField) return;

        const allValues = table.map((r: any) => Number(r[valueField])).filter((v: number) => isFinite(v));
        const dataMax = allValues.length > 0 ? Math.max(...allValues) : 100;
        const scaleMin = Number(chartProperties?.min ?? 0);
        const scaleMax = Number(chartProperties?.max ?? niceMax(dataMax));
        const palette = getPlotlyPalette(ctx, 'color');

        const items: { name: string; value: number }[] = [];
        if (columnField) {
            const categories = extractCategories(table, columnField, channelSemantics.column?.ordinalSortOrder);
            const groups = groupBy(table, columnField);
            for (const cat of categories) {
                const vals = (groups.get(cat) ?? []).map((r: any) => Number(r[valueField])).filter((v: number) => isFinite(v));
                items.push({ name: cat, value: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0 });
            }
        } else {
            const avg = allValues.length ? allValues.reduce((a, b) => a + b, 0) / allValues.length : 0;
            items.push({ name: valueField, value: avg });
        }

        const n = items.length;
        const cols = Math.ceil(Math.sqrt(n));
        const gridRows = Math.ceil(n / cols);
        const gapFrac = 0.04;
        const cellW = (1 - gapFrac * (cols - 1)) / cols;
        const cellH = (1 - gapFrac * (gridRows - 1)) / gridRows;

        const traces = items.map((item, i) => {
            const col = i % cols;
            const row = Math.floor(i / cols);
            const x0 = col * (cellW + gapFrac);
            const y1 = 1 - row * (cellH + gapFrac);
            const y0 = y1 - cellH;
            const color = getSeriesColor(palette, i);
            return {
                type: 'indicator',
                mode: 'gauge+number',
                value: Math.round(item.value * 100) / 100,
                title: { text: item.name, font: { size: 13 } },
                domain: { x: [x0, x0 + cellW], y: [y0, y1] },
                gauge: {
                    axis: { range: [scaleMin, scaleMax] },
                    bar: { color },
                    bgcolor: 'white',
                    borderwidth: 1,
                    bordercolor: '#d1d5db',
                },
            };
        });

        const canvas = ctx.canvasSize ?? { width: 400, height: 300 };
        Object.assign(spec, {
            data: traces,
            layout: {},
            _width: Math.max(canvas.width, cols * 220),
            _height: Math.max(canvas.height, gridRows * 220),
        });
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        { key: 'min', label: 'Min', type: 'continuous', min: 0, max: 1000, step: 10, defaultValue: 0 } as ChartPropertyDef,
        { key: 'max', label: 'Max', type: 'continuous', min: 0, max: 10000, step: 100, defaultValue: 100 } as ChartPropertyDef,
    ],
};
