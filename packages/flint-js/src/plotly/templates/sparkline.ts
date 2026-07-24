// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Sparkline template.
 *
 * A compact "sparkline table" — one row per series: its name, a small trend
 * line with a dashed reference rule, and an aggregate value — mirroring the
 * Vega-Lite Sparkline's visual pattern (Tufte's "dataword": drop the precise
 * scale, keep shape-at-a-glance so dozens of series fit in one Line Chart's
 * footprint).
 *
 * Composite layout, built directly on the Plotly figure rather than forced
 * through the generic column/row facet combiner (`../facet.ts`, which only
 * supports one cartesian axis pair per panel): each row gets its OWN hidden
 * axis pair (`xaxis{n}`/`yaxis{n}`) domain-positioned as a horizontal strip,
 * hosting the trend line + reference-rule traces; the category name and
 * aggregate value are `layout.annotations` in paper coordinates alongside it
 * — the same domain-grid + annotation technique `kpi-card.ts` uses for its
 * own per-tile grid. `selfManagesFacets` keeps the assembler from pre-
 * splitting this template by `column`/`row` (see `../assemble.ts`).
 *
 * The series field is the bound `color` (kept as the trend/value hue) or,
 * failing that, `detail` (monochrome) — same remap rule as the Vega-Lite
 * template's `normalizeEncodings`, applied here directly inside `instantiate`
 * since Plotly doesn't yet wire that hook (see `ChartTemplateDef.normalizeEncodings`).
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { getPlotlyPalette, getSeriesColor } from './utils';

const DEFAULT_TREND_W = 240;

const baselineProperty: ChartPropertyDef = {
    key: 'baseline', label: 'Reference line', type: 'discrete',
    defaultValue: 'mean',
    options: [
        { value: 'mean', label: 'Average' },
        { value: 'zero', label: 'Zero' },
        { value: 'median', label: 'Median' },
        { value: 'none', label: 'None' },
    ],
};

const trendWidthProperty: ChartPropertyDef = {
    key: 'trendWidth', label: 'Sparkline width', type: 'continuous',
    min: 80, max: 600, step: 10, defaultValue: DEFAULT_TREND_W,
};

const isCJK = (ch: string): boolean =>
    /[\u3000-\u303F\u3400-\u9FFF\uF900-\uFAFF\uFF00-\uFFEF]/.test(ch);
const textWidth = (s: unknown): number =>
    [...String(s ?? '')].reduce((a, ch) => a + (isCJK(ch) ? 2 : 1), 0);
const mean = (a: number[]): number => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : NaN);
const median = (a: number[]): number => {
    if (!a.length) return NaN;
    const s = [...a].sort((x, y) => x - y);
    const n = s.length;
    return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2;
};
/** Compact "$1.2M"-style approximation — the display value AND the width budget. */
function approxNum(v: number): string {
    if (!Number.isFinite(v)) return '';
    const a = Math.abs(v);
    if (a >= 1e9) return (v / 1e9).toFixed(1) + 'B';
    if (a >= 1e6) return (v / 1e6).toFixed(1) + 'M';
    if (a >= 1e3) return (v / 1e3).toFixed(1) + 'k';
    return String(Math.round(v * 10) / 10);
}

