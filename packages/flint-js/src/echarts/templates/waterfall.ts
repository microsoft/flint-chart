// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * ECharts Waterfall Chart — cumulative bar with start/delta/end (mirror vegalite/templates/waterfall.ts).
 */

import { ChartTemplateDef } from '../../core/types';
import { resolveTotalsMode } from '../../chart-types/waterfall';
import { extractCategories } from './utils';

/** True if all category labels parse as numbers → horizontal; else vertical (align with line/bar). */
function areCategoriesNumeric(cats: string[]): boolean {
    if (cats.length === 0) return true;
    return cats.every((c) => {
        const s = String(c).trim();
        if (s === '') return false;
        const n = Number(s);
        return !isNaN(n) && isFinite(n);
    });
}

export const ecWaterfallChartDef: ChartTemplateDef = {
    chart: 'Waterfall Chart',
    template: { mark: 'bar', encoding: {} },
    channels: ['x', 'y', 'color', 'column', 'row'],
    markCognitiveChannel: 'length',
    declareLayoutMode: () => ({ axisFlags: { x: { banded: true } } }),
    instantiate: (spec, ctx) => {
        const { channelSemantics, table } = ctx;
        const xField = channelSemantics.x?.field || 'Category';
        const yField = channelSemantics.y?.field || 'Amount';
        const colorField = channelSemantics.color?.field;

        const categories = extractCategories(table, xField, undefined);
        const rows = categories.map(cat => table.find((r: any) => String(r[xField]) === cat)).filter(Boolean);
        const values = rows.map((r: any) => Number(r[yField]) || 0);

        const hasTypeCol = !!colorField;
        // Which bars (if any) touch down to zero as full "total" bars. The default
        // is data-aware (see chart-types/waterfall.ts): first is a start total, last is a
        // total only when it reconciles with the prior cumulative. The user's
        // `totals` property overrides this; an explicit Type column is
        // authoritative. Mirror vegalite/templates/waterfall.ts.
        const totalsMode = resolveTotalsMode(values, ctx.chartProperties?.totals);
        const wantFirst = totalsMode === 'first' || totalsMode === 'both';
        const wantLast = totalsMode === 'last' || totalsMode === 'both';
        const types: string[] = hasTypeCol
            ? rows.map((r: any) => String(r[colorField] ?? 'delta'))
            : values.map((_, i) =>
                wantFirst && i === 0 ? 'start'
                    : wantLast && i === values.length - 1 ? 'end'
                        : 'delta');

        // Cumulative sum including the current row (mirror vegalite/templates/waterfall.ts).
        const cumulative: number[] = [];
        let acc = 0;
        for (const v of values) { acc += v; cumulative.push(acc); }

        const COLOR = { startEnd: '#5470c6', increase: '#91cc75', decrease: '#ee6666' };

        // Compact number formatter for the value labels (mirror the Vega-Lite
        // template's grouped/SI formatting).
        const fmt = (n: number) => {
            const a = Math.abs(n);
            if (a >= 1000) {
                const v = n / 1000;
                return `${Number(v.toFixed(v % 1 === 0 ? 0 : 1)).toLocaleString('en-US')}k`;
            }
            return Number(n.toFixed(2)).toLocaleString('en-US');
        };

        // Per-bar [base, base+height]. 'start'/'end' are anchored at 0 (full bars to
        // the running total — the end row's own value is a subtotal marker, excluded,
        // matching Vega-Lite); 'delta' floats from the previous running total. Heights
        // are kept positive (base = the lower edge) because ECharts stacks negative
        // values on a separate negative stack, which would otherwise drop decrease bars
        // to the zero baseline instead of floating them.
        // Per-bar floating rectangle [lo, hi] plus the original signed amount (for
        // tooltips). Drawn via a custom series below so bars that cross zero render
        // correctly. Mirror vegalite/templates/waterfall.ts.
        const barData: Array<{ value: number[]; itemStyle: { color: string } }> = [];
        const tops: number[] = [];
        // Per-bar label strings: the running total shown outside the tip and the
        // signed step delta shown inside the bar (mirror vegalite/templates/waterfall.ts).
        const outerText: string[] = [];
        const innerText: string[] = [];
        const tipVals: number[] = [];
        const prevVals: number[] = [];
        for (let i = 0; i < values.length; i++) {
            const v = values[i];
            const t = types[i];
            const top = t === 'end' ? cumulative[i] - v : cumulative[i];
            const prev = (t === 'start' || t === 'end') ? 0 : cumulative[i] - v;
            const lo = Math.min(prev, top);
            const hi = Math.max(prev, top);
            const color = (t === 'start' || t === 'end')
                ? COLOR.startEnd
                : top >= prev ? COLOR.increase : COLOR.decrease;
            barData.push({ value: [i, lo, hi, v], itemStyle: { color } });
            tops.push(top);
            outerText.push(fmt(top));
            innerText.push((t === 'delta' && v > 0 ? '+' : '') + fmt(v));
            tipVals.push(top);
            prevVals.push(prev);
        }

        const showLabels = !!ctx.chartProperties?.showTextLabels;

        // Thin connector lines bridging each bar to the next at the running
        // cumulative level, spanning only the inter-bar gap. Mirror
        // vegalite/templates/waterfall.ts (drawn via a custom series since ECharts
        // markLine cannot offset to the bar edges).
        const BAR_WIDTH_FRAC = 0.58;
        const connectorData = tops.slice(0, -1).map((y, i) => [i, y]);

        const legendItems = ['Start/End', 'Increase', 'Decrease'];
        const legendColors = [COLOR.startEnd, COLOR.increase, COLOR.decrease];

        const option: any = {
            tooltip: {
                trigger: 'axis',
                axisPointer: { type: 'shadow' },
                formatter: (params: any[]) => {
                    const head = params[0]?.axisValueLabel ?? params[0]?.name ?? '';
                    const bar = params.find((p) => p.seriesName === 'Delta' && Array.isArray(p.value));
                    if (!bar) return String(head);
                    return `${head}<br/>${bar.marker ?? ''} ${yField}: ${bar.value[3]}`;
                },
            },
            legend: {
                data: legendItems,
            },
            xAxis: {
                type: 'category',
                data: categories,
                name: xField,
                nameLocation: 'middle',
                nameGap: 30,
                axisTick: { show: true, alignWithLabel: true },
                axisLabel: {
                    rotate: areCategoriesNumeric(categories) ? 0 : 90,
                    formatter: (value: string) => value,
                },
            },
            yAxis: { type: 'value', name: yField, axisTick: { show: true } },
            series: [
                // Bars as floating rectangles. A custom series gives full [lo, hi]
                // control so bars crossing zero render correctly (a transparent-base +
                // delta stack would snap them back to the zero baseline, because
                // ECharts splits positive/negative values onto separate stacks).
                {
                    type: 'custom' as const,
                    name: 'Delta',
                    data: barData,
                    encode: { x: 0, y: [1, 2] },
                    renderItem: (params: any, api: any) => {
                        const i = api.value(0);
                        const lo = api.value(1);
                        const hi = api.value(2);
                        const pLo = api.coord([i, lo]);
                        const pHi = api.coord([i, hi]);
                        const band = api.size([1, 0])[0];
                        const w = band * BAR_WIDTH_FRAC;
                        const cx = pLo[0];
                        const yTop = Math.min(pLo[1], pHi[1]);
                        const h = Math.abs(pLo[1] - pHi[1]);
                        const rect = {
                            type: 'rect',
                            shape: { x: cx - w / 2, y: yTop, width: w, height: h },
                            style: api.style(),
                        };

                        // Labels are resolution-aware: skip when the band is too
                        // narrow; inner delta is skipped when the bar is too short.
                        if (!showLabels || band < 18) return rect;
                        const idx = params.dataIndex;
                        const fontSize = band >= 40 ? 10 : band >= 26 ? 9 : 8;
                        const up = tipVals[idx] >= prevVals[idx];
                        const pTip = api.coord([i, tipVals[idx]]);
                        const children: any[] = [rect];
                        // Running total outside the bar tip (above up-moves / below).
                        children.push({
                            type: 'text',
                            style: {
                                text: outerText[idx],
                                x: cx,
                                y: pTip[1] + (up ? -4 : 4),
                                textAlign: 'center',
                                textVerticalAlign: up ? 'bottom' : 'top',
                                fill: '#374151',
                                fontSize,
                            },
                        });
                        // Delta inside the bar (white), only when tall enough.
                        if (h >= fontSize + 4) {
                            children.push({
                                type: 'text',
                                style: {
                                    text: innerText[idx],
                                    x: cx,
                                    y: (pLo[1] + pHi[1]) / 2,
                                    textAlign: 'center',
                                    textVerticalAlign: 'middle',
                                    fill: '#ffffff',
                                    fontSize,
                                },
                            });
                        }
                        return { type: 'group', children };
                    },
                },
                // Legend-only series: no data, only for the legend colour swatches.
                ...legendItems.map((name, i) => ({
                    type: 'bar' as const,
                    name,
                    data: [] as number[],
                    barWidth: '58%',
                    itemStyle: { color: legendColors[i] },
                })),
                // Connector lines: gap-only horizontal segments between adjacent bars.
                {
                    type: 'custom' as const,
                    name: '__connectors',
                    silent: true,
                    z: 5,
                    data: connectorData,
                    renderItem: (_params: any, api: any) => {
                        const i = api.value(0);
                        const y = api.value(1);
                        const pThis = api.coord([i, y]);
                        const pNext = api.coord([i + 1, y]);
                        const half = (pNext[0] - pThis[0]) * (BAR_WIDTH_FRAC / 2);
                        // Span from the current bar's left edge to the next bar's right
                        // edge (offsets pushed outward), tracing the bar tops like the
                        // Vega-Lite connector — not just the inter-bar gap.
                        return {
                            type: 'line',
                            shape: {
                                x1: pThis[0] - half,
                                y1: pThis[1],
                                x2: pNext[0] + half,
                                y2: pNext[1],
                            },
                            style: { stroke: '#6b7280', lineWidth: 1, opacity: 0.7 },
                        };
                    },
                },
            ],
        };

        Object.assign(spec, option);
        delete spec.mark;
        delete spec.encoding;
    },
};
