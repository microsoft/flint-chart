// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Highcharts Pie Chart and Doughnut Chart templates.
 *
 * Highcharts mapping:
 *   VL: mark = "arc" with theta + color
 *   HC: chart.type = 'pie'; series[0].data = [{ name, y, color }] per slice.
 *   Doughnut → plotOptions.pie.innerSize.
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import { extractCategories } from './utils';

/**
 * Reorder parallel label/value arrays in place by slice value.
 */
export function sortSlicesInPlace(
    labels: string[],
    values: number[],
    sortSlices: unknown,
): void {
    if (sortSlices !== 'descending' && sortSlices !== 'ascending') return;
    const idx = values.map((_, i) => i);
    idx.sort((a, b) => (sortSlices === 'descending' ? values[b] - values[a] : values[a] - values[b]));
    const sortedLabels = idx.map((i) => labels[i]);
    const sortedValues = idx.map((i) => values[i]);
    labels.splice(0, labels.length, ...sortedLabels);
    values.splice(0, values.length, ...sortedValues);
}

const SORT_SLICES_PROPERTY: ChartPropertyDef = {
    key: 'sortSlices', label: 'Sort slices', type: 'discrete',
    options: [
        { value: 'none', label: 'Data order' },
        { value: 'descending', label: 'Largest first' },
        { value: 'ascending', label: 'Smallest first' },
    ],
    defaultValue: 'none',
};

function buildPieData(
    table: any[],
    colorField: string | undefined,
    sizeField: string | undefined,
    sortSlices: unknown,
): { name: string; y: number }[] {
    const slices: { name: string; y: number }[] = [];

    if (colorField && sizeField) {
        const agg = new Map<string, number>();
        for (const row of table) {
            const cat = String(row[colorField] ?? '');
            const val = Number(row[sizeField]) || 0;
            agg.set(cat, (agg.get(cat) ?? 0) + val);
        }
        const categories = extractCategories(table, colorField);
        for (const cat of categories) {
            slices.push({ name: cat, y: agg.get(cat) ?? 0 });
        }
    } else if (colorField) {
        const counts = new Map<string, number>();
        for (const row of table) {
            const cat = String(row[colorField] ?? '');
            counts.set(cat, (counts.get(cat) ?? 0) + 1);
        }
        const categories = extractCategories(table, colorField);
        for (const cat of categories) {
            slices.push({ name: cat, y: counts.get(cat) ?? 0 });
        }
    } else if (sizeField) {
        for (const row of table) {
            const val = Number(row[sizeField]) || 0;
            slices.push({ name: String(val), y: val });
        }
    }

    if (sortSlices === 'descending') {
        slices.sort((a, b) => b.y - a.y);
    } else if (sortSlices === 'ascending') {
        slices.sort((a, b) => a.y - b.y);
    }
    return slices;
}

function buildPieOption(
    ctx: any,
    chartType: 'Pie Chart' | 'Doughnut Chart',
): any {
    const { channelSemantics, table, chartProperties } = ctx;
    const colorField = channelSemantics.color?.field;
    const sizeField = channelSemantics.size?.field;

    const innerRadius = chartProperties?.innerRadius ?? (chartType === 'Doughnut Chart' ? 50 : 0);
    const isDoughnut = chartType === 'Doughnut Chart' || innerRadius > 0;

    const data = buildPieData(table, colorField, sizeField, chartProperties?.sortSlices);

    return {
        chart: { type: 'pie' },
        legend: { layout: 'vertical', align: 'right', verticalAlign: 'middle' },
        plotOptions: {
            pie: {
                allowPointSelect: true,
                cursor: 'pointer',
                showInLegend: !!colorField,
                ...(isDoughnut ? { innerSize: `${innerRadius}%` } : {}),
                dataLabels: {
                    enabled: true,
                    format: '<b>{point.name}</b>: {point.percentage:.1f} %',
                },
            },
        },
        tooltip: {
            pointFormat: '{series.name}: <b>{point.percentage:.1f}%</b>',
        },
        series: [{
            name: sizeField ?? 'Count',
            colorByPoint: true,
            data,
        }],
    };
}

export const hcPieChartDef: ChartTemplateDef = {
    chart: 'Pie Chart',
    template: { mark: 'arc', encoding: {} },
    channels: ['size', 'color', 'column', 'row'],
    markCognitiveChannel: 'area',
    instantiate: (spec, ctx) => {
        const option = buildPieOption(ctx, 'Pie Chart');
        Object.assign(spec, option);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        { key: 'innerRadius', label: 'Donut', type: 'continuous', min: 0, max: 60, step: 5, defaultValue: 0 } as ChartPropertyDef,
        SORT_SLICES_PROPERTY,
    ],
};

export const hcDoughnutChartDef: ChartTemplateDef = {
    chart: 'Doughnut Chart',
    template: { mark: 'arc', encoding: {} },
    channels: ['size', 'color', 'column', 'row'],
    markCognitiveChannel: 'area',
    instantiate: (spec, ctx) => {
        const option = buildPieOption(ctx, 'Doughnut Chart');
        Object.assign(spec, option);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        { key: 'innerRadius', label: 'Inner radius', type: 'continuous', min: 20, max: 80, step: 5, defaultValue: 50 } as ChartPropertyDef,
        SORT_SLICES_PROPERTY,
    ],
};
