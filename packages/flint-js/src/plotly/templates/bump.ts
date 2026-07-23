// Copyright (c) Microsoft Corporation.
// Licensed under the MIT License.

/**
 * Plotly Bump Chart template.
 *
 * A rank-over-time line chart: one line per entity, y = rank (reversed so
 * rank 1 sits at the top). Reuses the same trace-building shape as
 * `plLineChartDef`; the only structural difference is the reversed rank axis.
 */

import { ChartTemplateDef } from '../../core/types';
import {
    isDiscreteType, extractCategories, groupBy, buildCategoryAlignedData,
    coerceIsoDateForPlotly, getPlotlyPalette, getSeriesColor, sortByOrder,
} from './utils';
import { toTypeString } from '../../core/field-semantics';

const RANK_SEMANTIC_TYPES = new Set(['Rank', 'Score', 'Level']);

export const plBumpChartDef: ChartTemplateDef = {
    chart: 'Bump Chart',
    template: { mark: 'line', encoding: {} },
    channels: ['x', 'y', 'color', 'detail', 'column', 'row'],
    markCognitiveChannel: 'position',
    declareLayoutMode: () => ({
        paramOverrides: { continuousMarkCrossSection: { x: 80, y: 20, seriesCountAxis: 'auto' }, facetAspectRatioResistance: 0.4 },
    }),
    instantiate: (spec, ctx) => {
        const { channelSemantics, table, semanticTypes } = ctx;
        const xCS = channelSemantics.x;
        const yCS = channelSemantics.y;
        const groupField = channelSemantics.color?.field ?? channelSemantics.detail?.field;
        if (!xCS?.field || !yCS?.field) return;
        const xField = xCS.field;
        const yField = yCS.field;

        const xSemType = (xField && toTypeString(semanticTypes?.[xField])) || '';
        const ySemType = (yField && toTypeString(semanticTypes?.[yField])) || '';
        const xIsRank = RANK_SEMANTIC_TYPES.has(xSemType);
        const yIsRank = RANK_SEMANTIC_TYPES.has(ySemType);
        let rankAxis: 'x' | 'y';
        if (yIsRank && !xIsRank) rankAxis = 'y';
        else if (xIsRank && !yIsRank) rankAxis = 'x';
        else if (isDiscreteType(xCS.type) && !isDiscreteType(yCS.type)) rankAxis = 'y';
        else if (isDiscreteType(yCS.type) && !isDiscreteType(xCS.type)) rankAxis = 'x';
        else rankAxis = 'y';

        const xIsDiscrete = isDiscreteType(xCS.type);
        const xIsTemporal = xCS.type === 'temporal';
        const mapX = (raw: unknown) => (xIsTemporal ? coerceIsoDateForPlotly(raw) : raw);
        const categories = xIsDiscrete ? extractCategories(table, xField, xCS.ordinalSortOrder) : undefined;

        const palette = getPlotlyPalette(ctx, 'color');
        const traces: any[] = [];
        const makeTrace = (name: string, rows: any[], idx: number) => {
            // x is rank → the line must follow y's order, not x's raw order.
            const orderedRows = (rankAxis === 'x') ? sortByOrder(rows, yField) : rows;
            const xVals = xIsDiscrete ? categories! : orderedRows.map(r => mapX(r[xField]));
            const yVals = xIsDiscrete
                ? buildCategoryAlignedData(rows, xField, yField, categories!)
                : orderedRows.map(r => (r[yField] == null ? null : r[yField]));
            const color = getSeriesColor(palette, idx);
            return {
                type: 'scatter',
                mode: 'lines+markers',
                name,
                x: xVals, y: yVals,
                line: { color, shape: 'spline' as const, smoothing: 0.4 },
                marker: { color, size: 7 },
            };
        };

        if (groupField) {
            let i = 0;
            for (const [name, rows] of groupBy(table, groupField)) { traces.push(makeTrace(name, rows, i)); i++; }
        } else {
            traces.push(makeTrace(yField, table, 0));
        }

        const xAxisSpec: any = { title: { text: xField } };
        if (xIsDiscrete) { xAxisSpec.type = 'category'; xAxisSpec.categoryorder = 'array'; xAxisSpec.categoryarray = categories; }
        else if (xIsTemporal) xAxisSpec.type = 'date';

        const yAxisSpec: any = { title: { text: yField } };
        if (rankAxis === 'y') yAxisSpec.autorange = 'reversed';

        const figXAxis = rankAxis === 'x' ? { ...xAxisSpec, autorange: 'reversed' } : xAxisSpec;

        Object.assign(spec, {
            data: traces,
            layout: { xaxis: figXAxis, yaxis: yAxisSpec, showlegend: !!groupField },
        });
        delete spec.mark;
        delete spec.encoding;
    },
};
