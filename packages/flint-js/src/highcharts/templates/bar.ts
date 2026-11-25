// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Highcharts Bar Chart templates: Bar, Stacked Bar, Grouped Bar.
 *
 * Highcharts mapping:
 *   VL/ECharts: encoding channels determine stacking/grouping implicitly
 *   HC: one series per color/group value; stacking via plotOptions.series.stacking,
 *       grouping is native when several series share a category axis.
 */

import { ChartTemplateDef, ChartPropertyDef, EncodingActionDef } from '../../core/types';
import {
    extractCategories,
    groupBy,
    detectAxes,
    getCategoryOrder,
    buildCategoryValues,
    buildCategoryCounts,
    categoryAxisLabelRotateDeg,
} from './utils';
import {
    detectBandedAxisFromSemantics,
    detectBandedAxisForceDiscrete,
} from '../../core/axis-detection';
import { makeCartesianPivot } from '../../core/pivot';
import { makeSortAction } from '../../core/encoding-actions';

// ─── Bar Chart ──────────────────────────────────────────────────────────────

export const hcBarChartDef: ChartTemplateDef = {
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
        const { channelSemantics, table, chartProperties } = ctx;
        const { categoryAxis, valueAxis } = detectAxes(channelSemantics);

        const catField = channelSemantics[categoryAxis]?.field;
        const valField = channelSemantics[valueAxis]?.field;
        if (!catField || !valField) return;

        const catCS = channelSemantics[categoryAxis];
        const valCS = channelSemantics[valueAxis];
        const colorField = channelSemantics.color?.field;
        const bothDiscrete =
            channelSemantics.x?.type === 'nominal' && channelSemantics.y?.type === 'nominal';

        if (bothDiscrete) {
            // x=Category, y=Group both nominal → heatmap: cell value = count per
            // (Category, Group), rendered with the native Highcharts heatmap.
            const categories = extractCategories(table, catField, getCategoryOrder(ctx, categoryAxis));
            const groups = extractCategories(table, valField, getCategoryOrder(ctx, valueAxis));

            const data: [number, number, number][] = [];
            let maxVal = 1;
            for (let yi = 0; yi < groups.length; yi++) {
                for (let xi = 0; xi < categories.length; xi++) {
                    const count = table.filter((r) =>
                        String(r[catField] ?? '') === categories[xi]
                        && String(r[valField] ?? '') === groups[yi],
                    ).length;
                    data.push([xi, yi, count]);
                    if (count > maxVal) maxVal = count;
                }
            }

            const option: any = {
                chart: { type: 'heatmap' },
                xAxis: {
                    categories,
                    title: { text: catField },
                    labels: { rotation: categoryAxisLabelRotateDeg(categories, catCS?.type) },
                },
                yAxis: {
                    categories: groups,
                    title: { text: valField },
                    reversed: true,
                },
                colorAxis: {
                    min: 0,
                    max: maxVal,
                    minColor: '#f0f9ff',
                    maxColor: '#0369a1',
                },
                legend: {
                    align: 'right',
                    layout: 'vertical',
                    verticalAlign: 'middle',
                    symbolHeight: 180,
                },
                tooltip: {
                    pointFormat: '{point.x}, {point.y}: <b>{point.value}</b>',
                },
                series: [{
                    name: 'Count',
                    data,
                    borderWidth: 1,
                    borderColor: '#ffffff',
                }],
            };
            Object.assign(spec, option);
            delete spec.mark;
            delete spec.encoding;
            return;
        }

        // Color + quantitative value → one series per color value (side-by-side).
        if (colorField && valCS?.type === 'quantitative') {
            const categories = extractCategories(table, catField, getCategoryOrder(ctx, categoryAxis));
            const isHorizontal = categoryAxis === 'y';

            const groups = groupBy(table, colorField);
            const series = [...groups.keys()].map((name) => {
                const rows = groups.get(name)!;
                const data = valCS?.type === 'temporal'
                    ? buildCategoryCounts(rows, catField, categories)
                    : buildCategoryValues(rows, catField, valField, categories);
                return { name, data };
            });

            const option: any = {
                chart: { type: isHorizontal ? 'bar' : 'column' },
                xAxis: {
                    categories,
                    title: { text: catField },
                    labels: { rotation: isHorizontal ? 0 : categoryAxisLabelRotateDeg(categories, catCS?.type) },
                },
                yAxis: { title: { text: valField } },
                legend: { layout: 'horizontal', align: 'center', verticalAlign: 'bottom' },
                series,
            };
            Object.assign(spec, option);
            delete spec.mark;
            delete spec.encoding;
            return;
        }

        let categories = extractCategories(table, catField, getCategoryOrder(ctx, categoryAxis));
        let values: (number | null)[];
        if (valCS?.type === 'temporal') {
            values = buildCategoryCounts(table, catField, categories);
        } else {
            values = buildCategoryValues(table, catField, valField, categories);
        }
        if (catCS?.type === 'temporal') {
            const pairs: [string, number | null][] = categories.map((c, i) => [c, values[i]]);
            pairs.sort((a, b) => new Date(a[0]).getTime() - new Date(b[0]).getTime());
            categories = pairs.map(p => p[0]);
            values = pairs.map(p => p[1]);
        }

        const isHorizontal = categoryAxis === 'y';
        const valueLabel = valCS?.type === 'temporal' ? 'Count' : valField;

        const option: any = {
            chart: { type: isHorizontal ? 'bar' : 'column' },
            xAxis: {
                categories,
                title: { text: catField },
                labels: { rotation: isHorizontal ? 0 : categoryAxisLabelRotateDeg(categories, catCS?.type) },
            },
            yAxis: { title: { text: valueLabel } },
            legend: { enabled: false },
            series: [{
                name: valueLabel,
                data: values,
            }],
            plotOptions: {
                column: {
                    borderRadius: chartProperties?.cornerRadius ?? 0,
                },
                bar: {
                    borderRadius: chartProperties?.cornerRadius ?? 0,
                },
            },
        };
        Object.assign(spec, option);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        { key: 'cornerRadius', label: 'Corners', type: 'continuous', min: 0, max: 15, step: 1, defaultValue: 0 },
    ] as ChartPropertyDef[],
    encodingActions: [makeSortAction()] as EncodingActionDef[],
    pivot: makeCartesianPivot({
        transpose: [['x', 'y']],
        permute: [['x', 'y', 'color']],
        shift: ['color', 'column', 'row'],
    }),
};

