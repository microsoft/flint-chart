// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * ECharts Line Chart template (supports multi-series).
 *
 * Contrast with VL:
 *   VL: encoding.x + encoding.y + encoding.color (+ strokeDash) → auto-groups into separate lines
 *   EC: explicit series[] with each series.data = [v1, v2, ...] aligned to xAxis.data;
 *       strokeDash splits each colour's line into one series per dash value
 */

import { ChartTemplateDef, ChartPropertyDef, InstantiateContext } from '../../core/types';
import { extractCategories, groupBy, getCategoryOrder } from './utils';
import { toTypeString } from '../../core/field-semantics';
import { getPaletteForScheme } from '../colormap';
import { makeCartesianPivot } from '../../core/pivot';

const isDiscrete = (type: string | undefined) => type === 'nominal' || type === 'ordinal';

/**
 * Line styles for strokeDash values, in category order: solid, dashed, dotted
 * and dash-dot; later values reuse them in turn. Pixel arrays rather than
 * 'dashed' / 'dotted' keep a line and its legend sample on the same pattern.
 */
const LINE_DASHES: ReadonlyArray<'solid' | readonly number[]> = ['solid', [8, 4], [2, 3], [8, 3, 2, 3]];

/** Stroke of a strokeDash legend sample when colour varies, as the sample stands for every colour. */
const DASH_KEY_COLOR = '#777777';

/**
 * Name of the empty series behind a dash value's legend entry when colour varies:
 * the dash label and a zero-width space. Legend entries toggle series by name, so
 * a dash value equal to a colour value keeps its own entry and leaves that
 * colour's lines alone, while the entry still reads as the dash label.
 */
const dashKeyName = (label: string): string => `${label}\u200b`;

function dashPattern(index: number): 'solid' | number[] {
    const dash = LINE_DASHES[index % LINE_DASHES.length];
    return typeof dash === 'string' ? dash : [...dash];
}

/** A strokeDash value's label: its string form, or 'null' when missing (as Vega-Lite labels it). */
const dashLabelOf = (value: unknown): string => (value == null ? 'null' : String(value));

/**
 * The strokeDash labels whose positions pick each value's line style. They come
 * from the full table, in first-appearance order unless the field has a
 * canonical or sort-by order, so every facet panel draws a value with the same
 * style. A sort-by order aggregates the full table too, not the panel's rows.
 */
function resolveDashLabels(ctx: InstantiateContext, dashField: string): string[] {
    const source = ctx.fullTable ?? ctx.table;
    const order = getCategoryOrder({ ...ctx, table: source }, 'strokeDash');
    const labels = extractCategories(source, dashField, order);
    if (source.some((row) => row[dashField] == null) && !labels.includes('null')) labels.push('null');
    return labels;
}

/** True if all category labels parse as numbers → horizontal; otherwise vertical (x-axis only). */
function areCategoriesNumeric(cats: string[]): boolean {
    if (cats.length === 0) return true;
    return cats.every((c) => {
        const s = String(c).trim();
        if (s === '') return false;
        const n = Number(s);
        return !isNaN(n) && isFinite(n);
    });
}

const interpolateMap: Record<string, string> = {
    'linear': 'linear',       // default
    'monotone': 'monotone',   // ECharts smooth: true approximates this
    'step': 'step',
    'step-before': 'stepBefore',   // Not directly supported; mapped
    'step-after': 'stepAfter',     // Not directly supported; mapped
    'basis': 'smooth',
    'cardinal': 'smooth',
    'catmull-rom': 'smooth',
};

