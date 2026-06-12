// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Chart.js Doughnut Chart template.
 *
 * Contrast with Pie:
 *   Pie: type = 'pie' (full disc, area encodes value)
 *   Doughnut: type = 'doughnut' with a `cutout` — the hollow centre trades a
 *             little area-judgement accuracy for a cleaner look and room for a
 *             centre label. Same data model as Pie (color = slice, size = value).
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import {
    extractCategories,
    getChartJsPalette,
    getSeriesBorderColor,
    getSeriesBackgroundColor,
} from './utils';

export const cjsDoughnutChartDef: ChartTemplateDef = {
    chart: 'Doughnut Chart',
    template: { mark: 'arc', encoding: {} },
    channels: ['size', 'color', 'column', 'row'],
    markCognitiveChannel: 'area',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const colorField = channelSemantics.color?.field;
        const sizeField = channelSemantics.size?.field;

        const labels: string[] = [];
        const values: number[] = [];

        const palette = getChartJsPalette(ctx, 'color');

        if (colorField && sizeField) {
            const agg = new Map<string, number>();
            for (const row of table) {
                const cat = String(row[colorField] ?? '');
                const val = Number(row[sizeField]) || 0;
                agg.set(cat, (agg.get(cat) ?? 0) + val);
            }
            const categories = extractCategories(table, colorField, channelSemantics.color?.ordinalSortOrder);
            for (const cat of categories) {
                labels.push(cat);
                values.push(agg.get(cat) ?? 0);
            }
        } else if (colorField) {
            const counts = new Map<string, number>();
            for (const row of table) {
                const cat = String(row[colorField] ?? '');
                counts.set(cat, (counts.get(cat) ?? 0) + 1);
            }
            const categories = extractCategories(table, colorField, channelSemantics.color?.ordinalSortOrder);
            for (const cat of categories) {
                labels.push(cat);
                values.push(counts.get(cat) ?? 0);
            }
        } else if (sizeField) {
            for (const row of table) {
                const val = Number(row[sizeField]) || 0;
                labels.push(String(val));
                values.push(val);
            }
        }

        // Default to a 55% hollow centre; let callers tune it.
        const cutout = chartProperties?.innerRadius ?? 55;

        const config: any = {
            type: 'doughnut',
            data: {
                labels,
                datasets: [{
                    data: values,
                    backgroundColor: labels.map((_, i) => getSeriesBackgroundColor(palette, i, 0.6)),
                    borderColor: labels.map((_, i) => getSeriesBorderColor(palette, i)),
                    borderWidth: 1,
                }],
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: `${cutout}%`,
                plugins: {
                    legend: { display: true, position: 'right' as const },
                    tooltip: { enabled: true },
                },
            },
            _width: Math.max(ctx.canvasSize.width, 300),
            _height: Math.max(ctx.canvasSize.height, 250),
        };

        Object.assign(spec, config);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        { key: 'innerRadius', label: 'Hole', type: 'continuous', min: 20, max: 80, step: 5, defaultValue: 55 } as ChartPropertyDef,
    ],
};