// ─── Stacked Bar Chart ──────────────────────────────────────────────────────

export const hcStackedBarChartDef: ChartTemplateDef = {
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
        const valCS = channelSemantics[valueAxis];
        let categories = extractCategories(table, catField, getCategoryOrder(ctx, categoryAxis));
        if (catCS?.type === 'temporal') {
            categories = [...categories].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
        }
        const isHorizontal = categoryAxis === 'y';
        const valueLabel = valCS?.type === 'temporal' ? 'Count' : valField;

        // All categorical → count per (x, color) with stacked columns.
        if (colorField && channelSemantics.x?.type === 'nominal' && channelSemantics.y?.type === 'nominal') {
            const categoriesX = extractCategories(table, channelSemantics.x!.field!, getCategoryOrder(ctx, 'x'));
            const groups = groupBy(table, colorField);

            const series = [...groups.keys()].map((name) => ({
                name,
                data: buildCategoryCounts(groups.get(name)!, channelSemantics.x!.field!, categoriesX),
            }));

            const option: any = {
                chart: { type: 'column' },
                xAxis: {
                    categories: categoriesX,
                    title: { text: channelSemantics.x!.field },
                    labels: { rotation: categoryAxisLabelRotateDeg(categoriesX, channelSemantics.x?.type) },
                },
                yAxis: { title: { text: 'Count' }, min: 0, allowDecimals: false },
                legend: { layout: 'horizontal', align: 'center', verticalAlign: 'bottom' },
                plotOptions: { series: { stacking: chartProperties?.stackMode === 'percent' ? 'percent' : 'normal' } },
                series,
            };
            Object.assign(spec, option);
            delete spec.mark;
            delete spec.encoding;
            return;
        }

        const stackMode = chartProperties?.stackMode === 'percent' ? 'percent' : 'normal';
        const option: any = {
            chart: { type: isHorizontal ? 'bar' : 'column' },
            xAxis: {
                categories,
                title: { text: catField },
                labels: { rotation: isHorizontal ? 0 : categoryAxisLabelRotateDeg(categories, catCS?.type) },
            },
            yAxis: { title: { text: valueLabel } },
            legend: { layout: 'horizontal', align: 'center', verticalAlign: 'bottom' },
            plotOptions: { series: { stacking: stackMode } },
            series: [],
        };

        if (colorField) {
            const groups = groupBy(table, colorField);
            for (const [name, rows] of groups) {
                const data = valCS?.type === 'temporal'
                    ? buildCategoryCounts(rows, catField, categories)
                    : buildCategoryValues(rows, catField, valField, categories);
                option.series.push({ name, data });
            }
        } else {
            const data = valCS?.type === 'temporal'
                ? buildCategoryCounts(table, catField, categories)
                : buildCategoryValues(table, catField, valField, categories);
            option.series.push({ name: valueLabel, data });
        }

        Object.assign(spec, option);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        {
            key: 'stackMode', label: 'Stack', type: 'discrete', options: [
                { value: 'normal', label: 'Count' },
                { value: 'percent', label: 'Percent (100%)' },
            ],
            defaultValue: 'normal',
            check: (ctx) => ({ applicable: !!ctx.encodings.color?.field }),
        } as ChartPropertyDef,
    ],
    encodingActions: [makeSortAction()] as EncodingActionDef[],
    pivot: makeCartesianPivot({
        transpose: [['x', 'y']],
        permute: [['x', 'y', 'color']],
        shift: ['color', 'group', 'column', 'row'],
    }),
};