export const ecLineChartDef: ChartTemplateDef = {
    chart: 'Line Chart',
    template: { mark: 'line', encoding: {} },
    channels: ['x', 'y', 'color', 'strokeDash', 'opacity', 'column', 'row'],
    markCognitiveChannel: 'position',
    declareLayoutMode: () => ({
        paramOverrides: { continuousMarkCrossSection: { x: 100, y: 20, seriesCountAxis: 'auto' } },
    }),
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties, colorDecisions } = ctx;
        const xCS = channelSemantics.x;
        const yCS = channelSemantics.y;
        const colorField = channelSemantics.color?.field;
        const colorType = channelSemantics.color?.type;
        const dashField = channelSemantics.strokeDash?.field;

        if (!xCS?.field || !yCS?.field) return;
        const xField = xCS.field;
        const yField = yCS.field;

        // Determine x-axis type
        const xIsDiscrete = isDiscrete(xCS.type);
        const xIsTemporal = xCS.type === 'temporal';
        const yIsDiscrete = isDiscrete(yCS.type);
        const isContinuousColor = !!colorField && (colorType === 'quantitative' || colorType === 'temporal');
        const discreteColorField = colorField && isDiscrete(colorType) ? colorField : undefined;

        // strokeDash: a row's dash index is its value's position in dashLabels.
        const dashLabels = dashField ? resolveDashLabels(ctx, dashField) : [];
        const dashIndexOf = (row: any): number =>
            dashField ? Math.max(0, dashLabels.indexOf(dashLabelOf(row[dashField]))) : 0;

        // Build x-axis categories for discrete/temporal axes
        const categories = xIsDiscrete ? extractCategories(table, xField, getCategoryOrder(ctx, 'x')) : undefined;
        const yCategories = yIsDiscrete ? extractCategories(table, yField, getCategoryOrder(ctx, 'y')) : undefined;

        const option: any = {
            tooltip: {
                trigger: 'axis',
            },
            xAxis: (() => {
                const type = xIsDiscrete ? 'category' : xIsTemporal ? 'time' : 'value';
                const base: any = {
                    type,
                    name: xField,
                    nameLocation: 'middle',
                    nameGap: 30,
                    ...(categories ? { data: categories } : {}),
                };
                if (xIsDiscrete && categories) {
                    base.axisTick = { show: true, alignWithLabel: true };
                    base.axisLabel = { rotate: areCategoriesNumeric(categories) ? 0 : 90 };
                } else if (xIsTemporal) {
                    base.axisTick = { show: true, alignWithLabel: true };
                    base.axisLabel = { rotate: 90 };
                } else {
                    base.axisTick = { show: true };
                }
                return base;
            })(),
            yAxis: yIsDiscrete && yCategories
                ? {
                    type: 'category',
                    data: yCategories,
                    name: yField,
                    nameLocation: 'middle',
                    nameGap: 40,
                    axisTick: { show: true, alignWithLabel: true },
                    axisLabel: { rotate: 0 },
                }
                : {
                    type: 'value',
                    name: yField,
                    nameLocation: 'middle',
                    nameGap: 40,
                    axisTick: { show: true },
                    axisLabel: { rotate: 0 },
                },
            series: [],
        };
        // Default: axis tooltip for standard line charts.
        // When color is continuous (Quantity/Date), we switch to item tooltip to support per-point color values.
        option._encodingTooltip = isContinuousColor
            ? {
                trigger: 'item',
                parts: [
                    { from: 'data', index: 0, label: xField, format: 'number' },
                    { from: 'data', index: 1, label: yField, format: 'number' },
                    { from: 'data', index: 2, label: colorField, format: 'number' },
                ],
            }
            : { trigger: 'axis', categoryLabel: xField, valueLabel: yField };

        // Apply zero-baseline
        // ECharts: scale=true means "data-fit", scale=false means "include zero"
        if (channelSemantics.y?.zero) {
            option.yAxis.scale = !channelSemantics.y.zero.zero;
        }

        // Interpolation / smooth
        const interpolate = chartProperties?.interpolate;
        const showPoints = !!chartProperties?.showPoints;
        const smooth = interpolate === 'monotone' || interpolate === 'basis' ||
            interpolate === 'cardinal' || interpolate === 'catmull-rom';
        const step = interpolate === 'step' ? 'middle'
            : interpolate === 'step-before' ? 'start'
                : interpolate === 'step-after' ? 'end'
                    : undefined;

        if (isContinuousColor && colorField) {
            // Continuous color (Quantity/Date): single line + colored points with a continuous visualMap.
            // This mirrors Vega-Lite's common pattern: gray line + colored points.
            const sorted = [...table].sort((a: any, b: any) => {
                const ax = a[xField];
                const bx = b[xField];
                if (xIsTemporal) return new Date(ax).getTime() - new Date(bx).getTime();
                const na = Number(ax);
                const nb = Number(bx);
                if (!isNaN(na) && !isNaN(nb)) return na - nb;
                return String(ax).localeCompare(String(bx));
            });

            // Points carry their dash index after the colour value, for the tooltip.
            const pointData = sorted.map((r: any) => (dashField
                ? [r[xField], r[yField], r[colorField], dashIndexOf(r)]
                : [r[xField], r[yField], r[colorField]]));

            // strokeDash splits the gray line into one line per dash value, in dash order.
            const lineGroups: Array<[number, any[]]> = [];
            if (dashField) {
                const byDash = new Map<number, any[]>();
                for (const r of sorted) {
                    const dashIndex = dashIndexOf(r);
                    const rows = byDash.get(dashIndex);
                    if (rows) rows.push(r);
                    else byDash.set(dashIndex, [r]);
                }
                lineGroups.push(...[...byDash].sort((a, b) => a[0] - b[0]));
            } else {
                lineGroups.push([0, sorted]);
            }

            // VisualMap domain
            const nums = sorted
                .map((r: any) => Number(r[colorField]))
                .filter((v: number) => !isNaN(v) && isFinite(v));
            const cMin = nums.length ? Math.min(...nums) : 0;
            const cMax = nums.length ? Math.max(...nums) : 1;

            const decisionSchemeId = colorDecisions?.color?.schemeId;
            const paletteFromDecision = decisionSchemeId ? getPaletteForScheme(decisionSchemeId) : undefined;

            option.visualMap = {
                type: 'continuous',
                min: cMin,
                max: cMax,
                dimension: 2, // [x, y, color]
                orient: 'vertical',
                right: 10,
                top: 'center',
                // 优先使用 colordecisions palette，找不到时退回原来的绿色色带。
                inRange: {
                    color: paletteFromDecision && paletteFromDecision.length > 0
                        ? paletteFromDecision
                        : ['#f7fcf5', '#74c476', '#00441b'],
                },
                seriesIndex: lineGroups.length, // apply to point series, which follows the lines
                name: colorField,
                textStyle: { fontSize: 10 },
                calculable: true,
            };
            option._visualMapWidth = 70;
            option.graphic = [
                ...(Array.isArray(option.graphic) ? option.graphic : (option.graphic ? [option.graphic] : [])),
                {
                    type: 'text' as const,
                    right: 10,
                    top: 4,
                    z: 100,
                    style: {
                        text: colorField,
                        fontSize: 11,
                        fontWeight: 'bold',
                        fill: '#333',
                        textAlign: 'right',
                    },
                },
            ];

            for (const [dashIndex, rows] of lineGroups) {
                option.series.push({
                    type: 'line',
                    ...(dashField ? { name: dashLabels[dashIndex] } : {}),
                    data: rows.map((r: any) => [r[xField], r[yField]]),
                    itemStyle: { color: '#cccccc' },
                    lineStyle: { color: '#cccccc', ...(dashField ? { type: dashPattern(dashIndex) } : {}) },
                    showSymbol: false,
                    symbol: 'none',
                    ...(smooth ? { smooth: true } : {}),
                    ...(step ? { step } : {}),
                });
            }
            option.series.push({
                type: 'scatter',
                data: pointData,
                symbol: 'circle',
                symbolSize: 7,
                itemStyle: { opacity: 1 },
            });

            if (dashField) {
                // The gray lines name the dash values in a legend of line samples.
                option.legend = { data: dashLabels.map((name) => ({ name, itemStyle: { opacity: 0 } })) };
                option._legendTitle = dashField;
                option._encodingTooltip.parts.push({
                    from: 'data', index: 3, label: dashField, format: 'category', categoryNames: dashLabels,
                });
            }
        } else if (discreteColorField || dashField) {
            // Multi-series line chart — 颜色由 ecApplyLayoutToSpec 根据 colorDecisions 统一分配
            //
            // strokeDash draws one series per (colour, dash) pair. A colour value's series share
            // its name, so its one legend entry toggles all of its lines, and its palette colour:
            // each series after a colour's first is a companion, which takes the colour of the
            // series before it. Without colour, every line shares the first line's colour.
            const factored = !!discreteColorField && !!dashField && discreteColorField !== dashField;
            const nameOf = (row: any): string => (discreteColorField
                ? String(row[discreteColorField] ?? '')
                : dashLabelOf(row[dashField!]));

            // Series names in first-appearance order, each with its rows per dash index.
            const groups = new Map<string, Map<number, any[]>>();
            for (const row of table) {
                const name = nameOf(row);
                const dashIndex = dashIndexOf(row);
                let byDash = groups.get(name);
                if (!byDash) {
                    byDash = new Map();
                    groups.set(name, byDash);
                }
                const rows = byDash.get(dashIndex);
                if (rows) rows.push(row);
                else byDash.set(dashIndex, [row]);
            }
            const names = [...groups.keys()];
            if (!discreteColorField) names.sort((a, b) => dashLabels.indexOf(a) - dashLabels.indexOf(b));

            // Lines that share a name tag each point with its dash index, which the axis
            // tooltip reads to name the line.
            const buildSeriesData = (rows: any[], dashIndex: number): any[] => {
                if (yIsDiscrete && yCategories) {
                    const points = buildCategoryAlignedXYData(rows, xField, yField, yCategories);
                    return factored ? points.map((p) => [...p, dashIndex]) : points;
                }
                if (xIsDiscrete) {
                    const values = buildCategoryAlignedData(rows, xField, yField, categories!);
                    return factored ? values.map((v, i) => [categories![i], v, dashIndex]) : values;
                }
                return rows.map(r => (factored ? [r[xField], r[yField], dashIndex] : [r[xField], r[yField]]));
            };

            for (const name of names) {
                const byDash = [...groups.get(name)!].sort((a, b) => a[0] - b[0]);
                byDash.forEach(([dashIndex, rows], k) => {
                    const series: any = {
                        name,
                        type: 'line',
                        data: buildSeriesData(rows, dashIndex),
                        // Default line chart: don't draw point markers (unless showPoints is set).
                        showSymbol: !!showPoints,
                        symbol: showPoints ? 'circle' : 'none',
                        ...(showPoints ? { symbolSize: 6 } : {}),
                    };
                    if (dashField) series.lineStyle = { type: dashPattern(dashIndex) };
                    if (k > 0 || (!discreteColorField && option.series.length > 0)) series._companion = true;
                    if (smooth) series.smooth = true;
                    if (step) series.step = step;

                    option.series.push(series);
                });
            }

            if (factored) {
                // One legend: colour entries with solid samples, whichever dash a colour's first
                // line has, then a gray sample per dash value. A legend entry needs a series of
                // its name, so each dash value has an empty proxy series.
                option.legend = {
                    data: [
                        ...names.map((name) => ({ name, lineStyle: { type: 'solid' } })),
                        ...dashLabels.map((label, i) => ({
                            name: dashKeyName(label),
                            lineStyle: { type: dashPattern(i), color: DASH_KEY_COLOR },
                            itemStyle: { color: DASH_KEY_COLOR, opacity: 0 },
                        })),
                    ],
                };
                dashLabels.forEach((label, i) => {
                    option.series.push({
                        name: dashKeyName(label),
                        type: 'line',
                        data: [],
                        silent: true,
                        showSymbol: false,
                        symbol: 'none',
                        lineStyle: { type: dashPattern(i), color: DASH_KEY_COLOR },
                        itemStyle: { color: DASH_KEY_COLOR },
                    });
                });
                option._encodingTooltip = {
                    ...option._encodingTooltip,
                    seriesSuffix: { index: 2, categoryNames: dashLabels },
                };
            } else if (dashField && !discreteColorField) {
                // The lines are the dash values: a legend of line samples, titled by the dash field.
                option.legend = { data: dashLabels.map((name) => ({ name, itemStyle: { opacity: 0 } })) };
                option._legendTitle = dashField;
            } else {
                option.legend = { data: names };
            }
        } else {
            // Single series
            const seriesData =
                yIsDiscrete && yCategories
                    ? buildCategoryAlignedXYData(table, xField, yField, yCategories)
                    : xIsDiscrete
                        ? categories!.map(cat => {
                            const row = table.find(r => String(r[xField]) === cat);
                            return row ? row[yField] : null;
                        })
                        : table.map(r => [r[xField], r[yField]]);

            const series: any = {
                type: 'line',
                data: seriesData,
                // Default line chart: don't draw point markers (unless showPoints is set).
                showSymbol: !!showPoints,
                symbol: showPoints ? 'circle' : 'none',
                ...(showPoints ? { symbolSize: 6 } : {}),
            };
            if (smooth) series.smooth = true;
            if (step) series.step = step;

            option.series.push(series);
        }

        Object.assign(spec, option);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        {
            key: 'interpolate', label: 'Curve', type: 'discrete', options: [
                { value: undefined, label: 'Default (linear)' },
                { value: 'linear', label: 'Linear' },
                { value: 'monotone', label: 'Monotone (smooth)' },
                { value: 'step', label: 'Step' },
                { value: 'step-before', label: 'Step Before' },
                { value: 'step-after', label: 'Step After' },
                { value: 'basis', label: 'Basis (smooth)' },
                { value: 'cardinal', label: 'Cardinal' },
                { value: 'catmull-rom', label: 'Catmull-Rom' },
            ],
        } as ChartPropertyDef,
        { key: 'showPoints', label: 'Points', type: 'binary', defaultValue: false } as ChartPropertyDef,
    ],
    pivot: makeCartesianPivot({
        permute: [['y', 'color']],
        shift: ['color', 'group', 'column', 'row'],
    }),
};

