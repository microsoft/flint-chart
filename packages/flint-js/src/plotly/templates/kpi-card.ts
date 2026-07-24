// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly KPI Card template.
 *
 * Native `indicator` trace (`mode: 'number+delta'`): Plotly renders the big
 * number, the caption (`title`), and — when a `goal` is bound — a delta
 * arrow/percentage against it, all natively. This is a much simpler mapping
 * than the Vega-Lite template, which hand-draws each card (rect + text marks)
 * because Vega-Lite has no indicator primitive.
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';

type Layout = 'horizontal' | 'vertical' | 'grid';

export const plKpiCardDef: ChartTemplateDef = {
    chart: 'KPI Card',
    template: { layer: [] },
    channels: ['metric', 'value', 'goal'],
    markCognitiveChannel: 'position',
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const metricField = channelSemantics.metric?.field;
        const valueField = channelSemantics.value?.field;
        const goalField = channelSemantics.goal?.field;
        if (!valueField) return;

        const rows = (ctx.fullTable ?? table ?? []).filter((r: any) => r && r[valueField] != null);
        if (rows.length === 0) return;

        const layout: Layout = (chartProperties?.layout as Layout) ?? (rows.length > 4 ? 'grid' : 'horizontal');
        const n = rows.length;
        let cols: number, gridRows: number;
        if (layout === 'vertical') { cols = 1; gridRows = n; }
        else if (layout === 'horizontal') { cols = n; gridRows = 1; }
        else { cols = Math.ceil(Math.sqrt(n)); gridRows = Math.ceil(n / cols); }

        const gapFrac = 0.02;
        const cellW = (1 - gapFrac * (cols - 1)) / cols;
        const cellH = (1 - gapFrac * (gridRows - 1)) / gridRows;

        // KPI cards are content-sized tiles, NOT full-canvas charts — stretching
        // a single card to the whole requested canvas width (e.g. 480px) strands
        // the caption + number in a sea of whitespace. Size each tile to a
        // compact fixed footprint and let the grid grow with the tile COUNT
        // instead of filling the canvas.
        const TILE_W = 220;
        const TILE_H = 150;
        const figWidth = Math.round(cols * TILE_W + gapFrac * (cols - 1) * TILE_W);
        const figHeight = Math.round(gridRows * TILE_H + gapFrac * (gridRows - 1) * TILE_H);
        // Font sizes scale with each cell's actual pixel height so a dense
        // grid of many tiles doesn't overflow its row with fixed-size text.
        const captionFontPx = Math.max(10, Math.min(14, cellH * figHeight * 0.16));
        const valueFontPx = Math.max(16, Math.min(30, cellH * figHeight * 0.32));
        const goalFontPx = Math.max(9, Math.min(12, cellH * figHeight * 0.12));

        const traces: any[] = [];
        const annotations: any[] = [];
        rows.forEach((row: any, i: number) => {
            const col = i % cols;
            const gridRow = Math.floor(i / cols);
            const x0 = col * (cellW + gapFrac);
            const y1 = 1 - gridRow * (cellH + gapFrac);
            const y0 = y1 - cellH;
            const rawValue = row[valueField];
            const value = Number(rawValue);
            const isNumeric = rawValue != null && rawValue !== '' && Number.isFinite(value);
            const goal = goalField != null ? Number(row[goalField]) : undefined;
            const hasGoal = goal != null && Number.isFinite(goal);
            const caption = metricField ? String(row[metricField] ?? '') : valueField;

            if (isNumeric) {
                const indicator: any = {
                    type: 'indicator',
                    mode: hasGoal ? 'number+delta' : 'number',
                    value,
                    title: { text: caption, font: { size: captionFontPx } },
                    number: { font: { size: valueFontPx } },
                    domain: { x: [x0, x0 + cellW], y: [y0, y1] },
                };
                if (hasGoal) {
                    indicator.delta = { reference: goal, relative: false, increasing: { color: '#2f855a' }, decreasing: { color: '#c44e52' } };
                }
                traces.push(indicator);
            } else {
                // Plotly's `indicator` trace requires a numeric `value` — it has
                // no text-display mode. A pre-formatted display string (e.g.
                // "$1.2M", a unit already baked in upstream) is rendered as a
                // plain annotation pair instead, positioned at the same
                // fractional domain the numeric tiles use (offsets scaled by
                // this cell's own height) so every tile still lines up in the
                // grid regardless of row count.
                const cx = (x0 + x0 + cellW) / 2;
                const cy = (y0 + y1) / 2;
                annotations.push(
                    { text: caption, x: cx, y: cy + cellH * 0.32, xref: 'paper', yref: 'paper', xanchor: 'center', yanchor: 'middle', showarrow: false, font: { size: captionFontPx, color: '#6b7280' } },
                    { text: String(rawValue ?? ''), x: cx, y: cy - cellH * 0.06, xref: 'paper', yref: 'paper', xanchor: 'center', yanchor: 'middle', showarrow: false, font: { size: valueFontPx, color: '#111827' } },
                    ...(hasGoal
                        ? [{ text: `Goal: ${goal}`, x: cx, y: cy - cellH * 0.36, xref: 'paper' as const, yref: 'paper' as const, xanchor: 'center' as const, yanchor: 'middle' as const, showarrow: false, font: { size: goalFontPx, color: '#9ca3af' } }]
                        : []),
                );
            }
        });

        Object.assign(spec, {
            data: traces,
            layout: {
                annotations,
                // Indicator traces suppress Plotly's default cartesian axes on
                // their own; a card row with only text annotations (a
                // pre-formatted string value) has no trace to do that, so the
                // axes must be hidden explicitly or a stray 0–1 grid shows
                // through behind the text.
                xaxis: { visible: false },
                yaxis: { visible: false },
            },
            _width: figWidth,
            _height: figHeight,
        });
        delete spec.layer;
    },
    properties: [
        {
            key: 'layout', label: 'Layout', type: 'discrete',
            options: [
                { value: 'horizontal', label: 'Horizontal (default)' },
                { value: 'vertical', label: 'Vertical' },
                { value: 'grid', label: 'Grid' },
            ],
        } as ChartPropertyDef,
    ],
};