export const plSparklineDef: ChartTemplateDef = {
    chart: 'Sparkline',
    template: { mark: 'line', encoding: {} },
    channels: ['x', 'y', 'color', 'detail'],
    markCognitiveChannel: 'position',
    // See file docstring — a hand-built multi-axis-pair grid, not a single
    // cartesian panel the generic facet combiner could safely split/recombine.
    selfManagesFacets: true,
    instantiate: (spec, ctx) => {
        const { channelSemantics, chartProperties, canvasSize } = ctx;
        const xField = channelSemantics.x?.field;
        const yField = channelSemantics.y?.field;
        const hasColor = !!channelSemantics.color?.field;
        const seriesField = channelSemantics.color?.field ?? channelSemantics.detail?.field;
        if (!xField || !yField) return;

        const baseline = (chartProperties?.baseline as string) ?? 'mean';
        const useMedian = baseline === 'median';

        const table = (ctx.fullTable ?? ctx.table ?? []) as Array<Record<string, any>>;
        const facetField = seriesField ?? '__pl_spark_series';
        const rows = seriesField ? table : table.map(r => ({ ...r, [facetField]: '' }));

        // Row order = first appearance, stable.
        const series: any[] = [];
        const seen = new Set<any>();
        for (const r of rows) {
            const v = r[facetField];
            if (!seen.has(v)) { seen.add(v); series.push(v); }
        }
        if (series.length === 0) return;

        const bySeries = new Map<any, Array<Record<string, any>>>();
        for (const r of rows) {
            const k = r[facetField];
            const arr = bySeries.get(k);
            if (arr) arr.push(r); else bySeries.set(k, [r]);
        }

        const aggOf = (vals: number[]) => useMedian ? median(vals) : mean(vals);

        const categoryTitle = String(seriesField ?? '');
        const trendTitle = String(yField ?? '');
        const avgTitle = useMedian ? 'Median' : 'Average';

        // ── Sizing (manual — mirrors the Vega-Lite template's hand-rolled
        // hconcat sizing; the shared layout engine's faceted sizing doesn't
        // apply to a hand-built multi-axis grid). ─────────────────────────
        const canvas = canvasSize ?? { width: 480, height: 320 };
        const N = series.length;
        const HEADER_H = 20;
        const STRIP_GAP = 6;
        const INTER_GAP = 10;
        const CHAR_PX = 6.6;
        const fontSize = N > 12 ? 10 : 11;
        const stripH = Math.min(64, Math.max(16,
            Math.floor((canvas.height - HEADER_H - (N - 1) * STRIP_GAP) / N)));

        const seriesAgg = new Map<any, number>();
        for (const s of series) {
            const vals = (bySeries.get(s) ?? [])
                .map(r => Number(r[yField])).filter(v => Number.isFinite(v));
            seriesAgg.set(s, aggOf(vals));
        }

        const maxCatChars = Math.max(textWidth(categoryTitle), 4, ...series.map(s => textWidth(s)));
        const maxAvgChars = Math.max(textWidth(avgTitle), 4,
            ...Array.from(seriesAgg.values()).map(v => textWidth(approxNum(v))));
        const catW = Math.min(200, Math.max(40, Math.round(maxCatChars * CHAR_PX) + 10));
        const avgW = Math.min(96, Math.max(34, Math.round(maxAvgChars * CHAR_PX) + 8));
        const avail = canvas.width - catW - avgW - 2 * INTER_GAP;
        const tunedTrendW = Number(chartProperties?.trendWidth) || DEFAULT_TREND_W;
        const trendW = Math.max(90, Math.min(tunedTrendW, avail));

        const totalW = catW + INTER_GAP + trendW + INTER_GAP + avgW;
        const totalH = HEADER_H + N * stripH + (N - 1) * STRIP_GAP;

        const palette = getPlotlyPalette(ctx, 'color');
        const seriesColorIdx = new Map(series.map((s, i) => [s, i]));

        const traces: any[] = [];
        const annotations: any[] = [];
        const layout: any = { showlegend: false, margin: { t: 4, b: 4, l: 4, r: 4 } };

        // Column headers. Anchored `yanchor: 'top'` at paper y=1 so the text
        // renders DOWNWARD into the reserved `HEADER_H` band at the very top
        // of the figure — an `yanchor: 'bottom'` anchor at y=1 needs headroom
        // ABOVE the plot area (the figure's own top margin), which is too
        // thin here to avoid clipping the label against the image edge.
        const headerStyle = { size: 11, color: '#999' };
        annotations.push(
            { text: categoryTitle, x: 0, y: 1, xref: 'paper', yref: 'paper', xanchor: 'left', yanchor: 'top', showarrow: false, font: headerStyle },
            { text: trendTitle, x: (catW + INTER_GAP + trendW / 2) / totalW, y: 1, xref: 'paper', yref: 'paper', xanchor: 'center', yanchor: 'top', showarrow: false, font: headerStyle },
            { text: avgTitle, x: 1, y: 1, xref: 'paper', yref: 'paper', xanchor: 'right', yanchor: 'top', showarrow: false, font: headerStyle },
        );

        series.forEach((s, i) => {
            const seriesRows = (bySeries.get(s) ?? [])
                .map(r => ({ x: r[xField], y: Number(r[yField]) }))
                .filter(p => p.y != null && Number.isFinite(p.y));
            const yVals = seriesRows.map(p => p.y);
            const agg = seriesAgg.get(s);

            const rowTop = HEADER_H + i * (stripH + STRIP_GAP);
            const rowMidYFrac = 1 - (rowTop + stripH / 2) / totalH;

            annotations.push(
                { text: String(s), x: 0, y: rowMidYFrac, xref: 'paper', yref: 'paper', xanchor: 'left', yanchor: 'middle', showarrow: false, font: { size: fontSize, color: '#333' } },
                {
                    text: Number.isFinite(agg) ? approxNum(agg as number) : '',
                    x: 1, y: rowMidYFrac, xref: 'paper', yref: 'paper', xanchor: 'right', yanchor: 'middle', showarrow: false,
                    font: { size: fontSize, color: hasColor ? getSeriesColor(palette, seriesColorIdx.get(s) ?? 0) : '#333' },
                },
            );

            if (yVals.length === 0) return;

            const n = i + 1;
            const xName = n === 1 ? 'xaxis' : `xaxis${n}`;
            const yName = n === 1 ? 'yaxis' : `yaxis${n}`;
            const xRef = n === 1 ? 'x' : `x${n}`;
            const yRef = n === 1 ? 'y' : `y${n}`;

            const x0 = (catW + INTER_GAP) / totalW;
            const x1 = (catW + INTER_GAP + trendW) / totalW;
            const y1 = 1 - rowTop / totalH;
            const y0 = 1 - (rowTop + stripH) / totalH;
            layout[xName] = { domain: [x0, x1], anchor: yRef, visible: false, showgrid: false, zeroline: false };
            layout[yName] = { domain: [y0, y1], anchor: xRef, visible: false, showgrid: false, zeroline: false };

            traces.push({
                type: 'scatter', mode: 'lines',
                xaxis: xRef, yaxis: yRef,
                x: seriesRows.map(p => p.x), y: yVals,
                line: { width: 1.5, color: hasColor ? getSeriesColor(palette, i) : '#555' },
                hoverinfo: 'x+y',
                showlegend: false,
            });

            if (baseline !== 'none') {
                const refY = baseline === 'zero' ? 0 : (Number.isFinite(agg) ? agg : undefined);
                if (refY != null) {
                    traces.push({
                        type: 'scatter', mode: 'lines',
                        xaxis: xRef, yaxis: yRef,
                        x: [seriesRows[0].x, seriesRows[seriesRows.length - 1].x],
                        y: [refY, refY],
                        line: { width: 1, color: '#9a9a9a', dash: 'dot' },
                        hoverinfo: 'skip',
                        showlegend: false,
                    });
                }
            }
        });

        Object.assign(spec, {
            data: traces,
            layout: { ...layout, annotations },
            _width: Math.round(totalW),
            _height: Math.round(totalH),
        });
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [baselineProperty, trendWidthProperty],
};
