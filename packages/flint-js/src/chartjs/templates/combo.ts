// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Chart.js Combo (Bar + Line) template.
 *
 * A dual-measure chart: bars for a primary measure and a line for a secondary
 * measure plotted on its own right-hand axis. This is one of the most common
 * dashboard idioms (e.g. revenue bars + growth-rate line).
 *
 * Data model:
 *   x  (nominal)      → shared category axis
 *   y  (quantitative) → the BAR measure (left axis)
 *   line measure      → the LINE measure (right axis); chosen from
 *                       `chartProperties.lineField`, else the first other
 *                       numeric field in the data.
 *   color is intentionally not used — the two series ARE the legend.
 *
 * Chart.js renders this as a base `type: 'bar'` chart with one dataset
 * overridden to `type: 'line'` and bound to a secondary `y1` scale.
 */

import { ChartTemplateDef } from '../../core/types';
import {
    extractCategories,
    buildCategoryAlignedData,
    getChartJsPalette,
    getSeriesBorderColor,
    getSeriesBackgroundColor,
} from './utils';
import { detectBandedAxisFromSemantics } from '../../vegalite/templates/utils';

/** A field is numeric if (nearly) all of its non-null values parse as numbers. */
function isNumericField(table: any[], field: string): boolean {
    let total = 0;
    let numeric = 0;
    for (const row of table) {
        const v = row[field];
        if (v == null || v === '') continue;
        total++;
        if (typeof v === 'number' ? isFinite(v) : !isNaN(Number(v))) numeric++;
    }
    return total > 0 && numeric / total >= 0.9;
}

export const cjsComboChartDef: ChartTemplateDef = {
    chart: 'Combo Chart',
    template: { mark: 'bar', encoding: {} },
    channels: ['x', 'y', 'column', 'row'],
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
        const catField = channelSemantics.x?.field;
        const barField = channelSemantics.y?.field;
        if (!catField || !barField || table.length === 0) return;

        // Resolve the line measure: explicit override, else first other numeric field.
        const lineField: string | undefined =
            (chartProperties?.lineField && chartProperties.lineField in table[0])
                ? chartProperties.lineField
                : Object.keys(table[0]).find(
                    (k) => k !== catField && k !== barField && isNumericField(table, k),
                );

        const categories = extractCategories(table, catField, channelSemantics.x?.ordinalSortOrder);
        const barData = buildCategoryAlignedData(table, catField, barField, categories);

        const palette = getChartJsPalette(ctx, 'color');

        const datasets: any[] = [{
            type: 'bar' as const,
            label: barField,
            data: barData,
            yAxisID: 'y',
            order: 2,
            backgroundColor: getSeriesBackgroundColor(palette, 0),
            borderColor: getSeriesBorderColor(palette, 0),
            borderWidth: 1,
            borderRadius: chartProperties?.cornerRadius ?? 0,
        }];

        if (lineField) {
            const lineData = buildCategoryAlignedData(table, catField, lineField, categories);
            datasets.push({
                type: 'line' as const,
                label: lineField,
                data: lineData,
                yAxisID: 'y1',
                order: 1,
                borderColor: getSeriesBorderColor(palette, 1),
                backgroundColor: 'transparent',
                borderWidth: 2,
                pointRadius: 3,
                tension: 0.3,
                fill: false,
            });
        }

        const config: any = {
            type: 'bar',
            data: { labels: categories, datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: {
                        title: { display: true, text: catField },
                    },
                    y: {
                        type: 'linear' as const,
                        position: 'left' as const,
                        beginAtZero: channelSemantics.y?.zero ? channelSemantics.y.zero.zero !== false : true,
                        title: { display: true, text: barField },
                    },
                    ...(lineField ? {
                        y1: {
                            type: 'linear' as const,
                            position: 'right' as const,
                            title: { display: true, text: lineField },
                            // Don't draw the right axis grid over the bars.
                            grid: { drawOnChartArea: false },
                        },
                    } : {}),
                },
                plugins: {
                    legend: { display: true },
                    tooltip: { enabled: true },
                },
            },
        };

        Object.assign(spec, config);
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        { key: 'cornerRadius', label: 'Corners', type: 'continuous', min: 0, max: 15, step: 1, defaultValue: 0 },
    ],
};
