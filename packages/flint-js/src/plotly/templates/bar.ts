// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Bar Chart template.
 *
 * Mirrors the Chart.js Bar template's decisions (category detection,
 * ordinal sort order, zero baseline, horizontal transposition), expressed
 * as a Plotly `bar` trace:
 *   CJS: { type: 'bar', data: { labels, datasets[] }, options: { indexAxis } }
 *   PL:  { data: [{ type: 'bar', x, y, orientation }], layout: { xaxis, yaxis } }
 */

import { ChartTemplateDef, ChartPropertyDef, EncodingActionDef } from '../../core/types';
import { extractCategories, resolveCategoryOrder, buildCategoryAlignedData, detectAxes, groupBy, getPlotlyPalette, getSeriesColor } from './utils';
import { detectBandedAxisFromSemantics, detectBandedAxisForceDiscrete } from '../../core/axis-detection';
import { planBandDodge } from '../../core/band-dodge';
import { makeSortAction } from '../../core/encoding-actions';
import { makeCartesianPivot } from '../../core/pivot';

/** Corner-radius property shared by the Plotly bar templates (px, matches VL). */
const BAR_CORNER_RADIUS: ChartPropertyDef = {
    key: 'cornerRadius', label: 'Corners', type: 'continuous',
    min: 0, max: 15, step: 1, defaultValue: 0,
};

function continuousColorValue(value: unknown, temporal: boolean): number | null {
    if (value == null || value === '') return null;
    const dateLike = temporal || (
        typeof value === 'string'
        && !Number.isFinite(Number(value))
        && Number.isFinite(Date.parse(value))
    );
    const number = dateLike ? new Date(value as any).getTime() : Number(value);
    return Number.isFinite(number) ? number : null;
}