/**
 * For category-axis line charts, align series data to the shared category array.
 * Returns an array of y-values (or null) indexed by category position.
 * Optional yTransform applies to non-null values (e.g. rank inversion for Bump chart).
 */
function buildCategoryAlignedData(
    rows: any[],
    xField: string,
    yField: string,
    categories: string[],
    yTransform?: (y: number) => number,
): (number | null)[] {
    const map = new Map<string, number>();
    for (const row of rows) {
        const v = row[yField];
        if (v != null && !isNaN(Number(v))) map.set(String(row[xField]), Number(v));
    }
    return categories.map(cat => {
        const v = map.get(cat);
        return v != null ? (yTransform ? yTransform(v) : v) : null;
    });
}

/**
 * For y-category axis line charts (x is numeric/time, y is discrete),
 * align points by y category order and output [x, yCategory] pairs.
 */
function buildCategoryAlignedXYData(
    rows: any[],
    xField: string,
    yField: string,
    yCategories: string[],
): Array<[any, string]> {
    const map = new Map<string, any>();
    for (const row of rows) {
        const key = String(row[yField] ?? '');
        if (!map.has(key)) {
            map.set(key, row[xField]);
        }
    }
    return yCategories
        .filter((cat) => map.has(cat))
        .map((cat) => [map.get(cat), cat] as [any, string]);
}

