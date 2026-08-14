// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Waterfall Chart template.
 *
 * Native `waterfall` trace: pass `x`, `y` (signed deltas) and a `measure`
 * array (`'relative'` | `'total'`) and Plotly computes the floating bars,
 * connector lines, and running totals itself — no manual cumulative-sum /
 * custom-render-item bookkeeping like the ECharts template needs.
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { extractCategories } from './utils';
import { resolveTotalsMode } from '../../chart-types/waterfall';

export const plWaterfallChartDef: ChartTemplateDef = {
    chart: 'Waterfall Chart',
    template: { mark: 'bar', encoding: {} },
    channels: ['x', 'y', 'color', 'column', 'row'],
    markCognitiveChannel: 'length',
    declareLayoutMode: () => ({ axisFlags: { x: { banded: true } } }),
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const xField = channelSemantics.x?.field || 'Category';
        const yField = channelSemantics.y?.field || 'Amount';
        const colorField = channelSemantics.color?.field;

        const categories = extractCategories(table, xField, undefined);
        const rows = categories.map(cat => table.find((r: any) => String(r[xField]) === cat)).filter(Boolean);
        const values = rows.map((r: any) => Number(r[yField]) || 0);

        const hasTypeCol = !!colorField;
        const totalsMode = resolveTotalsMode(values, chartProperties?.totals);
        const wantFirst = totalsMode === 'first' || totalsMode === 'both';
        const wantLast = totalsMode === 'last' || totalsMode === 'both';
        const types: string[] = hasTypeCol
            ? rows.map((r: any) => String(r[colorField] ?? 'delta'))
            : values.map((_v, i) =>
                wantFirst && i === 0 ? 'start' : wantLast && i === values.length - 1 ? 'end' : 'delta');
        // Plotly's native `measure: 'total'` does NOT anchor the bar at the
        // row's own value — it re-derives the bar height as the cumulative
        // sum of every 'relative' row since the previous checkpoint (or since
        // the start, for the first checkpoint), ignoring the supplied `y`.
        // That is exactly right for a genuine reconciling subtotal/end-total
        // (its value was chosen — via `resolveTotalsMode`/`waterfallLastReconciles`
        // — BECAUSE it already equals that running sum). But at row 0 there is
        // no preceding cumulative to show (Plotly renders a zero-height bar),
        // so a "start" anchor MUST be a 'relative' delta from the implicit
        // zero baseline instead — numerically identical to the value the
        // other backends draw, just colored increase/decrease rather than the
        // dedicated "total" hue.
        const measure = types.map((t, i) => {
            if (i === 0) return 'relative';
            return (t === 'start' || t === 'end') ? 'total' : 'relative';
        }) as Array<'total' | 'relative'>;

        const showLabels = !!chartProperties?.showTextLabels;

        // Value labels sit OUTSIDE the bars (above a rise, below a fall). Plotly's
        // auto-range only fits the bar extents, not the outside text, so the
        // labels on the tallest/deepest bars get clipped at the plot edge. When
        // labels are on, pad the y-range past the running-total envelope so the
        // callouts have room, and set `cliponaxis: false` so a label that still
        // reaches the edge is drawn into the margin rather than cut off.
        let yRange: [number, number] | undefined;
        if (showLabels) {
            const extents = [0];
            let run = 0;
            for (const v of values) { run += v; extents.push(run); }
            const lo = Math.min(...extents);
            const hi = Math.max(...extents);
            const pad = (hi - lo || Math.abs(hi) || 1) * 0.15;
            yRange = [lo - pad, hi + pad];
        }

        Object.assign(spec, {
            data: [{
                type: 'waterfall',
                x: categories,
                y: values,
                measure,
                // Plotly's native waterfall palette (its default template):
                // teal-green rises, red falls, blue totals, dark-grey
                // connectors — rather than borrowing the ECharts hues, so the
                // Plotly output looks native.
                connector: { line: { color: '#444', width: 1 } },
                increasing: { marker: { color: '#3D9970' } },
                decreasing: { marker: { color: '#FF4136' } },
                totals: { marker: { color: '#4499FF' } },
                text: showLabels ? values.map(v => (v > 0 ? '+' : '') + v) : undefined,
                textposition: showLabels ? 'outside' as const : undefined,
                ...(showLabels ? { cliponaxis: false } : {}),
                showlegend: false,
            }],
            layout: {
                xaxis: { type: 'category', categoryorder: 'array', categoryarray: categories, title: { text: xField } },
                yaxis: { title: { text: yField }, ...(yRange ? { range: yRange } : {}) },
                showlegend: false,
            },
        });
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        {
            key: 'totals', label: 'Totals', type: 'discrete', defaultValue: 'auto',
            options: [
                { value: 'auto', label: 'Auto' },
                { value: 'none', label: 'None' },
                { value: 'first', label: 'First only' },
                { value: 'last', label: 'Last only' },
                { value: 'both', label: 'First and last' },
            ],
        } as ChartPropertyDef,
        { key: 'showTextLabels', label: 'Value labels', type: 'binary', defaultValue: false } as ChartPropertyDef,
    ],
};