export const plBarChartDef: ChartTemplateDef = {
    chart: 'Bar Chart',
    template: { mark: 'bar', encoding: {} },
    channels: ['x', 'y', 'color', 'opacity', 'column', 'row'],
    markCognitiveChannel: 'length',
    declareLayoutMode: (cs, table) => {
        const result = detectBandedAxisFromSemantics(cs, table, { preferAxis: 'x' });
        return {
            axisFlags: result ? { [result.axis]: { banded: true } } : { x: { banded: true } },
            resolvedTypes: result?.resolvedTypes,
        };
    },
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties, colorDecisions } = ctx;
        const xDiscrete = channelSemantics.x?.type === 'nominal'
            || channelSemantics.x?.type === 'ordinal';
        const yDiscrete = channelSemantics.y?.type === 'nominal'
            || channelSemantics.y?.type === 'ordinal';
        if (xDiscrete && yDiscrete) {
            const xField = channelSemantics.x?.field;
            const yField = channelSemantics.y?.field;
            if (!xField || !yField) return;
            const xCategories = extractCategories(table, xField, channelSemantics.x?.ordinalSortOrder);
            const yCategories = extractCategories(table, yField, channelSemantics.y?.ordinalSortOrder);
            const occupied = new Map<string, any>();
            for (const row of table) occupied.set(`${String(row[xField])}\0${String(row[yField])}`, row);
            const cells = [...occupied.values()];
            const cellSize = Math.max(
                8,
                Math.min(
                    36,
                    (ctx.canvasSize.width / Math.max(1, xCategories.length)) * 0.68,
                    (ctx.canvasSize.height / Math.max(1, yCategories.length)) * 0.68,
                ),
            );
            Object.assign(spec, {
                data: [{
                    type: 'scatter',
                    mode: 'markers',
                    x: cells.map(row => row[xField]),
                    y: cells.map(row => row[yField]),
                    marker: {
                        symbol: 'square',
                        size: cellSize,
                        color: getSeriesColor(getPlotlyPalette(ctx), 0),
                    },
                    showlegend: false,
                }],
                layout: {
                    xaxis: {
                        type: 'category',
                        categoryorder: 'array',
                        categoryarray: xCategories,
                        title: { text: xField },
                    },
                    yaxis: {
                        type: 'category',
                        categoryorder: 'array',
                        categoryarray: yCategories,
                        title: { text: yField },
                    },
                    showlegend: false,
                },
            });
            delete spec.mark;
            delete spec.encoding;
            return;
        }
        const { categoryAxis, valueAxis } = detectAxes(channelSemantics);

        const catField = channelSemantics[categoryAxis]?.field;
        const valField = channelSemantics[valueAxis]?.field;
        if (!catField || !valField) return;

        const catCS = channelSemantics[categoryAxis];
        const catEnc = ctx.encodings?.[categoryAxis];
        // `sortBy` from the Sort action is the measure CHANNEL ('x'|'y'); map it
        // to its field so we can order categories by that measure.
        const sortByField = catEnc?.sortBy ? channelSemantics[catEnc.sortBy]?.field : undefined;
        const categories = resolveCategoryOrder(table, catField, {
            ordinalSortOrder: catCS?.ordinalSortOrder,
            sortBy: sortByField,
            sortOrder: catEnc?.sortOrder,
        });
        const values = buildCategoryAlignedData(table, catField, valField, categories);

        const isHorizontal = categoryAxis === 'y';
        const colorField = channelSemantics.color?.field;
        const colorDecision = colorDecisions?.color;
        const continuousColor = !!colorField
            && colorDecision != null
            && colorDecision.schemeType !== 'categorical';
        const palette = getPlotlyPalette(ctx);
        const cornerRadius = Number(chartProperties?.cornerRadius ?? 0);

        const catAxisSpec = {
            type: 'category' as const,
            categoryorder: 'array' as const,
            categoryarray: categories,
            ...(isHorizontal ? { autorange: 'reversed' as const } : {}),
            title: { text: catField },
        };
        const valCS = channelSemantics[valueAxis];
        // Bars encode length — include zero unless the semantic decision says otherwise.
        const includeZero = valCS?.zero ? valCS.zero.zero !== false : true;
        const valAxisSpec = {
            title: { text: valField },
            rangemode: (includeZero ? 'tozero' : 'normal') as 'tozero' | 'normal',
        };

        const fullTable = ctx.fullTable ?? table;
        const colorCategories = colorField && !continuousColor
            ? extractCategories(fullTable, colorField, channelSemantics.color?.ordinalSortOrder)
            : [];
        const temporalColor = channelSemantics.color?.type === 'temporal';
        const categoryRows = categories.map(category =>
            table.find(row => String(row[catField]) === String(category)));
        const allContinuousColors = continuousColor && colorField
            ? fullTable
                .map(row => continuousColorValue(row[colorField], temporalColor))
                .filter((value): value is number => value != null)
            : [];
        const traces = continuousColor && colorField
            ? [{
                type: 'bar',
                name: colorField,
                ...(isHorizontal
                    ? { x: values, y: categories, orientation: 'h' }
                    : { x: categories, y: values }),
                marker: {
                    color: categoryRows.map(row =>
                        row == null ? null : continuousColorValue(row[colorField], temporalColor)),
                    colorscale: colorDecision.schemeType === 'diverging' ? 'RdBu' : 'Viridis',
                    cmin: allContinuousColors.length ? Math.min(...allContinuousColors) : 0,
                    cmax: allContinuousColors.length ? Math.max(...allContinuousColors) : 1,
                    showscale: true,
                    colorbar: { title: { text: colorField } },
                    ...(cornerRadius > 0 ? { cornerradius: cornerRadius } : {}),
                },
                showlegend: false,
            }]
            : colorField
            ? [...groupBy(table, colorField)].map(([name, rows]) => ({
                type: 'bar',
                name,
                ...(isHorizontal
                    ? { x: buildCategoryAlignedData(rows, catField, valField, categories), y: categories, orientation: 'h' }
                    : { x: categories, y: buildCategoryAlignedData(rows, catField, valField, categories) }),
                marker: {
                    color: getSeriesColor(palette, Math.max(0, colorCategories.indexOf(name))),
                    ...(cornerRadius > 0 ? { cornerradius: cornerRadius } : {}),
                },
            }))
            : [{
                type: 'bar',
                name: valField,
                ...(isHorizontal
                    ? { x: values, y: categories, orientation: 'h' }
                    : { x: categories, y: values }),
                marker: {
                    color: getSeriesColor(palette, 0),
                    ...(cornerRadius > 0 ? { cornerradius: cornerRadius } : {}),
                },
            }];
        const figure: any = {
            data: traces,
            layout: {
                ...(colorField && !continuousColor ? { barmode: 'stack' } : {}),
                bargap: 0.2,
                ...(isHorizontal
                    ? { xaxis: valAxisSpec, yaxis: catAxisSpec }
                    : { xaxis: catAxisSpec, yaxis: valAxisSpec }),
                showlegend: !!colorField && !continuousColor,
            },
        };

        Object.assign(spec, figure);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [BAR_CORNER_RADIUS],
    encodingActions: [makeSortAction()] as EncodingActionDef[],
    pivot: makeCartesianPivot({
        transpose: [['x', 'y']],
        permute: [['x', 'y', 'color']],
        shift: ['color', 'column', 'row'],
    }),
};

