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
import { extractCategories, buildCategoryAlignedData, detectAxes, getPlotlyPalette, getSeriesColor } from './utils';
import { detectBandedAxisFromSemantics } from '../../core/axis-detection';

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