// ─── Grouped Bar Chart ──────────────────────────────────────────────────────

export const hcGroupedBarChartDef: ChartTemplateDef = {
    chart: 'Grouped Bar Chart',
    template: { mark: 'bar', encoding: {} },
    channels: ['x', 'y', 'group', 'color', 'column', 'row'],
    markCognitiveChannel: 'length',
    declareLayoutMode: (cs, table, _chartProperties) => {
        const result = detectBandedAxisForceDiscrete(cs, table, { preferAxis: 'x' });
        const axis = result?.axis || 'x';
        const decl: import('../../core/types').LayoutDeclaration = {
            axisFlags: { [axis]: { banded: true } },
            resolvedTypes: result?.resolvedTypes,
        };
        return decl;
    },
    instantiate: (spec, ctx) => {
        const { channelSemantics, table } = ctx;

        const groupField = channelSemantics.group?.field || channelSemantics.color?.field;

        // x=temporal, y=nominal, group=Segment → vertical grouped bars by Date.
        if (channelSemantics.x?.type === 'temporal'
            && (channelSemantics.y?.type === 'nominal' || channelSemantics.y?.type === 'ordinal')
            && groupField
            && channelSemantics.x.field) {
            const xField = channelSemantics.x.field;

            const dateCategories = extractCategories(table, xField, getCategoryOrder(ctx, 'x'));
            dateCategories.sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

            const segments = extractCategories(table, groupField, getCategoryOrder(ctx, 'group'));
            const series = segments.map((name) => ({
                name,
                data: dateCategories.map((d) =>
                    table.filter((r) =>
                        String(r[xField] ?? '') === d
                        && String(r[groupField] ?? '') === name,
                    ).length,
                ),
            }));

            const option: any = {
                chart: { type: 'column' },
                xAxis: {
                    categories: dateCategories,
                    title: { text: xField },
                    labels: { rotation: categoryAxisLabelRotateDeg(dateCategories, channelSemantics.x?.type) },
                },
                yAxis: { title: { text: 'Count' }, min: 0, allowDecimals: false },
                legend: { layout: 'horizontal', align: 'center', verticalAlign: 'bottom' },
                series,
            };
            Object.assign(spec, option);
            delete spec.mark;
            delete spec.encoding;
            return;
        }

        const { categoryAxis, valueAxis } = detectAxes(channelSemantics);
        const catField = channelSemantics[categoryAxis]?.field;
        const valField = channelSemantics[valueAxis]?.field;
        const valType = channelSemantics[valueAxis]?.type;

        // Fallback: no numeric value axis, but a group channel → count per (x, group).
        if ((!valField || valType === 'nominal' || valType === 'ordinal') && groupField && channelSemantics.x?.field) {
            const xField = channelSemantics.x.field!;
            let categories = extractCategories(table, xField, getCategoryOrder(ctx, 'x'));
            if (channelSemantics.x?.type === 'temporal') {
                categories = [...categories].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
            }

            const groups = groupBy(table, groupField);
            const series = [...groups.keys()].map((name) => ({
                name,
                data: buildCategoryCounts(groups.get(name)!, xField, categories),
            }));

            const option: any = {
                chart: { type: 'column' },
                xAxis: {
                    categories,
                    title: { text: xField },
                    labels: { rotation: categoryAxisLabelRotateDeg(categories, channelSemantics.x?.type) },
                },
                yAxis: { title: { text: 'Count' }, min: 0, allowDecimals: false },
                legend: { layout: 'horizontal', align: 'center', verticalAlign: 'bottom' },
                series,
            };
            Object.assign(spec, option);
            delete spec.mark;
            delete spec.encoding;
            return;
        }

        if (!catField || !valField) return;

        const catCS = channelSemantics[categoryAxis];
        let categories = extractCategories(table, catField, getCategoryOrder(ctx, categoryAxis));
        if (catCS?.type === 'temporal') {
            categories = [...categories].sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
        }
        const isHorizontal = categoryAxis === 'y';

        const option: any = {
            chart: { type: isHorizontal ? 'bar' : 'column' },
            xAxis: {
                categories,
                title: { text: catField },
                labels: { rotation: isHorizontal ? 0 : categoryAxisLabelRotateDeg(categories, catCS?.type) },
            },
            yAxis: { title: { text: valField } },
            legend: { layout: 'horizontal', align: 'center', verticalAlign: 'bottom' },
            series: [],
        };

        if (groupField) {
            const groups = groupBy(table, groupField);
            for (const [name, rows] of groups) {
                const data = buildCategoryValues(rows, catField, valField, categories);
                option.series.push({ name, data });
            }
        } else {
            const data = buildCategoryValues(table, catField, valField, categories);
            option.series.push({ name: valField, data });
        }

        Object.assign(spec, option);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [],
    encodingActions: [makeSortAction()] as EncodingActionDef[],
    pivot: makeCartesianPivot({
        transpose: [['x', 'y']],
        permute: [['x', 'y', 'color']],
        shift: ['color', 'group', 'column', 'row'],
    }),
};