/** RANK_SEMANTIC_TYPES: used to detect rank axis for Bump Chart (mirror vegalite/templates/bump.ts). */
const RANK_SEMANTIC_TYPES = new Set(['Rank', 'Score', 'Level']);

/**
 * Bump Chart — line with points, rank axis reversed when y is rank-like (mirror vegalite/templates/bump.ts).
 * Use yAxis as category with data ['1','2',...,'maxRank'] and inverse: true so rank 1 is at top without
 * using value-axis inverse (which in ECharts moves the x-axis to the top). Series y values are category
 * indices (rank - 1). All serializable — no formatter needed.
 */
export const ecBumpChartDef: ChartTemplateDef = {
    chart: 'Bump Chart',
    template: { mark: 'line', encoding: {} },
    channels: ['x', 'y', 'color', 'detail', 'column', 'row'],
    markCognitiveChannel: 'position',
    declareLayoutMode: () => ({
        paramOverrides: { continuousMarkCrossSection: { x: 80, y: 20, seriesCountAxis: 'auto' } },
    }),
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, semanticTypes } = ctx;
        const xCS = channelSemantics.x;
        const yCS = channelSemantics.y;
        const colorField = channelSemantics.color?.field;

        if (!xCS?.field || !yCS?.field) return;
        const xField = xCS.field;
        const yField = yCS.field;

        const ySemType = toTypeString(semanticTypes?.[yField]);
        const xSemType = toTypeString(semanticTypes?.[xField]);
        const yIsRank = RANK_SEMANTIC_TYPES.has(ySemType);
        const xIsRank = RANK_SEMANTIC_TYPES.has(xSemType);
        const rankOnY = yIsRank && !xIsRank;
        const rankOnX = xIsRank && !yIsRank;

        const xIsDiscrete = isDiscrete(xCS.type);
        const xIsTemporal = xCS.type === 'temporal';
        const categories = xIsDiscrete ? extractCategories(table, xField, getCategoryOrder(ctx, 'x')) : undefined;

        const rankValues = table.map((r: any) => Number(r[yField])).filter((v: number) => !isNaN(v) && isFinite(v));
        const maxRank = rankValues.length ? Math.max(...rankValues) : 1;
        const rankCategories = Array.from({ length: maxRank }, (_, i) => String(i + 1));
        const rankToIndex = (rank: number) => Math.max(0, Math.min(maxRank - 1, Math.round(rank) - 1));

        const toXValue = (v: any): number | string => {
            if (v == null) return NaN;
            if (xIsTemporal) return typeof v === 'number' ? v : new Date(String(v)).getTime();
            const n = Number(v);
            return isNaN(n) ? String(v) : n;
        };
        const sortRowsByX = (rows: any[]) =>
            [...rows].sort((a, b) => {
                const ax = toXValue(a[xField]);
                const bx = toXValue(b[xField]);
                if (typeof ax === 'number' && typeof bx === 'number') return ax - bx;
                return String(ax).localeCompare(String(bx));
            });

        const option: any = {
            tooltip: { trigger: 'axis' },
            xAxis: (() => {
                const type = xIsDiscrete ? 'category' : xIsTemporal ? 'time' : 'value';
                const base: any = {
                    type,
                    name: xField,
                    nameLocation: 'middle',
                    nameGap: 30,
                    axisLine: { show: true },
                    ...(categories ? { data: categories } : {}),
                };
                if (xIsDiscrete && categories) {
                    base.axisTick = { show: true, alignWithLabel: true };
                    base.axisLabel = { rotate: areCategoriesNumeric(categories) ? 0 : 90 };
                } else if (xIsTemporal) {
                    base.axisTick = { show: true, alignWithLabel: true };
                    base.axisLabel = { rotate: 90 };
                } else {
                    base.axisTick = { show: true };
                }
                return base;
            })(),
            yAxis: rankOnY
                ? {
                    type: 'category',
                    data: rankCategories,
                    inverse: true,
                    name: yField,
                    nameLocation: 'middle',
                    nameGap: 40,
                    axisLabel: { rotate: 0 },
                    axisTick: { show: true, alignWithLabel: true },
                }
                : {
                    type: 'value',
                    name: yField,
                    nameLocation: 'middle',
                    nameGap: 40,
                    axisTick: { show: true },
                    axisLabel: { rotate: 0 },
                },
            series: [],
        };
        if (rankOnY) {
            option.tooltip = {
                trigger: 'axis',
                formatter: (params: any) => {
                    const list = Array.isArray(params) ? params : [params];
                    if (list.length === 0) return '';
                    const p = list[0];
                    const cat = p.axisValue ?? p.name ?? '';
                    let html = `<b>${cat}</b><br/>`;
                    list.forEach((item: any) => {
                        const idx = item.value != null ? Number(item.value) : null;
                        const displayRank = idx != null && Number.isInteger(idx) ? String(idx + 1) : '–';
                        html += `${item.marker} ${item.seriesName}: ${displayRank}<br/>`;
                    });
                    return html;
                },
            };
        } else {
            option._encodingTooltip = { trigger: 'axis', categoryLabel: xField, valueLabel: yField };
        }

        const baseSeriesOpt = { showSymbol: true, symbolSize: 6, smooth: true };

        if (colorField) {
            const groups = groupBy(table, colorField);
            option.legend = { data: [...groups.keys()] };
            for (const [name, rows] of groups) {
                const orderedRows = xIsDiscrete ? rows : sortRowsByX(rows);
                const seriesData = xIsDiscrete
                    ? buildCategoryAlignedData(rows, xField, yField, categories!, rankOnY ? rankToIndex : undefined)
                    : orderedRows.map(r => [toXValue(r[xField]), rankOnY ? rankToIndex(Number(r[yField])) : r[yField]]);
                option.series.push({
                    name,
                    type: 'line',
                    data: seriesData,
                    ...baseSeriesOpt,
                    // 颜色由 ecApplyLayoutToSpec 根据 colorDecisions 统一分配
                });
            }
        } else {
            const rows = xIsDiscrete ? table : sortRowsByX(table);
            const seriesData = xIsDiscrete
                ? buildCategoryAlignedData(rows, xField, yField, categories!, rankOnY ? rankToIndex : undefined)
                : rows.map(r => [toXValue(r[xField]), rankOnY ? rankToIndex(Number(r[yField])) : r[yField]]);
            option.series.push({ type: 'line', data: seriesData, ...baseSeriesOpt });
        }

        Object.assign(spec, option);
        delete spec.mark;
        delete spec.encoding;
    },
};
