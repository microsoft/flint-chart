// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Radar Chart template.
 *
 * Native `scatterpolar` trace with `fill: 'toself'` — Plotly handles the
 * polar projection, axis spokes, and grid rings natively (no manual trig
 * like the Vega-Lite template needs).
 *
 * Data model (long format): x = metric name, y = value, color = entity/group.
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { extractCategories, groupBy, getPlotlyPalette, getSeriesColor, fillColor, niceMax } from './utils';
import { computeCircumferencePressure } from '../../core/decisions';

export const plRadarChartDef: ChartTemplateDef = {
    chart: 'Radar Chart',
    template: { mark: 'point', encoding: {} },
    channels: ['x', 'y', 'color'],
    markCognitiveChannel: 'position',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const axisField = channelSemantics.x?.field;
        const valueField = channelSemantics.y?.field;
        const groupField = channelSemantics.color?.field;
        if (!axisField || !valueField) return;

        const metrics = extractCategories(table, axisField, channelSemantics.x?.ordinalSortOrder);
        if (metrics.length < 2) return;

        // Close the loop: repeat the first metric at the end so the polygon closes.
        const closedMetrics = [...metrics, metrics[0]];

        const meanPerMetric = (rows: any[]) => {
            const sums = new Map<string, { sum: number; count: number }>();
            for (const row of rows) {
                const m = String(row[axisField] ?? '');
                const v = Number(row[valueField]) || 0;
                const e = sums.get(m) ?? { sum: 0, count: 0 };
                e.sum += v; e.count++;
                sums.set(m, e);
            }
            return metrics.map(m => {
                const e = sums.get(m);
                return e ? Math.round((e.sum / e.count) * 100) / 100 : 0;
            });
        };

        const filled = chartProperties?.filled !== false;
        const fillOpacity = Number(chartProperties?.fillOpacity ?? 0.3);
        const palette = getPlotlyPalette(ctx, 'color');

        const allVals = table.map((r: any) => Number(r[valueField])).filter((v: number) => isFinite(v));
        const radialMax = niceMax(allVals.length > 0 ? Math.max(...allVals) : 1);

        const traces: any[] = [];
        const makeTrace = (name: string | undefined, rows: any[], idx: number) => {
            const values = meanPerMetric(rows);
            const closedValues = [...values, values[0]];
            const color = getSeriesColor(palette, idx);
            return {
                type: 'scatterpolar',
                mode: 'lines+markers',
                ...(name != null ? { name } : {}),
                r: closedValues,
                theta: closedMetrics,
                line: { color },
                marker: { color },
                fill: filled ? ('toself' as const) : undefined,
                fillcolor: filled ? fillColor(color, fillOpacity) : undefined,
            };
        };

        if (groupField) {
            let i = 0;
            for (const [name, rows] of groupBy(table, groupField)) { traces.push(makeTrace(name, rows, i)); i++; }
        } else {
            traces.push(makeTrace(undefined, table, 0));
        }

        const { canvasW, canvasH } = computeCircumferencePressure(metrics.length, ctx.canvasSize, {
            minArcPx: 60,
            minRadius: 80,
            maxStretch: ctx.assembleOptions?.maxStretch,
            maxStretchX: ctx.assembleOptions?.maxStretchX,
            maxStretchY: ctx.assembleOptions?.maxStretchY,
        });

        Object.assign(spec, {
            data: traces,
            layout: {
                polar: {
                    radialaxis: { visible: true, range: [0, radialMax] },
                    angularaxis: { rotation: 90, direction: 'clockwise' },
                },
                showlegend: !!groupField,
            },
            _width: canvasW,
            _height: canvasH,
        });
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        {
            key: 'filled', label: 'Fill', type: 'discrete', options: [
                { value: true, label: 'Filled (default)' },
                { value: false, label: 'Outline only' },
            ],
        } as ChartPropertyDef,
        { key: 'fillOpacity', label: 'Opacity', type: 'continuous', min: 0.05, max: 0.8, step: 0.05, defaultValue: 0.3 } as ChartPropertyDef,
    ],
};
