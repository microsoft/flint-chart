// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

import { ChartTemplateDef } from '../../core/types';
import {
    coerceGanttEndpoint,
    ganttDurationLabelExpression,
    ganttLabelReservePx,
    GANTT_PROPERTIES,
    isGanttTemporal,
} from '../../chart-types/gantt';

/**
 * Gantt chart — one horizontal bar per task, spanning [start, end].
 *
 * Channels:
 *   - y      task / activity label (the banded category axis)
 *   - x      start of the interval (temporal or quantitative)
 *   - x2     end of the interval (shares x's scale)
 *   - color  optional grouping (phase, owner, resource)
 *
 * The interval lives on x/x2 so the bar is positioned by where it starts and
 * ends rather than measured from a zero baseline — hence markCognitiveChannel
 * 'position' and an explicit non-zero x scale. Tasks are sorted by their start
 * so the timeline reads top-to-bottom in chronological order.
 */
export const ganttChartDef: ChartTemplateDef = {
    chart: "Gantt Chart",
    template: {
        mark: { type: "bar", cornerRadius: 2, height: { band: 0.7 } },
        encoding: {},
    },
    channels: ["y", "x", "x2", "color", "detail", "column", "row"],
    markCognitiveChannel: 'position',
    declareLayoutMode: () => ({
        axisFlags: { y: { banded: true } },
    }),
    instantiate: (spec, ctx) => {
        const { x, x2, y, color, detail, column, row } = ctx.resolvedEncodings;
        const taskHeight = (ctx.chartProperties?.taskHeight ?? 70) / 100;
        const cornerRadius = ctx.chartProperties?.cornerRadius ?? 2;
        const intervalLabels = ctx.chartProperties?.intervalLabels === true;
        const temporal = isGanttTemporal(x?.type, x?.field ? ctx.semanticTypes[x.field] : undefined);

        spec.mark = { type: 'bar', cornerRadius, height: { band: taskHeight } };

        if (!spec.encoding) spec.encoding = {};

        if (y) {
            spec.encoding.y = { ...y };
            spec.encoding.y.axis = { ...(spec.encoding.y.axis ?? {}), title: null };
            if (x?.field) {
                spec.encoding.y.sort = { field: x.field, op: 'min', order: 'ascending' };
            }
        }

        if (x) {
            spec.encoding.x = { ...x, ...(temporal ? { type: 'temporal' } : {}) };
            spec.encoding.x.axis = { ...(spec.encoding.x.axis ?? {}), title: null };
            // A non-zero baseline only matters for a quantitative interval; on a
            // time scale Vega-Lite ignores (and warns about) scale.zero.
            if (!temporal && x.type === 'quantitative') {
                spec.encoding.x.scale = { ...(spec.encoding.x.scale ?? {}), zero: false };
            }
        }
        // x2 shares x's scale; it only needs the field reference.
        if (x2) spec.encoding.x2 = { field: x2.field };

        if (color) spec.encoding.color = color;
        if (detail) spec.encoding.detail = detail;
        if (column) spec.encoding.column = column;
        if (row) spec.encoding.row = row;

        if (intervalLabels && x?.field && x2?.field && y) {
            const labelField = '__gantt_label';
            spec.transform = [
                ...(spec.transform ?? []),
                { calculate: ganttDurationLabelExpression(x.field, x2.field, temporal), as: labelField },
            ];
            const intervals = ctx.table
                .map((row: any, inputIndex: number) => ({
                    task: '',
                    start: coerceGanttEndpoint(row[x.field], temporal),
                    end: coerceGanttEndpoint(row[x2.field], temporal),
                    inputIndex,
                }))
                .filter((row) => Number.isFinite(row.start) && Number.isFinite(row.end));
            const reservePx = ganttLabelReservePx(intervals, temporal);
            const existingPadding = Number(spec.encoding.x.scale?.padding) || 0;
            spec.encoding.x.scale = {
                ...(spec.encoding.x.scale ?? {}),
                padding: Math.max(existingPadding, reservePx),
            };
            const barEncoding = { ...spec.encoding };
            const facetEncoding: Record<string, any> = {};
            if (column) facetEncoding.column = column;
            if (row) facetEncoding.row = row;
            delete barEncoding.column;
            delete barEncoding.row;
            spec.encoding = facetEncoding;
            spec.layer = [
                { mark: spec.mark, encoding: barEncoding },
                {
                    mark: { type: 'text', align: 'left', baseline: 'middle', dx: 4, fontSize: 10 },
                    encoding: {
                        y: { ...y },
                        x: {
                            field: x2.field,
                            type: temporal ? 'temporal' : x.type,
                            ...(barEncoding.x?.scale ? { scale: barEncoding.x.scale } : {}),
                        },
                        text: { field: labelField, type: 'nominal' },
                    },
                },
            ];
            delete spec.mark;
        }
    },
    properties: GANTT_PROPERTIES,
};
