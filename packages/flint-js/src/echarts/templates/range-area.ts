// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * ECharts Range Area Chart (band / high–low / area-range) template.
 *
 * A filled band showing a **low–high range** at each x. ECharts has no native
 * ranged-area mark, so the idiomatic fully-serializable band (NO renderItem) is
 * a pair of stacked line series per group:
 *
 *   1. a TRANSPARENT base series at the lower bound (`stack`, line opacity 0,
 *      no areaStyle) — it only provides the stack floor;
 *   2. a series of (upper − lower) DELTAS on the same stack with a translucent
 *      `areaStyle`. Because the delta is stacked on the transparent base, its
 *      area fills the region between the lower bound and the upper bound — a
 *      translucent ribbon BETWEEN the two bounds, never a solid block down to
 *      the axis.
 *
 * The base series carries an explicit (transparent) `itemStyle.color` so the
 * color-assignment pass skips it and does not consume a palette slot; the delta
 * series gets the group's palette color for both its line and its fill.
 *
 * Contract:
 *   x      — position (rendered on a category axis of sorted unique values so
 *            the two stacked series align index-for-index).
 *   y      — lower bound (quantitative).
 *   y2     — upper bound (quantitative).
 *   color  — optional series → one band (base+delta pair) per value (legend).
 *
 * The value axis fits the band (`scale: true`) — a ranged area reads its extent,
 * not its distance from zero.
 */

import { ChartTemplateDef } from '../../core/types';
import { extractCategories, groupBy, getCategoryOrder } from './utils';

const isDiscrete = (type: string | undefined) => type === 'nominal' || type === 'ordinal';

/** Sorted unique x values as display labels (numeric → numeric sort, date → chronological, else data order). */
function orderedXLabels(
    table: any[],
    xField: string,
    xType: string | undefined,
    ordinalOrder: string[] | undefined,
): { labels: string[]; isTemporal: boolean } {
    if (isDiscrete(xType)) {
        return { labels: extractCategories(table, xField, ordinalOrder), isTemporal: false };
    }
    const isTemporal = xType === 'temporal';
    const seen = new Map<string, any>();
    for (const row of table) {
        const v = row[xField];
        if (v == null || v === '') continue;
        const key = String(v);
        if (!seen.has(key)) seen.set(key, v);
    }
    const raw = [...seen.values()];
    if (isTemporal) {
        raw.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
    } else {
        raw.sort((a, b) => Number(a) - Number(b));
    }
    return { labels: raw.map(v => String(v)), isTemporal };
}