// ─── Stacked Bar Chart ──────────────────────────────────────────────────────

/**
 * Plotly Stacked Bar Chart — one trace per `color` group, `layout.barmode:
 * 'stack'`. Plotly stacks traces natively by matching x/category positions,
 * so (unlike Chart.js/ECharts) no manual per-band accumulation is needed.
 */
export const plStackedBarChartDef: ChartTemplateDef = {
    chart: 'Stacked Bar Chart',
    template: { mark: 'bar', encoding: {} },
    channels: ['x', 'y', 'color', 'column', 'row'],
    markCognitiveChannel: 'length',
    declareLayoutMode: (cs, table) => {
        const result = detectBandedAxisFromSemantics(cs, table, { preferAxis: 'x' });
        return {
            axisFlags: result ? { [result.axis]: { banded: true } } : { x: { banded: true } },
            resolvedTypes: result?.resolvedTypes,
            paramOverrides: { continuousMarkCrossSection: { x: 20, y: 20, seriesCountAxis: 'auto' } },
        };
    },
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, chartProperties } = ctx;
        const { categoryAxis, valueAxis } = detectAxes(channelSemantics);
        const colorField = channelSemantics.color?.field;

        const catField = channelSemantics[categoryAxis]?.field;
        const valField = channelSemantics[valueAxis]?.field;
        if (!catField || !valField) return;

        const catCS = channelSemantics[categoryAxis];
        const catEnc = ctx.encodings?.[categoryAxis];
        const sortByField = catEnc?.sortBy ? channelSemantics[catEnc.sortBy]?.field : undefined;
        const categories = resolveCategoryOrder(table, catField, {
            ordinalSortOrder: catCS?.ordinalSortOrder, sortBy: sortByField, sortOrder: catEnc?.sortOrder,
        });
        const isHorizontal = categoryAxis === 'y';
        const palette = getPlotlyPalette(ctx, 'color');
        // 100%-stacked toggle (Stack property): Plotly normalizes each band to
        // 100% via `barnorm: 'percent'`; the value-axis title then reflects %.
        const normalize = colorField && chartProperties?.stackMode === 'normalize';

        const traces: any[] = [];
        if (colorField) {
            const colorCategories = extractCategories(
                ctx.fullTable ?? table,
                colorField,
                channelSemantics.color?.ordinalSortOrder,
            );
            for (const [name, rows] of groupBy(table, colorField)) {
                const values = buildCategoryAlignedData(rows, catField, valField, categories);
                traces.push({
                    type: 'bar',
                    name,
                    ...(isHorizontal ? { x: values, y: categories, orientation: 'h' } : { x: categories, y: values }),
                    marker: { color: getSeriesColor(palette, Math.max(0, colorCategories.indexOf(name))) },
                });
            }
        } else {
            const values = buildCategoryAlignedData(table, catField, valField, categories);
            traces.push({
                type: 'bar',
                name: valField,
                ...(isHorizontal ? { x: values, y: categories, orientation: 'h' } : { x: categories, y: values }),
                marker: { color: getSeriesColor(palette, 0) },
            });
        }

        const catAxisSpec = {
            type: 'category' as const,
            categoryorder: 'array' as const,
            categoryarray: categories,
            ...(isHorizontal ? { autorange: 'reversed' as const } : {}),
            title: { text: catField },
        };
        const valCS = channelSemantics[valueAxis];
        const includeZero = valCS?.zero ? valCS.zero.zero !== false : true;
        const valAxisSpec = { title: { text: valField }, rangemode: (includeZero ? 'tozero' : 'normal') as 'tozero' | 'normal' };

        Object.assign(spec, {
            data: traces,
            layout: {
                barmode: 'stack',
                ...(normalize ? { barnorm: 'percent' } : {}),
                bargap: 0.2,
                ...(isHorizontal ? { xaxis: valAxisSpec, yaxis: catAxisSpec } : { xaxis: catAxisSpec, yaxis: valAxisSpec }),
                showlegend: !!colorField,
            },
        });
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        { key: 'stackMode', label: 'Stack', type: 'discrete',
          check: (ctx) => ({ applicable: !!ctx.encodings.color?.field }),
          options: [
            { value: undefined, label: 'Stacked (default)' },
            { value: 'normalize', label: 'Normalize (100%)' },
          ] } as ChartPropertyDef,
    ],
    encodingActions: [makeSortAction()] as EncodingActionDef[],
    pivot: makeCartesianPivot({
        transpose: [['x', 'y']],
        permute: [['x', 'y', 'color']],
        shift: ['color', 'group', 'column', 'row'],
    }),
};

