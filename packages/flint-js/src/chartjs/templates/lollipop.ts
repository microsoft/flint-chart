// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Chart.js Lollipop Chart — thin bar stem from 0 to value + dot at the end
 * (mirror of echarts/templates/lollipop.ts and vegalite/templates/lollipop.ts).
 *
 * Chart.js has no rule mark, so the stem is a `bar` dataset with a fixed
 * `barThickness`, and the dot is a `line` dataset with `showLine: false` so it
 * rides the shared category scale (a `scatter` dataset would require numeric
 * `{x, y}` points instead of category labels).
 */

import { ChartTemplateDef, ChartPropertyDef } from '../../core/types';
import {
    extractCategories,
    groupBy,
    buildCategoryAlignedData,
    getChartJsPalette,
    getSeriesBorderColor,
    detectAxes,
} from './utils';
import { detectBandedAxisFromSemantics } from '../../core/axis-detection';

/** Stem styling mirrors the ECharts template: black, ~1.5px (the Vega-Lite rule look). */
const STEM_COLOR = '#000000';
const STEM_WIDTH_PX = 1.5;
/** Internal dataset label for the stem; filtered out of legend and tooltip. */
const STEM_LABEL = '__stem__';

/** Same visual scale as the ECharts template: 6–16px dot diameter. */
function dotRadiusFromProperty(dotSize: number): number {
    const diameterPx = Math.max(6, Math.min(10 + (dotSize - 80) / 40, 16));
    return diameterPx / 2;
}

export const cjsLollipopChartDef: ChartTemplateDef = {
    chart: 'Lollipop Chart',
    template: { mark: 'bar', encoding: {} },
    channels: ['x', 'y', 'color', 'column', 'row'],
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
        if (!catField || !valField || table.length === 0) return;

        const colorField = channelSemantics.color?.field;
        const categories = extractCategories(
            table, catField, channelSemantics[categoryAxis]?.ordinalSortOrder,
        );
        const stemData = buildCategoryAlignedData(table, catField, valField, categories);

        const isHorizontal = categoryAxis === 'y';
        const pointRadius = dotRadiusFromProperty(Number(chartProperties?.dotSize ?? 80));
        const palette = getChartJsPalette(ctx, 'color');

        const datasets: any[] = [{
            type: 'bar' as const,
            label: STEM_LABEL,
            data: stemData,
            barThickness: STEM_WIDTH_PX,
            backgroundColor: STEM_COLOR,
            borderWidth: 0,
            order: 2,
        }];

        const dotDataset = (label: string, data: (number | null)[], colorIndex: number) => ({
            type: 'line' as const,
            label,
            data,
            showLine: false,
            pointRadius,
            pointHoverRadius: pointRadius + 2,
            borderColor: getSeriesBorderColor(palette, colorIndex),
            backgroundColor: getSeriesBorderColor(palette, colorIndex),
            pointBorderColor: '#fff',
            pointBorderWidth: 1,
            order: 1,
        });

        if (colorField) {
            let i = 0;
            for (const [name, rows] of groupBy(table, colorField)) {
                datasets.push(dotDataset(
                    name, buildCategoryAlignedData(rows, catField, valField, categories), i,
                ));
                i++;
            }
        } else {
            datasets.push(dotDataset(valField, stemData, 0));
        }

        const zeroDecision = channelSemantics[valueAxis]?.zero;
        const config: any = {
            type: 'bar',
            data: { labels: categories, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                ...(isHorizontal ? { indexAxis: 'y' as const } : {}),
                scales: {
                    [categoryAxis]: {
                        title: { display: true, text: catField },
                    },
                    [valueAxis]: {
                        type: 'linear' as const,
                        beginAtZero: zeroDecision ? zeroDecision.zero !== false : true,
                        title: { display: true, text: valField },
                    },
                },
                plugins: {
                    legend: {
                        display: !!colorField,
                        labels: { filter: (item: any) => item.text !== STEM_LABEL },
                    },
                    tooltip: {
                        enabled: true,
                        filter: (item: any) => item.dataset?.label !== STEM_LABEL,
                    },
                },
            },
        };

        Object.assign(spec, config);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        { key: 'dotSize', label: 'Dot Size', type: 'continuous', min: 20, max: 300, step: 10, defaultValue: 80 },
    ] as ChartPropertyDef[],
};
