// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Bullet Chart template.
 *
 * One row per KPI: qualitative gray zones (quarters of that row's own goal),
 * a value bar colored by goal attainment, and a target tick. Plotly has no
 * native bullet mark, so each element is drawn with an explicit `base` (the
 * bar's start offset, independent of any stacking mode) and
 * `layout.barmode: 'overlay'` so the zones and the value bar sit concentric
 * rather than dodged — the target tick is a `scatter` trace with
 * `marker.symbol: 'line-ns'`, Plotly's built-in vertical-tick glyph.
 */

import { ChartTemplateDef } from '../../core/types';
import { extractCategories } from './utils';

const ZONE_GRAYS = ['#e2e2e2', '#ececec', '#f5f5f5'];
const STATUS_COLORS = { below: '#c44e52', met: '#2f855a' };

export const plBulletChartDef: ChartTemplateDef = {
    chart: 'Bullet Chart',
    template: { mark: 'bar', encoding: {} },
    channels: ['y', 'x', 'goal', 'color', 'column', 'row'],
    markCognitiveChannel: 'length',
    declareLayoutMode: () => ({ axisFlags: { y: { banded: true } } }),
    instantiate: (spec, ctx) => {
        const { channelSemantics, table } = ctx;
        const labelField = channelSemantics.y?.field;
        const valueField = channelSemantics.x?.field;
        const goalField = channelSemantics.goal?.field;
        if (!labelField || !valueField || table.length === 0) return;

        const categories = extractCategories(table, labelField, channelSemantics.y?.ordinalSortOrder);
        const byCat = new Map<string, any>();
        for (const r of table) byCat.set(String(r[labelField] ?? ''), r);
        const valueOf = (cat: string) => Number(byCat.get(cat)?.[valueField]);
        const goalOf = (cat: string) => goalField != null ? Number(byCat.get(cat)?.[goalField]) : NaN;

        const quarter = categories.map(cat => {
            const g = goalOf(cat);
            return Number.isFinite(g) && g > 0 ? g / 4 : 0;
        });

        const zoneTraces = [0, 1, 2].map(i => ({
            type: 'bar',
            name: `__zone${i}`,
            orientation: 'h' as const,
            showlegend: false,
            hoverinfo: 'skip' as const,
            base: quarter.map(q => q * i),
            x: quarter,
            y: categories,
            width: 0.62,
            marker: { color: ZONE_GRAYS[i] },
        }));

        const valueTrace = {
            type: 'bar',
            name: 'value',
            orientation: 'h' as const,
            showlegend: false,
            base: categories.map(() => 0),
            x: categories.map(cat => { const v = valueOf(cat); return Number.isFinite(v) ? v : 0; }),
            y: categories,
            width: 0.32,
            marker: {
                color: categories.map(cat => {
                    const v = valueOf(cat); const g = goalOf(cat);
                    const met = Number.isFinite(g) ? v >= g : true;
                    return met ? STATUS_COLORS.met : STATUS_COLORS.below;
                }),
            },
            hovertemplate: `%{y}<br />${valueField}: %{x}<extra></extra>`,
        };

        const traces: any[] = [...zoneTraces, valueTrace];

        if (goalField) {
            traces.push({
                type: 'scatter',
                mode: 'markers',
                name: 'Target',
                x: categories.map(cat => goalOf(cat)),
                y: categories,
                marker: { symbol: 'line-ns', size: 22, line: { color: '#1a1a1a', width: 2.5 } },
                hovertemplate: `%{y}<br />${goalField}: %{x}<extra></extra>`,
            });
            // Legend-only swatches for the value bar's attainment colors
            // (the bar itself carries a per-point color array, which Plotly's
            // legend cannot summarize on its own). A single zero-width,
            // zero-opacity bar at an existing category — a truly empty trace
            // (`x: []`) does not render a legend entry at all.
            traces.push(
                { type: 'bar', name: 'Meets target', x: [0], y: [categories[0]], width: 0, hoverinfo: 'skip', marker: { color: STATUS_COLORS.met } },
                { type: 'bar', name: 'Below target', x: [0], y: [categories[0]], width: 0, hoverinfo: 'skip', marker: { color: STATUS_COLORS.below } },
            );
        }

        Object.assign(spec, {
            data: traces,
            layout: {
                barmode: 'overlay',
                xaxis: { title: { text: valueField }, rangemode: 'tozero' },
                yaxis: { type: 'category', categoryorder: 'array', categoryarray: categories, title: { text: labelField } },
                showlegend: !!goalField,
                // Vertical (default) legend layout needs plot-height room per
                // entry; a bullet chart is often short and wide (few rows), so
                // a horizontal legend below the plot fits these 3 longer
                // labels ("Target" / "Meets target" / "Below target") more
                // reliably than trying to widen a narrow side gutter.
                legend: { orientation: 'h', font: { size: 11 }, x: 0.5, xanchor: 'center', y: -0.18, yanchor: 'top' },
            },
        });
        delete spec.mark;
        delete spec.encoding;
    },
    postProcess: (figure) => {
        // Reserve room below the plot for the horizontal legend row instead of
        // the shared side gutter (sized for a typical short color legend,
        // too narrow for these longer labels).
        if (figure.layout?.showlegend) {
            if (typeof figure._width === 'number') {
                figure._width = Math.max(figure._width - 60, 320);
                figure.layout.width = figure._width;
            }
            if (typeof figure._height === 'number') {
                figure._height += 40;
                figure.layout.height = figure._height;
            }
            if (figure.layout.margin) figure.layout.margin.b = (figure.layout.margin.b ?? 0) + 40;
        }
    },
};