// ─── Grouped Bar Chart ──────────────────────────────────────────────────────

/**
 * Plotly Grouped Bar Chart — one trace per `group`/`color` value,
 * `layout.barmode: 'group'`. Plotly dodges the bars natively within each
 * category band (equal-width lanes), the native equivalent of the Chart.js/
 * ECharts manual band-dodge planner.
 */
export const plGroupedBarChartDef: ChartTemplateDef = {
    chart: 'Grouped Bar Chart',
    template: { mark: 'bar', encoding: {} },
    channels: ['x', 'y', 'group', 'color', 'column', 'row'],
    markCognitiveChannel: 'length',
    declareLayoutMode: (cs, table) => {
        const result = detectBandedAxisForceDiscrete(cs, table, { preferAxis: 'x' });
        return {
            axisFlags: result ? { [result.axis]: { banded: true } } : { x: { banded: true } },
            resolvedTypes: result?.resolvedTypes,
            paramOverrides: { continuousMarkCrossSection: { x: 20, y: 20, seriesCountAxis: 'auto' } },
        };
    },
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, colorDecisions } = ctx;
        const { categoryAxis, valueAxis } = detectAxes(channelSemantics);
        const groupField = channelSemantics.group?.field || channelSemantics.color?.field;

        const catField = channelSemantics[categoryAxis]?.field;
        const valField = channelSemantics[valueAxis]?.field;
        if (!catField || !valField) return;

        const catCS = channelSemantics[categoryAxis];
        const catEnc = ctx.encodings?.[categoryAxis];
        const sortByField = catEnc?.sortBy ? channelSemantics[catEnc.sortBy]?.field : undefined;
        const categories = resolveCategoryOrder(table, catField, {
            ordinalSortOrder: catCS?.ordinalSortOrder, sortBy: sortByField, sortOrder: catEnc?.sortOrder,
        });
        const isHorizontal = categoryAxis === 'y';
        const palette = getPlotlyPalette(ctx, 'group');
        const groupChannel = channelSemantics.group?.field ? 'group' : 'color';
        const groupDecision = colorDecisions?.[groupChannel];
        const groupType = channelSemantics[groupChannel]?.type;
        const temporalGroup = groupType === 'temporal';
        const continuousGroup = !!groupField
            && groupDecision != null
            && groupDecision.schemeType !== 'categorical';

        // When the group is redundant/nested with the category axis (group == x,
        // or a 1:1 pairing), no band holds more than one group value — there is
        // nothing to dodge. Plotly's native `barmode: 'group'` would still
        // reserve a lane per group and leave each real bar as a shifted sliver.
        // Fall back to `barmode: 'overlay'` so each band shows one centered,
        // full-width colored bar (like a colored bar chart), keeping the legend.
        const degenerateGroup = !!groupField && planBandDodge(table, catField, groupField).maxPerBand <= 1;

        const traces: any[] = [];
        if (continuousGroup && groupField) {
            const rowsByCategory = categories.map(category =>
                table.filter(row => String(row[catField]) === String(category)));
            const lanes = Math.max(0, ...rowsByCategory.map(rows => rows.length));
            const colorValues = (ctx.fullTable ?? table)
                .map(row => continuousColorValue(row[groupField], temporalGroup))
                .filter((value): value is number => value != null);
            const cmin = colorValues.length ? Math.min(...colorValues) : 0;
            const cmax = colorValues.length ? Math.max(...colorValues) : 1;
            for (let lane = 0; lane < lanes; lane++) {
                const laneRows = rowsByCategory.map(rows => rows[lane]);
                const values = laneRows.map(row => row == null ? null : Number(row[valField]));
                const colors = laneRows.map(row =>
                    row == null ? null : continuousColorValue(row[groupField], temporalGroup));
                traces.push({
                    type: 'bar',
                    offsetgroup: `lane-${lane}`,
                    showlegend: false,
                    ...(isHorizontal
                        ? { x: values, y: categories, orientation: 'h' }
                        : { x: categories, y: values }),
                    marker: {
                        color: colors,
                        colorscale: groupDecision.schemeType === 'diverging' ? 'RdBu' : 'Viridis',
                        cmin,
                        cmax,
                        showscale: lane === 0,
                        ...(lane === 0 ? { colorbar: { title: { text: groupField } } } : {}),
                    },
                });
            }
        } else if (groupField) {
            const groupCategories = extractCategories(
                ctx.fullTable ?? table,
                groupField,
                channelSemantics[groupChannel]?.ordinalSortOrder,
            );
            for (const [name, rows] of groupBy(table, groupField)) {
                const values = buildCategoryAlignedData(rows, catField, valField, categories);
                traces.push({
                    type: 'bar',
                    name,
                    ...(isHorizontal ? { x: values, y: categories, orientation: 'h' } : { x: categories, y: values }),
                    marker: { color: getSeriesColor(palette, Math.max(0, groupCategories.indexOf(name))) },
                });
            }
        } else {
            const values = buildCategoryAlignedData(table, catField, valField, categories);
            traces.push({
                type: 'bar',
                name: valField,
                ...(isHorizontal ? { x: values, y: categories, orientation: 'h' } : { x: categories, y: values }),
                marker: { color: getSeriesColor(palette, 0) },
            });
        }

        const catAxisSpec = {
            type: 'category' as const,
            categoryorder: 'array' as const,
            categoryarray: categories,
            ...(isHorizontal ? { autorange: 'reversed' as const } : {}),
            title: { text: catField },
        };
        const valCS = channelSemantics[valueAxis];
        const includeZero = valCS?.zero ? valCS.zero.zero !== false : true;
        const valAxisSpec = { title: { text: valField }, rangemode: (includeZero ? 'tozero' : 'normal') as 'tozero' | 'normal' };

        Object.assign(spec, {
            data: traces,
            layout: {
                barmode: degenerateGroup ? 'overlay' : 'group',
                bargap: 0.2,
                ...(isHorizontal ? { xaxis: valAxisSpec, yaxis: catAxisSpec } : { xaxis: catAxisSpec, yaxis: valAxisSpec }),
                showlegend: !!groupField && !continuousGroup,
            },
        });
        delete spec.mark;
        delete spec.encoding;
    },
    encodingActions: [makeSortAction()] as EncodingActionDef[],
    pivot: makeCartesianPivot({
        transpose: [['x', 'y']],
        permute: [['x', 'y', 'color']],
        shift: ['color', 'group', 'column', 'row'],
    }),
};

