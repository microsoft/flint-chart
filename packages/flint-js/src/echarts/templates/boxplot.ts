// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * ECharts Boxplot template.
 *
 * Contrast with VL:
 *   VL: mark = "boxplot" — VL computes quartiles automatically from raw data
 *   EC: series type = 'boxplot' — we compute quartiles client-side and pass
 *       [min, Q1, median, Q3, max] per category.
 *       Optionally an "outlier" scatter series.
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { extractCategories, groupBy, getCategoryOrder } from './utils';
import { detectBandedAxisForceDiscrete } from '../../core/axis-detection';
import { planBandDodge, resolveDodge } from '../../core/band-dodge';
import { pickEChartsPalette } from '../colormap';

const isDiscrete = (type: string | undefined) => type === 'nominal' || type === 'ordinal';

/** True if all category labels parse as numbers → horizontal; otherwise vertical (x-axis only, same as line chart). */
function areCategoriesNumeric(cats: string[]): boolean {
    if (cats.length === 0) return true;
    return cats.every((c) => {
        const s = String(c).trim();
        if (s === '') return false;
        const n = Number(s);
        return !isNaN(n) && isFinite(n);
    });
}

/** Compute the five-number summary for an array of values. */
function fiveNumberSummary(
    values: number[],
    whiskerMethod: 'iqr' | 'minmax' = 'iqr',
): [number, number, number, number, number] {
    const sorted = [...values].sort((a, b) => a - b);
    const n = sorted.length;
    if (n === 0) return [0, 0, 0, 0, 0];
    if (n === 1) return [sorted[0], sorted[0], sorted[0], sorted[0], sorted[0]];

    const median = quantile(sorted, 0.5);
    const q1 = quantile(sorted, 0.25);
    const q3 = quantile(sorted, 0.75);

    // Min–Max whiskers span the full data range (no points are outliers).
    if (whiskerMethod === 'minmax') {
        return [sorted[0], q1, median, q3, sorted[n - 1]];
    }

    // Tukey whiskers: extend to the most extreme value within 1.5×IQR.
    const iqr = q3 - q1;
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;
    const whiskerLow = sorted.find(v => v >= lowerFence) ?? sorted[0];
    const whiskerHigh = [...sorted].reverse().find(v => v <= upperFence) ?? sorted[n - 1];

    return [whiskerLow, q1, median, q3, whiskerHigh];
}

function quantile(sorted: number[], p: number): number {
    const n = sorted.length;
    const idx = p * (n - 1);
    const lo = Math.floor(idx);
    const hi = Math.ceil(idx);
    const frac = idx - lo;
    return sorted[lo] * (1 - frac) + sorted[hi] * frac;
}

/** Find outliers outside 1.5×IQR fences. */
function findOutliers(values: number[]): number[] {
    const sorted = [...values].sort((a, b) => a - b);
    const q1 = quantile(sorted, 0.25);
    const q3 = quantile(sorted, 0.75);
    const iqr = q3 - q1;
    const lo = q1 - 1.5 * iqr;
    const hi = q3 + 1.5 * iqr;
    return values.filter(v => v < lo || v > hi);
}

/** Lane centre offset and box width, in pixels, within one category band. */
function boxplotLaneGeometry(bandWidth: number, laneCount: number, laneIndex: number) {
    const availableWidth = bandWidth * 0.8 - 2;
    const boxGap = availableWidth / laneCount * 0.3;
    const boxWidth = (availableWidth - boxGap * (laneCount - 1)) / laneCount;
    return {
        offset: boxWidth / 2 - availableWidth / 2 + laneIndex * (boxGap + boxWidth),
        boxWidth,
    };
}

// Half-width of the raw-observation jitter cloud, as a fraction of one box.
const POINT_JITTER_FRACTION = 0.35;

/**
 * Deterministic jitter in [-1, 1]. A golden-ratio sequence spreads successive
 * points evenly instead of clumping the way independent random draws do, and
 * being deterministic keeps a re-render pixel-identical.
 */
function jitterAt(index: number): number {
    return ((index * 0.6180339887498949) % 1) * 2 - 1;
}

