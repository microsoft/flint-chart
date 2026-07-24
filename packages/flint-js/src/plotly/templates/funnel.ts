// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Funnel Chart template — Plotly opportunity chart.
 *
 * Native `funnel` trace: Plotly draws the descending trapezoids, stage
 * labels, and percent-of-initial/-previous annotations itself. Matches the
 * ECharts-only `Funnel Chart` chart type (no Vega-Lite equivalent).
 *
 * Data model:
 *   y    (nominal): stage name
 *   size (quantitative): value for each stage (rows aggregated by sum)
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { extractCategories, getPlotlyPalette } from './utils';

export const plFunnelChartDef: ChartTemplateDef = {
    chart: 'Funnel Chart',
    template: { mark: 'rect', encoding: {} },
    channels: ['y', 'size'],
    markCognitiveChannel: 'area',
    declareLayoutMode: () => ({
        axisFlags: { y: { banded: true } },
        paramOverrides: { defaultBandSize: 50 },
    }),
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const stageField = channelSemantics.y?.field;
        const valField = channelSemantics.size?.field;
        if (!stageField) return;

        const stages = extractCategories(table, stageField, channelSemantics.y?.ordinalSortOrder);
        if (stages.length === 0) return;

        const values: number[] = [];
        if (valField) {
            const agg = new Map<string, number>();
            for (const row of table) {
                const s = String(row[stageField] ?? '');
                agg.set(s, (agg.get(s) ?? 0) + (Number(row[valField]) || 0));
            }
            for (const s of stages) values.push(agg.get(s) ?? 0);
        } else {
            const counts = new Map<string, number>();
            for (const row of table) {
                const s = String(row[stageField] ?? '');
                counts.set(s, (counts.get(s) ?? 0) + 1);
            }
            for (const s of stages) values.push(counts.get(s) ?? 0);
        }

        // Sort stages largest-first by default (a funnel reads top-down as a
        // narrowing pipeline).
        const sortOrder = chartProperties?.sort ?? 'descending';
        const order = stages.map((_s, i) => i);
        if (sortOrder === 'descending') order.sort((a, b) => values[b] - values[a]);
        else if (sortOrder === 'ascending') order.sort((a, b) => values[a] - values[b]);
        const sortedStages = order.map(i => stages[i]);
        const sortedValues = order.map(i => values[i]);

        const palette = getPlotlyPalette(ctx, 'color');

        Object.assign(spec, {
            data: [{
                type: 'funnel',
                y: sortedStages,
                x: sortedValues,
                textinfo: 'value+percent initial',
                marker: { color: palette.slice(0, sortedStages.length) },
                connector: { line: { color: '#e5e7eb', width: 1 } },
            }],
            layout: { showlegend: false },
        });
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        {
            key: 'sort', label: 'Sort', type: 'discrete', defaultValue: 'descending',
            options: [
                { value: 'descending', label: 'Descending (default)' },
                { value: 'ascending', label: 'Ascending' },
                { value: 'none', label: 'Original order' },
            ],
        } as ChartPropertyDef,
    ],
};
