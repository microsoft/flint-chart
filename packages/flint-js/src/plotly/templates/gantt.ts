// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Gantt Chart template.
 *
 * One horizontal bar per task, `base: start`, `x: end − start` — Plotly's
 * `base` property natively floats a bar off zero, so no transparent-base
 * trick (unlike the ECharts template, which must stack a silent base series
 * to fake a floating interval bar).
 */

import { ChartTemplateDef } from '../../core/types';
import {
    coerceGanttEndpoint, formatGanttLabel, GANTT_PROPERTIES, isGanttTemporal, sortGanttRows,
} from '../../chart-types/gantt';
import { getPlotlyPalette, getSeriesColor } from './utils';

export const plGanttChartDef: ChartTemplateDef = {
    chart: 'Gantt Chart',
    template: { mark: 'bar', encoding: {} },
    channels: ['y', 'x', 'x2', 'color', 'detail', 'column', 'row'],
    markCognitiveChannel: 'position',
    declareLayoutMode: () => ({ axisFlags: { y: { banded: true } } }),
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties, semanticTypes } = ctx;
        const taskField = channelSemantics.y?.field;
        const startField = channelSemantics.x?.field;
        const endField = channelSemantics.x2?.field;
        const colorField = channelSemantics.color?.field;
        if (!taskField || !startField || !endField || table.length === 0) return;

        const temporal = isGanttTemporal(channelSemantics.x?.type, semanticTypes[startField]);
        const rows = sortGanttRows(table
            .map((r: any, inputIndex: number) => ({
                task: String(r[taskField] ?? ''),
                start: coerceGanttEndpoint(r[startField], temporal),
                end: coerceGanttEndpoint(r[endField], temporal),
                group: colorField != null ? String(r[colorField] ?? '') : undefined,
                inputIndex,
            }))
            .filter((r) => r.task && Number.isFinite(r.start) && Number.isFinite(r.end)));
        if (rows.length === 0) return;

        const taskHeight = Number(chartProperties?.taskHeight ?? 70) / 100;
        const cornerRadius = Number(chartProperties?.cornerRadius ?? 2);
        const intervalLabels = chartProperties?.intervalLabels === true;
        const tasks = rows.map(r => r.task);

        const palette = getPlotlyPalette(ctx, 'color');
        const groups = colorField ? Array.from(new Set(rows.map(r => r.group ?? ''))) : [];
        const groupColorIdx = new Map(groups.map((g, i) => [g, i]));

        const dateLabel = (ms: number) => temporal ? new Date(ms).toISOString().slice(0, 10) : String(ms);

        const traces: any[] = [];
        if (colorField && groups.length > 0) {
            for (const g of groups) {
                const groupRows = rows.filter(r => (r.group ?? '') === g);
                traces.push({
                    type: 'bar',
                    name: g,
                    orientation: 'h',
                    base: groupRows.map(r => r.start),
                    x: groupRows.map(r => r.end - r.start),
                    y: groupRows.map(r => r.task),
                    width: taskHeight,
                    marker: { color: getSeriesColor(palette, groupColorIdx.get(g) ?? 0) },
                    text: intervalLabels ? groupRows.map(r => formatGanttLabel(r.start, r.end, temporal)) : undefined,
                    textposition: intervalLabels ? 'outside' as const : undefined,
                    customdata: groupRows.map(r => [dateLabel(r.start), dateLabel(r.end)]),
                });
            }
        } else {
            traces.push({
                type: 'bar',
                orientation: 'h',
                showlegend: false,
                base: rows.map(r => r.start),
                x: rows.map(r => r.end - r.start),
                y: tasks,
                width: taskHeight,
                marker: { color: getSeriesColor(palette, 0) },
                text: intervalLabels ? rows.map(r => formatGanttLabel(r.start, r.end, temporal)) : undefined,
                textposition: intervalLabels ? 'outside' as const : undefined,
                customdata: rows.map(r => [dateLabel(r.start), dateLabel(r.end)]),
            });
        }
        for (const t of traces) {
            t.hovertemplate = `%{y}<br />${startField}: %{customdata[0]}<br />${endField}: %{customdata[1]}<extra></extra>`;
            t.marker.line = { width: 0 };
            if (cornerRadius) t.marker.cornerradius = cornerRadius;
        }

        const xAxisSpec: any = { title: { text: temporal ? '' : startField } };
        if (temporal) xAxisSpec.type = 'date';

        Object.assign(spec, {
            data: traces,
            layout: {
                xaxis: xAxisSpec,
                yaxis: { type: 'category', categoryorder: 'array', categoryarray: tasks, autorange: 'reversed', title: { text: taskField } },
                showlegend: !!colorField && groups.length > 1,
            },
        });
        delete spec.mark;
        delete spec.encoding;
    },
    properties: GANTT_PROPERTIES,
};
