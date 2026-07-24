// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Lollipop Chart template.
 *
 * A thin `bar` trace (the stem, zero → value) plus a `scatter` marker trace
 * (the dot) sharing the same category axis — mirrors `ecLollipopChartDef`.
 */

import { ChartTemplateDef, ChartPropertyDef, EncodingActionDef } from '../../core/types';
import { resolveCategoryOrder, buildCategoryAlignedData, detectAxes, groupBy, getPlotlyPalette, getSeriesColor } from './utils';
import { detectBandedAxisFromSemantics } from '../../core/axis-detection';
import { makeSortAction } from '../../core/encoding-actions';

const STEM_COLOR = '#9aa0a6';

export const plLollipopChartDef: ChartTemplateDef = {
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
        const colorField = channelSemantics.color?.field;
        if (!catField || !valField) return;

        const catEnc = ctx.encodings?.[categoryAxis];
        const sortByField = catEnc?.sortBy ? channelSemantics[catEnc.sortBy]?.field : undefined;
        const categories = resolveCategoryOrder(table, catField, {
            ordinalSortOrder: channelSemantics[categoryAxis]?.ordinalSortOrder,
            sortBy: sortByField, sortOrder: catEnc?.sortOrder,
        });
        const values = buildCategoryAlignedData(table, catField, valField, categories);
        const isHorizontal = categoryAxis === 'y';
        const dotSize = Number(chartProperties?.dotSize ?? 80);
        const symbolSizePx = Math.max(6, Math.min(10 + (dotSize - 80) / 40, 16));
        const palette = getPlotlyPalette(ctx, 'color');

        const stemTrace: any = {
            type: 'bar',
            name: '__stem',
            showlegend: false,
            hoverinfo: 'skip',
            width: 0.06,
            ...(isHorizontal ? { x: values, y: categories, orientation: 'h' } : { x: categories, y: values }),
            marker: { color: STEM_COLOR },
        };

        const dotTraces: any[] = [];
        if (colorField) {
            let i = 0;
            for (const [name, rows] of groupBy(table, colorField)) {
                const pts = categories.map(cat => rows.find((r: any) => String(r[catField] ?? '') === cat));
                dotTraces.push({
                    type: 'scatter', mode: 'markers', name,
                    ...(isHorizontal
                        ? { x: pts.map(r => r?.[valField] ?? null), y: categories }
                        : { x: categories, y: pts.map(r => r?.[valField] ?? null) }),
                    marker: { color: getSeriesColor(palette, i), size: symbolSizePx, line: { color: '#fff', width: 1 } },
                });
                i++;
            }
        } else {
            dotTraces.push({
                type: 'scatter', mode: 'markers', showlegend: false,
                ...(isHorizontal ? { x: values, y: categories } : { x: categories, y: values }),
                marker: { color: getSeriesColor(palette, 0), size: symbolSizePx, line: { color: '#fff', width: 1 } },
            });
        }

        const catAxisSpec = { type: 'category' as const, categoryorder: 'array' as const, categoryarray: categories, title: { text: catField } };
        const valCS = channelSemantics[valueAxis];
        const includeZero = valCS?.zero ? valCS.zero.zero !== false : true;
        const valAxisSpec = { title: { text: valField }, rangemode: (includeZero ? 'tozero' : 'normal') as 'tozero' | 'normal' };

        Object.assign(spec, {
            data: [stemTrace, ...dotTraces],
            layout: {
                ...(isHorizontal ? { xaxis: valAxisSpec, yaxis: catAxisSpec } : { xaxis: catAxisSpec, yaxis: valAxisSpec }),
                showlegend: !!colorField,
            },
        });
        delete spec.mark;
        delete spec.encoding;
    },
    properties: [
        { key: 'dotSize', label: 'Dot Size', type: 'continuous', min: 20, max: 300, step: 10, defaultValue: 80 } as ChartPropertyDef,
    ],
    encodingActions: [makeSortAction()] as EncodingActionDef[],
};
