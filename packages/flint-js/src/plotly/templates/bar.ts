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

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { extractCategories, buildCategoryAlignedData, detectAxes, groupBy, getPlotlyPalette, getSeriesColor } from './utils';
import { detectBandedAxisFromSemantics, detectBandedAxisForceDiscrete } from '../../core/axis-detection';

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
        const { channelSemantics, table } = ctx;
        const { categoryAxis, valueAxis } = detectAxes(channelSemantics);

        const catField = channelSemantics[categoryAxis]?.field;
        const valField = channelSemantics[valueAxis]?.field;
        if (!catField || !valField) return;

        const catCS = channelSemantics[categoryAxis];
        const categories = extractCategories(table, catField, catCS?.ordinalSortOrder);
        const values = buildCategoryAlignedData(table, catField, valField, categories);

        const isHorizontal = categoryAxis === 'y';
        const palette = getPlotlyPalette(ctx);

        const catAxisSpec = {
            type: 'category' as const,
            categoryorder: 'array' as const,
            categoryarray: categories,
            title: { text: catField },
        };
        const valCS = channelSemantics[valueAxis];
        // Bars encode length — include zero unless the semantic decision says otherwise.
        const includeZero = valCS?.zero ? valCS.zero.zero !== false : true;
        const valAxisSpec = {
            title: { text: valField },
            rangemode: (includeZero ? 'tozero' : 'normal') as 'tozero' | 'normal',
        };

        const figure: any = {
            data: [{
                type: 'bar',
                name: valField,
                ...(isHorizontal
                    ? { x: values, y: categories, orientation: 'h' }
                    : { x: categories, y: values }),
                marker: { color: getSeriesColor(palette, 0) },
            }],
            layout: {
                ...(isHorizontal
                    ? { xaxis: valAxisSpec, yaxis: catAxisSpec }
                    : { xaxis: catAxisSpec, yaxis: valAxisSpec }),
                showlegend: false,
            },
        };

        Object.assign(spec, figure);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [] as ChartPropertyDef[],
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
        const { channelSemantics, table } = ctx;
        const { categoryAxis, valueAxis } = detectAxes(channelSemantics);
        const colorField = channelSemantics.color?.field;

        const catField = channelSemantics[categoryAxis]?.field;
        const valField = channelSemantics[valueAxis]?.field;
        if (!catField || !valField) return;

        const catCS = channelSemantics[categoryAxis];
        const categories = extractCategories(table, catField, catCS?.ordinalSortOrder);
        const isHorizontal = categoryAxis === 'y';
        const palette = getPlotlyPalette(ctx, 'color');

        const traces: any[] = [];
        if (colorField) {
            let i = 0;
            for (const [name, rows] of groupBy(table, colorField)) {
                const values = buildCategoryAlignedData(rows, catField, valField, categories);
                traces.push({
                    type: 'bar',
                    name,
                    ...(isHorizontal ? { x: values, y: categories, orientation: 'h' } : { x: categories, y: values }),
                    marker: { color: getSeriesColor(palette, i) },
                });
                i++;
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

        const catAxisSpec = { type: 'category' as const, categoryorder: 'array' as const, categoryarray: categories, title: { text: catField } };
        const valCS = channelSemantics[valueAxis];
        const includeZero = valCS?.zero ? valCS.zero.zero !== false : true;
        const valAxisSpec = { title: { text: valField }, rangemode: (includeZero ? 'tozero' : 'normal') as 'tozero' | 'normal' };

        Object.assign(spec, {
            data: traces,
            layout: {
                barmode: 'stack',
                ...(isHorizontal ? { xaxis: valAxisSpec, yaxis: catAxisSpec } : { xaxis: catAxisSpec, yaxis: valAxisSpec }),
                showlegend: !!colorField,
            },
        });
        delete spec.mark;
        delete spec.encoding;
    },
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
        const { channelSemantics, table } = ctx;
        const { categoryAxis, valueAxis } = detectAxes(channelSemantics);
        const groupField = channelSemantics.group?.field || channelSemantics.color?.field;

        const catField = channelSemantics[categoryAxis]?.field;
        const valField = channelSemantics[valueAxis]?.field;
        if (!catField || !valField) return;

        const catCS = channelSemantics[categoryAxis];
        const categories = extractCategories(table, catField, catCS?.ordinalSortOrder);
        const isHorizontal = categoryAxis === 'y';
        const palette = getPlotlyPalette(ctx, 'group');

        const traces: any[] = [];
        if (groupField) {
            let i = 0;
            for (const [name, rows] of groupBy(table, groupField)) {
                const values = buildCategoryAlignedData(rows, catField, valField, categories);
                traces.push({
                    type: 'bar',
                    name,
                    ...(isHorizontal ? { x: values, y: categories, orientation: 'h' } : { x: categories, y: values }),
                    marker: { color: getSeriesColor(palette, i) },
                });
                i++;
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

        const catAxisSpec = { type: 'category' as const, categoryorder: 'array' as const, categoryarray: categories, title: { text: catField } };
        const valCS = channelSemantics[valueAxis];
        const includeZero = valCS?.zero ? valCS.zero.zero !== false : true;
        const valAxisSpec = { title: { text: valField }, rangemode: (includeZero ? 'tozero' : 'normal') as 'tozero' | 'normal' };

        Object.assign(spec, {
            data: traces,
            layout: {
                barmode: 'group',
                ...(isHorizontal ? { xaxis: valAxisSpec, yaxis: catAxisSpec } : { xaxis: catAxisSpec, yaxis: valAxisSpec }),
                showlegend: !!groupField,
            },
        });
        delete spec.mark;
        delete spec.encoding;
    },
};

// ─── Pyramid Chart ──────────────────────────────────────────────────────────

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