/**
 * Scatter overlay drawn on top of the boxes — either just the outliers, or
 * every raw observation when `showPoints` is on.
 *
 * ECharts has no per-point band offset, so this is a `custom` series that
 * resolves the lane (and the jitter carried as the datum's third element)
 * against the live band width at render time.
 */
function makePointSeries(
    name: string,
    data: any[],
    laneIndex: number,
    laneCount: number,
    horizontal: boolean,
    fullSample = false,
): any {
    return {
        name,
        type: 'custom',
        coordinateSystem: 'cartesian2d',
        data,
        encode: { tooltip: [0, 1] },
        z: 3,
        // Marks this as an overlay belonging to the boxplot series before it, so
        // palette assignment gives it that box's colour instead of a new slot.
        _companion: true,
        renderItem: (_params: any, api: any) => {
            const category = Number(api.value(0));
            const value = Number(api.value(1));
            const jitter = Number(api.value(2)) || 0;
            const point = horizontal
                ? api.coord([value, category])
                : api.coord([category, value]);
            const size = api.size(horizontal ? [0, 1] : [1, 0]);
            const bandWidth = Math.abs(horizontal ? size[1] : size[0]);
            const lane = boxplotLaneGeometry(bandWidth, laneCount, laneIndex);
            const offset = lane.offset + jitter * lane.boxWidth * POINT_JITTER_FRACTION;
            const color = api.visual('color');
            return {
                type: 'circle',
                shape: {
                    cx: point[0] + (horizontal ? 0 : offset),
                    cy: point[1] + (horizontal ? offset : 0),
                    r: fullSample ? Math.max(1.6, Math.min(3.2, lane.boxWidth * 0.08)) : 2,
                },
                // With the whole sample drawn the box goes hollow and the points
                // become the mark that spends saturated ink, so they carry the
                // group colour. Slight transparency lets dense regions read as
                // density; the hairline halo keeps overlaps countable.
                style: fullSample
                    ? { fill: color, opacity: 0.7, stroke: '#ffffff', lineWidth: 0.5 }
                    : { fill: color },
            };
        },
    };
}

function makeGroupSeparatorSeries(categoryCount: number, horizontal: boolean): any {
    return {
        name: '__groupSeparators',
        type: 'custom',
        coordinateSystem: 'cartesian2d',
        data: Array.from({ length: Math.max(0, categoryCount - 1) }, (_, index) => [index]),
        silent: true,
        tooltip: { show: false },
        z: 0,
        renderItem: (params: any, api: any) => {
            const index = Number(api.value(0));
            const current = horizontal ? api.coord([0, index]) : api.coord([index, 0]);
            const next = horizontal ? api.coord([0, index + 1]) : api.coord([index + 1, 0]);
            const boundary = horizontal
                ? (current[1] + next[1]) / 2
                : (current[0] + next[0]) / 2;
            return {
                type: 'line',
                shape: horizontal
                    ? { x1: params.coordSys.x, y1: boundary, x2: params.coordSys.x + params.coordSys.width, y2: boundary }
                    : { x1: boundary, y1: params.coordSys.y, x2: boundary, y2: params.coordSys.y + params.coordSys.height },
                style: { stroke: '#c9ced6', lineWidth: 1, lineDash: [4, 4], opacity: 0.75 },
            };
        },
    };
}