/**
 * Plotly Pyramid Chart (population pyramid) — two mirrored horizontal bar
 * traces sharing one category axis, one side negated so the bars extend left
 * and right from a shared zero (`barmode: 'overlay'`; `x` axis ticks show
 * absolute values via `tickformat`/hover text so negative bars still read as
 * positive magnitudes).
 */
export const plPyramidChartDef: ChartTemplateDef = {
    chart: 'Pyramid Chart',
    template: { mark: 'bar', encoding: {} },
    channels: ['x', 'y', 'color'],
    markCognitiveChannel: 'length',
    declareLayoutMode: () => ({ axisFlags: { y: { banded: true } } }),
    instantiate: (spec, ctx) => {
        const { channelSemantics, table } = ctx;
        const xCS = channelSemantics.x;
        const yCS = channelSemantics.y;
        const xField = xCS?.field;
        const yField = yCS?.field;
        if (!xField || !yField) return;

        const yDiscrete = yCS?.type === 'nominal' || yCS?.type === 'ordinal';
        const catField = yDiscrete ? yField : xField;
        const valField = yDiscrete ? xField : yField;
        const colorField = channelSemantics.color?.field || channelSemantics.group?.field;

        const catCS = yDiscrete ? yCS : xCS;
        const categories = extractCategories(table, catField!, catCS?.ordinalSortOrder);

        const sumPerCategory = (predicate?: (row: any) => boolean): number[] => {
            const valueMap = new Map<string, number>();
            for (const row of table) {
                if (predicate && !predicate(row)) continue;
                const cat = String(row[catField!] ?? '');
                const v = row[valField!];
                if (v != null && !isNaN(Number(v))) valueMap.set(cat, (valueMap.get(cat) ?? 0) + Number(v));
            }
            return categories.map(cat => valueMap.get(cat) ?? 0);
        };

        let leftPos: number[];
        let rightPos: number[];
        let leftName: string | undefined;
        let rightName: string | undefined;

        if (colorField && table.length > 0) {
            const groups = [...new Set(table.map(r => r[colorField]))];
            const leftGroup = groups[0];
            const rightGroup = groups.length > 1 ? groups[1] : groups[0];
            leftPos = sumPerCategory(row => String(row[colorField] ?? '') === String(leftGroup ?? ''));
            rightPos = sumPerCategory(row => String(row[colorField] ?? '') === String(rightGroup ?? ''));
            leftName = String(leftGroup);
            rightName = String(rightGroup);
        } else {
            const values = sumPerCategory();
            leftPos = values;
            rightPos = values;
        }

        const leftData = leftPos.map(v => -v);
        const maxAbs = Math.max(0, ...leftPos, ...rightPos);
        const palette = getPlotlyPalette(ctx, 'color');

        Object.assign(spec, {
            data: [
                {
                    type: 'bar', orientation: 'h', name: leftName,
                    x: leftData, y: categories,
                    customdata: leftPos,
                    hovertemplate: `%{y}<br />${leftName ?? catField}: %{customdata}<extra></extra>`,
                    marker: { color: getSeriesColor(palette, 0) },
                },
                {
                    type: 'bar', orientation: 'h', name: rightName,
                    x: rightPos, y: categories,
                    hovertemplate: `%{y}<br />${rightName ?? catField}: %{x}<extra></extra>`,
                    marker: { color: getSeriesColor(palette, 1) },
                },
            ],
            layout: {
                barmode: 'overlay',
                bargap: 0.15,
                xaxis: {
                    title: { text: valField },
                    range: maxAbs > 0 ? [-maxAbs * 1.05, maxAbs * 1.05] : undefined,
                    tickformat: undefined,
                    // Show absolute values on the tick labels (both sides read as magnitude).
                    tickvals: undefined,
                },
                yaxis: { type: 'category', categoryorder: 'array', categoryarray: categories, title: { text: catField } },
                showlegend: leftName !== rightName,
            },
        });
        delete spec.mark;
        delete spec.encoding;
    },
    postProcess: (figure) => {
        // Absolute-value tick labels: compute explicit tickvals/ticktext so the
        // negated left side still reads as a positive magnitude.
        const xaxis = figure.layout?.xaxis;
        if (xaxis?.range) {
            const maxAbs = Math.max(Math.abs(xaxis.range[0]), Math.abs(xaxis.range[1]));
            const step = maxAbs > 0 ? niceStep(maxAbs) : 1;
            const vals: number[] = [];
            for (let v = -Math.floor(maxAbs / step) * step; v <= maxAbs + 1e-9; v += step) vals.push(Math.round(v * 1e6) / 1e6);
            xaxis.tickvals = vals;
            xaxis.ticktext = vals.map(v => String(Math.abs(v)));
        }
    },
    properties: [] as ChartPropertyDef[],
};

function niceStep(maxAbs: number): number {
    const target = maxAbs / 4;
    const pow = Math.pow(10, Math.floor(Math.log10(Math.max(target, 1e-9))));
    const frac = target / pow;
    const nice = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
    return nice * pow;
}