/** Format a temporal label for the category axis (short, readable). */
function fmtTemporalLabel(s: string): string {
    const t = new Date(s).getTime();
    if (!Number.isFinite(t)) return s;
    return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

/** Map a group's rows → {lower, upper} per x label. */
function alignBounds(
    rows: any[],
    xField: string,
    lowField: string,
    highField: string,
    labels: string[],
): Array<{ low: number | null; high: number | null }> {
    const map = new Map<string, { low: number; high: number }>();
    for (const row of rows) {
        const lo = Number(row[lowField]);
        const hi = Number(row[highField]);
        if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue;
        map.set(String(row[xField]), { low: Math.min(lo, hi), high: Math.max(lo, hi) });
    }
    return labels.map(l => {
        const v = map.get(l);
        return v ? { low: v.low, high: v.high } : { low: null, high: null };
    });
}

export const ecRangeAreaChartDef: ChartTemplateDef = {
    additionalPropertyKeys: ['opacity'],
    chart: 'Range Area Chart',
    template: { mark: 'area', encoding: {} },
    channels: ['x', 'y', 'y2', 'color', 'column', 'row'],
    markCognitiveChannel: 'area',
    declareLayoutMode: () => ({
        paramOverrides: { continuousMarkCrossSection: { x: 100, y: 20, seriesCountAxis: 'auto' } },
    }),
    instantiate: (spec, ctx) => {
        const { channelSemantics, table } = ctx;
        const xCS = channelSemantics.x;
        const yCS = channelSemantics.y;
        const y2CS = channelSemantics.y2;
        const colorField = channelSemantics.color?.field;

        if (!xCS?.field || !yCS?.field || !y2CS?.field) return;
        const xField = xCS.field;
        const lowField = yCS.field;
        const highField = y2CS.field;

        const { labels, isTemporal } = orderedXLabels(
            table, xField, xCS.type, getCategoryOrder(ctx, 'x'),
        );
        const displayLabels = isTemporal ? labels.map(fmtTemporalLabel) : labels;

        const opacity = ctx.chartProperties?.opacity ?? 0.35;

        // Title the value axis with BOTH bound fields (matching Vega-Lite's
        // native "low, high" axis title), falling back to the single name.
        const valueTitle = lowField === highField ? lowField : `${lowField}, ${highField}`;

        const option: any = {
            tooltip: {
                trigger: 'axis',
                // Show the low–high range at each x (the delta series carries the
                // original bounds as `_low` / `_high`; the transparent base
                // series has plain numeric data and is skipped).
                formatter: (params: any) => {
                    const list = Array.isArray(params) ? params : [params];
                    if (list.length === 0) return '';
                    const head = list[0].axisValueLabel ?? list[0].axisValue ?? list[0].name ?? '';
                    const lines = [`${xField}: ${head}`];
                    for (const p of list) {
                        const d = p?.data;
                        if (d && typeof d === 'object' && d._high != null) {
                            const nm = p.seriesName && !String(p.seriesName).startsWith('__base')
                                ? p.seriesName
                                : 'Range';
                            lines.push(`${nm}: ${fmtNum(d._low)} – ${fmtNum(d._high)}`);
                        }
                    }
                    return lines.join('<br/>');
                },
            },
            xAxis: {
                type: 'category',
                data: displayLabels,
                name: xField,
                nameLocation: 'middle',
                nameGap: 30,
                boundaryGap: false,
                axisTick: { show: true, alignWithLabel: true },
                axisLabel: { rotate: isTemporal ? 30 : 0 },
            },
            yAxis: {
                type: 'value',
                // A ranged area reads its extent, not its distance from zero —
                // fit the band rather than forcing a zero baseline.
                scale: true,
                name: valueTitle,
                nameLocation: 'middle',
                nameGap: 45,
                axisTick: { show: true },
                axisLabel: { rotate: 0 },
            },
            series: [],
        };

        const pushBand = (rows: any[], name: string | undefined, idx: number) => {
            const bounds = alignBounds(rows, xField, lowField, highField, labels);
            const stackId = `band-${idx}`;
            const baseName = `__base-${idx}`;
            // 1. Transparent base at the lower bound (explicit color → skipped by
            //    the palette pass, so it never consumes a band color).
            option.series.push({
                name: baseName,
                type: 'line',
                stack: stackId,
                // Cumulative stacking regardless of sign — otherwise ECharts
                // routes a negative lower bound into a separate negative stack
                // and the band collapses to the zero baseline (see the
                // zero-crossing case).
                stackStrategy: 'all',
                data: bounds.map(b => b.low),
                symbol: 'none',
                showSymbol: false,
                lineStyle: { opacity: 0 },
                itemStyle: { color: 'transparent' },
                silent: true,
                z: 1,
            });
            // 2. Translucent (upper − lower) delta on the same stack → fills the
            //    ribbon between the bounds. Data items carry the original bounds
            //    for the tooltip.
            option.series.push({
                name: name ?? lowField,
                type: 'line',
                stack: stackId,
                stackStrategy: 'all',
                data: bounds.map(b =>
                    b.low != null && b.high != null
                        ? { value: b.high - b.low, _low: b.low, _high: b.high }
                        : { value: null, _low: null, _high: null },
                ),
                symbol: 'none',
                showSymbol: false,
                lineStyle: { width: 1.5, opacity: 0.9 },
                areaStyle: { opacity },
                emphasis: { focus: 'series' },
                z: 2,
            });
        };

        if (colorField) {
            const groups = groupBy(table, colorField);
            option.legend = { data: [...groups.keys()] };
            let idx = 0;
            for (const [name, rows] of groups) {
                pushBand(rows, name, idx);
                idx++;
            }
        } else {
            pushBand(table, undefined, 0);
        }

        Object.assign(spec, option);
        delete spec.mark;
        delete spec.encoding;
    },
};

/** Compact number formatting for the tooltip. */
function fmtNum(v: unknown): string {
    const n = Number(v);
    if (!Number.isFinite(n)) return String(v ?? '');
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
}