export const ecBoxplotDef: ChartTemplateDef = {
    chart: 'Boxplot',
    template: { mark: 'boxplot', encoding: {} },
    channels: ['x', 'y', 'color', 'opacity', 'column', 'row'],
    markCognitiveChannel: 'position',
    declareLayoutMode: (cs, table, chartProperties) => {
        if (!cs.x?.field || !cs.y?.field) return {};
        const result = detectBandedAxisForceDiscrete(cs, table, { preferAxis: 'x' });
        if (!result) return {};
        const decl: import('../../core/types').LayoutDeclaration = {
            axisFlags: { [result.axis]: { banded: true } },
            resolvedTypes: result.resolvedTypes,
            paramOverrides: { defaultBandSize: 28 },  // box+whisker needs wider bands
        };
        const colorField = cs.color?.field;
        const axisField = cs[result.axis]?.field;
        if (colorField && axisField && isDiscrete(cs.color?.type)) {
            const plan = planBandDodge(table, axisField, colorField);
            const { mode } = resolveDodge(plan, chartProperties?.dodge);
            if (mode === 'local') decl.groupLaneCount = Math.max(1, plan.maxPerBand);
        }
        return decl;
    },
    instantiate: (spec, ctx) => {
        const { channelSemantics, table } = ctx;
        const xCS = channelSemantics.x;
        const yCS = channelSemantics.y;
        const colorField = channelSemantics.color?.field;
        const colorType = channelSemantics.color?.type;
        const colorIsDiscrete = colorField && isDiscrete(colorType);

        if (!xCS?.field || !yCS?.field) return;

        // Whisker convention + outlier visibility (design choices). Min–Max
        // whiskers span the full range, so no points are outliers; with Tukey
        // whiskers, outliers are drawn as a scatter overlay unless suppressed.
        const whiskerMethod: 'iqr' | 'minmax' =
            ctx.chartProperties?.whiskerMethod === 'minmax' ? 'minmax' : 'iqr';
        // `showPoints` overlays every raw observation instead — which makes the
        // separate outlier marks redundant, since they are drawn too.
        const showPoints = ctx.chartProperties?.showPoints === true;
        const showOutliers =
            !showPoints && whiskerMethod === 'iqr' && ctx.chartProperties?.showOutliers !== false;

        // Determine which axis is categorical and which is quantitative
        const xIsDiscrete = isDiscrete(xCS.type);
        const yIsDiscrete = isDiscrete(yCS.type);

        // Default: x is category, y is value
        let catAxis: 'x' | 'y' = 'x';
        let valAxis: 'x' | 'y' = 'y';
        if (yIsDiscrete && !xIsDiscrete) {
            catAxis = 'y';
            valAxis = 'x';
        }

        const catField = channelSemantics[catAxis]!.field!;
        const valField = channelSemantics[valAxis]!.field!;
        const catCS = channelSemantics[catAxis];
        const categories = extractCategories(table, catField, catCS?.ordinalSortOrder);

        // Decide whether `color` genuinely subdivides a category band (dodge into
        // one series per color) or is redundant/nested with the axis (`color == x`
        // or a 1:1 field pair) — in which case a single boxplot series is correct.
        // Sharing `planBandDodge` avoids the collapse-to-slivers bug AND the
        // degenerate zero-boxes that a per-color series would draw in empty cells.
        const dodgePlan = colorIsDiscrete && colorField
            ? planBandDodge(ctx.fullTable ?? table, catField, colorField, {
                nestedSnapThreshold: ctx.chartProperties?.nestedSnapThreshold,
            })
            : null;
        const dodgeMode = dodgePlan ? resolveDodge(dodgePlan, ctx.chartProperties?.dodge).mode : 'none';
        const dodgeColor = dodgeMode !== 'none';

        // 颜色由 ecApplyLayoutToSpec 根据 colorDecisions 统一分配（不在此处硬编码）
        const isHorizontal = catAxis === 'y';

        const catAxisLabel = {
            rotate: isHorizontal ? 0 : (areCategoriesNumeric(categories) ? 0 : 90),
        };
        const option: any = {
            tooltip: { trigger: 'item' },
            [isHorizontal ? 'yAxis' : 'xAxis']: {
                type: 'category',
                data: categories,
                name: catField,
                boundaryGap: true,
                axisTick: { show: true, alignWithLabel: true },
                axisLabel: catAxisLabel,
            },
            [isHorizontal ? 'xAxis' : 'yAxis']: {
                type: 'value',
                name: valField,
                axisTick: { show: true },
                axisLabel: { rotate: 0 },
            },
            series: [],
        };

        if (colorIsDiscrete && colorField && dodgeMode === 'local') {
            // Local (compact) dodge: only `maxPerBand` lanes, packed left-aligned
            // per band. Each lane is a boxplot series; a band that has fewer than
            // `maxPerBand` present colors simply leaves trailing lanes null. Boxes
            // are colored per-datum by their color value (a custom legend maps the
            // color value → swatch, since lane-series names are synthetic).
            const globalColors = [...new Set(
                (ctx.fullTable ?? table).map((r: any) => String(r[colorField] ?? '')),
            )].filter(Boolean).sort();
            const palette = pickEChartsPalette(ctx.colorDecisions?.color);
            const colorFor = (g: string) => palette[Math.max(0, globalColors.indexOf(g)) % palette.length];

            // Per-band ordered present colors → lane index.
            const perBand = new Map<string, string[]>();
            for (const cat of categories) perBand.set(cat, []);
            for (const r of table) {
                const cat = String(r[catField] ?? '');
                const g = String(r[colorField] ?? '');
                if (!perBand.has(cat) || !g) continue;
                const arr = perBand.get(cat)!;
                if (!arr.includes(g)) arr.push(g);
            }
            for (const arr of perBand.values()) arr.sort();
            const maxPerBand = Math.max(1, ...[...perBand.values()].map((a) => a.length));

            // value lookup per (cat, color)
            const catGroups = groupBy(table, catField);
            for (let lane = 0; lane < maxPerBand; lane++) {
                const boxData: ({ value: [number, number, number, number, number]; itemStyle: any } | '-')[] = [];
                const pointData: any[] = [];
                for (let i = 0; i < categories.length; i++) {
                    const cat = categories[i];
                    const g = perBand.get(cat)?.[lane];
                    if (g === undefined) { boxData.push('-'); continue; }
                    const rows = (catGroups.get(cat) || []).filter((r: any) => String(r[colorField] ?? '') === g);
                    const values = rows.map((r: any) => Number(r[valField])).filter((v: number) => isFinite(v));
                    if (!values.length) { boxData.push('-'); continue; }
                    const c = colorFor(g);
                    boxData.push({
                        value: fiveNumberSummary(values, whiskerMethod),
                        // Hollow box when the sample is drawn (see makePointSeries).
                        itemStyle: { color: showPoints ? 'transparent' : c, borderColor: c },
                    });
                    if (showPoints) {
                        values.forEach((v, k) => pointData.push([i, v, jitterAt(k)]));
                    } else if (showOutliers) {
                        for (const o of findOutliers(values)) pointData.push({ value: [i, o], itemStyle: { color: c } });
                    }
                }
                option.series.push({
                    name: `__lane${lane}`, type: 'boxplot', data: boxData,
                    ...(showPoints ? { itemStyle: { borderWidth: 1.5 } } : {}),
                });
                if (pointData.length > 0) {
                    option.series.push(makePointSeries(
                        `__lane${lane} (points)`, pointData, lane, maxPerBand, isHorizontal, showPoints,
                    ));
                }
            }
            option.series.push(makeGroupSeparatorSeries(categories.length, isHorizontal));
            option.legend = { data: globalColors.map((g) => ({ name: g, itemStyle: { color: colorFor(g) } })) };
            option._legendTitle = colorField;
        } else if (colorIsDiscrete && colorField && dodgeColor) {
            // Grouped boxplot: one series per color value (e.g. Male, Female)
            const colorCategories = extractCategories(table, colorField, getCategoryOrder(ctx, 'color'));
            const catGroups = groupBy(table, catField);

            for (let cIdx = 0; cIdx < colorCategories.length; cIdx++) {
                const colorName = colorCategories[cIdx];
                const boxData: any[] = [];
                const pointData: number[][] = [];

                for (let i = 0; i < categories.length; i++) {
                    const cat = categories[i];
                    const rows = (catGroups.get(cat) || []).filter(
                        (r: any) => String(r[colorField] ?? '') === colorName,
                    );
                    const values = rows.map((r: any) => Number(r[valField])).filter(v => isFinite(v));
                    // Empty (category, color) cells must draw NO box. Pushing a
                    // five-number summary of [] yields [0,0,0,0,0] — a degenerate
                    // flat box at 0 in every unoccupied lane (the sparse-dodge
                    // zero-box bug). ECharts boxplot does not accept `null`
                    // data items; `'-'` is its missing-value sentinel.
                    // A per-datum transparent fill hollows the box when the raw
                    // sample is drawn; the palette still owns the outline, which
                    // `instantiate-spec` assigns at series level.
                    boxData.push(
                        !values.length ? '-'
                            : showPoints
                                ? { value: fiveNumberSummary(values, whiskerMethod), itemStyle: { color: 'transparent' } }
                                : fiveNumberSummary(values, whiskerMethod),
                    );

                    if (showPoints) {
                        values.forEach((v, k) => pointData.push([i, v, jitterAt(k)]));
                    } else if (showOutliers) {
                        for (const o of findOutliers(values)) {
                            pointData.push([i, o]);
                        }
                    }
                }

                option.series.push({
                    name: colorName,
                    type: 'boxplot',
                    data: boxData,
                    ...(showPoints ? { itemStyle: { borderWidth: 1.5 } } : {}),
                    // itemStyle 由 ecApplyLayoutToSpec 按 colorDecisions 填充
                });
                if (pointData.length > 0) {
                    option.series.push(makePointSeries(
                        colorName + ' (points)', pointData, cIdx, colorCategories.length, isHorizontal, showPoints,
                    ));
                }
            }

            option.legend = { data: colorCategories };
            option._legendTitle = colorField;
        } else {
            // Single boxplot series (no color grouping)
            const catGroups = groupBy(table, catField);
            const boxData: any[] = [];
            const pointData: number[][] = [];

            for (let i = 0; i < categories.length; i++) {
                const cat = categories[i];
                const rows = catGroups.get(cat) || [];
                const values = rows.map((r: any) => Number(r[valField])).filter((v: number) => isFinite(v));
                const summary = fiveNumberSummary(values, whiskerMethod);
                boxData.push(showPoints ? { value: summary, itemStyle: { color: 'transparent' } } : summary);

                if (showPoints) {
                    values.forEach((v, k) => pointData.push([i, v, jitterAt(k)]));
                } else if (showOutliers) {
                    for (const o of findOutliers(values)) {
                        pointData.push([i, o]);
                    }
                }
            }

            option.series.push({
                type: 'boxplot',
                data: boxData,
                ...(showPoints ? { itemStyle: { borderWidth: 1.5 } } : {}),
                // 单系列颜色由 ecApplyLayoutToSpec 使用 cat10[0] 等统一默认
            });
            if (pointData.length > 0) {
                option.series.push(makePointSeries('Points', pointData, 0, 1, isHorizontal, showPoints));
            }
        }

        Object.assign(spec, option);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        {
            key: 'whiskerMethod', label: 'Whiskers', type: 'discrete',
            options: [
                { value: 'iqr', label: 'Tukey (1.5 × IQR)' },
                { value: 'minmax', label: 'Min–Max' },
            ],
            defaultValue: 'iqr',
        } as ChartPropertyDef,
        {
            key: 'showPoints', label: 'Points', type: 'binary', defaultValue: false,
            // Jitter needs a band to scatter within, so this is only meaningful
            // once one position axis is discrete.
            check: (ctx) => ({
                applicable: isDiscrete(ctx.channelSemantics?.x?.type)
                    || isDiscrete(ctx.channelSemantics?.y?.type),
            }),
        } as ChartPropertyDef,
        {
            key: 'showOutliers', label: 'Outliers', type: 'binary', defaultValue: true,
            // Outliers exist only with Tukey whiskers; min–max whiskers absorb
            // every point. And once every observation is drawn, the outlier
            // marks are just duplicates.
            check: (ctx) => ({
                applicable: ctx.chartProperties?.whiskerMethod !== 'minmax'
                    && ctx.chartProperties?.showPoints !== true,
            }),
        } as ChartPropertyDef,
        {
            key: 'dodge', label: 'Dodge', type: 'discrete',
            options: [
                { value: 'auto',   label: 'Auto' },
                { value: 'local',  label: 'Local (compact)' },
                { value: 'global', label: 'Global (aligned)' },
            ],
            defaultValue: 'auto',
            check: (ctx) => {
                const colorField = ctx.channelSemantics?.color?.field;
                const colorType = ctx.channelSemantics?.color?.type;
                const axisField = isDiscrete(ctx.channelSemantics?.x?.type)
                    ? ctx.channelSemantics?.x?.field
                    : ctx.channelSemantics?.y?.field;
                const rows = ctx.data;
                if (!colorField || !axisField || !isDiscrete(colorType) || !rows) {
                    return { applicable: false };
                }
                const plan = planBandDodge(rows, axisField, colorField, {
                    nestedSnapThreshold: ctx.chartProperties?.nestedSnapThreshold,
                });
                return { applicable: plan.ambiguous, recommendedValue: plan.mode === 'none' ? 'auto' : plan.mode };
            },
        } as ChartPropertyDef,
    ],
};
