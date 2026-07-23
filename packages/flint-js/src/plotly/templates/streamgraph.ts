// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Streamgraph template.
 *
 * A "center-offset" stacked area (Vega-Lite's `y.stack: 'center'` / ECharts'
 * native `themeRiver`). Plotly has no native wiggle/center stacking, so the
 * baseline is precomputed here (silhouette offset: `-totalAtX / 2`) and each
 * series is drawn as a cumulative line with `fill: 'tonexty'` against the
 * previous series' cumulative line — the same successive-ribbon technique
 * `plRangeAreaChartDef` uses for a single band, chained across N series.
 */

import { ChartTemplateDef } from '../../core/types';
import { extractCategories, coerceIsoDateForPlotly, getPlotlyPalette, getSeriesColor } from './utils';

export const plStreamgraphDef: ChartTemplateDef = {
    chart: 'Streamgraph',
    template: { mark: 'area', encoding: {} },
    channels: ['x', 'y', 'color', 'column', 'row'],
    markCognitiveChannel: 'area',
    declareLayoutMode: () => ({
        paramOverrides: { continuousMarkCrossSection: { x: 100, y: 20, seriesCountAxis: 'auto' } },
    }),
    instantiate: (spec, ctx) => {
        const { channelSemantics, table } = ctx;
        const xCS = channelSemantics.x;
        const yCS = channelSemantics.y;
        const colorField = channelSemantics.color?.field;
        if (!xCS?.field || !yCS?.field) return;
        const xField = xCS.field;
        const yField = yCS.field;
        const xIsTemporal = xCS.type === 'temporal';
        const mapX = (raw: unknown) => (xIsTemporal ? coerceIsoDateForPlotly(raw) : raw);

        // Shared x categories across all series (temporal/ordinal x, sorted).
        const xKeys = extractCategories(table, xField, xCS.ordinalSortOrder);
        const orderedKeys = xIsTemporal
            ? [...xKeys].sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
            : (xCS.type === 'quantitative' ? [...xKeys].sort((a, b) => Number(a) - Number(b)) : xKeys);

        const seriesNames = colorField
            ? [...new Set(table.map((r: any) => String(r[colorField] ?? '')))]
            : [yField];

        // value(seriesName, xKey)
        const valMap = new Map<string, number>();
        for (const row of table) {
            const xk = String(row[xField]);
            const sn = colorField ? String(row[colorField] ?? '') : yField;
            const v = Number(row[yField]);
            valMap.set(`${xk}\u0000${sn}`, (Number.isFinite(v) ? v : 0));
        }

        // Per-x total → silhouette baseline (centers the stack around zero).
        const totals = orderedKeys.map(xk =>
            seriesNames.reduce((sum, sn) => sum + (valMap.get(`${xk}\u0000${sn}`) ?? 0), 0));
        const baseline = totals.map(t => -t / 2);

        const xVals = orderedKeys.map(k => (xIsTemporal ? mapX(k) : (xCS.type === 'quantitative' ? Number(k) : k)));
        const palette = getPlotlyPalette(ctx, 'color');

        const traces: any[] = [{
            type: 'scatter', mode: 'lines', showlegend: false,
            x: xVals, y: baseline,
            line: { width: 0 }, hoverinfo: 'skip',
        }];
        let cumulative = [...baseline];
        seriesNames.forEach((sn, i) => {
            cumulative = cumulative.map((c, xi) => c + (valMap.get(`${orderedKeys[xi]}\u0000${sn}`) ?? 0));
            const color = getSeriesColor(palette, i);
            traces.push({
                type: 'scatter', mode: 'lines',
                name: sn,
                x: xVals, y: [...cumulative],
                line: { width: 0.5, color },
                fill: 'tonexty',
                fillcolor: color,
            });
        });

        const xAxisSpec: any = { title: { text: xField } };
        if (xIsTemporal) xAxisSpec.type = 'date';
        else if (xCS.type !== 'quantitative') {
            xAxisSpec.type = 'category';
            xAxisSpec.categoryorder = 'array';
            xAxisSpec.categoryarray = orderedKeys;
        }

        Object.assign(spec, {
            data: traces,
            layout: {
                xaxis: xAxisSpec,
                yaxis: { title: { text: yField }, showticklabels: false, zeroline: false },
                showlegend: !!colorField,
            },
        });
        delete spec.mark;
        delete spec.encoding;
    },
};
