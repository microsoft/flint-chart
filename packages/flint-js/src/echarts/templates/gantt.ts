// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * ECharts Gantt Chart — one horizontal bar per task, spanning [start, end]
 * (mirror vegalite/templates/gantt.ts).
 *
 * Channels:
 *   - y      task / activity label (banded category axis)
 *   - x      start of the interval (temporal or quantitative)
 *   - x2     end of the interval (shares x's scale)
 *   - color  optional grouping (phase, owner, resource)
 *
 * ECharts has no native interval-bar mark, so the bar is floated using the same
 * transparent-base + visible-delta stack the waterfall uses: a silent
 * transparent bar carries the start offset and the colored bar carries the
 * duration (end − start). Tasks are sorted by start so the timeline reads
 * chronologically top-to-bottom (the category axis is inverted so index 0 sits
 * at the top). Temporal intervals are positioned on a value axis of epoch
 * milliseconds with a date-formatting axis label.
 */

import { ChartTemplateDef } from '../../core/types';
import {
    coerceGanttEndpoint,
    formatGanttLabel,
    ganttLabelReservePx,
    GANTT_PROPERTIES,
    isGanttTemporal,
    sortGanttRows,
} from '../../chart-types/gantt';
import { DEFAULT_COLORS } from './utils';

/** Format an epoch-ms value as a compact ISO date (YYYY-MM-DD). */
function fmtDate(ms: number): string {
    if (!Number.isFinite(ms)) return '';
    return new Date(ms).toISOString().slice(0, 10);
}

export const ecGanttChartDef: ChartTemplateDef = {
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

        // One row per task, sorted by start ascending so the timeline reads
        // chronologically. The y-axis is inverted below, so the earliest task,
        // first in this list, ends up at the top.
        const rows = sortGanttRows(table
            .map((r: any, inputIndex: number) => ({
                task: String(r[taskField] ?? ''),
                start: coerceGanttEndpoint(r[startField], temporal),
                end: coerceGanttEndpoint(r[endField], temporal),
                group: colorField != null ? String(r[colorField] ?? '') : undefined,
                inputIndex,
            }))
            .filter((r) => r.task && Number.isFinite(r.start) && Number.isFinite(r.end)));
        const taskHeight = chartProperties?.taskHeight ?? 70;
        const cornerRadius = chartProperties?.cornerRadius ?? 2;
        const intervalLabels = chartProperties?.intervalLabels === true;
        const labelReserve = ganttLabelReservePx(rows, temporal);

        const tasks = rows.map((r) => r.task);

        // Color groups → palette.
        const groups = colorField
            ? Array.from(new Set(rows.map((r) => r.group ?? '')))
            : [];
        const groupColor = new Map<string, string>();
        groups.forEach((g, i) => groupColor.set(g, DEFAULT_COLORS[i % DEFAULT_COLORS.length]));
        const BAR_COLOR = DEFAULT_COLORS[0];

        const baseData = rows.map((r) => r.start);
        const durationData = rows.map((r) => ({
            value: r.end - r.start,
            itemStyle: { color: colorField ? (groupColor.get(r.group ?? '') ?? BAR_COLOR) : BAR_COLOR },
        }));

        const option: any = {
            tooltip: {
                trigger: 'item',
                formatter: (p: any) => {
                    if (p.seriesName === '_base') return '';
                    const r = rows[p.dataIndex];
                    if (!r) return '';
                    const s = temporal ? fmtDate(r.start) : r.start;
                    const e = temporal ? fmtDate(r.end) : r.end;
                    const grp = r.group != null ? `<br/>${colorField}: ${r.group}` : '';
                    return `${r.task}<br/>${startField}: ${s}<br/>${endField}: ${e}${grp}`;
                },
            },
            grid: {
                containLabel: true,
                ...(intervalLabels ? { right: labelReserve } : {}),
            },
            xAxis: {
                type: 'value',
                scale: true,
                name: temporal ? '' : startField,
                nameLocation: 'middle',
                nameGap: 30,
                axisLabel: temporal
                    ? { formatter: (v: number) => fmtDate(v), hideOverlap: true }
                    : {},
            },
            yAxis: {
                type: 'category',
                data: tasks,
                inverse: true,
                axisTick: { show: false },
                axisLabel: { interval: 0 },
            },
            series: [
                {
                    type: 'bar',
                    name: '_base',
                    stack: 'gantt',
                    data: baseData,
                    itemStyle: { color: 'transparent' },
                    silent: true,
                    emphasis: { disabled: true },
                    barWidth: `${taskHeight}%`,
                },
                {
                    type: 'bar',
                    name: 'Task',
                    stack: 'gantt',
                    data: durationData,
                    barWidth: `${taskHeight}%`,
                    itemStyle: { borderRadius: cornerRadius },
                    label: {
                        show: intervalLabels,
                        position: 'right',
                        formatter: (p: any) => {
                            const row = rows[p.dataIndex];
                            return row ? formatGanttLabel(row.start, row.end, temporal) : '';
                        },
                    },
                },
            ],
        };

        // Color legend: one swatch per group, rendered as data-less bar series
        // sharing the stack so ECharts reserves no extra bar slot for them.
        if (colorField && groups.length > 1) {
            option.legend = { data: groups, top: 0 };
            option._legendTitle = colorField;
            for (const g of groups) {
                option.series.push({
                    type: 'bar',
                    name: g,
                    stack: 'gantt',
                    data: [],
                    barWidth: `${taskHeight}%`,
                    itemStyle: { color: groupColor.get(g) },
                });
            }
            option.grid.top = 40;
        }

        Object.assign(spec, option);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: GANTT_PROPERTIES,
};
